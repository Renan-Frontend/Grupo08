import { API_URL } from "../../Api";

const jsonHeaders = (token) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const authHeaders = (token) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Tempo limite excedido ao comunicar com a API.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const getAuthToken = () =>
  window.sessionStorage.getItem("token") ||
  window.localStorage.getItem("token");

export const fetchOpportunitiesPage = async ({
  page,
  limit,
  token,
  search,
}) => {
  let url = `${API_URL}/oportunidades?page=${page}&limit=${limit}`;
  if (search) {
    url += `&search=${encodeURIComponent(search)}`;
  }
  const response = await fetchWithTimeout(url, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Erro ao buscar oportunidades");
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
  const response = await fetchWithTimeout(
    `${API_URL}/oportunidades/${opportunityId}`,
    {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error("Erro ao atualizar oportunidade");
  }

  return response.json();
};

export const createOpportunity = async ({ payload, token }) => {
  const response = await fetchWithTimeout(`${API_URL}/oportunidades`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await response.json();
      detail = errorBody?.detail || "";
    } catch {
      // no-op
    }
    throw new Error(
      detail || `Erro ao criar oportunidade (HTTP ${response.status})`,
    );
  }

  return response.json();
};

export const deleteOpportunityById = async ({ opportunityId, token }) => {
  const response = await fetch(`${API_URL}/oportunidades/${opportunityId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });

  if (!response.ok && response.status !== 404) {
    throw new Error("Erro ao deletar oportunidade");
  }

  return response;
};

export const batchSyncEntidades = async ({ items, token }) => {
  const response = await fetchWithTimeout(`${API_URL}/entidades/batch/sync`, {
    method: "PUT",
    headers: jsonHeaders(token),
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    throw new Error("Erro ao sincronizar entidades em lote");
  }

  return response.json();
};
