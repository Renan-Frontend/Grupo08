import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './DashboardStart.module.css';
import { UserContext } from '../../Context/UserContext';
import {
  isReadOnlyAccessLevelOne,
  isEditOnlyAccessLevelTwo,
  canCreateByAccessLevel,
  canDeleteByAccessLevel,
} from '../../Utils/accessControl';
import {
  fetchOpportunitiesPage,
  getAuthToken,
} from '../GerarBPMN/../Opportunities/opportunityApi';
import { getOpportunityName } from '../GerarBPMN/opportunityHelpers';
import { slugifyBpmnName } from '../GerarBPMN/gerarBpmnCreate.shared';

const STORAGE_KEY = 'bp_dashboards_v1';

const ALL_WIDGETS = [
  {
    id: 'metrics',
    label: 'Métricas KPI',
    description: 'Cards de faturamento, clientes e vendas',
    icon: '📊',
  },
  {
    id: 'revenue',
    label: 'Faturamento Mensal',
    description: 'Gráfico de área com evolução ao longo do ano',
    icon: '📈',
  },
  {
    id: 'sales',
    label: 'Vendas e Clientes',
    description: 'Gráfico de barras comparativo mensal',
    icon: '📉',
  },
  {
    id: 'conversions',
    label: 'Taxa de Conversão',
    description: 'Evolução mensal da taxa de conversão (%)',
    icon: '🎯',
  },
  {
    id: 'expenses',
    label: 'Despesas Mensais',
    description: 'Despesas fixas e variáveis por mês',
    icon: '💸',
  },
  {
    id: 'tasks',
    label: 'Tarefas',
    description: 'Distribuição de tarefas por status',
    icon: '✅',
  },
  {
    id: 'pipeline',
    label: 'Pipeline de Vendas',
    description: 'Funil de oportunidades por etapa',
    icon: '🔽',
  },
];

const DEFAULT_WIDGETS = ALL_WIDGETS.map((w) => w.id);

const slugify = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dashboard';

const loadDashboards = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveDashboards = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // no-op
  }
};

const formatDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
};

const MODAL_STEP_NAME = 'name';
const MODAL_STEP_CONFIG = 'config';
const MODAL_STEP_BPMN = 'bpmn';
const MODAL_STEP_DATA = 'data';

const MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const DEFAULT_CHART_DATA = {
  revenue: MONTHS.map((mes, i) => ({
    mes,
    valor: [
      42000, 58000, 51000, 67000, 72000, 68000, 85000, 91000, 78000, 95000,
      102000, 118000,
    ][i],
  })),
  sales: MONTHS.map((mes, i) => ({
    mes,
    vendas: [210, 285, 251, 320, 342, 308, 395, 420, 378, 445, 488, 505][i],
    clientes: [180, 220, 198, 265, 290, 260, 330, 355, 312, 380, 410, 430][i],
  })),
  metrics: [
    {
      icon: '💰',
      label: 'FATURAMENTO TOTAL',
      value: 'R$ 847.250',
      change: '↑ 12,5%',
      up: true,
    },
    {
      icon: '👥',
      label: 'TOTAL DE CLIENTES',
      value: '1.284',
      change: '↑ 8,2%',
      up: true,
    },
    {
      icon: '🛒',
      label: 'TOTAL DE VENDAS',
      value: '3.647',
      change: '↑ 15,3%',
      up: true,
    },
  ],
  conversions: MONTHS.map((mes, i) => ({
    mes,
    taxa: [3.2, 4.1, 3.8, 4.5, 5.1, 4.8, 5.6, 6.0, 5.4, 6.2, 6.8, 7.1][i],
  })),
  expenses: MONTHS.map((mes, i) => ({
    mes,
    fixas: [
      18000, 18000, 18500, 18500, 19000, 19000, 19500, 19500, 20000, 20000,
      20500, 21000,
    ][i],
    variaveis: [
      12000, 15000, 11000, 14000, 16000, 13000, 18000, 17000, 15000, 19000,
      22000, 25000,
    ][i],
  })),
  tasks: [
    { icon: '✅', status: 'Concluídas', valor: 47 },
    { icon: '🔄', status: 'Em andamento', valor: 23 },
    { icon: '⏳', status: 'Pendentes', valor: 15 },
    { icon: '⚠️', status: 'Atrasadas', valor: 8 },
  ],
  pipeline: [
    { etapa: 'Prospecção', leads: 120, valor: 240000 },
    { etapa: 'Qualificação', leads: 85, valor: 197000 },
    { etapa: 'Proposta', leads: 52, valor: 125000 },
    { etapa: 'Negociação', leads: 28, valor: 89000 },
    { etapa: 'Fechamento', leads: 15, valor: 52000 },
  ],
};

