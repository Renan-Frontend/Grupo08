export const createNode = (id, label, x = 0, y = 0) => ({
  id,
  active: true,
  isPrimaryEntity: false,
  tipoEntidade: 'apoio',
  nodeType: 'entidade',
  gatewayType: 'xor',
  entidadeId: null,
  condicionalNome: '',
  condicionalDescricao: '',
  taskNome: '',
  taskDescricao: '',
  selectedEntityFieldIds: [],
  selectedEntityFieldNames: [],
  selectedEntityFields: [],
  x,
  y,
});

const normalizeSelectedEntityFields = (fields = []) =>
  (Array.isArray(fields) ? fields : [])
    .map((field) => ({
      id: String(field?.id || '').trim(),
      nome: String(field?.nome || '').trim(),
      tipo: String(field?.tipo || '').trim(),
      obrigatorio:
        field?.obrigatorio === true || String(field?.obrigatorio) === 'Sim',
      keyType: String(field?.keyType || field?.chave || 'NORMAL')
        .trim()
        .toUpperCase(),
      relacionamento: String(field?.relacionamento || '').trim() || null,
    }))
    .filter((field) => field.id || field.nome);

export const GATEWAY_TYPE_OPTIONS = [
  { value: 'xor', label: 'XOR (Exclusivo)' },
  { value: 'and', label: 'AND (Paralelo)' },
  { value: 'or', label: 'OR (Inclusivo)' },
];

export const BPMN_EDITOR_LOCAL_STORAGE_KEY = 'bpmn_editor_create_draft_v1';
export const BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY =
  'bpmn_editor_saved_opportunity_by_slug_v1';
export const DEFAULT_BPMN_NAME = 'NOVO BPMN';
export const ENTITY_NAME_MAX_LENGTH = 48;
export const TASK_NAME_MAX_LENGTH = 56;
export const CONDITIONAL_NAME_MAX_LENGTH = 56;

export const slugifyBpmnName = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'novo-bpmn';

export const bpmnNameFromSlug = (slug = '') => {
  const cleanedSlug = String(slug || '')
    .trim()
    .toLowerCase();
  if (!cleanedSlug || cleanedSlug === 'novo-bpmn') return DEFAULT_BPMN_NAME;

  return cleanedSlug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const normalizeBpmnName = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const normalizeEntityName = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const generateUniqueId = (prefix = 'id') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const getEntidadeId = (entidade) =>
  entidade?.id ?? entidade?._id ?? null;

export const getEntidadeNome = (entidade) =>
  String(entidade?.nome || entidade?.name || entidade?.titulo || '').trim();

export const getEntidadeDescricao = (entidade) =>
  String(entidade?.descricao || '').trim();

export const getEntidadeAtributoChave = (entidade) =>
  String(entidade?.atributoChave || '').trim();

const fitWordsWithLimit = (words, maxLength) => {
  const selected = [];
  let currentSize = 0;

  for (const item of Array.isArray(words) ? words : []) {
    const token = String(item || '').trim();
    if (!token) continue;

    const nextSize = currentSize + (selected.length ? 1 : 0) + token.length;
    if (nextSize > maxLength) break;

    selected.push(token);
    currentSize = nextSize;
  }

  return selected.join(' ').trim();
};

const normalizeStageLabelText = (value) => {
  let text = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text) return '';

  text = text.replace(/\b(?:o\s+)?bpmn\s+deve\s+incluir\b.*$/i, '');
  text = text.replace(/\bdeve\s+incluir\b.*$/i, '');
  text = text.replace(/\bfluxos?\s+de\b.*$/i, '');

  const clauses = text
    .split(/[.;:]+/)
    .map((item) => item.replace(/^[-*\u2022]+\s*/, '').trim())
    .filter(Boolean);

  if (clauses.length) {
    const preferred = clauses.find(
      (item) => !item.toLowerCase().includes('bpmn'),
    );
    text = preferred || clauses[0];
  }

  return text.replace(/^[\s.;,-]+|[\s.;,-]+$/g, '');
};

