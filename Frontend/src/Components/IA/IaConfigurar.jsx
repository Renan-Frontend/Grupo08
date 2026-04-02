import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './IaConfigurar.module.css';
import { AI_AUDIT_GET, AI_EXECUTE_POST, AI_PLAN_POST } from '../../Api';
import { EntidadesContext } from '../../Context/EntidadesContext';
import { UserContext } from '../../Context/UserContext';
import {
  resolveToken,
  getErrorText,
  getBpmnDraftFromPlan,
  getActionSummary,
  getGeneralAnalysis,
  getActionEntityPreview,
  ENTITY_TEMPLATE,
  ACTIVITY_TEMPLATE,
  CONDITIONAL_TEMPLATE,
  FLOW_TEMPLATE,
} from './iaHelpers';

const BPMN_SAVED_OPPORTUNITY_MAP_KEY = 'bpmn_editor_saved_opportunity_by_slug_v1';

const slugifyBpmnName = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'novo-bpmn';

const IaConfigurar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = React.useContext(UserContext);
  const { entidades } = React.useContext(EntidadesContext);

  const locationParseData = location.state?.parseData ?? null;
  const locationIntroName = location.state?.introName ?? '';
  const locationProcessDescription = location.state?.processDescription ?? '';

  const [processName, setProcessName] = React.useState('');
  const [entities, setEntities] = React.useState([]);
  const [entityDraft, setEntityDraft] = React.useState('');
  const [activities, setActivities] = React.useState([]);
  const [activityDraft, setActivityDraft] = React.useState('');
  const [conditionals, setConditionals] = React.useState([]);
  const [conditionalDraft, setConditionalDraft] = React.useState('');
  const [flowOrder, setFlowOrder] = React.useState([]);
  const [expandedDescIdx, setExpandedDescIdx] = React.useState(null);
  const [isPlanning, setIsPlanning] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [plan, setPlan] = React.useState(null);
  const [auditRows, setAuditRows] = React.useState([]);
  const [selectedActionIds, setSelectedActionIds] = React.useState([]);
  const [feedback, setFeedback] = React.useState('');

  const generalAnalysis = React.useMemo(() => getGeneralAnalysis(plan), [plan]);
  const isAdmin = user?.admin === true || user?.role === 'admin';
  const canGenerate =
    String(processName).trim().length >= 4 &&
    (flowOrder.length > 0 || entities.length > 0 || activities.length > 0);

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

  // Popula o formulário com dados vindos de /ia via navigate state
  React.useEffect(() => {
    if (!locationParseData) return;
    if (locationParseData.processName)
      setProcessName(locationParseData.processName);
    else if (locationIntroName) setProcessName(locationIntroName);

    const fo = Array.isArray(locationParseData.flowOrder)
      ? locationParseData.flowOrder
      : [];

    const mappedFo = fo.map((item) => ({
      name: String(item.name || '').trim(),
      type: String(item.type || 'task').trim(),
      desc: String(item.desc || '').trim(),
      ...(item.tipoEntidade ? { tipoEntidade: item.tipoEntidade } : {}),
      ...(item.branches ? { branches: item.branches } : {}),
    }));

    const foNames = new Set(mappedFo.map((i) => i.name.toLowerCase()));

    (Array.isArray(locationParseData.entities)
      ? locationParseData.entities
      : []
    ).forEach((ent) => {
      const n =
        typeof ent === 'object'
          ? String(ent?.name || '').trim()
          : String(ent || '').trim();
      const tipo =
        typeof ent === 'object' ? ent?.tipoEntidade || 'apoio' : 'apoio';
      if (n && !foNames.has(n.toLowerCase())) {
        mappedFo.push({
          name: n,
          type: 'entidade',
          desc: '',
          tipoEntidade: tipo,
        });
        foNames.add(n.toLowerCase());
      }
    });

    (Array.isArray(locationParseData.activities)
      ? locationParseData.activities
      : []
    ).forEach((name) => {
      const n = String(name || '').trim();
      if (n && !foNames.has(n.toLowerCase())) {
        mappedFo.push({ name: n, type: 'task', desc: '' });
        foNames.add(n.toLowerCase());
      }
    });

    (Array.isArray(locationParseData.conditionals)
      ? locationParseData.conditionals
      : []
    ).forEach((name) => {
      let n = String(name || '').trim();
      if (!n) return;
      if (!n.endsWith('?')) n += '?';
      if (!foNames.has(n.toLowerCase())) {
        mappedFo.push({ name: n, type: 'condicional', desc: '' });
        foNames.add(n.toLowerCase());
      }
    });

    setFlowOrder(mappedFo);
    setEntities(
      mappedFo.filter((i) => i.type === 'entidade').map((i) => i.name),
    );
    setActivities(mappedFo.filter((i) => i.type === 'task').map((i) => i.name));
    setConditionals(
      mappedFo
        .filter((i) => i.type === 'condicional')
        .map((i) => (i.name.endsWith('?') ? i.name : i.name + '?')),
    );
  }, [locationParseData, locationIntroName]);

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

  const addEntity = () => {
    const trimmed = entityDraft.trim();
    if (trimmed && !entities.includes(trimmed)) {
      setEntities((prev) => [...prev, trimmed]);
      setFlowOrder((prev) => [
        ...prev,
        { name: trimmed, type: 'entidade', desc: '' },
      ]);
    }
    setEntityDraft('');
  };

  const removeEntity = (name) => {
    setEntities((prev) => prev.filter((e) => e !== name));
    setFlowOrder((prev) =>
      prev.filter((item) => !(item.name === name && item.type === 'entidade')),
    );
  };

  const addActivity = () => {
    const trimmed = activityDraft.trim();
    if (trimmed && !activities.includes(trimmed)) {
      setActivities((prev) => [...prev, trimmed]);
      setFlowOrder((prev) => [
        ...prev,
        { name: trimmed, type: 'task', desc: '' },
      ]);
    }
    setActivityDraft('');
  };

  const removeActivity = (name) => {
    setActivities((prev) => prev.filter((a) => a !== name));
    setFlowOrder((prev) =>
      prev.filter((item) => !(item.name === name && item.type === 'task')),
    );
  };

  const addConditional = () => {
    let trimmed = conditionalDraft.trim();
    if (!trimmed) return;
    if (!trimmed.endsWith('?')) trimmed += '?';
    if (!conditionals.includes(trimmed)) {
      setConditionals((prev) => [...prev, trimmed]);
      setFlowOrder((prev) => [
        ...prev,
        { name: trimmed, type: 'condicional', desc: '' },
      ]);
    }
    setConditionalDraft('');
  };

  const removeConditional = (name) => {
    setConditionals((prev) => prev.filter((c) => c !== name));
    setFlowOrder((prev) =>
      prev.filter(
        (item) => !(item.name === name && item.type === 'condicional'),
      ),
    );
  };

  const updateFlowItemDesc = (index, value) => {
    setFlowOrder((prev) =>
      prev.map((item, i) => (i === index ? { ...item, desc: value } : item)),
    );
  };

  const updateFlowItemBranch = (index, branch, value) => {
    setFlowOrder((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, branches: { ...(item.branches || {}), [branch]: value } }
          : item,
      ),
    );
  };

  const moveFlowItem = (index, direction) => {
    setFlowOrder((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeFlowItem = (index) => {
    setFlowOrder((prev) => {
      const item = prev[index];
      if (!item) return prev;
      if (item.type === 'task')
        setActivities((a) => a.filter((x) => x !== item.name));
      if (item.type === 'condicional')
        setConditionals((c) => c.filter((x) => x !== item.name));
      if (item.type === 'entidade')
        setEntities((e) => e.filter((x) => x !== item.name));
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleApplyTemplate = () => {
    if (!String(processName || '').trim()) {
      setProcessName('Aprovacao de Pedido de Compra');
    }
    setEntities(ENTITY_TEMPLATE);
    setActivities(ACTIVITY_TEMPLATE);
    setConditionals(CONDITIONAL_TEMPLATE);
    setFlowOrder(FLOW_TEMPLATE);
    setExpandedDescIdx(null);
    setFeedback(
      'Template preenchido com ordem e descrições. Ajuste conforme seu processo real.',
    );
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

    const normalizedProcessName = String(processName || '').trim();
    const flowLines = flowOrder
      .map((item) =>
        item.desc ? `${item.name} (${String(item.desc).trim()})` : item.name,
      )
      .join(' -> ');
    const enrichedGoal = [
      normalizedProcessName ? `Nome do processo: ${normalizedProcessName}` : '',
      locationProcessDescription
        ? `Descrição do processo: ${locationProcessDescription}`
        : '',
      flowLines,
    ]
      .filter(Boolean)
      .join('\n');

    const typedFlowOrder = flowOrder.map((item) => ({
      name: item.name,
      type: item.type,
      ...(item.tipoEntidade ? { tipoEntidade: item.tipoEntidade } : {}),
      ...(item.desc ? { desc: item.desc } : {}),
      ...(item.branches?.sim || item.branches?.nao
        ? { branches: item.branches }
        : {}),
    }));

    const body = {
      goal: enrichedGoal,
      context: {
        processName: normalizedProcessName,
        flowOrder: typedFlowOrder.length > 0 ? typedFlowOrder : undefined,
        suggestedEntityNames: entities.length > 0 ? entities : undefined,
        suggestedActivities: activities.length > 0 ? activities : undefined,
        suggestedConditionals:
          conditionals.length > 0 ? conditionals : undefined,
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

  const handleExecuteApproved = async () => {
    if (!plan || !selectedActionIds.length || isExecuting) return;

    const token = resolveToken();
    if (!token) {
      setFeedback('Faça login novamente para executar ações com IA.');
      return;
    }

    setIsExecuting(true);
    setFeedback('');

    const body = { plan, approvedActions: selectedActionIds };
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

    window.dispatchEvent(
      new CustomEvent('ia:actions-executed', {
        detail: { executed, approvedActions: selectedActionIds, plan },
      }),
    );

    setIsExecuting(false);
    loadAudit();

    const results = Array.isArray(payload?.results) ? payload.results : [];
    const bpmnResult = results.find((r) => r?.type === 'update_bpmn_state');
    const opportunityResult = results.find(
      (r) => r?.type === 'create_oportunidade',
    );
    const opportunityId =
      bpmnResult?.syncedOpportunity?.id ??
      bpmnResult?.syncedOpportunity?._id ??
      opportunityResult?.result?.id ??
      opportunityResult?.result?._id ??
      null;

    const opportunityName =
      bpmnResult?.syncedOpportunity?.nome ??
      bpmnResult?.syncedOpportunity?.name ??
      opportunityResult?.result?.nome ??
      opportunityResult?.result?.name ??
      String(processName || '').trim();
    const bpmnSlug = slugifyBpmnName(opportunityName);

    if (opportunityId !== null && opportunityId !== undefined && bpmnSlug) {
      try {
        const rawMap = window.localStorage.getItem(BPMN_SAVED_OPPORTUNITY_MAP_KEY);
        const existingMap = rawMap ? JSON.parse(rawMap) : {};
        window.localStorage.setItem(
          BPMN_SAVED_OPPORTUNITY_MAP_KEY,
          JSON.stringify({ ...existingMap, [bpmnSlug]: opportunityId }),
        );
      } catch (_) {}
      navigate(`/gerar-bpmn/${bpmnSlug}`);
    } else {
      navigate('/gerar-bpmn/criar');
    }
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
        <div>
          <h1>Revisar e Configurar com IA</h1>
          <p>
            Revise o fluxo gerado, ajuste entidades, atividades e condicionais,
            e execute com aprovação humana e trilha de auditoria completa.
          </p>
        </div>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(-1)}
        >
          ← Voltar
        </button>
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

          <label className={styles.field}>
            <span>Atividades do processo</span>
            <div className={styles.chipInputRow}>
              <input
                value={activityDraft}
                onChange={(e) => setActivityDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addActivity();
                  }
                }}
                placeholder="Ex.: Solicitar compra"
              />
              <button
                type="button"
                className={styles.chipAddButton}
                onClick={addActivity}
              >
                +
              </button>
            </div>
            {activities.length > 0 && (
              <div className={styles.chipList}>
                {activities.map((a) => (
                  <span key={a} className={`${styles.chip} ${styles.chipTask}`}>
                    {a}
                    <button
                      type="button"
                      className={styles.chipRemove}
                      onClick={() => removeActivity(a)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </label>

          <label className={styles.field}>
            <span>Condicionais (decisões)</span>
            <div className={styles.chipInputRow}>
              <input
                value={conditionalDraft}
                onChange={(e) => setConditionalDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addConditional();
                  }
                }}
                placeholder="Ex.: Pedido aprovado?"
              />
              <button
                type="button"
                className={styles.chipAddButton}
                onClick={addConditional}
              >
                +
              </button>
            </div>
            {conditionals.length > 0 && (
              <div className={styles.chipList}>
                {conditionals.map((c) => (
                  <span
                    key={c}
                    className={`${styles.chip} ${styles.chipConditional}`}
                  >
                    {c}
                    <button
                      type="button"
                      className={styles.chipRemove}
                      onClick={() => removeConditional(c)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </label>

          <label className={styles.field}>
            <span>Entidades do processo</span>
            <div className={styles.chipInputRow}>
              <input
                value={entityDraft}
                onChange={(e) => setEntityDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEntity();
                  }
                }}
                placeholder="Ex.: Pedido, Cliente, Fornecedor"
              />
              <button
                type="button"
                className={styles.chipAddButton}
                onClick={addEntity}
              >
                +
              </button>
            </div>
            {entities.length > 0 && (
              <div className={styles.chipList}>
                {entities.map((e) => (
                  <span
                    key={e}
                    className={`${styles.chip} ${styles.chipEntity}`}
                  >
                    {e}
                    <button
                      type="button"
                      className={styles.chipRemove}
                      onClick={() => removeEntity(e)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </label>

          <label className={styles.field}>
            <span>Ordem do fluxo</span>
            {flowOrder.length === 0 ? (
              <p className={styles.flowOrderEmpty}>
                Adicione atividades e condicionais acima — elas aparecerão aqui
                para você ordenar.
              </p>
            ) : (
              <ol className={styles.flowOrderList}>
                {flowOrder.map((item, idx) => (
                  <li
                    key={`${item.type}-${item.name}-${idx}`}
                    className={`${styles.flowOrderItem} ${
                      item.type === 'condicional'
                        ? styles.flowOrderCondicional
                        : item.type === 'entidade'
                          ? styles.flowOrderEntidade
                          : styles.flowOrderTask
                    }`}
                  >
                    <span className={styles.flowOrderIndex}>{idx + 1}</span>
                    <span className={styles.flowOrderName}>{item.name}</span>
                    <span className={styles.flowOrderTypeBadge}>
                      {item.type === 'condicional'
                        ? 'Decisão'
                        : item.type === 'entidade'
                          ? 'Entidade'
                          : 'Atividade'}
                    </span>
                    <span className={styles.flowOrderButtons}>
                      <button
                        type="button"
                        className={`${styles.flowOrderBtn} ${expandedDescIdx === idx || item.desc ? styles.flowOrderBtnDescActive : ''}`}
                        onClick={() =>
                          setExpandedDescIdx(
                            expandedDescIdx === idx ? null : idx,
                          )
                        }
                        title="Adicionar descrição"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className={styles.flowOrderBtn}
                        onClick={() => moveFlowItem(idx, -1)}
                        disabled={idx === 0}
                        title="Mover para cima"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.flowOrderBtn}
                        onClick={() => moveFlowItem(idx, 1)}
                        disabled={idx === flowOrder.length - 1}
                        title="Mover para baixo"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${styles.flowOrderBtn} ${styles.flowOrderBtnRemove}`}
                        onClick={() => removeFlowItem(idx)}
                        title="Remover"
                      >
                        ×
                      </button>
                    </span>
                    {expandedDescIdx === idx && (
                      <input
                        className={styles.flowOrderDescInput}
                        value={item.desc || ''}
                        onChange={(e) =>
                          updateFlowItemDesc(idx, e.target.value)
                        }
                        placeholder="Descreva este passo (opcional)..."
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {expandedDescIdx === idx && item.type === 'condicional' && (
                      <div className={styles.flowOrderBranches}>
                        <div className={styles.flowOrderBranchRow}>
                          <span className={styles.flowOrderBranchLabelSim}>
                            ✔ Sim →
                          </span>
                          <select
                            className={styles.flowOrderBranchSelect}
                            value={item.branches?.sim || ''}
                            onChange={(e) =>
                              updateFlowItemBranch(idx, 'sim', e.target.value)
                            }
                          >
                            <option value="">— selecionar —</option>
                            {flowOrder
                              .filter((_, fi) => fi !== idx)
                              .map((fi) => (
                                <option key={fi.name} value={fi.name}>
                                  {fi.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className={styles.flowOrderBranchRow}>
                          <span className={styles.flowOrderBranchLabelNao}>
                            ✗ Não →
                          </span>
                          <select
                            className={styles.flowOrderBranchSelect}
                            value={item.branches?.nao || ''}
                            onChange={(e) =>
                              updateFlowItemBranch(idx, 'nao', e.target.value)
                            }
                          >
                            <option value="">— selecionar —</option>
                            {flowOrder
                              .filter((_, fi) => fi !== idx)
                              .map((fi) => (
                                <option key={fi.name} value={fi.name}>
                                  {fi.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    )}
                    {expandedDescIdx !== idx && item.desc && (
                      <span className={styles.flowOrderDescPreview}>
                        {item.desc}
                      </span>
                    )}
                    {expandedDescIdx !== idx &&
                      item.type === 'condicional' &&
                      (item.branches?.sim || item.branches?.nao) && (
                        <span className={styles.flowOrderDescPreview}>
                          {item.branches?.sim && `✔ ${item.branches.sim}`}
                          {item.branches?.sim && item.branches?.nao && '  '}
                          {item.branches?.nao && `✗ ${item.branches.nao}`}
                        </span>
                      )}
                  </li>
                ))}
              </ol>
            )}
          </label>

          <div className={styles.goalHelperBox}>
            <p>
              Adicione entidades, atividades e condicionais acima e reordene a
              sequência do fluxo.
            </p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleApplyTemplate}
            >
              Usar modelo guiado
            </button>
          </div>

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
              {generalAnalysis ? (
                <section className={styles.analysisBox}>
                  <p className={styles.analysisTitle}>
                    Análise geral do processo
                  </p>
                  <p className={styles.analysisSummary}>
                    Modelo: {generalAnalysis.modelType} | Atividades:{' '}
                    {generalAnalysis.activityCount} | Decisões:{' '}
                    {generalAnalysis.decisionCount}
                  </p>
                  {generalAnalysis.participants.length > 0 ? (
                    <p className={styles.analysisText}>
                      Participantes: {generalAnalysis.participants.join(', ')}.
                    </p>
                  ) : null}
                  {generalAnalysis.entities.length > 0 ? (
                    <p className={styles.analysisText}>
                      Entidades-base: {generalAnalysis.entities.join(', ')}.
                    </p>
                  ) : null}
                  {generalAnalysis.notes.length > 0 ? (
                    <ul className={styles.analysisNotes}>
                      {generalAnalysis.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

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

export default IaConfigurar;
