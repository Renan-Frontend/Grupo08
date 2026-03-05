import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './GerarBPMNPage.module.css';
import { useBpmnOpportunities } from '../../Hooks/useBpmnOpportunities';
import { EntidadesContext } from '../../Context/EntidadesContext';
import { BPMN_STAGES } from './bpmnStages';
import {
  getOpportunityName,
  getOpportunityStage,
  getStageIndex,
} from './opportunityHelpers';
import {
  createOpportunity,
  getAuthToken,
} from '../Opportunities/opportunityApi';
import { toOpportunitySlug } from '../Opportunities/opportunityFormatters';
import OpportunityListPanel from './OpportunityListPanel';
import BpmnBoard from './BpmnBoard';
import Close from '../Helper/Close';

const getEntidadeName = (entidade) =>
  entidade?.nome || entidade?.name || entidade?.titulo || '';

const getLinkedEntityName = (opportunity) =>
  opportunity?.entidade ||
  opportunity?.entity ||
  opportunity?.entidadeNome ||
  '';

const GerarBPMNPage = () => {
  const navigate = useNavigate();
  const { opportunityId } = useParams();
  const isNewFlowRoute = String(opportunityId || '').toLowerCase() === 'novo';
  const { entidades, adicionarEntidade } = React.useContext(EntidadesContext);
  const [selectedEntity, setSelectedEntity] = React.useState('');
  const [draftProcessName, setDraftProcessName] =
    React.useState('Novo Processo BPMN');
  const [draftStageIndex, setDraftStageIndex] = React.useState(0);
  const [creatingPaths, setCreatingPaths] = React.useState(false);
  const [isEntityPromptOpen, setIsEntityPromptOpen] = React.useState(false);
  const [entityNameDraft, setEntityNameDraft] = React.useState('');

  const {
    loading,
    saving,
    error,
    opportunities,
    addOpportunity,
    updateOpportunityData,
    updateOpportunityStage,
  } = useBpmnOpportunities();

  const selectedOpportunity = React.useMemo(() => {
    if (!opportunityId || isNewFlowRoute) return null;
    return (
      opportunities.find((item) => String(item.id) === String(opportunityId)) ||
      null
    );
  }, [isNewFlowRoute, opportunityId, opportunities]);

  const selectedStageIndex = selectedOpportunity
    ? getStageIndex(selectedOpportunity)
    : draftStageIndex;

  const isDraftMode = !selectedOpportunity;

  React.useEffect(() => {
    if (!selectedOpportunity) {
      setSelectedEntity('');
      return;
    }

    setSelectedEntity(getLinkedEntityName(selectedOpportunity));
  }, [selectedOpportunity]);

  React.useEffect(() => {
    if (!isDraftMode || selectedEntity) return;

    const preselectedEntity = window.localStorage.getItem(
      'bpmn_preselected_entity',
    );

    if (preselectedEntity) {
      setSelectedEntity(preselectedEntity);
      window.localStorage.removeItem('bpmn_preselected_entity');
    }
  }, [isDraftMode, selectedEntity]);

  React.useEffect(() => {
    if (loading) return;

    if (isNewFlowRoute) return;

    if (opportunities.length === 0) return;

    const hasValidParam = opportunities.some(
      (item) => String(item.id) === String(opportunityId),
    );

    if (!opportunityId || !hasValidParam) {
      navigate(`/gerar-bpmn/pipeline/${opportunities[0].id}`, {
        replace: true,
      });
    }
  }, [isNewFlowRoute, loading, navigate, opportunities, opportunityId]);

  const handleSelectOpportunity = (id) => {
    navigate(`/gerar-bpmn/pipeline/${id}`);
  };

  const handleChangeStage = (nextStageIndex) => {
    if (isDraftMode) {
      setDraftStageIndex(nextStageIndex);
      return;
    }

    updateOpportunityStage({ selectedOpportunity, nextStageIndex });
  };

  const handleOpenOpportunity = () => {
    if (!selectedOpportunity) return;

    navigate(
      `/oportunidades/${toOpportunitySlug(getOpportunityName(selectedOpportunity))}`,
      {
        state: { opportunity: selectedOpportunity },
      },
    );
  };

  const handleLinkEntity = async () => {
    if (!selectedOpportunity || !selectedEntity) return;

    await updateOpportunityData({
      selectedOpportunity,
      patch: {
        entidade: selectedEntity,
        entidadeNome: selectedEntity,
        entity: selectedEntity,
      },
    });
  };

  const handleCreateEntityManual = () => {
    setEntityNameDraft('');
    setIsEntityPromptOpen(true);
  };

  const handleConfirmCreateEntityManual = async () => {
    const nome = String(entityNameDraft || '').trim();
    if (!nome) return;

    try {
      const token = window.localStorage.getItem('token');
      const created = await adicionarEntidade({ nome }, token);
      const createdName = getEntidadeName(created) || nome;
      setSelectedEntity(createdName);

      if (selectedOpportunity) {
        await updateOpportunityData({
          selectedOpportunity,
          patch: {
            entidade: createdName,
            entidadeNome: createdName,
            entity: createdName,
          },
        });
      }
    } catch {
      // erro já tratado pelo contexto/backend
    } finally {
      setIsEntityPromptOpen(false);
      setEntityNameDraft('');
    }
  };

  const handleCreateOpportunityManual = () => {
    navigate('/oportunidades/criar', {
      state: {
        creating: true,
        processName: draftProcessName,
        processStage: BPMN_STAGES[draftStageIndex],
        entidade: selectedEntity || undefined,
      },
    });
  };

  const handleProcessNameChange = (value) => {
    setDraftProcessName(value);
  };

  const handleGeneratePathsFromBpmn = async (activeStageLabels = []) => {
    const processName = draftProcessName.trim();
    if (!processName) return;

    const enabledStages = Array.isArray(activeStageLabels)
      ? activeStageLabels.filter(Boolean)
      : [];
    if (enabledStages.length === 0) return;

    const selectedDraftStage = BPMN_STAGES[draftStageIndex];
    const currentStage = enabledStages.includes(selectedDraftStage)
      ? selectedDraftStage
      : enabledStages[0];
    const currentStageIndex = enabledStages.indexOf(currentStage);

    try {
      setCreatingPaths(true);

      let entityName = selectedEntity;
      const existingEntityNames = Array.isArray(entidades)
        ? entidades.map(getEntidadeName).filter(Boolean)
        : [];

      if (!entityName) {
        entityName = `Entidade - ${processName}`;
      }

      if (!existingEntityNames.includes(entityName)) {
        const token = window.localStorage.getItem('token');
        const createdEntity = await adicionarEntidade(
          { nome: entityName },
          token,
        );
        entityName = getEntidadeName(createdEntity) || entityName;
      }

      const payload = {
        nome: processName,
        name: processName,
        status: currentStage,
        stageIndex: currentStageIndex,
        stages: enabledStages.map((stage, index) => ({
          label: stage,
          active: true,
          order: index + 1,
        })),
        entidade: entityName,
        entidadeNome: entityName,
        entity: entityName,
        source: 'bpmn',
        created_at: new Date().toISOString(),
        createdDate: new Date().toISOString(),
      };

      const response = await createOpportunity({
        payload,
        token: getAuthToken(),
      });

      const createdOpportunity = await response.json();
      addOpportunity(createdOpportunity);

      const newId = createdOpportunity?.id;
      if (newId) {
        navigate(`/gerar-bpmn/pipeline/${newId}`);
      }
    } catch {
      // erro de rede/backend já refletido pelos handlers locais
    } finally {
      setCreatingPaths(false);
    }
  };

  const entidadeOptions = React.useMemo(() => {
    const names = Array.isArray(entidades)
      ? entidades.map(getEntidadeName).filter(Boolean)
      : [];

    const linked = getLinkedEntityName(selectedOpportunity);
    return [...new Set([linked, ...names].filter(Boolean))];
  }, [entidades, selectedOpportunity]);

  const createdBpmns = React.useMemo(() => opportunities, [opportunities]);

  const handleOpenBpmnFromTable = (item) => {
    if (!item?.id) return;
    navigate(`/gerar-bpmn/pipeline/${item.id}`);
  };

  const handleOpenOpportunityFromTable = (item) => {
    navigate(`/oportunidades/${toOpportunitySlug(getOpportunityName(item))}`, {
      state: { opportunity: item },
    });
  };

  return (
    <section className={styles.container}>
      <div className={styles.card}>
        <header className={styles.header}>
          <div className={styles.icon}>🤖</div>
          <div>
            <h1 className={styles.title}>Gerar BPMN</h1>
            <p className={styles.description}>
              Fluxo de processo integrado às oportunidades via React Router.
            </p>
          </div>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.layout}>
          <OpportunityListPanel
            loading={loading}
            opportunities={opportunities}
            selectedId={opportunityId}
            onSelect={handleSelectOpportunity}
          />

          <BpmnBoard
            selectedOpportunity={selectedOpportunity}
            selectedStageIndex={selectedStageIndex}
            saving={saving || creatingPaths}
            isDraftMode={isDraftMode}
            processName={
              isDraftMode
                ? draftProcessName
                : getOpportunityName(selectedOpportunity)
            }
            onProcessNameChange={handleProcessNameChange}
            onChangeStage={handleChangeStage}
            onOpenOpportunity={handleOpenOpportunity}
            selectedEntity={selectedEntity}
            entityOptions={entidadeOptions}
            onEntityChange={setSelectedEntity}
            onLinkEntity={handleLinkEntity}
            onCreateEntityManual={handleCreateEntityManual}
            onCreateOpportunityManual={handleCreateOpportunityManual}
            onGeneratePathsFromBpmn={handleGeneratePathsFromBpmn}
          />
        </div>

        <section className={styles.createdSection}>
          <h2 className={styles.createdTitle}>BPMNs criados</h2>

          {createdBpmns.length === 0 ? (
            <p className={styles.createdEmpty}>
              Nenhum BPMN criado ainda. Use “Gerar caminhos” para criar um.
            </p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Processo</th>
                    <th>Entidade</th>
                    <th>Status</th>
                    <th>Caminho BPMN</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {createdBpmns.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          className={styles.processLink}
                          onClick={() => handleOpenBpmnFromTable(item)}
                        >
                          {getOpportunityName(item)}
                        </button>
                      </td>
                      <td>{getLinkedEntityName(item) || '-'}</td>
                      <td>{getOpportunityStage(item)}</td>
                      <td>{`/gerar-bpmn/pipeline/${item.id}`}</td>
                      <td className={styles.tableActions}>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.iconActionButton}`}
                          onClick={() => handleOpenBpmnFromTable(item)}
                          title="Abrir BPMN"
                          aria-label="Abrir BPMN"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.iconActionButton} ${styles.opportunityActionButton}`}
                          onClick={() => handleOpenOpportunityFromTable(item)}
                          title="Ir para oportunidade"
                          aria-label="Ir para oportunidade"
                        >
                          💼
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isEntityPromptOpen && (
          <Close
            title="Nova entidade"
            message="Informe o nome da nova entidade para vincular ao fluxo."
            onConfirm={handleConfirmCreateEntityManual}
            onCancel={() => {
              setIsEntityPromptOpen(false);
              setEntityNameDraft('');
            }}
            confirmLabel="Criar"
          >
            <input
              type="text"
              className={styles.draftInput}
              value={entityNameDraft}
              onChange={(event) => setEntityNameDraft(event.target.value)}
              placeholder="Nome da entidade"
              autoFocus
            />
          </Close>
        )}
      </div>
    </section>
  );
};

export default GerarBPMNPage;
