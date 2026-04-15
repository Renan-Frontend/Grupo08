import React from 'react';
import Close from '../../Helper/Close';
import styles from '../OpportunityDetail.module.css';

const TopicCard = ({
  isReadOnlyMode,
  showTopico,
  isEditing,
  showPipeline,
  infoRows,
  setInfoRows,
  isBpmnDrivenPipeline,
  toggleTopico,
  workflowActive = false,
  workflowExecuted = [],
  workflowCurrentNodeId = null,
  bpmnNodes = [],
}) => {
  const DEFAULT_PENDING_TOPIC_MESSAGE =
    'Pendência: concluir no BPMN ou em Entidades.';

  const [expandedContent, setExpandedContent] = React.useState({
    rowIndex: null,
    value: '',
    draftValue: '',
    fieldKey: '',
    fieldLabel: '',
    isEditable: false,
  });

  const [workflowNotes, setWorkflowNotes] = React.useState({});
  const [activeFilter, setActiveFilter] = React.useState('todos');
  const [viewMode, setViewMode] = React.useState('checklist'); // 'checklist' | 'crm'

  if (!showTopico) return null;

  const safeNodes = Array.isArray(bpmnNodes) ? bpmnNodes : [];
  const nodesById = Object.fromEntries(
    safeNodes.map((n) => [String(n?.id || ''), n]),
  );

  const getNodeLabel = (nodeId) => {
    const node = nodesById[String(nodeId || '')] ?? null;
    return (
      node?.label ||
      node?.taskNome ||
      node?.condicionalNome ||
      node?.entidadeNome ||
      nodeId ||
      ''
    );
  };

  // Workflow steps that are relevant for notes (completed + current waiting)
  const workflowNoteSteps = React.useMemo(() => {
    if (!workflowActive || workflowExecuted.length === 0) return [];
    const seen = new Set();
    const steps = workflowExecuted
      .filter(
        (s) =>
          s?.status === 'completed' ||
          s?.status === 'waiting_user' ||
          s?.status === 'waiting_decision',
      )
      .filter((s) => s?.nodeId && (s.canonicalType === 'task' || s.canonicalType === 'condicional'))
      .filter((s) => {
        if (seen.has(s.nodeId)) return false;
        seen.add(s.nodeId);
        return true;
      });
    // Add current node if not already included
    if (
      workflowCurrentNodeId &&
      !steps.some((s) => s.nodeId === workflowCurrentNodeId)
    ) {
      const currentNode = nodesById[workflowCurrentNodeId];
      if (currentNode) {
        steps.push({
          nodeId: workflowCurrentNodeId,
          label: getNodeLabel(workflowCurrentNodeId),
          status: 'waiting_user',
          canonicalType: currentNode.nodeType || 'task',
        });
      }
    }
    return steps;
  }, [workflowActive, workflowExecuted, workflowCurrentNodeId, nodesById]);

  // Persist workflow notes into infoRows whenever they change
  const handleNoteChange = (nodeId, value) => {
    setWorkflowNotes((prev) => ({ ...prev, [nodeId]: value }));
  };

  const handleNoteSave = (nodeId) => {
    const note = String(workflowNotes[nodeId] || '').trim();
    if (!note) return;
    const label = `📝 ${getNodeLabel(nodeId)}`;
    const exists = infoRows.findIndex(
      (r) => r?.workflowNodeId === nodeId,
    );
    const newRows = [...infoRows];
    if (exists >= 0) {
      newRows[exists] = { ...newRows[exists], value: note };
    } else {
      newRows.push({
        label,
        value: note,
        topicType: 'anotacao',
        workflowNodeId: nodeId,
        manualStatus: 'pendente',
      });
    }
    setInfoRows(newRows);
    setWorkflowNotes((prev) => ({ ...prev, [nodeId]: '' }));
  };

  // Load existing notes from infoRows into local state on mount
  React.useEffect(() => {
    if (!workflowActive) return;
    const existing = {};
    infoRows.forEach((r) => {
      if (r?.workflowNodeId) {
        existing[r.workflowNodeId] = r.value || '';
      }
    });
    if (Object.keys(existing).length > 0) {
      setWorkflowNotes((prev) => ({ ...existing, ...prev }));
    }
  }, [workflowActive]);

  const parseSummaryItems = (value) => {
    const lines = String(value || '')
      .split('\n')
      .map((line) => String(line || '').trim())
      .filter(Boolean);

    const items = [];
    let isOnMainPath = true;
    let isImportedFromBpmn = false;

    lines.forEach((line) => {
      const descricaoMatch = line.match(/^Descri[cç][aã]o\s*:\s*(.*)$/i);
      if (descricaoMatch) {
        items.push({
          key: 'descricao',
          label: 'Descrição',
          content: String(descricaoMatch[1] || '').trim() || '-',
        });
        return;
      }

      const atributoMatch = line.match(/^Atributo\s*chave\s*:\s*(.*)$/i);
      if (atributoMatch) {
        items.push({
          key: 'atributo_chave',
          label: 'Atributo chave',
          content: String(atributoMatch[1] || '').trim() || '-',
        });
        return;
      }

      const tipoEntidadeMatch = line.match(
        /^Tipo\s*da\s*entidade\s*:\s*(.*)$/i,
      );
      if (tipoEntidadeMatch) {
        items.push({
          key: 'tipo_entidade',
          label: 'Tipo da entidade',
          content: String(tipoEntidadeMatch[1] || '').trim() || '-',
        });
        return;
      }

      const flowStatusMatch = line.match(
        /^Fluxo\s*principal\s*na\s*pipeline\s*:\s*(.*)$/i,
      );
      if (flowStatusMatch) {
        isImportedFromBpmn = true;
        const normalizedValue = String(flowStatusMatch[1] || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase();
        isOnMainPath = !(
          normalizedValue === 'nao' || normalizedValue === 'não'
        );
      }
    });

    return {
      items,
      isOnMainPath,
      isImportedFromBpmn,
    };
  };

  const buildSummaryPreview = (items = []) => {
    const safeItems = Array.isArray(items) ? items : [];
    if (safeItems.length === 0) return '';

    const getValue = (key) =>
      String(
        safeItems.find((item) => String(item?.key || '').trim() === key)
          ?.content || '',
      ).trim();

    const descricao = getValue('descricao');
    const atributoChave = getValue('atributo_chave');
    const tipoEntidade = getValue('tipo_entidade');

    return safeItems
      .map((item) =>
        String(item?.content || '')
          .replace(/\s*\n+\s*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim(),
      )
      .filter((content) => content && content !== '-')
      .sort((valueA, valueB) => {
        const priority = (value) => {
          if (value === descricao) return 0;
          if (value === atributoChave) return 1;
          if (value === tipoEntidade) return 2;
          return 3;
        };

        return priority(valueA) - priority(valueB);
      })
      .join(' • ');
  };

  const buildModalDisplayContent = (value) => {
    const parsed = parseSummaryItems(value);
    const safeItems = Array.isArray(parsed?.items) ? parsed.items : [];

    if (safeItems.length === 0) {
      return String(value || '').trim();
    }

    const values = safeItems
      .map((item) => String(item?.content || '').trim())
      .filter((content) => content && content !== '-');

    if (values.length === 0) return '-';
    return values.join('\n');
  };

  const parseModalContentBlocks = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return [];

    const paragraphs = raw
      .split(/\n\s*\n+/)
      .map((chunk) => String(chunk || '').trim())
      .filter(Boolean);

    if (paragraphs.length > 1) {
      return paragraphs;
    }

    return raw
      .split('\n')
      .map((line) => String(line || '').trim())
      .filter(Boolean);
  };

  const parseModalStructuredItems = (value) => {
    const lines = String(value || '')
      .split('\n')
      .map((line) => String(line || '').trim())
      .filter(Boolean);

    const fieldMatchers = [
      {
        key: 'descricao',
        label: 'Descrição',
        matcher: /^Descri[cç][aã]o\s*:\s*(.*)$/i,
      },
      {
        key: 'atributo_chave',
        label: 'Atributo chave',
        matcher: /^Atributo\s*chave\s*:\s*(.*)$/i,
      },
      {
        key: 'tipo_entidade',
        label: 'Tipo da entidade',
        matcher: /^Tipo\s*da\s*entidade\s*:\s*(.*)$/i,
      },
      {
        key: 'fluxo_principal',
        label: 'Fluxo principal na pipeline',
        matcher: /^Fluxo\s*principal\s*na\s*pipeline\s*:\s*(.*)$/i,
      },
    ];

    const items = [];
    lines.forEach((line) => {
      const matchedField = fieldMatchers.find((field) =>
        field.matcher.test(line),
      );
      if (!matchedField) return;

      const match = line.match(matchedField.matcher);
      items.push({
        key: matchedField.key,
        label: matchedField.label,
        content: String(match?.[1] || '').trim() || '-',
      });
    });

    return items;
  };

  const updateTextIfFits = (input, text, onFit) => {
    const span = document.createElement('span');
    span.style.visibility = 'hidden';
    span.style.font = window.getComputedStyle(input).font;
    span.style.fontSize = window.getComputedStyle(input).fontSize;
    span.style.fontFamily = window.getComputedStyle(input).fontFamily;
    span.textContent = text;
    document.body.appendChild(span);
    const fits = span.offsetWidth <= input.offsetWidth;
    document.body.removeChild(span);
    if (fits) onFit();
  };

  const updateStructuredFieldValue = (
    sourceValue,
    fieldKey,
    nextFieldValue,
  ) => {
    const fieldConfig = {
      descricao: {
        matcher: /^Descri[cç][aã]o\s*:\s*(.*)$/i,
        label: 'Descrição',
      },
      atributo_chave: {
        matcher: /^Atributo\s*chave\s*:\s*(.*)$/i,
        label: 'Atributo chave',
      },
      campo: {
        matcher: /^Campo\s*:\s*(.*)$/i,
        label: 'Campo',
      },
    };

    const config = fieldConfig[fieldKey];
    if (!config) return sourceValue;

    const normalizedValue = String(nextFieldValue || '').trim() || '-';
    const lines = String(sourceValue || '')
      .split('\n')
      .map((line) => String(line || '').trim())
      .filter(Boolean);

    let hasUpdatedLine = false;

    const updatedLines = lines.map((line) => {
      if (config.matcher.test(line)) {
        hasUpdatedLine = true;
        return `${config.label}: ${normalizedValue}`;
      }
      return line;
    });

    if (!hasUpdatedLine) {
      updatedLines.unshift(`${config.label}: ${normalizedValue}`);
    }

    return updatedLines.join('\n');
  };

  const hasImportedBpmnRows = infoRows
    .slice(1)
    .some((row) => parseSummaryItems(row.value).isImportedFromBpmn);

  const getTopicTypeColor = (topicType) => {
    const normalized = String(topicType || '')
      .trim()
      .toLowerCase();
    if (normalized === 'decisao') return '#3b82f6';
    if (normalized === 'atividade') return '#b88700';
    if (normalized === 'anotacao') return '#8b5cf6';
    return '#2fb36d';
  };

  const getTopicNameColor = (row, parsedSummary) => {
    if (parsedSummary?.isImportedFromBpmn) {
      return getTopicTypeColor(row?.topicType);
    }
    return '#4D4D4D';
  };

  const getManualStatus = (row) => {
    const normalized = String(row?.manualStatus || '')
      .trim()
      .toLowerCase();
    return normalized === 'concluido' ? 'concluido' : 'pendente';
  };

  const isBpmnOrEntidadesPending = (row) =>
    String(row?.pendingTarget || '')
      .trim()
      .toLowerCase() === 'bpmn_entidades';

  const getTopicTypeIcon = (topicType) => {
    const normalized = String(topicType || '').trim().toLowerCase();
    if (normalized === 'decisao') return '🔀';
    if (normalized === 'atividade') return '⚡';
    if (normalized === 'anotacao') return '📝';
    return '📋';
  };

  const getTopicTypeLabel = (topicType) => {
    const normalized = String(topicType || '').trim().toLowerCase();
    if (normalized === 'decisao') return 'Decisão';
    if (normalized === 'atividade') return 'Atividade';
    if (normalized === 'anotacao') return 'Anotação';
    return 'Dados';
  };

  const getContentPreview = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const firstLine = raw.split('\n').find((l) => l.trim()) || '';
    const cleaned = firstLine
      .replace(/^(Descri[cç][aã]o|Atributo\s*chave|Tipo\s*da\s*entidade|Fluxo\s*principal\s*na\s*pipeline)\s*:\s*/i, '')
      .trim();
    if (cleaned.length > 60) return `${cleaned.slice(0, 57)}…`;
    return cleaned;
  };

  // Progress stats for non-workflow mode
  const contentRows = infoRows.slice(1);
  const manualRows = contentRows.filter(
    (row) => !parseSummaryItems(row.value).isImportedFromBpmn || !isBpmnDrivenPipeline,
  );
  const completedCount = manualRows.filter(
    (row) => getManualStatus(row) === 'concluido',
  ).length;
  const totalManualCount = manualRows.length;

  // Filter logic
  const filteredContentIndexes = contentRows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => {
      const parsed = parseSummaryItems(row.value);
      if (isBpmnDrivenPipeline && parsed.isImportedFromBpmn) return false;
      if (activeFilter === 'pendentes') return getManualStatus(row) !== 'concluido';
      if (activeFilter === 'concluidos') return getManualStatus(row) === 'concluido';
      return true;
    });

  const handleAddTopic = () => {
    if (isReadOnlyMode) return;
    const nextRowIndex = infoRows.length;
    setInfoRows([
      ...infoRows,
      {
        label: 'Nova pendência',
        value: DEFAULT_PENDING_TOPIC_MESSAGE,
        topicType: 'dados',
        isPrimaryEntity: false,
        manualStatus: 'pendente',
        pendingTarget: 'bpmn_entidades',
      },
    ]);

    setExpandedContent({
      rowIndex: nextRowIndex,
      value: '',
      draftValue: '',
      fieldKey: 'conteudo',
      fieldLabel: 'Conteúdo',
      isEditable: true,
    });
  };

  return (
    <div
      className={`${styles.card} ${showPipeline ? styles.cardMaxPipeline : styles.cardMaxNoPipeline} ${isEditing ? styles.editableSection : ''}`}
    >
      {isEditing && (
        <div className={styles.editControls}>
          <span className={styles.editLabel}>Topico</span>
          <button
            type="button"
            className={styles.editButton}
            onClick={toggleTopico}
          >
            Ocultar
          </button>
        </div>
      )}
      <div className={styles.cardHeader}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            gap: '0.5rem',
          }}
        >
          <input
            className={`${styles.cardTitle} ${styles.topicMainTitleInput}`}
            type="text"
            value={infoRows[0]?.label || ''}
            placeholder="Título do Tópico..."
            style={{
              background: 'none',
              border: 'none',
              boxShadow: 'none',
              padding: 0,
              color: '#222',
              fontSize: '1em',
              flex: 1,
              minWidth: 0,
            }}
            maxLength={50}
            onChange={(e) => {
              if (isReadOnlyMode) return;
              const text = e.target.value;
              const newRows = [...infoRows];
              newRows[0] = { ...newRows[0], label: text };
              setInfoRows(newRows);
            }}
            name="topicoLabel"
            autoComplete="off"
            readOnly={isReadOnlyMode}
          />
          {totalManualCount > 0 && !workflowActive && (
            <span className={styles.topicProgressBadge}>
              {completedCount}/{totalManualCount}
            </span>
          )}
          {!workflowActive && contentRows.length > 0 && (
            <div className={styles.topicViewToggle}>
              <button
                type="button"
                className={`${styles.topicViewToggleBtn} ${viewMode === 'checklist' ? styles.topicViewToggleBtnActive : ''}`}
                onClick={() => setViewMode('checklist')}
                title="Visualização Checklist"
              >
                ☑
              </button>
              <button
                type="button"
                className={`${styles.topicViewToggleBtn} ${viewMode === 'crm' ? styles.topicViewToggleBtnActive : ''}`}
                onClick={() => setViewMode('crm')}
                title="Visualização CRM"
              >
                ☰
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Progress bar */}
      {totalManualCount > 0 && !workflowActive && (
        <div className={styles.topicProgressBarContainer}>
          <div
            className={styles.topicProgressBarFill}
            style={{
              width: `${totalManualCount > 0 ? (completedCount / totalManualCount) * 100 : 0}%`,
            }}
          />
        </div>
      )}
      {/* Filter tabs */}
      {totalManualCount > 2 && !workflowActive && (
        <div className={styles.topicFilterBar}>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'pendentes', label: 'Pendentes' },
            { key: 'concluidos', label: 'Concluídos' },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`${styles.topicFilterTab} ${activeFilter === filter.key ? styles.topicFilterTabActive : ''}`}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}
      <div className={styles.infoList}>
        {workflowActive && workflowNoteSteps.length > 0 ? (
          <>
            <div className={styles.summaryPathHeaderRow}>
              <span className={styles.summaryTopicHeader}>Anotações do Workflow</span>
            </div>
            {workflowNoteSteps.map((step) => {
              const nodeId = step.nodeId;
              const stepLabel = step.label || getNodeLabel(nodeId);
              const isCurrent = nodeId === workflowCurrentNodeId;
              const savedNote = infoRows.find((r) => r?.workflowNodeId === nodeId);
              const draft = workflowNotes[nodeId] ?? '';

              return (
                <div
                  key={nodeId}
                  className={styles.infoRow}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '0.35rem',
                    background: isCurrent ? '#fffbe6' : undefined,
                    borderRadius: 4,
                    padding: '0.5rem 0.6rem',
                    gridTemplateColumns: 'unset',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        color: isCurrent ? '#b88700' : '#1e9158',
                      }}
                    >
                      {isCurrent ? '▶' : '✓'} {stepLabel}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#999' }}>
                      {step.canonicalType === 'condicional'
                        ? 'Decisão'
                        : step.canonicalType === 'task'
                          ? 'Atividade'
                          : ''}
                      {step.decision ? ` → ${step.decision}` : ''}
                    </span>
                  </div>
                  {savedNote ? (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: '#444',
                        background: '#f8f8f8',
                        borderRadius: 4,
                        padding: '0.3rem 0.5rem',
                        borderLeft: '3px solid #1e9158',
                      }}
                    >
                      {savedNote.value}
                    </div>
                  ) : null}
                  {!isReadOnlyMode ? (
                    <div style={{ display: 'flex', gap: '0.3rem', minWidth: 0, width: '100%' }}>
                      <input
                        type="text"
                        name={`workflowNote_${nodeId}`}
                        placeholder={`Anotar sobre "${stepLabel}"...`}
                        value={draft}
                        onChange={(e) => handleNoteChange(nodeId, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && draft.trim()) {
                            handleNoteSave(nodeId);
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: '0.8rem',
                          padding: '0.3rem 0.5rem',
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleNoteSave(nodeId)}
                        disabled={!draft.trim()}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.6rem',
                          background: draft.trim() ? '#1e9158' : '#ccc',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: draft.trim() ? 'pointer' : 'default',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Salvar
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {/* Saved notes from previous workflow runs */}
            {infoRows
              .filter((r) => r?.workflowNodeId && !workflowNoteSteps.some((s) => s.nodeId === r.workflowNodeId))
              .map((row, idx) => (
                <div
                  key={`saved-${idx}`}
                  className={styles.infoRow}
                  style={{ flexDirection: 'column', padding: '0.4rem' }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#666' }}>
                    {row.label}
                  </span>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#444',
                      background: '#f8f8f8',
                      borderRadius: 4,
                      padding: '0.3rem 0.5rem',
                      borderLeft: '3px solid #aaa',
                    }}
                  >
                    {row.value}
                  </div>
                </div>
              ))}
          </>
        ) : (
          <>
        {viewMode === 'checklist' ? (
          <>
        {hasImportedBpmnRows ? (
          <div className={styles.summaryPathHeaderRow}>
            <span className={styles.summaryTopicHeader}>Tópico</span>
            <span className={styles.summaryPathHeader}>Fluxo BPMN</span>
          </div>
        ) : null}
        {filteredContentIndexes.length === 0 && activeFilter !== 'todos' ? (
          <div className={styles.topicEmptyFilter}>
            Nenhum tópico {activeFilter === 'pendentes' ? 'pendente' : 'concluído'}.
          </div>
        ) : null}
        {filteredContentIndexes.map(({ row, idx }) => {
          const parsedSummary = parseSummaryItems(row.value);
          const preview = getContentPreview(row.value);

          return (
            <div key={idx} className={`${styles.infoRow} ${getManualStatus(row) === 'concluido' ? styles.infoRowDone : ''}`}>
              <div className={styles.infoRowFields}>
                <div className={styles.topicRowLeft}>
                  <span
                    className={styles.topicTypeIcon}
                    title={String(row.topicType || 'dados').charAt(0).toUpperCase() + String(row.topicType || 'dados').slice(1)}
                  >
                    {getTopicTypeIcon(row.topicType)}
                  </span>
                  <div className={styles.topicRowTextGroup}>
                    <input
                      className={`${styles.infoKey} ${styles.infoKeyInput} ${styles.topicRowTitleInput}`}
                      type="text"
                      value={row.label}
                      placeholder="Novo assunto..."
                      style={{
                        background: 'none',
                        border: 'none',
                        boxShadow: 'none',
                        padding: 0,
                        color: getTopicNameColor(row, parsedSummary),
                        opacity: '85%',
                        fontWeight: 600,
                      }}
                      onChange={(e) => {
                        if (isReadOnlyMode) return;
                        const text = e.target.value;
                        const newRows = [...infoRows];
                        newRows[idx + 1] = { ...row, label: text };
                        setInfoRows(newRows);
                      }}
                      name={`campoExtraLabel${idx}`}
                      autoComplete="off"
                      readOnly={isReadOnlyMode}
                    />
                    {preview ? (
                      <span className={styles.topicPreviewText}>{preview}</span>
                    ) : null}
                  </div>
                </div>
                <span className={styles.topicPrimarySlot}>
                  {!isBpmnDrivenPipeline && row?.isPrimaryEntity === true ? (
                    <span
                      className={styles.topicPrimaryIndicator}
                      title="Entidade principal"
                      aria-label="Entidade principal"
                    />
                  ) : null}
                </span>

                {(() => {
                  const { items: summaryItems, isImportedFromBpmn } =
                    parsedSummary;

                  const hasContent =
                    summaryItems.length > 0 || String(row.value || '').trim();
                  const actionLabel = isImportedFromBpmn
                    ? 'Ver detalhes'
                    : hasContent
                      ? 'Ver/Editar conteúdo'
                      : 'Adicionar';

                  return (
                    <div className={styles.summaryActionSlot}>
                      <button
                        type="button"
                        className={styles.summaryPreviewButton}
                        title="Clique para abrir o conteúdo completo"
                        onClick={() =>
                          setExpandedContent({
                            rowIndex: idx + 1,
                            value: row.value || '',
                            draftValue: row.value || '',
                            fieldKey: 'conteudo',
                            fieldLabel:
                              String(row.label || '').trim() || 'Conteúdo',
                            isEditable: !isImportedFromBpmn && !isReadOnlyMode,
                          })
                        }
                      >
                        {actionLabel}
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className={styles.summaryPathCell}>
                {parsedSummary.isImportedFromBpmn ? (
                  <span
                    className={`${styles.summaryPathStatus} ${
                      parsedSummary.isOnMainPath
                        ? styles.summaryPathStatusYes
                        : styles.summaryPathStatusNo
                    }`}
                  >
                    <span className={styles.summaryPathStatusIcon}>
                      {parsedSummary.isOnMainPath ? '✓' : '✕'}
                    </span>
                    <span className={styles.summaryPathStatusText}>
                      {parsedSummary.isOnMainPath ? 'Sim' : 'Não'}
                    </span>
                  </span>
                ) : (
                  <div className={styles.manualTopicActions}>
                    <button
                      type="button"
                      className={`${styles.manualTopicStatusButton} ${
                        getManualStatus(row) === 'concluido'
                          ? styles.manualTopicStatusDone
                          : styles.manualTopicStatusPending
                      }`}
                      title="Alterar status do tópico manual"
                      onClick={() => {
                        if (isReadOnlyMode) return;
                        const newRows = [...infoRows];
                        const currentStatus = getManualStatus(row);
                        newRows[idx + 1] = {
                          ...row,
                          manualStatus:
                            currentStatus === 'concluido'
                              ? 'pendente'
                              : 'concluido',
                        };
                        setInfoRows(newRows);
                      }}
                    >
                      {getManualStatus(row) === 'concluido'
                        ? 'Concluído'
                        : isBpmnOrEntidadesPending(row)
                          ? 'Pendente (BPMN/Entidades)'
                          : 'Pendente'}
                    </button>
                    <button
                      type="button"
                      className={styles.removeTopicButton}
                      aria-label="Remover campo extra"
                      onClick={() => {
                        if (isReadOnlyMode) return;
                        const newRows = [...infoRows];
                        newRows.splice(idx + 1, 1);
                        setInfoRows(newRows);
                      }}
                      disabled={isReadOnlyMode}
                    >
                      <span className={styles.removeTopicIcon}>×</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
          </>
        ) : (
          /* ── CRM View ── */
          <div className={styles.crmViewGrid}>
            {filteredContentIndexes.length === 0 && activeFilter !== 'todos' ? (
              <div className={styles.topicEmptyFilter}>
                Nenhum tópico {activeFilter === 'pendentes' ? 'pendente' : 'concluído'}.
              </div>
            ) : null}
            {filteredContentIndexes.map(({ row, idx }) => {
              const parsedSummary = parseSummaryItems(row.value);
              const { items: summaryItems, isImportedFromBpmn } = parsedSummary;
              const status = getManualStatus(row);
              return (
                <div
                  key={idx}
                  className={`${styles.crmCard} ${status === 'concluido' ? styles.crmCardDone : ''}`}
                >
                  <div className={styles.crmCardHeader}>
                    <span
                      className={styles.crmCardTypeBadge}
                      style={{ background: getTopicTypeColor(row.topicType) }}
                    >
                      {getTopicTypeIcon(row.topicType)} {getTopicTypeLabel(row.topicType)}
                    </span>
                    <span className={`${styles.crmCardStatusBadge} ${status === 'concluido' ? styles.crmCardStatusDone : styles.crmCardStatusPending}`}>
                      {status === 'concluido' ? '✓ Concluído' : '● Pendente'}
                    </span>
                  </div>
                  <div className={styles.crmCardTitle}>
                    <input
                      className={styles.crmCardTitleInput}
                      type="text"
                      value={row.label}
                      placeholder="Nome do tópico..."
                      onChange={(e) => {
                        if (isReadOnlyMode) return;
                        const newRows = [...infoRows];
                        newRows[idx + 1] = { ...row, label: e.target.value };
                        setInfoRows(newRows);
                      }}
                      readOnly={isReadOnlyMode}
                      autoComplete="off"
                    />
                  </div>
                  {summaryItems.length > 0 ? (
                    <div className={styles.crmCardFields}>
                      {summaryItems.map((item, fi) => (
                        <div key={fi} className={styles.crmCardField}>
                          <span className={styles.crmCardFieldLabel}>{item.label}</span>
                          <span className={styles.crmCardFieldValue}>{item.content}</span>
                        </div>
                      ))}
                    </div>
                  ) : String(row.value || '').trim() ? (
                    <div className={styles.crmCardDescription}>
                      {String(row.value || '').split('\n').slice(0, 3).join(' ').slice(0, 120)}
                      {String(row.value || '').length > 120 ? '…' : ''}
                    </div>
                  ) : null}
                  {isImportedFromBpmn ? (
                    <div className={styles.crmCardFooter}>
                      <span className={`${styles.crmCardFlowBadge} ${parsedSummary.isOnMainPath ? styles.crmCardFlowYes : styles.crmCardFlowNo}`}>
                        {parsedSummary.isOnMainPath ? '✓ Fluxo principal' : '✕ Fora do fluxo'}
                      </span>
                    </div>
                  ) : null}
                  <div className={styles.crmCardActions}>
                    <button
                      type="button"
                      className={styles.summaryPreviewButton}
                      onClick={() =>
                        setExpandedContent({
                          rowIndex: idx + 1,
                          value: row.value || '',
                          draftValue: row.value || '',
                          fieldKey: 'conteudo',
                          fieldLabel: String(row.label || '').trim() || 'Conteúdo',
                          isEditable: !isImportedFromBpmn && !isReadOnlyMode,
                        })
                      }
                    >
                      {isImportedFromBpmn ? 'Ver detalhes' : 'Ver/Editar'}
                    </button>
                    {!isImportedFromBpmn ? (
                      <>
                        <button
                          type="button"
                          className={`${styles.manualTopicStatusButton} ${status === 'concluido' ? styles.manualTopicStatusDone : styles.manualTopicStatusPending}`}
                          onClick={() => {
                            if (isReadOnlyMode) return;
                            const newRows = [...infoRows];
                            newRows[idx + 1] = {
                              ...row,
                              manualStatus: status === 'concluido' ? 'pendente' : 'concluido',
                            };
                            setInfoRows(newRows);
                          }}
                        >
                          {status === 'concluido' ? 'Reabrir' : 'Concluir'}
                        </button>
                        <button
                          type="button"
                          className={styles.removeTopicButton}
                          aria-label="Remover tópico"
                          onClick={() => {
                            if (isReadOnlyMode) return;
                            const newRows = [...infoRows];
                            newRows.splice(idx + 1, 1);
                            setInfoRows(newRows);
                          }}
                          disabled={isReadOnlyMode}
                        >
                          <span className={styles.removeTopicIcon}>×</span>
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
        <div className={styles.addExtraBtnContainer}>
          {!isReadOnlyMode ? (
            <button
              type="button"
              className={styles.addButton}
              onClick={handleAddTopic}
              aria-label="Adicionar tópico"
            >
              + Adicionar tópico
            </button>
          ) : null}
        </div>
      </div>

      {expandedContent.rowIndex !== null ? (
        <Close
          title={expandedContent.fieldLabel || 'Conteúdo completo'}
          message="Conteúdo da entidade no Tópico."
          confirmLabel={expandedContent.isEditable ? 'Salvar' : 'Fechar'}
          cancelLabel="Cancelar"
          hideCancel={!expandedContent.isEditable}
          onConfirm={() => {
            if (
              expandedContent.isEditable &&
              expandedContent.rowIndex !== null
            ) {
              const rowIndex = expandedContent.rowIndex;
              const currentRow = infoRows[rowIndex];

              if (currentRow) {
                const nextRows = [...infoRows];

                if (expandedContent.fieldKey === 'conteudo') {
                  nextRows[rowIndex] = {
                    ...currentRow,
                    value: expandedContent.draftValue,
                  };
                } else {
                  nextRows[rowIndex] = {
                    ...currentRow,
                    value: updateStructuredFieldValue(
                      currentRow.value,
                      expandedContent.fieldKey,
                      expandedContent.draftValue,
                    ),
                  };
                }

                setInfoRows(nextRows);
              }
            }

            setExpandedContent({
              rowIndex: null,
              value: '',
              draftValue: '',
              fieldKey: '',
              fieldLabel: '',
              isEditable: false,
            });
          }}
          onCancel={() =>
            setExpandedContent({
              rowIndex: null,
              value: '',
              draftValue: '',
              fieldKey: '',
              fieldLabel: '',
              isEditable: false,
            })
          }
        >
          {expandedContent.isEditable ? (
            <textarea
              className={styles.fullContentTextarea}
              name="expandedContentTextarea"
              value={expandedContent.draftValue}
              onChange={(event) =>
                setExpandedContent((previous) => ({
                  ...previous,
                  draftValue: event.target.value,
                }))
              }
            />
          ) : (
            <div className={styles.summaryModalContent}>
              {(parseModalStructuredItems(expandedContent.value).length > 0
                ? parseModalStructuredItems(expandedContent.value).map(
                    (item) => `${item.label}:\n${item.content}`,
                  )
                : parseModalContentBlocks(expandedContent.value)
              ).map((contentBlock, contentIndex) => (
                <div
                  key={`topic-content-block-${contentIndex}`}
                  className={styles.summaryModalBlock}
                >
                  {contentBlock.includes(':\n') ? (
                    <>
                      <p className={styles.summaryModalBlockLabel}>
                        {contentBlock.split(':\n')[0]}:
                      </p>
                      <p className={styles.summaryModalBlockValue}>
                        {contentBlock.split(':\n').slice(1).join(':\n')}
                      </p>
                    </>
                  ) : (
                    <p className={styles.summaryModalBlockValue}>
                      {contentBlock}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Close>
      ) : null}
    </div>
  );
};

export default TopicCard;
