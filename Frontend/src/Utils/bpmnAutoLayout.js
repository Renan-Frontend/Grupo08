/**
 * Uses bpmn-auto-layout to compute node positions and connection
 * waypoints from our app's JSON nodes[] + connections[] format.
 *
 * Flow:
 *   1. Convert nodes/connections → BPMN 2.0 XML (without DI)
 *   2. Run layoutProcess() to auto-layout
 *   3. Parse the layouted XML to extract positions
 *   4. Apply positions back to our nodes and compute handles
 */
import { layoutProcess } from 'bpmn-auto-layout';

// Our card dimensions in the BpmnFlow canvas
const CARD_W = 220;
const CARD_H = 110;

// bpmn-auto-layout produces standard BPMN sizes
const BPMN_TASK_W = 100;
const BPMN_TASK_H = 80;
const BPMN_GW_W = 50;
const BPMN_GW_H = 50;
const BPMN_EVENT_W = 36;
const BPMN_EVENT_H = 36;

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBpmnTag(nodeType) {
  switch (nodeType) {
    case 'start':       return 'bpmn:startEvent';
    case 'end':         return 'bpmn:endEvent';
    case 'condicional': return 'bpmn:exclusiveGateway';
    // Entities treated as tasks for layout purposes
    case 'entidade':    return 'bpmn:task';
    case 'task':
    default:            return 'bpmn:task';
  }
}

/**
 * Build BPMN 2.0 XML from nodes and connections — NO DI section.
 * layoutProcess() will generate the DI automatically.
 */
