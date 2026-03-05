import React from 'react';
import Close from '../../Helper/Close';
import styles from '../OpportunityDetail.module.css';

const TopicCard = ({
  showTopico,
  isEditing,
  showPipeline,
  infoRows,
  setInfoRows,
  isBpmnDrivenPipeline,
  toggleTopico,
}) => {
  const [expandedContent, setExpandedContent] = React.useState({
    rowIndex: null,
    value: '',
    draftValue: '',
    fieldKey: '',
    fieldLabel: '',
    isEditable: false,
  });

  if (!showTopico) return null;

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

  const handleAddTopic = () => {
    const nextRowIndex = infoRows.length;
    setInfoRows([
      ...infoRows,
      {
        label: '',
        value: '',
        topicType: 'dados',
        isPrimaryEntity: false,
        manualStatus: 'pendente',
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
              width: '100%',
              minWidth: 0,
            }}
            maxLength={50}
            onChange={(e) => {
              const input = e.target;
              const text = input.value;
              updateTextIfFits(input, text, () => {
                const newRows = [...infoRows];
                newRows[0] = { ...newRows[0], label: text };
                setInfoRows(newRows);
              });
            }}
            name="topicoLabel"
            autoComplete="off"
          />
        </div>
      </div>
      <div className={styles.infoList}>
        {hasImportedBpmnRows ? (
          <div className={styles.summaryPathHeaderRow}>
            <span className={styles.summaryTopicHeader}>Tópico</span>
            <span className={styles.summaryPathHeader}>Fluxo BPMN</span>
          </div>
        ) : null}
        {infoRows.slice(1).map((row, idx) => {
          const parsedSummary = parseSummaryItems(row.value);

          return (
            <div key={idx} className={styles.infoRow}>
              <div className={styles.infoRowFields}>
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
                    const input = e.target;
                    const text = input.value;
                    updateTextIfFits(input, text, () => {
                      const newRows = [...infoRows];
                      newRows[idx + 1] = { ...row, label: text };
                      setInfoRows(newRows);
                    });
                  }}
                  name={`campoExtraLabel${idx}`}
                  autoComplete="off"
                />
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
                    <div className={styles.summaryContent}>
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
                            fieldLabel: 'Conteúdo',
                            isEditable: !isImportedFromBpmn,
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
                        : 'Pendente'}
                    </button>
                    <button
                      type="button"
                      className={styles.removeTopicButton}
                      aria-label="Remover campo extra"
                      onClick={() => {
                        const newRows = [...infoRows];
                        newRows.splice(idx + 1, 1);
                        setInfoRows(newRows);
                      }}
                    >
                      <span className={styles.removeTopicIcon}>×</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className={styles.addExtraBtnContainer}>
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddTopic}
            aria-label="Adicionar campo extra"
          >
            +
          </button>
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
