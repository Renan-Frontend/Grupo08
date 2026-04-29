import React, { useState, useEffect } from "react";
import Close from "../../Helper/Close";
import styles from "./EditablePipeline.module.css";

const compactLabel = (value, maxLength = 26) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
};

const normalizeLabelKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const normalizeDecisionValue = (value) => {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (["sim", "yes", "y", "true", "1", "✔", "ok"].includes(normalized)) {
    return "sim";
  }
  if (
    ["nao", "nao", "não", "no", "n", "false", "0", "✘", "x"].includes(
      normalized,
    )
  ) {
    return "nao";
  }
  if (normalized === "merge") return "merge";
  return normalized;
};

const getConnectionDecision = (connection) => {
  const explicit = normalizeDecisionValue(connection?.decision);
  if (explicit) return explicit;

  const label = normalizeDecisionValue(connection?.label);
  if (label) return label;

  return "";
};

const getStageTypeLabel = (stageType) => {
  const normalized = String(stageType || "")
    .trim()
    .toLowerCase();
  if (normalized === "task") return "Atividade";
  if (normalized === "condicional") return "Condição";
  return "Entidade";
};

const PipelineCircleIcon = () => (
  <span
    style={{
      verticalAlign: "middle",
      display: "inline-flex",
      lineHeight: 0,
      margin: 0,
    }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7.5" fill="#e0e0e0" />
      <circle cx="8" cy="8" r="5.6" fill="#fff" />
      <circle
        cx="8"
        cy="8"
        r="3.6"
        fill="#b7dfcb"
        stroke="#2fb36d"
        strokeWidth="1.2"
      />
    </svg>
  </span>
);

const PipelineAddButtonIcon = () => (
  <span
    style={{
      verticalAlign: "middle",
      display: "inline-flex",
      lineHeight: 0,
      margin: 0,
    }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7.5" fill="#2fb36d" />
      <line
        x1="8"
        y1="4.6"
        x2="8"
        y2="11.4"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="4.6"
        y1="8"
        x2="11.4"
        y2="8"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  </span>
);

const PipelineRemoveButtonIcon = () => (
  <span
    style={{
      verticalAlign: "middle",
      display: "inline-flex",
      lineHeight: 0,
      margin: 0,
    }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7.2" fill="#ff4444" />
      <line
        x1="5.4"
        y1="5.4"
        x2="10.6"
        y2="10.6"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="10.6"
        y1="5.4"
        x2="5.4"
        y2="10.6"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  </span>
);

const EditablePipeline = ({
  isReadOnlyMode = false,
  isWorkflowActive = false,
  stages,
  setStages,
  infoRows = [],
  pipelineTitle: controlledPipelineTitle,
  setPipelineTitle: setControlledPipelineTitle,
  pipelineSubtitle: controlledPipelineSubtitle,
  setPipelineSubtitle: setControlledPipelineSubtitle,
  workflowSlot = null,
  noteOverride = null,
  onActiveStage = null,
  bpmnNodes = [],
  bpmnConnections = [],
}) => {
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeStage, setActiveStage] = useState(() => {
    const saved = localStorage.getItem("pipelineActiveStage");
    return saved ? JSON.parse(saved) : -1;
  });
  const [conditionalDecisions, setConditionalDecisions] = useState({});
  const [resetConfirm, setResetConfirm] = useState(false);
  const [localPipelineTitle, setLocalPipelineTitle] = useState(() => {
    const saved = localStorage.getItem("pipelineTitle");
    return saved || "";
  });
  const [localPipelineSubtitle, setLocalPipelineSubtitle] = useState(() => {
    const saved = localStorage.getItem("pipelineSubtitle");
    return saved || "";
  });
  const pipelineTitle =
    controlledPipelineTitle !== undefined
      ? controlledPipelineTitle
      : localPipelineTitle;
  const pipelineSubtitle =
    controlledPipelineSubtitle !== undefined
      ? controlledPipelineSubtitle
      : localPipelineSubtitle;
  const setPipelineTitleValue =
    setControlledPipelineTitle || setLocalPipelineTitle;
  const setPipelineSubtitleValue =
    setControlledPipelineSubtitle || setLocalPipelineSubtitle;

  // Estado local dos inputs — evita re-render do componente inteiro a cada tecla
  const [inputTitle, setInputTitle] = useState(pipelineTitle);
  const [inputSubtitle, setInputSubtitle] = useState(pipelineSubtitle);

  // Sincroniza se o valor externo mudar (ex: carregamento de pipeline)
  useEffect(() => {
    setInputTitle(pipelineTitle);
  }, [pipelineTitle]);
  useEffect(() => {
    setInputSubtitle(pipelineSubtitle);
  }, [pipelineSubtitle]);

  // Notifica o pai com a etapa atual ao montar (usa o primeiro passo não concluído)
  useEffect(() => {
    if (!onActiveStage || stages.length === 0) return;
    const undoneIndex = stages.findIndex((s) => !s.done);
    const currentIndex = undoneIndex >= 0 ? undoneIndex : stages.length - 1;
    const currentStage = stages[currentIndex];
    if (currentStage) onActiveStage(currentStage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBpmnDrivenPipeline = stages.some((stage) => stage?.fromBpmn === true);

  const getStagePalette = (stage) => {
    const stageType = String(stage?.stageType || "")
      .trim()
      .toLowerCase();

    if (stageType === "condicional") {
      return {
        base: "#3b82f6",
        soft: "rgba(59, 130, 246, 0.3)",
        softHover: "rgba(59, 130, 246, 0.5)",
        contrast: "#3b82f6",
      };
    }

    if (stageType === "task") {
      return {
        base: "#f4b400",
        soft: "rgba(244, 180, 0, 0.3)",
        softHover: "rgba(244, 180, 0, 0.5)",
        contrast: "#8a6a00",
      };
    }

    return {
      base: "#2fb36d",
      soft: "rgba(47, 179, 109, 0.3)",
      softHover: "rgba(47, 179, 109, 0.5)",
      contrast: "#2fb36d",
    };
  };

  useEffect(() => {
    localStorage.setItem("pipelineStages", JSON.stringify(stages));

    // Ajusta altura dos textareas quando stages mudam (mantido para clareza, pode remover se desejar)
    setTimeout(() => {
      const textareas = document.querySelectorAll(`.${styles.circleLabel}`);
      textareas.forEach((textarea) => {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      });
    }, 0);
  }, [stages]);

  useEffect(() => {
    localStorage.setItem("pipelineActiveStage", JSON.stringify(activeStage));
  }, [activeStage]);

  useEffect(() => {
    localStorage.setItem("pipelineTitle", pipelineTitle);
    setTimeout(() => {
      const titleTextarea = document.querySelector(`.${styles.leftTitle}`);
      if (titleTextarea) {
        titleTextarea.style.height = "auto";
        titleTextarea.style.height = titleTextarea.scrollHeight + "px";
      }
    }, 0);
  }, [pipelineTitle]);

  useEffect(() => {
    localStorage.setItem("pipelineSubtitle", pipelineSubtitle);
    setTimeout(() => {
      const subtitleTextarea = document.querySelector(
        `.${styles.leftSubtitle}`,
      );
      if (subtitleTextarea) {
        subtitleTextarea.style.height = "auto";
        subtitleTextarea.style.height = subtitleTextarea.scrollHeight + "px";
      }
    }, 0);
  }, [pipelineSubtitle]);

  const addStage = () => {
    if (isReadOnlyMode) return;
    if (isBpmnDrivenPipeline) return;
    if (stages.length >= 7) return;
    const newId =
      stages.length > 0 ? Math.max(...stages.map((s) => s.id)) + 1 : 1;
    setStages([...stages, { id: newId, label: "", done: false }]);
  };

  const resetToDefault = () => {
    if (isReadOnlyMode) return;
    if (isBpmnDrivenPipeline) return;
    setStages([
      { id: 1, label: "", done: false },
      { id: 2, label: "", done: false },
      { id: 3, label: "", done: false },
    ]);
    setActiveStage(-1);
    setResetConfirm(false);
  };

  const handleAddOrReset = () => {
    if (isReadOnlyMode) return;
    if (isBpmnDrivenPipeline) return;
    if (stages.length >= 7) {
      setResetConfirm(true);
    } else {
      addStage();
    }
  };

  const removeStage = (id) => {
    if (isReadOnlyMode) return;
    if (isBpmnDrivenPipeline) return;
    stages.length > 1 && setDeleteConfirm(id);
  };

  const confirmRemove = () => {
    if (isReadOnlyMode) {
      setDeleteConfirm(null);
      return;
    }
    const newStages = stages.filter((stage) => stage.id !== deleteConfirm);
    setStages(newStages);
    if (activeStage >= newStages.length) {
      setActiveStage(newStages.length - 1);
    }
    setDeleteConfirm(null);
  };

  const updateStage = (id, updates) => {
    if (isReadOnlyMode) return;
    if (
      isBpmnDrivenPipeline &&
      Object.prototype.hasOwnProperty.call(updates, "label")
    ) {
      return;
    }

    setStages(
      stages.map((stage) =>
        stage.id === id ? { ...stage, ...updates } : stage,
      ),
    );
  };

  const handleTextareaInput = (e) => {
    e.target.style.height = "auto";
    // Limita altura dos campos do pipelineLeft
    const isPipelineLeftField =
      e.target.classList.contains(styles.leftTitle) ||
      e.target.classList.contains(styles.leftSubtitle);
    if (isPipelineLeftField) {
      const maxHeightPx = 2.4 * 16;
      if (e.target.scrollHeight > maxHeightPx) {
        e.target.style.height = maxHeightPx + "px";
      } else {
        e.target.style.height = e.target.scrollHeight + "px";
      }
    } else {
      // Para os labels dos stages, expansão normal
      e.target.style.height = e.target.scrollHeight + "px";
    }
  };

  const handleStageClick = (index, stage) => {
    if (isReadOnlyMode) return;
    if (isWorkflowActive) return;

    const blockedNodeIds = (() => {
      if (!isBpmnDrivenPipeline) return new Set();

      const blocked = new Set();
      stages.forEach((candidate) => {
        if (candidate?.stageType !== "condicional") return;
        const chosenDecision = normalizeDecisionValue(
          conditionalDecisions[candidate.id],
        );
        if (!chosenDecision) return;

        const sourceNodeId = String(candidate?.sourceNodeId || "").trim();
        if (!sourceNodeId) return;

        bpmnConnections
          .filter((conn) => String(conn?.from || "").trim() === sourceNodeId)
          .forEach((conn) => {
            const connDecision = getConnectionDecision(conn);
            const targetNodeId = String(conn?.to || "").trim();
            if (!targetNodeId) return;
            if (
              connDecision &&
              connDecision !== "merge" &&
              connDecision !== chosenDecision
            ) {
              blocked.add(targetNodeId);
            }
          });
      });

      return blocked;
    })();

    const progressionStages = isBpmnDrivenPipeline
      ? stages.filter((s) => {
          const nodeId = String(s?.sourceNodeId || "").trim();
          return !nodeId || !blockedNodeIds.has(nodeId);
        })
      : stages;

    const clickedPathIndex = progressionStages.findIndex(
      (s) => s.id === stage.id,
    );
    if (clickedPathIndex < 0) return;

    if (stage.done) {
      // Desativa esta e as seguintes no caminho ativo
      const idsToReset = new Set(
        progressionStages.slice(clickedPathIndex).map((s) => s.id),
      );
      const conditionalIdsToReset = progressionStages
        .slice(clickedPathIndex)
        .filter((s) => s?.stageType === "condicional")
        .map((s) => s.id);

      setStages(
        stages.map((s) => (idsToReset.has(s.id) ? { ...s, done: false } : s)),
      );
      if (conditionalIdsToReset.length > 0) {
        setConditionalDecisions((prev) => {
          const next = { ...prev };
          conditionalIdsToReset.forEach((id) => {
            delete next[id];
          });
          return next;
        });
      }
      setActiveStage(clickedPathIndex);
      onActiveStage?.(stage);
    } else {
      // Ativa apenas se anteriores completas no caminho ativo
      const allPreviousCompleted = progressionStages
        .slice(0, clickedPathIndex)
        .every((s) => s.done);

      if (clickedPathIndex === 0 || allPreviousCompleted) {
        updateStage(stage.id, { done: true });
        // Condicionais ficam no índice atual para exibir os botões Sim/Não
        if (stage.stageType === "condicional") {
          setActiveStage(clickedPathIndex);
          onActiveStage?.(stage);
        } else {
          const nextPathIndex = clickedPathIndex + 1;
          if (nextPathIndex < progressionStages.length) {
            setActiveStage(nextPathIndex);
            onActiveStage?.(progressionStages[nextPathIndex]);
          } else {
            setActiveStage(clickedPathIndex);
            onActiveStage?.(stage);
          }
        }
      }
    }
  };

  const handleConditionalDecisionSelect = (stage, decisionValue) => {
    const normalizedDecision = normalizeDecisionValue(decisionValue);
    if (!stage?.id || !normalizedDecision) return;

    setConditionalDecisions((prev) => ({
      ...prev,
      [stage.id]: normalizedDecision,
    }));

    if (!isBpmnDrivenPipeline) return;

    const conditionalNodeId = String(stage?.sourceNodeId || "").trim();
    if (!conditionalNodeId) return;

    const outgoingConnections = bpmnConnections.filter(
      (conn) => String(conn?.from || "").trim() === conditionalNodeId,
    );

    const targetConnection = outgoingConnections.find(
      (conn) => getConnectionDecision(conn) === normalizedDecision,
    );
    const targetNodeId = String(targetConnection?.to || "").trim();
    if (!targetNodeId) return;

    setStages((prevStages) => {
      const alreadyExists = prevStages.some(
        (s) => String(s?.sourceNodeId || "").trim() === targetNodeId,
      );
      if (alreadyExists) return prevStages;

      const targetNode = bpmnNodes.find(
        (node) => String(node?.id || "").trim() === targetNodeId,
      );
      if (!targetNode || targetNode?.active === false) return prevStages;

      const nodeType = String(targetNode?.nodeType || "")
        .trim()
        .toLowerCase();
      const stageType =
        nodeType === "task"
          ? "task"
          : nodeType === "condicional"
            ? "condicional"
            : "entidade";

      const label =
        String(
          targetNode?.entidadeNome ||
            targetNode?.taskNome ||
            targetNode?.condicionalNome ||
            targetNode?.label ||
            "",
        ).trim() || "Próximo passo";

      const numericIds = prevStages
        .map((s) => Number(s?.id))
        .filter((id) => Number.isFinite(id));
      const newId = (numericIds.length > 0 ? Math.max(...numericIds) : 0) + 1;

      const insertIndex = prevStages.findIndex((s) => s.id === stage.id);
      const nextStage = {
        id: newId,
        label,
        done: false,
        fromBpmn: true,
        sourceNodeId: targetNodeId,
        stageType,
      };

      if (insertIndex < 0) return [...prevStages, nextStage];

      const updated = [...prevStages];
      updated.splice(insertIndex + 1, 0, nextStage);
      return updated;
    });
  };

  const blockedPathNodeIds = React.useMemo(() => {
    if (!isBpmnDrivenPipeline) return new Set();

    const blocked = new Set();
    stages.forEach((stage) => {
      if (stage?.stageType !== "condicional") return;
      const chosenDecision = normalizeDecisionValue(
        conditionalDecisions[stage.id],
      );
      if (!chosenDecision) return;

      const sourceNodeId = String(stage?.sourceNodeId || "").trim();
      if (!sourceNodeId) return;

      bpmnConnections
        .filter((conn) => String(conn?.from || "").trim() === sourceNodeId)
        .forEach((conn) => {
          const connDecision = getConnectionDecision(conn);
          const targetNodeId = String(conn?.to || "").trim();
          if (!targetNodeId) return;

          if (
            connDecision &&
            connDecision !== "merge" &&
            connDecision !== chosenDecision
          ) {
            blocked.add(targetNodeId);
          }
        });
    });

    return blocked;
  }, [isBpmnDrivenPipeline, stages, conditionalDecisions, bpmnConnections]);

  const progressionStages = React.useMemo(() => {
    if (!isBpmnDrivenPipeline) return stages;

    return stages.filter((stage) => {
      const nodeId = String(stage?.sourceNodeId || "").trim();
      return !nodeId || !blockedPathNodeIds.has(nodeId);
    });
  }, [isBpmnDrivenPipeline, stages, blockedPathNodeIds]);

  const allCompleted = progressionStages.every((stage) => {
    if (!stage.done) return false;
    if (stage.stageType === "condicional") {
      return conditionalDecisions[stage.id] !== undefined;
    }
    return true;
  });
  const anyCompleted = progressionStages.some((stage) => stage.done);
  const completedCount = progressionStages.filter((stage) => stage.done).length;

  // Para condicionais, só conta como concluído se tiver decisão (sim ou não)
  const effectiveCompletedCount = progressionStages.filter((stage, idx) => {
    if (!stage.done) return false;
    if (stage.stageType === "condicional") {
      return conditionalDecisions[stage.id] !== undefined;
    }
    return true;
  }).length;

  // Reveal stages one by one as each is confirmed by clicking.
  const manualVisibleCount = allCompleted
    ? progressionStages.length
    : effectiveCompletedCount + 1;
  const visibleStages = progressionStages.slice(0, manualVisibleCount);

  const progressPercentage = anyCompleted
    ? allCompleted
      ? 100
      : Math.min(
          (effectiveCompletedCount / (progressionStages.length + 1)) * 100,
          100,
        )
    : 0;

  const stageDetailsByLabel = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(infoRows) ? infoRows : []).forEach((row) => {
      const key = normalizeLabelKey(row?.label);
      if (!key) return;
      if (map.has(key)) return;
      map.set(key, String(row?.value || "").trim());
    });
    return map;
  }, [infoRows]);

  // Encontra o condicional ativo atual
  const activeConditionalStage = visibleStages.find(
    (stage, idx) =>
      idx === activeStage && stage.stageType === "condicional" && stage.done,
  );

  // Encontra as próximas etapas baseado na decisão (Sim ou Não)
  const getNextStagesByDecision = React.useMemo(() => {
    if (!activeConditionalStage || !bpmnNodes || !bpmnConnections) {
      return null;
    }

    const decision = normalizeDecisionValue(
      conditionalDecisions[activeConditionalStage.id],
    );
    if (!decision) return null;

    // Encontra o nó BPMN correspondente ao condicional
    const conditionalNodeId = activeConditionalStage.sourceNodeId;
    if (!conditionalNodeId) return null;

    // Encontra as conexões saindo deste nó
    const outgoingConnections = bpmnConnections.filter(
      (conn) => String(conn.from || "") === String(conditionalNodeId),
    );

    // Filtra conexões que correspondem à decisão
    const targetConnection = outgoingConnections.find((conn) => {
      const connDecision = getConnectionDecision(conn);
      return connDecision === decision;
    });

    if (!targetConnection) return null;

    // Encontra o nó alvo
    const targetNodeId = String(targetConnection.to || "");
    const targetNode = bpmnNodes.find((n) => String(n.id) === targetNodeId);

    return targetNode
      ? {
          nodeId: targetNode.id,
          label:
            String(
              targetNode.entidadeNome ||
                targetNode.taskNome ||
                targetNode.condicionalNome ||
                targetNode.label ||
                "",
            ).trim() || "Próximo passo",
        }
      : null;
  }, [
    activeConditionalStage,
    bpmnNodes,
    bpmnConnections,
    conditionalDecisions,
  ]);

  return (
    <>
      <div className={styles.pipelineShell}>
        <div className={styles.pipelineFrame}>
          <div className={styles.pipelineLeft}>
            <div className={styles.pipelineLeftContent}>
              <div className={styles.pipelineLeftMeta}>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span className={styles.pipelineLeftMetaText}>Pipeline</span>
              </div>
              {workflowSlot != null ? <>{workflowSlot}</> : <></>}
              <div className={styles.pipelineLeftDivider} />

              {/* Botões Sim/Não para Condicionais */}
              {activeConditionalStage &&
                conditionalDecisions[activeConditionalStage.id] ===
                  undefined && (
                  <div className={styles.decisionButtonsRow}>
                    <button
                      type="button"
                      onClick={() =>
                        handleConditionalDecisionSelect(
                          activeConditionalStage,
                          "sim",
                        )
                      }
                      className={`${styles.decisionBtn} ${styles.decisionBtnYes}`}
                      title="Caminho Sim"
                    >
                      ✓ Sim
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleConditionalDecisionSelect(
                          activeConditionalStage,
                          "nao",
                        )
                      }
                      className={`${styles.decisionBtn} ${styles.decisionBtnNo}`}
                      title="Caminho Não"
                    >
                      ✕ Não
                    </button>
                  </div>
                )}

              {/* Info do próximo passo */}
              {getNextStagesByDecision && (
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "rgba(255,255,255,0.9)",
                    marginBottom: "0.6rem",
                    paddingBottom: "0.4rem",
                    borderBottom: "1px solid rgba(255,255,255,0.2)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "600",
                      marginBottom: "0.2rem",
                      wordBreak: "break-word",
                    }}
                  >
                    → {getNextStagesByDecision.label}
                  </div>
                </div>
              )}

              <div className={styles.pipelineLeftDivider} />
              <div className={styles.pipelineLeftStats}>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.7)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                <span className={styles.pipelineLeftStatsText}>
                  {stages.length} etapa{stages.length !== 1 ? "s" : ""}
                  {anyCompleted
                    ? ` · ${completedCount} concluída${completedCount !== 1 ? "s" : ""}`
                    : ""}
                </span>
              </div>
            </div>
            <div className={styles.pipelineProgressBar}>
              <div
                className={styles.pipelineProgressFill}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
          <div className={styles.pipelineMain}>
            <div className={styles.stepperTrack}>
              {visibleStages.map((stage, index) => {
                const palette = getStagePalette(stage);
                const stageLabelRaw = String(stage?.label || "").trim();
                const stageLabelCompact = stageLabelRaw;
                const isLastStage = index === visibleStages.length - 1;

                return (
                  <React.Fragment key={stage.id}>
                    <div className={styles.stepItem}>
                      <div
                        className={`${styles.stepCard} ${stage.done ? styles.stepCardDone : ""} ${!stage.done ? (stage.stageType === "condicional" ? styles.stepCardPendingBlue : stage.stageType === "task" ? styles.stepCardPendingYellow : styles.stepCardPending) : ""} ${isReadOnlyMode ? styles.stepCardReadOnly : ""}`}
                        onClick={() => handleStageClick(index, stage)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleStageClick(index, stage);
                          }
                        }}
                        style={{
                          borderLeftColor: stage.done
                            ? palette.base
                            : palette.base,
                          ...(stage.done ? { background: palette.soft } : {}),
                        }}
                        title={
                          stage.done
                            ? "Marcar como incompleto"
                            : "Marcar como completo"
                        }
                      >
                        {/* Checkmark badge absoluto — não empurra nada */}
                        {stage.done && (
                          <span
                            className={styles.stepCardDoneBadge}
                            style={{ background: palette.base }}
                          >
                            ✓
                          </span>
                        )}

                        {/* Pending badge — visible when workflow is waiting on this stage */}
                        {stage.pending && !stage.done && (
                          <span
                            className={
                              stage.stageType === "condicional"
                                ? styles.stepPendingBadgeBlue
                                : styles.stepPendingBadge
                            }
                            title="Passo pendente"
                            aria-label="Passo pendente"
                          >
                            ●
                          </span>
                        )}

                        {/* Header: número + botão ℹ */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                          }}
                        >
                          <div
                            className={`${styles.stepCardIcon} ${stage.done ? styles.stepCardIconDone : ""}`}
                            style={
                              stage.done
                                ? {
                                    background: palette.base,
                                    borderColor: palette.base,
                                    color: "#fff",
                                  }
                                : {
                                    borderColor: palette.base,
                                    color: palette.base,
                                    background: "#fff",
                                  }
                            }
                          >
                            {index + 1}
                          </div>
                        </div>

                        {/* Nome da etapa */}
                        {isBpmnDrivenPipeline ? (
                          <span className={styles.stepCardLabelCompact}>
                            {stageLabelRaw || "Etapa"}
                          </span>
                        ) : (
                          <textarea
                            className={styles.stepCardLabel}
                            name={`stageLabel_${stage.id}`}
                            value={stage.label}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateStage(stage.id, { label: e.target.value });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onInput={handleTextareaInput}
                            placeholder="Nome..."
                            rows={1}
                            maxLength={20}
                            readOnly={isReadOnlyMode}
                          />
                        )}
                        {!isBpmnDrivenPipeline &&
                          stages.length > 1 &&
                          !isReadOnlyMode && (
                            <button
                              className={styles.stepCardRemove}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeStage(stage.id);
                              }}
                              title="Remover etapa"
                            >
                              ×
                            </button>
                          )}
                      </div>
                    </div>
                    {!isLastStage && (
                      <div
                        className={`${styles.stepConnector} ${stage.done ? styles.stepConnectorDone : ""}`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
              {!isBpmnDrivenPipeline && (
                <>
                  <div className={styles.stepConnector} />
                  <button
                    className={styles.stepAddCard}
                    onClick={handleAddOrReset}
                    disabled={isReadOnlyMode}
                    title={
                      stages.length >= 7
                        ? "Resetar para padrão (3 etapas)"
                        : "Adicionar etapa"
                    }
                  >
                    {stages.length >= 7 ? "⟲" : "+"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <p className={styles.pipelineNote}>
          {noteOverride
            ? noteOverride
            : isBpmnDrivenPipeline
              ? "* Pipeline sincronizada com o BPMN. *"
              : allCompleted
                ? "* Todas as etapas concluídas! *"
                : `* Etapa ${completedCount + 1} de ${stages.length} — confirme cada passo para avançar. *`}
        </p>
        {deleteConfirm && (
          <Close
            title="Remover Etapa"
            message="Tem certeza que deseja apagar essa etapa? Esta ação não pode ser desfeita."
            onConfirm={confirmRemove}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
        {resetConfirm && (
          <Close
            title="Resetar Pipeline"
            message="Resetar para 3 etapas? Todas as etapas atuais serão perdidas."
            onConfirm={resetToDefault}
            onCancel={() => setResetConfirm(false)}
          />
        )}
      </div>
    </>
  );
};
export default EditablePipeline;
