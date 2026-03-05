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
  x,
  y,
});

export const GATEWAY_TYPE_OPTIONS = [
  { value: 'xor', label: 'XOR (Exclusivo)' },
  { value: 'and', label: 'AND (Paralelo)' },
  { value: 'or', label: 'OR (Inclusivo)' },
];

export const BPMN_EDITOR_LOCAL_STORAGE_KEY = 'bpmn_editor_create_draft_v1';
export const BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY =
  'bpmn_editor_saved_opportunity_by_slug_v1';
export const DEFAULT_BPMN_NAME = 'NOVO BPMN';

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

export const sanitizeNodeForPersistence = (node) => ({
  id: node.id,
  active: node.active !== false,
  isPrimaryEntity: node?.isPrimaryEntity === true,
  tipoEntidade: String(node?.tipoEntidade || '').trim(),
  nodeType:
    node.nodeType === 'task'
      ? 'task'
      : node.nodeType === 'condicional'
        ? 'condicional'
        : 'entidade',
  gatewayType:
    node?.gatewayType === 'and' || node?.gatewayType === 'or'
      ? node.gatewayType
      : 'xor',
  entidadeId:
    node.entidadeId !== null && node.entidadeId !== undefined
      ? node.entidadeId
      : null,
  entidadeNome: String(node?.entidadeNome || '').trim(),
  condicionalNome: String(node?.condicionalNome || '').trim(),
  condicionalDescricao: String(node?.condicionalDescricao || '').trim(),
  taskNome: String(node?.taskNome || '').trim(),
  taskDescricao: String(node?.taskDescricao || '').trim(),
  label: String(node?.label || '').trim(),
  subtitle: String(node?.subtitle || '').trim(),
  info: String(node?.info || '').trim(),
  x: Number.isFinite(node?.x) ? node.x : 0,
  y: Number.isFinite(node?.y) ? node.y : 0,
});

export const sanitizeConnectionForPersistence = (connection) => ({
  id: connection.id,
  from: connection.from,
  to: connection.to,
  fromHandle: connection.fromHandle || 'right',
  toHandle: connection.toHandle || 'left',
  decision: connection.decision || '',
});

export const normalizeEditorNode = (node, index = 0) => ({
  id: String(node?.id || `node-${Date.now()}-${index}`),
  active: node?.active !== false,
  isPrimaryEntity: node?.isPrimaryEntity === true,
  tipoEntidade: String(node?.tipoEntidade || '').trim(),
  nodeType:
    node?.nodeType === 'task'
      ? 'task'
      : node?.nodeType === 'condicional'
        ? 'condicional'
        : 'entidade',
  gatewayType:
    node?.gatewayType === 'and' || node?.gatewayType === 'or'
      ? node.gatewayType
      : 'xor',
  entidadeId:
    node?.entidadeId !== null && node?.entidadeId !== undefined
      ? node.entidadeId
      : null,
  entidadeNome: String(node?.entidadeNome || '').trim(),
  condicionalNome: String(node?.condicionalNome || '').trim(),
  condicionalDescricao: String(node?.condicionalDescricao || '').trim(),
  taskNome: String(node?.taskNome || '').trim(),
  taskDescricao: String(node?.taskDescricao || '').trim(),
  label: String(node?.label || '').trim(),
  subtitle: String(node?.subtitle || '').trim(),
  info: String(node?.info || '').trim(),
  x: Number.isFinite(node?.x) ? node.x : 0,
  y: Number.isFinite(node?.y) ? node.y : 0,
});

export const normalizeEditorConnection = (connection, index = 0) => ({
  id: String(connection?.id || `conn-${Date.now()}-${index}`),
  from: String(connection?.from || ''),
  to: String(connection?.to || ''),
  fromHandle: connection?.fromHandle || 'right',
  toHandle: connection?.toHandle || 'left',
  decision: connection?.decision || '',
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