const summarizeStageName = (value, maxLength, fallback = '') => {
  const text = normalizeStageLabelText(value);

  if (!text) return String(fallback || '').trim();
  if (text.length <= maxLength) return text;

  const words = text.split(/\s+/).filter(Boolean);
  const stopwords = new Set([
    'de',
    'da',
    'do',
    'das',
    'dos',
    'e',
    'em',
    'para',
    'com',
    'por',
    'na',
    'no',
    'nas',
    'nos',
    'a',
    'o',
    'as',
    'os',
    'the',
    'of',
    'to',
    'for',
    'and',
  ]);

  const keyWords = words.filter((word) => {
    const normalizedWord = String(word)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
    return normalizedWord && !stopwords.has(normalizedWord);
  });

  const summaryFromKeyWords = fitWordsWithLimit(keyWords, maxLength);
  if (summaryFromKeyWords) return summaryFromKeyWords;

  const summaryFromOriginal = fitWordsWithLimit(words, maxLength);
  if (summaryFromOriginal) return summaryFromOriginal;

  return words.length
    ? words[0].slice(0, maxLength).trim()
    : String(fallback || '').trim();
};

export const sanitizeStageNameByNodeType = (value, nodeType, fallback = '') => {
  if (nodeType === 'condicional') {
    return summarizeStageName(
      value,
      CONDITIONAL_NAME_MAX_LENGTH,
      fallback || 'Condicional',
    );
  }
  if (nodeType === 'task') {
    return summarizeStageName(
      value,
      TASK_NAME_MAX_LENGTH,
      fallback || 'Atividade',
    );
  }
  return summarizeStageName(
    value,
    ENTITY_NAME_MAX_LENGTH,
    fallback || 'Entidade',
  );
};

const normalizeDecisionValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (
    normalized === 'sim' ||
    normalized === 'yes' ||
    normalized === 'true' ||
    normalized === 'ok' ||
    normalized === 'aprovado' ||
    raw === '✓' ||
    raw === '✔'
  ) {
    return 'sim';
  }

  if (
    normalized === 'nao' ||
    normalized === 'no' ||
    normalized === 'false' ||
    normalized === 'reprovado' ||
    raw === '✕' ||
    raw === '✖' ||
    raw === 'x' ||
    raw === 'X'
  ) {
    return 'nao';
  }

  return raw;
};

export const sanitizeNodeForPersistence = (node) => {
  const nodeType =
    node.nodeType === 'task'
      ? 'task'
      : node.nodeType === 'condicional'
        ? 'condicional'
        : 'entidade';
  const rawTaskNomePersist = node?.taskNome || (node.nodeType === 'task' ? node?.label : undefined);
  const taskNome = sanitizeStageNameByNodeType(
    rawTaskNomePersist,
    'task',
    'Atividade',
  );
  const rawCondicionalNomePersist =
    node?.condicionalNome || (node.nodeType === 'condicional' ? node?.label : undefined);
  const condicionalNome = sanitizeStageNameByNodeType(
    rawCondicionalNomePersist,
    'condicional',
    'Condicional',
  );
  const rawEntidadeNomePersist =
    node?.nodeType === 'start' || node?.nodeType === 'end'
      ? node?.entidadeNome || node?.label
      : node?.entidadeNome;
  const entidadeNome = sanitizeStageNameByNodeType(
    rawEntidadeNomePersist,
    'entidade',
    'Entidade',
  );
  const fallbackLabel =
    nodeType === 'task'
      ? taskNome
      : nodeType === 'condicional'
        ? condicionalNome
        : entidadeNome;

  return {
    id: node.id,
    active: node.active !== false,
    isPrimaryEntity: node?.isPrimaryEntity === true,
    tipoEntidade: String(node?.tipoEntidade || '').trim(),
    nodeType,
    gatewayType:
      node?.gatewayType === 'and' || node?.gatewayType === 'or'
        ? node.gatewayType
        : 'xor',
    entidadeId:
      node.entidadeId !== null && node.entidadeId !== undefined
        ? node.entidadeId
        : null,
    entidadeNome,
    condicionalNome,
    condicionalDescricao: String(node?.condicionalDescricao || '').trim(),
    taskNome,
    taskDescricao: String(node?.taskDescricao || '').trim(),
    selectedEntityFieldIds: Array.isArray(node?.selectedEntityFieldIds)
      ? node.selectedEntityFieldIds
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [],
    selectedEntityFieldNames: Array.isArray(node?.selectedEntityFieldNames)
      ? node.selectedEntityFieldNames
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [],
    selectedEntityFields: normalizeSelectedEntityFields(
      node?.selectedEntityFields,
    ),
    label: sanitizeStageNameByNodeType(
      node?.label || fallbackLabel,
      nodeType,
      fallbackLabel,
    ),
    descricao: String(node?.descricao || node?.subtitle || '').trim(),
    info: String(node?.info || '').trim(),
    x: Number.isFinite(node?.x) ? node.x : 0,
    y: Number.isFinite(node?.y) ? node.y : 0,
  };
};

