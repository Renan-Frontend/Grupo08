import { useEffect, useRef } from 'react';

/**
 * Hook para salvar automaticamente o título/tópico no localStorage.
 * @param {string} title Valor do título/tópico
 * @param {string} storageKey Chave do localStorage
 * @param {function} onSaveLayout Função chamada ao salvar layout (opcional)
 */
export function useAutoSaveTitle(
  title,
  storageKey = 'layoutTitle',
  onSaveLayout,
) {
  const titleRef = useRef(title);
  titleRef.current = title;

  // Salva no localStorage sempre que o título mudar
  useEffect(() => {
    if (title) {
      localStorage.setItem(storageKey, title);
    }
  }, [title, storageKey]);

  // Salva ao clicar em "Salvar Layout" + ao fechar/atualizar a página
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.setItem(storageKey, titleRef.current);
    };

    if (typeof onSaveLayout === 'function') {
      onSaveLayout(handleBeforeUnload);
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (typeof onSaveLayout === 'function') {
        onSaveLayout(null);
      }
    };
  }, [onSaveLayout, storageKey]);
}

/**
 * Recupera o valor salvo do título/tópico
 * @param {string} storageKey Chave do localStorage
 * @returns {string|null}
 */
export function getSavedTitle(storageKey = 'layoutTitle') {
  return localStorage.getItem(storageKey);
}
