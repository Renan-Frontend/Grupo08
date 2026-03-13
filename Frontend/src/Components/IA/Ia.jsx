import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Ia.module.css';
import {
  AI_AUDIT_GET,
  AI_EXECUTE_POST,
  AI_PARSE_POST,
  AI_PLAN_POST,
} from '../../Api';
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

const getGeneralAnalysis = (plan) => {
  if (!plan || typeof plan !== 'object') return null;
  const analysis =
    plan.generalAnalysis && typeof plan.generalAnalysis === 'object'
      ? plan.generalAnalysis
      : null;
  if (!analysis) return null;

  const participants = Array.isArray(analysis.participants)
    ? analysis.participants
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : [];

  const entities = Array.isArray(analysis.entityNames)
    ? analysis.entityNames
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : [];

  const notes = Array.isArray(analysis.notes)
    ? analysis.notes.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    modelType: String(analysis.modelType || '').trim() || 'linear',
    decisionCount: Number(analysis.decisionCount || 0),
    activityCount: Number(analysis.activityCount || 0),
    participants,
    entities,
    notes,
  };
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

const GOAL_TEMPLATE = `Cliente -> Solicitar compra -> Pedido -> Analisar Pedido -> Pedido aprovado?
  Nao -> Registrar Aprovacao -> Aprovacao
  Sim -> Validar orcamento -> Orcamento aprovado?
    Nao -> Atualizar Pedido -> Pedido
    Sim -> Gerar OrdemDeCompra -> OrdemDeCompra -> Enviar OrdemDeCompra ao Fornecedor -> Fornecedor -> Fornecedor recebe OrdemDeCompra`;

const ENTITY_TEMPLATE = ['Cliente', 'Pedido', 'OrdemDeCompra', 'Fornecedor'];

const ACTIVITY_TEMPLATE = [
  'Solicitar compra',
  'Analisar Pedido',
  'Registrar Aprovacao',
  'Validar orcamento',
  'Atualizar Pedido',
  'Gerar OrdemDeCompra',
  'Enviar OrdemDeCompra ao Fornecedor',
  'Fornecedor recebe OrdemDeCompra',
];

const CONDITIONAL_TEMPLATE = ['Pedido aprovado?', 'Orcamento aprovado?'];

