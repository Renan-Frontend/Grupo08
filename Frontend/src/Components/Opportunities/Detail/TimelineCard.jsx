import React from 'react';
import styles from '../OpportunityDetail.module.css';

const parseTimelineDate = (item) => {
  if (item?.timestamp) {
    const parsed = new Date(item.timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const timeRaw = String(item?.time || '').trim();
  const match = timeRaw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2}))?$/,
  );
  if (match) {
    const [, day, month, year, hour = '00', minute = '00'] = match;
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

const getActionTypeLabel = (actionType) => {
  if (actionType === 'create') return 'Criação';
  if (actionType === 'delete') return 'Remoção';
  if (actionType === 'comment') return 'Comentário';
  return 'Atualização';
};

const getActionIcon = (actionType) => {
  if (actionType === 'create') return '➕';
  if (actionType === 'delete') return '🗑️';
  if (actionType === 'comment') return '💬';
  return '✏️';
};

const formatTimelineDate = (item) => {
  const parsed = parseTimelineDate(item);
  if (!parsed) return String(item?.time || '').trim() || '-';
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TimelineCard = ({
  showTimeline,
  isEditing,
  showPipeline,
  toggleTimeline,
  timelineItems,
}) => {
  const filteredTimelineItems = React.useMemo(
    () =>
      (Array.isArray(timelineItems) ? timelineItems : []).filter((item) => {
        const actionType =
          String(item?.actionType || 'update').trim() || 'update';
        if (!['create', 'update', 'delete'].includes(actionType)) {
          return false;
        }

        const elementType = String(item?.elementType || '')
          .trim()
          .toLowerCase();
        const title = String(item?.title || '')
          .trim()
          .toLowerCase();
        const source = String(item?.source || '')
          .trim()
          .toLowerCase();

        if (
          elementType === 'bpmn' ||
          elementType === 'elemento-bpmn' ||
          elementType === 'entidade' ||
          elementType === 'oportunidade' ||
          elementType === 'pipeline' ||
          elementType === 'proprietario' ||
          elementType === 'status' ||
          elementType === 'layout' ||
          elementType === 'topico' ||
          elementType === 'datas'
        ) {
          return true;
        }

        if (source === 'bpmn-save') return true;
        if (source === 'opportunity-save') return true;
        if (title.includes('bpmn')) return true;
        if (title.includes('entidade')) return true;
        if (title.includes('oportunidade')) return true;
        if (title.includes('pipeline')) return true;
        if (title.includes('propriet')) return true;

        return false;
      }),
    [timelineItems],
  );

  if (!showTimeline) return null;

  return (
    <div
      className={`${styles.card} ${showPipeline ? styles.cardMaxPipeline : styles.cardMaxNoPipeline} ${isEditing ? styles.editableSection : ''}`}
    >
      {isEditing && (
        <div className={styles.editControls}>
          <span className={styles.editLabel}>Linha do Tempo</span>
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
      <div className={styles.timelineList}>
        {filteredTimelineItems.length === 0 ? (
          <div className={styles.timelineEmpty}>
            Nenhuma ação registrada para BPMN, Entidade ou Oportunidade.
          </div>
        ) : (
          filteredTimelineItems.map((item) => {
            const actionType =
              String(item?.actionType || 'update').trim() || 'update';
            const canExpand = Boolean(
              String(item?.before || '').trim() ||
              String(item?.after || '').trim() ||
              String(item?.comment || '').trim() ||
              String(item?.description || '').trim(),
            );

            return (
              <div key={item.id} className={styles.timelineItem}>
                <div className={styles.timelineAvatar}>
                  {getActionIcon(actionType)}
                </div>
                <div className={styles.timelineContent}>
                  <strong>{item.title}</strong>
                  <span className={styles.timelineActionTag}>
                    {getActionTypeLabel(actionType)}
                    {item?.elementType
                      ? ` • ${String(item.elementType).trim()}`
                      : ''}
                  </span>
                  {item?.itemName ? (
                    <span>{`Item: ${item.itemName}`}</span>
                  ) : null}
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
                {canExpand ? (
                  <div className={styles.timelineDetails}>
                    {item?.before ? (
                      <div>
                        <strong>Antes:</strong> {item.before}
                      </div>
                    ) : null}
                    {item?.after ? (
                      <div>
                        <strong>Agora:</strong> {item.after}
                      </div>
                    ) : null}
                    {item?.comment ? (
                      <div>
                        <strong>Comentário:</strong> {item.comment}
                      </div>
                    ) : null}
                    {item?.description ? (
                      <div>
                        <strong>Resumo:</strong> {item.description}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TimelineCard;
