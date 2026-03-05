import React from 'react';
import {
  ENTIDADES_GET,
  ENTIDADES_POST,
  ENTIDADES_PUT,
  ENTIDADES_DELETE,
} from '../Api';

const EntidadesContext = React.createContext();
const ENTIDADES_CONFIG_STORAGE_KEY = 'entidades_config_v1';
export const ENTIDADE_FIELD_TYPES = [
  'Texto',
  'Número',
  'Data',
  'Email',
  'Telefone',
  'Booleano',
];

const resolveToken = (token) => token || window.localStorage.getItem('token');

const normalizeName = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const generateUniqueId = (prefix = 'id') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getEntidadeId = (entidade) => entidade?.id ?? entidade?._id ?? null;
const getEntidadeName = (entidade) =>
  String(entidade?.nome || entidade?.name || entidade?.titulo || '').trim();

const getEntityKeyByValues = (id, nome) => {
  if (id !== null && id !== undefined && String(id).trim()) {
    return `id:${String(id).trim()}`;
  }

  const normalizedName = normalizeName(nome);
  if (!normalizedName) return null;
  return `name:${normalizedName}`;
};

const getEntityKeys = (entidadeOrRef) => {
  if (!entidadeOrRef) return [];

  if (typeof entidadeOrRef === 'object') {
    const idKey = getEntityKeyByValues(getEntidadeId(entidadeOrRef), null);
    const nameKey = getEntityKeyByValues(null, getEntidadeName(entidadeOrRef));
    return [idKey, nameKey].filter(Boolean);
  }

  const raw = String(entidadeOrRef).trim();
  if (!raw) return [];

  const numericId = Number(raw);
  const keys = [];
  if (Number.isFinite(numericId) && String(numericId) === raw) {
    keys.push(getEntityKeyByValues(raw, null));
  }
  keys.push(getEntityKeyByValues(null, raw));
  return keys.filter(Boolean);
};

const normalizeCampo = (campo, index = 0) => {
  const nome = String(campo?.nome || '').trim();
  const tipo = ENTIDADE_FIELD_TYPES.includes(campo?.tipo)
    ? campo.tipo
    : 'Texto';
  const obrigatorio =
    campo?.obrigatorio === true || String(campo?.obrigatorio) === 'Sim';
  const keyTypeRaw = String(campo?.keyType || campo?.chave || 'NORMAL')
    .trim()
    .toUpperCase();
  const keyType = ['PK', 'FK', 'NORMAL'].includes(keyTypeRaw)
    ? keyTypeRaw
    : 'NORMAL';
  const isUnique =
    campo?.isUnique === true || campo?.unico === true || campo?.unique === true;
  const relacionamento = campo?.relacionamento || null;

  return {
    id: campo?.id || generateUniqueId('campo'),
    nome,
    tipo,
    obrigatorio,
    keyType,
    isUnique,
    relacionamento,
  };
};

const normalizeCampos = (campos = []) =>
  (Array.isArray(campos) ? campos : [])
    .map((campo, index) => normalizeCampo(campo, index))
    .filter((campo) => campo.nome);

const throwIfDuplicateFieldNames = (campos = [], ignoreId = null) => {
  const seen = new Set();

  for (const campo of campos) {
    if (ignoreId && String(campo.id) === String(ignoreId)) {
      continue;
    }

    const normalized = normalizeName(campo.nome);
    if (!normalized) {
      throw new Error('Nome do campo é obrigatório');
    }

    if (seen.has(normalized)) {
      throw new Error(`Campo duplicado: ${campo.nome}`);
    }

    seen.add(normalized);
  }
};

const normalizeEntidadesPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const buildEntidadePayload = (entidade = {}, previous = null) => {
  const nome = String(entidade.nome || previous?.nome || '').trim();
  const categoria = String(
    entidade.categoria || previous?.categoria || 'BPMN',
  ).trim();
  const explicitTipoEntidade = String(entidade?.tipoEntidade || '').trim();
  const previousTipoEntidade = String(previous?.tipoEntidade || '').trim();
  const normalizedTipoEntidade = explicitTipoEntidade
    ? explicitTipoEntidade.toLowerCase()
    : previousTipoEntidade
      ? previousTipoEntidade.toLowerCase()
      : entidade?.isPrimaryEntity === true || previous?.isPrimaryEntity === true
        ? 'principal'
        : 'apoio';
  const tipoEntidade =
    normalizedTipoEntidade === 'principal'
      ? 'Principal'
      : normalizedTipoEntidade === 'associativa'
        ? 'Associativa'
        : normalizedTipoEntidade === 'externa'
          ? 'Externa'
          : 'Apoio';
  const isPrimaryEntity =
    typeof entidade?.isPrimaryEntity === 'boolean'
      ? entidade.isPrimaryEntity
      : normalizedTipoEntidade === 'principal';
  const descricao = String(
    entidade.descricao || previous?.descricao || 'Entidade gerada pelo BPMN',
  ).trim();
  const atributoChave =
    entidade.atributoChave ?? previous?.atributoChave ?? null;
  const ativo = entidade.ativo ?? previous?.ativo ?? true;
  const criadoPor =
    entidade.criadoPor || previous?.criadoPor || 'Usuário do sistema';
  const updated_at =
    entidade.updated_at || previous?.updated_at || new Date().toISOString();
  const numeroRelacionamentos =
    Number(entidade.numeroRelacionamentos ?? previous?.numeroRelacionamentos) ||
    (Array.isArray(entidade.relacionamentos)
      ? entidade.relacionamentos.length
      : Array.isArray(previous?.relacionamentos)
        ? previous.relacionamentos.length
        : 0);
  const bpmnUsageCount =
    Number(entidade.bpmnUsageCount ?? previous?.bpmnUsageCount) || 0;
  const campos = normalizeCampos(entidade.campos || previous?.campos || []);

  return {
    nome,
    categoria,
    tipoEntidade,
    isPrimaryEntity,
    descricao,
    atributoChave,
    ativo,
    criadoPor,
    updated_at,
    numeroRelacionamentos,
    bpmnUsageCount,
    campos,
  };
};