function buildBpmnXmlNoDi(nodes, connections) {
  const incoming = {};
  const outgoing = {};
  for (const c of connections) {
    const fid = String(c.from);
    const tid = String(c.to);
    (outgoing[fid] ||= []).push(c.id);
    (incoming[tid] ||= []).push(c.id);
  }

  const proc = [];
  for (const node of nodes) {
    const nid = esc(node.id);
    const tag = getBpmnTag(node.nodeType);
    const name = esc(node.label || '');

    const inLines = (incoming[String(node.id)] || [])
      .map((id) => `      <bpmn:incoming>${esc(id)}</bpmn:incoming>`);
    const outLines = (outgoing[String(node.id)] || [])
      .map((id) => `      <bpmn:outgoing>${esc(id)}</bpmn:outgoing>`);
    const body = [...inLines, ...outLines].join('\n');

    if (body) {
      proc.push(
        `    <${tag} id="${nid}" name="${name}">\n${body}\n    </${tag}>`,
      );
    } else {
      proc.push(`    <${tag} id="${nid}" name="${name}" />`);
    }
  }

  for (const conn of connections) {
    const id = esc(conn.id);
    const src = esc(conn.from);
    const tgt = esc(conn.to);
    let nameAttr = '';
    if (conn.decision === 'sim') nameAttr = ' name="Sim"';
    else if (conn.decision === 'nao') nameAttr = ' name="Não"';
    proc.push(
      `    <bpmn:sequenceFlow id="${id}" sourceRef="${src}" targetRef="${tgt}"${nameAttr} />`,
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
    '                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
    '                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
    '                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
    '                  id="Definitions_1"',
    '                  targetNamespace="http://bpmn.io/schema/bpmn">',
    '  <bpmn:process id="Process_1" isExecutable="false">',
    proc.join('\n'),
    '  </bpmn:process>',
    '</bpmn:definitions>',
  ].join('\n');
}

/**
 * Parse the layouted BPMN XML and extract node positions and edge waypoints.
 */
function parseLayoutedXml(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const NS_DI = 'http://www.omg.org/spec/BPMN/20100524/DI';
  const NS_DC = 'http://www.omg.org/spec/DD/20100524/DC';

  // Extract shape positions: bpmnElement → {x, y, width, height}
  const positions = {};
  const shapes = doc.getElementsByTagNameNS(NS_DI, 'BPMNShape');
  for (const shape of shapes) {
    const elemId = shape.getAttribute('bpmnElement');
    if (!elemId) continue;
    const bounds = shape.getElementsByTagNameNS(NS_DC, 'Bounds')[0];
    if (!bounds) continue;
    positions[elemId] = {
      x: parseFloat(bounds.getAttribute('x') || 0),
      y: parseFloat(bounds.getAttribute('y') || 0),
      width: parseFloat(bounds.getAttribute('width') || 0),
      height: parseFloat(bounds.getAttribute('height') || 0),
    };
  }

  return { positions };
}

/**
 * Convert BPMN bounds positions to our card-space positions.
 * bpmn-auto-layout uses standard BPMN sizes (task: 100×80, gateway: 50×50)
 * but our cards are 220×110. We need to scale the positions so cards don't overlap.
 */
function scalePositionsToCardSpace(positions) {
  // Find the center of each BPMN element
  const entries = Object.entries(positions);
  if (!entries.length) return {};

  // The BPMN layout uses ~150px horizontal spacing for 100px-wide tasks.
  // Our cards are 220×110, so we need proportionally more spacing.
  // Scale factor: card_size / bpmn_size, with extra gap
  const SCALE_X = (CARD_W + 120) / (BPMN_TASK_W + 50);  // ~2.27
  const SCALE_Y = (CARD_H + 120) / (BPMN_TASK_H + 60);  // ~1.64

  const result = {};
  for (const [id, bounds] of entries) {
    // Center of the BPMN element
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;

    // Scale from center of the BPMN layout
    const scaledCx = cx * SCALE_X;
    const scaledCy = cy * SCALE_Y;

    // Convert to top-left of our card
    result[id] = {
      x: Math.round(scaledCx - CARD_W / 2),
      y: Math.round(scaledCy - CARD_H / 2),
      // Keep original bounds for handle calculation
      origBounds: bounds,
    };
  }
  return result;
}

/**
 * Post-layout overlap resolution: push overlapping nodes apart.
 * Uses an iterative approach, trying both downward and rightward shifts.
 */
function resolveOverlaps(nodes) {
  const PAD_X = 30;
  const PAD_Y = 30;

  function overlaps(a, b) {
    return (
      Math.abs(a.x - b.x) < CARD_W + PAD_X &&
      Math.abs(a.y - b.y) < CARD_H + PAD_Y
    );
  }

  for (let round = 0; round < 15; round++) {
    let moved = false;
    const sorted = [...nodes].sort((a, b) => {
      const colA = Math.round((Number(a.x) || 0) / 100);
      const colB = Math.round((Number(b.x) || 0) / 100);
      if (colA !== colB) return colA - colB;
      return (Number(a.y) || 0) - (Number(b.y) || 0);
    });

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const na = sorted[i];
        const nb = sorted[j];
        if (overlaps(na, nb)) {
          // Push the later node down
          nb.y = na.y + CARD_H + PAD_Y;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return nodes;
}

/**
 * Check if nodes already have meaningful positions from the backend.
 * Returns true if they have varied, non-zero positions.
 */
function hasBackendPositions(nodes) {
  let hasNonZero = false;
  const seen = new Set();
  for (const n of nodes) {
    const x = Number(n.x) || 0;
    const y = Number(n.y) || 0;
    if (x !== 0 || y !== 0) hasNonZero = true;
    seen.add(`${x},${y}`);
  }
  // Valid backend positions: at least one non-zero AND not all stacked at same point
  return hasNonZero && seen.size > 1;
}

/**
 * Compute connection handles from node positions.
 */
function computeConnectionHandles(connections, nodeCardPos) {
  return connections.map((conn) => {
    const fromPos = nodeCardPos[String(conn.from)];
    const toPos = nodeCardPos[String(conn.to)];
    if (!fromPos || !toPos) return conn;

    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;

    let fromHandle, toHandle;
    if (conn.decision === 'nao') {
      // NAO: always sideways to avoid conflicting with SIM (bottom)
      fromHandle = dx >= 0 ? 'right' : 'left';
      toHandle   = dx >= 0 ? 'left'  : 'right';
    } else if (Math.abs(dx) > Math.abs(dy)) {
      // Primarily horizontal
      if (dx > 0) {
        fromHandle = 'right';
        toHandle = 'left';
      } else {
        fromHandle = 'left';
        toHandle = 'right';
      }
    } else {
      // Primarily vertical
      if (dy > 0) {
        fromHandle = 'bottom';
        toHandle = 'top';
      } else {
        fromHandle = 'top';
        toHandle = 'bottom';
      }
    }

    return { ...conn, fromHandle, toHandle };
  });
}

/**
 * Main function: apply layout to nodes and connections.
 * If nodes already have valid backend positions, preserves them (only resolves overlaps + computes handles).
 * Otherwise falls back to the bpmn-auto-layout library.
 * Returns { nodes: [...with x,y], connections: [...with handles] }
 */
export async function applyBpmnAutoLayout(nodes, connections) {
  if (!nodes?.length) return { nodes, connections };

  try {
    let layoutedNodes;

    if (hasBackendPositions(nodes)) {
      // Backend already computed a good snake layout — preserve it
      console.info('[bpmn-layout] Usando posições do backend (snake layout)');
      layoutedNodes = nodes.map((n) => ({ ...n }));
    } else {
      // No valid backend positions — fall back to bpmn-auto-layout library
      console.info('[bpmn-layout] Sem posições do backend, usando bpmn-auto-layout');

      // 1. Build BPMN XML without DI
      const xml = buildBpmnXmlNoDi(nodes, connections);

      // 2. Run auto-layout
      const layoutedXml = await layoutProcess(xml);

      // 3. Parse positions from DI
      const { positions: rawPositions } = parseLayoutedXml(layoutedXml);

      // 4. Scale positions to card space (220×110 cards vs 100×80 BPMN tasks)
      const cardPositions = scalePositionsToCardSpace(rawPositions);

      // 5. Apply positions to nodes
      layoutedNodes = nodes.map((node) => {
        const pos = cardPositions[String(node.id)];
        if (!pos) return node;
        return { ...node, x: pos.x, y: pos.y };
      });
    }

    // Resolve any remaining overlaps
    resolveOverlaps(layoutedNodes);

    // Build a map of card-space node positions for handle calculation
    const nodeCardPos = {};
    for (const node of layoutedNodes) {
      nodeCardPos[String(node.id)] = {
        x: Number(node.x) || 0,
        y: Number(node.y) || 0,
      };
    }

    // Compute handles from actual card positions
    const layoutedConnections = computeConnectionHandles(connections, nodeCardPos);

    return { nodes: layoutedNodes, connections: layoutedConnections };
  } catch (err) {
    console.warn('[bpmn-auto-layout] Falha no auto-layout, usando posições originais:', err);
    return { nodes, connections };
  }
}
