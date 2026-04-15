import React, { useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { convertJsonToBpmnXml, fromBpmnBounds } from '../../Utils/jsonToBpmnXml';
import styles from './BpmnCanvas.module.css';

/* ------------------------------------------------------------------ */
/*  Custom module: hide the palette completely                        */
/* ------------------------------------------------------------------ */
function NoPaletteProvider(palette) {
  palette.registerProvider(600, { getPaletteEntries: () => ({}) });
}
NoPaletteProvider.$inject = ['palette'];

const NoPaletteModule = {
  __init__: ['noPaletteProvider'],
  noPaletteProvider: ['type', NoPaletteProvider],
};

/* ------------------------------------------------------------------ */
/*  BpmnCanvas — wraps bpmn-js Modeler inside a React component       */
/* ------------------------------------------------------------------ */
const BpmnCanvas = forwardRef(function BpmnCanvas(
  {
    nodes = [],
    connections = [],
    onSelectNode,
    onRemoveNode,
    selectedNodeId,
    onNodePositionChange,
    onCreateConnection,
    onRemoveConnection,
    onSelectConnection,
    selectedConnectionId,
    onNodeLabelChange,
    canvasWidth = 4000,
    canvasHeight = 2400,
    disabled = false,
    // The following props are accepted for API compat but not used by bpmn-js:
    // currentIndex, onStageChange, onToggleNodeActive, draggable, zoom,
    // disableNodeDrag, onCreateNodeFromConnection, invalidNodeId,
    // connectorsEnabled, connectorRevealMode
  },
  ref,
) {
  const containerRef     = useRef(null);
  const modelerRef       = useRef(null);
  const prevNodeIdsRef   = useRef('');
  const isImportingRef   = useRef(false);
  const suppressSelRef   = useRef(false);

  // Keep latest callbacks in a ref so event handlers always see fresh values
  const cb = useRef({});
  cb.current = {
    onSelectNode,
    onRemoveNode,
    onNodePositionChange,
    onCreateConnection,
    onRemoveConnection,
    onSelectConnection,
    onNodeLabelChange,
  };

  // Build a nodeId→nodeType map for coordinate back-conversion
  const nodeTypeMap = useMemo(() => {
    const m = {};
    for (const n of nodes) m[String(n.id)] = n.nodeType || 'task';
    return m;
  }, [nodes]);
  const nodeTypeMapRef = useRef(nodeTypeMap);
  nodeTypeMapRef.current = nodeTypeMap;

  /* -------- expose imperative helpers to parent -------- */
  useImperativeHandle(ref, () => ({
    zoomIn() {
      const c = modelerRef.current?.get('canvas');
      if (c) c.zoom(c.zoom() * 1.15);
    },
    zoomOut() {
      const c = modelerRef.current?.get('canvas');
      if (c) c.zoom(c.zoom() / 1.15);
    },
    fitViewport() {
      const c = modelerRef.current?.get('canvas');
      if (c) c.zoom('fit-viewport');
    },
    getModeler() {
      return modelerRef.current;
    },
  }));

  /* -------- initialise modeler on mount -------- */
  useEffect(() => {
    if (!containerRef.current) return;

    const modeler = new BpmnModeler({
      container: containerRef.current,
      additionalModules: [NoPaletteModule],
      keyboard: { bindTo: document },
    });
    modelerRef.current = modeler;

    const eventBus = modeler.get('eventBus');

    /* — selection change — */
    eventBus.on('selection.changed', (e) => {
      if (isImportingRef.current || suppressSelRef.current) {
        suppressSelRef.current = false;
        return;
      }
      const el = e.newSelection?.[0];
      if (!el) {
        cb.current.onSelectNode?.(null);
        cb.current.onSelectConnection?.(null);
        return;
      }
      // Connections have waypoints; shapes do not
      if (el.waypoints) {
        cb.current.onSelectConnection?.(el.id);
      } else {
        cb.current.onSelectNode?.(el.id);
      }
    });

    /* — shape moved — */
    eventBus.on('shape.move.end', (e) => {
      if (isImportingRef.current) return;
      const shape = e.shape;
      if (!shape?.id) return;
      const ntype = nodeTypeMapRef.current[shape.id];
      if (!ntype) return;
      const cardPos = fromBpmnBounds(shape.x, shape.y, ntype);
      cb.current.onNodePositionChange?.(shape.id, cardPos);
    });

    /* — element removed — */
    eventBus.on('shape.removed', (e) => {
      if (isImportingRef.current) return;
      const id = e.element?.id;
      if (id) cb.current.onRemoveNode?.(id);
    });

    eventBus.on('connection.removed', (e) => {
      if (isImportingRef.current) return;
      const id = e.element?.id;
      if (id) cb.current.onRemoveConnection?.(id);
    });

    /* — connection added (user draws a new connection) — */
    eventBus.on('connection.added', (e) => {
      if (isImportingRef.current) return;
      const conn = e.element;
      if (!conn?.source || !conn?.target) return;
      // derive handle from first/last waypoint relative to element
      const fromHandle = deriveHandle(conn.source, conn.waypoints?.[0]);
      const toHandle   = deriveHandle(conn.target, conn.waypoints?.at(-1));
      cb.current.onCreateConnection?.(
        conn.source.id,
        conn.target.id,
        fromHandle,
        toHandle,
        { clientX: 0, clientY: 0 },
      );
    });

    /* — label editing complete — */
    eventBus.on('directEditing.complete', (e) => {
      if (isImportingRef.current) return;
      try {
        const sel = modeler.get('selection').get();
        const el = sel?.[0];
        if (el?.businessObject?.name != null) {
          cb.current.onNodeLabelChange?.(el.id, el.businessObject.name);
        }
      } catch { /* modeler not ready */ }
    });

    return () => {
      modeler.destroy();
      modelerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- import XML when node structure changes -------- */
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || !nodes.length) return;

    const currentIds = nodes.map(n => String(n.id)).sort().join(',');
    if (currentIds === prevNodeIdsRef.current) return;
    prevNodeIdsRef.current = currentIds;

    const xml = convertJsonToBpmnXml(nodes, connections);
    if (!xml) return;

    isImportingRef.current = true;
    modeler
      .importXML(xml)
      .then(({ warnings }) => {
        if (warnings?.length) console.warn('[BpmnCanvas] import warnings:', warnings);

        // Fit viewport after import
        const canvas = modeler.get('canvas');
        canvas.zoom('fit-viewport');
      })
      .catch((err) => {
        console.error('[BpmnCanvas] import failed:', err);
      })
      .finally(() => {
        isImportingRef.current = false;
      });
  }, [nodes, connections]);

  /* -------- sync external selection into bpmn-js -------- */
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || isImportingRef.current) return;

    try {
      const selection      = modeler.get('selection');
      const elementRegistry = modeler.get('elementRegistry');

      const targetId = selectedNodeId || selectedConnectionId;
      if (!targetId) {
        selection.select([]);
        return;
      }

      const element = elementRegistry.get(targetId);
      if (element) {
        suppressSelRef.current = true;
        selection.select(element);
      }
    } catch { /* modeler not ready yet */ }
  }, [selectedNodeId, selectedConnectionId]);

  return (
    <div
      ref={containerRef}
      className={styles.bpmnContainer}
      style={{ width: canvasWidth, height: canvasHeight }}
    />
  );
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Derive a handle direction ("top"|"bottom"|"left"|"right") from
 * a bpmn-js waypoint relative to the shape's centre.
 */
function deriveHandle(shape, waypoint) {
  if (!shape || !waypoint) return 'right';
  const cx = shape.x + (shape.width  || 0) / 2;
  const cy = shape.y + (shape.height || 0) / 2;
  const dx = waypoint.x - cx;
  const dy = waypoint.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'bottom' : 'top';
}

export default BpmnCanvas;
