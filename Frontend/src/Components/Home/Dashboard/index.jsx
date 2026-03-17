import React, { useState, useCallback, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';
import { UserContext } from '../../../Context/UserContext';
import { isReadOnlyAccessLevelOne } from '../../../Utils/accessControl';
import MetricsGrid from './MetricsGrid';
import RevenueChart from './RevenueChart';
import SalesBarChart from './SalesBarChart';
import ConversionsChart from './ConversionsChart';
import ExpensesChart from './ExpensesChart';
import TasksGrid from './TasksGrid';
import PipelineChart from './PipelineChart';
import DataEditModal from './DataEditModal';

const STORAGE_KEY = 'bp_dashboards_v1';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const DEFAULT_REVENUE = MONTHS.map((mes, i) => ({
  mes,
  valor: [42000, 58000, 51000, 67000, 72000, 68000, 85000, 91000, 78000, 95000, 102000, 118000][i],
}));

const DEFAULT_SALES = MONTHS.map((mes, i) => ({
  mes,
  vendas:   [210, 285, 251, 320, 342, 308, 395, 420, 378, 445, 488, 505][i],
  clientes: [180, 220, 198, 265, 290, 260, 330, 355, 312, 380, 410, 430][i],
}));

const DEFAULT_METRICS = [
  { icon: '💰', label: 'FATURAMENTO TOTAL', value: 'R$ 847.250', change: '↑ 12,5%', up: true },
  { icon: '👥', label: 'TOTAL DE CLIENTES', value: '1.284',      change: '↑ 8,2%',  up: true },
  { icon: '🛒', label: 'TOTAL DE VENDAS',   value: '3.647',      change: '↑ 15,3%', up: true },
];

const DEFAULT_CONVERSIONS = MONTHS.map((mes, i) => ({
  mes,
  taxa: [3.2, 4.1, 3.8, 4.5, 5.1, 4.8, 5.6, 6.0, 5.4, 6.2, 6.8, 7.1][i],
}));

const DEFAULT_EXPENSES = MONTHS.map((mes, i) => ({
  mes,
  fixas:     [18000, 18000, 18500, 18500, 19000, 19000, 19500, 19500, 20000, 20000, 20500, 21000][i],
  variaveis: [12000, 15000, 11000, 14000, 16000, 13000, 18000, 17000, 15000, 19000, 22000, 25000][i],
}));

const DEFAULT_TASKS = [
  { icon: '✅', status: 'Concluídas',   valor: 47 },
  { icon: '🔄', status: 'Em andamento', valor: 23 },
  { icon: '⏳', status: 'Pendentes',    valor: 15 },
  { icon: '⚠️', status: 'Atrasadas',    valor: 8  },
];

const DEFAULT_PIPELINE = [
  { etapa: 'Prospecção',   leads: 120, valor: 240000 },
  { etapa: 'Qualificação', leads: 85,  valor: 197000 },
  { etapa: 'Proposta',     leads: 52,  valor: 125000 },
  { etapa: 'Negociação',   leads: 28,  valor: 89000  },
  { etapa: 'Fechamento',   leads: 15,  valor: 52000  },
];

const METRIC_ICONS = ['💰', '👥', '🛒', '📊', '📈', '⭐', '🔥'];

const WIDGET_COLUMNS = {
  revenue: [
    { key: 'mes',   label: 'Mês',       type: 'text'     },
    { key: 'valor', label: 'Valor (R$)', type: 'currency' },
  ],
  sales: [
    { key: 'mes',      label: 'Mês',      type: 'text'   },
    { key: 'vendas',   label: 'Vendas',   type: 'number' },
    { key: 'clientes', label: 'Clientes', type: 'number' },
  ],
  metrics: [
    { key: 'label',  label: 'Indicador', type: 'text'    },
    { key: 'value',  label: 'Valor',     type: 'text'    },
    { key: 'change', label: 'Variação',  type: 'text'    },
    { key: 'up',     label: 'Tendência', type: 'boolean' },
  ],
  conversions: [
    { key: 'mes',  label: 'Mês',     type: 'text'   },
    { key: 'taxa', label: 'Taxa (%)', type: 'number' },
  ],
  expenses: [
    { key: 'mes',       label: 'Mês',           type: 'text'   },
    { key: 'fixas',     label: 'Fixas (R$)',     type: 'number' },
    { key: 'variaveis', label: 'Variáveis (R$)', type: 'number' },
  ],
  tasks: [
    { key: 'icon',   label: 'Ícone',  type: 'text'   },
    { key: 'status', label: 'Status', type: 'text'   },
    { key: 'valor',  label: 'Qtd',    type: 'number' },
  ],
  pipeline: [
    { key: 'etapa', label: 'Etapa',      type: 'text'   },
    { key: 'leads', label: 'Leads',      type: 'number' },
    { key: 'valor', label: 'Valor (R$)', type: 'number' },
  ],
};

const WIDGET_TITLES = {
  revenue:     'Editar dados — Faturamento Mensal',
  sales:       'Editar dados — Vendas e Clientes',
  metrics:     'Editar dados — Métricas KPI',
  conversions: 'Editar dados — Taxa de Conversão',
  expenses:    'Editar dados — Despesas Mensais',
  tasks:       'Editar dados — Tarefas',
  pipeline:    'Editar dados — Pipeline de Vendas',
};

const loadEntry = (slug) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list.find((d) => d.slug === slug) || null;
  } catch {
    return null;
  }
};

