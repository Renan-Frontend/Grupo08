import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Ia.module.css';
import { AI_AUDIT_GET, AI_EXECUTE_POST, AI_PLAN_POST } from '../../Api';
import { EntidadesContext } from '../../Context/EntidadesContext';
import { UserContext } from '../../Context/UserContext';

const resolveToken = () =>
  window.sessionStorage.getItem('token') ||
  window.localStorage.getItem('token');

const getErrorText = async (response, fallback) => {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // no-op
  }
  return fallback;
};

const getBpmnDraftFromPlan = (plan) => {
  if (!plan || typeof plan !== 'object') return null;

  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const bpmnAction = actions.find(
    (action) => String(action?.type || '').trim() === 'update_bpmn_state',
  );
  const payload =
    bpmnAction && typeof bpmnAction.payload === 'object'
      ? bpmnAction.payload
      : null;
  if (!payload) return null;

  const nodes = Array.isArray(payload.nodes)
    ? payload.nodes.filter((node) => node && typeof node === 'object')
    : [];
  const connections = Array.isArray(payload.connections)
    ? payload.connections.filter(
        (connection) => connection && typeof connection === 'object',
      )
    : [];

  if (!nodes.length && !connections.length) return null;

  return {
    name: String(payload.name || '').trim(),
    nodes,
    connections,
    stages: Array.isArray(payload.stages)
      ? payload.stages.filter((stage) => stage && typeof stage === 'object')
      : [],
  };
};

const getActionSummary = (action) => {
  const type = String(action?.type || '').trim();
  const payload =
    action?.payload && typeof action.payload === 'object' ? action.payload : {};

  if (type === 'create_entidade') {
    const nome = String(payload.nome || '').trim() || 'Nova entidade';
    return `Vai criar a entidade "${nome}".`;
  }

  if (type === 'create_oportunidade') {
    const nome = String(payload.nome || '').trim() || 'Nova oportunidade';
    return `Vai criar a oportunidade "${nome}".`;
  }

  if (type === 'update_bpmn_state') {
    const totalEtapas = Array.isArray(payload.stages)
      ? payload.stages.length
      : Array.isArray(payload.nodes)
        ? payload.nodes.length
        : 0;
    const totalConexoes = Array.isArray(payload.connections)
      ? payload.connections.length
      : 0;
    return `Vai preparar o BPMN com ${totalEtapas} etapa(s) e ${totalConexoes} conexão(ões).`;
  }

  return 'Ação de automação pronta para execução.';
};

const getFieldPreview = (field) => {
  if (!field || typeof field !== 'object') return null;
  const nome = String(field.nome || '').trim();
  if (!nome) return null;
  const tipo = String(field.tipo || '').trim();
  const keyType = String(field.keyType || '')
    .trim()
    .toUpperCase();
  return {
    nome,
    tipo: tipo || '-',
    keyType: keyType || 'NORMAL',
  };
};

const getActionEntityPreview = (action) => {
  const type = String(action?.type || '').trim();
  const payload =
    action?.payload && typeof action.payload === 'object' ? action.payload : {};

  const entityMap = new Map();
  const upsertEntity = (entityName, fields = []) => {
    const nome = String(entityName || '').trim();
    if (!nome) return;

    const key = nome.toLowerCase();
    if (!entityMap.has(key)) {
      entityMap.set(key, { nome, fields: [] });
    }

    const current = entityMap.get(key);
    const seen = new Set(current.fields.map((item) => item.nome.toLowerCase()));
    fields.forEach((field) => {
      const parsed = getFieldPreview(field);
      if (!parsed) return;
      const fieldKey = parsed.nome.toLowerCase();
      if (seen.has(fieldKey)) return;
      seen.add(fieldKey);
      current.fields.push(parsed);
    });
  };

  if (type === 'create_entidade') {
    const campos = Array.isArray(payload.campos) ? payload.campos : [];
    upsertEntity(payload.nome, campos);
  }

  if (type === 'update_bpmn_state') {
    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    nodes
      .filter(
        (node) =>
          node &&
          typeof node === 'object' &&
          String(node.nodeType || '')
            .trim()
            .toLowerCase() === 'entidade',
      )
      .forEach((node) => {
        const fieldsFromNode = Array.isArray(node.selectedEntityFields)
          ? node.selectedEntityFields
          : [];
        const fieldNames = Array.isArray(node.selectedEntityFieldNames)
          ? node.selectedEntityFieldNames
          : [];

        const extraNameFields = fieldNames
          .map((nome) => String(nome || '').trim())
          .filter(Boolean)
          .map((nome) => ({ nome, tipo: '-', keyType: 'NORMAL' }));

        const entidadeNome =
          String(node.entidadeNome || '').trim() ||
          String(node.label || '').trim();
        upsertEntity(entidadeNome, [...fieldsFromNode, ...extraNameFields]);
      });
  }

  return Array.from(entityMap.values());
};

