import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './GerarBPMNStart.module.css';
import Close from '../Helper/Close';
import { useBpmnOpportunities } from '../../Hooks/useBpmnOpportunities';
import { UserContext } from '../../Context/UserContext';
import { isReadOnlyAccessLevelOne } from '../../Utils/accessControl';
import { getOpportunityName, getOpportunityStage } from './opportunityHelpers';
import { toOpportunitySlug } from '../Opportunities/opportunityFormatters';
import {
  deleteOpportunityById,
  getAuthToken,
} from '../Opportunities/opportunityApi';

const BPMN_EDITOR_LOCAL_STORAGE_KEY = 'bpmn_editor_create_draft_v1';
const BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY =
  'bpmn_editor_saved_opportunity_by_slug_v1';

const slugifyBpmnName = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'novo-bpmn';

const getOpportunityCreatedAt = (opportunity) =>
  opportunity?.created_at ||
  opportunity?.createdDate ||
  opportunity?.createdAt ||
  opportunity?.criadoEm ||
  null;

const formatOpportunityCreatedAt = (opportunity) => {
  const rawValue = getOpportunityCreatedAt(opportunity);
  if (!rawValue) return '-';

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return '-';

  return parsedDate.toLocaleDateString('pt-BR');
};

const isBpmnStageNode = (node) => {
  const nodeType = String(node?.nodeType || '')
    .trim()
    .toLowerCase();
  return (
    node?.active !== false &&
    ['entidade', 'task', 'condicional'].includes(nodeType)
  );
};

const getBpmnStructureSummary = (opportunity) => {
  const nodes = Array.isArray(opportunity?.bpmn?.nodes)
    ? opportunity.bpmn.nodes
    : [];
  const connections = Array.isArray(opportunity?.bpmn?.connections)
    ? opportunity.bpmn.connections
    : [];

  const activeNodesCount = nodes.filter(
    (node) => node?.active !== false,
  ).length;
  return `${activeNodesCount} nós • ${connections.length} conexões`;
};

const getBpmnFlowStepsSummary = (opportunity) => {
  const nodes = Array.isArray(opportunity?.bpmn?.nodes)
    ? opportunity.bpmn.nodes
    : [];

  const stagesCount = nodes.filter((node) => isBpmnStageNode(node)).length;
  return `${stagesCount} etapas`;
};

