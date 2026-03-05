import React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import styles from './Entidades.module.css';
import Button from '../Forms/Button';
import Pagination from '../Common/Pagination';
import usePagination from '../../Hooks/usePagination';
import { useBpmnOpportunities } from '../../Hooks/useBpmnOpportunities';
import {
  ENTIDADE_FIELD_TYPES,
  EntidadesContext,
} from '../../Context/EntidadesContext';
import { UserContext } from '../../Context/UserContext';
import { isReadOnlyAccessLevelOne } from '../../Utils/accessControl';
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

const Entidades = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { entidadeSlug = '' } = useParams();
  const {
    entidades: entidadesRaw,
    editarEntidade,
    deletarEntidade,
    campos,
    deletarCampo,
    editarCampoEntidade,
    adicionarCampoEntidade,
  } = React.useContext(EntidadesContext);
  const { user } = React.useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const entidades = React.useMemo(
    () => (Array.isArray(entidadesRaw) ? entidadesRaw : []),
    [entidadesRaw],
  );
  const [filtro, setFiltro] = React.useState('todas');
  const [editingId, setEditingId] = React.useState(null);
  const [editForm, setEditForm] = React.useState({
    nome: '',
    descricao: '',
    atributoChave: '',
  });
  const [deleteConfirm, setDeleteConfirm] = React.useState(null);
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
  const itemsPorPagina = 11;
  const { opportunities: bpmnOpportunities } = useBpmnOpportunities();

  React.useEffect(() => {
    const savedPreference =
      window.localStorage.getItem('entidades:skipDeleteEntidadeConfirm') ===
      'true';
    setSkipDeleteEntidadeConfirm(savedPreference);
  }, []);

  // Extrai categorias únicas das entidades
  const categorias = Array.from(
    new Set(entidades.map((e) => e.categoria)),
  ).filter(Boolean);

  // Ler filtro da navegação
  React.useEffect(() => {
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
  }, [entidadeSlug, entidades, location.state, location.pathname]);

  // Gerenciar paginação para campos
  const camposFiltrados = React.useMemo(() => {
    return campos.filter((campo) => campo.entidade === filtro.toLowerCase());
  }, [campos, filtro]);

  const entidadeSelecionada = React.useMemo(
    () =>
      entidades.find(
        (entidade) => normalizeText(entidade?.nome) === normalizeText(filtro),
      ) || null,
    [entidades, filtro],
  );

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

  // Paginação para as categorias (entidades)
  const {
    currentPage: paginaEntidades,
    totalPages: totalPaginasEntidades,
    paginatedItems: categoriasAtual,
    nextPage: nextPageEntidades,
    prevPage: prevPageEntidades,
  } = usePagination(categorias, 2);

  const handleEdit = (item) => {
    if (isReadOnlyMode) return;
    const entidadeId = getEntidadeId(item);
    if (entidadeId === null || entidadeId === undefined) return;

    setEditingId(entidadeId);
    setEditForm({
      nome: item.nome,
      descricao: item.descricao,
      atributoChave: item.atributoChave,
    });
  };

  const handleEditChange = (field, value) =>
    setEditForm((prev) => ({ ...prev, [field]: value }));

  const handleEditSave = async (id) => {
    if (isReadOnlyMode) return;
    if (!editForm.nome.trim() || !editForm.descricao.trim()) return;

    const token = window.localStorage.getItem('token');
    // Busca a entidade original para pegar a categoria
    const entidadeOriginal = entidades.find(
      (entidade) => String(getEntidadeId(entidade)) === String(id),
    );
    if (!entidadeOriginal) return;
    await editarEntidade(
      id,
      {
        nome: editForm.nome.trim(),
        descricao: editForm.descricao.trim(),
        atributoChave: editForm.atributoChave.trim(),
        categoria: entidadeOriginal.categoria,
      },
      token,
    );
    setEditingId(null);
  };

  const handleFiltroChange = (valor) => {
    if (valor === 'todas') {
      navigate('/entidades');
    } else {
      setFiltro(valor);
    }
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
    if (isReadOnlyMode) return;
    if (id === null || id === undefined) return;

    if (skipDeleteEntidadeConfirm) {
      deletarEntidade(id);
      return;
    }

    setDeleteConfirm({ type: 'entidade', id });
  };
  const handleDeleteCampo = (id) => {
    if (isReadOnlyMode) return;
    setDeleteConfirm({ type: 'campo', id });
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

  const getEntityFieldCount = (item) =>
    Array.isArray(item?.campos) ? item.campos.length : 0;

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

  const renderTable = (titulo, dados) => {
    // Filtra entidades da categoria (normalizando para ignorar maiúsculas/minúsculas e espaços)
    const tituloNorm = (titulo || '').trim().toLowerCase();
    const entidadesCategoria = entidades.filter(
      (e) => (e.categoria || '').trim().toLowerCase() === tituloNorm,
    );
    // Se está visualizando uma categoria específica, mostra com paginação. Se está em "todas", mostra apenas 4
    const ehVisualizacaoCompleta = filtro === titulo;

    let dadosExibidos, temProxima, temAnterior, paginaAtual;

    if (ehVisualizacaoCompleta) {
      // Visualização completa com paginação
      const totalPaginas = Math.ceil(
        entidadesCategoria.length / itemsPorPagina,
      );
      paginaAtual = Math.min(tabelaPaginaAtual, totalPaginas);
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
          <h2 className={styles.tableTitle}>{titulo}</h2>
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
                      if (!editingId) {
                        navigate(`/entidades/${toEntitySlug(item.nome)}`);
                      }
                    }}
                    style={{ cursor: editingId ? 'default' : 'pointer' }}
                    title={editingId ? undefined : 'Clique para ver campos'}
                  >
                    {editingId === getEntidadeId(item) ? (
                      <input
                        className={styles.editInput}
                        value={editForm.nome}
                        disabled={isReadOnlyMode}
                        onChange={(e) =>
                          handleEditChange('nome', e.target.value)
                        }
                      />
                    ) : (
                      item.nome
                    )}
                  </td>
                  <td>
                    {editingId === getEntidadeId(item) ? (
                      <input
                        className={styles.editInput}
                        value={editForm.descricao}
                        disabled={isReadOnlyMode}
                        onChange={(e) =>
                          handleEditChange('descricao', e.target.value)
                        }
                      />
                    ) : (
                      item.descricao
                    )}
                  </td>
                  <td>{getEntityFieldCount(item)}</td>
                  <td>{getEntityBpmnUsageCount(item)}</td>
                  <td>{getEntityTypeLabel(item)}</td>
                  <td className={styles.creatorCell}>{item.criadoPor}</td>
                  <td>
                    {formatDateTimeLabel(item.updated_at || item.created_at)}
                  </td>
                  <td className={styles.actionsCell}>
                    <div className={styles.actions}>
                      {editingId === getEntidadeId(item) ? (
                        <>
                          <button
                            className={styles.saveBtn}
                            onClick={() => handleEditSave(getEntidadeId(item))}
                            disabled={isReadOnlyMode}
                            title="Salvar"
                          >
                            Salvar
                          </button>
                          <button
                            className={styles.cancelBtn}
                            onClick={() => setEditingId(null)}
                            title="Cancelar"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={styles.editBtn}
                            onClick={() => handleEdit(item)}
                            disabled={isReadOnlyMode}
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            className={styles.deleteBtn}
                            onClick={() => handleDelete(getEntidadeId(item))}
                            disabled={isReadOnlyMode}
                            title="Deletar"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ehVisualizacaoCompleta && (
          <Pagination
            currentPage={paginaAtual}
            totalPages={Math.ceil(dados.length / itemsPorPagina)}
            onPrevious={() =>
              setTabelaPaginaAtual((prev) => Math.max(1, prev - 1))
            }
            onNext={() => setTabelaPaginaAtual((prev) => prev + 1)}
          />
        )}
        {temMuitos && !ehVisualizacaoCompleta && (
          <button
            className={styles.viewMoreBtn}
            onClick={() => setFiltro(titulo)}
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
                          <button
                            className={`${styles.iconBtn} ${styles.editBtn}`}
                            onClick={() => handleEditCampo(campo)}
                            disabled={isReadOnlyMode}
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            className={`${styles.iconBtn} ${styles.deleteBtn}`}
                            onClick={() => handleDeleteCampo(campo.id)}
                            disabled={isReadOnlyMode}
                            title="Deletar"
                          >
                            🗑️
                          </button>
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

  const isEntityFieldsView = filtro !== 'todas' && !categorias.includes(filtro);

  return (
    <section className={styles.container}>
      <div className={styles.content}>
        {(() => {
          return (
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <h1 className={styles.title}>
                  {filtro !== 'todas' && !categorias.includes(filtro)
                    ? 'Campo de Entidade'
                    : 'Entidades'}
                </h1>

                {!(filtro !== 'todas' && !categorias.includes(filtro)) && (
                  <select
                    className={styles.filter}
                    value={filtro}
                    onChange={(e) => handleFiltroChange(e.target.value)}
                  >
                    <option value="todas">Todas as Entidades</option>
                    {categorias.map((categoria) => (
                      <option key={categoria} value={categoria}>
                        {categoria}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className={styles.headerActions}>
                {filtro === 'todas' && !isReadOnlyMode && (
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
          {isReadOnlyMode && (
            <p className={styles.configInfo}>
              Modo somente visualização ativo para o seu nível de acesso.
            </p>
          )}
          {filtro === 'todas'
            ? categoriasAtual.map((categoria) => (
                <React.Fragment key={categoria}>
                  {renderTable(categoria, [])}
                </React.Fragment>
              ))
            : categorias.includes(filtro)
              ? renderTable(filtro, [])
              : renderCamposView()}
        </div>

        {filtro === 'todas' && totalPaginasEntidades > 1 && (
          <Pagination
            currentPage={paginaEntidades}
            totalPages={totalPaginasEntidades}
            onPrevious={prevPageEntidades}
            onNext={nextPageEntidades}
          />
        )}
      </div>

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