export const sanitizeConnectionForPersistence = (connection) => {
  const result = {
    id: connection.id,
    from: connection.from,
    to: connection.to,
    fromHandle: connection.fromHandle || 'right',
    toHandle: connection.toHandle || 'left',
    decision: normalizeDecisionValue(connection?.decision),
  };
  if (connection.waypoints?.length) {
    result.waypoints = connection.waypoints.map((wp) => ({
      x: Math.round(wp.x),
      y: Math.round(wp.y),
    }));
  }
  return result;
};

export const normalizeEditorNode = (node, index = 0) => {
  const nodeType =
    node?.nodeType === 'task'
      ? 'task'
      : node?.nodeType === 'condicional'
        ? 'condicional'
        : 'entidade';
  const rawTaskNome = node?.taskNome || (node?.nodeType === 'task' ? node?.label : undefined);
  const taskNome = sanitizeStageNameByNodeType(
    rawTaskNome,
    'task',
    `Atividade ${index + 1}`,
  );
  const rawCondicionalNome =
    node?.condicionalNome || (node?.nodeType === 'condicional' ? node?.label : undefined);
  const condicionalNome = sanitizeStageNameByNodeType(
    rawCondicionalNome,
    'condicional',
    `Condicional ${index + 1}`,
  );
  // Para nós start/end gerados pela IA, usar o label ('Início'/'Fim') como nome da entidade
  // para que nodesForCanvas exiba o título correto em vez de "Entidade N".
  const rawEntidadeNome =
    node?.nodeType === 'start' || node?.nodeType === 'end'
      ? node?.entidadeNome || node?.label
      : node?.entidadeNome;
  const entidadeNome = sanitizeStageNameByNodeType(
    rawEntidadeNome,
    'entidade',
    `Entidade ${index + 1}`,
  );
  const fallbackLabel =
    nodeType === 'task'
      ? taskNome
      : nodeType === 'condicional'
        ? condicionalNome
        : entidadeNome;

  return {
    id: String(node?.id || `node-${Date.now()}-${index}`),
    active: node?.active !== false,
    isPrimaryEntity: node?.isPrimaryEntity === true,
    tipoEntidade: String(node?.tipoEntidade || '').trim(),
    nodeType,
    gatewayType:
      node?.gatewayType === 'and' || node?.gatewayType === 'or'
        ? node.gatewayType
        : 'xor',
    entidadeId:
      node?.entidadeId !== null && node?.entidadeId !== undefined
        ? node.entidadeId
        : null,
    entidadeNome,
    condicionalNome,
    condicionalDescricao: String(node?.condicionalDescricao || '').trim(),
    taskNome,
    taskDescricao: String(node?.taskDescricao || '').trim(),
    selectedEntityFieldIds: Array.isArray(node?.selectedEntityFieldIds)
      ? node.selectedEntityFieldIds
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [],
    selectedEntityFieldNames: Array.isArray(node?.selectedEntityFieldNames)
      ? node.selectedEntityFieldNames
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [],
    selectedEntityFields: normalizeSelectedEntityFields(
      node?.selectedEntityFields,
    ),
    label: sanitizeStageNameByNodeType(
      node?.label || fallbackLabel,
      nodeType,
      fallbackLabel,
    ),
    descricao: String(node?.descricao || node?.subtitle || '').trim(),
    info: String(node?.info || '').trim(),
    x: Number.isFinite(node?.x) ? node.x : 0,
    y: Number.isFinite(node?.y) ? node.y : 0,
  };
};

export const normalizeEditorConnection = (connection, index = 0) => ({
  id: String(connection?.id || `conn-${Date.now()}-${index}`),
  from: String(connection?.from || ''),
  to: String(connection?.to || ''),
  fromHandle: connection?.fromHandle || 'right',
  toHandle: connection?.toHandle || 'left',
  decision: normalizeDecisionValue(connection?.decision),
});

export const toRequiredLabel = (value) => (value ? 'Sim' : 'Não');

export const EMPTY_ENTITY_FORM = {
  nome: '',
  descricao: '',
  atributoChave: '',
};

export const EMPTY_CONDITIONAL_FORM = {
  nome: '',
  descricao: '',
};

export const EMPTY_TASK_FORM = {
  nome: '',
  descricao: '',
};
