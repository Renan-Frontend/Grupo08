import sys
import unittest
from pathlib import Path
from typing import Any, Callable

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main  # noqa: E402


def _require_helper(name: str) -> Callable[..., Any]:
    helper = getattr(main, name, None)
    if not callable(helper):
        raise AssertionError(f"Helper ausente em main.py: {name}")
    return helper


SCENARIOS = [
    {
        "name": "compras_aprovacao",
        "process": "Aprovacao de Compras",
        "entity": "Solicitacao de Compra",
        "goal": (
            "Fluxo do processo: 1. Colaborador abre solicitacao de compra. "
            "2. Gestor avalia justificativa. "
            "3. Se aprovado, enviar para financeiro; senao rejeitar solicitacao. "
            "4. Financeiro confirma orcamento e conclui."
        ),
        "expects_decision": True,
    },
    {
        "name": "atendimento_reembolso",
        "process": "Reembolso de Cliente",
        "entity": "Solicitacao de Reembolso",
        "goal": (
            "Fluxo do processo: 1. Cliente solicita reembolso. "
            "2. Analista confere comprovantes. "
            "3. Se comprovantes validos, aprovar pagamento; senao solicitar correcao. "
            "4. Encerrar protocolo."
        ),
        "expects_decision": True,
    },
    {
        "name": "rh_admissao",
        "process": "Admissao de Colaborador",
        "entity": "Candidato",
        "goal": (
            "Fluxo do processo: 1. RH recebe documentos. "
            "2. RH valida dados cadastrais. "
            "3. Se documentacao completa, gerar contrato; senao devolver pendencias. "
            "4. Finalizar onboarding."
        ),
        "expects_decision": True,
    },
    {
        "name": "financeiro_fatura",
        "process": "Conferencia de Fatura",
        "entity": "Fatura",
        "goal": (
            "Fluxo do processo: 1. Sistema importa fatura. "
            "2. Financeiro compara pedido e nota. "
            "3. Se divergente, abrir contestacao; senao liberar pagamento. "
            "4. Encerrar rotina."
        ),
        "expects_decision": True,
    },
    {
        "name": "ti_incidente",
        "process": "Tratamento de Incidente",
        "entity": "Ticket",
        "goal": (
            "Fluxo do processo: 1. Service desk registra incidente. "
            "2. Time tecnico classifica severidade. "
            "3. Se critico, acionar plantao; senao seguir fila normal. "
            "4. Registrar solucao e encerrar."
        ),
        "expects_decision": True,
    },
    {
        "name": "juridico_contrato",
        "process": "Revisao Contratual",
        "entity": "Contrato",
        "goal": (
            "Fluxo do processo: 1. Comercial envia minuta. "
            "2. Juridico revisa clausulas. "
            "3. Se houver risco alto, retornar para ajuste; senao aprovar assinatura. "
            "4. Arquivar contrato final."
        ),
        "expects_decision": True,
    },
    {
        "name": "logistica_entrega",
        "process": "Despacho de Entrega",
        "entity": "Pedido de Entrega",
        "goal": (
            "Fluxo do processo: 1. Separar itens no estoque. "
            "2. Emitir etiqueta de transporte. "
            "3. Registrar coleta e finalizar expedicao."
        ),
        "expects_decision": False,
    },
    {
        "name": "marketing_campanha",
        "process": "Publicacao de Campanha",
        "entity": "Campanha",
        "goal": (
            "Fluxo do processo: 1. Time cria briefing. "
            "2. Designer prepara criativo. "
            "3. Gestor revisa e publica campanha."
        ),
        "expects_decision": False,
    },
]


def _analyze_scenario_payload(
    payload: dict[str, Any],
    entities: list[str],
    expects_decision: bool,
    looks_like_terminal_task_name: Callable[..., Any],
) -> dict[str, Any]:
    nodes_raw = payload.get("nodes")
    connections_raw = payload.get("connections")
    nodes = nodes_raw if isinstance(nodes_raw, list) else []
    connections = connections_raw if isinstance(connections_raw, list) else []

    conditional_ids = {
        str(node.get("id") or "").strip()
        for node in nodes
        if isinstance(node, dict)
        and str(node.get("nodeType") or "").strip().lower() == "condicional"
    }
    decision_connections = [
        conn
        for conn in connections
        if isinstance(conn, dict)
        and str(conn.get("from") or "").strip() in conditional_ids
        and str(conn.get("decision") or "").strip().lower() in {"sim", "nao"}
    ]
    decisions = {
        str(conn.get("decision") or "").strip().lower()
        for conn in decision_connections
    }

    terminal_tasks = [
        node
        for node in nodes
        if isinstance(node, dict)
        and str(node.get("nodeType") or "").strip().lower() == "task"
        and bool(looks_like_terminal_task_name(node.get("label") or node.get("taskNome") or ""))
    ]

    checks = {
        "has_entities": bool(entities),
        "has_min_nodes": len(nodes) >= 2,
        "has_connections": len(connections) >= 1,
        "has_terminal": bool(terminal_tasks),
        "decision_structure": (not expects_decision)
        or (bool(conditional_ids) and "sim" in decisions and "nao" in decisions),
    }

    weights = {
        "has_entities": 20,
        "has_min_nodes": 20,
        "has_connections": 20,
        "has_terminal": 20,
        "decision_structure": 20,
    }
    score = sum(weights[key] for key, is_ok in checks.items() if is_ok)

    return {
        "score": score,
        "checks": checks,
        "node_count": len(nodes),
        "connection_count": len(connections),
        "decision_count": len(conditional_ids),
    }


