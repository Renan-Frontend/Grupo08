import React, {
  useState,
  useCallback,
  useContext,
  useMemo,
  useEffect,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import styles from "./Dashboard.module.css";
import { UserContext } from "../../../Context/UserContext";
import { isReadOnlyAccessLevelOne } from "../../../Utils/accessControl";
import MetricsGrid from "./MetricsGrid";
import RevenueChart from "./RevenueChart";
import SalesBarChart from "./SalesBarChart";
import ConversionsChart from "./ConversionsChart";
import ExpensesChart from "./ExpensesChart";
import TasksGrid from "./TasksGrid";
import PipelineChart from "./PipelineChart";
import KpiChart from "./KpiTable";
import DataEditModal from "./DataEditModal";
import { downloadXlsx, exportDashboardXlsx } from "../../../Utils/exportXlsx";

const STORAGE_KEY = "bp_dashboards_v1";

const MONTHS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const DEFAULT_REVENUE = MONTHS.map((mes, i) => ({
  mes,
  valor: [
    42000, 58000, 51000, 67000, 72000, 68000, 85000, 91000, 78000, 95000,
    102000, 118000,
  ][i],
}));

const DEFAULT_SALES = MONTHS.map((mes, i) => ({
  mes,
  vendas: [210, 285, 251, 320, 342, 308, 395, 420, 378, 445, 488, 505][i],
  clientes: [180, 220, 198, 265, 290, 260, 330, 355, 312, 380, 410, 430][i],
}));

const DEFAULT_METRICS = [
  {
    icon: "💰",
    label: "FATURAMENTO TOTAL",
    value: "R$ 847.250",
    change: "↑ 12,5%",
    up: true,
  },
  {
    icon: "👥",
    label: "TOTAL DE CLIENTES",
    value: "1.284",
    change: "↑ 8,2%",
    up: true,
  },
  {
    icon: "🛒",
    label: "TOTAL DE VENDAS",
    value: "3.647",
    change: "↑ 15,3%",
    up: true,
  },
];

const DEFAULT_CONVERSIONS = MONTHS.map((mes, i) => ({
  mes,
  taxa: [3.2, 4.1, 3.8, 4.5, 5.1, 4.8, 5.6, 6.0, 5.4, 6.2, 6.8, 7.1][i],
}));

const DEFAULT_EXPENSES = MONTHS.map((mes, i) => ({
  mes,
  fixas: [
    18000, 18000, 18500, 18500, 19000, 19000, 19500, 19500, 20000, 20000, 20500,
    21000,
  ][i],
  variaveis: [
    12000, 15000, 11000, 14000, 16000, 13000, 18000, 17000, 15000, 19000, 22000,
    25000,
  ][i],
}));

const DEFAULT_TASKS = [
  { icon: "✅", status: "Concluídas", valor: 47 },
  { icon: "🔄", status: "Em andamento", valor: 23 },
  { icon: "⏳", status: "Pendentes", valor: 15 },
  { icon: "⚠️", status: "Atrasadas", valor: 8 },
];

const DEFAULT_PIPELINE = [
  { etapa: "Prospecção", leads: 120, valor: 240000 },
  { etapa: "Qualificação", leads: 85, valor: 197000 },
  { etapa: "Proposta", leads: 52, valor: 125000 },
  { etapa: "Negociação", leads: 28, valor: 89000 },
  { etapa: "Fechamento", leads: 15, valor: 52000 },
];

const METRIC_ICONS = ["💰", "👥", "🛒", "📊", "📈", "⭐", "🔥"];

const WIDGET_COLUMNS = {
  revenue: [
    { key: "mes", label: "Mês", type: "text" },
    { key: "valor", label: "Valor (R$)", type: "currency" },
  ],
  sales: [
    { key: "mes", label: "Mês", type: "text" },
    { key: "vendas", label: "Vendas", type: "number" },
    { key: "clientes", label: "Clientes", type: "number" },
  ],
  metrics: [
    { key: "label", label: "Indicador", type: "text" },
    { key: "value", label: "Valor", type: "text" },
    { key: "change", label: "Variação", type: "text" },
    { key: "up", label: "Tendência", type: "boolean" },
  ],
  conversions: [
    { key: "mes", label: "Mês", type: "text" },
    { key: "taxa", label: "Taxa (%)", type: "number" },
  ],
  expenses: [
    { key: "mes", label: "Mês", type: "text" },
    { key: "fixas", label: "Fixas (R$)", type: "number" },
    { key: "variaveis", label: "Variáveis (R$)", type: "number" },
  ],
  tasks: [
    { key: "icon", label: "Ícone", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "valor", label: "Qtd", type: "number" },
  ],
  pipeline: [
    { key: "etapa", label: "Etapa", type: "text" },
    { key: "leads", label: "Leads", type: "number" },
    { key: "valor", label: "Valor (R$)", type: "number" },
  ],
  kpiTable: [],
};

const WIDGET_TITLES = {
  revenue: "Editar dados — Faturamento Mensal",
  sales: "Editar dados — Vendas e Clientes",
  metrics: "Editar dados — Métricas KPI",
  conversions: "Editar dados — Taxa de Conversão",
  expenses: "Editar dados — Despesas Mensais",
  tasks: "Editar dados — Tarefas",
  pipeline: "Editar dados — Pipeline de Vendas",
  kpiTable: "Editar dados — Indicadores KPI",
};

const loadEntry = (slug) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    // Find all matching entries; prefer the newest (last in array or latest createdAt)
    const matches = list.filter((d) => d.slug === slug);
    if (matches.length <= 1) return matches[0] || null;
    // Multiple entries with same slug — return the newest and clean up
    matches.sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || ""),
    );
    const newest = matches[0];
    // Deduplicate: keep only the newest
    const deduped = list.filter((d) => d.slug !== slug);
    deduped.push(newest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    return newest;
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
  } catch {
    /* ignore */
  }
};

