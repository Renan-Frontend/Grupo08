import React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import styles from './Entidades.module.css';
import Button from '../Forms/Button';
import Pagination from '../Common/Pagination';
import { useBpmnOpportunities } from '../../Hooks/useBpmnOpportunities';
import {
  ENTIDADE_FIELD_TYPES,
  EntidadesContext,
} from '../../Context/EntidadesContext';
import { UserContext } from '../../Context/UserContext';
import {
  canCreateByAccessLevel,
  canDeleteByAccessLevel,
  isEditOnlyAccessLevelTwo,
  isReadOnlyAccessLevelOne,
} from '../../Utils/accessControl';
import Close from '../Helper/Close';

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const toEntitySlug = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const formatDateTimeLabel = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getOpportunityId = (opportunity) =>
  opportunity?.id ?? opportunity?._id ?? null;

const getEntidadeId = (entidade) => entidade?.id ?? entidade?._id ?? null;

const getOpportunityName = (opportunity) =>
  String(opportunity?.name || opportunity?.nome || '').trim();

const getEntityMatchKeys = (entidade) => {
  const keys = [];
  const entityId = getEntidadeId(entidade);
  const normalizedName = normalizeText(
    entidade?.nome || entidade?.name || entidade?.titulo,
  );

  if (entityId !== null && entityId !== undefined && String(entityId).trim()) {
    keys.push(`id:${String(entityId).trim()}`);
  }
  if (normalizedName) {
    keys.push(`name:${normalizedName}`);
  }

  return keys;
};

const getTableIdFromCategory = (categoryName) => {
  const normalized = normalizeText(categoryName || 'Sem categoria');
  return `table:${normalized || 'sem-categoria'}`;
};

const getEntityTableNameKey = (entityName, tableName) => {
  const normalizedEntityName = normalizeText(entityName);
  const normalizedTableName = normalizeText(tableName || 'Sem categoria');
  if (!normalizedEntityName || !normalizedTableName) return null;
  return `table:${normalizedTableName}::name:${normalizedEntityName}`;
};