class TestAiBpmnScenarioMatrix(unittest.TestCase):
    def test_local_bpmn_payload_quality_for_realistic_scenarios(self):
        build_local_bpmn_payload = _require_helper("_build_local_bpmn_payload")
        looks_like_terminal_task_name = _require_helper("_looks_like_terminal_task_name")

        for scenario in SCENARIOS:
            with self.subTest(scenario=scenario["name"]):
                payload, entities = build_local_bpmn_payload(
                    scenario["goal"],
                    scenario["process"],
                    scenario["entity"],
                )

                self.assertIsInstance(payload, dict)
                self.assertTrue(entities, "Expected inferred entities")

                nodes_raw = payload.get("nodes")
                connections_raw = payload.get("connections")
                nodes = nodes_raw if isinstance(nodes_raw, list) else []
                connections = connections_raw if isinstance(connections_raw, list) else []

                self.assertGreaterEqual(len(nodes), 2, "Expected at least two nodes")
                self.assertGreaterEqual(len(connections), 1, "Expected at least one connection")

                conditional_ids = {
                    str(node.get("id") or "").strip()
                    for node in nodes
                    if isinstance(node, dict)
                    and str(node.get("nodeType") or "").strip().lower() == "condicional"
                }

                decision_connections = [
                    conn
                    for conn in connections
                    if isinstance(conn, dict)
                    and str(conn.get("from") or "").strip() in conditional_ids
                    and str(conn.get("decision") or "").strip().lower() in {"sim", "nao"}
                ]

                if scenario["expects_decision"]:
                    self.assertTrue(conditional_ids, "Expected at least one conditional node")
                    decisions = {
                        str(conn.get("decision") or "").strip().lower()
                        for conn in decision_connections
                    }
                    self.assertIn("sim", decisions, "Expected 'sim' branch")
                    self.assertIn("nao", decisions, "Expected 'nao' branch")

                terminal_tasks = [
                    node
                    for node in nodes
                    if isinstance(node, dict)
                    and str(node.get("nodeType") or "").strip().lower() == "task"
                    and looks_like_terminal_task_name(node.get("label") or node.get("taskNome") or "")
                ]
                self.assertTrue(terminal_tasks, "Expected terminal task node")

    def test_quality_score_thresholds_for_scenarios(self):
        build_local_bpmn_payload = _require_helper("_build_local_bpmn_payload")
        looks_like_terminal_task_name = _require_helper("_looks_like_terminal_task_name")

        scores: list[int] = []
        lines: list[str] = []

        for scenario in SCENARIOS:
            with self.subTest(scenario=scenario["name"]):
                payload, entities = build_local_bpmn_payload(
                    scenario["goal"],
                    scenario["process"],
                    scenario["entity"],
                )
                analysis = _analyze_scenario_payload(
                    payload,
                    entities if isinstance(entities, list) else [],
                    bool(scenario["expects_decision"]),
                    looks_like_terminal_task_name,
                )

                score = int(analysis["score"])
                scores.append(score)
                min_score = 80 if scenario["expects_decision"] else 70
                self.assertGreaterEqual(
                    score,
                    min_score,
                    f"Scenario {scenario['name']} below threshold: {score} < {min_score}",
                )

                lines.append(
                    (
                        f"{scenario['name']}: score={score} "
                        f"nodes={analysis['node_count']} "
                        f"connections={analysis['connection_count']} "
                        f"decisions={analysis['decision_count']}"
                    )
                )

        avg = round(sum(scores) / len(scores), 2) if scores else 0.0
        self.assertGreaterEqual(avg, 82.0, f"Average score below expected baseline: {avg}")
        print("\nAI BPMN Quality Report")
        for line in lines:
            print(line)
        print(f"Average score: {avg}")


if __name__ == "__main__":
    unittest.main()
