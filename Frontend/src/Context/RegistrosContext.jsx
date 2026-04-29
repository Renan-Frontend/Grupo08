import React from "react";
import {
  REGISTROS_GET,
  REGISTROS_POST,
  REGISTROS_PUT,
  REGISTROS_DELETE,
} from "../Api";

const RegistrosContext = React.createContext();

const resolveToken = () =>
  window.sessionStorage.getItem("token") ||
  window.localStorage.getItem("token");

const RegistrosProvider = ({ children }) => {
  const [registros, setRegistros] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const fetchRegistros = React.useCallback(async (papelNegocio = "") => {
    setLoading(true);
    setError(null);
    try {
      const token = resolveToken();
      const { url, options } = REGISTROS_GET(token, papelNegocio);
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`Erro ao buscar registros (${res.status})`);
      const data = await res.json();
      setRegistros(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      setError(err.message || "Erro ao buscar registros");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const criarRegistro = React.useCallback(async (payload) => {
    const token = resolveToken();
    const { url, options } = REGISTROS_POST(payload, token);
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail || `Erro ao criar registro (${res.status})`);
    }
    const criado = await res.json();
    setRegistros((prev) => [...prev, criado]);
    return criado;
  }, []);

  const editarRegistro = React.useCallback(async (id, payload) => {
    const token = resolveToken();
    const { url, options } = REGISTROS_PUT(id, payload, token);
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        body?.detail || `Erro ao editar registro (${res.status})`,
      );
    }
    const atualizado = await res.json();
    setRegistros((prev) => prev.map((r) => (r.id === id ? atualizado : r)));
    return atualizado;
  }, []);

  const deletarRegistro = React.useCallback(async (id) => {
    const token = resolveToken();
    const { url, options } = REGISTROS_DELETE(id, token);
    const res = await fetch(url, options);
    if (!res.ok && res.status !== 404) {
      throw new Error(`Erro ao deletar registro (${res.status})`);
    }
    setRegistros((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const contextValue = React.useMemo(
    () => ({
      registros,
      loading,
      error,
      fetchRegistros,
      criarRegistro,
      editarRegistro,
      deletarRegistro,
    }),
    [
      registros,
      loading,
      error,
      fetchRegistros,
      criarRegistro,
      editarRegistro,
      deletarRegistro,
    ],
  );

  return (
    <RegistrosContext.Provider value={contextValue}>
      {children}
    </RegistrosContext.Provider>
  );
};

export { RegistrosContext, RegistrosProvider };
