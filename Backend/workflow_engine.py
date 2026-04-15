"""
Lightweight BPMN Workflow Engine
=================================
Executa o JSON do editor BPMN (nodes + connections) como um workflow:

  Tipos de nó suportados (canônicos + aliases):
  - start / startEvent        → auto-avança (inicia o fluxo)
  - task / userTask / humanTask → pausa aguardando input do usuário
  - serviceTask / scriptTask / auto / entidade → executa automaticamente
  - gateway / condicional / exclusiveGateway / xorGateway → pausa aguardando decisão
  - end / endEvent / terminateEvent → finaliza o processo

Não depende de Camunda nem de qualquer runtime externo.
O comportamento é 100% genérico — vem do BPMN/JSON.
"""

from __future__ import annotations

from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# Normalização de decisão (espelha a lógica do frontend)
# ─────────────────────────────────────────────────────────────────────────────
_SIM_VALUES = {"sim", "yes", "true", "ok", "aprovado", "✓", "✔"}
_NAO_VALUES = {"nao", "não", "no", "false", "reprovado", "✕", "✖", "x"}


def normalize_decision(value: str | None) -> str:
    raw = (value or "").strip()
    lower = (
        raw.lower()
        .encode("ascii", "ignore")
        .decode()  # remove acentos simples
    )
    if lower in _SIM_VALUES or raw in {"✓", "✔"}:
        return "sim"
    if lower in _NAO_VALUES or raw in {"✕", "✖", "x", "X"}:
        return "nao"
    return raw


# ─────────────────────────────────────────────────────────────────────────────
# Normalização de tipo de nó
# ─────────────────────────────────────────────────────────────────────────────

def canonical_node_type(raw_type: str | None) -> str:
    """
    Retorna o tipo canônico do nó a partir de qualquer alias BPMN.

    Canônicos:
      'task'        → userTask: pausa para input humano
      'auto'        → passa adiante automaticamente (serviceTask, entidade, etc.)
      'condicional' → gateway: pausa para decisão de roteamento
      'start'       → evento de início (auto-avança)
      'end'         → evento de fim (completa o processo)
    """
    t = (raw_type or "").strip().lower().replace("_", "").replace(" ", "")
    if t in {"task", "usertask", "humantask", "manualtask", "receivetask"}:
        return "task"
    if t in {"condicional", "gateway", "exclusivegateway", "xorgateway",
             "inclusivegateway", "parallelgateway", "complexgateway",
             "eventbasedgateway"}:
        return "condicional"
    if t in {"start", "startevent", "none_start", "nonestartevent"}:
        return "start"
    if t in {"end", "endevent", "terminateevent", "noneevent",
             "noneendevent", "terminate"}:
        return "end"
    # serviceTask, scriptTask, businessRuleTask, sendTask, callActivity, entidade, auto, etc.
    return "auto"


