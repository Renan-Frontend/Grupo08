import React from 'react';
import styles from './BpmnFlow.module.css';

const getNodeLabel = (node) => node?.label || 'Etapa';
const getNodeDescricao = (node) => node?.descricao || '';
const getNodeInfo = (node) => node?.info || '';
const isNodeActive = (node) => node?.active !== false;
const CARD_WIDTH = 220;
const CARD_HEIGHT = 110;
const isPrimaryPointerButton = (event) =>
  event.button === undefined || event.button === 0;

const getOrthogonalPolylinePoints = (x1, y1, x2, y2, fromHandle = 'right', toHandle = 'left') => {
  // Ponto muito próximo → reta direta
  if (Math.abs(x1 - x2) < 2 && Math.abs(y1 - y2) < 2) {
    return `${x1},${y1} ${x2},${y2}`;
  }

  const exitHoriz = fromHandle === 'left' || fromHandle === 'right';
  const approachHoriz = toHandle === 'left' || toHandle === 'right';

  // Ambos horizontais → reta se alinhados, senão Z-route (horizontal → vertical → horizontal)
  if (exitHoriz && approachHoriz) {
    if (Math.abs(y1 - y2) < 2) {
      return `${x1},${y1} ${x2},${y2}`;
    }
    const midX = (x1 + x2) / 2;
    return `${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`;
  }

  // Ambos verticais → reta se alinhados, senão Z-route (vertical → horizontal → vertical)
  if (!exitHoriz && !approachHoriz) {
    if (Math.abs(x1 - x2) < 2) {
      return `${x1},${y1} ${x2},${y2}`;
    }
    const midY = (y1 + y2) / 2;
    return `${x1},${y1} ${x1},${midY} ${x2},${midY} ${x2},${y2}`;
  }

  // Saída horizontal, chegada vertical → L-route via (x2, y1)
  if (exitHoriz && !approachHoriz) {
    return `${x1},${y1} ${x2},${y1} ${x2},${y2}`;
  }

  // Saída vertical, chegada horizontal → L-route via (x1, y2)
  return `${x1},${y1} ${x1},${y2} ${x2},${y2}`;
};

/* ── Obstacle avoidance for orthogonal polylines ──────────────────────────
 * After computing the base polyline, each straight segment is tested
 * against every obstacle rect.  When a segment crosses a node it is not
 * connected to, extra waypoints are injected to route around it.
 * --------------------------------------------------------------------- */
const _OBS_PAD = 20; // px clearance around each obstacle

const _segHitsRect = (ax, ay, bx, by, r) => {
  const l = r.x - _OBS_PAD;
  const ri = r.x + r.w + _OBS_PAD;
  const t = r.y - _OBS_PAD;
  const bo = r.y + r.h + _OBS_PAD;

  const horiz = Math.abs(ay - by) < 2;
  const vert = Math.abs(ax - bx) < 2;

  if (horiz) {
    if (ay < t || ay > bo) return false;
    const lo = Math.min(ax, bx);
    const hi = Math.max(ax, bx);
    return hi > l && lo < ri;
  }
  if (vert) {
    if (ax < l || ax > ri) return false;
    const lo = Math.min(ay, by);
    const hi = Math.max(ay, by);
    return hi > t && lo < bo;
  }
  return false;
};

