// Recuperação de senha
export const PASSWORD_LOST = ({ login, url }) =>
  createRequest('/auth/password-lost', 'POST', { login, url });

// Redefinição de senha
export const PASSWORD_RESET = ({ login, key, password }) =>
  createRequest('/auth/password-reset', 'POST', { login, key, password });

// Deletar todas as entidades de uma categoria
export const ENTIDADES_DELETE_TABELA = (categoria, token) =>
  createRequest(
    `/entidades/tabela/${encodeURIComponent(categoria)}`,
    'DELETE',
    null,
    token,
  );
// ENTIDADES
export const ENTIDADES_GET = (token) =>
  createRequest('/entidades', 'GET', null, token);

export const ENTIDADES_POST = (body, token) =>
  createRequest('/entidades', 'POST', body, token);

export const ENTIDADES_PUT = (id, body, token) =>
  createRequest(`/entidades/${id}`, 'PUT', body, token);

export const ENTIDADES_DELETE = (id, token) =>
  createRequest(`/entidades/${id}`, 'DELETE', null, token);
// Usuário autenticado
export const USER_ME = (token) =>
  createRequest('/users/me', 'GET', null, token);
const getDevApiUrl = () => {
  if (typeof window === 'undefined') return 'http://127.0.0.1:8000';
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || '127.0.0.1';
  return `${protocol}//${hostname}:8000`;
};

const DEFAULT_API_URL = import.meta.env.DEV
  ? getDevApiUrl()
  : 'https://grupo08.onrender.com';

export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

const createRequest = (endpoint, method, body, token) => ({
  url: API_URL + endpoint,
  options: {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(body && { body: JSON.stringify(body) }),
  },
});

// HEALTH CHECK (used to pre-warm the backend on cold start)
export const HEALTH_GET = () => createRequest('/health', 'GET');

// AUTENTICAÇÃO
export const TOKEN_POST = (body) =>
  createRequest('/auth/login', 'POST', {
    email: body.username || body.email,
    senha: body.password || body.senha,
  });

// Não há endpoint de validação de token, apenas uso do token nas rotas protegidas

// USUÁRIOS
export const USER_GET = (token) => createRequest('/users', 'GET', null, token);

export const USER_GET_BY_ID = (id, token) =>
  createRequest(`/users/${id}`, 'GET', null, token);

export const USER_POST = (body, token) =>
  createRequest('/users', 'POST', body, token);

export const USER_PUT = (id, body, token) =>
  createRequest(`/users/${id}`, 'PUT', body, token);

export const USER_DELETE = (id, token) =>
  createRequest(`/users/${id}`, 'DELETE', null, token);

export const BPMN_EDITOR_STATE_GET = (token) =>
  createRequest('/bpmn-editor/state', 'GET', null, token);

export const BPMN_EDITOR_STATE_PUT = (body, token) =>
  createRequest('/bpmn-editor/state', 'PUT', body, token);

export const AI_PLAN_POST = (body, token) =>
  createRequest('/ai/plan', 'POST', body, token);

export const AI_PARSE_POST = (body, token) =>
  createRequest('/ai/parse-description', 'POST', body, token);

export const AI_MAP_SPREADSHEET_POST = (body, token) =>
  createRequest('/ai/map-spreadsheet', 'POST', body, token);

export const AI_EXECUTE_POST = (body, token) =>
  createRequest('/ai/execute', 'POST', body, token);

export const AI_AUDIT_GET = (token, limit = 20) =>
  createRequest(
    `/ai/audit?limit=${encodeURIComponent(limit)}`,
    'GET',
    null,
    token,
  );

// ─── WORKFLOW ENGINE ──────────────────────────────────────────────────────────

/** Inicia/reinicia o workflow da oportunidade a partir do nó inicial.
 *  @param {number} opId
 *  @param {{ context?: Record<string,unknown> }} body
 *  @param {string} token
 */
export const WORKFLOW_RUN = (opId, body, token) =>
  createRequest(`/workflow/${opId}/run`, 'POST', body ?? {}, token);

/** Avança o workflow a partir do nó atual.
 *  Para condicional: { decision: 'sim' | 'nao' | '<custom>' }
 *  Para entidade:    { completed: true }
 *  @param {number} opId
 *  @param {{ decision?: string, completed?: boolean, context?: Record<string,unknown> }} body
 *  @param {string} token
 */
export const WORKFLOW_ADVANCE = (opId, body, token) =>
  createRequest(`/workflow/${opId}/advance`, 'POST', body ?? {}, token);

/** Retorna o estado atual do workflow (nó corrente, status, paused_reason).
 *  @param {number} opId
 *  @param {string} token
 */
export const WORKFLOW_STATE_GET = (opId, token) =>
  createRequest(`/workflow/${opId}/state`, 'GET', null, token);

