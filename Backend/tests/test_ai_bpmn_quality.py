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


class TestAiBpmnQuality(unittest.TestCase):
    def test_extract_goal_steps_expands_decision_branches(self):
        extract_goal_steps = _require_helper("_extract_goal_steps")
        goal = (
            "Fluxo do processo: 1. Receber solicitacao. "
            "2. Se documento completo, aprovar solicitacao, senao devolver para correcao. "
            "3. Registrar resultado."
        )

        steps = extract_goal_steps(goal)

        self.assertTrue(any("?" in step for step in steps), "Expected one decision question step")
        self.assertTrue(any(step.startswith("Sim:") for step in steps), "Expected explicit Sim branch")
        self.assertTrue(any(step.startswith("Nao:") for step in steps), "Expected explicit Nao branch")

    def test_build_local_bpmn_payload_adds_terminal_end_when_missing(self):
        build_local_bpmn_payload = _require_helper("_build_local_bpmn_payload")
        looks_like_terminal_task_name = _require_helper("_looks_like_terminal_task_name")
        goal = (
            "Fluxo do processo: 1. Receber pedido. "
            "2. Se pedido aprovado, emitir contrato, senao devolver para ajuste."
        )

        payload, entities = build_local_bpmn_payload(goal, "Fluxo de Contrato", "Pedido")

        nodes_raw = payload.get("nodes") if isinstance(payload, dict) else []
        connections_raw = payload.get("connections") if isinstance(payload, dict) else []
        nodes = nodes_raw if isinstance(nodes_raw, list) else []
        connections = connections_raw if isinstance(connections_raw, list) else []
        self.assertIsInstance(nodes, list)
        self.assertIsInstance(connections, list)
        self.assertGreaterEqual(len(nodes), 3)
        self.assertGreaterEqual(len(connections), 2)

        terminal_nodes = [
            node
            for node in nodes
            if isinstance(node, dict)
            and str(node.get("nodeType") or "").strip().lower() == "task"
            and looks_like_terminal_task_name(node.get("label") or node.get("taskNome") or "")
        ]
        self.assertTrue(terminal_nodes, "Expected an explicit terminal task node")
        self.assertTrue(entities, "Expected at least one inferred entity name")

    def test_ensure_core_plan_actions_fills_required_actions(self):
        ensure_core_plan_actions = _require_helper("_ensure_core_plan_actions")
        fallback_payload = {
            "name": "Teste",
            "nodes": [
                {"id": "n1", "label": "Inicio", "nodeType": "task", "x": 100, "y": 100},
                {"id": "n2", "label": "Fim", "nodeType": "task", "x": 300, "y": 100},
            ],
            "connections": [
                {"id": "c1", "from": "n1", "to": "n2", "fromHandle": "right", "toHandle": "left"}
            ],
            "stages": [
                {"id": "s1", "nome": "Inicio", "tipo": "task", "participante": ""},
                {"id": "s2", "nome": "Fim", "tipo": "task", "participante": ""},
            ],
        }

        actions = [{"type": "create_entidade", "payload": {"nome": "Pedido"}}]
        ensured = ensure_core_plan_actions(
            actions=actions,
            goal="Criar fluxo de pedido",
            process_name="Fluxo de Pedido",
            current_user={"nome": "QA"},
            fallback_bpmn_payload=fallback_payload,
        )

        action_types = [str(item.get("type") or "") for item in ensured if isinstance(item, dict)]
        self.assertIn("create_entidade", action_types)
        self.assertIn("create_oportunidade", action_types)
        self.assertIn("update_bpmn_state", action_types)
        self.assertEqual(action_types, sorted(action_types, key=lambda t: {"create_entidade": 0, "create_oportunidade": 1, "update_bpmn_state": 2}.get(t, 99)))


if __name__ == "__main__":
    unittest.main()