const WIDGET_COLUMNS = {
  revenue: [
    { key: 'mes', label: 'Mês', type: 'text' },
    { key: 'valor', label: 'Valor (R$)', type: 'number' },
  ],
  sales: [
    { key: 'mes', label: 'Mês', type: 'text' },
    { key: 'vendas', label: 'Vendas', type: 'number' },
    { key: 'clientes', label: 'Clientes', type: 'number' },
  ],
  metrics: [
    { key: 'icon', label: 'Ícone', type: 'text' },
    { key: 'label', label: 'Indicador', type: 'text' },
    { key: 'value', label: 'Valor', type: 'text' },
    { key: 'change', label: 'Variação', type: 'text' },
    { key: 'up', label: 'Tendência', type: 'boolean' },
  ],
  conversions: [
    { key: 'mes', label: 'Mês', type: 'text' },
    { key: 'taxa', label: 'Taxa (%)', type: 'number' },
  ],
  expenses: [
    { key: 'mes', label: 'Mês', type: 'text' },
    { key: 'fixas', label: 'Fixas (R$)', type: 'number' },
    { key: 'variaveis', label: 'Variáveis (R$)', type: 'number' },
  ],
  tasks: [
    { key: 'icon', label: 'Ícone', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'valor', label: 'Qtd', type: 'number' },
  ],
  pipeline: [
    { key: 'etapa', label: 'Etapa', type: 'text' },
    { key: 'leads', label: 'Leads', type: 'number' },
    { key: 'valor', label: 'Valor (R$)', type: 'number' },
  ],
};

const WIDGET_LABELS = {
  revenue: 'Faturamento Mensal',
  sales: 'Vendas e Clientes',
  metrics: 'Métricas KPI',
  conversions: 'Taxa de Conversão',
  expenses: 'Despesas Mensais',
  tasks: 'Tarefas',
  pipeline: 'Pipeline de Vendas',
};

const cloneChartData = (src = DEFAULT_CHART_DATA) => ({
  revenue: (src.revenue || DEFAULT_CHART_DATA.revenue).map((r) => ({ ...r })),
  sales: (src.sales || DEFAULT_CHART_DATA.sales).map((r) => ({ ...r })),
  metrics: (src.metrics || DEFAULT_CHART_DATA.metrics).map((r) => ({ ...r })),
  conversions: (src.conversions || DEFAULT_CHART_DATA.conversions).map((r) => ({
    ...r,
  })),
  expenses: (src.expenses || DEFAULT_CHART_DATA.expenses).map((r) => ({
    ...r,
  })),
  tasks: (src.tasks || DEFAULT_CHART_DATA.tasks).map((r) => ({ ...r })),
  pipeline: (src.pipeline || DEFAULT_CHART_DATA.pipeline).map((r) => ({
    ...r,
  })),
});