const GerarBPMNStart = () => {
  const navigate = useNavigate();
  const { user } = React.useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const { loading, opportunities, removeOpportunity, addOpportunity } =
    useBpmnOpportunities();
  const [deleteConfirmItem, setDeleteConfirmItem] = React.useState(null);
  const [noticeMessage, setNoticeMessage] = React.useState('');

  const createdBpmns = React.useMemo(() => opportunities, [opportunities]);

  const handleOpenBpmnFromTable = (item) => {
    if (!item?.id) return;
    const bpmnName = getOpportunityName(item) || 'Novo BPMN';
    const bpmnSlug = slugifyBpmnName(bpmnName);
    const hasBpmnSnapshot =
      item?.bpmn &&
      (Array.isArray(item?.bpmn?.nodes) ||
        Array.isArray(item?.bpmn?.connections));
    const nodes = Array.isArray(item?.bpmn?.nodes) ? item.bpmn.nodes : [];
    const connections = Array.isArray(item?.bpmn?.connections)
      ? item.bpmn.connections
      : [];

    try {
      if (hasBpmnSnapshot) {
        window.localStorage.setItem(
          BPMN_EDITOR_LOCAL_STORAGE_KEY,
          JSON.stringify({
            name: bpmnName,
            nodes,
            connections,
            updated_at: new Date().toISOString(),
          }),
        );
      } else {
        const rawDraft = window.localStorage.getItem(
          BPMN_EDITOR_LOCAL_STORAGE_KEY,
        );
        if (rawDraft) {
          const parsedDraft = JSON.parse(rawDraft);
          const draftSlug = slugifyBpmnName(parsedDraft?.name || '');
          if (draftSlug === bpmnSlug) {
            window.localStorage.removeItem(BPMN_EDITOR_LOCAL_STORAGE_KEY);
          }
        }
      }

      const rawMap = window.localStorage.getItem(
        BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
      );
      const existingMap = rawMap ? JSON.parse(rawMap) : {};
      const nextMap = {
        ...(existingMap && typeof existingMap === 'object' ? existingMap : {}),
        [bpmnSlug]: item.id,
      };
      window.localStorage.setItem(
        BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
        JSON.stringify(nextMap),
      );
    } catch (error) {}

    navigate(`/gerar-bpmn/${bpmnSlug}`);
  };

  const handleDeleteBpmnFromTable = (item) => {
    if (isReadOnlyMode) {
      setNoticeMessage(
        'Seu nível de acesso permite apenas visualização de BPMNs.',
      );
      return;
    }
    if (!item?.id) return;
    setDeleteConfirmItem(item);
  };

  const handleOpenOpportunityFromTable = (item) => {
    const opportunityName = getOpportunityName(item);
    navigate(`/oportunidades/${toOpportunitySlug(opportunityName)}`, {
      state: { opportunity: item },
    });
  };

  const confirmDeleteBpmnFromTable = async () => {
    const item = deleteConfirmItem;
    if (!item?.id) return;

    try {
      await deleteOpportunityById({
        opportunityId: item.id,
        token: getAuthToken(),
      });

      removeOpportunity(item.id);

      const bpmnSlug = slugifyBpmnName(getOpportunityName(item));
      const rawMap = window.localStorage.getItem(
        BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
      );
      if (rawMap) {
        const parsedMap = JSON.parse(rawMap);
        if (parsedMap && typeof parsedMap === 'object') {
          delete parsedMap[bpmnSlug];
          window.localStorage.setItem(
            BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
            JSON.stringify(parsedMap),
          );
        }
      }

      const rawDraft = window.localStorage.getItem(
        BPMN_EDITOR_LOCAL_STORAGE_KEY,
      );
      if (rawDraft) {
        const parsedDraft = JSON.parse(rawDraft);
        const draftSlug = slugifyBpmnName(parsedDraft?.name || '');
        if (draftSlug === bpmnSlug) {
          window.localStorage.removeItem(BPMN_EDITOR_LOCAL_STORAGE_KEY);
        }
      }
    } catch (error) {
      setNoticeMessage('Não foi possível deletar o BPMN.');
    } finally {
      setDeleteConfirmItem(null);
    }
  };

  const handleCreateBpmn = () => {
    if (isReadOnlyMode) {
      setNoticeMessage(
        'Seu nível de acesso permite apenas visualização de BPMNs.',
      );
      return;
    }
    try {
      window.localStorage.removeItem(BPMN_EDITOR_LOCAL_STORAGE_KEY);
    } catch (error) {}

    navigate('/gerar-bpmn/criar');
  };

  return (
    <section className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Gerar BPMN</h1>
        <p className={styles.description}>
          Escolha como deseja iniciar o processo.
        </p>

        <div className={styles.actions}>
          {!isReadOnlyMode ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleCreateBpmn}
            >
              Criar BPMN
            </button>
          ) : (
            <p className={styles.createdEmpty}>
              Modo somente visualização ativo para o seu nível de acesso.
            </p>
          )}
        </div>

        <section className={styles.createdSection}>
          <h2 className={styles.createdTitle}>BPMNs criados</h2>

          {loading ? (
            <p className={styles.createdEmpty}>Carregando BPMNs...</p>
          ) : createdBpmns.length === 0 ? (
            <p className={styles.createdEmpty}>
              {isReadOnlyMode
                ? 'Nenhum BPMN disponível para visualização no momento.'
                : 'Nenhum BPMN criado ainda. Clique em “Criar BPMN”.'}
            </p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome do Processo</th>
                    <th>Status</th>
                    <th>Etapas do Fluxo</th>
                    <th>Estrutura BPMN</th>
                    <th>Data de Criação</th>
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
                      <td>{getOpportunityStage(item)}</td>
                      <td>{getBpmnFlowStepsSummary(item)}</td>
                      <td>{getBpmnStructureSummary(item)}</td>
                      <td>{formatOpportunityCreatedAt(item)}</td>
                      <td className={styles.tableActions}>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.iconActionButton}`}
                          onClick={() => handleOpenBpmnFromTable(item)}
                          title={
                            isReadOnlyMode ? 'Visualizar BPMN' : 'Editar BPMN'
                          }
                          aria-label={
                            isReadOnlyMode ? 'Visualizar BPMN' : 'Editar BPMN'
                          }
                        >
                          {isReadOnlyMode ? '👁️' : '✏️'}
                        </button>
                        {!isReadOnlyMode ? (
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.iconActionButton} ${styles.deleteActionButton}`}
                            onClick={() => handleDeleteBpmnFromTable(item)}
                            title="Deletar BPMN"
                            aria-label="Deletar BPMN"
                          >
                            🗑️
                          </button>
                        ) : null}
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
      </div>

      {deleteConfirmItem && (
        <Close
          title="Deletar BPMN"
          message={`Deseja deletar o BPMN "${getOpportunityName(deleteConfirmItem)}"?`}
          onConfirm={confirmDeleteBpmnFromTable}
          onCancel={() => setDeleteConfirmItem(null)}
        />
      )}

      {noticeMessage && (
        <Close
          title="Aviso"
          message={noticeMessage}
          onConfirm={() => setNoticeMessage('')}
          onCancel={() => setNoticeMessage('')}
          confirmLabel="OK"
          hideCancel
        />
      )}
    </section>
  );
};

export default GerarBPMNStart;
