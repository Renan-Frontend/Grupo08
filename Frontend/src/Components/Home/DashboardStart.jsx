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
import { parseSpreadsheetRaw, parseAllSheets, detectWidgetsForSheets } from './Dashboard/parseSpreadsheet';
import { exportDashboardXlsx } from '../../Utils/exportXlsx';
import { API_URL } from '../../Api';

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
  {
    id: 'kpiTable',
    label: 'Tabela de Indicadores',
    description: 'Indicadores com meta, tendência e média por mês',
    icon: '📋',
  },
];

const DEFAULT_WIDGETS = ALL_WIDGETS.filter((w) => w.id !== 'kpiTable').map((w) => w.id);

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
const MODAL_STEP_IMPORT = 'import';

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
  kpiTable: [],
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
  kpiTable: [],
};

const WIDGET_LABELS = {
  revenue: 'Faturamento Mensal',
  sales: 'Vendas e Clientes',
  metrics: 'Métricas KPI',
  conversions: 'Taxa de Conversão',
  expenses: 'Despesas Mensais',
  tasks: 'Tarefas',
  pipeline: 'Pipeline de Vendas',
  kpiTable: 'Gráficos de Indicadores',
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
  kpiTable: (src.kpiTable || []).map((r) => ({ ...r, months: { ...(r.months || {}) } })),
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

  // KPI Table creation state
  const [kpiTableSections, setKpiTableSections] = React.useState([]); // [{name, rows: [{name, meta, tendencia, months:{}, media}]}]
  const [kpiNewSectionName, setKpiNewSectionName] = React.useState('');

  // Spreadsheet import state
  const [importStep, setImportStep] = React.useState('upload'); // 'upload' | 'preview'
  const [importLoading, setImportLoading] = React.useState(false);
  const [importError, setImportError] = React.useState(null);
  const [importMapping, setImportMapping] = React.useState(null);
  const [importParsed, setImportParsed] = React.useState(null);
  const [importName, setImportName] = React.useState('');
  const importFileRef = React.useRef(null);

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
    setKpiTableSections([]);
    setKpiNewSectionName('');
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
    setKpiTableSections([]);
    setKpiNewSectionName('');
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
    // pick first active non-kpi widget as default tab, or kpiTable if it's the only one
    const first = selectedWidgets.find((w) => w !== 'kpiTable') || selectedWidgets[0] || 'metrics';
    setActiveDataWidget(first);
    if (first === 'kpiTable') {
      setDataEditRows([]);
    } else {
      setDataEditRows(initChartData[first].map((r, i) => ({ ...r, _id: i })));
    }
    setModalStep(MODAL_STEP_DATA);
  };

  const switchDataWidget = (wid) => {
    // save current rows before switching tab
    if (activeDataWidget !== 'kpiTable') saveDataRows();
    if (wid === 'kpiTable') {
      setDataEditRows([]);
    } else {
      const rows = initChartData[wid].map((r, i) => ({ ...r, _id: i }));
      setDataEditRows(rows);
    }
    setActiveDataWidget(wid);
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

  const openImport = () => {
    setImportStep('upload');
    setImportLoading(false);
    setImportError(null);
    setImportMapping(null);
    setImportParsed(null);
    setImportName('');
    setModalStep(MODAL_STEP_IMPORT);
  };

  const closeImport = () => {
    setModalStep(null);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const updateSheetWidget = (sheetName, newWidget) => {
    // Auto-map spreadsheet headers to widget columns by name similarity
    const buildAutoMapping = (headers, widgetId) => {
      if (!widgetId || !headers?.length) return {};
      const cols = WIDGET_COLUMNS[widgetId] || [];
      const mapping = {};
      cols.forEach((col) => {
        const colNorm = col.key.toLowerCase();
        const labelNorm = col.label.toLowerCase();
        const match = headers.find((h) => {
          const hNorm = String(h).toLowerCase();
          return hNorm === colNorm || hNorm === labelNorm ||
            hNorm.includes(colNorm) || colNorm.includes(hNorm) ||
            hNorm.includes(labelNorm) || labelNorm.includes(hNorm);
        });
        if (match) mapping[match] = col.key;
      });
      return mapping;
    };

    setImportMapping((prev) => ({
      ...prev,
      sheets: (prev?.sheets || []).map((s) => {
        if (s.sheetName !== sheetName) return s;
        const sheetData = (importParsed || []).find((p) => p.sheetName === sheetName);
        const columnMapping = newWidget
          ? buildAutoMapping(sheetData?.headers || [], newWidget)
          : {};
        return { ...s, widget: newWidget || null, columnMapping };
      }),
    }));
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (importFileRef.current) importFileRef.current.value = '';
    if (!file) return;
    setImportError(null);
    setImportLoading(true);
    try {
      const allSheets = await parseAllSheets(file);

      // Try AI-based table detection for sheets that may contain stacked tables
      let enrichedSheets = allSheets;
      try {
        const token = getAuthToken();
        if (token) {
          const sheetsToSplit = [];
          for (const sheet of allSheets) {
            // Send raw rows (header + data) to AI for each sheet with enough rows
            if (sheet.rows && sheet.rows.length >= 2 && sheet.rawRows) {
              sheetsToSplit.push(sheet);
            }
          }
          if (sheetsToSplit.length > 0) {
            const aiResults = await Promise.all(
              sheetsToSplit.map((sheet) => {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 12000);
                return fetch(`${API_URL}/ai/detect-spreadsheet-tables`, {
                  method: 'POST',
                  signal: ctrl.signal,
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    rows: sheet.rawRows,
                    sheetName: sheet.sheetName,
                  }),
                })
                  .then((r) => { clearTimeout(timer); return r.ok ? r.json() : null; })
                  .catch(() => { clearTimeout(timer); return null; });
              }),
            );

            const newSheets = [];
            const splitSheetNames = new Set();
            for (let i = 0; i < sheetsToSplit.length; i++) {
              const sheet = sheetsToSplit[i];
              const aiResult = aiResults[i];
              const tables = aiResult?.tables;
              if (tables && tables.length > 1) {
                // AI found multiple tables - split them
                splitSheetNames.add(sheet.sheetName);
                for (const tbl of tables) {
                  const headerRow = sheet.rawRows[tbl.headerRow];
                  if (!headerRow) continue;
                  const headers = headerRow
                    .map((c) => (c != null ? String(c).trim() : ''))
                    .filter((h) => h);
                  if (headers.length === 0) continue;
                  const dataRows = sheet.rawRows.slice(tbl.dataStartRow, tbl.dataEndRow + 1);
                  const rows = dataRows.map((raw) => {
                    const obj = {};
                    headerRow.forEach((h, ci) => {
                      if (h != null && String(h).trim()) {
                        obj[String(h).trim()] = raw[ci] ?? '';
                      }
                    });
                    return obj;
                  });
                  newSheets.push({
                    sheetName: tbl.name || `${sheet.sheetName} ${newSheets.length + 1}`,
                    headers,
                    rows,
                    rawRows: [headerRow, ...dataRows],
                  });
                }
              }
            }
            if (newSheets.length > 0) {
              // Keep untouched sheets + add AI-split ones
              enrichedSheets = allSheets.filter(
                (s) => !splitSheetNames.has(s.sheetName),
              );
              enrichedSheets.push(...newSheets);
            }
          }
        }
      } catch (_aiErr) {
        // AI failed — proceed with local detection
      }

      // Auto-detect widget types locally from sheet names + headers
      const mapping = detectWidgetsForSheets(enrichedSheets);

      const fileName = file.name.replace(/\.[^/.]+$/, '');
      setImportParsed(enrichedSheets);
      setImportMapping(mapping);
      setImportName(fileName || mapping.dashboardName || 'Dashboard Importado');
      setImportStep('preview');
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleCreateFromImport = () => {
    if (!importName.trim() || !importParsed) return;
    const mappedSheets = (importMapping?.sheets || []);
    // Build chartData: for each sheet with a detected widget, convert rows
    const chartData = cloneChartData();
    const usedWidgets = [];

    // Normalize helper for fuzzy matching
    const _norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    importParsed.forEach((sheetData) => {
      const sheetMap = mappedSheets.find((s) => s.sheetName === sheetData.sheetName);
      const widget = sheetMap?.widget;
      if (!widget) return;

      // ── Special handling for kpiTable: convert indicator rows ──
      if (widget === 'kpiTable') {
        const headers = sheetData.headers || [];
        const headersNorm = headers.map(_norm);
        // Find key columns
        const nameIdx = headersNorm.findIndex((h) => h.includes('indicador') || h === 'nome' || h === 'kpi');
        const metaIdx = headersNorm.findIndex((h) => h === 'meta');
        const tendIdx = headersNorm.findIndex((h) => h.includes('tendencia') || h.includes('tendência') || h.includes('tend'));
        const mediaIdx = headersNorm.findIndex((h) => h === 'media' || h === 'média');

        // Detect month columns (anything that looks like a date)
        const MONTH_NAMES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const MONTH_MAP = { jan: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, set: 8, sep: 8, out: 9, oct: 9, nov: 10, dez: 11, dec: 11 };
        const monthCols = [];
        headers.forEach((h, idx) => {
          if (idx === nameIdx || idx === metaIdx || idx === tendIdx || idx === mediaIdx) return;
          const s = String(h).trim();
          let label = null;

          // 1) Excel serial date number (e.g. 45108 → 2023-07-01) — also accept decimals
          if (/^\d{4,5}(\.\d+)?$/.test(s)) {
            const serial = Math.floor(Number(s));
            if (serial > 25569 && serial < 60000) {
              const epoch = new Date(1899, 11, 30);
              const d = new Date(epoch.getTime() + serial * 86400000);
              if (!isNaN(d.getTime())) {
                label = `${MONTH_NAMES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
              }
            }
          }
          // 2) ISO date: 2023-05-01 or 2023-05-01T...
          if (!label) {
            const iso = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
            if (iso) {
              const m = parseInt(iso[2], 10) - 1;
              label = `${MONTH_NAMES_PT[m] || iso[2]}/${iso[1].slice(2)}`;
            }
          }
          // 3) Short month labels: jul/25, Mai-23, Aug/2025, May-23, etc.
          if (!label) {
            const short = s.match(/^([a-zA-ZÀ-ú]{3,})[-/\s](\d{2,4})$/i);
            if (short) {
              const mKey = short[1].toLowerCase().slice(0, 3);
              const mIdx = MONTH_MAP[mKey];
              if (mIdx !== undefined) {
                const yr = short[2].length === 4 ? short[2].slice(2) : short[2];
                label = `${MONTH_NAMES_PT[mIdx]}/${yr}`;
              }
            }
          }
          // 4) Patterns like 2023/05, 05-2023
          if (!label) {
            const ym = s.match(/(\d{4})[-/](\d{2})/) || s.match(/(\d{2})[-/](\d{4})/);
            if (ym) {
              const parts = [ym[1], ym[2]].map(Number);
              const year = parts.find((p) => p > 100);
              const mon = parts.find((p) => p >= 1 && p <= 12);
              if (year && mon) {
                label = `${MONTH_NAMES_PT[mon - 1]}/${String(year).slice(2)}`;
              }
            }
          }
          // 5) Formatted dates like "5/1/2023", "01/05/23", "5/1/23" (M/D/Y or D/M/Y)
          if (!label) {
            const mdy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
            if (mdy) {
              const a = Number(mdy[1]), b = Number(mdy[2]);
              let yr = Number(mdy[3]); if (yr < 100) yr += 2000;
              const mon = a <= 12 ? a - 1 : b - 1;
              if (mon >= 0 && mon < 12 && yr >= 2000 && yr <= 2100) {
                label = `${MONTH_NAMES_PT[mon]}/${String(yr).slice(2)}`;
              }
            }
          }
          // 6) Fallback: try JS Date.parse for any other date format
          if (!label) {
            const d = new Date(s);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
              label = `${MONTH_NAMES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
            }
          }

          if (label) monthCols.push({ idx, label });
        });
        console.log('[KPI Import] headers:', headers, 'monthCols:', monthCols.map(c => c.label));

        const sectionName = sheetData.sheetName;
        const kpiRows = sheetData.rows.map((raw, rowIdx) => {
          // fmtRow has the formatted (display) text from xlsx for each cell
          // e.g. a cell with value 0.76 and format "0%" → fmtRow has "76%"
          // a cell with value 3.2 and format "General" → fmtRow has "3.2"
          const fmtRow = sheetData.fmtRows?.[rowIdx];
          const rawKeys = Object.keys(raw);
          const name = nameIdx >= 0 ? String(raw[headers[nameIdx]] ?? '') : String(raw[rawKeys[0]] ?? '');
          const meta = metaIdx >= 0 ? raw[headers[metaIdx]] : '';
          // Read tendência — prefer formatted text from xlsx (e.g. "↑", "Subir")
          const rawTend = tendIdx >= 0 ? raw[headers[tendIdx]] : '';
          const fmtTend = fmtRow && tendIdx >= 0 ? String(fmtRow[headers[tendIdx]] ?? '').trim() : '';
          let tendencia = fmtTend || String(rawTend ?? '').trim();
          // Normalize tendência arrows
          if (/↑|⬆|🔼|up|cima|subir|sobe/i.test(tendencia)) tendencia = '↑';
          else if (/↓|⬇|🔽|down|baixo|cair|desce/i.test(tendencia)) tendencia = '↓';
          else if (/→|➡|⮕|lateral|estável|estavel|mantém|mantem/i.test(tendencia)) tendencia = '→';
          else if (tendencia && !/^[↑↓→]$/.test(tendencia)) tendencia = '→';
          const media = mediaIdx >= 0 ? raw[headers[mediaIdx]] : '';

          const months = {};
          const monthsRaw = {};
          monthCols.forEach(({ idx, label }) => {
            let val = raw[headers[idx]];
            if (val === '' || val === undefined || val === null) return;
            // Parse percentage strings like "16,30%", "16.30%", "-7%"
            if (typeof val === 'string') {
              const pctMatch = val.match(/^(-?[\d.,]+)\s*%$/);
              if (pctMatch) {
                val = Number(pctMatch[1].replace(',', '.')) / 100;
              } else {
                // Try parsing as number with comma decimal
                const numStr = val.replace(/[^\d.,-]/g, '').replace(',', '.');
                const n = Number(numStr);
                if (!isNaN(n) && numStr !== '') val = n;
                else return; // Skip text values like "Comercial", "sem cursos"
              }
            }
            months[label] = val;
            // Use xlsx formatted text (e.g. "76%", "3,2") for lossless export round-trip
            // This preserves the EXACT cell format: percentage cells stay "76%", plain numbers stay "3,2"
            const fmtVal = fmtRow?.[headers[idx]];
            if (fmtVal !== undefined && fmtVal !== null && fmtVal !== '') {
              monthsRaw[label] = String(fmtVal);
            }
          });

          // Auto-calculate tendência when column is empty
          if (!tendencia || !tendencia.trim() || tendencia === 'undefined') {
            const monthVals = Object.values(months).filter(v => v != null && !isNaN(v));
            if (monthVals.length >= 2) {
              // Use only the last few values for trend, normalize to same scale
              const recent = monthVals.slice(-4);
              // Normalize: if values are mixed (some <=1.5, some >1.5), use raw diffs on original scale
              const diffs = [];
              for (let i = 1; i < recent.length; i++) diffs.push(recent[i] - recent[i - 1]);
              const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
              // Use relative threshold based on data magnitude
              const maxAbs = Math.max(...recent.map(v => Math.abs(v)), 1);
              const threshold = maxAbs * 0.001;
              if (avgDiff > threshold) tendencia = '↑';
              else if (avgDiff < -threshold) tendencia = '↓';
              else tendencia = '→';
            }
          }

          // Parse meta: handle "15%", "50%", 0.15, "definir"
          let parsedMeta = meta;
          let metaType = 'value';
          if (typeof meta === 'string') {
            const metaPct = meta.match(/^([\d.,]+)\s*%$/);
            if (metaPct) {
              parsedMeta = Number(metaPct[1].replace(',', '.')) / 100;
              metaType = 'percent';
            } else if (meta !== 'definir' && meta !== '') {
              const n = Number(meta.replace(',', '.'));
              if (!isNaN(n)) parsedMeta = n;
            }
          }
          // If meta is a small decimal (≤1), treat as percent
          if (metaType === 'value' && typeof parsedMeta === 'number' && parsedMeta > 0 && parsedMeta <= 1) {
            metaType = 'percent';
          }

          // Parse media: from Media column or auto-calculate from months
          let parsedMedia = media;
          let mediaAutoCalc = false;
          if (typeof media === 'string') {
            const mediaPct = media.match(/^([\d.,]+)\s*%$/);
            if (mediaPct) parsedMedia = Number(mediaPct[1].replace(',', '.')) / 100;
            else {
              const n = Number(media.replace(',', '.'));
              if (!isNaN(n)) parsedMedia = n;
            }
          }
          // Auto-calculate media if not provided
          if (parsedMedia === '' || parsedMedia === undefined || parsedMedia === null || (typeof parsedMedia === 'string' && isNaN(Number(parsedMedia)))) {
            const monthVals = Object.values(months).filter(v => v != null && !isNaN(v));
            if (monthVals.length > 0) {
              parsedMedia = monthVals.reduce((a, b) => a + b, 0) / monthVals.length;
              mediaAutoCalc = true;
            }
          }
          // Don't round media — keep full precision (14.90% must stay 0.149, not round to 0.15)

          // Use xlsx formatted text for meta raw (e.g. "0%", "76%", "definir")
          const fmtMeta = fmtRow && metaIdx >= 0 ? fmtRow[headers[metaIdx]] : undefined;
          const finalMetaRaw = (fmtMeta !== undefined && fmtMeta !== null && fmtMeta !== '')
            ? String(fmtMeta)
            : (typeof meta === 'string' ? meta : undefined);

          // Use xlsx formatted text for media raw — only when media came from the spreadsheet (not auto-calc)
          const fmtMedia = fmtRow && mediaIdx >= 0 ? fmtRow[headers[mediaIdx]] : undefined;
          const finalMediaRaw = !mediaAutoCalc && fmtMedia !== undefined && fmtMedia !== null && fmtMedia !== ''
            ? String(fmtMedia)
            : undefined;

          return { section: sectionName, name, meta: parsedMeta, tendencia, months, monthsRaw, media: parsedMedia, metaRaw: finalMetaRaw, mediaRaw: finalMediaRaw, metaType };
        });

        // Append to existing kpiTable data (multiple sections)
        chartData.kpiTable = [...(chartData.kpiTable || []), ...kpiRows];
        if (!usedWidgets.includes('kpiTable')) usedWidgets.push('kpiTable');
        return;
      }

      // ── Standard widget mapping ──
      const colMap = sheetMap?.columnMapping || {};
      const cols = WIDGET_COLUMNS[widget] || [];
      const rows = sheetData.rows.map((raw) => {
        const row = {};
        const rawKeys = Object.keys(raw);
        cols.forEach((col) => {
          // 1) Try column mapping first
          const sheetHeader = Object.entries(colMap).find(([, v]) => v === col.key)?.[0];
          let rawVal = sheetHeader !== undefined ? raw[sheetHeader] ?? raw[col.key] : raw[col.key];
          // 2) Fuzzy fallback: search raw keys by normalized key/label
          if (rawVal === undefined || rawVal === '') {
            const colKeyN = _norm(col.key);
            const colLabelN = _norm(col.label);
            const fuzzyKey = rawKeys.find((k) => {
              const kn = _norm(k);
              return kn === colKeyN || kn === colLabelN
                || kn.includes(colKeyN) || colKeyN.includes(kn)
                || kn.includes(colLabelN) || colLabelN.includes(kn);
            });
            if (fuzzyKey !== undefined) rawVal = raw[fuzzyKey];
          }
          // 3) Positional fallback for first text col + number cols
          if (rawVal === undefined || rawVal === '') {
            const colIdx = cols.indexOf(col);
            if (colIdx < rawKeys.length) rawVal = raw[rawKeys[colIdx]];
          }
          if (col.type === 'number' || col.type === 'currency') {
            row[col.key] = Number(String(rawVal ?? 0).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
          } else if (col.type === 'boolean') {
            row[col.key] = rawVal !== false && rawVal !== 'false' && rawVal !== 0 && rawVal !== '';
          } else {
            row[col.key] = String(rawVal ?? '');
          }
        });
        return row;
      }).map((row) => {
        // Auto-fill icons if missing
        if (widget === 'tasks' && !row.icon) {
          const s = String(row.status || '').toLowerCase();
          if (s.includes('conclu')) row.icon = '✅';
          else if (s.includes('andamento') || s.includes('progress')) row.icon = '🔄';
          else if (s.includes('pendent') || s.includes('aguard')) row.icon = '⏳';
          else if (s.includes('atras') || s.includes('late') || s.includes('overdue')) row.icon = '⚠️';
          // leave empty — TasksGrid will assign icon by index
        }
        if (widget === 'metrics' && !row.icon) {
          const l = String(row.label || '').toLowerCase();
          if (l.includes('fatur') || l.includes('receita') || l.includes('revenue')) row.icon = '💰';
          else if (l.includes('client') || l.includes('customer')) row.icon = '👥';
          else if (l.includes('venda') || l.includes('sale')) row.icon = '🛒';
          else if (l.includes('lucro') || l.includes('profit')) row.icon = '📈';
          else if (l.includes('desp') || l.includes('custo') || l.includes('expense')) row.icon = '💸';
          else row.icon = '📊';
        }
        return row;
      });
      chartData[widget] = rows;
      if (!usedWidgets.includes(widget)) usedWidgets.push(widget);
    });
    const widgets = usedWidgets.length ? usedWidgets : ['revenue'];
    const trimmed = importName.trim();

    // ── All kpiTable sections stay in one dashboard ──
    const slug = slugify(trimmed);
    const entry = {
      id: `${slug}-${Date.now()}`,
      slug,
      name: trimmed,
      widgets,
      linkedBpmn: null,
      chartData,
      originalKpiTable: chartData.kpiTable?.length ? JSON.parse(JSON.stringify(chartData.kpiTable)) : undefined,
      createdBy: user?.nome || user?.email || '',
      createdAt: new Date().toISOString(),
    };
    // Replace any existing dashboard with the same slug
    const next = [...dashboards.filter((d) => d.slug !== slug), entry];
    setDashboards(next);
    saveDashboards(next);
    closeImport();
    navigate('/dashboard/' + slug);
  };

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
          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.secondaryButton}${modalStep === MODAL_STEP_IMPORT ? ' ' + styles.secondaryButtonActive : ''}`}
              onClick={openImport}
            >
              📂 Importar planilha
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={openCreate}
            >
              Criar Dashboard
            </button>
          </div>
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
                  {[...dashboards].reverse().map((item) => (
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
                          name={`linkedBpmn_${item.id}`}
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
                            const label = w ? `${w.icon} ${w.label}` : WIDGET_LABELS[wid] ? `📊 ${WIDGET_LABELS[wid]}` : null;
                            return label ? (
                              <span key={wid} className={styles.badge}>
                                {label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className={styles.creatorCell}>
                        {item.createdBy || '—'}
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td className={styles.actionsCell}>
                        <div className={styles.actions}>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.viewButton}`}
                          onClick={() => exportDashboardXlsx({ widgets: item.widgets || [], chartData: item.chartData || {}, name: item.name || 'Dashboard' })}
                          title="Exportar Excel"
                          aria-label="Exportar Excel"
                        >
                          📥
                        </button>
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
                        </div>
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
              name="createBpmnSearch"
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
                              name={`dataCellBool_${idx}_${c.key}`}
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
                              name={`dataCellVal_${idx}_${c.key}`}
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
              name="bpmnLinkSearch"
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
      {/* Modal: importar planilha */}
      {modalStep === MODAL_STEP_IMPORT && (
        <div
          className={styles.overlay}
          onClick={closeImport}
          role="dialog"
          aria-modal="true"
          aria-label="Importar planilha"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>📂 Importar Planilha</h2>

            {importStep === 'upload' ? (
              <>
                <p className={styles.modalText}>
                  Selecione um arquivo <strong>.csv</strong> ou{' '}
                  <strong>.xlsx</strong> para criar um dashboard automaticamente.
                  A IA detecta o tipo de gráfico e mapeia as colunas.
                </p>
                {importError && (
                  <p className={styles.importErrorMsg}>{importError}</p>
                )}
                <div
                  className={`${styles.uploadZone} ${importLoading ? styles.uploadZoneLoading : ''}`}
                  onClick={() => !importLoading && importFileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && !importLoading && importFileRef.current?.click()
                  }
                >
                  {importLoading ? (
                    <>
                      <span className={styles.uploadIcon}>🔄</span>
                      <span>Analisando planilha com IA…</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.uploadIcon}>📊</span>
                      <span>Clique para selecionar o arquivo</span>
                      <span className={styles.uploadHint}>.csv, .xlsx, .xls</span>
                    </>
                  )}
                </div>
                <input
                  ref={importFileRef}
                  type="file"
                  name="importFile"
                  accept=".csv,.xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleImportFile}
                />
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeImport}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.importResult}>
                  <p className={styles.importMappingTitle}>
                    Revise os gráficos detectados pela IA e ajuste se necessário
                  </p>
                  {(importParsed || []).map((sheetData) => {
                    const sheetMap = (importMapping?.sheets || []).find(
                      (s) => s.sheetName === sheetData.sheetName
                    );
                    const currentWidget = sheetMap?.widget || '';
                    return (
                      <div key={sheetData.sheetName} className={styles.importSheetRow}>
                        <div className={styles.importSheetInfo}>
                          <span className={styles.importSheetName}>{sheetData.sheetName}</span>
                          <span className={styles.importSheetRows}>{sheetData.rows.length} linhas</span>
                        </div>
                        {currentWidget === 'kpiTable' ? (
                          <span className={styles.importWidgetFixed}>📊 Gráficos de Indicadores</span>
                        ) : (
                          <select
                            className={styles.importWidgetSelect}
                            name={`importWidget_${sheetData.sheetName}`}
                            value={currentWidget}
                            onChange={(e) => updateSheetWidget(sheetData.sheetName, e.target.value)}
                          >
                            <option value="">— Ignorar esta aba —</option>
                            {ALL_WIDGETS.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.icon} {w.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>

                <label className={styles.modalLabel} htmlFor="import-dash-name">
                  Nome do dashboard
                </label>
                <input
                  id="import-dash-name"
                  className={styles.modalInput}
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  autoFocus
                  maxLength={80}
                />

                {importError && (
                  <p className={styles.importErrorMsg}>{importError}</p>
                )}

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setImportStep('upload')}
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleCreateFromImport}
                    disabled={!importName.trim()}
                  >
                    Criar Dashboard
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </section>
  );
};

export default DashboardStart;
