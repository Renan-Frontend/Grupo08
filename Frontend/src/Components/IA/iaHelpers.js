export const resolveToken = () =>
  window.sessionStorage.getItem('token') ||
  window.localStorage.getItem('token');

export const getErrorText = async (response, fallback) => {
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

export const getBpmnDraftFromPlan = (plan) => {
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

export const getActionSummary = (action) => {
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

export const getGeneralAnalysis = (plan) => {
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

export const getActionEntityPreview = (action) => {
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

export const parseSuggestedEntityNames = (value) => {
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

export const GOAL_TEMPLATE = `Cliente -> Solicitar compra -> Pedido -> Analisar Pedido -> Pedido aprovado?
  Nao -> Registrar Aprovacao -> Aprovacao
  Sim -> Validar orcamento -> Orcamento aprovado?
    Nao -> Atualizar Pedido -> Pedido
    Sim -> Gerar OrdemDeCompra -> OrdemDeCompra -> Enviar OrdemDeCompra ao Fornecedor -> Fornecedor -> Fornecedor recebe OrdemDeCompra`;

export const ENTITY_TEMPLATE = [
  'Cliente',
  'Pedido',
  'OrdemDeCompra',
  'Fornecedor',
];

export const ACTIVITY_TEMPLATE = [
  'Solicitar compra',
  'Analisar Pedido',
  'Registrar Aprovacao',
  'Validar orcamento',
  'Atualizar Pedido',
  'Gerar OrdemDeCompra',
  'Enviar OrdemDeCompra ao Fornecedor',
  'Fornecedor recebe OrdemDeCompra',
];

export const CONDITIONAL_TEMPLATE = ['Pedido aprovado?', 'Orcamento aprovado?'];

export const FLOW_TEMPLATE = [
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
