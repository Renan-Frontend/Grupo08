import React from "react";
import styles from "../OpportunityDetail.module.css";

const parseTimelineDate = (item) => {
  if (item?.timestamp) {
    const parsed = new Date(item.timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const timeRaw = String(item?.time || "").trim();
  const match = timeRaw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2}))?$/,
  );
  if (match) {
    const [, day, month, year, hour = "00", minute = "00"] = match;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const getActionTypeLabel = (actionType, elementType) => {
  if (elementType === "workflow") {
    if (actionType === "create") return "Início";
    if (actionType === "delete") return "Cancelamento";
    return "Etapa";
  }
  if (actionType === "create") return "Criação";
  if (actionType === "delete") return "Remoção";
  if (actionType === "comment") return "Comentário";
  if (actionType === "ia") return "Automação IA";
  return "Atualização";
};

const getActionIcon = (actionType, elementType) => {
  if (elementType === "workflow") {
    if (actionType === "create") return "🚀";
    if (actionType === "delete") return "🚫";
    return "⚙️";
  }
  if (actionType === "create") return "➕";
  if (actionType === "delete") return "🗑️";
  if (actionType === "comment") return "💬";
  if (actionType === "ia") return "🤖";
  return "✏️";
};

const getElementTypeLabel = (elementType) => {
  const map = {
    workflow: "Workflow",
    bpmn: "BPMN",
    "elemento-bpmn": "Elemento BPMN",
    entidade: "Entidade",
    oportunidade: "Oportunidade",
    pipeline: "Pipeline",
    proprietario: "Proprietário",
    status: "Status",
    layout: "Layout",
    topico: "Tópico",
    datas: "Datas",
    ia: "IA",
  };
  return map[elementType] || elementType;
};

const formatTimelineDate = (item) => {
  const parsed = parseTimelineDate(item);
  if (!parsed) return String(item?.time || "").trim() || "-";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseDateInput = (value, endOfDay = false) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return null;

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};

const parseTimeInputToMinutes = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const [hour, minute] = raw.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
};

const TimelineCard = ({
  showTimeline,
  isEditing,
  showPipeline,
  toggleTimeline,
  timelineItems,
  stages = [],
  activeStageLabel = null,
  noteTitle = "",
  setNoteTitle = () => {},
  noteDescription = "",
  setNoteDescription = () => {},
  onAddNote = () => {},
  isReadOnlyMode = false,
}) => {
  // Quando o passo ativo muda (clicado na pipeline), sincroniza o título da nota
  React.useEffect(() => {
    if (activeStageLabel) {
      setNoteTitle(activeStageLabel);
    }
  }, [activeStageLabel, setNoteTitle]);

  const manualNotes = React.useMemo(
    () =>
      (Array.isArray(timelineItems) ? timelineItems : []).filter(
        (item) => item?.source === "manual-note",
      ),
    [timelineItems],
  );

  if (!showTimeline) return null;

  return (
    <div
      className={`${styles.card} ${showPipeline ? styles.cardMaxPipeline : styles.cardMaxNoPipeline} ${isEditing ? styles.editableSection : ""}`}
    >
      {isEditing && (
        <div className={styles.editControls}>
          <span className={styles.editLabel}>Notas</span>
          <button
            type="button"
            className={styles.editButton}
            onClick={toggleTimeline}
          >
            Ocultar
          </button>
        </div>
      )}

      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Linha do Tempo</h2>
      </div>

      {!isReadOnlyMode && (
        <div className={styles.noteForm}>
          {activeStageLabel && (
            <span className={styles.noteStepLabel}>{activeStageLabel}</span>
          )}
          <textarea
            className={styles.noteTextarea}
            value={noteDescription}
            onChange={(e) => setNoteDescription(e.target.value)}
            placeholder={
              activeStageLabel
                ? `Nota para "${activeStageLabel}"...`
                : "Adicionar nota..."
            }
            rows={2}
          />
          <button
            type="button"
            className={styles.noteAddBtn}
            onClick={onAddNote}
            disabled={!noteDescription.trim()}
          >
            + Adicionar nota
          </button>
        </div>
      )}

      <div className={styles.timelineList}>
        {manualNotes.length === 0 ? (
          <div className={styles.timelineEmpty}>Nenhuma nota adicionada.</div>
        ) : (
          manualNotes.map((item) => (
            <div key={item.id} className={styles.timelineItem}>
              <div className={styles.timelineAvatar}>💬</div>
              <div className={styles.timelineContent}>
                {item.title && item.title !== "Novo evento" && (
                  <strong>{item.title}</strong>
                )}
                <span>{item.comment || item.description || ""}</span>
              </div>
              <div className={styles.timelineMeta}>
                {item.actor ? (
                  <span
                    className={styles.timelineActor}
                  >{`por ${item.actor}`}</span>
                ) : null}
                <span className={styles.timelineTime}>
                  {formatTimelineDate(item)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TimelineCard;