# ─────────────────────────────────────────────────────────────────────────────
# Motor principal
# ─────────────────────────────────────────────────────────────────────────────
class WorkflowEngine:
    MAX_STEPS = 200  # proteção contra loop infinito

    def __init__(self, bpmn: dict[str, Any]):
        raw_nodes: list[dict] = bpmn.get("nodes") or []
        self.nodes: dict[str, dict] = {
            n["id"]: n for n in raw_nodes if isinstance(n, dict) and n.get("id")
        }
        self.connections: list[dict] = [
            c for c in (bpmn.get("connections") or []) if isinstance(c, dict)
        ]

    # ── helpers ──────────────────────────────────────────────────────────────

    def _active_nodes(self) -> list[dict]:
        return [n for n in self.nodes.values() if n.get("active", True)]

    def find_start_node(self) -> str | None:
        """Nó(s) sem conexão entrante = ponto de partida.
        Prioriza: startEvent > nó com saída > qualquer nó sem entrada."""
        targets = {c["to"] for c in self.connections if c.get("to")}
        candidates = [n for n in self._active_nodes() if n["id"] not in targets]

        # 1) Preferir nós do tipo start/startEvent
        start_events = [n for n in candidates if canonical_node_type(n.get("nodeType")) == "start"]
        if start_events:
            return start_events[0]["id"]

        # 2) Preferir nós que têm conexão de saída (parte do fluxo principal)
        connected = [n for n in candidates if self._outgoing(n["id"])]
        if connected:
            return connected[0]["id"]

        # 3) Fallback: qualquer candidato (exceto entidades soltas)
        non_entity = [n for n in candidates if canonical_node_type(n.get("nodeType")) != "auto"]
        if non_entity:
            return non_entity[0]["id"]

        if candidates:
            return candidates[0]["id"]
        # fallback: primeiro nó ativo na lista
        active = self._active_nodes()
        return active[0]["id"] if active else None

    def _outgoing(self, node_id: str) -> list[dict]:
        return [c for c in self.connections if c.get("from") == node_id]

    def _incoming(self, node_id: str) -> list[dict]:
        return [c for c in self.connections if c.get("to") == node_id]

    def _find_merge_point(self, dead_end_id: str) -> str | None:
        """
        Quando um branch termina sem end event e sem conexão de saída,
        encontra o gateway pai e busca o ponto de convergência real
        (nó alcançável por TODOS os branches do gateway).
        Se não existir convergência, retorna None (workflow encerra).
        """
        # 1) Percorre para trás para encontrar o gateway pai
        gateway_id: str | None = None
        back_visited: set[str] = set()
        back_queue: list[str] = [dead_end_id]
        while back_queue:
            nid = back_queue.pop(0)
            if nid in back_visited:
                continue
            back_visited.add(nid)
            for conn in self._incoming(nid):
                from_id = conn.get("from", "")
                from_node = self.nodes.get(from_id, {})
                if canonical_node_type(from_node.get("nodeType")) == "condicional":
                    gateway_id = from_id
                    break
                if from_id:
                    back_queue.append(from_id)
            if gateway_id:
                break

        if not gateway_id:
            return None

        # 2) Para cada branch do gateway, coleta todos os nós alcançáveis
        branches = self._outgoing(gateway_id)
        if len(branches) < 2:
            return None

        reachable_sets: list[set[str]] = []
        for branch_conn in branches:
            branch_target = branch_conn.get("to", "")
            if not branch_target:
                continue
            reachable: set[str] = set()
            fwd_queue: list[str] = [branch_target]
            while fwd_queue:
                fid = fwd_queue.pop(0)
                if fid in reachable or fid == gateway_id:
                    continue
                reachable.add(fid)
                for out_conn in self._outgoing(fid):
                    nxt = out_conn.get("to", "")
                    if nxt and nxt not in reachable:
                        fwd_queue.append(nxt)
            reachable_sets.append(reachable)

        if not reachable_sets:
            return None

        # 3) Interseção: nós alcançáveis por TODOS os branches
        common = reachable_sets[0]
        for rs in reachable_sets[1:]:
            common = common & rs

        if not common:
            return None

        # 4) Retorna o nó de convergência mais próximo (menor profundidade BFS)
        first_branch_target = branches[0].get("to", "")
        bfs_queue: list[str] = [first_branch_target]
        bfs_seen: set[str] = {first_branch_target}
        while bfs_queue:
            nid = bfs_queue.pop(0)
            if nid in common:
                return nid
            for out_conn in self._outgoing(nid):
                nxt = out_conn.get("to", "")
                if nxt and nxt not in bfs_seen and nxt != gateway_id:
                    bfs_seen.add(nxt)
                    bfs_queue.append(nxt)

        return None

    def _next(self, node_id: str, decision: str | None = None) -> str | None:
        """Retorna o ID do próximo nó dado o nó atual e, opcionalmente, a decisão."""
        outgoing = self._outgoing(node_id)
        if not outgoing:
            return None  # fim do processo

        node = self.nodes.get(node_id, {})
        if canonical_node_type(node.get("nodeType")) == "condicional":
            if decision is None:
                return None  # pausa — aguarda decisão
            norm = normalize_decision(decision)
            # 1) procura conexão com decision explícita
            for conn in outgoing:
                if normalize_decision(conn.get("decision", "")) == norm:
                    return conn["to"]
            # 2) fallback: primeira conexão disponível
            return outgoing[0]["to"]

        # task / auto / start — segue a primeira (e geralmente única) saída
        return outgoing[0]["to"]

    # ── execução ─────────────────────────────────────────────────────────────

    def run(
        self,
        start_node_id: str | None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Executa o workflow a partir de `start_node_id`.

        O `context` pode conter decisões por node_id:
            { "decision_<nodeId>": "sim" | "nao" | "<custom>" }
        ou uma decisão genérica `decision` usada quando não há chave específica.

        Retorna:
        {
          "status":        "completed" | "paused",
          "paused_reason": "decision" | "user_input" | null,
          "currentNodeId": str | null,
          "executed":      [ { nodeId, nodeType, label, status, decision? }, ... ]
        }
        """
        ctx = context or {}
        current_id: str | None = start_node_id
        executed: list[dict] = []
        steps = 0
        visited: set[str] = set()  # cycle detection

        while current_id and steps < self.MAX_STEPS:
            # Cycle detection: if we'd revisit a node, the process is complete
            if current_id in visited:
                current_id = None
                break
            visited.add(current_id)

            node = self.nodes.get(current_id)
            if not node:
                break  # referência quebrada — encerra

            raw_type: str = node.get("nodeType") or "auto"
            node_type: str = canonical_node_type(raw_type)
            label: str = (
                node.get("label")
                or node.get("taskNome")
                or node.get("condicionalNome")
                or node.get("entidadeNome")
                or current_id
            )

            step: dict[str, Any] = {
                "nodeId": current_id,
                "nodeType": raw_type,
                "canonicalType": node_type,
                "label": label,
            }

            # ── END EVENT ──────────────────────────────────────────────────
            if node_type == "end":
                step["status"] = "completed"
                executed.append(step)
                return {
                    "status": "completed",
                    "paused_reason": None,
                    "currentNodeId": None,
                    "executed": executed,
                }

            # ── START EVENT (auto-avança) ───────────────────────────────────
            if node_type == "start":
                step["status"] = "completed"
                executed.append(step)
                current_id = self._next(current_id)
                steps += 1
                continue

            # ── GATEWAY (condicional) ──────────────────────────────────────
            if node_type == "condicional":
                decision = ctx.get(f"decision_{current_id}") or ctx.get("decision")

                if not decision:
                    step["status"] = "waiting_decision"
                    executed.append(step)
                    return {
                        "status": "paused",
                        "paused_reason": "decision",
                        "currentNodeId": current_id,
                        "executed": executed,
                    }

                norm = normalize_decision(decision)
                step["status"] = "completed"
                step["decision"] = norm
                executed.append(step)
                next_id = self._next(current_id, norm)
                if next_id is None:
                    next_id = self._find_merge_point(current_id)
                current_id = next_id

            # ── USER TASK ──────────────────────────────────────────────────
            elif node_type == "task":
                already_done = ctx.get(f"completed_{current_id}", False)
                if not already_done:
                    step["status"] = "waiting_user"
                    executed.append(step)
                    return {
                        "status": "paused",
                        "paused_reason": "user_input",
                        "currentNodeId": current_id,
                        "executed": executed,
                    }
                step["status"] = "completed"
                step["formData"] = {
                    k: v for k, v in ctx.items()
                    if not k.startswith("decision_") and not k.startswith("completed_")
                }
                executed.append(step)
                next_id = self._next(current_id)
                if next_id is None:
                    next_id = self._find_merge_point(current_id)
                current_id = next_id

            # ── AUTO (serviceTask, entidade, scriptTask, etc.) ──────────
            else:
                step["status"] = "completed"
                executed.append(step)
                next_id = self._next(current_id)
                if next_id is None:
                    next_id = self._find_merge_point(current_id)
                current_id = next_id

            steps += 1

        return {
            "status": "completed" if not current_id else "stopped",
            "paused_reason": None,
            "currentNodeId": current_id,
            "executed": executed,
        }

    # ── utilitário de estado ─────────────────────────────────────────────────

    def active_node_ids_in_order(self) -> list[str]:
        """Retorna os IDs dos nós ativos na ordem topológica (BFS a partir do nó inicial)."""
        start = self.find_start_node()
        if not start:
            return []

        visited: list[str] = []
        queue: list[str] = [start]
        seen: set[str] = {start}

        while queue:
            current = queue.pop(0)
            if current in self.nodes:
                visited.append(current)
            for conn in self._outgoing(current):
                nxt = conn.get("to", "")
                if nxt and nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)

        return visited

    def node_index(self, node_id: str) -> int:
        """Posição (0-based) do nó na ordem topológica."""
        order = self.active_node_ids_in_order()
        try:
            return order.index(node_id)
        except ValueError:
            return -1
