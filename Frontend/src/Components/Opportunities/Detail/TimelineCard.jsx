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

const getActionTypeLabel = (actionType, elementType) => {
  if (elementType === 'workflow') {
    if (actionType === 'create') return 'Início';
    if (actionType === 'delete') return 'Cancelamento';
    return 'Etapa';
  }
  if (actionType === 'create') return 'Criação';
  if (actionType === 'delete') return 'Remoção';
  if (actionType === 'comment') return 'Comentário';
  if (actionType === 'ia') return 'Automação IA';
  return 'Atualização';
};

const getActionIcon = (actionType, elementType) => {
  if (elementType === 'workflow') {
    if (actionType === 'create') return '🚀';
    if (actionType === 'delete') return '🚫';
    return '⚙️';
  }
  if (actionType === 'create') return '➕';
  if (actionType === 'delete') return '🗑️';
  if (actionType === 'comment') return '💬';
  if (actionType === 'ia') return '🤖';
  return '✏️';
};

const getElementTypeLabel = (elementType) => {
  const map = {
    workflow: 'Workflow',
    bpmn: 'BPMN',
    'elemento-bpmn': 'Elemento BPMN',
    entidade: 'Entidade',
    oportunidade: 'Oportunidade',
    pipeline: 'Pipeline',
    proprietario: 'Proprietário',
    status: 'Status',
    layout: 'Layout',
    topico: 'Tópico',
    datas: 'Datas',
    ia: 'IA',
  };
  return map[elementType] || elementType;
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

const parseDateInput = (value, endOfDay = false) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return null;

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};

const parseTimeInputToMinutes = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const [hour, minute] = raw.split(':').map(Number);
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
}) => {
  const [updatedDate, setUpdatedDate] = React.useState('');
  const [updatedTime, setUpdatedTime] = React.useState('');

  const hasDateFilter = Boolean(updatedDate || updatedTime);

  const filteredTimelineItems = React.useMemo(() => {
    const parsedUpdatedDateStart = parseDateInput(updatedDate, false);
    const parsedUpdatedDateEnd = parseDateInput(updatedDate, true);
    const parsedUpdatedTime = parseTimeInputToMinutes(updatedTime);

    return (Array.isArray(timelineItems) ? timelineItems : []).filter(
      (item) => {
        const actionType =
          String(item?.actionType || 'update').trim() || 'update';
        if (!['create', 'update', 'delete', 'ia'].includes(actionType)) {
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

        const isEligibleByElementType =
          elementType === 'bpmn' ||
          elementType === 'elemento-bpmn' ||
          elementType === 'entidade' ||
          elementType === 'oportunidade' ||
          elementType === 'pipeline' ||
          elementType === 'proprietario' ||
          elementType === 'status' ||
          elementType === 'layout' ||
          elementType === 'topico' ||
          elementType === 'datas' ||
          elementType === 'ia' ||
          elementType === 'workflow';

        const isEligibleBySourceOrTitle =
          source === 'bpmn-save' ||
          source === 'opportunity-save' ||
          source === 'backend' ||
          source === 'ia' ||
          title.includes('bpmn') ||
          title.includes('entidade') ||
          title.includes('oportunidade') ||
          title.includes('pipeline') ||
          title.includes('propriet') ||
          title.includes('workflow') ||
          title.includes('ia executou');

        if (!isEligibleByElementType && !isEligibleBySourceOrTitle) {
          return false;
        }

        const parsedItemDate = parseTimelineDate(item);

        if (
          parsedUpdatedDateStart &&
          parsedItemDate &&
          parsedItemDate < parsedUpdatedDateStart
        ) {
          return false;
        }

        if (
          parsedUpdatedDateEnd &&
          parsedItemDate &&
          parsedItemDate > parsedUpdatedDateEnd
        ) {
          return false;
        }

        if (parsedUpdatedTime !== null && parsedItemDate) {
          const itemMinutes =
            parsedItemDate.getHours() * 60 + parsedItemDate.getMinutes();
          if (itemMinutes !== parsedUpdatedTime) {
            return false;
          }
        }

        return true;
      },
    );
  }, [timelineItems, updatedDate, updatedTime]);

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
      <div className={styles.timelineFilterBar}>
        <label className={styles.timelineFilterField}>
          <span>Data de atualização</span>
          <input
            type="date"
            name="timelineFilterDate"
            value={updatedDate}
            onChange={(event) => setUpdatedDate(event.target.value)}
            className={styles.timelineFilterInput}
          />
        </label>
        <label className={styles.timelineFilterField}>
          <span>Hora</span>
          <input
            type="time"
            name="timelineFilterTime"
            value={updatedTime}
            onChange={(event) => setUpdatedTime(event.target.value)}
            className={styles.timelineFilterInput}
          />
        </label>
        <div className={styles.timelineFilterActions}>
          <button
            type="button"
            className={styles.timelineFilterButton}
            onClick={() => {
              setUpdatedDate('');
              setUpdatedTime('');
            }}
            disabled={!hasDateFilter}
          >
            Limpar
          </button>
        </div>
      </div>
      {hasDateFilter ? (
        <div className={styles.timelineFilterSummary}>
          Filtrando por data e hora de atualização.
        </div>
      ) : null}
      <div className={styles.timelineList}>
        {filteredTimelineItems.length === 0 ? (
          <div className={styles.timelineEmpty}>
            Nenhuma ação encontrada para os filtros informados.
          </div>
        ) : (
          filteredTimelineItems.map((item) => {
            const actionType =
              String(item?.actionType || 'update').trim() || 'update';
            const elementType =
              String(item?.elementType || '').trim().toLowerCase();
            const canExpand = Boolean(
              String(item?.before || '').trim() ||
              String(item?.after || '').trim() ||
              String(item?.comment || '').trim() ||
              String(item?.description || '').trim(),
            );

            return (
              <div key={item.id} className={styles.timelineItem}>
                <div className={styles.timelineAvatar}>
                  {getActionIcon(actionType, elementType)}
                </div>
                <div className={styles.timelineContent}>
                  <strong>{item.title}</strong>
                  <span className={styles.timelineActionTag}>
                    {getActionTypeLabel(actionType, elementType)}
                    {elementType
                      ? ` • ${getElementTypeLabel(elementType)}`
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
