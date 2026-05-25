import React, { useState, useEffect } from "react";
import { API_URL } from "../../Api";
import styles from "./Activities.module.css";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  fetchOpportunitiesPage,
  getAuthToken,
  updateOpportunityById,
} from "../Opportunities/opportunityApi";
// Componentes nativos do Painel Geral para reaproveitar a renderização
// exata dos gráficos salvos no anexo.
import MetricsGrid from "../Home/Dashboard/MetricsGrid";
import RevenueChart from "../Home/Dashboard/RevenueChart";
import SalesBarChart from "../Home/Dashboard/SalesBarChart";
import ConversionsChart from "../Home/Dashboard/ConversionsChart";
import ExpensesChart from "../Home/Dashboard/ExpensesChart";
import TasksGrid from "../Home/Dashboard/TasksGrid";
import PipelineChart from "../Home/Dashboard/PipelineChart";
import KpiChart from "../Home/Dashboard/KpiTable";

// Renderiza um widget exatamente como aparece em /dashboard, em modo
// somente leitura (sem editar dados/meta). `snapshot` é o array salvo
// em chartData[widgetKey] no momento em que o usuário sincronizou o
// gráfico no passo 5 da oportunidade.
const DashboardWidgetRenderer = ({ widgetKey, snapshot }) => {
  const data = Array.isArray(snapshot) ? snapshot : [];
  const common = {
    onEditData: null,
    onMetaChange: null,
    onMetaTypeChange: null,
    meta: null,
    metaType: "value",
  };
  switch (widgetKey) {
    case "metrics":
      return <MetricsGrid metrics={data} {...common} />;
    case "tasks":
      return <TasksGrid tasks={data} {...common} />;
    case "revenue":
      return <RevenueChart data={data} {...common} />;
    case "sales":
      return <SalesBarChart data={data} {...common} />;
    case "conversions":
      return <ConversionsChart data={data} {...common} />;
    case "expenses":
      return <ExpensesChart data={data} {...common} />;
    case "pipeline":
      return <PipelineChart data={data} {...common} />;
    case "kpiTable":
      return (
        <KpiChart
          data={data}
          onEditIndicator={null}
          onDeleteIndicator={null}
          onResetIndicator={null}
          onMetaChange={null}
          onMetaTypeChange={null}
        />
      );
    default:
      return null;
  }
};

// ─── Editable field labels ───────────────────────────────────────────────────

const useCustomLabels = (storageKey, defaults) => {
  const [labels, setLabels] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...defaults, ...JSON.parse(saved) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  });
  const setLabel = (key, value) => {
    setLabels((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return [labels, setLabel];
};

const useCustomRequired = (storageKey, defaults) => {
  const [req, setReq] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...defaults, ...JSON.parse(saved) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  });
  const toggleRequired = (key) => {
    setReq((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return [req, toggleRequired];
};

// Usado só no título do modal (sem toggle de obrigatório)
const EditableLabel = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };
  if (editing) {
    return (
      <input
        className={styles.labelEdit}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        autoFocus
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <span
      className={styles.labelText}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value} <span className={styles.labelEditIcon}>✎</span>
    </span>
  );
};

// Usado nos campos do formulário — com edição de nome + toggle obrigatório
const FieldLabel = ({ value, onChange, required, onToggleRequired }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };
  return (
    <span className={styles.fieldLabelRow}>
      {editing ? (
        <input
          className={styles.labelEdit}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className={styles.labelName}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          title="Clique para renomear"
        >
          {value}
          <span className={styles.labelEditBtn}>✎ editar</span>
        </span>
      )}
      <button
        type="button"
        className={required ? styles.requiredBadgeOn : styles.requiredBadgeOff}
        onClick={onToggleRequired}
        title={
          required
            ? "Obrigatório — clique para tornar opcional"
            : "Opcional — clique para tornar obrigatório"
        }
      >
        {required ? "● obrig." : "○ opcional"}
      </button>
    </span>
  );
};

