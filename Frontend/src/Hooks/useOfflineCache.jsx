// Utility para gerenciar cache offline usando localStorage
const CACHE_PREFIX = 'bp_offline_';

export const offlineCache = {
  // Salvar dados no cache
  set: (key, data, ttl = 3600000) => {
    // TTL padrão: 1 hora
    try {
      const item = {
        data,
        timestamp: Date.now(),
        ttl,
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
      return true;
    } catch (error) {
      console.error('Erro ao salvar no cache:', error);
      return false;
    }
  },

  // Recuperar dados do cache
  get: (key) => {
    try {
      const item = localStorage.getItem(CACHE_PREFIX + key);
      if (!item) return null;

      const parsed = JSON.parse(item);
      const now = Date.now();

      // Verificar se expirou
      if (now - parsed.timestamp > parsed.ttl) {
        offlineCache.remove(key);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('Erro ao recuperar do cache:', error);
      return null;
    }
  },

  // Remover item do cache
  remove: (key) => {
    try {
      localStorage.removeItem(CACHE_PREFIX + key);
      return true;
    } catch (error) {
      console.error('Erro ao remover do cache:', error);
      return false;
    }
  },

  // Limpar todo o cache
  clear: () => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      return false;
    }
  },
};
