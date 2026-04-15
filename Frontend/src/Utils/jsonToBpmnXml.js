/**
 * Converts the app's JSON nodes[] + connections[] into BPMN 2.0 XML
 * compatible with bpmn-js rendering.
 */

// Standard bpmn-js element sizes
const SIZES = {
  start:       { width: 36,  height: 36 },
  end:         { width: 36,  height: 36 },
  task:        { width: 100, height: 80 },
  condicional: { width: 50,  height: 50 },
  entidade:    { width: 100, height: 80 },
};

// Our original card dimensions used in layout
const CARD_W = 220;
const CARD_H = 110;

function getSize(nodeType) {
  return SIZES[nodeType] || SIZES.task;
}

function getBpmnTag(nodeType) {
  switch (nodeType) {
    case 'start':       return 'bpmn:startEvent';
    case 'end':         return 'bpmn:endEvent';
    case 'condicional': return 'bpmn:exclusiveGateway';
    case 'entidade':    return 'bpmn:serviceTask';
    case 'task':
    default:            return 'bpmn:userTask';
  }
}

/**
 * Convert card-space position (top-left of 220×110 card) to
 * BPMN element bounds (centred within that card area).
 */
function toBpmnBounds(node) {
  const size = getSize(node.nodeType);
  const x = parseFloat(node.x || 0);
  const y = parseFloat(node.y || 0);
  return {
    x: Math.round(x + (CARD_W - size.width)  / 2),
    y: Math.round(y + (CARD_H - size.height) / 2),
    width:  size.width,
    height: size.height,
  };
}

/**
 * Convert bpmn-js shape position back to our card-space position.
 */
export function fromBpmnBounds(bpmnX, bpmnY, nodeType) {
  const size = getSize(nodeType);
  return {
    x: Math.round(bpmnX - (CARD_W - size.width)  / 2),
    y: Math.round(bpmnY - (CARD_H - size.height) / 2),
  };
}

/**
 * Compute a waypoint for a connection handle on a BPMN element.
 */
function waypointFor(node, handle) {
  const b = toBpmnBounds(node);
  const cx = b.x + b.width  / 2;
  const cy = b.y + b.height / 2;
  switch (handle) {
    case 'top':    return { x: cx,            y: b.y };
    case 'bottom': return { x: cx,            y: b.y + b.height };
    case 'left':   return { x: b.x,           y: cy };
    case 'right':  return { x: b.x + b.width, y: cy };
    default:       return { x: cx,            y: cy };
  }
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Main converter: nodes[] + connections[] → BPMN 2.0 XML string.
 */
export function convertJsonToBpmnXml(nodes, connections) {
  if (!nodes || !nodes.length) return '';

  const nodeMap = Object.fromEntries(nodes.map(n => [String(n.id), n]));

  // incoming / outgoing flow maps
  const incoming = {};
  const outgoing = {};
  for (const c of connections) {
    const fid = String(c.from);
    const tid = String(c.to);
    (outgoing[fid] ||= []).push(c.id);
    (incoming[tid] ||= []).push(c.id);
  }

  // --- Process elements ------------------------------------------------
  const proc = [];
  for (const node of nodes) {
    const nid = esc(node.id);
    const tag = getBpmnTag(node.nodeType);
    const name = esc(node.label || '');

    const inLines  = (incoming[String(node.id)]  || [])
      .map(id => `      <bpmn:incoming>${esc(id)}</bpmn:incoming>`);
    const outLines = (outgoing[String(node.id)] || [])
      .map(id => `      <bpmn:outgoing>${esc(id)}</bpmn:outgoing>`);
    const body = [...inLines, ...outLines].join('\n');

    if (body) {
      proc.push(`    <${tag} id="${nid}" name="${name}">\n${body}\n    </${tag}>`);
    } else {
      proc.push(`    <${tag} id="${nid}" name="${name}" />`);
    }
  }

  // --- Sequence flows --------------------------------------------------
  for (const conn of connections) {
    const id  = esc(conn.id);
    const src = esc(conn.from);
    const tgt = esc(conn.to);
    let nameAttr = '';
    if (conn.decision === 'sim')      nameAttr = ' name="Sim"';
    else if (conn.decision === 'nao') nameAttr = ' name="Não"';
    proc.push(
      `    <bpmn:sequenceFlow id="${id}" sourceRef="${src}" targetRef="${tgt}"${nameAttr} />`,
    );
  }

  // --- DI: shapes ------------------------------------------------------
  const di = [];
  for (const node of nodes) {
    const b   = toBpmnBounds(node);
    const nid = esc(node.id);
    di.push(
      `      <bpmndi:BPMNShape id="${nid}_di" bpmnElement="${nid}">\n` +
      `        <dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" />\n` +
      `      </bpmndi:BPMNShape>`,
    );
  }

  // --- DI: edges -------------------------------------------------------
  for (const conn of connections) {
    const fromNode = nodeMap[String(conn.from)];
    const toNode   = nodeMap[String(conn.to)];
    if (!fromNode || !toNode) continue;

    const wp1 = waypointFor(fromNode, conn.fromHandle || 'right');
    const wp2 = waypointFor(toNode,   conn.toHandle   || 'left');
    const cid = esc(conn.id);

    di.push(
      `      <bpmndi:BPMNEdge id="${cid}_di" bpmnElement="${cid}">\n` +
      `        <di:waypoint x="${Math.round(wp1.x)}" y="${Math.round(wp1.y)}" />\n` +
      `        <di:waypoint x="${Math.round(wp2.x)}" y="${Math.round(wp2.y)}" />\n` +
      `      </bpmndi:BPMNEdge>`,
    );
  }

  // --- Assemble --------------------------------------------------------
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
    '                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
    '                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
    '                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
    '                  id="Definitions_1"',
    '                  targetNamespace="http://bpmn.io/schema/bpmn"',
    '                  exporter="BP-Company" exporterVersion="1.0">',
    '  <bpmn:process id="Process_1" isExecutable="false">',
    proc.join('\n'),
    '  </bpmn:process>',
    '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">',
    '    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">',
    di.join('\n'),
    '    </bpmndi:BPMNPlane>',
    '  </bpmndi:BPMNDiagram>',
    '</bpmn:definitions>',
  ].join('\n');
}