/** Solicita sugestão de decisão via IA para o gateway atual.
 *  Disponível apenas quando o workflow está pausado em um nó condicional (XOR).
 *  @param {number} opId
 *  @param {string} token
 */
export const WORKFLOW_SUGGEST = (opId, token) =>
  createRequest(`/workflow/${opId}/suggest`, 'POST', {}, token);

/** Gera o objetivo/resultado do processo BPMN usando IA.
 *  Pode ser chamado após o workflow completar ou a qualquer momento.
 *  @param {number} opId
 *  @param {string} token
 */
export const WORKFLOW_GENERATE_OBJECTIVE = (opId, token) =>
  createRequest(`/workflow/${opId}/generate-objective`, 'POST', {}, token);

export const WORKFLOW_GENERATE_REPORT = (opId, body, token) =>
  createRequest(`/workflow/${opId}/generate-report`, 'POST', body, token);

export const WORKFLOW_GENERATE_DOCUMENT = (opId, token) =>
  createRequest(`/workflow/${opId}/generate-document`, 'POST', {}, token);

/* ─── Documentos (persisted) ─── */
export const DOCUMENTOS_LIST = (token, owner = '') => {
  const params = new URLSearchParams();
  if (owner) params.set('owner', owner);
  const qs = params.toString();
  return createRequest(`/documentos${qs ? `?${qs}` : ''}`, 'GET', null, token);
};
export const DOCUMENTO_GET = (docId, token) =>
  createRequest(`/documentos/${docId}`, 'GET', null, token);
export const DOCUMENTO_CREATE = (body, token) =>
  createRequest('/documentos', 'POST', body, token);
export const DOCUMENTO_DELETE = (docId, token) =>
  createRequest(`/documentos/${docId}`, 'DELETE', null, token);
export const DOCUMENTO_UPDATE = (docId, body, token) =>
  createRequest(`/documentos/${docId}`, 'PUT', body, token);

export const WORKFLOW_RECORDS = (opId, token) =>
  createRequest(`/workflow/${opId}/records`, 'GET', null, token);

export const WORKFLOW_INSTANCES = (opId, token, status = null) =>
  createRequest(`/workflow/${opId}/instances${status ? `?status=${encodeURIComponent(status)}` : ''}`, 'GET', null, token);

export const WORKFLOW_INSTANCE_DETAIL = (opId, instanceId, token) =>
  createRequest(`/workflow/${opId}/instances/${encodeURIComponent(instanceId)}`, 'GET', null, token);

export const WORKFLOWS_LIST = (token, status = null, { owner, shared } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (owner) params.set('owner', owner);
  if (shared) params.set('shared', 'true');
  const qs = params.toString();
  return createRequest(`/workflows${qs ? `?${qs}` : ''}`, 'GET', null, token);
};

export const OPORTUNIDADES_LIST = (token, { page = 1, limit = 100, search = '', owner = '', shared = '' } = {}) => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (search) params.set('search', search);
  if (owner) params.set('owner', owner);
  if (shared) params.set('shared', shared);
  const qs = params.toString();
  return createRequest(`/oportunidades?${qs}`, 'GET', null, token);
};

export const OPORTUNIDADE_SHARE = (opId, shared, token) =>
  createRequest(`/oportunidades/${opId}/share`, 'PUT', { shared }, token);

export const WORKFLOW_TASKS_LIST = (token, { status, assignee, assignedRole, opportunityId, myTasks, search, dateFrom, dateTo } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (assignee) params.set('assignee', assignee);
  if (assignedRole) params.set('assigned_role', assignedRole);
  if (opportunityId) params.set('opportunity_id', String(opportunityId));
  if (myTasks) params.set('my_tasks', 'true');
  if (search) params.set('search', search);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  const qs = params.toString();
  return createRequest(`/workflow/tasks${qs ? `?${qs}` : ''}`, 'GET', null, token);
};

export const WORKFLOW_TASK_COMPLETE = (taskId, body, token) =>
  createRequest(`/workflow/tasks/${taskId}/complete`, 'POST', body ?? {}, token);

export const WORKFLOW_TASK_ASSIGN = (taskId, body, token) =>
  createRequest(`/workflow/tasks/${taskId}/assign`, 'POST', body, token);

export const WORKFLOW_TASK_DELETE = (taskId, token) =>
  createRequest(`/workflow/tasks/${taskId}`, 'DELETE', null, token);

export const WORKFLOW_TASK_COMMENT_ADD = (taskId, body, token) =>
  createRequest(`/workflow/tasks/${taskId}/comment`, 'POST', body, token);

export const WORKFLOW_TASK_COMMENTS = (taskId, token) =>
  createRequest(`/workflow/tasks/${taskId}/comments`, 'GET', null, token);

export const WORKFLOW_HISTORY = (opId, token) =>
  createRequest(`/workflow/${opId}/history`, 'GET', null, token);