const _avoidObstacles = (pointsStr, obstacles) => {
  if (!obstacles || obstacles.length === 0) return pointsStr;

  let pts = pointsStr.split(' ').map((s) => {
    const [px, py] = s.split(',').map(Number);
    return { x: px, y: py };
  });
  if (pts.length < 2) return pointsStr;

  const findHit = (ax, ay, bx, by) => {
    for (const obs of obstacles) {
      if (_segHitsRect(ax, ay, bx, by, obs)) return obs;
    }
    return null;
  };

  // Strategy: shift Z-route midpoint to avoid obstacles.
  // This keeps routes as clean 4-point paths instead of adding U-shaped
  // detour waypoints that create "duplicate/parallel line" artefacts.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;

    // Handle Z-routes (4 points): shift the mid-segment
    if (pts.length === 4) {
      const [a, m1, m2, b] = pts;
      const midIsVert = Math.abs(m1.x - m2.x) < 2;
      const midIsHoriz = Math.abs(m1.y - m2.y) < 2;

      if (midIsVert) {
        const hit = findHit(m1.x, m1.y, m2.x, m2.y);
        if (hit) {
          const oL = hit.x - _OBS_PAD - 4;
          const oR = hit.x + hit.w + _OBS_PAD + 4;
          const minX = Math.min(a.x, b.x);
          const maxX = Math.max(a.x, b.x);
          let midX;
          if (oL >= minX - 1 && oL <= maxX + 1) midX = oL;
          else if (oR >= minX - 1 && oR <= maxX + 1) midX = oR;
          else midX = Math.abs(m1.x - oL) < Math.abs(m1.x - oR) ? oL : oR;
          pts = [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
          changed = true;
        }
      } else if (midIsHoriz) {
        const hit = findHit(m1.x, m1.y, m2.x, m2.y);
        if (hit) {
          const oT = hit.y - _OBS_PAD - 4;
          const oB = hit.y + hit.h + _OBS_PAD + 4;
          const minY = Math.min(a.y, b.y);
          const maxY = Math.max(a.y, b.y);
          let midY;
          if (oT >= minY - 1 && oT <= maxY + 1) midY = oT;
          else if (oB >= minY - 1 && oB <= maxY + 1) midY = oB;
          else midY = Math.abs(m1.y - oT) < Math.abs(m1.y - oB) ? oT : oB;
          pts = [pts[0], { x: pts[0].x, y: midY }, { x: pts[3].x, y: midY }, pts[3]];
          changed = true;
        }
      }
    }

    // Handle L-routes (3 points): convert to Z-route if crossing
    if (pts.length === 3) {
      const [a, bend, b] = pts;
      const hit1 = findHit(a.x, a.y, bend.x, bend.y);
      const hit2 = findHit(bend.x, bend.y, b.x, b.y);
      if (hit1 || hit2) {
        const exitHoriz = Math.abs(a.y - bend.y) < 2;
        if (exitHoriz) {
          const midX = (a.x + b.x) / 2;
          pts = [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
        } else {
          const midY = (a.y + b.y) / 2;
          pts = [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
        }
        changed = true;
        continue; // re-check as Z-route on next pass
      }
    }

    // Handle straight lines (2 points): convert to Z-route if crossing
    if (pts.length === 2) {
      const [a, b] = pts;
      const hit = findHit(a.x, a.y, b.x, b.y);
      if (hit) {
        const isHoriz = Math.abs(a.y - b.y) < 2;
        if (isHoriz) {
          const oT = hit.y - _OBS_PAD - 4;
          const oB = hit.y + hit.h + _OBS_PAD + 4;
          const shiftY = Math.abs(a.y - oT) < Math.abs(a.y - oB) ? oT : oB;
          pts = [a, { x: a.x, y: shiftY }, { x: b.x, y: shiftY }, b];
        } else {
          const oL = hit.x - _OBS_PAD - 4;
          const oR = hit.x + hit.w + _OBS_PAD + 4;
          const shiftX = Math.abs(a.x - oL) < Math.abs(a.x - oR) ? oL : oR;
          pts = [a, { x: shiftX, y: a.y }, { x: shiftX, y: b.y }, b];
        }
        changed = true;
        continue; // re-check on next pass
      }
    }

    if (!changed) break;
  }

  // Dedupe consecutive identical points
  const deduped = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (Math.abs(pts[i].x - prev.x) > 0.5 || Math.abs(pts[i].y - prev.y) > 0.5) {
      deduped.push(pts[i]);
    }
  }

  return deduped.map((p) => `${p.x},${p.y}`).join(' ');
};

const computeBestHandles = (fromNode, toNode) => {
  const fx = fromNode.x || 0;
  const fy = fromNode.y || 0;
  const tx = toNode.x || 0;
  const ty = toNode.y || 0;

  const fromCx = fx + CARD_WIDTH / 2;
  const fromCy = fy + CARD_HEIGHT / 2;
  const toCx = tx + CARD_WIDTH / 2;
  const toCy = ty + CARD_HEIGHT / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Check if there's clear horizontal gap between nodes (no overlap)
  const hGap = dx > 0
    ? tx - (fx + CARD_WIDTH)   // gap between right edge of from → left edge of to
    : fx - (tx + CARD_WIDTH);  // gap between right edge of to → left edge of from
  const vGap = dy > 0
    ? ty - (fy + CARD_HEIGHT)
    : fy - (ty + CARD_HEIGHT);

  const hasHClearance = hGap > -10;  // at most 10px overlap allowed
  const hasVClearance = vGap > -10;

  // Prefer horizontal if there's clear horizontal gap,
  // OR if horizontal distance between centers is larger than vertical
  if (hasHClearance && (absDx >= absDy || !hasVClearance)) {
    return {
      fromHandle: dx >= 0 ? 'right' : 'left',
      toHandle: dx >= 0 ? 'left' : 'right',
    };
  }

  // Use vertical if there's clear vertical gap
  if (hasVClearance) {
    return {
      fromHandle: dy >= 0 ? 'bottom' : 'top',
      toHandle: dy >= 0 ? 'top' : 'bottom',
    };
  }

  // Both overlap — use dominant axis by center distance
  if (absDx >= absDy) {
    return {
      fromHandle: dx >= 0 ? 'right' : 'left',
      toHandle: dx >= 0 ? 'left' : 'right',
    };
  }
  return {
    fromHandle: dy >= 0 ? 'bottom' : 'top',
    toHandle: dy >= 0 ? 'top' : 'bottom',
  };
};

const getHandlePoint = (node, handle = 'left') => {
  const x = node?.x || 0;
  const y = node?.y || 0;

  if (handle === 'right') {
    return { x: x + CARD_WIDTH, y: y + CARD_HEIGHT / 2 };
  }

  if (handle === 'top') {
    return { x: x + CARD_WIDTH / 2, y };
  }

  if (handle === 'bottom') {
    return { x: x + CARD_WIDTH / 2, y: y + CARD_HEIGHT };
  }

  return { x, y: y + CARD_HEIGHT / 2 };
};

const getHandlePointFromRect = (
  nodeRect,
  containerRect,
  handle = 'left',
  zoom = 1,
  oppositePoint = null,
) => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const offset = 1;
  const PAD = 12; // keep line away from corners

  const left = (nodeRect.left - containerRect.left) / safeZoom;
  const right = (nodeRect.right - containerRect.left) / safeZoom;
  const top = (nodeRect.top - containerRect.top) / safeZoom;
  const bottom = (nodeRect.bottom - containerRect.top) / safeZoom;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  // Clamp helper: project opposite point onto the edge, with padding from corners
  const clampX = (opp) => {
    if (!opp) return midX;
    return Math.max(left + PAD, Math.min(right - PAD, opp.x));
  };
  const clampY = (opp) => {
    if (!opp) return midY;
    return Math.max(top + PAD, Math.min(bottom - PAD, opp.y));
  };

  if (handle === 'right') {
    return { x: right + offset, y: clampY(oppositePoint) };
  }
  if (handle === 'top') {
    return { x: clampX(oppositePoint), y: top - offset };
  }
  if (handle === 'bottom') {
    return { x: clampX(oppositePoint), y: bottom + offset };
  }
  // left
  return { x: left - offset, y: clampY(oppositePoint) };
};

const normalizeDecisionValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (
    normalized === 'sim' ||
    normalized === 'yes' ||
    normalized === 'true' ||
    normalized === 'ok' ||
    normalized === 'aprovado' ||
    raw === '✓' ||
    raw === '✔'
  ) {
    return 'sim';
  }

  if (
    normalized === 'nao' ||
    normalized === 'no' ||
    normalized === 'false' ||
    normalized === 'reprovado' ||
    raw === '✕' ||
    raw === '✖' ||
    raw === 'x' ||
    raw === 'X'
  ) {
    return 'nao';
  }

  return raw;
};

const BpmnFlow = ({
  nodes = [],
  connections = [],
  currentIndex = 0,
  disabled = false,
  onStageChange,
  onToggleNodeActive,
  onSelectNode,
  onRemoveNode,
  selectedNodeId,
  draggable = false,
  onNodePositionChange,
  zoom = 1,
  canvasWidth = 4000,
  canvasHeight = 2400,
  disableNodeDrag = false,
  onCreateConnection,
  onCreateNodeFromConnection,
  onRemoveConnection,
  onSelectConnection,
  selectedConnectionId,
  invalidNodeId,
  connectorsEnabled = true,
  onNodeLabelChange,
}) => {
  const flowWrapRef = React.useRef(null);
  const [editingNodeId, setEditingNodeId] = React.useState(null);
  const [editingValue, setEditingValue] = React.useState('');
  const editInputRef = React.useRef(null);
  const nodeRefs = React.useRef({});
  const [connectionLines, setConnectionLines] = React.useState([]);
  const [dragState, setDragState] = React.useState(null);
  const [linkDrag, setLinkDrag] = React.useState(null);
  const [touchConnectionDraft, setTouchConnectionDraft] = React.useState(null);
  const [isCoarsePointer, setIsCoarsePointer] = React.useState(false);
  const ignoreNextNodeClickRef = React.useRef(false);
  const longPressTimerRef = React.useRef(null);

  React.useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updatePointerMode = () => {
      setIsCoarsePointer(Boolean(mediaQuery.matches));
    };

    updatePointerMode();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updatePointerMode);
      return () => mediaQuery.removeEventListener('change', updatePointerMode);
    }

    mediaQuery.addListener(updatePointerMode);
    return () => mediaQuery.removeListener(updatePointerMode);
  }, []);

  const outgoingDecisionByConnectionId = React.useMemo(() => {
    const map = {};
    const groupedByNode = {};
    const conditionalNodeIdSet = new Set(
      nodes
        .filter((node) => node?.nodeType === 'condicional')
        .map((node) => node.id),
    );

    connections.forEach((connection) => {
      const normalizedDecision = normalizeDecisionValue(connection.decision);
      if (normalizedDecision === 'sim' || normalizedDecision === 'nao') {
        map[connection.id] = normalizedDecision;
      } else if (normalizedDecision) {
        map[connection.id] = 'custom';
      }

      if (!groupedByNode[connection.from]) {
        groupedByNode[connection.from] = [];
      }
      groupedByNode[connection.from].push(connection);
    });

    Object.entries(groupedByNode).forEach(([nodeId, outgoing]) => {
      if (!conditionalNodeIdSet.has(nodeId)) return;
      if (outgoing.length < 2) return;

      const undecided = outgoing.filter(
        (connection) => !normalizeDecisionValue(connection.decision),
      );

      if (undecided[0]) map[undecided[0].id] = 'sim';
      if (undecided[1]) map[undecided[1].id] = 'nao';
    });

    return map;
  }, [connections, nodes]);

  const getPointerOnCanvas = React.useCallback(
    (clientX, clientY) => {
      const containerRect = flowWrapRef.current?.getBoundingClientRect();
      if (!containerRect) return { x: 0, y: 0 };

      return {
        x: (clientX - containerRect.left) / zoom,
        y: (clientY - containerRect.top) / zoom,
      };
    },
    [zoom],
  );

  const getClosestSideHandle = React.useCallback((nodeId, clientX, clientY) => {
    const nodeElement = nodeRefs.current[nodeId];
    if (!nodeElement) return 'right';

    const rect = nodeElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = (clientX - centerX) / Math.max(1, rect.width / 2);
    const dy = (clientY - centerY) / Math.max(1, rect.height / 2);

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? 'right' : 'left';
    }

    return dy >= 0 ? 'bottom' : 'top';
  }, []);

  const startConnectorDrag = React.useCallback(
    (event, nodeId, direction) => {
      if (!isPrimaryPointerButton(event)) return;
      event.stopPropagation();
      event.preventDefault();

      onSelectNode?.(nodeId);

      const nodeElement = nodeRefs.current[nodeId];
      const containerRect = flowWrapRef.current?.getBoundingClientRect();
      if (!nodeElement || !containerRect) return;

      const nodeRect = nodeElement.getBoundingClientRect();
      const startByDirection = {
        left: {
          x: (nodeRect.left - containerRect.left) / zoom,
          y: (nodeRect.top + nodeRect.height / 2 - containerRect.top) / zoom,
        },
        right: {
          x: (nodeRect.right - containerRect.left) / zoom,
          y: (nodeRect.top + nodeRect.height / 2 - containerRect.top) / zoom,
        },
        top: {
          x: (nodeRect.left + nodeRect.width / 2 - containerRect.left) / zoom,
          y: (nodeRect.top - containerRect.top) / zoom,
        },
        bottom: {
          x: (nodeRect.left + nodeRect.width / 2 - containerRect.left) / zoom,
          y: (nodeRect.bottom - containerRect.top) / zoom,
        },
      };

      const pointer = getPointerOnCanvas(event.clientX, event.clientY);
      const start = startByDirection[direction] || startByDirection.right;

      setLinkDrag({
        fromId: nodeId,
        fromHandle: direction,
        startX: start.x,
        startY: start.y,
        endX: pointer.x,
        endY: pointer.y,
        pointerId: event.pointerId ?? null,
      });
    },
    [getPointerOnCanvas, onSelectNode, zoom],
  );

  React.useEffect(() => {
    if (!connectorsEnabled) {
      if (linkDrag) {
        setLinkDrag(null);
      }
      if (touchConnectionDraft) {
        setTouchConnectionDraft(null);
      }
    }
  }, [connectorsEnabled, linkDrag, touchConnectionDraft]);

  const recalculateConnectionLines = React.useCallback(() => {
    const container = flowWrapRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

    // O(1) lookups instead of O(N) .find() per connection
    const nodeMap = new Map();
    for (const n of nodes) nodeMap.set(n.id, n);

    const lines = connections
      .map((connection) => {
        const fromElement = nodeRefs.current[connection.from];
        const toElement = nodeRefs.current[connection.to];
        if (!fromElement || !toElement) return null;

        const fromNode = nodeMap.get(connection.from);
        const toNode = nodeMap.get(connection.to);
        // Always compute optimal handles based on actual node positions.
        // Backend-generated handles (e.g. always "right"→"left") don't account
        // for the real layout, causing lines to cross through unrelated nodes.
        // Exception: NAO and merge connections always use sideways handles.
        let fromHandle, toHandle;
        const connDecision = String(connection.decision || '').toLowerCase();
        if (connDecision === 'nao' && fromNode && toNode) {
          // NAO: always sideways — from right/left depending on relative X
          const dx = (toNode.x || 0) - (fromNode.x || 0);
          fromHandle = dx >= 0 ? 'right' : 'left';
          toHandle = dx >= 0 ? 'left' : 'right';
        } else if (connDecision === 'merge' && fromNode && toNode) {
          // Merge: NAO target reconnects — use bottom→top or side depending on position
          const dx = (toNode.x || 0) - (fromNode.x || 0);
          const dy = (toNode.y || 0) - (fromNode.y || 0);
          if (Math.abs(dx) > Math.abs(dy)) {
            fromHandle = dx >= 0 ? 'right' : 'left';
            toHandle = dx >= 0 ? 'left' : 'right';
          } else {
            fromHandle = dy >= 0 ? 'bottom' : 'top';
            toHandle = dy >= 0 ? 'top' : 'bottom';
          }
        } else if (fromNode && toNode) {
          const computed = computeBestHandles(fromNode, toNode);
          fromHandle = computed.fromHandle;
          toHandle = computed.toHandle;
        } else {
          fromHandle = connection.fromHandle || 'right';
          toHandle = connection.toHandle || 'left';
        }

        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();

        // First pass: get rough center of opposite node to aim towards
        const toCenter = {
          x: (toRect.left + toRect.width / 2 - containerRect.left) / safeZoom,
          y: (toRect.top + toRect.height / 2 - containerRect.top) / safeZoom,
        };
        const fromCenter = {
          x: (fromRect.left + fromRect.width / 2 - containerRect.left) / safeZoom,
          y: (fromRect.top + fromRect.height / 2 - containerRect.top) / safeZoom,
        };

        const source = getHandlePointFromRect(
          fromRect,
          containerRect,
          fromHandle,
          zoom,
          toCenter,
        );
        const target = getHandlePointFromRect(
          toRect,
          containerRect,
          toHandle,
          zoom,
          fromCenter,
        );

        const decision =
          outgoingDecisionByConnectionId[connection.id] || null;

        return {
          id: connection.id,
          fromId: connection.from,
          toId: connection.to,
          x1: source.x,
          y1: source.y,
          x2: target.x,
          y2: target.y,
          fromHandle,
          toHandle,
          decision,
        };
      })
      .filter(Boolean);

    // Build obstacle rects from all nodes (canvas-relative coords)
    const obstacleRects = [];
    nodes.forEach((node) => {
      const el = nodeRefs.current[node.id];
      if (!el) return;
      const r = el.getBoundingClientRect();
      obstacleRects.push({
        id: node.id,
        x: (r.left - containerRect.left) / safeZoom,
        y: (r.top - containerRect.top) / safeZoom,
        w: r.width / safeZoom,
        h: r.height / safeZoom,
      });
    });

    // Pre-compute polyline points with obstacle avoidance
    const linesWithPoints = lines.map((line) => {
      const basePoints = getOrthogonalPolylinePoints(
        line.x1, line.y1, line.x2, line.y2, line.fromHandle, line.toHandle,
      );
      const obs = obstacleRects.filter(
        (o) => o.id !== line.fromId && o.id !== line.toId,
      );
      return {
        ...line,
        pointsStr: _avoidObstacles(basePoints, obs),
      };
    });

    setConnectionLines(linesWithPoints);
  }, [connections, nodes, outgoingDecisionByConnectionId, zoom]);

  React.useLayoutEffect(() => {
    recalculateConnectionLines();
  }, [nodes, connections, recalculateConnectionLines]);

  React.useEffect(() => {
    window.addEventListener('resize', recalculateConnectionLines);
    return () =>
      window.removeEventListener('resize', recalculateConnectionLines);
  }, [recalculateConnectionLines]);

  React.useEffect(() => {
    if (!dragState || !draggable) return;

    // During drag, move the node via direct DOM manipulation (no React re-render).
    // Connections are NOT recalculated until pointerup for 60fps dragging.
    const handlePointerMove = (event) => {
      if (
        dragState.pointerId !== null &&
        event.pointerId !== undefined &&
        event.pointerId !== dragState.pointerId
      ) {
        return;
      }

      const container = flowWrapRef.current;
      const nodeElement = nodeRefs.current[dragState.id];
      if (!container || !nodeElement) return;

      const containerRect = container.getBoundingClientRect();
      const nodeWidth = nodeElement.offsetWidth || 220;
      const nodeHeight = nodeElement.offsetHeight || 120;

      const pointerX = (event.clientX - containerRect.left) / zoom;
      const pointerY = (event.clientY - containerRect.top) / zoom;

      let nextX = pointerX - dragState.offsetX;
      let nextY = pointerY - dragState.offsetY;

      const expansionAllowance = 360;
      const maxX = Math.max(0, canvasWidth - nodeWidth + expansionAllowance);
      const maxY = Math.max(0, canvasHeight - nodeHeight + expansionAllowance);
      nextX = Math.max(0, Math.min(nextX, maxX));
      nextY = Math.max(0, Math.min(nextY, maxY));

      // Direct DOM positioning — avoids React re-render of 30+ nodes per frame
      nodeElement.style.left = `${nextX}px`;
      nodeElement.style.top = `${nextY}px`;
      dragState._lastX = nextX;
      dragState._lastY = nextY;
    };

    const handlePointerUp = (event) => {
      if (
        dragState.pointerId !== null &&
        event?.pointerId !== undefined &&
        event.pointerId !== dragState.pointerId
      ) {
        return;
      }

      // Commit final position to React state (triggers single re-render + connection recalc)
      if (dragState._lastX !== undefined && dragState._lastY !== undefined) {
        onNodePositionChange?.(dragState.id, { x: dragState._lastX, y: dragState._lastY });
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    canvasHeight,
    canvasWidth,
    dragState,
    draggable,
    onNodePositionChange,
    zoom,
  ]);

  React.useEffect(() => {
    if (!linkDrag) return;

    const handlePointerMove = (event) => {
      if (
        linkDrag.pointerId !== null &&
        event.pointerId !== undefined &&
        event.pointerId !== linkDrag.pointerId
      ) {
        return;
      }

      const pointer = getPointerOnCanvas(event.clientX, event.clientY);
      setLinkDrag((previous) =>
        previous
          ? {
              ...previous,
              endX: pointer.x,
              endY: pointer.y,
            }
          : previous,
      );
    };

    const handlePointerUp = (event) => {
      if (
        linkDrag.pointerId !== null &&
        event?.pointerId !== undefined &&
        event.pointerId !== linkDrag.pointerId
      ) {
        return;
      }

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const targetNode = target?.closest?.('[data-bpmn-node="true"]');
      let toNodeId = targetNode?.getAttribute?.('data-node-id') || '';

      if (!toNodeId) {
        const droppedInsideNodeEntry = Object.entries(nodeRefs.current).find(
          ([, element]) => {
            const rect = element?.getBoundingClientRect?.();
            if (!rect) return false;

            return (
              event.clientX >= rect.left &&
              event.clientX <= rect.right &&
              event.clientY >= rect.top &&
              event.clientY <= rect.bottom
            );
          },
        );

        toNodeId = droppedInsideNodeEntry?.[0] || '';
      }

      const targetHandleElement = target?.closest?.('[data-connector-handle]');

      let toHandle = targetHandleElement?.getAttribute?.(
        'data-connector-handle',
      );

      if (!toHandle && toNodeId) {
        const toNode = nodes.find((node) => node.id === toNodeId);
        if (toNode) {
          const pointer = getPointerOnCanvas(event.clientX, event.clientY);
          const handles = ['left', 'right', 'top', 'bottom'];

          toHandle = handles.reduce((closestHandle, handle) => {
            const point = getHandlePoint(toNode, handle);
            const dx = point.x - pointer.x;
            const dy = point.y - pointer.y;
            const distance = dx * dx + dy * dy;

            if (!closestHandle || distance < closestHandle.distance) {
              return { handle, distance };
            }

            return closestHandle;
          }, null)?.handle;
        }
      }

      if (!toHandle) {
        toHandle = 'left';
      }

      if (toNodeId && toNodeId !== linkDrag.fromId) {
        onCreateConnection?.(
          linkDrag.fromId,
          toNodeId,
          linkDrag.fromHandle,
          toHandle,
          {
            clientX: event.clientX,
            clientY: event.clientY,
          },
        );
      } else if (!toNodeId) {
        onCreateNodeFromConnection?.({
          fromId: linkDrag.fromId,
          fromHandle: linkDrag.fromHandle,
          pointer: {
            x: linkDrag.endX,
            y: linkDrag.endY,
          },
        });
      }

      ignoreNextNodeClickRef.current = true;

      setLinkDrag(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    getPointerOnCanvas,
    linkDrag,
    nodes,
    onCreateConnection,
    onCreateNodeFromConnection,
  ]);

  const activeNodeIds = React.useMemo(
    () => nodes.filter(isNodeActive).map((node) => node.id),
    [nodes],
  );

  const totalConnectionCountByNode = React.useMemo(() => {
    const countMap = {};

    connections.forEach((connection) => {
      countMap[connection.from] = (countMap[connection.from] || 0) + 1;
      countMap[connection.to] = (countMap[connection.to] || 0) + 1;
    });

    return countMap;
  }, [connections]);

  const activeIndexById = React.useMemo(
    () =>
      activeNodeIds.reduce((acc, id, index) => {
        acc[id] = index;
        return acc;
      }, {}),
    [activeNodeIds],
  );

  return (
    <div
      className={styles.flowWrap}
      ref={flowWrapRef}
      onClickCapture={(event) => {
        if (!ignoreNextNodeClickRef.current) return;
        ignoreNextNodeClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <svg className={styles.connectionCanvas} aria-hidden="true">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon points="0 0, 10 4, 0 8" fill="#999" />
          </marker>
          <marker
            id="arrowhead-sim"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon points="0 0, 10 4, 0 8" fill="#4caf50" />
          </marker>
          <marker
            id="arrowhead-nao"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon points="0 0, 10 4, 0 8" fill="#f44336" />
          </marker>
        </defs>
        {connectionLines.map((line) => {
          const isSelected = selectedConnectionId === line.id;
          const pointsStr = line.pointsStr;

          const decisionLabel =
            line.decision === 'sim'
              ? 'Sim'
              : line.decision === 'nao'
                ? 'Não'
                : null;

          let labelPos = null;
          if (decisionLabel) {
            const pts = pointsStr.split(' ').map((s) => {
              const [px, py] = s.split(',').map(Number);
              return { x: px, y: py };
            });
            if (pts.length >= 2) {
              labelPos = {
                x: (pts[0].x + pts[1].x) / 2,
                y: (pts[0].y + pts[1].y) / 2,
              };
            }
          }

          return (
            <g key={line.id} className={styles.connectionGroup}>
              <polyline
                points={pointsStr}
                className={`${styles.connectionLine} ${
                  isSelected ? styles.connectionLineSelected : ''
                } ${
                  line.decision === 'sim' ? styles.connectionLineSim : ''
                } ${
                  line.decision === 'nao' || line.decision === 'merge' ? styles.connectionLineNao : ''
                }`}
                vectorEffect="non-scaling-stroke"
                markerEnd={
                  line.decision === 'sim'
                    ? 'url(#arrowhead-sim)'
                    : line.decision === 'nao' || line.decision === 'merge'
                      ? 'url(#arrowhead-nao)'
                      : 'url(#arrowhead)'
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectConnection?.(line.id);
                }}
              />
              <circle
                cx={line.x1}
                cy={line.y1}
                r={5}
                className={styles.connectionDeleteDot}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveConnection?.(line.id);
                }}
              />
              <circle
                cx={line.x2}
                cy={line.y2}
                r={5}
                className={styles.connectionDeleteDot}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveConnection?.(line.id);
                }}
              />
              {decisionLabel && labelPos ? (
                <text
                  x={labelPos.x}
                  y={labelPos.y - 8}
                  className={`${styles.connectionDecisionLabel} ${
                    line.decision === 'sim'
                      ? styles.connectionDecisionYes
                      : styles.connectionDecisionNo
                  }`}
                  textAnchor="middle"
                >
                  {decisionLabel}
                </text>
              ) : null}
            </g>
          );
        })}
        {linkDrag ? (
          <polyline
            points={getOrthogonalPolylinePoints(
              linkDrag.startX,
              linkDrag.startY,
              linkDrag.endX,
              linkDrag.endY,
              linkDrag.fromHandle,
            )}
            className={styles.connectionLineDraft}
            vectorEffect="non-scaling-stroke"
            markerEnd="url(#arrowhead)"
          />
        ) : null}
      </svg>

      <div
        className={`${styles.flow} ${draggable ? styles.canvasMode : ''}`}
        data-tutorial-id="canvas-grid"
        style={
          draggable
            ? { width: `${canvasWidth}px`, height: `${canvasHeight}px` }
            : undefined
        }
      >
        {nodes.map((node) => {
          const label = getNodeLabel(node);
          const active = isNodeActive(node);
          const textScale = zoom < 1 ? Math.max(0.82, zoom) : 1;
          const activeIndex = activeIndexById[node.id];
          const isDone =
            typeof activeIndex === 'number' && activeIndex < currentIndex;
          const isCurrent =
            typeof activeIndex === 'number' && activeIndex === currentIndex;
          const isSelected = selectedNodeId === node.id;
          const isPrimaryEntityNode =
            node.nodeType !== 'task' &&
            node.nodeType !== 'condicional' &&
            node.isPrimaryEntity === true;
          const nodeConnectionCount = totalConnectionCountByNode[node.id] || 0;
          const nodeTypeLabel =
            node.nodeType === 'task'
              ? 'Atividade'
              : node.nodeType === 'condicional'
                ? 'Decisão'
                : 'Entidade';
          const isConditionalNode = node.nodeType === 'condicional';
          const connectionBandLabel =
            nodeConnectionCount > 0
              ? `Tipo da etapa: ${nodeTypeLabel}`
              : 'Sem ligação';
          const connectionBandClass =
            nodeConnectionCount === 0
              ? styles.connectionBandDisconnected
              : node.nodeType === 'task'
                ? styles.connectionBandTask
                : node.nodeType === 'condicional'
                  ? styles.connectionBandDecision
                  : styles.connectionBandData;
          const nodeInfo = getNodeInfo(node);
          const displayInfo = isConditionalNode
            ? `Decisão Exclusiva (XOR)${nodeInfo ? ` • ${nodeInfo}` : ''}`
            : nodeInfo;

          return (
            <div
              key={node.id}
              data-tutorial-id="canvas-rectangle"
              data-bpmn-node="true"
              data-node-id={node.id}
              ref={(element) => {
                if (!element) {
                  delete nodeRefs.current[node.id];
                  return;
                }
                nodeRefs.current[node.id] = element;
              }}
              className={`${styles.stageCard} ${isDone ? styles.done : ''} ${
                isCurrent ? styles.current : ''
              } ${!active ? styles.inactive : ''} ${
                isSelected ? styles.selected : ''
              } ${
                invalidNodeId && String(invalidNodeId) === String(node.id)
                  ? styles.invalid
                  : ''
              }`}
              style={
                draggable
                  ? {
                      left: `${node.x || 0}px`,
                      top: `${node.y || 0}px`,
                      '--node-text-scale': textScale,
                      touchAction: disableNodeDrag ? undefined : 'none',
                    }
                  : {
                      '--node-text-scale': textScale,
                    }
              }
              onClick={(event) => {
                if (ignoreNextNodeClickRef.current) {
                  ignoreNextNodeClickRef.current = false;
                  return;
                }

                if (touchConnectionDraft) {
                  if (touchConnectionDraft.fromId !== node.id) {
                    onCreateConnection?.(
                      touchConnectionDraft.fromId,
                      node.id,
                      touchConnectionDraft.fromHandle,
                      'left',
                      {
                        clientX: event.clientX,
                        clientY: event.clientY,
                      },
                    );
                    ignoreNextNodeClickRef.current = true;
                  }

                  setTouchConnectionDraft(null);
                  return;
                }

                // On touch device, tap already-selected node → enter connection mode
                if (isCoarsePointer && connectorsEnabled && isSelected && !disabled) {
                  const handle = getClosestSideHandle(
                    node.id,
                    event.clientX,
                    event.clientY,
                  );
                  setTouchConnectionDraft({ fromId: node.id, fromHandle: handle });
                  return;
                }

                onSelectConnection?.('');
                onSelectNode?.(node.id);
                if (!active || typeof activeIndex !== 'number') return;
                onStageChange?.(activeIndex);
              }}
              onPointerDown={(event) => {
                if (!draggable || disabled) return;
                if (touchConnectionDraft) return;
                if (!isPrimaryPointerButton(event)) return;
                const targetTag = event.target?.tagName?.toLowerCase();
                if (
                  targetTag === 'button' ||
                  targetTag === 'input' ||
                  targetTag === 'select'
                ) {
                  return;
                }
                const element = nodeRefs.current[node.id];
                if (!element) return;

                // Edge detection: if pointer is near the edge, start connection drag
                if (connectorsEnabled) {
                  const rect = element.getBoundingClientRect();
                  const EDGE_THRESHOLD = isCoarsePointer ? 28 : 18;
                  const distRight = rect.right - event.clientX;
                  const distLeft = event.clientX - rect.left;
                  const distTop = event.clientY - rect.top;
                  const distBottom = rect.bottom - event.clientY;

                  const minDist = Math.min(distRight, distLeft, distTop, distBottom);
                  if (minDist < EDGE_THRESHOLD) {
                    const handle =
                      minDist === distRight ? 'right'
                        : minDist === distLeft ? 'left'
                          : minDist === distTop ? 'top'
                            : 'bottom';
                    startConnectorDrag(event, node.id, handle);
                    return;
                  }
                }

                if (disableNodeDrag) return;

                const container = flowWrapRef.current;
                const containerRect = container?.getBoundingClientRect();
                const pointerX =
                  (event.clientX - (containerRect?.left || 0)) / zoom || 0;
                const pointerY =
                  (event.clientY - (containerRect?.top || 0)) / zoom || 0;
                setDragState({
                  id: node.id,
                  offsetX: pointerX - (node.x || 0),
                  offsetY: pointerY - (node.y || 0),
                  pointerId: event.pointerId ?? null,
                });
                if (
                  event.pointerId !== undefined &&
                  typeof element.setPointerCapture === 'function'
                ) {
                  try {
                    element.setPointerCapture(event.pointerId);
                  } catch {
                    // no-op
                  }
                }
                onSelectNode?.(node.id);
                event.preventDefault();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectNode?.(node.id);
                  if (!active || typeof activeIndex !== 'number') return;
                  onStageChange?.(activeIndex);
                }
              }}
            >
              <div className={styles.cardHeader}>
                <span
                  data-tutorial-id="canvas-color-band"
                  className={`${styles.connectionBand} ${connectionBandClass}`}
                  aria-label={connectionBandLabel}
                  title={connectionBandLabel}
                />
                {isSelected ? (
                  <span className={styles.stageSelectedBadge}>
                    {nodeTypeLabel}
                  </span>
                ) : null}
                {isPrimaryEntityNode ? (
                  <span className={styles.stagePrimaryBadge}>Primária</span>
                ) : null}
                <button
                  type="button"
                  className={styles.stageDeleteButton}
                  aria-label="Excluir retângulo"
                  title="Excluir retângulo"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveNode?.(node.id);
                  }}
                >
                  ✕
                </button>
              </div>
              <div className={styles.cardBody}>
                {editingNodeId === node.id ? (
                  <input
                    ref={editInputRef}
                    className={styles.stageLabelInput}
                    name="nodeLabel"
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    onBlur={() => {
                      const trimmed = editingValue.trim();
                      if (trimmed && trimmed !== label) {
                        onNodeLabelChange?.(node.id, trimmed);
                      }
                      setEditingNodeId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.target.blur();
                      }
                      if (event.key === 'Escape') {
                        setEditingNodeId(null);
                      }
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <strong
                    className={styles.stageLabel}
                    onDoubleClick={(event) => {
                      if (disabled) return;
                      event.stopPropagation();
                      setEditingNodeId(node.id);
                      setEditingValue(label);
                    }}
                    onTouchStart={() => {
                      if (disabled) return;
                      longPressTimerRef.current = setTimeout(() => {
                        setEditingNodeId(node.id);
                        setEditingValue(label);
                        longPressTimerRef.current = null;
                      }, 500);
                    }}
                    onTouchEnd={() => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                    onTouchMove={() => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                  >
                    {label}
                  </strong>
                )}
                {getNodeDescricao(node) && getNodeDescricao(node) !== label ? (
                  <span className={styles.stageDescricao}>
                    {getNodeDescricao(node)}
                  </span>
                ) : null}
                {displayInfo ? (
                  <span className={styles.stageInfo}>{displayInfo}</span>
                ) : null}
              </div>
              {connectorsEnabled && !disabled ? (
                <>
                  {['left', 'right', 'top', 'bottom'].map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      data-connector-handle={handle}
                      className={`${styles.connectorDot} ${styles[`connectorDot_${handle}`]}`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startConnectorDrag(event, node.id, handle);
                      }}
                    />
                  ))}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(BpmnFlow);