const persistEntry = (slug, patch) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const updated = list.map((d) => (d.slug === slug ? { ...d, ...patch } : d));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
};

const Dashboard = () => {
  const { dashboardSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);

  const entry = dashboardSlug ? loadEntry(dashboardSlug) : null;
  const name    = entry?.name    || dashboardSlug || 'Dashboard';
  const widgets = entry?.widgets || ['metrics', 'revenue', 'sales'];

  const [chartData, setChartData] = useState({
    revenue:     entry?.chartData?.revenue     || DEFAULT_REVENUE,
    sales:       entry?.chartData?.sales       || DEFAULT_SALES,
    metrics:     entry?.chartData?.metrics     || DEFAULT_METRICS,
    conversions: entry?.chartData?.conversions?.length ? entry.chartData.conversions : DEFAULT_CONVERSIONS,
    expenses:    entry?.chartData?.expenses?.length    ? entry.chartData.expenses    : DEFAULT_EXPENSES,
    tasks:       entry?.chartData?.tasks?.length       ? entry.chartData.tasks       : DEFAULT_TASKS,
    pipeline:    entry?.chartData?.pipeline?.length    ? entry.chartData.pipeline    : DEFAULT_PIPELINE,
  });

  const [editingWidget, setEditingWidget] = useState(null);

  const handleSaveData = useCallback((widget, newRows) => {
    let sanitized = newRows;
    if (widget === 'metrics') {
      sanitized = newRows.map((r, i) => ({ ...r, icon: r.icon || METRIC_ICONS[i] || '📊' }));
    }
    const updated = { ...chartData, [widget]: sanitized };
    setChartData(updated);
    if (dashboardSlug) persistEntry(dashboardSlug, { chartData: updated });
    setEditingWidget(null);
  }, [chartData, dashboardSlug]);

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.pageHeader}>
        <button
          type="button"
          className={styles.backLink}
          onClick={() => navigate('/dashboard')}
          aria-label="Voltar para dashboards"
        >
          ← Dashboards
        </button>
        <h1 className={styles.pageTitle}>{name}</h1>
      </div>

      {widgets.includes('metrics') && (
        <MetricsGrid
          metrics={chartData.metrics}
          onEditData={isReadOnlyMode ? null : () => setEditingWidget('metrics')}
        />
      )}

      {(widgets.includes('revenue') || widgets.includes('sales')) && (
        <div className={styles.chartsGrid}>
          {widgets.includes('revenue') && (
            <RevenueChart
              data={chartData.revenue}
              onEditData={isReadOnlyMode ? null : () => setEditingWidget('revenue')}
            />
          )}
          {widgets.includes('sales') && (
            <SalesBarChart
              data={chartData.sales}
              onEditData={isReadOnlyMode ? null : () => setEditingWidget('sales')}
            />
          )}
        </div>
      )}

      {(['conversions', 'expenses', 'tasks', 'pipeline']).map((wid) => {
        if (!widgets.includes(wid)) return null;
        if (wid === 'conversions') return (
          <ConversionsChart
            key="conversions"
            data={chartData.conversions}
            onEditData={isReadOnlyMode ? null : () => setEditingWidget('conversions')}
          />
        );
        if (wid === 'expenses') return (
          <ExpensesChart
            key="expenses"
            data={chartData.expenses}
            onEditData={isReadOnlyMode ? null : () => setEditingWidget('expenses')}
          />
        );
        if (wid === 'tasks') return (
          <TasksGrid
            key="tasks"
            tasks={chartData.tasks}
            onEditData={isReadOnlyMode ? null : () => setEditingWidget('tasks')}
          />
        );
        if (wid === 'pipeline') return (
          <PipelineChart
            key="pipeline"
            data={chartData.pipeline}
            onEditData={isReadOnlyMode ? null : () => setEditingWidget('pipeline')}
          />
        );
        return null;
      })}

      {widgets.length === 0 && (
        <p className={styles.emptyWidgets}>
          Nenhum widget configurado.{' '}
          <button
            type="button"
            className={styles.configureLink}
            onClick={() => navigate('/dashboard')}
          >
            Configurar agora
          </button>
        </p>
      )}

      {editingWidget && (
        <DataEditModal
          title={WIDGET_TITLES[editingWidget]}
          columns={WIDGET_COLUMNS[editingWidget]}
          rows={chartData[editingWidget]}
          onSave={(rows) => handleSaveData(editingWidget, rows)}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
