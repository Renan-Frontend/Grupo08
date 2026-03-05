import React, { useState, useEffect } from 'react';
import Close from '../../Helper/Close';
import styles from './EditablePipeline.module.css';
const PipelineCircleIcon = () => (
  <span
    style={{
      verticalAlign: 'middle',
      display: 'inline-flex',
      lineHeight: 0,
      margin: 0,
    }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ display: 'block' }}
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
      verticalAlign: 'middle',
      display: 'inline-flex',
      lineHeight: 0,
      margin: 0,
    }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ display: 'block' }}
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
      verticalAlign: 'middle',
      display: 'inline-flex',
      lineHeight: 0,
      margin: 0,
    }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      style={{ display: 'block' }}
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
  stages,
  setStages,
  pipelineTitle: controlledPipelineTitle,
  setPipelineTitle: setControlledPipelineTitle,
  pipelineSubtitle: controlledPipelineSubtitle,
  setPipelineSubtitle: setControlledPipelineSubtitle,
}) => {
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeStage, setActiveStage] = useState(() => {
    const saved = localStorage.getItem('pipelineActiveStage');
    return saved ? JSON.parse(saved) : -1;
  });
  const [resetConfirm, setResetConfirm] = useState(false);
  const [localPipelineTitle, setLocalPipelineTitle] = useState(() => {
    const saved = localStorage.getItem('pipelineTitle');
    return saved || '';
  });
  const [localPipelineSubtitle, setLocalPipelineSubtitle] = useState(() => {
    const saved = localStorage.getItem('pipelineSubtitle');
    return saved || '';
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
  const isBpmnDrivenPipeline = stages.some((stage) => stage?.fromBpmn === true);

  const getStagePalette = (stage) => {
    const stageType = String(stage?.stageType || '')
      .trim()
      .toLowerCase();

    if (stageType === 'condicional') {
      return {
        base: '#3b82f6',
        soft: 'rgba(59, 130, 246, 0.3)',
        softHover: 'rgba(59, 130, 246, 0.5)',
        contrast: '#3b82f6',
      };
    }

    if (stageType === 'task') {
      return {
        base: '#f4b400',
        soft: 'rgba(244, 180, 0, 0.3)',
        softHover: 'rgba(244, 180, 0, 0.5)',
        contrast: '#8a6a00',
      };
    }

    return {
      base: '#2fb36d',
      soft: 'rgba(47, 179, 109, 0.3)',
      softHover: 'rgba(47, 179, 109, 0.5)',
      contrast: '#2fb36d',
    };
  };

  useEffect(() => {
    localStorage.setItem('pipelineStages', JSON.stringify(stages));

    // Ajusta altura dos textareas quando stages mudam (mantido para clareza, pode remover se desejar)
    setTimeout(() => {
      const textareas = document.querySelectorAll(`.${styles.circleLabel}`);
      textareas.forEach((textarea) => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      });
    }, 0);
  }, [stages]);

  useEffect(() => {
    localStorage.setItem('pipelineActiveStage', JSON.stringify(activeStage));
  }, [activeStage]);

  useEffect(() => {
    localStorage.setItem('pipelineTitle', pipelineTitle);
    setTimeout(() => {
      const titleTextarea = document.querySelector(`.${styles.leftTitle}`);
      if (titleTextarea) {
        titleTextarea.style.height = 'auto';
        titleTextarea.style.height = titleTextarea.scrollHeight + 'px';
      }
    }, 0);
  }, [pipelineTitle]);

  useEffect(() => {
    localStorage.setItem('pipelineSubtitle', pipelineSubtitle);
    setTimeout(() => {
      const subtitleTextarea = document.querySelector(
        `.${styles.leftSubtitle}`,
      );
      if (subtitleTextarea) {
        subtitleTextarea.style.height = 'auto';
        subtitleTextarea.style.height = subtitleTextarea.scrollHeight + 'px';
      }
    }, 0);
  }, [pipelineSubtitle]);

  const addStage = () => {
    if (isBpmnDrivenPipeline) return;
    if (stages.length >= 7) return;
    const newId =
      stages.length > 0 ? Math.max(...stages.map((s) => s.id)) + 1 : 1;
    setStages([...stages, { id: newId, label: '', done: false }]);
  };

  const resetToDefault = () => {
    if (isBpmnDrivenPipeline) return;
    setStages([
      { id: 1, label: '', done: false },
      { id: 2, label: '', done: false },
      { id: 3, label: '', done: false },
    ]);
    setActiveStage(-1);
    setResetConfirm(false);
  };

  const handleAddOrReset = () => {
    if (isBpmnDrivenPipeline) return;
    if (stages.length >= 7) {
      setResetConfirm(true);
    } else {
      addStage();
    }
  };

  const removeStage = (id) => {
    if (isBpmnDrivenPipeline) return;
    stages.length > 1 && setDeleteConfirm(id);
  };

  const confirmRemove = () => {
    const newStages = stages.filter((stage) => stage.id !== deleteConfirm);
    setStages(newStages);
    if (activeStage >= newStages.length) {
      setActiveStage(newStages.length - 1);
    }
    setDeleteConfirm(null);
  };

  const updateStage = (id, updates) => {
    if (
      isBpmnDrivenPipeline &&
      Object.prototype.hasOwnProperty.call(updates, 'label')
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
    e.target.style.height = 'auto';
    // Limita altura dos campos do pipelineLeft
    const isPipelineLeftField =
      e.target.classList.contains(styles.leftTitle) ||
      e.target.classList.contains(styles.leftSubtitle);
    if (isPipelineLeftField) {
      const maxHeightPx = 2.4 * 16;
      if (e.target.scrollHeight > maxHeightPx) {
        e.target.style.height = maxHeightPx + 'px';
      } else {
        e.target.style.height = e.target.scrollHeight + 'px';
      }
    } else {
      // Para os labels dos stages, expansão normal
      e.target.style.height = e.target.scrollHeight + 'px';
    }
  };

  const handleStageClick = (index, stage) => {
    if (stage.done) {
      // Desativa esta e todas as seguintes
      setStages(stages.map((s, i) => (i >= index ? { ...s, done: false } : s)));
      setActiveStage(index - 1);
    } else {
      // Ativa apenas se anteriores completas
      const allPreviousCompleted = stages.slice(0, index).every((s) => s.done);

      if (index === 0 || allPreviousCompleted) {
        // Só ativa se for a primeira ou anteriores completas
        updateStage(stage.id, { done: true });
        setActiveStage(index);
      }
    }
  };

  const allCompleted = stages.every((stage) => stage.done);
  const anyCompleted = stages.some((stage) => stage.done);
  const completedCount = stages.filter((stage) => stage.done).length;

  const progressPercentage = anyCompleted
    ? allCompleted
      ? 100
      : Math.min((completedCount / (stages.length + 1)) * 100, 100)
    : 0;

  return (
    <div className={styles.pipelineShell}>
      <div className={styles.pipelineFrame}>
        <div className={styles.pipelineLeft}>
          <div className={styles.editableField}>
            <textarea
              className={styles.leftTitle}
              value={pipelineTitle}
              onChange={(e) => setPipelineTitleValue(e.target.value)}
              onInput={handleTextareaInput}
              placeholder="Título da pipeline..."
              maxLength={50}
              rows={1}
            />
            <svg
              className={styles.editIcon}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </div>
          <div className={styles.editableField}>
            <textarea
              className={styles.leftSubtitle}
              value={pipelineSubtitle}
              onChange={(e) => setPipelineSubtitleValue(e.target.value)}
              onInput={handleTextareaInput}
              placeholder="Subtítulo..."
              maxLength={50}
              rows={1}
            />
            <svg
              className={styles.editIcon}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </div>
        </div>
        <div className={styles.pipelineMain}>
          <div className={styles.pipelineTopBar}>
            <div
              className={styles.progressBar}
              style={{ '--progress-percentage': `${progressPercentage}%` }}
            />
            {stages.map((stage, index) => {
              const palette = getStagePalette(stage);

              return (
                <div key={stage.id} className={styles.circleWrapper}>
                  <div
                    className={`${styles.circle} ${stage.done ? styles.circleCompleted : ''}`}
                    style={
                      isBpmnDrivenPipeline
                        ? {
                            background: stage.done ? palette.base : '#d0d0d0',
                          }
                        : undefined
                    }
                  >
                    <button
                      className={styles.completeButton}
                      onClick={() => handleStageClick(index, stage)}
                      style={
                        isBpmnDrivenPipeline
                          ? stage.done
                            ? {
                                background: '#fff',
                                borderColor: '#fff',
                                color: palette.contrast,
                              }
                            : {
                                background: palette.soft,
                                borderColor: palette.base,
                              }
                          : undefined
                      }
                      onMouseEnter={(event) => {
                        if (!isBpmnDrivenPipeline || stage.done) return;
                        event.currentTarget.style.background =
                          palette.softHover;
                      }}
                      onMouseLeave={(event) => {
                        if (!isBpmnDrivenPipeline || stage.done) return;
                        event.currentTarget.style.background = palette.soft;
                      }}
                      title={
                        isBpmnDrivenPipeline
                          ? stage.done
                            ? 'Marcar como incompleto (pipeline BPMN)'
                            : 'Marcar como completo (pipeline BPMN)'
                          : stage.done
                            ? 'Marcar como incompleto'
                            : 'Marcar como completo'
                      }
                    >
                      {stage.done && '✓'}
                    </button>
                    {!isBpmnDrivenPipeline && stages.length > 1 && (
                      <button
                        className={styles.removeButton}
                        onClick={() => removeStage(stage.id)}
                        title="Remover etapa"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <textarea
                    className={styles.circleLabel}
                    value={stage.label}
                    onChange={(e) =>
                      updateStage(stage.id, { label: e.target.value })
                    }
                    onInput={handleTextareaInput}
                    placeholder={
                      isBpmnDrivenPipeline ? 'Entidade da etapa' : 'Digite...'
                    }
                    rows={2}
                    maxLength={20}
                    readOnly={isBpmnDrivenPipeline}
                  />
                </div>
              );
            })}
          </div>
          {!isBpmnDrivenPipeline ? (
            <button
              className={`${styles.addButton} ${stages.length >= 7 ? styles.resetButton : ''}`}
              onClick={handleAddOrReset}
              title={
                stages.length >= 7
                  ? 'Resetar para padrão (3 etapas)'
                  : 'Adicionar etapa'
              }
            >
              {stages.length >= 7 ? '×' : '+'}
            </button>
          ) : null}
        </div>
      </div>
      <p className={styles.pipelineNote}>
        {isBpmnDrivenPipeline ? (
          '* Pipeline sincronizada com o BPMN: os nomes abaixo das bolinhas seguem as entidades do fluxo. *'
        ) : (
          <>
            {'* '}Clique no <PipelineAddButtonIcon /> para adicionar etapas, no
            botão <PipelineCircleIcon /> para completar, no{' '}
            <PipelineRemoveButtonIcon /> para remover.{' *'}
          </>
        )}
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
  );
};
export default EditablePipeline;