const DashboardStart = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = React.useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const isEditOnlyMode = isEditOnlyAccessLevelTwo(user);
  const canCreate = canCreateByAccessLevel(user);
  const canDelete = canDeleteByAccessLevel(user);
  const [dashboards, setDashboards] = React.useState(() => loadDashboards());

  // Create / edit modal state
  const [modalStep, setModalStep] = React.useState(null); // null | 'name' | 'config'
  const [editingId, setEditingId] = React.useState(null); // null = new, string = editing existing
  const [newName, setNewName] = React.useState('');
  const [selectedWidgets, setSelectedWidgets] = React.useState(DEFAULT_WIDGETS);

  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const inputRef = React.useRef(null);

  // Create wizard — step 3 BPMN picker
  const [selectedBpmn, setSelectedBpmn] = React.useState(null);
  const [createBpmnList, setCreateBpmnList] = React.useState([]);
  const [createBpmnLoading, setCreateBpmnLoading] = React.useState(false);
  const [createBpmnSearch, setCreateBpmnSearch] = React.useState('');

  // Create wizard — step 4 data editing
  const [initChartData, setInitChartData] = React.useState(() =>
    cloneChartData(),
  );
  const [activeDataWidget, setActiveDataWidget] = React.useState('metrics');
  const [dataEditRows, setDataEditRows] = React.useState([]);

  // BPMN link picker state
  const [bpmnLinkTarget, setBpmnLinkTarget] = React.useState(null); // dashboard item being linked
  const [bpmnList, setBpmnList] = React.useState([]);
  const [bpmnLoading, setBpmnLoading] = React.useState(false);
  const [bpmnSearch, setBpmnSearch] = React.useState('');

  const openBpmnLink = async (item) => {
    setBpmnLinkTarget(item);
    setBpmnSearch('');
    setBpmnList([]);
    setBpmnLoading(true);
    try {
      const res = await fetchOpportunitiesPage({
        page: 1,
        limit: 100,
        token: getAuthToken(),
      });
      const data = Array.isArray(res?.data) ? res.data : [];
      setBpmnList(data);
    } catch {
      setBpmnList([]);
    } finally {
      setBpmnLoading(false);
    }
  };

  const closeBpmnLink = () => {
    setBpmnLinkTarget(null);
    setBpmnList([]);
    setBpmnSearch('');
  };

  const handleLinkBpmn = (bpmnItem) => {
    if (!bpmnLinkTarget) return;
    const linked = {
      id: bpmnItem.id,
      name: getOpportunityName(bpmnItem),
      slug: slugifyBpmnName(getOpportunityName(bpmnItem)),
    };
    const next = dashboards.map((d) =>
      d.id === bpmnLinkTarget.id ? { ...d, linkedBpmn: linked } : d,
    );
    setDashboards(next);
    saveDashboards(next);
    closeBpmnLink();
  };

  const handleUnlinkBpmn = (item) => {
    const next = dashboards.map((d) =>
      d.id === item.id ? { ...d, linkedBpmn: null } : d,
    );
    setDashboards(next);
    saveDashboards(next);
    closeBpmnLink();
  };

  const handleBpmnSelectChange = (item, selectedId) => {
    if (!selectedId) {
      handleUnlinkBpmn(item);
      return;
    }
    const bpmnItem = bpmnList.find((b) => String(b.id) === String(selectedId));
    if (!bpmnItem) return;
    const linked = {
      id: bpmnItem.id,
      name: getOpportunityName(bpmnItem),
      slug: slugifyBpmnName(getOpportunityName(bpmnItem)),
    };
    const next = dashboards.map((d) =>
      d.id === item.id ? { ...d, linkedBpmn: linked } : d,
    );
    setDashboards(next);
    saveDashboards(next);
  };

  const filteredBpmns = bpmnList.filter((b) => {
    const name = getOpportunityName(b).toLowerCase();
    return name.includes(bpmnSearch.toLowerCase());
  });

  React.useEffect(() => {
    if (modalStep === MODAL_STEP_NAME && inputRef.current) {
      inputRef.current.focus();
    }
  }, [modalStep]);

  // Load BPMN list for inline table select
  React.useEffect(() => {
    fetchOpportunitiesPage({ page: 1, limit: 200, token: getAuthToken() })
      .then((res) => setBpmnList(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setBpmnList([]));
  }, []);

  // Auto-open creation wizard when on /dashboard/criar
  React.useEffect(() => {
    if (location.pathname.endsWith('/criar')) {
      openCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setNewName('');
    setSelectedWidgets(DEFAULT_WIDGETS);
    setSelectedBpmn(null);
    setCreateBpmnList([]);
    setCreateBpmnSearch('');
    setInitChartData(cloneChartData());
    setActiveDataWidget('metrics');
    setModalStep(MODAL_STEP_NAME);
    if (!location.pathname.endsWith('/criar')) {
      navigate('/dashboard/criar', { replace: true });
    }
  };

  const openConfigure = (item) => {
    setEditingId(item.id);
    setNewName(item.name);
    setSelectedWidgets(item.widgets || DEFAULT_WIDGETS);
    setModalStep(MODAL_STEP_CONFIG);
  };

  const closeModal = () => {
    setModalStep(null);
    setEditingId(null);
    setNewName('');
    setSelectedWidgets(DEFAULT_WIDGETS);
    setSelectedBpmn(null);
    setCreateBpmnList([]);
    setCreateBpmnSearch('');
    setInitChartData(cloneChartData());
    setActiveDataWidget('metrics');
    setDataEditRows([]);
    if (location.pathname.endsWith('/criar'))
      navigate('/dashboard', { replace: true });
  };

  const goToConfig = () => {
    if (!newName.trim()) return;
    setModalStep(MODAL_STEP_CONFIG);
  };

  const goToBpmn = async () => {
    if (!newName.trim()) return;
    setModalStep(MODAL_STEP_BPMN);
    if (createBpmnList.length > 0) return;
    setCreateBpmnLoading(true);
    try {
      const res = await fetchOpportunitiesPage({
        page: 1,
        limit: 100,
        token: getAuthToken(),
      });
      setCreateBpmnList(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setCreateBpmnList([]);
    } finally {
      setCreateBpmnLoading(false);
    }
  };

  const goToData = () => {
    // pick first active widget as default tab
    const first = selectedWidgets[0] || 'metrics';
    setActiveDataWidget(first);
    setDataEditRows(initChartData[first].map((r, i) => ({ ...r, _id: i })));
    setModalStep(MODAL_STEP_DATA);
  };

  const switchDataWidget = (wid) => {
    // save current rows before switching tab
    saveDataRows();
    const rows = initChartData[wid].map((r, i) => ({ ...r, _id: i }));
    setActiveDataWidget(wid);
    setDataEditRows(rows);
  };

  const saveDataRows = () => {
    const cols = WIDGET_COLUMNS[activeDataWidget] || [];
    const cleaned = dataEditRows.map(({ _id, ...rest }) => {
      const obj = {};
      Object.keys(rest).forEach((k) => {
        if (!cols.find((c) => c.key === k)) obj[k] = rest[k]; // preserve extra fields like icon
      });
      cols.forEach((c) => {
        if (c.type === 'number' || c.type === 'currency')
          obj[c.key] = Number(rest[c.key]) || 0;
        else if (c.type === 'boolean')
          obj[c.key] = rest[c.key] === true || rest[c.key] === 'true';
        else obj[c.key] = rest[c.key] ?? '';
      });
      return obj;
    });
    setInitChartData((prev) => ({ ...prev, [activeDataWidget]: cleaned }));
  };

  const updateDataCell = (idx, key, value) =>
    setDataEditRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    );

  const addDataRow = () => {
    const cols = WIDGET_COLUMNS[activeDataWidget] || [];
    const empty = { _id: Date.now() };
    cols.forEach((c) => {
      if (c.type === 'number' || c.type === 'currency') empty[c.key] = 0;
      else if (c.type === 'boolean') empty[c.key] = true;
      else empty[c.key] = '';
    });
    setDataEditRows((prev) => [...prev, empty]);
  };

  const removeDataRow = (idx) =>
    setDataEditRows((prev) => prev.filter((_, i) => i !== idx));

  const filteredCreateBpmns = createBpmnList.filter((b) =>
    getOpportunityName(b)
      .toLowerCase()
      .includes(createBpmnSearch.toLowerCase()),
  );

  const toggleWidget = (id) => {
    setSelectedWidgets((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    if (editingId) {
      // Update existing (2-step edit)
      const next = dashboards.map((d) =>
        d.id === editingId
          ? { ...d, name: newName.trim(), widgets: selectedWidgets }
          : d,
      );
      setDashboards(next);
      saveDashboards(next);
      closeModal();
    } else {
      // Finalise pending data rows before saving
      const cols = WIDGET_COLUMNS[activeDataWidget] || [];
      const cleaned = dataEditRows.map(({ _id, ...rest }) => {
        const obj = {};
        Object.keys(rest).forEach((k) => {
          if (!cols.find((c) => c.key === k)) obj[k] = rest[k];
        });
        cols.forEach((c) => {
          if (c.type === 'number' || c.type === 'currency')
            obj[c.key] = Number(rest[c.key]) || 0;
          else if (c.type === 'boolean')
            obj[c.key] = rest[c.key] === true || rest[c.key] === 'true';
          else obj[c.key] = rest[c.key] ?? '';
        });
        return obj;
      });
      const finalChartData = { ...initChartData, [activeDataWidget]: cleaned };

      // Create new (4-step)
      const trimmed = newName.trim();
      const slug = slugify(trimmed);
      const entry = {
        id: `${slug}-${Date.now()}`,
        slug,
        name: trimmed,
        widgets: selectedWidgets,
        linkedBpmn: selectedBpmn || null,
        chartData: finalChartData,
        createdBy: user?.nome || user?.email || '',
        createdAt: new Date().toISOString(),
      };
      const next = [...dashboards, entry];
      setDashboards(next);
      saveDashboards(next);
      // Single absolute navigate — avoids double-navigate conflict with closeModal
      setModalStep(null);
      navigate('/dashboard/' + slug, { replace: true });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const next = dashboards.filter((d) => d.id !== deleteTarget.id);
    setDashboards(next);
    saveDashboards(next);
    setDeleteTarget(null);
  };

  const handleNameKeyDown = (event) => {
    if (event.key === 'Enter') goToBpmn();
    if (event.key === 'Escape') closeModal();
  };

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboards</h1>
          <p className={styles.description}>
            Gerencie e visualize seus dashboards analíticos.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={openCreate}
          >
            Criar Dashboard
          </button>
        )}
      </div>

      <div className={styles.card}>
        <section className={styles.tableSection}>
          {dashboards.length === 0 ? (
            <p className={styles.empty}>
              Nenhum dashboard criado ainda. Clique em{' '}
              <strong>&ldquo;Criar Dashboard&rdquo;</strong> para começar.
            </p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>BPMN Vinculado</th>
                    <th>Gráficos</th>
                    <th>Usuário</th>
                    <th>Data de Criação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboards.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          className={styles.nameLink}
                          onClick={() => navigate(item.slug)}
                        >
                          {item.name}
                        </button>
                      </td>
                      <td>
                        <select
                          className={styles.bpmnSelect}
                          value={
                            item.linkedBpmn ? String(item.linkedBpmn.id) : ''
                          }
                          disabled={isReadOnlyMode}
                          onChange={(e) =>
                            handleBpmnSelectChange(item, e.target.value)
                          }
                        >
                          <option value="">Sem vínculo</option>
                          {bpmnList.map((b) => (
                            <option key={b.id} value={String(b.id)}>
                              {getOpportunityName(b)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className={styles.widgetBadges}>
                          {(item.widgets || DEFAULT_WIDGETS).map((wid) => {
                            const w = ALL_WIDGETS.find((x) => x.id === wid);
                            return w ? (
                              <span key={wid} className={styles.badge}>
                                {w.icon} {w.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className={styles.creatorCell}>
                        {item.createdBy || '—'}
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td className={styles.tableActions}>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.viewButton}`}
                          onClick={() => navigate(item.slug)}
                          title="Visualizar dashboard"
                          aria-label="Visualizar dashboard"
                        >
                          👁️
                        </button>
                        {!isReadOnlyMode && (
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.bpmnLinkBtn}`}
                            onClick={() => openBpmnLink(item)}
                            title="Vincular BPMN"
                            aria-label="Vincular BPMN"
                          >
                            🔗
                          </button>
                        )}
                        {!isReadOnlyMode && (
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.configButton}`}
                            onClick={() => openConfigure(item)}
                            title="Configurar dashboard"
                            aria-label="Configurar dashboard"
                          >
                            ⚙️
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.deleteButton}`}
                            onClick={() => setDeleteTarget(item)}
                            title="Deletar dashboard"
                            aria-label="Deletar dashboard"
                          >
                            🗑️
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Modal: step 1 — nome */}
      {modalStep === MODAL_STEP_NAME && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Criar dashboard"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalStepIndicator}>
              <span className={`${styles.modalStep} ${styles.modalStepActive}`}>
                1
              </span>
              <span className={styles.modalStepLine} />
              <span className={styles.modalStep}>2</span>
              <span className={styles.modalStepLine} />
              <span className={styles.modalStep}>3</span>
              <span className={styles.modalStepLine} />
              <span className={styles.modalStep}>4</span>
            </div>
            <h2 className={styles.modalTitle}>Novo Dashboard</h2>
            <p className={styles.modalStepLabel}>Passo 1 de 4 — Nome</p>
            <label className={styles.modalLabel} htmlFor="dashboard-name">
              Nome do dashboard
            </label>
            <input
              id="dashboard-name"
              ref={inputRef}
              className={styles.modalInput}
              type="text"
              placeholder="Ex: Vendas Q1 2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              maxLength={80}
            />
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={goToBpmn}
                disabled={!newName.trim()}
              >
                Próximo →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: passo 3 — escolher widgets */}
      {modalStep === MODAL_STEP_CONFIG && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Configurar dashboard"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {!editingId && (
              <div className={styles.modalStepIndicator}>
                <span className={styles.modalStep}>1</span>
                <span className={styles.modalStepLine} />
                <span className={styles.modalStep}>2</span>
                <span className={styles.modalStepLine} />
                <span
                  className={`${styles.modalStep} ${styles.modalStepActive}`}
                >
                  3
                </span>
                <span className={styles.modalStepLine} />
                <span className={styles.modalStep}>4</span>
              </div>
            )}
            <h2 className={styles.modalTitle}>
              {editingId ? `Configurar — ${newName}` : 'Tipos de Gráficos'}
            </h2>
            <p className={styles.modalStepLabel}>
              {editingId
                ? 'Escolha os gráficos a exibir'
                : 'Passo 3 de 4 — Selecione os gráficos'}
            </p>
            <div className={styles.widgetGrid}>
              {ALL_WIDGETS.map((widget) => {
                const active = selectedWidgets.includes(widget.id);
                return (
                  <button
                    key={widget.id}
                    type="button"
                    className={`${styles.widgetCard} ${active ? styles.widgetCardActive : ''}`}
                    onClick={() => toggleWidget(widget.id)}
                    aria-pressed={active}
                  >
                    <span className={styles.widgetCardIcon}>{widget.icon}</span>
                    <span className={styles.widgetCardLabel}>
                      {widget.label}
                    </span>
                    <span className={styles.widgetCardDesc}>
                      {widget.description}
                    </span>
                    <span className={styles.widgetCardCheck}>
                      {active ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={styles.modalActions}>
              {!editingId ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setModalStep(MODAL_STEP_BPMN)}
                >
                  ← Voltar
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={closeModal}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                className={styles.primaryButton}
                onClick={editingId ? handleSave : goToData}
                disabled={selectedWidgets.length === 0}
              >
                {editingId ? 'Salvar' : 'Próximo →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: passo 3 — vincular BPMN */}
      {modalStep === MODAL_STEP_BPMN && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Vincular BPMN"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalStepIndicator}>
              <span className={styles.modalStep}>1</span>
              <span className={styles.modalStepLine} />
              <span className={`${styles.modalStep} ${styles.modalStepActive}`}>
                2
              </span>
              <span className={styles.modalStepLine} />
              <span className={styles.modalStep}>3</span>
              <span className={styles.modalStepLine} />
              <span className={styles.modalStep}>4</span>
            </div>
            <h2 className={styles.modalTitle}>Vincular BPMN</h2>
            <p className={styles.modalStepLabel}>Passo 2 de 4 — Opcional</p>
            <input
              type="text"
              className={styles.modalInput}
              placeholder="Buscar BPMN..."
              value={createBpmnSearch}
              onChange={(e) => setCreateBpmnSearch(e.target.value)}
              autoFocus
            />
            {createBpmnLoading ? (
              <p className={styles.bpmnPickerEmpty}>Carregando BPMNs...</p>
            ) : filteredCreateBpmns.length === 0 ? (
              <p className={styles.bpmnPickerEmpty}>
                {createBpmnSearch
                  ? 'Nenhum BPMN encontrado.'
                  : 'Nenhum BPMN disponível.'}
              </p>
            ) : (
              <ul className={styles.bpmnPickerList}>
                {filteredCreateBpmns.map((b) => {
                  const bName = getOpportunityName(b);
                  const isActive = selectedBpmn?.id === b.id;
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        className={`${styles.bpmnPickerItem} ${
                          isActive ? styles.bpmnPickerItemActive : ''
                        }`}
                        onClick={() =>
                          setSelectedBpmn(
                            isActive
                              ? null
                              : {
                                  id: b.id,
                                  name: bName,
                                  slug: slugifyBpmnName(bName),
                                },
                          )
                        }
                      >
                        <span className={styles.bpmnPickerIcon}>🔀</span>
                        <span className={styles.bpmnPickerName}>{bName}</span>
                        {isActive && (
                          <span className={styles.bpmnPickerCheck}>✓</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalStep(MODAL_STEP_NAME)}
              >
                ← Voltar
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalStep(MODAL_STEP_CONFIG)}
              >
                Pular
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setModalStep(MODAL_STEP_CONFIG)}
              >
                Próximo →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: passo 4 — configurar gráficos */}
      {modalStep === MODAL_STEP_DATA && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Editar métricas"
        >
          <div
            className={`${styles.modal} ${styles.modalWide}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalStepIndicator}>
              <span className={styles.modalStep}>1</span>
              <span className={styles.modalStepLine} />
              <span className={styles.modalStep}>2</span>
              <span className={styles.modalStepLine} />
              <span className={styles.modalStep}>3</span>
              <span className={styles.modalStepLine} />
              <span className={`${styles.modalStep} ${styles.modalStepActive}`}>
                4
              </span>
            </div>
            <h2 className={styles.modalTitle}>Configurar Gráficos</h2>
            <p className={styles.modalStepLabel}>
              Passo 4 de 4 — Configure os dados iniciais
            </p>

            {/* Widget tab selector */}
            <div className={styles.dataTabRow}>
              {selectedWidgets.map((wid) => (
                <button
                  key={wid}
                  type="button"
                  className={`${styles.dataTab} ${
                    activeDataWidget === wid ? styles.dataTabActive : ''
                  }`}
                  onClick={() => switchDataWidget(wid)}
                >
                  {ALL_WIDGETS.find((w) => w.id === wid)?.icon}{' '}
                  {WIDGET_LABELS[wid]}
                </button>
              ))}
            </div>

            {/* Inline table editor */}
            <div className={styles.dataTableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    {(WIDGET_COLUMNS[activeDataWidget] || []).map((c) => (
                      <th key={c.key} className={styles.dataTh}>
                        {c.label}
                      </th>
                    ))}
                    <th className={styles.dataTh} />
                  </tr>
                </thead>
                <tbody>
                  {dataEditRows.map((row, idx) => (
                    <tr key={row._id}>
                      {(WIDGET_COLUMNS[activeDataWidget] || []).map((c) => (
                        <td key={c.key} className={styles.dataTd}>
                          {c.type === 'boolean' ? (
                            <select
                              value={String(row[c.key])}
                              onChange={(e) =>
                                updateDataCell(
                                  idx,
                                  c.key,
                                  e.target.value === 'true',
                                )
                              }
                              className={styles.dataInput}
                            >
                              <option value="true">↑ Sobe</option>
                              <option value="false">↓ Desce</option>
                            </select>
                          ) : (
                            <input
                              type={
                                c.type === 'number' || c.type === 'currency'
                                  ? 'number'
                                  : 'text'
                              }
                              value={row[c.key] ?? ''}
                              onChange={(e) =>
                                updateDataCell(idx, c.key, e.target.value)
                              }
                              className={styles.dataInput}
                            />
                          )}
                        </td>
                      ))}
                      <td className={styles.dataTdAction}>
                        <button
                          type="button"
                          className={styles.dataRemoveBtn}
                          onClick={() => removeDataRow(idx)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className={styles.dataAddBtn}
              onClick={addDataRow}
            >
              + Linha
            </button>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalStep(MODAL_STEP_CONFIG)}
              >
                ← Voltar
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleSave}
              >
                Pular
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSave}
              >
                Criar Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: vincular BPMN */}
      {bpmnLinkTarget && (
        <div
          className={styles.overlay}
          onClick={closeBpmnLink}
          role="dialog"
          aria-modal="true"
          aria-label="Vincular BPMN"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              Vincular BPMN — {bpmnLinkTarget.name}
            </h2>
            {bpmnLinkTarget.linkedBpmn && (
              <p className={styles.modalText}>
                Vinculado atualmente:{' '}
                <strong>{bpmnLinkTarget.linkedBpmn.name}</strong>
              </p>
            )}
            <input
              type="text"
              className={styles.modalInput}
              placeholder="Buscar BPMN..."
              value={bpmnSearch}
              onChange={(e) => setBpmnSearch(e.target.value)}
              autoFocus
            />
            {bpmnLoading ? (
              <p className={styles.bpmnPickerEmpty}>Carregando BPMNs...</p>
            ) : filteredBpmns.length === 0 ? (
              <p className={styles.bpmnPickerEmpty}>
                {bpmnSearch
                  ? 'Nenhum BPMN encontrado.'
                  : 'Nenhum BPMN disponível.'}
              </p>
            ) : (
              <ul className={styles.bpmnPickerList}>
                {filteredBpmns.map((b) => {
                  const bName = getOpportunityName(b);
                  const isActive = bpmnLinkTarget.linkedBpmn?.id === b.id;
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        className={`${styles.bpmnPickerItem} ${
                          isActive ? styles.bpmnPickerItemActive : ''
                        }`}
                        onClick={() => handleLinkBpmn(b)}
                      >
                        <span className={styles.bpmnPickerIcon}>🔀</span>
                        <span className={styles.bpmnPickerName}>{bName}</span>
                        {isActive && (
                          <span className={styles.bpmnPickerCheck}>✓</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className={styles.modalActions}>
              {bpmnLinkTarget.linkedBpmn && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => handleUnlinkBpmn(bpmnLinkTarget)}
                >
                  Desvincular
                </button>
              )}
              <button
                type="button"
                className={styles.secondaryButton}
                style={bpmnLinkTarget.linkedBpmn ? {} : { marginLeft: 'auto' }}
                onClick={closeBpmnLink}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar exclusão */}
      {deleteTarget && (
        <div
          className={styles.overlay}
          onClick={() => setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar exclusão"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Deletar Dashboard</h2>
            <p className={styles.modalText}>
              Deseja deletar o dashboard{' '}
              <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>? Esta ação não
              pode ser desfeita.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.primaryButton} ${styles.dangerButton}`}
                onClick={handleDelete}
              >
                Deletar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DashboardStart;
