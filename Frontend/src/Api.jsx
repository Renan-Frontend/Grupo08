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
export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

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
