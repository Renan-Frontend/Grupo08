import React from 'react';
import styles from './BpmnFlow.module.css';

const getNodeLabel = (node) => node?.label || 'Etapa';
const getNodeSubtitle = (node) => node?.subtitle || '';
const getNodeInfo = (node) => node?.info || '';
const isNodeActive = (node) => node?.active !== false;
const CARD_WIDTH = 220;
const CARD_HEIGHT = 110;
const isPrimaryPointerButton = (event) =>
  event.button === undefined || event.button === 0;

const getOrthogonalPolylinePoints = (x1, y1, x2, y2, fromHandle = 'right') => {
  const usesVerticalFirst = fromHandle === 'top' || fromHandle === 'bottom';
  const elbowX = usesVerticalFirst ? x1 : x2;
  const elbowY = usesVerticalFirst ? y2 : y1;
  return `${x1},${y1} ${elbowX},${elbowY} ${x2},${y2}`;
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
) => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const offset = 1;

  if (handle === 'right') {
    return {
      x: (nodeRect.right - containerRect.left) / safeZoom + offset,
      y: (nodeRect.top + nodeRect.height / 2 - containerRect.top) / safeZoom,
    };
  }

  if (handle === 'top') {
    return {
      x: (nodeRect.left + nodeRect.width / 2 - containerRect.left) / safeZoom,
      y: (nodeRect.top - containerRect.top) / safeZoom - offset,
    };
  }

  if (handle === 'bottom') {
    return {
      x: (nodeRect.left + nodeRect.width / 2 - containerRect.left) / safeZoom,
      y: (nodeRect.bottom - containerRect.top) / safeZoom + offset,
    };
  }

  return {
    x: (nodeRect.left - containerRect.left) / safeZoom - offset,
    y: (nodeRect.top + nodeRect.height / 2 - containerRect.top) / safeZoom,
  };
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
  connectorRevealMode = 'always',
}) => {
  const flowWrapRef = React.useRef(null);
  const nodeRefs = React.useRef({});
  const [connectionLines, setConnectionLines] = React.useState([]);
  const [dragState, setDragState] = React.useState(null);
  const [linkDrag, setLinkDrag] = React.useState(null);
  const [hoveredConnector, setHoveredConnector] = React.useState(null);
  const ignoreNextNodeClickRef = React.useRef(false);

  const getConnectionByHandle = React.useCallback(
    (nodeId, handle) =>
      connections.find(
        (connection) =>
          (connection.from === nodeId &&
            (connection.fromHandle || 'right') === handle) ||
          (connection.to === nodeId &&
            (connection.toHandle || 'left') === handle),
      ) || null,
    [connections],
  );

  const hasConnectionAtHandle = React.useCallback(
    (nodeId, handle) => Boolean(getConnectionByHandle(nodeId, handle)),
    [getConnectionByHandle],
  );

  const hasOutgoingConnectionAtHandle = React.useCallback(
    (nodeId, handle) =>
      connections.some(
        (connection) =>
          connection.from === nodeId &&
          (connection.fromHandle || 'right') === handle,
      ),
    [connections],
  );

  const outgoingDecisionByConnectionId = React.useMemo(() => {
    const map = {};
    const groupedByNode = {};
    const conditionalNodeIdSet = new Set(
      nodes
        .filter((node) => node?.nodeType === 'condicional')
        .map((node) => node.id),
    );

    connections.forEach((connection) => {
      const normalizedDecision = String(connection.decision || '').trim();
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
        (connection) => !String(connection.decision || '').trim(),
      );

      if (undecided[0]) map[undecided[0].id] = 'sim';
      if (undecided[1]) map[undecided[1].id] = 'nao';
    });

    return map;
  }, [connections, nodes]);

  const getOutgoingDecisionAtHandle = React.useCallback(
    (nodeId, handle) => {
      const linkedConnection = connections.find(
        (connection) =>
          connection.from === nodeId &&
          (connection.fromHandle || 'right') === handle,
      );

      if (!linkedConnection) return null;
      const sourceNode = nodes.find((node) => node.id === nodeId) || null;
      if (sourceNode?.nodeType !== 'condicional') return null;
      return outgoingDecisionByConnectionId[linkedConnection.id] || null;
    },
    [connections, nodes, outgoingDecisionByConnectionId],
  );

  const getDecisionClass = React.useCallback(
    (nodeId, handle) => {
      const decision = getOutgoingDecisionAtHandle(nodeId, handle);
      if (decision === 'sim') return styles.connectorYes;
      if (decision === 'nao') return styles.connectorNo;
      return '';
    },
    [getOutgoingDecisionAtHandle],
  );

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

  const isConnectorVisible = React.useCallback(
    (nodeId) => {
      if (!connectorsEnabled) return false;
      return selectedNodeId === nodeId;
    },
    [connectorsEnabled, selectedNodeId],
  );

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

  const handleConnectorPointerDown = React.useCallback(
    (event, nodeId, handle) => {
      if (!connectorsEnabled) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      const linkedConnection = getConnectionByHandle(nodeId, handle);
      if (linkedConnection) {
        event.stopPropagation();
        event.preventDefault();
        onSelectConnection?.(linkedConnection.id);
        return;
      }

      startConnectorDrag(event, nodeId, handle);
    },
    [
      connectorsEnabled,
      getConnectionByHandle,
      onSelectConnection,
      startConnectorDrag,
    ],
  );

  const handleConnectorClick = React.useCallback(
    (event, nodeId, handle) => {
      event.stopPropagation();
      event.preventDefault();

      const linkedConnection = getConnectionByHandle(nodeId, handle);
      if (!linkedConnection) return;

      onSelectConnection?.(linkedConnection.id);
      onRemoveConnection?.(linkedConnection.id);
    },
    [getConnectionByHandle, onRemoveConnection, onSelectConnection],
  );

  React.useEffect(() => {
    if (!connectorsEnabled && linkDrag) {
      setLinkDrag(null);
    }
  }, [connectorsEnabled, linkDrag]);

  React.useEffect(() => {
    if (connectorRevealMode !== 'hover-side' || !connectorsEnabled) {
      setHoveredConnector(null);
    }
  }, [connectorRevealMode, connectorsEnabled]);

  const recalculateConnectionLines = React.useCallback(() => {
    const container = flowWrapRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const lines = connections
      .map((connection) => {
        const fromElement = nodeRefs.current[connection.from];
        const toElement = nodeRefs.current[connection.to];
        if (!fromElement || !toElement) return null;

        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();
        const fromHandle = connection.fromHandle || 'right';
        const toHandle = connection.toHandle || 'left';

        const source = getHandlePointFromRect(
          fromRect,
          containerRect,
          fromHandle,
          zoom,
        );
        const target = getHandlePointFromRect(
          toRect,
          containerRect,
          toHandle,
          zoom,
        );

        return {
          id: connection.id,
          x1: source.x,
          y1: source.y,
          x2: target.x,
          y2: target.y,
          fromHandle,
        };
      })
      .filter(Boolean);

    setConnectionLines(lines);
  }, [connections, zoom]);

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

      onNodePositionChange?.(dragState.id, { x: nextX, y: nextY });
    };

    const handlePointerUp = (event) => {
      if (
        dragState.pointerId !== null &&
        event?.pointerId !== undefined &&
        event.pointerId !== dragState.pointerId
      ) {
        return;
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
        {connectionLines.map((line) => {
          const isSelected = selectedConnectionId === line.id;

          return (
            <polyline
              key={line.id}
              points={getOrthogonalPolylinePoints(
                line.x1,
                line.y1,
                line.x2,
                line.y2,
                line.fromHandle,
              )}
              className={`${styles.connectionLine} ${
                isSelected ? styles.connectionLineSelected : ''
              }`}
              vectorEffect="non-scaling-stroke"
              onClick={(event) => {
                event.stopPropagation();
                onSelectConnection?.(line.id);
              }}
            />
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
          const connectorScale = zoom < 1 ? Math.max(0.9, zoom) : 1;
          const connectorSize = 14 * connectorScale;
          const connectorHalf = connectorSize / 2;
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
                : 'Dados';
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
                      '--connector-size': `${connectorSize}px`,
                      '--connector-half': `${connectorHalf}px`,
                    }
                  : {
                      '--node-text-scale': textScale,
                      '--connector-size': `${connectorSize}px`,
                      '--connector-half': `${connectorHalf}px`,
                    }
              }
              onClick={() => {
                if (ignoreNextNodeClickRef.current) {
                  ignoreNextNodeClickRef.current = false;
                  return;
                }
                onSelectConnection?.('');
                onSelectNode?.(node.id);
                if (!active || typeof activeIndex !== 'number') return;
                onStageChange?.(activeIndex);
              }}
              onPointerDown={(event) => {
                if (!draggable || disabled || disableNodeDrag) return;
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
                const container = flowWrapRef.current;
                if (!element) return;
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
              onPointerMove={(event) => {
                if (
                  !connectorsEnabled ||
                  connectorRevealMode !== 'hover-side' ||
                  event.pointerType === 'touch'
                ) {
                  return;
                }

                const handle = getClosestSideHandle(
                  node.id,
                  event.clientX,
                  event.clientY,
                );
                setHoveredConnector((previous) => {
                  if (
                    previous?.nodeId === node.id &&
                    previous?.handle === handle
                  ) {
                    return previous;
                  }

                  return { nodeId: node.id, handle };
                });
              }}
              onPointerLeave={(event) => {
                if (connectorRevealMode !== 'hover-side') return;
                setHoveredConnector((previous) => {
                  const nextTarget = event?.relatedTarget;
                  const movingToOwnConnector = nextTarget?.closest?.(
                    `[data-connector-handle][data-node-id="${node.id}"]`,
                  );

                  if (movingToOwnConnector) {
                    return previous;
                  }

                  return previous?.nodeId === node.id ? null : previous;
                });
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
              {connectorsEnabled ? (
                <>
                  <button
                    type="button"
                    className={`${styles.connectorIn} ${
                      hasConnectionAtHandle(node.id, 'left')
                        ? styles.connectorLinked
                        : ''
                    } ${getDecisionClass(node.id, 'left')} ${
                      isConnectorVisible(node.id, 'left')
                        ? styles.connectorVisible
                        : styles.connectorHidden
                    }`}
                    aria-label="Ponto de entrada"
                    data-node-id={node.id}
                    data-connector-handle="left"
                    onPointerEnter={() =>
                      setHoveredConnector({ nodeId: node.id, handle: 'left' })
                    }
                    onPointerDown={(event) =>
                      handleConnectorPointerDown(event, node.id, 'left')
                    }
                    onClick={(event) =>
                      handleConnectorClick(event, node.id, 'left')
                    }
                  />

                  <button
                    type="button"
                    className={`${styles.connectorOut} ${
                      hasConnectionAtHandle(node.id, 'right')
                        ? styles.connectorLinked
                        : ''
                    } ${getDecisionClass(node.id, 'right')} ${
                      isConnectorVisible(node.id, 'right')
                        ? styles.connectorVisible
                        : styles.connectorHidden
                    }`}
                    aria-label="Puxar conexão"
                    data-node-id={node.id}
                    data-connector-handle="right"
                    onPointerEnter={() =>
                      setHoveredConnector({ nodeId: node.id, handle: 'right' })
                    }
                    onPointerDown={(event) =>
                      handleConnectorPointerDown(event, node.id, 'right')
                    }
                    onClick={(event) =>
                      handleConnectorClick(event, node.id, 'right')
                    }
                  />

                  <button
                    type="button"
                    className={`${styles.connectorTop} ${
                      hasConnectionAtHandle(node.id, 'top')
                        ? styles.connectorLinked
                        : ''
                    } ${getDecisionClass(node.id, 'top')} ${
                      isConnectorVisible(node.id, 'top')
                        ? styles.connectorVisible
                        : styles.connectorHidden
                    }`}
                    aria-label="Puxar conexão para cima"
                    data-node-id={node.id}
                    data-connector-handle="top"
                    onPointerEnter={() =>
                      setHoveredConnector({ nodeId: node.id, handle: 'top' })
                    }
                    onPointerDown={(event) =>
                      handleConnectorPointerDown(event, node.id, 'top')
                    }
                    onClick={(event) =>
                      handleConnectorClick(event, node.id, 'top')
                    }
                  />

                  <button
                    type="button"
                    className={`${styles.connectorBottom} ${
                      hasConnectionAtHandle(node.id, 'bottom')
                        ? styles.connectorLinked
                        : ''
                    } ${getDecisionClass(node.id, 'bottom')} ${
                      isConnectorVisible(node.id, 'bottom')
                        ? styles.connectorVisible
                        : styles.connectorHidden
                    }`}
                    aria-label="Puxar conexão para baixo"
                    data-node-id={node.id}
                    data-connector-handle="bottom"
                    onPointerEnter={() =>
                      setHoveredConnector({ nodeId: node.id, handle: 'bottom' })
                    }
                    onPointerDown={(event) =>
                      handleConnectorPointerDown(event, node.id, 'bottom')
                    }
                    onClick={(event) =>
                      handleConnectorClick(event, node.id, 'bottom')
                    }
                  />
                </>
              ) : null}

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
                <strong className={styles.stageLabel}>{label}</strong>
                {getNodeSubtitle(node) ? (
                  <span className={styles.stageSubtitle}>
                    {getNodeSubtitle(node)}
                  </span>
                ) : null}
                {displayInfo ? (
                  <span className={styles.stageInfo}>{displayInfo}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BpmnFlow;
