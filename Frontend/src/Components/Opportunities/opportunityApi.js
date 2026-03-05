import { API_URL } from '../../Api';

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const authHeaders = (token) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const getAuthToken = () => window.localStorage.getItem('token');

export const fetchOpportunitiesPage = async ({ page, limit, token }) => {
  const response = await fetch(
    `${API_URL}/oportunidades?page=${page}&limit=${limit}`,
    {
      headers: authHeaders(token),
    },
  );

  if (!response.ok) {
    throw new Error('Erro ao buscar oportunidades');
  }

  return response.json();
};

export const fetchOpportunityUsers = async ({ token }) => {
  const response = await fetch(`${API_URL}/users`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    return [];
  }

  const json = await response.json();
  const users = Array.isArray(json?.data) ? json.data : [];

  return users
    .map((item) => item?.nome || item?.name || item?.email)
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
};

export const updateOpportunityById = async ({
  opportunityId,
  payload,
  token,
}) => {
  const response = await fetch(`${API_URL}/oportunidades/${opportunityId}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Erro ao atualizar oportunidade');
  }

  return response.json();
};

export const createOpportunity = async ({ payload, token }) => {
  const response = await fetch(`${API_URL}/oportunidades`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Erro ao atribuir oportunidade');
  }

  return response;
};

export const deleteOpportunityById = async ({ opportunityId, token }) => {
  const response = await fetch(`${API_URL}/oportunidades/${opportunityId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });

  if (!response.ok && response.status !== 404) {
    throw new Error('Erro ao deletar oportunidade');
  }

  return response;
};