// ─── BPMN VERSIONING ─────────────────────────────────────────────────────────
export const BPMN_VERSIONS_LIST = (opId, token) =>
  createRequest(`/oportunidades/${opId}/versions`, 'GET', null, token);

export const BPMN_VERSION_GET = (opId, version, token) =>
  createRequest(`/oportunidades/${opId}/versions/${version}`, 'GET', null, token);

export const BPMN_VERSION_CREATE = (opId, body, token) =>
  createRequest(`/oportunidades/${opId}/versions`, 'POST', body ?? {}, token);

export const BPMN_VERSION_RESTORE = (opId, version, token) =>
  createRequest(`/oportunidades/${opId}/versions/${version}/restore`, 'POST', {}, token);

// ─── WEBHOOKS & EVENTS ───────────────────────────────────────────────────────
export const WEBHOOKS_LIST = (token) =>
  createRequest('/webhooks', 'GET', null, token);

export const WEBHOOK_CREATE = (data, token) =>
  createRequest('/webhooks', 'POST', data, token);

export const WEBHOOK_UPDATE = (id, data, token) =>
  createRequest(`/webhooks/${id}`, 'PUT', data, token);

export const WEBHOOK_DELETE = (id, token) =>
  createRequest(`/webhooks/${id}`, 'DELETE', null, token);

export const WEBHOOK_TEST = (id, token) =>
  createRequest(`/webhooks/${id}/test`, 'POST', {}, token);

export const EVENTS_LIST = (params, token) => {
  const qs = new URLSearchParams();
  if (params?.event_type) qs.set('event_type', params.event_type);
  if (params?.limit) qs.set('limit', params.limit);
  const q = qs.toString();
  return createRequest(`/events${q ? `?${q}` : ''}`, 'GET', null, token);
};

export const EVENTS_TYPES = (token) =>
  createRequest('/events/types', 'GET', null, token);

// ─── DELIVERIES (webhook delivery log & retry) ──────────────────────────────
export const WEBHOOK_DELIVERIES = (webhookId, params, token) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', params.limit);
  const q = qs.toString();
  return createRequest(`/webhooks/${webhookId}/deliveries${q ? `?${q}` : ''}`, 'GET', null, token);
};

export const DELIVERIES_LIST = (params, token) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.webhook_id) qs.set('webhook_id', params.webhook_id);
  if (params?.event_type) qs.set('event_type', params.event_type);
  if (params?.limit) qs.set('limit', params.limit);
  const q = qs.toString();
  return createRequest(`/deliveries${q ? `?${q}` : ''}`, 'GET', null, token);
};

export const DELIVERIES_STATS = (token) =>
  createRequest('/deliveries/stats', 'GET', null, token);

export const DELIVERY_RETRY = (deliveryId, token) =>
  createRequest(`/deliveries/${deliveryId}/retry`, 'POST', {}, token);

export const EVENT_RETRY = (eventId, token) =>
  createRequest(`/events/${eventId}/retry`, 'POST', {}, token);

// ─── SLA & METRICS ──────────────────────────────────────────────────────────
export const SLA_ALERTS = (params, token) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  const q = qs.toString();
  return createRequest(`/sla/alerts${q ? `?${q}` : ''}`, 'GET', null, token);
};

export const SLA_ALERT_DISMISS = (violationId, token) =>
  createRequest(`/sla/alerts/${violationId}/dismiss`, 'POST', {}, token);

export const SLA_OVERDUE_TASKS = (token) =>
  createRequest('/sla/overdue-tasks', 'GET', null, token);

export const SLA_CONFIG_UPDATE = (data, token) =>
  createRequest('/sla/config', 'PUT', data, token);

export const METRICS_TASKS = (params, token) => {
  const qs = new URLSearchParams();
  if (params?.opportunity_id) qs.set('opportunity_id', params.opportunity_id);
  const q = qs.toString();
  return createRequest(`/metrics/tasks${q ? `?${q}` : ''}`, 'GET', null, token);
};

export const METRICS_WORKFLOWS = (token) =>
  createRequest('/metrics/workflows', 'GET', null, token);

export const METRICS_DASHBOARD = (token) =>
  createRequest('/metrics/dashboard', 'GET', null, token);

export const METRICS_TASK_DETAIL = (taskId, token) =>
  createRequest(`/metrics/task/${taskId}`, 'GET', null, token);

export const QUEUE_STATUS = (token) =>
  createRequest('/queue/status', 'GET', null, token);

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const AUTH_REFRESH = (refreshToken) =>
  createRequest('/auth/refresh', 'POST', { refresh_token: refreshToken });

export const AUTH_ROLES = (token) =>
  createRequest('/auth/roles', 'GET', null, token);

export const USERS_BY_ROLE = (role, token) =>
  createRequest(`/users/by-role/${encodeURIComponent(role)}`, 'GET', null, token);