const parseSuggestedEntityNames = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const names = raw
    .split(/[;,\n\r]+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  names.forEach((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(name);
  });

  return unique;
};

const Ia = () => {
  const navigate = useNavigate();
  const { user } = React.useContext(UserContext);
  const { entidades } = React.useContext(EntidadesContext);
  const [processName, setProcessName] = React.useState('');
  const [goal, setGoal] = React.useState('');
  const [entityName, setEntityName] = React.useState('');
  const [isPlanning, setIsPlanning] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [plan, setPlan] = React.useState(null);
  const [auditRows, setAuditRows] = React.useState([]);
  const [selectedActionIds, setSelectedActionIds] = React.useState([]);
  const [feedback, setFeedback] = React.useState('');

  const isAdmin = user?.admin === true || user?.role === 'admin';
  const canGenerate =
    String(processName).trim().length >= 4 && String(goal).trim().length >= 10;
  const entityCatalog = React.useMemo(
    () =>
      (Array.isArray(entidades) ? entidades : []).map((entidade) => ({
        id: entidade?.id ?? null,
        nome: String(entidade?.nome || entidade?.name || '').trim(),
        descricao: String(entidade?.descricao || '').trim(),
        tipoEntidade: String(entidade?.tipoEntidade || '').trim(),
        campos: Array.isArray(entidade?.campos)
          ? entidade.campos.map((campo) => ({
              nome: String(campo?.nome || '').trim(),
              tipo: String(campo?.tipo || '').trim(),
              keyType: String(campo?.keyType || '').trim(),
            }))
          : [],
      })),
    [entidades],
  );

  const loadAudit = React.useCallback(async () => {
    if (!isAdmin) return;
    const token = resolveToken();
    if (!token) return;

    const { url, options } = AI_AUDIT_GET(token, 20);
    const response = await fetch(url, options);
    if (!response.ok) return;

    const payload = await response.json();
    setAuditRows(Array.isArray(payload?.data) ? payload.data : []);
  }, [isAdmin]);

  React.useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const handleGeneratePlan = async (event) => {
    event.preventDefault();
    if (!canGenerate || isPlanning) return;

    const token = resolveToken();
    if (!token) {
      setFeedback('Faça login novamente para usar o operador de IA.');
      return;
    }

    setIsPlanning(true);
    setFeedback('');

    const suggestedEntityNames = parseSuggestedEntityNames(entityName);

    const body = {
      goal: String(goal).trim(),
      context: {
        processName: String(processName).trim(),
        entityName: String(entityName || '').trim() || undefined,
        suggestedEntityNames:
          suggestedEntityNames.length > 0 ? suggestedEntityNames : undefined,
        existingEntities: entityCatalog,
      },
    };

    const { url, options } = AI_PLAN_POST(body, token);
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await getErrorText(
        response,
        'Falha ao gerar plano da IA.',
      );
      setFeedback(errorText);
      setIsPlanning(false);
      return;
    }

    const payload = await response.json();
    const nextPlan =
      payload?.plan && typeof payload.plan === 'object' ? payload.plan : null;
    const nextActions = Array.isArray(nextPlan?.actions)
      ? nextPlan.actions
      : [];

    setPlan(nextPlan);
    setSelectedActionIds(
      nextActions
        .map((action) => String(action?.id || '').trim())
        .filter(Boolean),
    );
    setFeedback('Plano gerado. Revise e aprove as ações para executar.');
    setIsPlanning(false);
    loadAudit();
  };

  const toggleAction = (actionId) => {
    const normalized = String(actionId || '').trim();
    if (!normalized) return;
    setSelectedActionIds((previous) => {
      if (previous.includes(normalized)) {
        return previous.filter((item) => item !== normalized);
      }
      return [...previous, normalized];
    });
  };

  const handleExecuteApproved = async () => {
    if (!plan || !selectedActionIds.length || isExecuting) return;

    const token = resolveToken();
    if (!token) {
      setFeedback('Faça login novamente para executar ações com IA.');
      return;
    }

    setIsExecuting(true);
    setFeedback('');

    const body = {
      plan,
      approvedActions: selectedActionIds,
    };

    const { url, options } = AI_EXECUTE_POST(body, token);
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await getErrorText(
        response,
        'Falha ao executar ações aprovadas da IA.',
      );
      setFeedback(errorText);
      setIsExecuting(false);
      return;
    }

    const payload = await response.json();
    const executed = Number(payload?.executed || 0);
    setFeedback(`Execução concluída. Ações executadas: ${executed}.`);
    setIsExecuting(false);
    loadAudit();
  };

  const handleOpenBpmnEditor = () => {
    const contextPanelSuggestion =
      plan && typeof plan === 'object'
        ? plan.contextPanelSuggestion || null
        : null;
    const aiCanvasDraft = getBpmnDraftFromPlan(plan);

    navigate('/gerar-bpmn/criar', {
      state: {
        processName: String(processName || '').trim() || undefined,
        aiContextPanel: contextPanelSuggestion,
        aiCanvasDraft,
      },
    });
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.hero}>
        <h1>Operador de IA Supervisionado</h1>
        <p>
          A IA pode propor e executar ações no sistema, mas sempre com aprovação
          humana, trilha de auditoria e regras de segurança.
        </p>
      </header>

      <div className={styles.grid}>
        <form className={styles.formCard} onSubmit={handleGeneratePlan}>
          <label className={styles.field}>
            <span>Nome do processo</span>
            <input
              value={processName}
              onChange={(event) => setProcessName(event.target.value)}
              placeholder="Ex.: Aprovacao de compras"
            />
          </label>

          <label className={`${styles.field} ${styles.goalField}`}>
            <span>Objetivo operacional para a IA</span>
            <textarea
              className={styles.goalTextarea}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={7}
              placeholder="Ex.: Crie uma entidade base, uma oportunidade e prepare rascunho BPMN para analise inicial"
            />
          </label>

          <label className={styles.field}>
            <span>Entidade sugerida (opcional)</span>
            <input
              value={entityName}
              onChange={(event) => setEntityName(event.target.value)}
              placeholder="Ex.: Solicitacao de Compra, Pedido, Item"
            />
          </label>

          <button
            type="submit"
            className={styles.generateButton}
            disabled={!canGenerate || isPlanning}
          >
            {isPlanning ? 'Gerando plano...' : 'Gerar plano supervisionado'}
          </button>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleOpenBpmnEditor}
          >
            Abrir editor BPMN
          </button>

          {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
        </form>

        <aside className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <h2>Ações propostas</h2>
            <button
              type="button"
              className={styles.useButton}
              onClick={handleExecuteApproved}
              disabled={!plan || !selectedActionIds.length || isExecuting}
            >
              {isExecuting ? 'Executando...' : 'Executar aprovadas'}
            </button>
          </div>

          {!plan ? (
            <p className={styles.emptyState}>
              Gere um plano para revisar as ações propostas pela IA antes de
              executar alterações no sistema.
            </p>
          ) : (
            <>
              <ul className={styles.actionList}>
                {(Array.isArray(plan.actions) ? plan.actions : []).map(
                  (action) => {
                    const actionId = String(action?.id || '').trim();
                    const checked = selectedActionIds.includes(actionId);
                    const entityPreview = getActionEntityPreview(action);
                    return (
                      <li key={actionId} className={styles.actionItem}>
                        <label className={styles.actionLabel}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAction(actionId)}
                          />
                          <span>{action?.label || 'Ação sem descrição'}</span>
                        </label>
                        <span
                          className={styles.riskTag}
                        >{`Risco: ${action?.risk || 'n/a'}`}</span>
                        <p className={styles.actionSummary}>
                          {getActionSummary(action)}
                        </p>
                        {entityPreview.length > 0 ? (
                          <div className={styles.actionEntityPreview}>
                            <strong className={styles.actionEntityTitle}>
                              Entidades e campos previstos
                            </strong>
                            <ul className={styles.actionEntityList}>
                              {entityPreview.map((entity) => (
                                <li
                                  key={entity.nome}
                                  className={styles.actionEntityItem}
                                >
                                  <span className={styles.actionEntityName}>
                                    {entity.nome}
                                  </span>
                                  <span className={styles.actionEntityFields}>
                                    {entity.fields.length > 0
                                      ? `Campos: ${entity.fields
                                          .map(
                                            (field) =>
                                              `${field.nome} (${field.tipo}${
                                                field.keyType
                                                  ? `, ${field.keyType}`
                                                  : ''
                                              })`,
                                          )
                                          .join(', ')}`
                                      : 'Campos: não informados'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    );
                  },
                )}
              </ul>
            </>
          )}

          {isAdmin ? (
            <div className={styles.auditCard}>
              <h3>Auditoria recente</h3>
              {auditRows.length === 0 ? (
                <p className={styles.emptyState}>Sem eventos de auditoria.</p>
              ) : (
                <ul className={styles.auditList}>
                  {auditRows.slice(0, 5).map((row) => (
                    <li key={row.id}>
                      <strong>{row.event}</strong>
                      <span>{row.created_at}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
};

export default Ia;
