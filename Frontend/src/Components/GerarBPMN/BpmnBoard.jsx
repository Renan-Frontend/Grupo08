import React from 'react';
import { toOpportunitySlug } from '../Opportunities/opportunityFormatters';
import styles from './BpmnBoard.module.css';
import BpmnFlow from '../Common/BpmnFlow';
import { BPMN_STAGES } from './bpmnStages';
import { getOpportunityName, getOpportunityStage } from './opportunityHelpers';

const BpmnBoard = ({
  selectedOpportunity,
  selectedStageIndex,
  saving,
  isDraftMode,
  processName,
  onProcessNameChange,
  onChangeStage,
  onOpenOpportunity,
  selectedEntity,
  entityOptions,
  onEntityChange,
  onLinkEntity,
  onCreateEntityManual,
  onCreateOpportunityManual,
  onGeneratePathsFromBpmn,
}) => {
  const [stageCards, setStageCards] = React.useState(() =>
    BPMN_STAGES.map((stage) => ({
      id: `stage-${stage}`,
      label: stage,
      subtitle: 'Novo Processo BPMN',
      info: 'Entidade: Não vinculada',
      active: true,
    })),
  );

  const opportunityName = selectedOpportunity
    ? getOpportunityName(selectedOpportunity)
    : processName || 'Novo Processo BPMN';
  const entityName = selectedEntity || 'Não vinculada';

  React.useEffect(() => {
    setStageCards((previous) =>
      previous.map((card, index) => ({
        ...card,
        id: card.id || `stage-${BPMN_STAGES[index] || index}`,
        label: BPMN_STAGES[index] || card.label,
        subtitle: opportunityName,
        info: `Entidade: ${entityName}`,
      })),
    );
  }, [entityName, opportunityName]);

  const handleToggleStageActive = (nodeId) => {
    setStageCards((previous) => {
      const next = previous.map((card, index) =>
        card.id === nodeId ? { ...card, active: !card.active } : card,
      );

      const activeIndexes = next
        .map((card, index) => (card.active ? index : -1))
        .filter((index) => index >= 0);

      if (activeIndexes.length === 0) {
        return previous;
      }

      if (!next[selectedStageIndex]?.active) {
        onChangeStage?.(activeIndexes[0]);
      }

      return next;
    });
  };

  const activeStageLabels = React.useMemo(
    () => stageCards.filter((card) => card.active).map((card) => card.label),
    [stageCards],
  );

  const [selectedNodeId, setSelectedNodeId] = React.useState(
    stageCards[0]?.id || '',
  );

  return (
    <div className={styles.board}>
      <div className={styles.boardHeader}>
        <div>
          <h2 className={styles.boardTitle}>Fluxo da oportunidade</h2>
          <p className={styles.boardText}>
            {selectedOpportunity
              ? getOpportunityName(selectedOpportunity)
              : 'Modo rascunho: gere Entidade e Oportunidade a partir deste fluxo BPMN.'}
          </p>
        </div>
        <button
          type="button"
          className={styles.openButton}
          onClick={onOpenOpportunity}
          disabled={!selectedOpportunity}
        >
          Abrir oportunidade
        </button>
      </div>

      <BpmnFlow
        nodes={stageCards}
        connections={[]}
        currentIndex={selectedStageIndex}
        disabled={saving}
        onStageChange={onChangeStage}
        onToggleNodeActive={handleToggleStageActive}
        onSelectNode={setSelectedNodeId}
        selectedNodeId={selectedNodeId}
      />

      {isDraftMode && (
        <div className={styles.draftSection}>
          <h3 className={styles.entityTitle}>Origem do Processo (BPMN)</h3>
          <div className={styles.entityRow}>
            <input
              className={styles.entitySelect}
              type="text"
              value={processName}
              onChange={(event) => onProcessNameChange(event.target.value)}
              placeholder="Nome do processo"
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => onGeneratePathsFromBpmn(activeStageLabels)}
              disabled={saving || !processName?.trim()}
            >
              Gerar caminhos
            </button>
          </div>
          <p className={styles.helperText}>
            A pipeline usa apenas retângulos ativos.
          </p>
        </div>
      )}

      {selectedOpportunity && (
        <div className={styles.metaGrid}>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>Status atual</span>
            <strong className={styles.metaValue}>
              {getOpportunityStage(selectedOpportunity)}
            </strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>Atalho</span>
            <strong className={styles.metaValue}>
              /oportunidades/
              {toOpportunitySlug(getOpportunityName(selectedOpportunity))}
            </strong>
          </div>
        </div>
      )}

      <p className={styles.helperText}>
        Clique em uma etapa para atualizar o status da oportunidade.
      </p>

      <div className={styles.entitySection}>
        <h3 className={styles.entityTitle}>Vínculo com Entidades</h3>
        <div className={styles.entityRow}>
          <select
            className={styles.entitySelect}
            value={selectedEntity}
            onChange={(event) => onEntityChange(event.target.value)}
            disabled={saving}
          >
            <option value="">Selecione uma entidade</option>
            {entityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onLinkEntity}
            disabled={isDraftMode || !selectedEntity || saving}
          >
            Vincular
          </button>
        </div>

        <div className={styles.entityActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCreateEntityManual}
          >
            Criar entidade manual
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCreateOpportunityManual}
          >
            Criar oportunidade manual
          </button>
        </div>
      </div>
    </div>
  );
};

export default BpmnBoard;
