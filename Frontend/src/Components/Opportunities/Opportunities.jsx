import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Opportunities.module.css';
import Pagination from '../Common/Pagination';
import Close from '../Helper/Close';
import { UserContext } from '../../Context/UserContext';
import {
  buildAssignmentPayloadFields,
  canManageOpportunity,
  getOpportunityAssignedName,
  getOpportunityOwnerName,
} from './opportunityOwnershipRules';
import {
  fetchOpportunityUsers,
  fetchOpportunitiesPage,
  getAuthToken,
  updateOpportunityById,
} from './opportunityApi';
import {
  formatOpportunityDate,
  toOpportunitySlug,
} from './opportunityFormatters';
import { isReadOnlyAccessLevelOne } from '../../Utils/accessControl';

const Opportunities = () => {
  const navigate = useNavigate();
  const { user } = React.useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);

  // Exemplo: buscar oportunidades da API (ajuste endpoint conforme backend)
  const [opportunities, setOpportunities] = React.useState([]);
  const [totalPages, setTotalPages] = React.useState(1);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [userOptions, setUserOptions] = React.useState([]);
  const [noticeMessage, setNoticeMessage] = React.useState('');
  const itemsPerPage = 10;

  const updateAssignedTo = async (opportunityId, assignedValue) => {
    const targetOpportunity = opportunities.find(
      (item) => item.id === opportunityId,
    );
    if (!targetOpportunity) return;

    const payload = {
      ...targetOpportunity,
      nome:
        targetOpportunity.nome || targetOpportunity.name || 'Nova Oportunidade',
      name:
        targetOpportunity.name || targetOpportunity.nome || 'Nova Oportunidade',
      ...buildAssignmentPayloadFields(assignedValue),
    };

    const updated = await updateOpportunityById({
      opportunityId,
      payload,
      token: getAuthToken(),
    });
    setOpportunities((prev) =>
      prev.map((item) =>
        item.id === opportunityId ? { ...item, ...updated } : item,
      ),
    );
  };

  const handleAssignedChange = async (opportunityId, newAssignedValue) => {
    const previousItems = opportunities;
    setOpportunities((prev) =>
      prev.map((item) =>
        item.id === opportunityId
          ? {
              ...item,
              ...buildAssignmentPayloadFields(newAssignedValue),
            }
          : item,
      ),
    );

    try {
      await updateAssignedTo(opportunityId, newAssignedValue);
    } catch (updateError) {
      setOpportunities(previousItems);
      setNoticeMessage(
        updateError.message || 'Não foi possível alterar o responsável.',
      );
    }
  };

  React.useEffect(() => {
    async function fetchOpportunities() {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchOpportunitiesPage({
          page: currentPage,
          limit: itemsPerPage,
          token: getAuthToken(),
        });
        setOpportunities(json.data || []);
        setTotalPages(json.total ? Math.ceil(json.total / itemsPerPage) : 1);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchOpportunities();
  }, [currentPage]);

  React.useEffect(() => {
    async function fetchUsers() {
      try {
        const users = await fetchOpportunityUsers({ token: getAuthToken() });
        setUserOptions(users);
      } catch {
        setUserOptions([]);
      }
    }

    fetchUsers();
  }, []);

  const paginatedItems = opportunities;

  const nextPage = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const prevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));

  const handleNovaOportunidade = () => {
    if (isReadOnlyMode) {
      setNoticeMessage(
        'Seu nível de acesso permite apenas visualização de oportunidades.',
      );
      return;
    }
    // Navega para OpportunityDetail sem dados, indicando criação
    navigate('/oportunidades/criar', { state: { creating: true } });
  };

  if (loading) {
    return (
      <div className={styles.opportunitiesContainer}>
        <p>Carregando oportunidades...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.opportunitiesContainer}>
        <p style={{ color: 'red' }}>Erro: {error}</p>
      </div>
    );
  }

  return (
    <div className={styles.opportunitiesContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>Oportunidades</h1>
        <div className={styles.headerActions}>
          {!isReadOnlyMode ? (
            <button
              className={styles.createBtn}
              onClick={handleNovaOportunidade}
            >
              ✚ Nova Oportunidade
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colName}>Nome</th>
              <th className={styles.colOwner}>Proprietário</th>
              <th className={styles.colAssigned}>Atribuído à</th>
              <th className={styles.colStatus}>Status</th>
              <th className={styles.colCreated}>Data de criação</th>
              <th className={styles.colEnd}>Data Final</th>
              <th className={styles.colActions}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((opportunity) => (
              <tr key={opportunity.id}>
                <td className={`${styles.nameCell} ${styles.colName}`}>
                  <button
                    type="button"
                    className={styles.nameLink}
                    onClick={() =>
                      navigate(
                        `/oportunidades/${toOpportunitySlug(opportunity.name)}`,
                        {
                          state: { opportunity },
                        },
                      )
                    }
                  >
                    {opportunity.name}
                  </button>
                </td>
                <td className={styles.colOwner}>
                  {getOpportunityOwnerName(opportunity) || '-'}
                </td>
                <td className={styles.colAssigned}>
                  <select
                    className={styles.assignedSelect}
                    value={getOpportunityAssignedName(opportunity)}
                    disabled={
                      isReadOnlyMode || !canManageOpportunity(user, opportunity)
                    }
                    onChange={(event) =>
                      handleAssignedChange(opportunity.id, event.target.value)
                    }
                  >
                    {[getOpportunityAssignedName(opportunity), ...userOptions]
                      .filter(Boolean)
                      .filter(
                        (value, index, arr) => arr.indexOf(value) === index,
                      )
                      .map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                  </select>
                </td>
                <td className={styles.colStatus}>
                  {opportunity.status || opportunity.etapa || '-'}
                </td>
                <td className={styles.colCreated}>{opportunity.createdDate}</td>
                <td className={styles.colEnd}>
                  {formatOpportunityDate(
                    opportunity.endDate ||
                      opportunity.end_date ||
                      opportunity.dataFinal ||
                      opportunity.data_encerramento,
                  )}
                </td>
                <td className={`${styles.colActions} ${styles.tableActions}`}>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.iconActionButton} ${styles.bpmnActionButton}`}
                    title="Abrir BPMN"
                    aria-label="Abrir BPMN"
                    onClick={() =>
                      navigate(`/gerar-bpmn/pipeline/${opportunity.id}`)
                    }
                  >
                    🤖
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.iconActionButton} ${styles.editActionButton}`}
                    title="Editar oportunidade"
                    aria-label="Editar oportunidade"
                    onClick={() =>
                      navigate(
                        `/oportunidades/${toOpportunitySlug(opportunity.name)}`,
                        {
                          state: { opportunity },
                        },
                      )
                    }
                  >
                    <span className={styles.editIconGlyph}>✏️</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {noticeMessage ? (
          <Close
            title="Aviso"
            message={noticeMessage}
            onConfirm={() => setNoticeMessage('')}
            onCancel={() => setNoticeMessage('')}
            confirmLabel="OK"
            hideCancel
          />
        ) : null}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevious={prevPage}
        onNext={nextPage}
      />
    </div>
  );
};

export default Opportunities;
