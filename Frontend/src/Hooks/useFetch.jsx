import React from 'react';

const useFetch = () => {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const request = React.useCallback(async (url, options) => {
    let response;
    let json;

    try {
      setError(null);
      setLoading(true);

      response = await fetch(url, options);

      // tenta ler JSON apenas se existir conteúdo
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        json = await response.json();
      } else {
        json = null;
      }

      if (!response.ok) {
        const errorMsg =
          json?.detail ||
          json?.message ||
          response.statusText ||
          'Erro desconhecido';
        throw new Error(errorMsg);
      }

      setData(json);
    } catch (err) {
      setError(err.message || 'Erro na requisição');
      setData(null);
    } finally {
      setLoading(false);
    }

    return { response, json };
  }, []);

  function reset() {
    setData(null);
    setError(null);
    setLoading(false);
  }

  return {
    data,
    loading,
    error,
    request,
    reset,
  };
};

export default useFetch;
