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

export const AI_EXECUTE_POST = (body, token) =>
  createRequest('/ai/execute', 'POST', body, token);

export const AI_AUDIT_GET = (token, limit = 20) =>
  createRequest(
    `/ai/audit?limit=${encodeURIComponent(limit)}`,
    'GET',
    null,
    token,
  );
