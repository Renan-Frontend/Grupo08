import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { API_URL } from "../../../Api";
import styles from "./StepAttachmentsCard.module.css";

const DASHBOARD_STORAGE_KEY = "bp_dashboards_v1";

const WIDGET_LABELS = {
  metrics: { label: "Métricas KPI", icon: "📊" },
  revenue: { label: "Faturamento Mensal", icon: "📈" },
  sales: { label: "Vendas e Clientes", icon: "📉" },
  conversions: { label: "Taxa de Conversão", icon: "🎯" },
  expenses: { label: "Despesas Mensais", icon: "💸" },
  tasks: { label: "Tarefas", icon: "✅" },
  pipeline: { label: "Pipeline de Vendas", icon: "🔽" },
  kpiTable: { label: "Tabela de Indicadores", icon: "📋" },
};

const formatBytes = (bytes = 0) => {
  if (!bytes || bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const loadDashboards = () => {
  try {
    const raw = localStorage.getItem(DASHBOARD_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const StepAttachmentsCard = ({
  attachments = [],
  charts = [],
  onAttachmentsChange,
  onChartsChange,
  isReadOnlyMode = false,
  activeStageLabel = "",
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dashboards, setDashboards] = useState([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState("");
  const [selectedWidgetId, setSelectedWidgetId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [chartCaption, setChartCaption] = useState("");

  const normalizedStage = String(activeStageLabel || "")
    .trim()
    .toLowerCase();

  const annotatedAttachments = React.useMemo(() => {
    return (Array.isArray(attachments) ? attachments : []).map((a) => {
      const etapaRaw = String(a?.etapa || "").trim();
      const etapaNorm = etapaRaw.toLowerCase();
      let origin = "current";
      if (!etapaRaw) origin = "unscoped";
      else if (normalizedStage && etapaNorm !== normalizedStage)
        origin = "foreign";
      return { ...a, __origin: origin, __etapaLabel: etapaRaw };
    });
  }, [attachments, normalizedStage]);

  const visibleAttachments = React.useMemo(() => {
    const importedSourceIdsInCurrentStage = new Set(
      (Array.isArray(attachments) ? attachments : [])
        .filter(
          (a) =>
            String(a?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            a?.importedFromId !== undefined &&
            a?.importedFromId !== null &&
            String(a.importedFromId).trim() !== "",
        )
        .map((a) => String(a.importedFromId)),
    );

    return annotatedAttachments.filter((a) => {
      if (a.__origin === "current") return true;
      return !importedSourceIdsInCurrentStage.has(String(a.id));
    });
  }, [annotatedAttachments, attachments, normalizedStage]);

  const annotatedCharts = React.useMemo(() => {
    return (Array.isArray(charts) ? charts : []).map((c) => {
      const etapaRaw = String(c?.etapa || "").trim();
      const etapaNorm = etapaRaw.toLowerCase();
      let origin = "current";
      if (!etapaRaw) origin = "unscoped";
      else if (normalizedStage && etapaNorm !== normalizedStage)
        origin = "foreign";
      return { ...c, __origin: origin, __etapaLabel: etapaRaw };
    });
  }, [charts, normalizedStage]);

  const visibleCharts = React.useMemo(() => {
    const importedSourceIdsInCurrentStage = new Set(
      (Array.isArray(charts) ? charts : [])
        .filter(
          (c) =>
            String(c?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            c?.importedFromId !== undefined &&
            c?.importedFromId !== null &&
            String(c.importedFromId).trim() !== "",
        )
        .map((c) => String(c.importedFromId)),
    );

    return annotatedCharts.filter((c) => {
      if (c.__origin === "current") return true;
      return !importedSourceIdsInCurrentStage.has(String(c.id));
    });
  }, [annotatedCharts, charts, normalizedStage]);

  useEffect(() => {
    setDashboards(loadDashboards());
  }, []);

  const selectedDashboard = dashboards.find(
    (d) => String(d.id) === String(selectedDashboardId),
  );

  const availableWidgets = selectedDashboard?.widgets || [];

  // Itens individuais disponíveis dentro do snapshot do widget selecionado.
  // Permite ao usuário escolher uma seção/linha específica em vez de salvar
  // o gráfico inteiro (ex.: uma seção do kpiTable de cada vez).
  const rawSnapshot = selectedDashboard?.chartData?.[selectedWidgetId] ?? null;
  const availableItems = React.useMemo(() => {
    if (!Array.isArray(rawSnapshot) || rawSnapshot.length === 0) return [];
    const keyCandidates = ["section", "name", "label", "titulo", "categoria"];
    const groupKey = keyCandidates.find((k) =>
      rawSnapshot.some(
        (r) => r && r[k] !== null && r[k] !== undefined && r[k] !== "",
      ),
    );
    if (!groupKey) return [];
    const seen = new Set();
    const items = [];
    rawSnapshot.forEach((r) => {
      const v = r?.[groupKey];
      if (v == null || v === "") return;
      const key = String(v);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ key, label: key, groupKey });
    });
    return items;
  }, [rawSnapshot]);

  const selectedItem = availableItems.find((it) => it.key === selectedItemId);

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    setUploading(true);
    const next = [...attachments];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`${API_URL}/api/uploads`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.detail || "Falha no upload");
        }
        next.push({
          ...data.anexo,
          etapa: String(activeStageLabel || "").trim(),
          adicionadoEm: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Erro no upload:", err);
        setError(`Erro ao enviar ${file.name}: ${err.message || err}`);
      }
    }
    onAttachmentsChange(next);
    setUploading(false);
  };

  const handleRemoveAttachment = (id) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const handleAddChart = () => {
    if (!selectedDashboard || !selectedWidgetId) return;
    const widgetMeta = WIDGET_LABELS[selectedWidgetId] || {
      label: selectedWidgetId,
      icon: "📊",
    };
    let snapshot = rawSnapshot;
    let itemSuffix = "";
    if (selectedItem && Array.isArray(snapshot)) {
      snapshot = snapshot.filter(
        (r) => String(r?.[selectedItem.groupKey]) === selectedItem.key,
      );
      itemSuffix = ` — ${selectedItem.label}`;
    }
    const newChart = {
      id: `${selectedDashboard.id}-${selectedWidgetId}-${selectedItem?.key || "all"}-${Date.now()}`,
      dashboardId: selectedDashboard.id,
      dashboardName: selectedDashboard.name || "Dashboard",
      widgetKey: selectedWidgetId,
      widgetLabel: `${widgetMeta.label}${itemSuffix}`,
      widgetIcon: widgetMeta.icon,
      itemFilter: selectedItem
        ? { key: selectedItem.groupKey, value: selectedItem.key }
        : null,
      caption: chartCaption.trim(),
      snapshot,
      etapa: String(activeStageLabel || "").trim(),
      adicionadoEm: new Date().toISOString(),
    };
    onChartsChange([...charts, newChart]);
    setSelectedWidgetId("");
    setSelectedItemId("");
    setChartCaption("");
  };

  const handleRemoveChart = (id) => {
    onChartsChange(charts.filter((c) => c.id !== id));
  };

  const isAttachmentUsedInCurrentStep = (attachment) => {
    if (attachment.__origin === "current") return true;
    if (!activeStageLabel) return false;
    return (Array.isArray(attachments) ? attachments : []).some(
      (a) =>
        String(a?.etapa || "")
          .trim()
          .toLowerCase() === normalizedStage &&
        String(a?.importedFromId || "") === String(attachment.id),
    );
  };

  const handleAttachmentUsageToggle = (attachment, shouldUse) => {
    if (isReadOnlyMode || !activeStageLabel) return;
    const currentList = Array.isArray(attachments) ? attachments : [];

    if (shouldUse) {
      if (attachment.__origin === "current") return;
      const alreadyImported = currentList.some(
        (a) =>
          String(a?.etapa || "")
            .trim()
            .toLowerCase() === normalizedStage &&
          String(a?.importedFromId || "") === String(attachment.id),
      );
      if (alreadyImported) return;
      onAttachmentsChange([
        ...currentList,
        {
          ...attachment,
          id: `${attachment.id || "anexo"}-${Date.now()}-${Math.random()}`,
          etapa: String(activeStageLabel).trim(),
          importedFromId: attachment.id,
        },
      ]);
      return;
    }

    if (attachment.__origin === "current") {
      onAttachmentsChange(currentList.filter((a) => a.id !== attachment.id));
      return;
    }

    onAttachmentsChange(
      currentList.filter(
        (a) =>
          !(
            String(a?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            String(a?.importedFromId || "") === String(attachment.id)
          ),
      ),
    );
  };

  const isChartUsedInCurrentStep = (chart) => {
    if (chart.__origin === "current") return true;
    if (!activeStageLabel) return false;
    return (Array.isArray(charts) ? charts : []).some(
      (c) =>
        String(c?.etapa || "")
          .trim()
          .toLowerCase() === normalizedStage &&
        String(c?.importedFromId || "") === String(chart.id),
    );
  };

  const handleChartUsageToggle = (chart, shouldUse) => {
    if (isReadOnlyMode || !activeStageLabel) return;
    const currentList = Array.isArray(charts) ? charts : [];

    if (shouldUse) {
      if (chart.__origin === "current") return;
      const alreadyImported = currentList.some(
        (c) =>
          String(c?.etapa || "")
            .trim()
            .toLowerCase() === normalizedStage &&
          String(c?.importedFromId || "") === String(chart.id),
      );
      if (alreadyImported) return;
      onChartsChange([
        ...currentList,
        {
          ...chart,
          id: `${chart.id || "grafico"}-${Date.now()}-${Math.random()}`,
          etapa: String(activeStageLabel).trim(),
          importedFromId: chart.id,
        },
      ]);
      return;
    }

    if (chart.__origin === "current") {
      onChartsChange(currentList.filter((c) => c.id !== chart.id));
      return;
    }

    onChartsChange(
      currentList.filter(
        (c) =>
          !(
            String(c?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            String(c?.importedFromId || "") === String(chart.id)
          ),
      ),
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.subtitle}>
        📎 Anexos & Gráficos do passo:{" "}
        <strong>{activeStageLabel || "—"}</strong>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h4>📎 Anexos</h4>
          <span className={styles.counter}>
            {visibleAttachments.length} arquivo(s)
          </span>
        </div>
        {!isReadOnlyMode && visibleAttachments.length > 0 && (
          <div className={styles.selectionBar}>
            <span className={styles.selectionHint}>
              Marque os anexos que serão utilizados neste passo.
            </span>
          </div>
        )}
        {!isReadOnlyMode && (
          <label className={styles.uploadZone}>
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              disabled={uploading}
              style={{ display: "none" }}
            />
            <span className={styles.uploadIcon}>📤</span>
            <span>
              {uploading
                ? "Enviando..."
                : "Clique para selecionar arquivos (PDF, imagens, planilhas, etc.)"}
            </span>
          </label>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {visibleAttachments.length === 0 ? (
          <p className={styles.empty}>Nenhum anexo adicionado.</p>
        ) : (
          <ul className={styles.list}>
            {visibleAttachments.map((a) => (
              <li key={a.id} className={styles.item}>
                <div className={styles.itemMain}>
                  {!isReadOnlyMode && (
                    <input
                      type="checkbox"
                      className={styles.rowSelector}
                      checked={isAttachmentUsedInCurrentStep(a)}
                      onChange={(e) =>
                        handleAttachmentUsageToggle(a, e.target.checked)
                      }
                      title="Selecionar anexo"
                      aria-label="Selecionar anexo"
                    />
                  )}
                  <span className={styles.itemIcon}>📄</span>
                  <div className={styles.itemInfo}>
                    <a
                      href={`${API_URL}${a.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.itemLink}
                    >
                      {a.nome}
                    </a>
                    <span className={styles.itemMeta}>
                      {a.tipo} · {formatBytes(a.tamanho)}
                    </span>
                  </div>
                </div>
                {!isReadOnlyMode && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(a.id)}
                    className={styles.removeBtn}
                    title="Remover anexo"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h4>📊 Gráficos do Painel Geral</h4>
          <span className={styles.counter}>
            {visibleCharts.length} gráfico(s)
          </span>
        </div>
        {!isReadOnlyMode && (
          <div className={styles.chartPicker}>
            {dashboards.length === 0 ? (
              <p className={styles.empty}>
                Nenhum painel salvo. Crie um painel em /dashboard primeiro.
              </p>
            ) : (
              <>
                <div className={styles.pickerRow}>
                  <label className={styles.pickerLabel}>
                    Painel
                    <select
                      className={styles.pickerSelect}
                      value={selectedDashboardId}
                      onChange={(e) => {
                        setSelectedDashboardId(e.target.value);
                        setSelectedWidgetId("");
                      }}
                    >
                      <option value="">— escolha um painel —</option>
                      {dashboards.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || "Dashboard"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.pickerLabel}>
                    Widget
                    <select
                      className={styles.pickerSelect}
                      value={selectedWidgetId}
                      onChange={(e) => {
                        setSelectedWidgetId(e.target.value);
                        setSelectedItemId("");
                      }}
                      disabled={!selectedDashboard}
                    >
                      <option value="">— escolha um gráfico —</option>
                      {availableWidgets.map((w) => (
                        <option key={w} value={w}>
                          {WIDGET_LABELS[w]?.icon || "📊"}{" "}
                          {WIDGET_LABELS[w]?.label || w}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {availableItems.length > 0 ? (
                  <div className={styles.pickerRow}>
                    <label className={styles.pickerLabel} style={{ flex: 1 }}>
                      Item específico
                      <select
                        className={styles.pickerSelect}
                        value={selectedItemId}
                        onChange={(e) => setSelectedItemId(e.target.value)}
                      >
                        <option value="">
                          — todos ({availableItems.length} disponíveis) —
                        </option>
                        {availableItems.map((it) => (
                          <option key={it.key} value={it.key}>
                            {it.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                <div className={styles.pickerRow}>
                  <label className={styles.pickerLabel} style={{ flex: 1 }}>
                    Legenda (opcional)
                    <input
                      type="text"
                      className={styles.pickerInput}
                      value={chartCaption}
                      onChange={(e) => setChartCaption(e.target.value)}
                      placeholder="Ex.: Pipeline em 15/05/2026"
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={handleAddChart}
                    disabled={!selectedDashboard || !selectedWidgetId}
                  >
                    + Adicionar gráfico
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {!isReadOnlyMode && visibleCharts.length > 0 && (
          <div className={styles.selectionBar}>
            <span className={styles.selectionHint}>
              Marque os gráficos que serão utilizados neste passo.
            </span>
          </div>
        )}
        {visibleCharts.length === 0 ? (
          <p className={styles.empty}>Nenhum gráfico adicionado.</p>
        ) : (
          <ul className={styles.list}>
            {visibleCharts.map((c) => (
              <li key={c.id} className={styles.item}>
                <div className={styles.itemMain}>
                  {!isReadOnlyMode && (
                    <input
                      type="checkbox"
                      className={styles.rowSelector}
                      checked={isChartUsedInCurrentStep(c)}
                      onChange={(e) =>
                        handleChartUsageToggle(c, e.target.checked)
                      }
                      title="Selecionar gráfico"
                      aria-label="Selecionar gráfico"
                    />
                  )}
                  <span className={styles.itemIcon}>
                    {c.widgetIcon || "📊"}
                  </span>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemLink}>
                      {c.widgetLabel} · {c.dashboardName}
                    </span>
                    {c.caption && (
                      <span className={styles.itemMeta}>{c.caption}</span>
                    )}
                    <span className={styles.itemMeta}>
                      Snapshot:{" "}
                      {Array.isArray(c.snapshot)
                        ? `${c.snapshot.length} registro(s)`
                        : c.snapshot
                          ? "dados capturados"
                          : "sem dados"}
                    </span>
                  </div>
                </div>
                {!isReadOnlyMode && (
                  <button
                    type="button"
                    onClick={() => handleRemoveChart(c.id)}
                    className={styles.removeBtn}
                    title="Remover gráfico"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

StepAttachmentsCard.propTypes = {
  attachments: PropTypes.array,
  charts: PropTypes.array,
  onAttachmentsChange: PropTypes.func.isRequired,
  onChartsChange: PropTypes.func.isRequired,
  isReadOnlyMode: PropTypes.bool,
  activeStageLabel: PropTypes.string,
};

export default StepAttachmentsCard;