const Entidades = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { entidadeSlug = '', entidadeId: entidadeIdFromRoute = '' } =
    useParams();
  const {
    entidades: entidadesRaw,
    loading: entidadesLoading,
    error: entidadesError,
    refetchEntidades,
    deletarEntidade,
    deletarCampo,
    editarCampoEntidade,
    adicionarCampoEntidade,
  } = React.useContext(EntidadesContext);
  const { user } = React.useContext(UserContext);

  // Always refetch when entering the page to avoid stale in-memory cache.
  React.useEffect(() => {
    refetchEntidades().catch(() => {});
  }, [refetchEntidades]);

  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const isEditOnlyMode = isEditOnlyAccessLevelTwo(user);
  const canCreate = canCreateByAccessLevel(user);
  const canDelete = canDeleteByAccessLevel(user);
  const entidades = React.useMemo(
    () => (Array.isArray(entidadesRaw) ? entidadesRaw : []),
    [entidadesRaw],
  );
  const [filtro, setFiltro] = React.useState('todas');
  const [deleteConfirm, setDeleteConfirm] = React.useState(null);
  const [deleteTabelaConfirm, setDeleteTabelaConfirm] = React.useState(null);
  const [skipDeleteEntidadeConfirm, setSkipDeleteEntidadeConfirm] =
    React.useState(false);
  const [
    disableDeleteEntidadePromptDraft,
    setDisableDeleteEntidadePromptDraft,
  ] = React.useState(false);
  const [campoEmEdicao, setCampoEmEdicao] = React.useState(null);
  const [campoConfigForm, setCampoConfigForm] = React.useState({
    nome: '',
    tipo: '',
    obrigatorio: '',
    keyType: '',
    referencia: '',
  });
  const [camposConfigError, setCamposConfigError] = React.useState('');
  const [tabelaPaginaAtual, setTabelaPaginaAtual] = React.useState(1);
  const [paginasPorTabela, setPaginasPorTabela] = React.useState({});
  const itemsPorPagina = 11;
  const { opportunities: bpmnOpportunities } = useBpmnOpportunities();
  const entityIdFromQuery = React.useMemo(() => {
    const searchParams = new URLSearchParams(location.search || '');
    const rawId = String(searchParams.get('entidadeId') || '').trim();
    return rawId || null;
  }, [location.search]);
  const selectedEntityId = React.useMemo(() => {
    const routeId = String(entidadeIdFromRoute || '').trim();
    if (routeId) return routeId;
    if (entityIdFromQuery) return entityIdFromQuery;
    return null;
  }, [entidadeIdFromRoute, entityIdFromQuery]);

  React.useEffect(() => {
    const savedPreference =
      window.localStorage.getItem('entidades:skipDeleteEntidadeConfirm') ===
      'true';
    setSkipDeleteEntidadeConfirm(savedPreference);
  }, []);

  const bpmnSectionNames = React.useMemo(() => {
    const safeOpportunities = Array.isArray(bpmnOpportunities)
      ? bpmnOpportunities
      : [];
    const used = new Set();
    const ordered = [];

    safeOpportunities.forEach((opportunity) => {
      const name = getOpportunityName(opportunity);
      const key = normalizeText(name);
      if (!key || used.has(key)) return;
      used.add(key);
      ordered.push(name);
    });

    return ordered;
  }, [bpmnOpportunities]);

  const tableSections = React.useMemo(() => {
    const categoryNamesFromEntities = Array.from(
      new Set(
        entidades
          .map((entidade) => String(entidade?.categoria || '').trim())
          .map((categoria) => categoria || 'Sem categoria')
          .filter(Boolean),
      ),
    );

    const orderedTableNames = [...bpmnSectionNames];
    const seen = new Set(orderedTableNames.map((name) => normalizeText(name)));

    categoryNamesFromEntities.forEach((categoryName) => {
      const categoryNorm = normalizeText(categoryName);
      if (!categoryNorm || seen.has(categoryNorm)) return;
      seen.add(categoryNorm);
      orderedTableNames.push(categoryName);
    });

    return orderedTableNames.map((tableName) => {
      const tableNorm = normalizeText(tableName);
      const entitiesInTable = entidades.filter((entidade) => {
        const entityCategory = String(entidade?.categoria || '').trim();
        const normalizedCategory = normalizeText(
          entityCategory || 'Sem categoria',
        );
        return normalizedCategory === tableNorm;
      });

      return {
        key: getTableIdFromCategory(tableName),
        tableId: getTableIdFromCategory(tableName),
        title: tableName,
        entities: entitiesInTable,
      };
    });
  }, [bpmnSectionNames, entidades]);

  const sectionKeys = React.useMemo(
    () => new Set(tableSections.map((section) => section.key)),
    [tableSections],
  );

  const bpmnFieldsByEntityKey = React.useMemo(() => {
    const map = new Map();
    const safeOpportunities = Array.isArray(bpmnOpportunities)
      ? bpmnOpportunities
      : [];

    const ensureEntityFieldMap = (entityKey) => {
      if (!map.has(entityKey)) {
        map.set(entityKey, new Map());
      }
      return map.get(entityKey);
    };

    const getFieldUniqueKey = (field) => {
      const id = String(field?.id || '').trim();
      if (id) return `id:${id}`;
      const normalizedName = normalizeText(field?.nome);
      if (normalizedName) return `name:${normalizedName}`;
      return null;
    };

    safeOpportunities.forEach((opportunity) => {
      const opportunityTableName = getOpportunityName(opportunity);
      const nodes = Array.isArray(opportunity?.bpmn?.nodes)
        ? opportunity.bpmn.nodes
        : [];

      nodes.forEach((node) => {
        if (node?.active === false) return;

        const nodeType = normalizeText(node?.nodeType);
        if (nodeType === 'task' || nodeType === 'condicional') return;

        const entityKeys = [];
        if (
          node?.entidadeId !== null &&
          node?.entidadeId !== undefined &&
          String(node.entidadeId).trim()
        ) {
          entityKeys.push(`id:${String(node.entidadeId).trim()}`);
        }

        const nodeEntityName = normalizeText(
          node?.entidadeNome || node?.label || node?.subtitle,
        );
        if (nodeEntityName && opportunityTableName) {
          const tableNameKey = getEntityTableNameKey(
            nodeEntityName,
            opportunityTableName,
          );
          if (tableNameKey) {
            entityKeys.push(tableNameKey);
          }
        }

        if (entityKeys.length === 0) return;

        const nodeFields = Array.isArray(node?.selectedEntityFields)
          ? node.selectedEntityFields
          : [];

        const normalizedFields = nodeFields
          .map((field) => ({
            id: String(field?.id || '').trim(),
            nome: String(field?.nome || '').trim(),
            tipo: String(field?.tipo || '').trim() || 'Texto',
            obrigatorio:
              field?.obrigatorio === true ||
              String(field?.obrigatorio || '') === 'Sim',
            keyType: String(field?.keyType || field?.chave || 'NORMAL')
              .trim()
              .toUpperCase(),
            relacionamento: String(field?.relacionamento || '').trim() || null,
          }))
          .filter((field) => field.nome);

        if (normalizedFields.length === 0) return;

        entityKeys.forEach((entityKey) => {
          const fieldsMap = ensureEntityFieldMap(entityKey);
          normalizedFields.forEach((field) => {
            const uniqueKey = getFieldUniqueKey(field);
            if (!uniqueKey) return;
            if (fieldsMap.has(uniqueKey)) return;
            fieldsMap.set(uniqueKey, {
              ...field,
              source: 'bpmn',
            });
          });
        });
      });
    });

    return map;
  }, [bpmnOpportunities]);

  // Ler filtro da navegação
  React.useEffect(() => {
    if (selectedEntityId) {
      const byId = entidades.find(
        (entidade) => String(getEntidadeId(entidade)) === selectedEntityId,
      );

      if (byId?.nome) {
        setFiltro(normalizeText(byId.nome));
        setTabelaPaginaAtual(1);
        return;
      }
    }

    if (location.state?.entidade) {
      setFiltro(location.state.entidade.toLowerCase());
    } else if (entidadeSlug) {
      const normalizedSlug = toEntitySlug(entidadeSlug);
      const entidadeSelecionada = entidades.find(
        (entidade) => toEntitySlug(entidade?.nome) === normalizedSlug,
      );

      if (entidadeSelecionada?.nome) {
        setFiltro(normalizeText(entidadeSelecionada.nome));
      } else {
        setFiltro(normalizeText(entidadeSlug));
      }
    } else if (location.pathname === '/entidades') {
      setFiltro('todas');
    }
    setTabelaPaginaAtual(1); // Reset paginação ao mudar filtro
  }, [
    entidadeSlug,
    entidades,
    selectedEntityId,
    location.state,
    location.pathname,
  ]);

  const entidadeSelecionada = React.useMemo(() => {
    if (selectedEntityId) {
      const byId = entidades.find(
        (entidade) => String(getEntidadeId(entidade)) === selectedEntityId,
      );
      if (byId) return byId;
    }

    return (
      entidades.find(
        (entidade) => normalizeText(entidade?.nome) === normalizeText(filtro),
      ) || null
    );
  }, [entidades, selectedEntityId, filtro]);

  const getMergedEntityFields = React.useCallback(
    (entidade) => {
      if (!entidade) return [];

      const baseFields = Array.isArray(entidade?.campos) ? entidade.campos : [];
      const mergedMap = new Map();

      baseFields.forEach((field) => {
        const id = String(field?.id || '').trim();
        const nameKey = normalizeText(field?.nome);
        const uniqueKey = id ? `id:${id}` : nameKey ? `name:${nameKey}` : null;
        if (!uniqueKey) return;

        mergedMap.set(uniqueKey, {
          ...field,
          id,
          nome: String(field?.nome || '').trim(),
          tipo: String(field?.tipo || '').trim() || 'Texto',
          obrigatorio:
            field?.obrigatorio === true ||
            String(field?.obrigatorio || '') === 'Sim',
          keyType: String(field?.keyType || field?.chave || 'NORMAL')
            .trim()
            .toUpperCase(),
          relacionamento: String(field?.relacionamento || '').trim() || null,
          source: 'entidade',
          entidadeId: getEntidadeId(entidade),
          entidadeNome: String(entidade?.nome || '').trim(),
        });
      });

      const entityId = getEntidadeId(entidade);
      const entityName =
        entidade?.nome || entidade?.name || entidade?.titulo || '';
      const entityCategory = entidade?.categoria || 'Sem categoria';
      const entityKeys = [
        entityId !== null && entityId !== undefined && String(entityId).trim()
          ? `id:${String(entityId).trim()}`
          : null,
        getEntityTableNameKey(entityName, entityCategory),
      ].filter(Boolean);

      entityKeys.forEach((entityKey) => {
        const bpmnFields = bpmnFieldsByEntityKey.get(entityKey);
        if (!bpmnFields) return;

        bpmnFields.forEach((field, fieldKey) => {
          if (mergedMap.has(fieldKey)) return;

          mergedMap.set(fieldKey, {
            ...field,
            id:
              String(field?.id || '').trim() ||
              `bpmn-${normalizeText(entidade?.nome)}-${normalizeText(field?.nome)}`,
            entidadeId: getEntidadeId(entidade),
            entidadeNome: String(entidade?.nome || '').trim(),
            readonlyFromBpmn: true,
          });
        });
      });

      return Array.from(mergedMap.values());
    },
    [bpmnFieldsByEntityKey],
  );

  const camposFiltrados = React.useMemo(() => {
    if (!entidadeSelecionada) return [];
    return getMergedEntityFields(entidadeSelecionada);
  }, [entidadeSelecionada, getMergedEntityFields]);

  React.useEffect(() => {
    setCamposConfigError('');
    setCampoEmEdicao(null);
    setCampoConfigForm({
      nome: '',
      tipo: '',
      obrigatorio: '',
      keyType: '',
      referencia: '',
    });
  }, [entidadeSelecionada]);

  const handleEdit = (item, section) => {
    if (isReadOnlyMode) return;

    const entidadeId = getEntidadeId(item);
    if (entidadeId === null || entidadeId === undefined) return;

    const tableId = String(section?.tableId || '').trim();
    const query = new URLSearchParams();
    query.set('entidadeId', String(entidadeId));
    if (tableId) {
      query.set('tabelaId', tableId);
    }

    navigate(`/entidades/criar?${query.toString()}`);
  };

  const handleViewEntityFields = (item) => {
    const entidadeId = getEntidadeId(item);
    const entidadeNome = String(
      item?.nome || item?.name || item?.titulo || '',
    ).trim();

    if (
      entidadeId !== null &&
      entidadeId !== undefined &&
      String(entidadeId).trim()
    ) {
      navigate(
        `/entidades?entidadeId=${encodeURIComponent(String(entidadeId).trim())}`,
      );
      return;
    }

    if (entidadeNome) {
      setFiltro(normalizeText(entidadeNome));
      setTabelaPaginaAtual(1);
    }
  };

  const handleFiltroChange = (valor) => {
    if (valor === 'todas') {
      navigate('/entidades');
    } else {
      setFiltro(valor);
      setTabelaPaginaAtual(1);
    }
    setPaginasPorTabela({});
  };

  const confirmDelete = () => {
    if (isReadOnlyMode) return;
    if (!deleteConfirm) return;

    const { type, id, categoria } = deleteConfirm;

    if (type === 'entidade' && disableDeleteEntidadePromptDraft) {
      window.localStorage.setItem(
        'entidades:skipDeleteEntidadeConfirm',
        'true',
      );
      setSkipDeleteEntidadeConfirm(true);
    }

    if (type === 'entidade') {
      deletarEntidade(id);
    } else if (type === 'campo') {
      deletarCampo(id);
    }

    setDeleteConfirm(null);
    setDisableDeleteEntidadePromptDraft(false);
  };

  const handleDelete = (id) => {
    if (!canDelete) return;
    if (id === null || id === undefined) return;

    if (skipDeleteEntidadeConfirm) {
      deletarEntidade(id);
      return;
    }

    setDeleteConfirm({ type: 'entidade', id });
  };
  const handleDeleteCampo = (id) => {
    if (!canDelete) return;
    setDeleteConfirm({ type: 'campo', id });
  };

  const handleDeleteTabela = async () => {
    if (!canDelete || !deleteTabelaConfirm) return;
    const entities = deleteTabelaConfirm.entities || [];
    for (const entity of entities) {
      const id = getEntidadeId(entity);
      if (id !== null && id !== undefined) {
        await deletarEntidade(id);
      }
    }
    setDeleteTabelaConfirm(null);
  };
  const handleEditCampo = (campo) => {
    if (isReadOnlyMode) return;
    if (!campo) return;

    const obrigatorioAtual =
      campo.obrigatorio === true || campo.obrigatorio === 'Sim';

    const keyTypeRaw = String(campo?.keyType || campo?.chave || 'NORMAL')
      .trim()
      .toUpperCase();
    const keyType = ['PK', 'FK', 'NORMAL'].includes(keyTypeRaw)
      ? keyTypeRaw
      : 'NORMAL';

    const relacionamento = campo?.relacionamento;
    const referencia = (() => {
      if (!relacionamento) return '';
      if (typeof relacionamento === 'string') return relacionamento;

      const targetEntity = String(
        relacionamento?.entidade || relacionamento?.targetEntity || '',
      ).trim();
      const targetField = String(
        relacionamento?.campo || relacionamento?.targetField || '',
      ).trim();

      if (targetEntity && targetField) return `${targetEntity}.${targetField}`;
      return targetEntity || targetField || '';
    })();

    setCampoEmEdicao({
      campoId: campo.id,
      entidadeRef:
        campo.entidadeId ||
        campo.entidadeNome ||
        entidadeSelecionada?.id ||
        entidadeSelecionada?._id ||
        entidadeSelecionada?.nome ||
        null,
    });

    setCampoConfigForm({
      nome: String(campo.nome || ''),
      tipo: String(campo.tipo || 'Texto'),
      obrigatorio: obrigatorioAtual ? 'Sim' : 'Não',
      keyType,
      referencia,
    });

    setCamposConfigError('');
  };

  const handleAddCampoConfiguracao = async () => {
    if (isReadOnlyMode) return;
    if (!entidadeSelecionada) return;

    const nome = String(campoConfigForm.nome || '').trim();
    if (!nome) {
      setCamposConfigError('Informe o nome do campo para adicionar.');
      return;
    }

    if (!String(campoConfigForm.tipo || '').trim()) {
      setCamposConfigError('Selecione o tipo do campo.');
      return;
    }

    if (!String(campoConfigForm.obrigatorio || '').trim()) {
      setCamposConfigError('Selecione se o campo é obrigatório.');
      return;
    }

    if (!String(campoConfigForm.keyType || '').trim()) {
      setCamposConfigError('Selecione o tipo de chave do campo.');
      return;
    }

    setCamposConfigError('');

    try {
      if (campoEmEdicao?.campoId && campoEmEdicao?.entidadeRef) {
        await editarCampoEntidade(
          campoEmEdicao.entidadeRef,
          campoEmEdicao.campoId,
          {
            nome,
            tipo: campoConfigForm.tipo,
            obrigatorio: campoConfigForm.obrigatorio === 'Sim',
            keyType: String(campoConfigForm.keyType || 'NORMAL')
              .trim()
              .toUpperCase(),
            relacionamento:
              String(campoConfigForm.referencia || '').trim() || null,
          },
        );
      } else {
        await adicionarCampoEntidade(entidadeSelecionada, {
          nome,
          tipo: campoConfigForm.tipo,
          obrigatorio: campoConfigForm.obrigatorio === 'Sim',
          keyType: String(campoConfigForm.keyType || 'NORMAL')
            .trim()
            .toUpperCase(),
          relacionamento:
            String(campoConfigForm.referencia || '').trim() || null,
        });
      }

      setCampoConfigForm({
        nome: '',
        tipo: '',
        obrigatorio: '',
        keyType: '',
        referencia: '',
      });
      setCampoEmEdicao(null);
    } catch (error) {
      setCamposConfigError(
        String(
          error?.message ||
            (campoEmEdicao
              ? 'Não foi possível atualizar o campo.'
              : 'Não foi possível adicionar o campo.'),
        ),
      );
    }
  };

  const handleCancelarEdicaoCampo = () => {
    setCampoEmEdicao(null);
    setCampoConfigForm({
      nome: '',
      tipo: '',
      obrigatorio: '',
      keyType: '',
      referencia: '',
    });
    setCamposConfigError('');
  };

  const getEntityTypeLabel = (item) => {
    const explicitType = normalizeText(item?.tipoEntidade);
    if (explicitType === 'principal') return 'Principal';
    if (explicitType === 'apoio') return 'Apoio';
    if (explicitType === 'associativa') return 'Associativa';
    if (explicitType === 'externa') return 'Externa';
    return item?.isPrimaryEntity === true ? 'Principal' : 'Apoio';
  };

  const getEntityFieldCount = (item) => getMergedEntityFields(item).length;

  const getEntityBpmnUsageCount = (item) => {
    const entityId = item?.id ?? item?._id ?? null;
    const entityName = item?.nome || item?.name || item?.titulo || '';

    const keys = [
      entityId !== null && entityId !== undefined && String(entityId).trim()
        ? `id:${String(entityId).trim()}`
        : null,
      normalizeText(entityName) ? `name:${normalizeText(entityName)}` : null,
    ].filter(Boolean);

    if (keys.length === 0) return 0;

    return keys.reduce(
      (highest, key) =>
        Math.max(highest, bpmnUsageCountByEntityKey.get(key) || 0),
      0,
    );
  };

  const bpmnUsageCountByEntityKey = (() => {
    const usageByKey = new Map();
    const safeOpportunities = Array.isArray(bpmnOpportunities)
      ? bpmnOpportunities
      : [];

    safeOpportunities.forEach((opportunity) => {
      const opportunityId = getOpportunityId(opportunity);
      if (opportunityId === null || opportunityId === undefined) return;

      const nodes = Array.isArray(opportunity?.bpmn?.nodes)
        ? opportunity.bpmn.nodes
        : [];
      if (nodes.length === 0) return;

      const keysInOpportunity = new Set();

      nodes.forEach((node) => {
        if (node?.active === false) return;

        const nodeType = String(node?.nodeType || '')
          .trim()
          .toLowerCase();
        if (nodeType === 'task' || nodeType === 'condicional') return;

        const nodeEntityId = node?.entidadeId;
        if (
          nodeEntityId !== null &&
          nodeEntityId !== undefined &&
          String(nodeEntityId).trim()
        ) {
          keysInOpportunity.add(`id:${String(nodeEntityId).trim()}`);
        }

        const nodeEntityName = String(
          node?.entidadeNome || node?.label || node?.subtitle || '',
        ).trim();
        const normalizedEntityName = normalizeText(nodeEntityName);
        if (normalizedEntityName) {
          keysInOpportunity.add(`name:${normalizedEntityName}`);
        }
      });

      keysInOpportunity.forEach((key) => {
        usageByKey.set(key, (usageByKey.get(key) || 0) + 1);
      });
    });

    return usageByKey;
  })();

  const getFieldKeyLabel = (campo, entidadeAtributoChave) => {
    const explicitKeyType = normalizeText(campo?.keyType || campo?.chave);
    if (explicitKeyType === 'pk') return 'PK';
    if (explicitKeyType === 'fk') return 'FK';
    if (explicitKeyType === 'normal') return 'Normal';

    const campoNome = normalizeText(campo?.nome);
    const atributoChaveNome = normalizeText(entidadeAtributoChave);

    if (campoNome && atributoChaveNome && campoNome === atributoChaveNome) {
      return 'PK';
    }

    return 'Normal';
  };

  const getFieldRelationshipLabel = (campo) => {
    const relationship = campo?.relacionamento;
    if (!relationship) return '-';

    if (typeof relationship === 'string') {
      return String(relationship).trim() || '-';
    }

    const targetEntity = String(
      relationship?.entidade || relationship?.targetEntity || '',
    ).trim();
    const targetField = String(
      relationship?.campo || relationship?.targetField || '',
    ).trim();

    if (targetEntity && targetField) return `${targetEntity}.${targetField}`;
    if (targetEntity) return targetEntity;
    if (targetField) return targetField;

    return '-';
  };

  const renderTable = (section) => {
    const entidadesCategoria = Array.isArray(section?.entities)
      ? section.entities
      : [];
    // Pagina tanto na visão geral quanto na visão de tabela específica.
    const usaPaginacao = filtro === 'todas' || filtro === section.key;

    let dadosExibidos, temProxima, temAnterior, paginaAtual;

    if (usaPaginacao) {
      const totalPaginas = Math.max(
        1,
        Math.ceil(entidadesCategoria.length / itemsPorPagina),
      );
      const paginaBase =
        filtro === 'todas'
          ? Number(paginasPorTabela[section.key] || 1)
          : tabelaPaginaAtual;
      paginaAtual = Math.min(Math.max(1, paginaBase), totalPaginas);
      const inicio = (paginaAtual - 1) * itemsPorPagina;
      dadosExibidos = entidadesCategoria.slice(inicio, inicio + itemsPorPagina);
      temProxima = paginaAtual < totalPaginas;
      temAnterior = paginaAtual > 1;
    } else {
      // Visualização resumida sem limite artificial
      dadosExibidos = entidadesCategoria;
    }

    const temMuitos = false;

    return (
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>{section.title}</h2>
          {canDelete && entidadesCategoria.length > 0 && (
            <button
              className={styles.deleteTabelaBtn}
              onClick={() => setDeleteTabelaConfirm(section)}
              title="Deletar a tabela inteira"
            >
              🗑️ Deletar tabela
            </button>
          )}
        </div>
        <div className={styles.tableWrapper}>
          <table className={`${styles.table} ${styles.entityTable}`}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Qtd. Campos</th>
                <th>Usada em BPMN</th>
                <th>Tipo da Entidade</th>
                <th>Criado por</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {dadosExibidos.map((item) => (
                <tr key={getEntidadeId(item) ?? item.nome}>
                  <td
                    className={styles.nameCell}
                    onClick={() => {
                      handleViewEntityFields(item);
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Clique para visualizar os campos da entidade"
                  >
                    {item.nome}
                  </td>
                  <td>{item.descricao}</td>
                  <td>{getEntityFieldCount(item)}</td>
                  <td>{getEntityBpmnUsageCount(item)}</td>
                  <td>{getEntityTypeLabel(item)}</td>
                  <td className={styles.creatorCell}>{item.criadoPor}</td>
                  <td>
                    {formatDateTimeLabel(item.updated_at || item.created_at)}
                  </td>
                  <td className={styles.actionsCell}>
                    <div className={styles.actions}>
                      {isReadOnlyMode ? (
                        <span className={styles.viewOnlyBadge}>Visualizar</span>
                      ) : null}
                      {!isReadOnlyMode ? (
                        <button
                          className={styles.editBtn}
                          onClick={() => handleEdit(item, section)}
                          title="Editar"
                        >
                          ✏️
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(getEntidadeId(item))}
                          title="Deletar"
                        >
                          🗑️
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {usaPaginacao &&
          Math.ceil(entidadesCategoria.length / itemsPorPagina) > 1 && (
            <Pagination
              currentPage={paginaAtual}
              totalPages={Math.ceil(entidadesCategoria.length / itemsPorPagina)}
              onPrevious={() => {
                if (filtro === 'todas') {
                  setPaginasPorTabela((prev) => ({
                    ...prev,
                    [section.key]: Math.max(
                      1,
                      Number(prev[section.key] || 1) - 1,
                    ),
                  }));
                  return;
                }
                setTabelaPaginaAtual((prev) => Math.max(1, prev - 1));
              }}
              onNext={() => {
                const totalPags = Math.ceil(
                  entidadesCategoria.length / itemsPorPagina,
                );
                if (filtro === 'todas') {
                  setPaginasPorTabela((prev) => ({
                    ...prev,
                    [section.key]: Math.min(
                      totalPags,
                      Number(prev[section.key] || 1) + 1,
                    ),
                  }));
                  return;
                }
                setTabelaPaginaAtual((prev) => Math.min(totalPags, prev + 1));
              }}
            />
          )}
        {temMuitos && !usaPaginacao && (
          <button
            className={styles.viewMoreBtn}
            onClick={() => setFiltro(section.key)}
          >
            Ver a tabela completa
          </button>
        )}
        {!temMuitos && <div className={styles.tableBorder}></div>}
      </div>
    );
  };

  const renderCamposView = () => {
    const atributoChaveEntidade = entidadeSelecionada?.atributoChave;
    const totalCamposConfigurados = camposFiltrados.length;

    return (
      <div className={styles.camposView}>
        <div className={styles.tableSection}>
          <div className={styles.configContainer}>
            <h3 className={styles.configTitle}>Configuração dos campos</h3>

            <div className={styles.configRow}>
              <input
                type="text"
                className={styles.configInput}
                placeholder="Nome do novo campo"
                value={campoConfigForm.nome}
                disabled={isReadOnlyMode}
                onChange={(event) =>
                  setCampoConfigForm((previous) => ({
                    ...previous,
                    nome: event.target.value,
                  }))
                }
              />

              <select
                className={styles.filter}
                value={campoConfigForm.tipo}
                disabled={isReadOnlyMode}
                onChange={(event) =>
                  setCampoConfigForm((previous) => ({
                    ...previous,
                    tipo: event.target.value,
                  }))
                }
              >
                <option value="" disabled className={styles.selectPlaceholder}>
                  Tipo:
                </option>
                {ENTIDADE_FIELD_TYPES.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>

              <select
                className={styles.filter}
                value={campoConfigForm.obrigatorio}
                disabled={isReadOnlyMode}
                onChange={(event) =>
                  setCampoConfigForm((previous) => ({
                    ...previous,
                    obrigatorio: event.target.value,
                  }))
                }
              >
                <option value="" disabled className={styles.selectPlaceholder}>
                  Obrigatório?
                </option>
                <option value="Sim">Sim</option>
                <option value="Não">Não</option>
              </select>

              <select
                className={styles.filter}
                value={campoConfigForm.keyType}
                disabled={isReadOnlyMode}
                onChange={(event) =>
                  setCampoConfigForm((previous) => ({
                    ...previous,
                    keyType: event.target.value,
                  }))
                }
              >
                <option value="" disabled className={styles.selectPlaceholder}>
                  Chave:
                </option>
                <option value="NORMAL">Normal</option>
                <option value="PK">PK</option>
                <option value="FK">FK</option>
              </select>

              <input
                type="text"
                className={styles.configInput}
                placeholder="Referência (ex: cliente.id)"
                value={campoConfigForm.referencia}
                disabled={isReadOnlyMode}
                onChange={(event) =>
                  setCampoConfigForm((previous) => ({
                    ...previous,
                    referencia: event.target.value,
                  }))
                }
              />

              <button
                type="button"
                className={styles.applyConfigBtn}
                onClick={handleAddCampoConfiguracao}
                disabled={isReadOnlyMode}
              >
                {campoEmEdicao ? 'Salvar edição' : 'Adicionar campo'}
              </button>

              {campoEmEdicao ? (
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={handleCancelarEdicaoCampo}
                  disabled={isReadOnlyMode}
                >
                  Cancelar
                </button>
              ) : null}
            </div>

            <p className={styles.configInfo}>
              Campos configurados atualmente: {totalCamposConfigurados}
            </p>
            {camposConfigError ? (
              <p className={styles.configError}>{camposConfigError}</p>
            ) : null}
          </div>
        </div>

        <div className={styles.tableSection}>
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.fieldsTable}`}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Obrigatório</th>
                  <th>Chave</th>
                  <th>Referência</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {camposFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      Nenhum campo cadastrado para esta entidade
                    </td>
                  </tr>
                ) : (
                  camposFiltrados.map((campo) => (
                    <tr key={campo.id}>
                      <td className={styles.nameCell}>{campo.nome}</td>
                      <td>{campo.tipo || '-'}</td>
                      <td>
                        {campo.obrigatorio === true ||
                        campo.obrigatorio === 'Sim'
                          ? 'Sim'
                          : 'Não'}
                      </td>
                      <td>{getFieldKeyLabel(campo, atributoChaveEntidade)}</td>
                      <td>{getFieldRelationshipLabel(campo)}</td>
                      <td className={styles.actionsCell}>
                        <div className={styles.actions}>
                          {isReadOnlyMode ? (
                            <span className={styles.viewOnlyBadge}>
                              Visualizar
                            </span>
                          ) : null}
                          {!isReadOnlyMode ? (
                            <button
                              className={`${styles.iconBtn} ${styles.editBtn}`}
                              disabled={campo.readonlyFromBpmn === true}
                              onClick={() => handleEditCampo(campo)}
                              title={
                                campo.readonlyFromBpmn
                                  ? 'Campo vindo do BPMN. Salve a entidade para editar aqui.'
                                  : 'Editar'
                              }
                            >
                              ✏️
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              className={`${styles.iconBtn} ${styles.deleteBtn}`}
                              disabled={campo.readonlyFromBpmn === true}
                              onClick={() => handleDeleteCampo(campo.id)}
                              title={
                                campo.readonlyFromBpmn
                                  ? 'Campo vindo do BPMN. Salve a entidade para remover aqui.'
                                  : 'Deletar'
                              }
                            >
                              🗑️
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const isEntityFieldsView = filtro !== 'todas' && !sectionKeys.has(filtro);

  return (
    <section className={styles.container}>
      <div className={styles.content}>
        {entidadesLoading && entidades.length === 0 ? (
          <p>Carregando entidades...</p>
        ) : null}
        {entidadesError && entidades.length === 0 ? (
          <p className={styles.configError}>
            Erro ao carregar entidades: {entidadesError}
          </p>
        ) : null}
        {(() => {
          return (
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <h1 className={styles.title}>
                  {isEntityFieldsView ? 'Campo de Entidade' : 'Entidades'}
                </h1>

                {!isEntityFieldsView && (
                  <select
                    className={styles.filter}
                    value={filtro}
                    onChange={(e) => handleFiltroChange(e.target.value)}
                  >
                    <option value="todas">Todas as Entidades</option>
                    {tableSections.map((section) => (
                      <option key={section.key} value={section.key}>
                        {section.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className={styles.headerActions}>
                {isReadOnlyMode ? (
                  <span className={styles.topReadOnlyBadge}>
                    Modo somente visualizacao ativo para o seu nivel de acesso.
                  </span>
                ) : null}
                {isEditOnlyMode ? (
                  <span className={styles.topReadOnlyBadge}>
                    Nivel 2: edicao e visualizacao.
                  </span>
                ) : null}
                {filtro === 'todas' && canCreate && (
                  <Button
                    className={styles.createBtn}
                    onClick={() => navigate('/entidades/criar')}
                  >
                    ✚ Criar Entidade
                  </Button>
                )}
                {isEntityFieldsView && (
                  <Button
                    className={styles.createBtn}
                    onClick={() => navigate('/entidades')}
                  >
                    Salvar
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        <div>
          {filtro === 'todas'
            ? tableSections.map((section) => (
                <React.Fragment key={section.key}>
                  {renderTable(section)}
                </React.Fragment>
              ))
            : sectionKeys.has(filtro)
              ? renderTable(
                  tableSections.find((section) => section.key === filtro) || {
                    key: filtro,
                    title: filtro,
                    entities: [],
                  },
                )
              : renderCamposView()}
        </div>
      </div>

      {deleteTabelaConfirm && (
        <Close
          title="Deletar tabela inteira"
          message={`Tem certeza que deseja deletar todas as ${deleteTabelaConfirm.entities.length} entidades da tabela "${deleteTabelaConfirm.title}"? Esta ação não pode ser desfeita.`}
          onConfirm={handleDeleteTabela}
          onCancel={() => setDeleteTabelaConfirm(null)}
        />
      )}

      {deleteConfirm && (
        <Close
          title={
            deleteConfirm.type === 'entidade'
              ? 'Deletar Entidade'
              : 'Deletar Campo'
          }
          message={
            deleteConfirm.type === 'entidade'
              ? 'Tem certeza que deseja deletar esta entidade? Esta ação não pode ser desfeita.'
              : 'Tem certeza que deseja deletar este campo? Esta ação não pode ser desfeita.'
          }
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirm(null);
            setDisableDeleteEntidadePromptDraft(false);
          }}
        >
          {deleteConfirm.type === 'entidade' ? (
            <label className={styles.deleteConfirmOptOut}>
              <input
                type="checkbox"
                checked={disableDeleteEntidadePromptDraft}
                onChange={(event) =>
                  setDisableDeleteEntidadePromptDraft(event.target.checked)
                }
              />
              Não quero receber essa mensagem novamente.
            </label>
          ) : null}
        </Close>
      )}
    </section>
  );
};

export default Entidades;