const Dashboard = () => {
  const { dashboardSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);

  const entry = dashboardSlug ? loadEntry(dashboardSlug) : null;
  const name = entry?.name || dashboardSlug || "Dashboard";
  const widgets = useMemo(
    () => entry?.widgets || ["metrics", "revenue", "sales"],
    [entry?.widgets],
  );

  const [chartData, setChartData] = useState({
    revenue: entry?.chartData?.revenue || DEFAULT_REVENUE,
    sales: entry?.chartData?.sales || DEFAULT_SALES,
    metrics: entry?.chartData?.metrics || DEFAULT_METRICS,
    conversions: entry?.chartData?.conversions?.length
      ? entry.chartData.conversions
      : DEFAULT_CONVERSIONS,
    expenses: entry?.chartData?.expenses?.length
      ? entry.chartData.expenses
      : DEFAULT_EXPENSES,
    tasks: entry?.chartData?.tasks?.length
      ? entry.chartData.tasks
      : DEFAULT_TASKS,
    pipeline: entry?.chartData?.pipeline?.length
      ? entry.chartData.pipeline
      : DEFAULT_PIPELINE,
    kpiTable: entry?.chartData?.kpiTable || [],
  });

  const [widgetMetas, setWidgetMetas] = useState(
    () => entry?.widgetMetas || {},
  );
  const [widgetMetaTypes, setWidgetMetaTypes] = useState(
    () => entry?.widgetMetaTypes || {},
  );

  const handleMetaChange = useCallback(
    (widget, value) => {
      setWidgetMetas((prev) => {
        const next = { ...prev, [widget]: value };
        if (dashboardSlug) persistEntry(dashboardSlug, { widgetMetas: next });
        return next;
      });
    },
    [dashboardSlug],
  );

  const handleMetaTypeChange = useCallback(
    (widget, type) => {
      setWidgetMetaTypes((prev) => {
        const next = { ...prev, [widget]: type };
        if (dashboardSlug)
          persistEntry(dashboardSlug, { widgetMetaTypes: next });
        return next;
      });
    },
    [dashboardSlug],
  );

  const originalKpiTable = entry?.originalKpiTable || null;

  useEffect(() => {
    if (
      !originalKpiTable &&
      entry?.chartData?.kpiTable?.length &&
      dashboardSlug
    ) {
      const snapshot = JSON.parse(JSON.stringify(entry.chartData.kpiTable));
      persistEntry(dashboardSlug, { originalKpiTable: snapshot });
    }
  }, [dashboardSlug]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editingWidget, setEditingWidget] = useState(null);
  const [editingKpiIndex, setEditingKpiIndex] = useState(null);
  const [kpiEditForm, setKpiEditForm] = useState({
    name: "",
    meta: "",
    tendencia: "",
    media: "",
    months: {},
  });

  const handleSaveData = useCallback(
    (widget, newRows) => {
      let sanitized = newRows;
      if (widget === "metrics") {
        sanitized = newRows.map((r, i) => ({
          ...r,
          icon: r.icon || METRIC_ICONS[i] || "📊",
        }));
      }
      const updated = { ...chartData, [widget]: sanitized };
      setChartData(updated);
      if (dashboardSlug) persistEntry(dashboardSlug, { chartData: updated });
      setEditingWidget(null);
    },
    [chartData, dashboardSlug],
  );

  const handleKpiMetaChange = useCallback(
    (index, value) => {
      const updated = [...chartData.kpiTable];
      updated[index] = { ...updated[index], meta: value };
      const newData = { ...chartData, kpiTable: updated };
      setChartData(newData);
      if (dashboardSlug) persistEntry(dashboardSlug, { chartData: newData });
    },
    [chartData, dashboardSlug],
  );

  const handleKpiMetaTypeChange = useCallback(
    (index, type) => {
      const updated = [...chartData.kpiTable];
      updated[index] = { ...updated[index], metaType: type };
      const newData = { ...chartData, kpiTable: updated };
      setChartData(newData);
      if (dashboardSlug) persistEntry(dashboardSlug, { chartData: newData });
    },
    [chartData, dashboardSlug],
  );

  const handleEditKpi = useCallback(
    (index) => {
      const row = chartData.kpiTable[index];
      if (!row) return;
      const monthsCopy = {};
      if (row.months) {
        Object.entries(row.months).forEach(([k, v]) => {
          monthsCopy[k] = v !== undefined && v !== null ? String(v) : "";
        });
      }
      setKpiEditForm({
        name: row.name || "",
        meta:
          row.meta === "definir"
            ? "definir"
            : row.meta !== undefined && row.meta !== null
              ? String(row.meta)
              : "",
        tendencia: row.tendencia || "",
        media:
          row.media !== undefined && row.media !== null
            ? String(row.media)
            : "",
        months: monthsCopy,
      });
      setEditingKpiIndex(index);
    },
    [chartData.kpiTable],
  );

  const handleSaveKpi = useCallback(() => {
    if (editingKpiIndex === null) return;
    // Allow 'definir' or empty meta (will default to 'definir')
    const metaStr = String(kpiEditForm.meta).trim();
    const safeMeta = metaStr === "" ? "definir" : metaStr;
    const updated = [...chartData.kpiTable];
    const prev = updated[editingKpiIndex];
    const parsedMonths = {};
    Object.entries(kpiEditForm.months).forEach(([k, v]) => {
      const s = String(v).trim();
      if (s === "") return;
      const pct = s.match(/^([\d.,]+)\s*%$/);
      if (pct) {
        parsedMonths[k] = Number(pct[1].replace(",", ".")) / 100;
        return;
      }
      const n = Number(s.replace(",", "."));
      parsedMonths[k] = isNaN(n) ? v : n;
    });
    // Parse meta: keep 'definir' as string, otherwise convert
    let parsedMeta = safeMeta;
    if (safeMeta !== "definir") {
      const metaPct = safeMeta.match(/^([\d.,]+)\s*%$/);
      if (metaPct) parsedMeta = Number(metaPct[1].replace(",", ".")) / 100;
      else {
        const n = Number(safeMeta.replace(",", "."));
        if (!isNaN(n)) parsedMeta = n;
      }
    }
    updated[editingKpiIndex] = {
      ...prev,
      name: kpiEditForm.name,
      meta: parsedMeta,
      metaRaw: safeMeta,
      tendencia: kpiEditForm.tendencia,
      media: kpiEditForm.media,
      months: parsedMonths,
    };
    const newData = { ...chartData, kpiTable: updated };
    setChartData(newData);
    if (dashboardSlug) persistEntry(dashboardSlug, { chartData: newData });
    setEditingKpiIndex(null);
  }, [editingKpiIndex, kpiEditForm, chartData, dashboardSlug]);

  const handleResetKpi = useCallback(() => {
    if (editingKpiIndex === null || !originalKpiTable) return;
    const orig = originalKpiTable[editingKpiIndex];
    if (!orig) return;
    const monthsCopy = {};
    if (orig.months) {
      Object.entries(orig.months).forEach(([k, v]) => {
        monthsCopy[k] = v !== undefined && v !== null ? String(v) : "";
      });
    }
    setKpiEditForm({
      name: orig.name || "",
      meta:
        orig.meta !== undefined && orig.meta !== null ? String(orig.meta) : "",
      tendencia: orig.tendencia || "",
      media:
        orig.media !== undefined && orig.media !== null
          ? String(orig.media)
          : "",
      months: monthsCopy,
    });
  }, [editingKpiIndex, originalKpiTable]);

  const handleResetKpiDirect = useCallback(
    (index) => {
      if (!originalKpiTable || !originalKpiTable[index]) return;
      const orig = originalKpiTable[index];
      if (!window.confirm(`Resetar "${orig.name}" para os valores originais?`))
        return;
      const updated = [...chartData.kpiTable];
      updated[index] = JSON.parse(JSON.stringify(orig));
      const newData = { ...chartData, kpiTable: updated };
      setChartData(newData);
      if (dashboardSlug) persistEntry(dashboardSlug, { chartData: newData });
    },
    [chartData, dashboardSlug, originalKpiTable],
  );

  const handleDeleteKpi = useCallback(
    (index) => {
      const row = chartData.kpiTable[index];
      if (!row) return;
      if (!window.confirm(`Apagar o gráfico "${row.name}"?`)) return;
      const updated = chartData.kpiTable.filter((_, i) => i !== index);
      const newData = { ...chartData, kpiTable: updated };
      setChartData(newData);
      if (dashboardSlug) persistEntry(dashboardSlug, { chartData: newData });
    },
    [chartData, dashboardSlug],
  );

  /* ─── Export XLSX (modelo indicadores) ─── */
  const handleExportCSV = useCallback(() => {
    exportDashboardXlsx({ widgets, chartData, name });
  }, [widgets, chartData, name]);

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.pageHeader}>
        <button
          type="button"
          className={styles.backLink}
          onClick={() => navigate("/dashboard")}
          aria-label="Voltar para dashboards"
        >
          ← Dashboards
        </button>
        <h1 className={styles.pageTitle}>{name}</h1>
        <button
          type="button"
          onClick={handleExportCSV}
          title="Exportar dashboard como Excel"
          style={{
            marginLeft: "auto",
            padding: "0.4rem 0.9rem",
            border: "1.5px solid #e2e8f0",
            borderRadius: 6,
            background: "white",
            cursor: "pointer",
            fontSize: "0.82rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          📥 Exportar Excel
        </button>
      </div>

      {(widgets.includes("metrics") || widgets.includes("tasks")) && (
        <div className={styles.chartsGrid}>
          {widgets.includes("metrics") && (
            <MetricsGrid
              metrics={chartData.metrics}
              onEditData={
                isReadOnlyMode ? null : () => setEditingWidget("metrics")
              }
              meta={widgetMetas.metrics ?? null}
              metaType={widgetMetaTypes.metrics || "value"}
              onMetaChange={
                isReadOnlyMode ? null : (v) => handleMetaChange("metrics", v)
              }
              onMetaTypeChange={
                isReadOnlyMode
                  ? null
                  : (t) => handleMetaTypeChange("metrics", t)
              }
            />
          )}
          {widgets.includes("tasks") && (
            <TasksGrid
              tasks={chartData.tasks}
              onEditData={
                isReadOnlyMode ? null : () => setEditingWidget("tasks")
              }
              meta={widgetMetas.tasks ?? null}
              metaType={widgetMetaTypes.tasks || "value"}
              onMetaChange={
                isReadOnlyMode ? null : (v) => handleMetaChange("tasks", v)
              }
              onMetaTypeChange={
                isReadOnlyMode ? null : (t) => handleMetaTypeChange("tasks", t)
              }
            />
          )}
        </div>
      )}

      {(widgets.includes("revenue") || widgets.includes("sales")) && (
        <div className={styles.chartsGrid}>
          {widgets.includes("revenue") && (
            <RevenueChart
              data={chartData.revenue}
              onEditData={
                isReadOnlyMode ? null : () => setEditingWidget("revenue")
              }
              meta={widgetMetas.revenue ?? null}
              metaType={widgetMetaTypes.revenue || "value"}
              onMetaChange={
                isReadOnlyMode ? null : (v) => handleMetaChange("revenue", v)
              }
              onMetaTypeChange={
                isReadOnlyMode
                  ? null
                  : (t) => handleMetaTypeChange("revenue", t)
              }
            />
          )}
          {widgets.includes("sales") && (
            <SalesBarChart
              data={chartData.sales}
              onEditData={
                isReadOnlyMode ? null : () => setEditingWidget("sales")
              }
              meta={widgetMetas.sales ?? null}
              metaType={widgetMetaTypes.sales || "value"}
              onMetaChange={
                isReadOnlyMode ? null : (v) => handleMetaChange("sales", v)
              }
              onMetaTypeChange={
                isReadOnlyMode ? null : (t) => handleMetaTypeChange("sales", t)
              }
            />
          )}
        </div>
      )}

      {(widgets.includes("conversions") || widgets.includes("expenses")) && (
        <div className={styles.chartsGrid}>
          {widgets.includes("conversions") && (
            <ConversionsChart
              data={chartData.conversions}
              onEditData={
                isReadOnlyMode ? null : () => setEditingWidget("conversions")
              }
              meta={widgetMetas.conversions ?? null}
              metaType={widgetMetaTypes.conversions || "value"}
              onMetaChange={
                isReadOnlyMode
                  ? null
                  : (v) => handleMetaChange("conversions", v)
              }
              onMetaTypeChange={
                isReadOnlyMode
                  ? null
                  : (t) => handleMetaTypeChange("conversions", t)
              }
            />
          )}
          {widgets.includes("expenses") && (
            <ExpensesChart
              data={chartData.expenses}
              onEditData={
                isReadOnlyMode ? null : () => setEditingWidget("expenses")
              }
              meta={widgetMetas.expenses ?? null}
              metaType={widgetMetaTypes.expenses || "value"}
              onMetaChange={
                isReadOnlyMode ? null : (v) => handleMetaChange("expenses", v)
              }
              onMetaTypeChange={
                isReadOnlyMode
                  ? null
                  : (t) => handleMetaTypeChange("expenses", t)
              }
            />
          )}
        </div>
      )}

      {widgets.includes("pipeline") && (
        <PipelineChart
          data={chartData.pipeline}
          onEditData={
            isReadOnlyMode ? null : () => setEditingWidget("pipeline")
          }
          meta={widgetMetas.pipeline ?? null}
          metaType={widgetMetaTypes.pipeline || "value"}
          onMetaChange={
            isReadOnlyMode ? null : (v) => handleMetaChange("pipeline", v)
          }
          onMetaTypeChange={
            isReadOnlyMode ? null : (t) => handleMetaTypeChange("pipeline", t)
          }
        />
      )}

      {widgets.includes("kpiTable") && chartData.kpiTable?.length > 0 && (
        <KpiChart
          data={chartData.kpiTable}
          onEditIndicator={isReadOnlyMode ? null : handleEditKpi}
          onDeleteIndicator={isReadOnlyMode ? null : handleDeleteKpi}
          onResetIndicator={
            isReadOnlyMode || !originalKpiTable ? null : handleResetKpiDirect
          }
          onMetaChange={isReadOnlyMode ? null : handleKpiMetaChange}
          onMetaTypeChange={isReadOnlyMode ? null : handleKpiMetaTypeChange}
        />
      )}

      {widgets.length === 0 && (
        <p className={styles.emptyWidgets}>
          Nenhum widget configurado.{" "}
          <button
            type="button"
            className={styles.configureLink}
            onClick={() => navigate("/dashboard")}
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
          meta={widgetMetas[editingWidget] ?? null}
          metaType={widgetMetaTypes[editingWidget] || "value"}
          onMetaSave={(value, type) => {
            handleMetaChange(editingWidget, value);
            handleMetaTypeChange(editingWidget, type);
          }}
        />
      )}

      {editingKpiIndex !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: 420 }}>
            <h2 className={styles.modalTitle}>Editar Indicador</h2>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "0.2rem",
              }}
            >
              Nome
            </label>
            <input
              type="text"
              name="kpiName"
              value={kpiEditForm.name}
              onChange={(e) =>
                setKpiEditForm((f) => ({ ...f, name: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                border: "1.5px solid #e2e8f0",
                borderRadius: 6,
                fontSize: "0.85rem",
                marginBottom: "0.75rem",
              }}
            />
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "0.2rem",
              }}
            >
              Meta
            </label>
            <input
              type="text"
              name="kpiMeta"
              value={kpiEditForm.meta}
              onChange={(e) =>
                setKpiEditForm((f) => ({ ...f, meta: e.target.value }))
              }
              placeholder="Ex: 0.15, 15% ou definir"
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                border: "1.5px solid #e2e8f0",
                borderRadius: 6,
                fontSize: "0.85rem",
                marginBottom: "0.75rem",
              }}
            />
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "0.2rem",
              }}
            >
              Tendência
            </label>
            <select
              name="kpiTendencia"
              value={kpiEditForm.tendencia}
              onChange={(e) =>
                setKpiEditForm((f) => ({ ...f, tendencia: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                border: "1.5px solid #e2e8f0",
                borderRadius: 6,
                fontSize: "0.85rem",
                marginBottom: "0.75rem",
              }}
            >
              <option value="↑">↑ Subindo</option>
              <option value="→">→ Estável</option>
              <option value="↓">↓ Caindo</option>
            </select>
            <label
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "0.2rem",
              }}
            >
              Média
            </label>
            <input
              type="text"
              name="kpiMedia"
              value={kpiEditForm.media}
              onChange={(e) =>
                setKpiEditForm((f) => ({ ...f, media: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                border: "1.5px solid #e2e8f0",
                borderRadius: 6,
                fontSize: "0.85rem",
                marginBottom: "0.75rem",
              }}
            />
            {Object.keys(kpiEditForm.months).length > 0 && (
              <>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "0.35rem",
                  }}
                >
                  Valores Mensais
                </label>
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: 6,
                    padding: "0.5rem",
                    marginBottom: "1rem",
                  }}
                >
                  {Object.entries(kpiEditForm.months).map(([month, val]) => (
                    <div
                      key={month}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.35rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.78rem",
                          color: "#64748b",
                          minWidth: 60,
                        }}
                      >
                        {month}
                      </span>
                      <input
                        type="text"
                        name={`kpiMonth_${month}`}
                        value={val}
                        onChange={(e) => {
                          const v = e.target.value;
                          setKpiEditForm((f) => ({
                            ...f,
                            months: { ...f.months, [month]: v },
                          }));
                        }}
                        style={{
                          flex: 1,
                          padding: "0.3rem 0.5rem",
                          border: "1px solid #e2e8f0",
                          borderRadius: 4,
                          fontSize: "0.82rem",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
              }}
            >
              {originalKpiTable && originalKpiTable[editingKpiIndex] && (
                <button
                  type="button"
                  onClick={handleResetKpi}
                  title="Restaurar valores originais do import"
                  style={{
                    padding: "0.45rem 1rem",
                    border: "1.5px solid #fbbf24",
                    borderRadius: 6,
                    background: "#fffbeb",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    color: "#92400e",
                    marginRight: "auto",
                  }}
                >
                  ↩ Resetar
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingKpiIndex(null)}
                style={{
                  padding: "0.45rem 1rem",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 6,
                  background: "white",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveKpi}
                style={{
                  padding: "0.45rem 1rem",
                  border: "none",
                  borderRadius: 6,
                  background: "#22c55e",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