const useExtraFields = (storageKey) => {
  const [fields, setFields] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const save = (next) => {
    setFields(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };
  const addField = () =>
    save([...fields, { id: Date.now(), label: "Novo campo", required: false }]);
  const removeField = (id) => save(fields.filter((f) => f.id !== id));
  const updateField = (id, patch) =>
    save(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  return [fields, addField, removeField, updateField];
};

const ACTIVITY_LABEL_DEFAULTS = {
  titulo_modal: "Nova Atividade",
  tipo: "Tipo",
  status: "Status",
  titulo: "Título",
  referencia: "Referência",
  descricao: "Descrição",
  data_atividade: "Data/Hora",
  responsavel: "Responsável",
  duracao_minutos: "Duração (min)",
  local: "Local",
  participantes: "Participantes (separados por vírgula)",
  resultado: "Resultado/Observações",
  proximos_passos: "Próximos Passos",
  tags: "Tags (separadas por vírgula)",
};

const ACTIVITY_REQUIRED_DEFAULTS = {
  tipo: true,
  status: false,
  titulo: true,
  referencia: false,
  descricao: false,
  data_atividade: true,
  responsavel: false,
  duracao_minutos: false,
  local: false,
  participantes: false,
  resultado: false,
  proximos_passos: false,
  tags: false,
};

const ActivityTypeIcon = ({ tipo }) => {
  const icons = {
    call: "☎️",
    email: "📧",
    meeting: "🤝",
    task: "✓",
    note: "📝",
  };
  return icons[tipo] || "📌";
};

// Renderiza apenas botões de download (CSV/JSON) para o snapshot salvo do
// gráfico — sem tabela/chart inline, conforme solicitação para manter a UI
// limpa em /tarefas.
const downloadSnapshot = (snapshot, widgetLabel, format) => {
  const safeName = (widgetLabel || "snapshot")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .toLowerCase();
  let content = "";
  let mime = "";
  let ext = "";
  if (format === "json") {
    content = JSON.stringify(snapshot, null, 2);
    mime = "application/json;charset=utf-8";
    ext = "json";
  } else {
    const allKeys = Array.from(
      snapshot.reduce((acc, r) => {
        if (r && typeof r === "object") {
          Object.keys(r).forEach((k) => acc.add(k));
        }
        return acc;
      }, new Set()),
    );
    const escape = (v) => {
      if (v == null) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [allKeys.join(";")];
    snapshot.forEach((row) => {
      lines.push(allKeys.map((k) => escape(row?.[k])).join(";"));
    });
    content = lines.join("\n");
    mime = "text/csv;charset=utf-8";
    ext = "csv";
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const SnapshotPreview = ({ snapshot, widgetLabel }) => {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return null;
  return (
    <div className={styles.snapshotPreview}>
      <div className={styles.snapshotActions}>
        <span className={styles.recordMuted}>
          {snapshot.length} registro(s) disponível(is) para download
        </span>
        <div className={styles.snapshotButtons}>
          <button
            type="button"
            className={styles.snapshotDownloadBtn}
            onClick={() => downloadSnapshot(snapshot, widgetLabel, "csv")}
          >
            ⬇ CSV
          </button>
          <button
            type="button"
            className={styles.snapshotDownloadBtn}
            onClick={() => downloadSnapshot(snapshot, widgetLabel, "json")}
          >
            ⬇ JSON
          </button>
        </div>
      </div>
    </div>
  );
};

// Renderiza um gráfico de barras a partir do snapshot do widget.
// Detecta automaticamente a coluna de rótulo (primeira não-numérica) e
// as colunas numéricas (excluindo séries pesadas como `months`/`monthsRaw`).
const CHART_HIDDEN_KEYS = new Set([
  "months",
  "monthsRaw",
  "monthsData",
  "series",
  "raw",
  "_id",
  "id",
  "icon",
  "color",
  "metaType",
  "tendencia",
]);

const CHART_COLORS = [
  "#2fb36d",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];

const toChartNumber = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v
      .replace(/[R$\s]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const SnapshotChart = ({ snapshot, widgetLabel }) => {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return null;

  const keys = Array.from(
    snapshot.reduce((acc, r) => {
      if (r && typeof r === "object") {
        Object.keys(r).forEach((k) => {
          if (!CHART_HIDDEN_KEYS.has(k)) acc.add(k);
        });
      }
      return acc;
    }, new Set()),
  );

  const numericKeys = keys.filter((k) =>
    snapshot.some((r) => toChartNumber(r?.[k]) !== null),
  );
  const labelKey =
    keys.find(
      (k) =>
        !numericKeys.includes(k) &&
        snapshot.some(
          (r) => r?.[k] !== null && r?.[k] !== undefined && r?.[k] !== "",
        ),
    ) || keys[0];

  if (!labelKey || numericKeys.length === 0) {
    return (
      <p className={styles.recordMuted}>
        Sem dados numéricos para visualização gráfica.
      </p>
    );
  }

  const data = snapshot.map((row, idx) => {
    const entry = { __label: String(row?.[labelKey] ?? `Item ${idx + 1}`) };
    numericKeys.forEach((k) => {
      const n = toChartNumber(row?.[k]);
      if (n !== null) entry[k] = n;
    });
    return entry;
  });

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ee" />
          <XAxis
            dataKey="__label"
            angle={-20}
            textAnchor="end"
            interval={0}
            height={60}
            tick={{ fontSize: 11, fill: "#475569" }}
          />
          <YAxis tick={{ fontSize: 11, fill: "#475569" }} />
          <Tooltip
            labelFormatter={(v) => `${widgetLabel || ""} — ${v}`}
            contentStyle={{ fontSize: 12 }}
          />
          {numericKeys.length > 1 ? (
            <Legend wrapperStyle={{ fontSize: 12 }} />
          ) : null}
          {numericKeys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const ActivityStatusBadge = ({ status }) => {
  const colors = {
    planejado: "#3b82f6",
    concluido: "#10b981",
    cancelado: "#ef4444",
  };
  return (
    <span
      className={styles.statusBadge}
      style={{ backgroundColor: colors[status] }}
    >
      {status}
    </span>
  );
};

const normalizeText = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toNumberSafe = (value) => {
  const n = Number.parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatBRL = (value) => {
  const n = toNumberSafe(value);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const calcProductTotalActivities = (product) => {
  const qty = toNumberSafe(product?.quantidade);
  const price = toNumberSafe(product?.precoUnitario);
  const discount = toNumberSafe(product?.desconto);
  return qty * price * (1 - discount / 100);
};

const calcQuoteTotalActivities = (quote) => {
  const items = Array.isArray(quote?.items) ? quote.items : [];
  const subtotal = items.reduce((acc, item) => {
    const qty = toNumberSafe(item?.quantidade);
    const price = toNumberSafe(item?.precoUnitario);
    const discount = toNumberSafe(item?.desconto);
    return acc + qty * price * (1 - discount / 100);
  }, 0);
  const quoteDiscount = toNumberSafe(quote?.desconto);
  return subtotal * (1 - quoteDiscount / 100);
};

const isTaskFromConfiguredOpportunity = (activity) => {
  const tipo = normalizeText(activity?.tipo);
  const entidadeTipo = normalizeText(
    activity?.entidade_tipo || activity?.entity_type || activity?.entidadeTipo,
  );
  const entidadeId = String(
    activity?.entidade_id || activity?.entity_id || activity?.entidadeId || "",
  ).trim();
  const referencia = String(activity?.referencia || "").trim();

  const isTask = tipo === "task" || tipo === "tarefa";
  const isOpportunity =
    entidadeTipo === "oportunidade" || entidadeTipo === "opportunity";
  const isConfigured = Boolean(entidadeId) && Boolean(referencia);

  return isTask && isOpportunity && isConfigured;
};

// Variante para condições: aceita tipo=condicional vinculado a uma
// oportunidade configurada. Reutilizada pela página /condicoes que renderiza
// o mesmo componente <Activities> trocando o filtro.
const isConditionalFromConfiguredOpportunity = (activity) => {
  const tipo = normalizeText(activity?.tipo);
  const entidadeTipo = normalizeText(
    activity?.entidade_tipo || activity?.entity_type || activity?.entidadeTipo,
  );
  const entidadeId = String(
    activity?.entidade_id || activity?.entity_id || activity?.entidadeId || "",
  ).trim();
  const referencia = String(activity?.referencia || "").trim();

  const isCondicional = tipo === "condicional" || tipo === "conditional";
  const isOpportunity =
    entidadeTipo === "oportunidade" || entidadeTipo === "opportunity";
  const isConfigured = Boolean(entidadeId) && Boolean(referencia);

  return isCondicional && isOpportunity && isConfigured;
};

// Variante para contatos: aceita tipo=contato vinculado a uma oportunidade
// configurada. Reutilizada pela página /contatos que renderiza o mesmo
// componente <Activities> trocando o filtro, exibindo cada passo do tipo
// Contato como um card com o nome do passo e todo o conteúdo configurado
// (atores, atributos, indicadores, anexos & gráficos).
const isContactFromConfiguredOpportunity = (activity) => {
  const tipo = normalizeText(activity?.tipo);
  const entidadeTipo = normalizeText(
    activity?.entidade_tipo || activity?.entity_type || activity?.entidadeTipo,
  );
  const entidadeId = String(
    activity?.entidade_id || activity?.entity_id || activity?.entidadeId || "",
  ).trim();
  const referencia = String(activity?.referencia || "").trim();

  const isContato = tipo === "contato" || tipo === "contact";
  const isOpportunity =
    entidadeTipo === "oportunidade" || entidadeTipo === "opportunity";
  const isConfigured = Boolean(entidadeId) && Boolean(referencia);

  return isContato && isOpportunity && isConfigured;
};

// Variante para processos: aceita tipo=processo vinculado a uma
// oportunidade configurada. Reutilizada pela página /processos que
// reaproveita o mesmo componente <Activities>.
const isProcessFromConfiguredOpportunity = (activity) => {
  const tipo = normalizeText(activity?.tipo);
  const entidadeTipo = normalizeText(
    activity?.entidade_tipo || activity?.entity_type || activity?.entidadeTipo,
  );
  const entidadeId = String(
    activity?.entidade_id || activity?.entity_id || activity?.entidadeId || "",
  ).trim();
  const referencia = String(activity?.referencia || "").trim();

  const isProcesso = tipo === "processo" || tipo === "process";
  const isOpportunity =
    entidadeTipo === "oportunidade" || entidadeTipo === "opportunity";
  const isConfigured = Boolean(entidadeId) && Boolean(referencia);

  return isProcesso && isOpportunity && isConfigured;
};

const getOpportunityId = (activity) =>
  String(
    activity?.entidade_id || activity?.entity_id || activity?.entidadeId || "",
  ).trim();

const getStepReference = (activity) => {
  const direct = String(activity?.referencia || "").trim();
  if (direct) return direct;

  const tags = Array.isArray(activity?.tags) ? activity.tags : [];
  const stageTag = tags.find((tag) => {
    const normalized = normalizeText(tag);
    return (
      Boolean(normalized) && normalized !== "tarefa" && normalized !== "task"
    );
  });

  return String(stageTag || "").trim();
};

const getConditionalOutcomeLabel = (activity) => {
  const extra =
    activity?.extra && typeof activity.extra === "object" ? activity.extra : {};
  const doc =
    extra?.documento && typeof extra.documento === "object"
      ? extra.documento
      : {};
  const campos =
    doc?.campos && typeof doc.campos === "object" ? doc.campos : {};

  const rawCandidates = [
    extra?.resultado_condicional,
    extra?.decisao_condicional,
    extra?.decisaoCondicional,
    extra?.resultado,
    activity?.resultado,
    campos?.resultado,
    campos?.Resultado,
    campos?.decisao,
    campos?.decisão,
  ];

  const normalized = rawCandidates
    .map((value) => normalizeText(value))
    .find((value) => Boolean(value));

  if (!normalized) return "";
  if (["sim", "yes", "y", "true", "1", "ok"].includes(normalized)) {
    return "Sim";
  }
  if (["nao", "não", "no", "n", "false", "0", "x"].includes(normalized)) {
    return "Não";
  }
  return "";
};

const readDocFromActivity = (activity) => {
  const extra =
    activity?.extra && typeof activity.extra === "object" ? activity.extra : {};
  const doc =
    extra.documento && typeof extra.documento === "object"
      ? extra.documento
      : {};
  const camposObj =
    doc.campos && typeof doc.campos === "object" ? doc.campos : {};
  const camposArr = Object.entries(camposObj).map(([label, value]) => ({
    label,
    value: String(value ?? ""),
  }));
  return {
    tipoDocumento: String(doc.tipoDocumento || ""),
    descricao: String(doc.descricao || ""),
    campos: camposArr,
  };
};

const StepResumoInlineEditor = ({
  activity,
  hasContent,
  onSave,
  startEditing = false,
  onClose,
}) => {
  const initial = React.useMemo(
    () => readDocFromActivity(activity),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity?.id, activity?.extra],
  );

  const [isEditing, setIsEditing] = useState(Boolean(startEditing));
  const [tipoDocumento, setTipoDocumento] = useState(initial.tipoDocumento);
  const [descricao, setDescricao] = useState(initial.descricao);
  const [campos, setCampos] = useState(initial.campos);
  const [saving, setSaving] = useState(false);

  // Quando o pai aciona startEditing (clique no lápis), entra direto em
  // edição sem precisar de clique extra no "✏️ Editar resumo".
  useEffect(() => {
    if (startEditing) setIsEditing(true);
  }, [startEditing]);

  useEffect(() => {
    setTipoDocumento(initial.tipoDocumento);
    setDescricao(initial.descricao);
    setCampos(initial.campos);
  }, [initial]);

  const updateCampo = (idx, key, val) =>
    setCampos((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [key]: val } : c)),
    );
  const addCampo = () =>
    setCampos((prev) => [...prev, { label: "", value: "" }]);
  const removeCampo = (idx) =>
    setCampos((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const camposObj = {};
    campos.forEach((c) => {
      const k = String(c.label || "").trim();
      if (k) camposObj[k] = String(c.value ?? "");
    });
    const nextDoc = {
      tipoDocumento: tipoDocumento.trim(),
      descricao: descricao.trim(),
      campos: camposObj,
    };
    setSaving(true);
    const ok = await onSave(nextDoc);
    setSaving(false);
    if (ok !== false) {
      setIsEditing(false);
      if (typeof onClose === "function") onClose();
    }
  };

  const handleCancel = () => {
    setTipoDocumento(initial.tipoDocumento);
    setDescricao(initial.descricao);
    setCampos(initial.campos);
    setIsEditing(false);
    if (typeof onClose === "function") onClose();
  };

  if (!isEditing) {
    if (!hasContent) {
      return (
        <p className={styles.recordMuted}>
          Nenhuma informação salva para este passo.
        </p>
      );
    }
    return (
      <div className={styles.resumoInlineActions}>
        <button
          type="button"
          className={styles.resumoInlineEditBtn}
          onClick={() => setIsEditing(true)}
        >
          ✏️ Editar resumo
        </button>
      </div>
    );
  }

  return (
    <div className={styles.resumoInlineForm}>
      <div className={styles.resumoInlineRow}>
        <label
          className={styles.resumoInlineLabel}
          htmlFor={`tipo-${activity.id}`}
        >
          Tipo do documento
        </label>
        <input
          id={`tipo-${activity.id}`}
          type="text"
          className={styles.resumoInlineInput}
          value={tipoDocumento}
          onChange={(e) => setTipoDocumento(e.target.value)}
          placeholder="Ex.: Pedido de Compra"
        />
      </div>
      <div className={styles.resumoInlineRow}>
        <label
          className={styles.resumoInlineLabel}
          htmlFor={`desc-${activity.id}`}
        >
          Descrição
        </label>
        <textarea
          id={`desc-${activity.id}`}
          className={styles.resumoInlineTextarea}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
          placeholder="Descreva o que foi feito ou precisa ser feito neste passo..."
        />
      </div>

      <div className={styles.resumoInlineFieldsHeader}>
        <span>Campos do resumo</span>
        <button
          type="button"
          className={styles.resumoInlineAddBtn}
          onClick={addCampo}
        >
          + Adicionar campo
        </button>
      </div>
      {campos.length === 0 ? (
        <p className={styles.recordMuted}>
          Nenhum campo. Clique em "+ Adicionar campo".
        </p>
      ) : (
        <div className={styles.resumoInlineFields}>
          {campos.map((c, idx) => (
            <div
              key={`campo-row-${activity.id}-${idx}`}
              className={styles.resumoInlineFieldRow}
            >
              <input
                type="text"
                className={styles.resumoInlineInput}
                placeholder="Rótulo (ex.: Fornecedor)"
                value={c.label}
                onChange={(e) => updateCampo(idx, "label", e.target.value)}
              />
              <input
                type="text"
                className={styles.resumoInlineInput}
                placeholder="Valor"
                value={c.value}
                onChange={(e) => updateCampo(idx, "value", e.target.value)}
              />
              <button
                type="button"
                className={styles.resumoInlineRemoveBtn}
                onClick={() => removeCampo(idx)}
                title="Remover campo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.resumoInlineActions}>
        {hasContent ? (
          <button
            type="button"
            className={styles.resumoInlineCancelBtn}
            onClick={handleCancel}
            disabled={saving}
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          className={styles.resumoInlineSaveBtn}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Salvando..." : "💾 Salvar resumo"}
        </button>
      </div>
    </div>
  );
};

const CreateActivityModal = ({
  show,
  onClose,
  onSuccess,
  entityType = "",
  entityId = "",
  editingActivity = null,
  inline = false,
}) => {
  const initialFormData = {
    titulo: "",
    referencia: "",
    descricao: "",
    tipo: "Nota",
    data_atividade: new Date().toISOString().slice(0, 16),
    responsavel: "",
    status: "Planejado",
    resultado: "",
    proximos_passos: "",
    duracao_minutos: "",
    local: "",
    participantes: "",
    tags: "",
  };

  const [formData, setFormData] = useState({
    ...initialFormData,
  });
  const [labels, setLabel] = useCustomLabels(
    "bp_labels_atividades",
    ACTIVITY_LABEL_DEFAULTS,
  );
  const [req, toggleRequired] = useCustomRequired(
    "bp_required_atividades",
    ACTIVITY_REQUIRED_DEFAULTS,
  );
  const [extraFields, addExtraField, removeExtraField, updateExtraField] =
    useExtraFields("bp_extra_fields_atividades");
  const [extraValues, setExtraValues] = useState({});
  // Em modo edição, por padrão exibimos somente os campos que já têm
  // conteúdo na atividade — para que o modal reflita o que realmente
  // aparece no card. Esse toggle permite revelar os campos vazios caso
  // o usuário queira preenchê-los.
  const [showAllFields, setShowAllFields] = useState(false);

  const isEditMode = Boolean(editingActivity?.id);

  useEffect(() => {
    if (!show) return;
    // Sempre começamos compactos ao reabrir o modal
    setShowAllFields(false);

    if (isEditMode) {
      setFormData({
        titulo: editingActivity?.titulo || "",
        referencia: editingActivity?.referencia || "",
        descricao: editingActivity?.descricao || "",
        tipo: editingActivity?.tipo || "",
        data_atividade: String(editingActivity?.data_atividade || "").slice(
          0,
          16,
        ),
        responsavel: editingActivity?.responsavel || "",
        status: editingActivity?.status || "",
        resultado: editingActivity?.resultado || "",
        proximos_passos: editingActivity?.proximos_passos || "",
        duracao_minutos:
          editingActivity?.duracao_minutos !== undefined &&
          editingActivity?.duracao_minutos !== null
            ? String(editingActivity?.duracao_minutos)
            : "",
        local: editingActivity?.local || "",
        participantes: Array.isArray(editingActivity?.participantes)
          ? editingActivity.participantes.join(", ")
          : "",
        tags: Array.isArray(editingActivity?.tags)
          ? editingActivity.tags.join(", ")
          : "",
      });
      return;
    }

    setFormData({ ...initialFormData });
  }, [show, isEditMode, editingActivity]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Em modo edição, considera "com conteúdo" qualquer campo cuja string
  // não esteja vazia. Em modo criação, todos os campos sempre aparecem.
  const fieldHasContent = (key) => {
    const v = formData[key];
    if (v === undefined || v === null) return false;
    return String(v).trim() !== "";
  };
  const showField = (key) =>
    !isEditMode || showAllFields || fieldHasContent(key);
  const EDIT_FIELD_KEYS = [
    "tipo",
    "status",
    "titulo",
    "referencia",
    "descricao",
    "data_atividade",
    "responsavel",
    "duracao_minutos",
    "local",
    "participantes",
    "resultado",
    "proximos_passos",
    "tags",
  ];
  const hiddenFieldsCount =
    isEditMode && !showAllFields
      ? EDIT_FIELD_KEYS.filter((k) => !fieldHasContent(k)).length
      : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isEditMode
        ? `${API_URL}/api/activities/${editingActivity.id}`
        : `${API_URL}/api/activities`;

      const response = await fetch(endpoint, {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          referencia: formData.referencia || null,
          entidade_tipo: entityType || null,
          entidade_id: entityId || null,
          usuario_criador: localStorage.getItem("user_id") || "sistema",
          duracao_minutos: formData.duracao_minutos
            ? Number.parseInt(formData.duracao_minutos, 10)
            : null,
          participantes: formData.participantes
            ? formData.participantes.split(",").map((p) => p.trim())
            : [],
          tags: formData.tags
            ? formData.tags.split(",").map((t) => t.trim())
            : [],
          extra: extraFields.reduce((acc, f) => {
            acc[f.label] = extraValues[f.id] || "";
            return acc;
          }, {}),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setFormData({ ...initialFormData });
        setExtraValues({});
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error("Erro ao criar atividade:", error);
    }
  };

  if (!show) return null;

  const headerNode = (
    <div className={styles.modalHeader}>
      <h3>
        {isEditMode ? (
          <span>Editar Atividade</span>
        ) : (
          <EditableLabel
            value={labels.titulo_modal}
            onChange={(v) => setLabel("titulo_modal", v)}
          />
        )}
      </h3>
      <button type="button" onClick={onClose} className={styles.closeBtn}>
        ✕
      </button>
    </div>
  );

  const formNode = (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      {isEditMode && hiddenFieldsCount > 0 ? (
        <div
          style={{
            marginBottom: "0.75rem",
            fontSize: "0.85rem",
            color: "#64748b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <span>Mostrando apenas os campos preenchidos desta atividade.</span>
          <button
            type="button"
            onClick={() => setShowAllFields(true)}
            style={{
              background: "transparent",
              border: "1px dashed #94a3b8",
              color: "#475569",
              borderRadius: "6px",
              padding: "0.25rem 0.6rem",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            + Mostrar {hiddenFieldsCount} campo(s) vazio(s)
          </button>
        </div>
      ) : null}
      {isEditMode && showAllFields ? (
        <div
          style={{
            marginBottom: "0.75rem",
            fontSize: "0.85rem",
            color: "#64748b",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() => setShowAllFields(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              fontSize: "0.8rem",
              textDecoration: "underline",
            }}
          >
            Ocultar campos vazios
          </button>
        </div>
      ) : null}

      {(showField("tipo") || showField("status")) && (
        <div className={styles.formRow}>
          {showField("tipo") && (
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.tipo}
                  onChange={(v) => setLabel("tipo", v)}
                  required={req.tipo}
                  onToggleRequired={() => toggleRequired("tipo")}
                />
              </label>
              <input
                type="text"
                name="tipo"
                value={formData.tipo}
                onChange={handleChange}
                placeholder="Ex: Nota, Ligação, Reunião..."
                required={req.tipo}
              />
            </div>
          )}
          {showField("status") && (
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.status}
                  onChange={(v) => setLabel("status", v)}
                  required={req.status}
                  onToggleRequired={() => toggleRequired("status")}
                />
              </label>
              <input
                type="text"
                name="status"
                value={formData.status}
                onChange={handleChange}
                placeholder="Ex: Planejado, Concluído..."
                required={req.status}
              />
            </div>
          )}
        </div>
      )}

      {showField("titulo") && (
        <div className={styles.formGroup}>
          <label>
            <FieldLabel
              value={labels.titulo}
              onChange={(v) => setLabel("titulo", v)}
              required={req.titulo}
              onToggleRequired={() => toggleRequired("titulo")}
            />
          </label>
          <input
            type="text"
            name="titulo"
            value={formData.titulo}
            onChange={handleChange}
            required={req.titulo}
            placeholder="Assunto da atividade"
            autoFocus
          />
        </div>
      )}

      {showField("referencia") && (
        <div className={styles.formGroup}>
          <label>
            <FieldLabel
              value={labels.referencia}
              onChange={(v) => setLabel("referencia", v)}
              required={req.referencia}
              onToggleRequired={() => toggleRequired("referencia")}
            />
          </label>
          <input
            type="text"
            name="referencia"
            value={formData.referencia}
            onChange={handleChange}
            placeholder="Ex: documento ID, link, referência externa"
            required={req.referencia}
          />
        </div>
      )}

      {showField("descricao") && (
        <div className={styles.formGroup}>
          <label>
            <FieldLabel
              value={labels.descricao}
              onChange={(v) => setLabel("descricao", v)}
              required={req.descricao}
              onToggleRequired={() => toggleRequired("descricao")}
            />
          </label>
          <textarea
            name="descricao"
            value={formData.descricao}
            onChange={handleChange}
            placeholder="Detalhes da atividade"
            rows="3"
            required={req.descricao}
          />
        </div>
      )}

      {(showField("data_atividade") || showField("responsavel")) && (
        <div className={styles.formRow}>
          {showField("data_atividade") && (
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.data_atividade}
                  onChange={(v) => setLabel("data_atividade", v)}
                  required={req.data_atividade}
                  onToggleRequired={() => toggleRequired("data_atividade")}
                />
              </label>
              <input
                type="datetime-local"
                name="data_atividade"
                value={formData.data_atividade}
                onChange={handleChange}
                required={req.data_atividade}
              />
            </div>
          )}
          {showField("responsavel") && (
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.responsavel}
                  onChange={(v) => setLabel("responsavel", v)}
                  required={req.responsavel}
                  onToggleRequired={() => toggleRequired("responsavel")}
                />
              </label>
              <input
                type="text"
                name="responsavel"
                value={formData.responsavel}
                onChange={handleChange}
                placeholder="Nome do responsável"
                required={req.responsavel}
              />
            </div>
          )}
        </div>
      )}

      {(showField("duracao_minutos") || showField("local")) && (
        <div className={styles.formRow}>
          {showField("duracao_minutos") && (
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.duracao_minutos}
                  onChange={(v) => setLabel("duracao_minutos", v)}
                  required={req.duracao_minutos}
                  onToggleRequired={() => toggleRequired("duracao_minutos")}
                />
              </label>
              <input
                type="number"
                name="duracao_minutos"
                value={formData.duracao_minutos}
                onChange={handleChange}
                placeholder="0"
                min="0"
                required={req.duracao_minutos}
              />
            </div>
          )}
          {showField("local") && (
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.local}
                  onChange={(v) => setLabel("local", v)}
                  required={req.local}
                  onToggleRequired={() => toggleRequired("local")}
                />
              </label>
              <input
                type="text"
                name="local"
                value={formData.local}
                onChange={handleChange}
                placeholder="Sala ou URL"
                required={req.local}
              />
            </div>
          )}
        </div>
      )}

      {showField("participantes") && (
        <div className={styles.formGroup}>
          <label>
            <FieldLabel
              value={labels.participantes}
              onChange={(v) => setLabel("participantes", v)}
              required={req.participantes}
              onToggleRequired={() => toggleRequired("participantes")}
            />
          </label>
          <input
            type="text"
            name="participantes"
            value={formData.participantes}
            onChange={handleChange}
            placeholder="João, Maria, Pedro"
            required={req.participantes}
          />
        </div>
      )}

      {showField("resultado") && (
        <div className={styles.formGroup}>
          <label>
            <FieldLabel
              value={labels.resultado}
              onChange={(v) => setLabel("resultado", v)}
              required={req.resultado}
              onToggleRequired={() => toggleRequired("resultado")}
            />
          </label>
          <textarea
            name="resultado"
            value={formData.resultado}
            onChange={handleChange}
            placeholder="O que foi discutido/decidido"
            rows="2"
            required={req.resultado}
          />
        </div>
      )}

      {showField("proximos_passos") && (
        <div className={styles.formGroup}>
          <label>
            <FieldLabel
              value={labels.proximos_passos}
              onChange={(v) => setLabel("proximos_passos", v)}
              required={req.proximos_passos}
              onToggleRequired={() => toggleRequired("proximos_passos")}
            />
          </label>
          <textarea
            name="proximos_passos"
            value={formData.proximos_passos}
            onChange={handleChange}
            placeholder="O que fazer depois"
            rows="2"
            required={req.proximos_passos}
          />
        </div>
      )}

      {showField("tags") && (
        <div className={styles.formGroup}>
          <label>
            <FieldLabel
              value={labels.tags}
              onChange={(v) => setLabel("tags", v)}
              required={req.tags}
              onToggleRequired={() => toggleRequired("tags")}
            />
          </label>
          <input
            type="text"
            name="tags"
            value={formData.tags}
            onChange={handleChange}
            placeholder="importante, urgente, follow-up"
            required={req.tags}
          />
        </div>
      )}

      {extraFields.length > 0 && (
        <div className={styles.extraFieldsSection}>
          {extraFields.map((field) => (
            <div key={field.id} className={styles.formGroup}>
              <label>
                <div className={styles.extraFieldHeader}>
                  <FieldLabel
                    value={field.label}
                    onChange={(v) => updateExtraField(field.id, { label: v })}
                    required={field.required}
                    onToggleRequired={() =>
                      updateExtraField(field.id, {
                        required: !field.required,
                      })
                    }
                  />
                  <button
                    type="button"
                    className={styles.removeFieldBtn}
                    onClick={() => removeExtraField(field.id)}
                    title="Remover campo"
                  >
                    ✕
                  </button>
                </div>
              </label>
              <input
                type="text"
                value={extraValues[field.id] || ""}
                onChange={(e) =>
                  setExtraValues((prev) => ({
                    ...prev,
                    [field.id]: e.target.value,
                  }))
                }
                required={field.required}
                placeholder="Valor..."
              />
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={styles.addFieldBtn}
        onClick={addExtraField}
      >
        + Adicionar campo
      </button>

      <div className={styles.modalFooter}>
        <button type="button" onClick={onClose} className={styles.btnCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.btnSave}>
          {isEditMode ? "Salvar alterações" : "Criar Atividade"}
        </button>
      </div>
    </form>
  );

  if (inline) {
    return (
      <div className={styles.inlineEditPanel}>
        {headerNode}
        {formNode}
      </div>
    );
  }

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        {headerNode}
        {formNode}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Editores inline para os 5 passos do card de tarefa.
// Todos seguem o mesmo contrato: `value` (array), `onChange(newArray)`,
// `onSave()` e `onCancel()`. A grade visual usa as classes recordGrid/list.
// ---------------------------------------------------------------------------

export const InlineListEditor = ({
  title,
  icon,
  items,
  columns,
  onChange,
  onSave,
  onCancel,
  saving,
  blankRow,
}) => {
  const handleField = (idx, key, val) => {
    const next = items.map((row, i) =>
      i === idx ? { ...row, [key]: val } : row,
    );
    onChange(next);
  };
  const handleRemove = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const handleAdd = () => {
    onChange([...(items || []), { ...(blankRow || {}) }]);
  };

  return (
    <div className={styles.inlineStepEditor}>
      <div className={styles.inlineStepEditorHeader}>
        <strong>
          {icon} Editar {title}
        </strong>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Salvando…" : "💾 Salvar"}
          </button>
        </div>
      </div>

      {(items || []).length === 0 ? (
        <p className={styles.recordMuted} style={{ margin: "0.5rem 0" }}>
          Nenhum item. Clique em “+ Adicionar” para começar.
        </p>
      ) : null}

      {(items || []).map((row, idx) => (
        <div
          key={`inline-row-${idx}-${row?.id || row?.nome || row?.titulo || ""}`}
          className={styles.inlineStepEditorRow}
        >
          <div className={styles.inlineStepEditorFields}>
            {columns.map((col) => (
              <label
                key={`col-${idx}-${col.key}`}
                className={styles.inlineStepEditorField}
              >
                <span>{col.label}</span>
                {col.type === "textarea" ? (
                  <textarea
                    rows={2}
                    value={row?.[col.key] ?? ""}
                    onChange={(e) => handleField(idx, col.key, e.target.value)}
                    placeholder={col.placeholder || ""}
                  />
                ) : col.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={Boolean(row?.[col.key])}
                    onChange={(e) =>
                      handleField(idx, col.key, e.target.checked)
                    }
                  />
                ) : (
                  <input
                    type={col.type || "text"}
                    value={row?.[col.key] ?? ""}
                    onChange={(e) => handleField(idx, col.key, e.target.value)}
                    placeholder={col.placeholder || ""}
                  />
                )}
              </label>
            ))}
          </div>
          <button
            type="button"
            className={styles.inlineStepEditorRemove}
            onClick={() => handleRemove(idx)}
            title="Remover"
          >
            ✕
          </button>
        </div>
      ))}

      <button type="button" className={styles.addFieldBtn} onClick={handleAdd}>
        + Adicionar
      </button>
    </div>
  );
};

export const InlineAnexosEditor = ({
  anexos,
  onChange,
  onSave,
  onCancel,
  saving,
}) => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/api/uploads`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data?.url || data?.filename)) {
        onChange([
          ...(anexos || []),
          {
            id: data.id || `anexo-${Date.now()}`,
            nome: data.filename || file.name,
            url: data.url || `/uploads/${data.filename || file.name}`,
          },
        ]);
      } else {
        alert("Falha no upload do anexo.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Erro no upload do anexo.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRename = (idx, nome) => {
    onChange(anexos.map((a, i) => (i === idx ? { ...a, nome } : a)));
  };
  const handleRemove = (idx) => {
    onChange(anexos.filter((_, i) => i !== idx));
  };

  return (
    <div className={styles.inlineStepEditor}>
      <div className={styles.inlineStepEditorHeader}>
        <strong>📎 Editar Anexos</strong>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Salvando…" : "💾 Salvar"}
          </button>
        </div>
      </div>

      <label
        className={styles.addFieldBtn}
        style={{ display: "inline-block", cursor: "pointer" }}
      >
        {uploading ? "⏳ Enviando…" : "⬆️ Fazer upload"}
        <input
          type="file"
          style={{ display: "none" }}
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>

      {(anexos || []).length === 0 ? (
        <p className={styles.recordMuted} style={{ margin: "0.5rem 0" }}>
          Nenhum anexo. Use o botão acima para enviar arquivos.
        </p>
      ) : null}

      {(anexos || []).map((a, idx) => (
        <div
          key={`anexo-edit-${a.id || a.url || idx}`}
          className={styles.inlineStepEditorRow}
        >
          <div className={styles.inlineStepEditorFields}>
            <label className={styles.inlineStepEditorField}>
              <span>Nome</span>
              <input
                type="text"
                value={a.nome || ""}
                onChange={(e) => handleRename(idx, e.target.value)}
              />
            </label>
            <label className={styles.inlineStepEditorField}>
              <span>URL</span>
              <input type="text" value={a.url || ""} readOnly />
            </label>
          </div>
          <button
            type="button"
            className={styles.inlineStepEditorRemove}
            onClick={() => handleRemove(idx)}
            title="Remover anexo"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

// Wrapper que mantém drafts locais para os editores inline dos passos
// 2 (Atores), 3 (Atributos), 4 (Indicadores) e 5 (Anexos). Cada um pode
// ser editado/salvo de forma independente.
export const ExpandedInlineEditors = ({
  activity,
  recordOpp,
  stageLabel,
  anexos: anexosProp,
  onSaveOpportunity,
  onSaveAnexos,
}) => {
  const normalizeStage = (v) =>
    String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const stageKey = normalizeStage(stageLabel);
  const isUnscopedEntry = (entry) => {
    const candidates = [entry?.etapa, entry?.stageLabel, entry?.referencia];
    return candidates.every((c) => c === undefined || c === null || c === "");
  };

  const isCurrentStageEntry = (entry) => {
    if (!stageKey) return true;
    const candidates = [entry?.etapa, entry?.stageLabel, entry?.referencia];
    return candidates.some((c) => normalizeStage(c) === stageKey);
  };

  const stampStage = (entry) => {
    if (!stageLabel) return entry;
    return { ...entry, etapa: String(stageLabel).trim() };
  };

  const scopedList = (list) => {
    const source = Array.isArray(list) ? list : [];
    if (!stageKey) return source;

    const fromCurrentStage = source.filter(isCurrentStageEntry);
    if (fromCurrentStage.length > 0) return fromCurrentStage;

    return source.filter(isUnscopedEntry);
  };

  const [savingStep, setSavingStep] = useState(null);
  const [draftContacts, setDraftContacts] = useState(() =>
    scopedList(recordOpp?.contacts),
  );
  const [draftProducts, setDraftProducts] = useState(() =>
    scopedList(recordOpp?.products),
  );
  const [draftQuotes, setDraftQuotes] = useState(() =>
    scopedList(recordOpp?.quotes),
  );
  const [draftAnexos, setDraftAnexos] = useState(() =>
    Array.isArray(anexosProp) ? [...anexosProp] : [],
  );

  // Ressincroniza drafts quando a oportunidade/atividade subjacente muda
  // (ex.: após salvar outra seção e o cache atualizar).
  useEffect(() => {
    setDraftContacts(scopedList(recordOpp?.contacts));
    setDraftProducts(scopedList(recordOpp?.products));
    setDraftQuotes(scopedList(recordOpp?.quotes));
  }, [
    recordOpp?.id,
    recordOpp?.contacts,
    recordOpp?.products,
    recordOpp?.quotes,
    stageKey,
  ]);

  useEffect(() => {
    setDraftAnexos(Array.isArray(anexosProp) ? [...anexosProp] : []);
  }, [anexosProp]);

  const saveOppList = async (stepKey, key, list) => {
    if (!recordOpp?.id) {
      alert("Atividade sem oportunidade vinculada.");
      return;
    }
    setSavingStep(stepKey);
    const existing = Array.isArray(recordOpp?.[key]) ? recordOpp[key] : [];
    let nextList = Array.isArray(list) ? [...list] : [];

    if (stageKey) {
      const keepFromOtherStages = existing.filter((entry) => {
        const candidates = [entry?.etapa, entry?.stageLabel, entry?.referencia];
        const isUnscoped = candidates.every(
          (c) => c === undefined || c === null || c === "",
        );
        if (isUnscoped) return false;
        return !candidates.some((c) => normalizeStage(c) === stageKey);
      });
      nextList = [...keepFromOtherStages, ...nextList.map(stampStage)];
    }

    await onSaveOpportunity({ ...recordOpp, [key]: nextList });
    setSavingStep(null);
  };

  const saveAnexos = async () => {
    setSavingStep("anexos");
    await onSaveAnexos(activity, draftAnexos);
    setSavingStep(null);
  };

  const resetContacts = () =>
    setDraftContacts(
      Array.isArray(recordOpp?.contacts) ? [...recordOpp.contacts] : [],
    );
  const resetProducts = () =>
    setDraftProducts(
      Array.isArray(recordOpp?.products) ? [...recordOpp.products] : [],
    );
  const resetQuotes = () =>
    setDraftQuotes(
      Array.isArray(recordOpp?.quotes) ? [...recordOpp.quotes] : [],
    );
  const resetAnexos = () =>
    setDraftAnexos(Array.isArray(anexosProp) ? [...anexosProp] : []);

  const stageHint = stageLabel ? ` (etapa atual: ${stageLabel})` : "";

  return (
    <div className={styles.inlineStepEditorList}>
      <div className={styles.inlineStepEditorActions}>
        <strong className={styles.inlineStepEditorTitle}>
          Editar passos da tarefa{stageHint}
        </strong>
      </div>

      <InlineListEditor
        title="Atores Envolvidos"
        icon="👥"
        items={draftContacts}
        onChange={setDraftContacts}
        onSave={() => saveOppList("contatos", "contacts", draftContacts)}
        onCancel={resetContacts}
        saving={savingStep === "contatos"}
        blankRow={{
          nome: "",
          cargo: "",
          email: "",
          telefone: "",
          isPrimary: false,
        }}
        columns={[
          { key: "nome", label: "Nome" },
          { key: "cargo", label: "Cargo" },
          { key: "email", label: "E-mail", type: "email" },
          { key: "telefone", label: "Telefone" },
          { key: "isPrimary", label: "Principal", type: "checkbox" },
        ]}
      />

      <InlineListEditor
        title="Atributos do Processo"
        icon="📦"
        items={draftProducts}
        onChange={setDraftProducts}
        onSave={() => saveOppList("produtos", "products", draftProducts)}
        onCancel={resetProducts}
        saving={savingStep === "produtos"}
        blankRow={{
          nome: "",
          quantidade: "",
          unidade: "",
          valorUnitario: "",
          justificativa: "",
        }}
        columns={[
          { key: "nome", label: "Nome" },
          { key: "quantidade", label: "Quantidade", type: "number" },
          { key: "unidade", label: "Unidade" },
          {
            key: "valorUnitario",
            label: "Valor unitário",
            type: "number",
          },
          {
            key: "justificativa",
            label: "Justificativa",
            type: "textarea",
          },
        ]}
      />

      <InlineListEditor
        title="Indicadores & SLA"
        icon="📊"
        items={draftQuotes}
        onChange={setDraftQuotes}
        onSave={() => saveOppList("cotacoes", "quotes", draftQuotes)}
        onCancel={resetQuotes}
        saving={savingStep === "cotacoes"}
        blankRow={{
          titulo: "",
          fornecedor: "",
          status: "rascunho",
          validade: "",
          observacoes: "",
        }}
        columns={[
          { key: "titulo", label: "Título" },
          { key: "fornecedor", label: "Fornecedor" },
          { key: "status", label: "Status" },
          { key: "validade", label: "Validade" },
          { key: "observacoes", label: "Observações", type: "textarea" },
        ]}
      />

      <InlineAnexosEditor
        anexos={draftAnexos}
        onChange={setDraftAnexos}
        onSave={saveAnexos}
        onCancel={resetAnexos}
        saving={savingStep === "anexos"}
      />
    </div>
  );
};

const Activities = ({
  entityType = "",
  entityId = "",
  // Quando definido, sobrescreve o filtro padrão (`task`). Aceita
  // "task", "condicional", "contato" ou "processo" para reaproveitar
  // a mesma página sem duplicar código.
  typeFilter = "task",
  pageTitle = "⏱️ Timeline de Tarefas",
  pageSubtitle = "Exibe somente tarefas configuradas e vinculadas a oportunidades",
  newButtonLabel = "Nova Tarefa",
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  // Edição inline (sem modal): id da atividade em modo edição.
  const [inlineEditingId, setInlineEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [groupByOpp, setGroupByOpp] = useState(false);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [opportunitiesById, setOpportunitiesById] = useState({});
  const [loadingOpps, setLoadingOpps] = useState(false);
  const [oppsLoaded, setOppsLoaded] = useState(false);
  // Modal de gráficos sincronizados ao anexo (aberto a partir do card de
  // anexo no painel salvo de /tarefas).
  const [anexoGraphsModal, setAnexoGraphsModal] = useState(null);

  const moduleMeta = React.useMemo(() => {
    if (typeFilter === "contato") {
      return {
        singular: "Contato",
        timelineTitle: "Timeline de Contatos",
        fileSlug: "contatos",
      };
    }
    if (typeFilter === "condicional") {
      return {
        singular: "Condição",
        timelineTitle: "Timeline de Condições",
        fileSlug: "condicoes",
      };
    }
    if (typeFilter === "processo") {
      return {
        singular: "Processo",
        timelineTitle: "Timeline de Processos",
        fileSlug: "processos",
      };
    }
    return {
      singular: "Tarefa",
      timelineTitle: "Timeline de Tarefas",
      fileSlug: "tarefas",
    };
  }, [typeFilter]);

  useEffect(() => {
    fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, typeFilter]);

  useEffect(() => {
    if (location.state?.openCreate) {
      setEditingActivity(null);
      setShowModal(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);
  const fetchActivities = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/activities?limit=100`;
      if (entityType && entityId) {
        url = `${API_URL}/api/activities/entity/${entityType}/${entityId}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      const rows = Array.isArray(data.activities) ? data.activities : [];
      let predicate;
      if (typeFilter === "condicional") {
        predicate = isConditionalFromConfiguredOpportunity;
      } else if (typeFilter === "contato") {
        predicate = isContactFromConfiguredOpportunity;
      } else if (typeFilter === "processo") {
        predicate = isProcessFromConfiguredOpportunity;
      } else {
        predicate = isTaskFromConfiguredOpportunity;
      }
      const filtered = rows.filter(predicate);
      setActivities(filtered);
    } catch (error) {
      console.error("Erro ao buscar atividades:", error);
    }
    setLoading(false);
  };

  const handleDeleteActivity = async (activityId) => {
    if (!globalThis.confirm("Deletar esta atividade?")) return;

    try {
      const response = await fetch(`${API_URL}/api/activities/${activityId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchActivities();
      }
    } catch (error) {
      console.error("Erro ao deletar atividade:", error);
      alert("Erro ao deletar atividade");
    }
  };

  const handleEditActivity = (activity) => {
    // Edição inline no próprio card (não abre modal).
    if (!activity?.id) return;
    setInlineEditingId(activity.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(activity.id);
      return next;
    });
  };

  const handleCloseInlineEdit = () => {
    setInlineEditingId(null);
  };

  const handleSaveStepResumo = async (activity, nextDoc) => {
    try {
      const prevExtra =
        activity?.extra && typeof activity.extra === "object"
          ? activity.extra
          : {};
      const prevDoc =
        prevExtra.documento && typeof prevExtra.documento === "object"
          ? prevExtra.documento
          : {};
      // Merge com documento anterior para preservar anexos, gráficos, seções
      // e demais metadados que o editor inline não modifica.
      const payload = {
        ...activity,
        extra: { ...prevExtra, documento: { ...prevDoc, ...nextDoc } },
      };
      const response = await fetch(`${API_URL}/api/activities/${activity.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && (data?.success ?? true)) {
        setActivities((prev) =>
          prev.map((a) =>
            a.id === activity.id ? { ...a, extra: payload.extra } : a,
          ),
        );
        return true;
      }
      alert(data?.detail || "Não foi possível salvar o resumo.");
      return false;
    } catch (err) {
      console.error("Erro ao salvar resumo do passo:", err);
      alert("Erro ao salvar resumo do passo.");
      return false;
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingActivity(null);
  };

  // Persiste alterações em uma oportunidade (atores/atributos/indicadores)
  // e sincroniza o cache local opportunitiesById.
  const handleSaveOpportunity = async (opp) => {
    if (!opp?.id) return false;
    try {
      const token = getAuthToken();
      await updateOpportunityById({
        opportunityId: opp.id,
        payload: opp,
        token,
      });
      setOpportunitiesById((prev) => ({ ...prev, [String(opp.id)]: opp }));
      return true;
    } catch (err) {
      console.error("Erro ao salvar oportunidade:", err);
      alert("Erro ao salvar a oportunidade.");
      return false;
    }
  };

  // Persiste somente o array de anexos dentro de activity.extra.documento.
  const handleSaveAnexos = async (activity, nextAnexos) => {
    try {
      const prevExtra =
        activity?.extra && typeof activity.extra === "object"
          ? activity.extra
          : {};
      const prevDoc =
        prevExtra.documento && typeof prevExtra.documento === "object"
          ? prevExtra.documento
          : {};
      const payload = {
        ...activity,
        extra: {
          ...prevExtra,
          documento: { ...prevDoc, anexos: nextAnexos },
        },
      };
      const response = await fetch(`${API_URL}/api/activities/${activity.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && (data?.success ?? true)) {
        setActivities((prev) =>
          prev.map((a) =>
            a.id === activity.id ? { ...a, extra: payload.extra } : a,
          ),
        );
        return true;
      }
      alert(data?.detail || "Não foi possível salvar os anexos.");
      return false;
    } catch (err) {
      console.error("Erro ao salvar anexos:", err);
      alert("Erro ao salvar anexos.");
      return false;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR");
  };

  const stats = React.useMemo(() => {
    const counts = {
      total: activities.length,
      planejado: 0,
      concluido: 0,
      cancelado: 0,
    };
    activities.forEach((a) => {
      const s = normalizeText(a?.status);
      if (s === "planejado") counts.planejado += 1;
      else if (s === "concluido") counts.concluido += 1;
      else if (s === "cancelado") counts.cancelado += 1;
    });
    return counts;
  }, [activities]);

  const filteredActivities = React.useMemo(() => {
    const term = normalizeText(searchTerm);
    return activities.filter((a) => {
      if (
        statusFilter !== "todos" &&
        normalizeText(a?.status) !== statusFilter
      ) {
        return false;
      }
      if (!term) return true;
      const haystack = [
        a?.titulo,
        a?.descricao,
        a?.responsavel,
        getStepReference(a),
        getOpportunityId(a),
        ...(Array.isArray(a?.tags) ? a.tags : []),
      ]
        .map((v) => normalizeText(v))
        .join(" ");
      return haystack.includes(term);
    });
  }, [activities, searchTerm, statusFilter]);

  const groupedActivities = React.useMemo(() => {
    if (!groupByOpp) return null;
    const groups = new Map();
    filteredActivities.forEach((a) => {
      const oppId = getOpportunityId(a) || "—";
      if (!groups.has(oppId)) groups.set(oppId, []);
      groups.get(oppId).push(a);
    });
    return Array.from(groups.entries());
  }, [filteredActivities, groupByOpp]);

  const loadOpportunitiesOnce = React.useCallback(async () => {
    if (oppsLoaded || loadingOpps) return;
    setLoadingOpps(true);
    try {
      const token = getAuthToken();
      const res = await fetchOpportunitiesPage({
        page: 1,
        limit: 500,
        token,
      });
      const rows = Array.isArray(res?.data) ? res.data : [];
      const map = {};
      rows.forEach((opp) => {
        if (opp?.id !== undefined && opp?.id !== null) {
          map[String(opp.id)] = opp;
        }
      });
      setOpportunitiesById(map);
      setOppsLoaded(true);
    } catch (error) {
      console.error("Erro ao carregar oportunidades para registro:", error);
    }
    setLoadingOpps(false);
  }, [oppsLoaded, loadingOpps]);

  // Auto-load opportunities once activities arrive so the inline summary
  // strip (pipeline / progress / cliente / valor) appears without needing
  // to expand each card.
  useEffect(() => {
    if (activities.length > 0 && !oppsLoaded && !loadingOpps) {
      loadOpportunitiesOnce();
    }
  }, [activities, oppsLoaded, loadingOpps, loadOpportunitiesOnce]);

  const toggleExpanded = React.useCallback(
    (activityId) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(activityId)) {
          next.delete(activityId);
        } else {
          next.add(activityId);
          loadOpportunitiesOnce();
        }
        return next;
      });
    },
    [loadOpportunitiesOnce],
  );

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const formatBrCurrency = (value) => {
    const number = Number.parseFloat(String(value ?? "0").replace(",", "."));
    if (Number.isNaN(number)) return "R$ 0,00";
    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const buildActivityRecordHtml = React.useCallback(
    (activity) => {
      const oppId = getOpportunityId(activity);
      const opp = oppId ? opportunitiesById[String(oppId)] : null;
      const stepRef = getStepReference(activity);
      const extra =
        activity?.extra && typeof activity.extra === "object"
          ? activity.extra
          : {};
      const stepDoc =
        extra.documento && typeof extra.documento === "object"
          ? extra.documento
          : null;

      const normalizeStage = (v) =>
        String(v || "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

      const stageLabel = String(
        stepDoc?.stageLabel ||
          stepDoc?.etapa?.nome ||
          extra?.stage_label ||
          stepDoc?.referencia ||
          "",
      ).trim();
      const stageKey = normalizeStage(stageLabel);
      const getStageCandidates = (entry) => [
        entry?.etapa,
        entry?.stageLabel,
        entry?.referencia,
      ];
      const isUnscopedEntry = (entry) =>
        getStageCandidates(entry).every(
          (c) => c === undefined || c === null || c === "",
        );
      const isScopedToCurrentStage = (entry) =>
        getStageCandidates(entry).some((c) => normalizeStage(c) === stageKey);
      const pickEntriesForStage = (items) => {
        const all = Array.isArray(items) ? items : [];
        if (!stageKey) return all;
        const scoped = all.filter(isScopedToCurrentStage);
        if (scoped.length > 0) return scoped;
        // Compatibilidade com dados legados sem `etapa`.
        return all.filter(isUnscopedEntry);
      };

      const stageProducts = pickEntriesForStage(opp?.products);
      const stageQuotes = pickEntriesForStage(opp?.quotes);
      const stageContacts = pickEntriesForStage(opp?.contacts);

      const stepSummaryHtml = (() => {
        const campos =
          stepDoc?.campos && typeof stepDoc.campos === "object"
            ? stepDoc.campos
            : null;
        const secoes = Array.isArray(stepDoc?.secoes) ? stepDoc.secoes : [];
        const fieldEntries = campos ? Object.entries(campos) : [];
        const hasContent =
          fieldEntries.length > 0 ||
          secoes.length > 0 ||
          Boolean(stepDoc?.descricao);
        if (!hasContent) {
          return "<p class='muted'>Sem resumo configurado para este passo.</p>";
        }
        const descHtml = stepDoc?.descricao
          ? `<p>${escapeHtml(stepDoc.descricao)}</p>`
          : "";
        const fieldRows = fieldEntries
          .map(
            ([label, value]) =>
              `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value ?? "") || "-")}</td></tr>`,
          )
          .join("");
        const fieldsTable = fieldRows
          ? `<table class="tbl"><tbody>${fieldRows}</tbody></table>`
          : "";
        const sectionsHtml = secoes
          .filter((s) => s?.heading || s?.body)
          .map(
            (s) =>
              `<p>${s?.heading ? `<strong>${escapeHtml(s.heading)}: </strong>` : ""}${escapeHtml(s?.body || "")}</p>`,
          )
          .join("");
        return `${descHtml}${fieldsTable}${sectionsHtml}`;
      })();

      const stepContextHtml = (() => {
        const stageType = String(
          stepDoc?.etapa?.tipo || extra?.stage_kind || "",
        ).trim();
        const documentType = String(stepDoc?.tipoDocumento || "").trim();
        const reference = String(
          stepDoc?.etapa?.referencia || stepDoc?.referencia || "",
        ).trim();
        const rows = [
          stageType
            ? `<tr><th>Tipo da etapa</th><td>${escapeHtml(stageType)}</td></tr>`
            : "",
          documentType
            ? `<tr><th>Tipo do documento</th><td>${escapeHtml(documentType)}</td></tr>`
            : "",
          reference && normalizeStage(reference) !== normalizeStage(stageLabel)
            ? `<tr><th>Referência</th><td>${escapeHtml(reference)}</td></tr>`
            : "",
        ]
          .filter(Boolean)
          .join("");

        if (!rows) {
          return "<p class='muted'>Sem metadados adicionais para este passo.</p>";
        }

        return `<table class="tbl"><tbody>${rows}</tbody></table>`;
      })();

      const productsHtml = (() => {
        const items = stageProducts;
        if (items.length === 0) {
          return "<p class='muted'>Nenhum atributo/item registrado nesta etapa.</p>";
        }
        const rows = items
          .map((p) => {
            const nome = escapeHtml(p?.nome || p?.descricao || "-");
            const qty = escapeHtml(p?.quantidade ?? "-");
            const unidade = escapeHtml(p?.unidade || "-");
            const valor = formatBrCurrency(
              p?.valorUnitario ?? p?.precoUnitario,
            );
            const just = escapeHtml(p?.justificativa || "-");
            return `<tr><td>${nome}</td><td>${qty}</td><td>${unidade}</td><td>${valor}</td><td>${just}</td></tr>`;
          })
          .join("");
        return `<table class="tbl"><thead><tr><th>Nome</th><th>Qtd</th><th>Unidade</th><th>Valor unit.</th><th>Justificativa</th></tr></thead><tbody>${rows}</tbody></table>`;
      })();

      const quotesHtml = (() => {
        const items = stageQuotes;
        if (items.length === 0) {
          return "<p class='muted'>Nenhum indicador/registro nesta etapa.</p>";
        }
        return items
          .map((q, idx) => {
            const title = escapeHtml(q?.titulo || `Indicador ${idx + 1}`);
            const quoteRows = [
              q?.fornecedor
                ? `<tr><th>Fornecedor</th><td>${escapeHtml(q.fornecedor)}</td></tr>`
                : "",
              q?.status
                ? `<tr><th>Status</th><td>${escapeHtml(q.status)}</td></tr>`
                : "",
              q?.validade
                ? `<tr><th>Validade</th><td>${escapeHtml(q.validade)}</td></tr>`
                : "",
              q?.observacoes
                ? `<tr><th>Observações</th><td>${escapeHtml(q.observacoes)}</td></tr>`
                : "",
            ]
              .filter(Boolean)
              .join("");
            const innerItems = Array.isArray(q?.items) ? q.items : [];
            const itensHtml =
              innerItems.length === 0
                ? ""
                : `<table class="tbl small"><thead><tr><th>Item</th><th>Qtd</th><th>Valor unit.</th></tr></thead><tbody>${innerItems
                    .map(
                      (it) =>
                        `<tr><td>${escapeHtml(it?.descricao || it?.nome || "-")}</td><td>${escapeHtml(it?.quantidade ?? "-")}</td><td>${formatBrCurrency(it?.precoUnitario ?? it?.valorUnitario)}</td></tr>`,
                    )
                    .join("")}</tbody></table>`;
            return `<div class="quote-block"><h4>${title}</h4>
              ${quoteRows ? `<table class="tbl small"><tbody>${quoteRows}</tbody></table>` : ""}
              ${itensHtml}
            </div>`;
          })
          .join("");
      })();

      const contactsHtml = (() => {
        const items = stageContacts;
        if (items.length === 0) {
          return "<p class='muted'>Nenhum ator/responsável nesta etapa.</p>";
        }
        const rows = items
          .map((c) => {
            const nome = escapeHtml(c?.nome || c?.name || "-");
            const cargo = escapeHtml(c?.cargo || c?.papel || c?.role || "-");
            const email = escapeHtml(c?.email || "-");
            const tel = escapeHtml(c?.telefone || c?.phone || "-");
            const principal = c?.isPrimary ? "Sim" : "Não";
            return `<tr><td>${nome}</td><td>${cargo}</td><td>${email}</td><td>${tel}</td><td>${principal}</td></tr>`;
          })
          .join("");
        return `<table class="tbl"><thead><tr><th>Nome</th><th>Cargo</th><th>Email</th><th>Telefone</th><th>Principal</th></tr></thead><tbody>${rows}</tbody></table>`;
      })();

      const docsHtml = (() => {
        const stepAnexos = Array.isArray(stepDoc?.anexos) ? stepDoc.anexos : [];
        if (stepAnexos.length === 0) {
          return "<p class='muted'>Nenhum anexo nesta etapa.</p>";
        }
        return `<ul>${stepAnexos
          .map((d) => {
            const nome = escapeHtml(
              d?.nome || d?.name || d?.filename || d?.titulo || "anexo",
            );
            const url = d?.url || d?.href || "";
            return url
              ? `<li><a href="${escapeHtml(url)}">${nome}</a></li>`
              : `<li>${nome}</li>`;
          })
          .join("")}</ul>`;
      })();

      return `
<section class="record">
  <header class="record-header">
    <h2>${escapeHtml(stepDoc?.titulo || activity?.titulo || moduleMeta.singular)}</h2>
  </header>

  <h3>Dados do Registro</h3>
  <table class="tbl">
    <tbody>
      <tr><th>Etapa</th><td>${escapeHtml(stageLabel || stepRef || "-")}</td></tr>
      <tr><th>Oportunidade</th><td>#${escapeHtml(oppId || "-")} ${opp?.title ? `— ${escapeHtml(opp.title)}` : ""}</td></tr>
    </tbody>
  </table>

  <h3>Contexto do Passo</h3>
  ${stepContextHtml}

  <h3>Resumo do Passo</h3>
  ${stepSummaryHtml}

  <h3>Atributos do Processo</h3>
  ${productsHtml}

  <h3>Indicadores &amp; SLA</h3>
  ${quotesHtml}

  <h3>Atores Envolvidos</h3>
  ${contactsHtml}

  <h3>Anexos</h3>
  ${docsHtml}
</section>`;
    },
    [opportunitiesById, moduleMeta.singular],
  );

  const wrapHtmlDocument = (innerHtml, docTitle) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color:#111827; padding: 24px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.2rem; margin: 1.5rem 0 .5rem; border-bottom: 2px solid #2fac66; padding-bottom: .25rem; }
  h3 { font-size: 1rem; margin: 1rem 0 .35rem; color: #2fac66; }
  h4 { font-size: .95rem; margin: .75rem 0 .25rem; }
  .meta { color:#6b7280; font-size:.85rem; margin: 0 0 .5rem; }
  .muted { color:#6b7280; font-style: italic; }
  .small { font-size:.85rem; }
  .tbl { width: 100%; border-collapse: collapse; margin: .25rem 0 .75rem; font-size:.9rem; }
  .tbl th, .tbl td { border: 1px solid #e5e7eb; padding: .35rem .55rem; text-align: left; vertical-align: top; }
  .tbl th { background: #f9fafb; font-weight: 600; }
  .record { page-break-after: always; }
  .record:last-child { page-break-after: auto; }
  .quote-block { border-left: 3px solid #2fac66; padding-left: .75rem; margin: .5rem 0 .75rem; }
  .doc-header { border-bottom: 2px solid #111827; padding-bottom: .5rem; margin-bottom: 1rem; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="doc-header">
  <h1>${escapeHtml(docTitle)}</h1>
  <p class="meta">Gerado em ${new Date().toLocaleString("pt-BR")}</p>
</div>
${innerHtml}
</body>
</html>`;

  const openPrintWindow = (html) => {
    const win = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=900,height=700",
    );
    if (!win) {
      alert("Não foi possível abrir a janela de impressão (popup bloqueado).");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      win.focus();
      win.print();
    };
  };

  const downloadHtml = (html, filename) => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrintActivity = async (activity) => {
    await loadOpportunitiesOnce();
    const inner = buildActivityRecordHtml(activity);
    const html = wrapHtmlDocument(
      inner,
      `Registro · ${activity?.titulo || moduleMeta.singular}`,
    );
    openPrintWindow(html);
  };

  const handleExportActivity = async (activity) => {
    await loadOpportunitiesOnce();
    const inner = buildActivityRecordHtml(activity);
    const html = wrapHtmlDocument(
      inner,
      `Registro · ${activity?.titulo || moduleMeta.singular}`,
    );
    const safeTitle = String(activity?.titulo || "registro")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 60);
    downloadHtml(html, `registro_${safeTitle}_${activity?.id || "x"}.html`);
  };

  const handlePrintAll = async () => {
    await loadOpportunitiesOnce();
    const inner = filteredActivities
      .map((a) => buildActivityRecordHtml(a))
      .join("\n");
    const html = wrapHtmlDocument(
      inner,
      `${moduleMeta.timelineTitle} — ${filteredActivities.length} registro(s)`,
    );
    openPrintWindow(html);
  };

  const handleExportAll = async () => {
    await loadOpportunitiesOnce();
    const inner = filteredActivities
      .map((a) => buildActivityRecordHtml(a))
      .join("\n");
    const html = wrapHtmlDocument(
      inner,
      `${moduleMeta.timelineTitle} — ${filteredActivities.length} registro(s)`,
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadHtml(html, `timeline_${moduleMeta.fileSlug}_${stamp}.html`);
  };

  const renderRecordPanel = (activity) => {
    const extra =
      activity?.extra && typeof activity.extra === "object"
        ? activity.extra
        : {};
    const stepDoc =
      extra.documento && typeof extra.documento === "object"
        ? extra.documento
        : null;
    const campos =
      stepDoc?.campos && typeof stepDoc.campos === "object"
        ? stepDoc.campos
        : null;
    const secoes = Array.isArray(stepDoc?.secoes) ? stepDoc.secoes : [];
    const anexos = Array.isArray(stepDoc?.anexos) ? stepDoc.anexos : [];
    const graficos = Array.isArray(stepDoc?.graficos) ? stepDoc.graficos : [];
    const fieldEntries = campos ? Object.entries(campos) : [];

    // Dados da oportunidade (contatos, itens, cotações). Quando possível
    // filtramos pelo stageLabel da própria atividade — assim cada bloco
    // mostra EXATAMENTE o que foi digitado na aba do wizard daquela etapa,
    // e não o agregado global da oportunidade.
    const recordOppId = getOpportunityId(activity);
    const recordOpp = recordOppId
      ? opportunitiesById[String(recordOppId)]
      : null;
    const normalizeStage = (v) =>
      String(v || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        // eslint-disable-next-line no-misleading-character-class
        .replace(/[\u0300-\u036f]/g, "");
    const stageLabel = String(
      stepDoc?.stageLabel ||
        stepDoc?.etapa?.nome ||
        activity?.extra?.stage_label ||
        stepDoc?.referencia ||
        activity?.referencia ||
        "",
    ).trim();
    const stageKey = normalizeStage(stageLabel);
    const matchesStage = (entry) => {
      if (!stageKey) return true; // sem stage definido → mostra tudo
      const candidates = [entry?.etapa, entry?.stageLabel, entry?.referencia];
      // Sem campo de etapa → considera dado opp-wide e mantém visível
      if (candidates.every((c) => c === undefined || c === null || c === "")) {
        return true;
      }
      return candidates.some((c) => normalizeStage(c) === stageKey);
    };
    const allContacts = Array.isArray(recordOpp?.contacts)
      ? recordOpp.contacts
      : [];
    const allProducts = Array.isArray(recordOpp?.products)
      ? recordOpp.products
      : [];
    const allQuotes = Array.isArray(recordOpp?.quotes) ? recordOpp.quotes : [];
    const oppContacts = allContacts.filter(matchesStage);
    const oppProducts = allProducts.filter(matchesStage);
    const oppQuotes = allQuotes.filter(matchesStage);
    // Flags para sinalizar "dados gerais da oportunidade" quando o item não
    // possui campo de etapa (fallback do filtro acima).
    const contactsAreOppWide =
      oppContacts.length > 0 &&
      oppContacts.every((c) => !c?.etapa && !c?.stageLabel && !c?.referencia);
    const productsAreOppWide =
      oppProducts.length > 0 &&
      oppProducts.every((p) => !p?.etapa && !p?.stageLabel && !p?.referencia);
    const quotesAreOppWide =
      oppQuotes.length > 0 &&
      oppQuotes.every((q) => !q?.etapa && !q?.stageLabel && !q?.referencia);

    // Agrupamento alinhado ao wizard da oportunidade. Os 5 passos usam os
    // mesmos rótulos e ícones do wizard exibido na oportunidade (estilo
    // "processo"), conforme solicitação do usuário para manter consistência
    // visual entre a oportunidade e a visualização salva em /tarefas.
    //
    // Fontes de dados:
    //   1 Resumo do Processo     → stepDoc.campos + stepDoc.secoes
    //   2 Atores Envolvidos      → opportunity.contacts
    //   3 Atributos do Processo  → opportunity.products
    //   4 Indicadores & SLA      → opportunity.quotes
    //   5 Anexos & Gráficos      → stepDoc.anexos / stepDoc.graficos
    const WIZARD_STEPS = [
      { key: "resumo", number: 1, title: "Resumo do Processo", icon: "⚙️" },
      { key: "contatos", number: 2, title: "Atores Envolvidos", icon: "👥" },
      {
        key: "produtos",
        number: 3,
        title: "Atributos do Processo",
        icon: "🗂️",
      },
      {
        key: "cotacoes",
        number: 4,
        title: "Indicadores & SLA",
        icon: "📊",
      },
      {
        key: "anexosGraficos",
        number: 5,
        title: "Anexos & Gráficos",
        icon: "📎",
      },
    ];

    // Bucket: campos/seções do stepDoc vão TODOS para "resumo"
    const buckets = {};
    WIZARD_STEPS.forEach((s) => {
      buckets[s.key] = { fields: [], sections: [] };
    });
    buckets.resumo.fields = fieldEntries;
    buckets.resumo.sections = secoes.filter((s) => s?.heading || s?.body);
    const anexosCount = anexos.length;
    const graficosCount = graficos.length;
    const contactsCount = oppContacts.length;
    const productsCount = oppProducts.length;
    const quotesCount = oppQuotes.length;

    const hasAnyContent =
      fieldEntries.length > 0 ||
      secoes.length > 0 ||
      anexosCount > 0 ||
      graficosCount > 0 ||
      contactsCount > 0 ||
      productsCount > 0 ||
      quotesCount > 0 ||
      Boolean(stepDoc?.descricao) ||
      Boolean(stepDoc?.tipoDocumento);

    const renderStepBlock = (step) => {
      const bucket = buckets[step.key];
      const isAnexosStep = step.key === "anexosGraficos";
      const isContactsStep = step.key === "contatos";
      const isProductsStep = step.key === "produtos";
      const isQuotesStep = step.key === "cotacoes";

      const hasFields = bucket.fields.length > 0;
      const hasSections = bucket.sections.length > 0;
      const hasAnexos = isAnexosStep && anexosCount > 0;
      const hasGraficos = isAnexosStep && graficosCount > 0;
      const hasContacts = isContactsStep && contactsCount > 0;
      const hasProducts = isProductsStep && productsCount > 0;
      const hasQuotes = isQuotesStep && quotesCount > 0;

      const isEmpty =
        !hasFields &&
        !hasSections &&
        !hasAnexos &&
        !hasGraficos &&
        !hasContacts &&
        !hasProducts &&
        !hasQuotes;

      return (
        <div key={step.key} className={styles.recordSection}>
          <h4 className={styles.recordTitle}>
            <span className={styles.recordStepBadge}>{step.number}</span>
            <span>
              {step.icon} {step.title}
            </span>
          </h4>

          {hasFields ? (
            <div className={styles.recordGrid}>
              {bucket.fields.map(([label, value]) => (
                <div key={`campo-${step.key}-${label}`}>
                  <span className={styles.recordLabel}>{label}</span>
                  <span className={styles.recordValue}>
                    {String(value ?? "") || "-"}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {hasSections ? (
            <div className={styles.recordList}>
              {bucket.sections.map((s) => (
                <div
                  key={`secao-${step.key}-${s?.heading || s?.body}`}
                  className={styles.recordSubBlock}
                >
                  {s?.heading ? (
                    <span className={styles.recordLabel}>{s.heading}</span>
                  ) : null}
                  <span className={styles.recordValue}>{s?.body || "-"}</span>
                </div>
              ))}
            </div>
          ) : null}

          {hasContacts ? (
            <div className={styles.recordList}>
              {oppContacts.map((c) => {
                const fields = [
                  ["Cargo", c.cargo],
                  ["E-mail", c.email],
                  ["Telefone", c.telefone],
                ].filter(([, v]) => v);
                return (
                  <div
                    key={`contato-${c.id || c.email || c.nome}`}
                    className={styles.recordSubBlock}
                  >
                    <span className={styles.recordLabel}>
                      👤 {c.nome || "Contato sem nome"}
                      {c.isPrimary ? " (principal)" : ""}
                    </span>
                    {fields.length > 0 ? (
                      <div className={styles.recordGrid}>
                        {fields.map(([lab, val]) => (
                          <div key={`contato-${c.id}-${lab}`}>
                            <span className={styles.recordLabel}>{lab}</span>
                            <span className={styles.recordValue}>{val}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.recordMuted}>
                        Sem dados de contato.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {hasProducts ? (
            <div className={styles.recordList}>
              {oppProducts.map((p) => {
                const fields = [
                  ["Quantidade", p.quantidade],
                  ["Unidade", p.unidade],
                  [
                    "Valor unit.",
                    p.valorUnitario != null ? formatBRL(p.valorUnitario) : null,
                  ],
                  ["Total", formatBRL(calcProductTotalActivities(p))],
                  ["Justificativa", p.justificativa],
                ].filter(([, v]) => v !== null && v !== undefined && v !== "");
                return (
                  <div
                    key={`produto-${p.id || p.nome}`}
                    className={styles.recordSubBlock}
                  >
                    <span className={styles.recordLabel}>
                      📦 {p.nome || "Item sem nome"}
                    </span>
                    <div className={styles.recordGrid}>
                      {fields.map(([lab, val]) => (
                        <div key={`produto-${p.id}-${lab}`}>
                          <span className={styles.recordLabel}>{lab}</span>
                          <span className={styles.recordValue}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {hasQuotes ? (
            <div className={styles.recordList}>
              {oppQuotes.map((q) => {
                const itemsCount = Array.isArray(q.items) ? q.items.length : 0;
                const fields = [
                  ["Fornecedor", q.fornecedor],
                  ["Status", q.status || "rascunho"],
                  ["Total", formatBRL(calcQuoteTotalActivities(q))],
                  ["Itens", itemsCount > 0 ? `${itemsCount} item(ns)` : null],
                  ["Validade", q.validade],
                  ["Observações", q.observacoes],
                ].filter(([, v]) => v !== null && v !== undefined && v !== "");
                return (
                  <div
                    key={`cotacao-${q.id || q.titulo}`}
                    className={styles.recordSubBlock}
                  >
                    <span className={styles.recordLabel}>
                      💰 {q.titulo || "Orçamento sem título"}
                    </span>
                    <div className={styles.recordGrid}>
                      {fields.map(([lab, val]) => (
                        <div key={`cotacao-${q.id}-${lab}`}>
                          <span className={styles.recordLabel}>{lab}</span>
                          <span className={styles.recordValue}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {hasAnexos ? (
            <div className={styles.recordList}>
              {anexos.map((a) => (
                <div
                  key={`anexo-${a.id || a.url || a.nome}`}
                  className={styles.recordSubBlock}
                >
                  <span className={styles.recordLabel}>
                    📄{" "}
                    <a
                      href={a.url ? `${API_URL}${a.url}` : "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.nome || "anexo"}
                    </a>
                  </span>
                  <div className={styles.snapshotActions}>
                    <span className={styles.recordMuted}>
                      {graficosCount > 0
                        ? `${graficosCount} gráfico(s) sincronizado(s) com esta oportunidade`
                        : "Nenhum gráfico sincronizado nesta oportunidade"}
                    </span>
                    <button
                      type="button"
                      className={styles.snapshotDownloadBtn}
                      disabled={graficosCount === 0}
                      onClick={() =>
                        setAnexoGraphsModal({
                          anexoName: a.nome || "anexo",
                          graficos,
                        })
                      }
                    >
                      📊 Ver gráficos sincronizados
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {hasGraficos ? (
            <div className={styles.recordList}>
              {graficos.map((g) => {
                const fields = [
                  ["Painel", g.dashboardName],
                  ["Legenda", g.caption],
                ].filter(([, v]) => v !== null && v !== undefined && v !== "");
                return (
                  <div
                    key={`grafico-${g.id || `${g.widgetKey}-${g.dashboardId}`}`}
                    className={styles.recordSubBlock}
                  >
                    <span className={styles.recordLabel}>
                      📊 {g.widgetIcon || ""}{" "}
                      {g.widgetLabel || g.widgetKey || "Gráfico"}
                    </span>
                    {fields.length > 0 ? (
                      <div className={styles.recordGrid}>
                        {fields.map(([lab, val]) => (
                          <div key={`grafico-${g.id}-${lab}`}>
                            <span className={styles.recordLabel}>{lab}</span>
                            <span className={styles.recordValue}>{val}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <SnapshotPreview
                      snapshot={g.snapshot}
                      widgetLabel={g.widgetLabel || g.widgetKey}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          {isEmpty ? (
            <p className={styles.recordMuted} style={{ margin: 0 }}>
              Nenhum dado preenchido nesta etapa.
            </p>
          ) : null}
        </div>
      );
    };

    const isInlineEditing = inlineEditingId === activity.id;

    return (
      <div className={styles.recordPanel}>
        {loadingOpps && !oppsLoaded ? (
          <p className={styles.recordMuted}>Carregando configurações…</p>
        ) : null}

        {isInlineEditing ? (
          <div className={styles.inlineEditToolbar}>
            <span className={styles.inlineEditToolbarLabel}>
              ✏️ Modo de edição ativo
            </span>
            <button
              type="button"
              className={styles.inlineEditExitBtn}
              onClick={handleCloseInlineEdit}
              title="Sair do modo de edição"
            >
              ✖ Sair da edição
            </button>
          </div>
        ) : null}

        {isInlineEditing ? (
          <CreateActivityModal
            show
            inline
            editingActivity={activity}
            entityType={entityType}
            entityId={entityId}
            onClose={handleCloseInlineEdit}
            onSuccess={() => {
              handleCloseInlineEdit();
              fetchActivities();
            }}
          />
        ) : null}

        {isInlineEditing ? (
          <ExpandedInlineEditors
            activity={activity}
            recordOpp={recordOpp}
            stageLabel={stageLabel}
            anexos={anexos}
            onSaveOpportunity={handleSaveOpportunity}
            onSaveAnexos={handleSaveAnexos}
          />
        ) : null}

        {isInlineEditing ? null : WIZARD_STEPS.map(renderStepBlock)}
      </div>
    );
  };

  const renderActivityCard = (activity) => {
    const isExpanded = expandedIds.has(activity.id);
    const oppId = getOpportunityId(activity);
    const opp = oppId ? opportunitiesById[String(oppId)] : null;
    const stepRef = getStepReference(activity);
    const pipelineName = opp?.pipelineTitle || opp?.title || null;
    const outcome =
      normalizeText(activity?.tipo) === "condicional"
        ? getConditionalOutcomeLabel(activity)
        : "";

    return (
      <div key={activity.id} className={styles.timelineItem}>
        <div className={styles.timelineDot}>
          <span className={styles.activityIcon}>
            <ActivityTypeIcon tipo={activity.tipo} />
          </span>
        </div>
        <div
          className={`${styles.timelineContent} ${styles.timelineCardBtn} ${isExpanded ? styles.timelineCardOpen : ""}`}
          onClick={() => toggleExpanded(activity.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleExpanded(activity.id);
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          title={
            isExpanded
              ? "Fechar documento da etapa"
              : "Abrir documento com os dados configurados"
          }
        >
          <div className={styles.activityHeader}>
            <div className={styles.activityHeaderText}>
              <h3 className={styles.activityTitle}>{activity.titulo}</h3>
              <p className={styles.activityTime}>
                {stepRef ? `🎯 ${stepRef} · ` : ""}
                {outcome ? `Resultado: ${outcome} · ` : ""}
                {pipelineName ? `${pipelineName} · ` : ""}
                {formatDate(activity.data_atividade)}
              </p>
            </div>
            <div className={styles.activityMeta}>
              <span className={styles.cardChevron} aria-hidden="true">
                {isExpanded ? "▲" : "▼"}
              </span>
            </div>
          </div>

          {isExpanded ? (
            <div
              className={styles.cardDocument}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              {renderRecordPanel(activity)}
            </div>
          ) : null}

          <div
            className={styles.actionsFooter}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <small className={styles.createdBy}>
              Por {activity.usuario_criador} •{" "}
              {formatDate(activity.data_criacao)}
            </small>
            <div className={styles.actionButtons}>
              <button
                type="button"
                className={styles.recordActionBtn}
                onClick={() => handlePrintActivity(activity)}
                title="Imprimir registro"
              >
                🖨
              </button>
              <button
                type="button"
                className={styles.recordActionBtn}
                onClick={() => handleExportActivity(activity)}
                title="Gerar documento (HTML)"
              >
                📄
              </button>
              <button
                className={styles.editBtn}
                onClick={() =>
                  inlineEditingId === activity.id
                    ? handleCloseInlineEdit()
                    : handleEditActivity(activity)
                }
                title={
                  inlineEditingId === activity.id
                    ? "Sair do modo de edição"
                    : "Editar atividade"
                }
              >
                {inlineEditingId === activity.id ? "✖️" : "✏️"}
              </button>
              <button
                className={styles.deleteBtn}
                onClick={() => handleDeleteActivity(activity.id)}
                title="Deletar atividade"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{pageTitle}</h2>
          <p className={styles.subtitle}>{pageSubtitle}</p>
        </div>
        {entityType && entityId ? (
          <button
            className={styles.newBtn}
            onClick={() => {
              setEditingActivity(null);
              setShowModal(true);
            }}
          >
            {newButtonLabel}
          </button>
        ) : null}
      </div>

      {!loading && activities.length > 0 && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.searchWrapper}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar por título, responsável, etapa, oportunidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => setSearchTerm("")}
                  title="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>
            <label className={styles.toolbarToggle}>
              <input
                type="checkbox"
                checked={groupByOpp}
                onChange={(e) => setGroupByOpp(e.target.checked)}
              />
              <span>Agrupar por oportunidade</span>
            </label>
          </div>
        </>
      )}

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Carregando atividades...</p>
        </div>
      ) : activities.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <p>Nenhuma tarefa configurada em oportunidades</p>
          {entityType && entityId ? (
            <button
              className={styles.emptyBtn}
              onClick={() => {
                setEditingActivity(null);
                setShowModal(true);
              }}
            >
              Criar primeira tarefa
            </button>
          ) : null}
        </div>
      ) : (
        <div className={styles.timeline}>
          {filteredActivities.length === 0 ? (
            <div className={styles.filterEmpty}>
              <span className={styles.emptyIcon}>🔎</span>
              <p>Nenhuma tarefa corresponde aos filtros atuais.</p>
              <button
                type="button"
                className={styles.emptyBtn}
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("todos");
                }}
              >
                Limpar filtros
              </button>
            </div>
          ) : null}
          {groupByOpp && filteredActivities.length > 0
            ? groupedActivities.map(([oppId, items]) => (
                <div key={oppId} className={styles.group}>
                  <div className={styles.groupHeader}>
                    <span className={styles.groupTitle}>
                      🧩 Oportunidade #{oppId}
                    </span>
                    <span className={styles.groupCount}>
                      {items.length} tarefa{items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {items.map((activity) => renderActivityCard(activity))}
                </div>
              ))
            : filteredActivities.map((activity) =>
                renderActivityCard(activity),
              )}
        </div>
      )}

      <CreateActivityModal
        show={showModal}
        onClose={handleCloseModal}
        onSuccess={fetchActivities}
        entityType={entityType}
        entityId={entityId}
        editingActivity={editingActivity}
      />

      {anexoGraphsModal ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setAnexoGraphsModal(null)}
          role="presentation"
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 720 }}
          >
            <div className={styles.modalHeader}>
              <h3>
                📊 Gráficos sincronizados
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#64748b",
                    fontWeight: 400,
                    marginTop: 4,
                  }}
                >
                  Anexo: {anexoGraphsModal.anexoName}
                </div>
              </h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setAnexoGraphsModal(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div
              style={{
                padding: "1rem",
                overflowY: "auto",
                maxHeight: "calc(90vh - 70px)",
              }}
            >
              {anexoGraphsModal.graficos.length === 0 ? (
                <p className={styles.recordMuted}>
                  Nenhum gráfico sincronizado nesta oportunidade.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.25rem",
                  }}
                >
                  {anexoGraphsModal.graficos.map((g) => {
                    const title = g.widgetLabel || g.widgetKey || "Gráfico";
                    return (
                      <div
                        key={`modal-grafico-${g.id || `${g.widgetKey}-${g.dashboardId}`}`}
                        className={styles.recordSubBlock}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: "0.75rem",
                            marginBottom: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            className={styles.recordLabel}
                            style={{ fontSize: "0.9rem", fontWeight: 700 }}
                          >
                            📊 {g.widgetIcon || ""} {title}
                          </span>
                          {g.dashboardName ? (
                            <span className={styles.recordMuted}>
                              {g.dashboardName}
                              {g.caption ? ` — ${g.caption}` : ""}
                            </span>
                          ) : null}
                        </div>
                        <DashboardWidgetRenderer
                          widgetKey={g.widgetKey}
                          snapshot={g.snapshot}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Activities;