const readEntityConfigStorage = () => {
  try {
    const raw = window.localStorage.getItem(ENTIDADES_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
};

const writeEntityConfigStorage = (value) => {
  try {
    window.localStorage.setItem(
      ENTIDADES_CONFIG_STORAGE_KEY,
      JSON.stringify(value || {}),
    );
  } catch {
    // no-op
  }
};

const EntidadesProvider = ({ children }) => {
  const [entidadesRaw, setEntidadesRaw] = React.useState([]);
  const [entityConfigMap, setEntityConfigMap] = React.useState(() =>
    readEntityConfigStorage(),
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const saveEntityConfigMap = React.useCallback((updater) => {
    setEntityConfigMap((previous) => {
      const nextValue =
        typeof updater === 'function' ? updater(previous || {}) : updater || {};
      writeEntityConfigStorage(nextValue);
      return nextValue;
    });
  }, []);

  const getConfigForEntity = React.useCallback(
    (entidadeOrRef) => {
      const keys = getEntityKeys(entidadeOrRef);
      for (const key of keys) {
        if (entityConfigMap[key]) {
          return entityConfigMap[key];
        }
      }
      return null;
    },
    [entityConfigMap],
  );

  const entidades = React.useMemo(
    () =>
      (Array.isArray(entidadesRaw) ? entidadesRaw : []).map((entidade) => {
        const config = getConfigForEntity(entidade) || {};
        const campos = normalizeCampos(entidade.campos || config.campos || []);

        return {
          ...entidade,
          descricao: entidade.descricao || config.descricao || '',
          atributoChave: entidade.atributoChave ?? config.atributoChave ?? null,
          categoria: entidade.categoria || config.categoria || 'BPMN',
          tipoEntidade: (() => {
            const rawTipo =
              entidade.tipoEntidade ||
              config.tipoEntidade ||
              (entidade?.isPrimaryEntity === true ? 'Principal' : 'Apoio');
            const normalizedTipo = String(rawTipo || '')
              .trim()
              .toLowerCase();

            if (normalizedTipo === 'principal') return 'Principal';
            if (normalizedTipo === 'associativa') return 'Associativa';
            if (normalizedTipo === 'externa') return 'Externa';
            return 'Apoio';
          })(),
          isPrimaryEntity: (() => {
            if (typeof entidade?.isPrimaryEntity === 'boolean') {
              return entidade.isPrimaryEntity;
            }

            if (typeof config?.isPrimaryEntity === 'boolean') {
              return config.isPrimaryEntity;
            }

            const rawTipo = entidade.tipoEntidade || config.tipoEntidade || '';
            return (
              String(rawTipo || '')
                .trim()
                .toLowerCase() === 'principal'
            );
          })(),
          updated_at:
            entidade.updated_at ||
            config.updated_at ||
            entidade.created_at ||
            '',
          numeroRelacionamentos:
            Number(
              entidade.numeroRelacionamentos ?? config.numeroRelacionamentos,
            ) ||
            (Array.isArray(entidade.relacionamentos)
              ? entidade.relacionamentos.length
              : 0),
          bpmnUsageCount:
            Number(entidade.bpmnUsageCount ?? config.bpmnUsageCount) || 0,
          campos,
        };
      }),
    [entidadesRaw, getConfigForEntity],
  );

  const campos = React.useMemo(
    () =>
      entidades.flatMap((entidade) =>
        normalizeCampos(entidade.campos).map((campo) => ({
          ...campo,
          entidade: normalizeName(getEntidadeName(entidade)),
          entidadeId: getEntidadeId(entidade),
          entidadeNome: getEntidadeName(entidade),
        })),
      ),
    [entidades],
  );

  const validateUniqueEntityName = React.useCallback(
    (nome, ignoreId = null) => {
      const normalizedNewName = normalizeName(nome);
      if (!normalizedNewName) {
        throw new Error('Nome da entidade é obrigatório');
      }

      const duplicated = entidades.some((entidade) => {
        const entidadeName = normalizeName(getEntidadeName(entidade));
        if (!entidadeName) return false;
        if (entidadeName !== normalizedNewName) return false;
        if (ignoreId === null || ignoreId === undefined) return true;
        return String(getEntidadeId(entidade)) !== String(ignoreId);
      });

      if (duplicated) {
        throw new Error(`Já existe uma entidade com o nome "${nome}"`);
      }

      return true;
    },
    [entidades],
  );

  const mergeEntityConfig = React.useCallback(
    (entidadeLike, partialConfig = {}) => {
      const keys = getEntityKeys(entidadeLike);
      if (keys.length === 0) return;

      saveEntityConfigMap((previous) => {
        const current =
          keys.map((key) => previous[key]).find(Boolean) || Object.create(null);

        const merged = {
          ...current,
          ...partialConfig,
          campos: normalizeCampos(partialConfig.campos ?? current.campos ?? []),
        };

        const nextValue = { ...previous };
        keys.forEach((key) => {
          nextValue[key] = merged;
        });
        return nextValue;
      });
    },
    [saveEntityConfigMap],
  );

  const findEntidade = React.useCallback(
    (entidadeRef) => {
      const keys = getEntityKeys(entidadeRef);
      if (keys.length === 0) return null;

      return (
        entidades.find((entidade) => {
          const entidadeKeys = getEntityKeys(entidade);
          return entidadeKeys.some((key) => keys.includes(key));
        }) || null
      );
    },
    [entidades],
  );

  const getCamposEntidade = React.useCallback(
    (entidadeRef) => {
      const entidade = findEntidade(entidadeRef);
      if (!entidade) return [];
      return normalizeCampos(entidade.campos || []);
    },
    [findEntidade],
  );

  // Funções originais
  const getEntidades = async (token) => {
    const currentToken = resolveToken(token);
    const { url, options } = ENTIDADES_GET(currentToken);
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('Erro ao buscar entidades');
    const json = await response.json();
    return normalizeEntidadesPayload(json);
  };

  const adicionarEntidade = async (novaEntidade, token) => {
    const currentToken = resolveToken(token);
    if (!currentToken) {
      throw new Error('Token não encontrado para criar entidade');
    }

    const payload = buildEntidadePayload(novaEntidade);
    validateUniqueEntityName(payload.nome);
    throwIfDuplicateFieldNames(payload.campos);

    const { url, options } = ENTIDADES_POST(payload, currentToken);
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('Erro ao criar entidade');
    const entidadeCriada = await response.json();

    setEntidadesRaw((previous) => {
      const prev = Array.isArray(previous) ? previous : [];
      return [...prev, { ...entidadeCriada, ...payload }];
    });

    const entidadeFinal = { ...entidadeCriada, ...payload };
    mergeEntityConfig(entidadeFinal, {
      descricao: payload.descricao,
      atributoChave: payload.atributoChave,
      categoria: payload.categoria,
      isPrimaryEntity: payload.isPrimaryEntity === true,
      campos: payload.campos,
    });

    return entidadeFinal;
  };

  const editarEntidade = React.useCallback(
    async (id, entidadeAtualizada, token) => {
      const currentToken = resolveToken(token);
      const entidadeAnterior = Array.isArray(entidadesRaw)
        ? entidadesRaw.find(
            (entidade) => String(getEntidadeId(entidade)) === String(id),
          )
        : null;
      const payload = buildEntidadePayload(
        entidadeAtualizada,
        entidadeAnterior,
      );
      validateUniqueEntityName(payload.nome, id);
      throwIfDuplicateFieldNames(payload.campos);

      const { url, options } = ENTIDADES_PUT(id, payload, currentToken);
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Erro ao editar entidade');
      const entidadeEditada = await response.json();
      setEntidadesRaw((prev) =>
        Array.isArray(prev)
          ? prev.map((entidade) =>
              String(getEntidadeId(entidade)) === String(id)
                ? { ...entidade, ...entidadeEditada, ...payload }
                : entidade,
            )
          : prev,
      );

      mergeEntityConfig({ id, nome: payload.nome }, payload);
      return entidadeEditada;
    },
    [entidadesRaw, mergeEntityConfig, validateUniqueEntityName],
  );

  const deletarEntidade = async (id, token) => {
    const currentToken = resolveToken(token);
    const { url, options } = ENTIDADES_DELETE(id, currentToken);
    const response = await fetch(url, options);
    if (!response.ok && response.status !== 204 && response.status !== 404)
      throw new Error('Erro ao deletar entidade');

    const entidadeRemovida = entidades.find(
      (entidade) => String(getEntidadeId(entidade)) === String(id),
    );

    setEntidadesRaw((prev) =>
      Array.isArray(prev)
        ? prev.filter(
            (entidade) => String(getEntidadeId(entidade)) !== String(id),
          )
        : prev,
    );

    saveEntityConfigMap((previous) => {
      const keysToRemove = getEntityKeys(entidadeRemovida || { id });
      const nextValue = { ...previous };
      keysToRemove.forEach((key) => {
        delete nextValue[key];
      });
      return nextValue;
    });

    return true;
  };

  const adicionarCampoEntidade = React.useCallback(
    async (entidadeRef, novoCampo) => {
      const entidade = findEntidade(entidadeRef);
      if (!entidade) throw new Error('Entidade não encontrada');
      const entidadeId = getEntidadeId(entidade);
      if (entidadeId === null || entidadeId === undefined) {
        throw new Error('ID da entidade não encontrado para salvar campo.');
      }

      const camposAtualizados = [
        ...normalizeCampos(entidade.campos || []),
        normalizeCampo(novoCampo),
      ];

      throwIfDuplicateFieldNames(camposAtualizados);

      const entidadePersistida = await editarEntidade(entidadeId, {
        ...entidade,
        campos: camposAtualizados,
      });

      return normalizeCampos(entidadePersistida?.campos || camposAtualizados);
    },
    [editarEntidade, findEntidade],
  );

  const editarCampoEntidade = React.useCallback(
    async (entidadeRef, campoId, campoPatch) => {
      const entidade = findEntidade(entidadeRef);
      if (!entidade) throw new Error('Entidade não encontrada');
      const entidadeId = getEntidadeId(entidade);
      if (entidadeId === null || entidadeId === undefined) {
        throw new Error('ID da entidade não encontrado para salvar campo.');
      }

      const camposAtualizados = normalizeCampos(entidade.campos || []).map(
        (campo) =>
          String(campo.id) === String(campoId)
            ? normalizeCampo({ ...campo, ...campoPatch, id: campo.id })
            : campo,
      );

      throwIfDuplicateFieldNames(camposAtualizados);

      const entidadePersistida = await editarEntidade(entidadeId, {
        ...entidade,
        campos: camposAtualizados,
      });

      return normalizeCampos(entidadePersistida?.campos || camposAtualizados);
    },
    [editarEntidade, findEntidade],
  );

  const removerCampoEntidade = React.useCallback(
    async (entidadeRef, campoId) => {
      const entidade = findEntidade(entidadeRef);
      if (!entidade) throw new Error('Entidade não encontrada');
      const entidadeId = getEntidadeId(entidade);
      if (entidadeId === null || entidadeId === undefined) {
        throw new Error('ID da entidade não encontrado para salvar campo.');
      }

      const camposAtualizados = normalizeCampos(entidade.campos || []).filter(
        (campo) => String(campo.id) !== String(campoId),
      );

      const entidadePersistida = await editarEntidade(entidadeId, {
        ...entidade,
        campos: camposAtualizados,
      });

      return normalizeCampos(entidadePersistida?.campos || camposAtualizados);
    },
    [editarEntidade, findEntidade],
  );

  const deletarCampo = React.useCallback(
    async (campoId) => {
      const campo = campos.find((item) => String(item.id) === String(campoId));
      if (!campo) return false;
      await removerCampoEntidade(
        campo.entidadeId || campo.entidadeNome,
        campoId,
      );
      return true;
    },
    [campos, removerCampoEntidade],
  );

  const validarNomeCampoDuplicado = React.useCallback(
    (camposAtuais, nome, campoId = null) => {
      const normalizedCandidate = normalizeName(nome);
      if (!normalizedCandidate) return false;

      return normalizeCampos(camposAtuais).some((campo) => {
        if (campoId && String(campo.id) === String(campoId)) return false;
        return normalizeName(campo.nome) === normalizedCandidate;
      });
    },
    [],
  );

  // Carregar entidades e campos ao inicializar
  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = window.localStorage.getItem('token');
        if (token) {
          const entidadesData = await getEntidades(token);
          setEntidadesRaw(entidadesData);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <EntidadesContext.Provider
      value={{
        entidades,
        campos,
        loading,
        error,
        getEntidades,
        adicionarEntidade,
        editarEntidade,
        deletarEntidade,
        setEntidades: setEntidadesRaw,
        getCamposEntidade,
        adicionarCampoEntidade,
        editarCampoEntidade,
        removerCampoEntidade,
        deletarCampo,
        findEntidade,
        validarNomeEntidadeDuplicado: (nome, ignoreId) => {
          try {
            validateUniqueEntityName(nome, ignoreId);
            return false;
          } catch {
            return true;
          }
        },
        validarNomeCampoDuplicado,
      }}
    >
      {children}
    </EntidadesContext.Provider>
  );
};

export { EntidadesContext, EntidadesProvider };