const Ia = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = React.useContext(UserContext);
  const { entidades } = React.useContext(EntidadesContext);
  const [introProcessName, setIntroProcessName] = React.useState('');
  const [introDescription, setIntroDescription] = React.useState('');
  const [isParsing, setIsParsing] = React.useState(false);
  const [introFeedback, setIntroFeedback] = React.useState('');

  // Preenche o formulário com dados vindos da tela /ia (via location.state) ao montar /ia/configurar
  const locationParseData = location.state?.parseData ?? null;
  const locationIntroName = location.state?.introName ?? '';

  React.useEffect(() => {
    if (!locationParseData) return;
    if (locationParseData.processName)
      setProcessName(locationParseData.processName);
    else if (locationIntroName) setProcessName(locationIntroName);

    const fo = Array.isArray(locationParseData.flowOrder)
      ? locationParseData.flowOrder
      : [];

    // Monta flowOrder a partir da lista ordenada do backend
    const mappedFo = fo.map((item) => ({
      name: String(item.name || '').trim(),
      type: String(item.type || 'task').trim(),
      desc: String(item.desc || '').trim(),
      ...(item.tipoEntidade ? { tipoEntidade: item.tipoEntidade } : {}),
      ...(item.branches ? { branches: item.branches } : {}),
    }));

    // O modelo LLM pode omitir itens do flowOrder mas listá-los nas listas planas.
    // Mescla as listas planas para não perder nenhum elemento.
    const foNames = new Set(mappedFo.map((i) => i.name.toLowerCase()));

    (Array.isArray(locationParseData.entities)
      ? locationParseData.entities
      : []
    ).forEach((ent) => {
      // entities agora pode ser lista de objetos {name, tipoEntidade} ou strings (fallback)
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

  const [processName, setProcessName] = React.useState('');
  const [entities, setEntities] = React.useState([]);
  const [entityDraft, setEntityDraft] = React.useState('');
  const [activities, setActivities] = React.useState([]);
  const [activityDraft, setActivityDraft] = React.useState('');
  const [conditionals, setConditionals] = React.useState([]);
  const [conditionalDraft, setConditionalDraft] = React.useState('');
  // flowOrder: lista ordenada de {name, type: 'task'|'condicional'|'entidade', desc}
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

    const normalizedProcessName = String(processName || '').trim();
    const orderedNames = flowOrder.map((item) => item.name);
    const flowString = orderedNames.join(' -> ');
    const enrichedGoal = [
      normalizedProcessName ? `Nome do processo: ${normalizedProcessName}` : '',
      flowString,
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

  const removeConditional = (name) => {
    setConditionals((prev) => prev.filter((c) => c !== name));
    setFlowOrder((prev) =>
      prev.filter(
        (item) => !(item.name === name && item.type === 'condicional'),
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
      // Remove também do chip correspondente
      if (item.type === 'task')
        setActivities((a) => a.filter((x) => x !== item.name));
      if (item.type === 'condicional')
        setConditionals((c) => c.filter((x) => x !== item.name));
      if (item.type === 'entidade')
        setEntities((e) => e.filter((x) => x !== item.name));
      return prev.filter((_, i) => i !== index);
    });
  };

  const applyParseData = (data, trimmedName) => {
    if (data.processName) setProcessName(data.processName);
    else if (trimmedName) setProcessName(trimmedName);

    setEntities(Array.isArray(data.entities) ? data.entities : []);
    setActivities(Array.isArray(data.activities) ? data.activities : []);
    setConditionals(
      (Array.isArray(data.conditionals) ? data.conditionals : []).map((c) =>
        c.endsWith('?') ? c : c + '?',
      ),
    );

    const newFlowOrder = Array.isArray(data.flowOrder) ? data.flowOrder : [];
    if (newFlowOrder.length > 0) {
      setFlowOrder(
        newFlowOrder.map((item) => ({
          name: String(item.name || '').trim(),
          type: String(item.type || 'task').trim(),
          desc: String(item.desc || '').trim(),
          ...(item.branches ? { branches: item.branches } : {}),
        })),
      );
    }
  };

  const handleParseDescription = async (event) => {
    event.preventDefault();
    const trimmedName = introProcessName.trim();
    const trimmedDesc = introDescription.trim();
    if (!trimmedName && !trimmedDesc) return;

    const token = resolveToken();
    if (!token) {
      setIntroFeedback('Faça login novamente para usar o operador de IA.');
      return;
    }

    setIsParsing(true);
    setIntroFeedback('');

    try {
      const { url, options } = AI_PARSE_POST(
        { processName: trimmedName, description: trimmedDesc },
        token,
      );
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorText = await getErrorText(
          response,
          'Falha ao analisar a descrição.',
        );
        setIntroFeedback(errorText);
        setIsParsing(false);
        return;
      }

      navigate('/ia/configurar', {
        state: { parseData: await response.json(), introName: trimmedName },
      });
    } catch (err) {
      setIntroFeedback('Erro ao conectar. Tente novamente.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleApplyTemplate = () => {
    if (!String(processName || '').trim()) {
      setProcessName('Aprovacao de Pedido de Compra');
    }
    setEntities(ENTITY_TEMPLATE);
    setActivities(ACTIVITY_TEMPLATE);
    setConditionals(CONDITIONAL_TEMPLATE);

    // Fluxo ordenado manualmente para o template de Aprovação de Pedido de Compra
    const templateFlow = [
      {
        name: 'Cliente',
        type: 'entidade',
        desc: 'Pessoa ou empresa que solicita a compra.',
      },
      {
        name: 'Solicitar compra',
        type: 'task',
        desc: 'Cliente registra a solicitação de compra no sistema.',
      },
      {
        name: 'Pedido',
        type: 'entidade',
        desc: 'Registro da solicitação de compra com itens e valores.',
      },
      {
        name: 'Analisar Pedido',
        type: 'task',
        desc: 'Responsável analisa se o pedido está dentro das políticas.',
      },
      {
        name: 'Pedido aprovado?',
        type: 'condicional',
        desc: 'Verifica se o pedido foi aprovado pela análise.',
        branches: { sim: 'Validar orcamento', nao: 'Registrar Aprovacao' },
      },
      {
        name: 'Registrar Aprovacao',
        type: 'task',
        desc: 'Registra a reprovação do pedido e notifica o solicitante.',
      },
      {
        name: 'Validar orcamento',
        type: 'task',
        desc: 'Valida o orçamento disponível para cobrir o pedido.',
      },
      {
        name: 'Orcamento aprovado?',
        type: 'condicional',
        desc: 'Verifica se o orçamento é suficiente para o pedido.',
        branches: { sim: 'Gerar OrdemDeCompra', nao: 'Atualizar Pedido' },
      },
      {
        name: 'Atualizar Pedido',
        type: 'task',
        desc: 'Atualiza o pedido com ajustes para adequar ao orçamento.',
      },
      {
        name: 'Gerar OrdemDeCompra',
        type: 'task',
        desc: 'Gera a ordem de compra oficial para o fornecedor.',
      },
      {
        name: 'OrdemDeCompra',
        type: 'entidade',
        desc: 'Documento oficial enviado ao fornecedor com os itens aprovados.',
      },
      {
        name: 'Enviar OrdemDeCompra ao Fornecedor',
        type: 'task',
        desc: 'Envia a ordem de compra ao fornecedor via e-mail ou sistema.',
      },
      {
        name: 'Fornecedor',
        type: 'entidade',
        desc: 'Empresa responsável pelo fornecimento dos itens solicitados.',
      },
      {
        name: 'Fornecedor recebe OrdemDeCompra',
        type: 'task',
        desc: 'Fornecedor confirma o recebimento e aceite da ordem de compra.',
      },
    ];

    setFlowOrder(templateFlow);
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

  if (location.pathname === '/ia') {
    const EXAMPLE_NAME = 'Aprovação de Pedido de Compra';
    const EXAMPLE_DESC =
      'O processo de Aprovação de Pedido de Compra inicia quando o Cliente executa a atividade Solicitar compra, que gera um Pedido. ' +
      'Em seguida é realizada a atividade Analisar Pedido. ' +
      'O fluxo então avalia a condicional Pedido aprovado?: se NAO, é executada a atividade Registrar Aprovacao, que cria o registro de Aprovacao; ' +
      'se SIM, é executada a atividade Validar orcamento. ' +
      'O fluxo avalia a condicional Orcamento aprovado?: se NAO, é executada a atividade Atualizar Pedido; ' +
      'se SIM, é executada a atividade Gerar OrdemDeCompra, que cria o documento OrdemDeCompra. ' +
      'Em seguida é executada a atividade Enviar OrdemDeCompra ao Fornecedor, e o Fornecedor então executa a atividade Fornecedor recebe OrdemDeCompra.';
    const canParse =
      introProcessName.trim().length >= 3 ||
      introDescription.trim().length >= 10;

    return (
      <section className={styles.wrapper}>
        <header className={styles.hero}>
          <h1>Criar Processo</h1>
          <p>
            Descreva o processo com suas próprias palavras e a IA monta o fluxo
            de entidades, atividades e condicionais automaticamente.
          </p>
        </header>
        <form className={styles.formCard} onSubmit={handleParseDescription}>
          <label className={styles.field}>
            <span>Nome do processo</span>
            <input
              value={introProcessName}
              onChange={(e) => setIntroProcessName(e.target.value)}
              placeholder="Ex.: Aprovação de pedido de compra"
              autoFocus
            />
          </label>
          <label className={styles.field}>
            <span>Descreva o processo</span>
            <textarea
              rows={20}
              style={{ resize: 'vertical', minHeight: 360 }}
              value={introDescription}
              onChange={(e) => setIntroDescription(e.target.value)}
              placeholder={
                'Descreva o fluxo completo do processo. Ex.:\n\n' +
                'O cliente solicita uma compra. O gestor analisa o pedido. ' +
                'Se aprovado, o financeiro valida o orçamento. ' +
                'Se o orçamento for suficiente, gera a ordem de compra e envia ao fornecedor. ' +
                'Caso contrário, o pedido é devolvido para ajuste.'
              }
            />
          </label>
          <button
            type="button"
            className={styles.secondaryButton}
            style={{
              alignSelf: 'flex-start',
              fontSize: '0.8rem',
              padding: '4px 12px',
            }}
            onClick={() => {
              setIntroProcessName(EXAMPLE_NAME);
              setIntroDescription(EXAMPLE_DESC);
            }}
          >
            ✦ Preencher com exemplo
          </button>
          {introFeedback ? (
            <p className={styles.feedback}>{introFeedback}</p>
          ) : null}
          <button
            type="submit"
            className={styles.generateButton}
            disabled={!canParse || isParsing}
          >
            {isParsing ? 'Analisando...' : 'Criar processo'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => navigate('/ia/configurar')}
          >
            Preencher manualmente
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className={styles.wrapper}>
      <header className={styles.hero}>
        <h1>Revisar e Configurar com IA</h1>
        <p>
          Revise o fluxo gerado, ajuste entidades, atividades e condicionais, e
          execute com aprovação humana e trilha de auditoria completa.
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

export default Ia;
