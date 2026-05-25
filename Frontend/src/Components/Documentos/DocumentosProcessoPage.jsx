import React from "react";
import { DOCUMENTOS_LIST, DOCUMENTO_CREATE, DOCUMENTO_DELETE } from "../../Api";
import { useLocation } from "react-router-dom";
import {
  fetchOpportunitiesPage,
  getAuthToken,
} from "../Opportunities/opportunityApi";
import styles from "./DocumentosProcessoPage.module.css";

const normalizeText = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const sanitizeFlowTerminology = (value = "") =>
  String(value || "").replace(/\bbpmn\b/gi, "Fluxograma");

const hasMeaningfulValue = (value = "") => {
  const normalized = normalizeText(value);
  return ![
    "",
    "-",
    "--",
    "na",
    "n/a",
    "nao informado",
    "não informado",
    "none",
    "null",
  ].includes(normalized);
};

const isConditionalStage = (stage) => {
  const stageType = normalizeText(stage?.stageType);
  return (
    stageType === "condicional" ||
    stageType === "condicao" ||
    stageType === "condition"
  );
};

const getConditionalDecisionLabel = (stage) => {
  const raw = normalizeText(
    stage?.decisaoCondicional || stage?.conditionOutcome || "",
  );
  if (["sim", "yes", "y", "true", "1"].includes(raw)) return "Sim";
  if (["nao", "não", "no", "n", "false", "0"].includes(raw)) return "Não";
  return "";
};

const findInfoRowForStage = (opp, stageLabel) => {
  const rows = Array.isArray(opp?.infoRows) ? opp.infoRows : [];
  const target = normalizeText(stageLabel);
  return rows.find((row) => normalizeText(row?.label) === target) || null;
};

const isOpportunityFullyConfigured = (opp) => {
  const stages = Array.isArray(opp?.stages) ? opp.stages : [];
  if (stages.length === 0) return false;
  return stages.every((stage) => {
    if (stage?.done !== true) return false;
    if (!isConditionalStage(stage)) return true;
    const decision = getConditionalDecisionLabel(stage);
    return decision === "Sim" || decision === "Não";
  });
};

const formatDate = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
};

const getStageTypeLabel = (stage) => {
  const stageType = normalizeText(stage?.stageType);
  if (stageType === "task") return "Tarefa";
  if (stageType === "condicional" || stageType === "condicao") {
    return "Condição";
  }
  if (stageType === "entidade") return "Entidade";
  return String(stage?.stageType || "-").trim() || "-";
};

const extractTaggedValue = (text, keyPattern) => {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const stopPattern =
    "(?:Descrição|Atributo\\s*chave|Tipo\\s*da\\s*entidade|Fluxo\\s*principal\\s*na\\s*pipeline|Refer[eê]ncia)\\s*:";
  const matcher = new RegExp(
    `${keyPattern}\\s*:\\s*([\\s\\S]*?)(?=\\s*${stopPattern}|$)`,
    "i",
  );
  const match = raw.match(matcher);
  if (!match?.[1]) return "";
  return sanitizeFlowTerminology(String(match[1]).replace(/\s+/g, " ").trim());
};

const extractStageConfiguration = (row) => {
  const rawValue = String(row?.value || "").trim();
  return {
    descricao: extractTaggedValue(rawValue, "Descrição") || "",
    atributoChave: extractTaggedValue(rawValue, "Atributo\\s*chave") || "",
    tipoEntidade: extractTaggedValue(rawValue, "Tipo\\s*da\\s*entidade") || "-",
  };
};

const getStageConfiguredDescription = (stage, infoConfig) => {
  const directValues = [
    stage?.descricao,
    stage?.description,
    stage?.taskDescricao,
    stage?.condicionalDescricao,
    stage?.entidadeDescricao,
    stage?.resumo,
    stage?.summary,
    stage?.details,
    stage?.observacao,
  ];

  const firstDirect = directValues.find((value) => hasMeaningfulValue(value));
  if (firstDirect) return sanitizeFlowTerminology(String(firstDirect).trim());

  if (hasMeaningfulValue(infoConfig?.descricao)) {
    return sanitizeFlowTerminology(String(infoConfig.descricao).trim());
  }

  return "Sem descrição detalhada para este passo.";
};

const getStageConfiguredEntityType = (stage, infoConfig) => {
  const role = normalizeText(stage?.papelNegocio || "");
  if (role === "contato") return "Contato";
  if (role === "processo") return "Processo";

  const directValues = [
    stage?.tipoEntidade,
    stage?.entityType,
    stage?.entityKind,
  ];

  const firstDirect = directValues.find((value) => hasMeaningfulValue(value));
  if (firstDirect) return sanitizeFlowTerminology(String(firstDirect).trim());

  if (hasMeaningfulValue(infoConfig?.tipoEntidade)) {
    return sanitizeFlowTerminology(String(infoConfig.tipoEntidade).trim());
  }

  return "-";
};

const buildSummaryDocumentBody = (opp) => {
  const stages = Array.isArray(opp?.stages) ? opp.stages : [];
  const total = stages.length;
  const done = stages.filter((stage) => stage?.done === true).length;
  const completionRate =
    total > 0 ? `${Math.round((done / total) * 100)}%` : "0%";

  const sections = stages.map((stage, idx) => {
    const stageLabel = String(stage?.label || `Passo ${idx + 1}`).trim();
    const infoRow = findInfoRowForStage(opp, stageLabel);
    const config = extractStageConfiguration(infoRow);
    const configuredDescription = getStageConfiguredDescription(stage, config);
    const configuredEntityType = getStageConfiguredEntityType(stage, config);
    const stageType = getStageTypeLabel(stage);
    const status = stage?.done ? "Concluído" : "Pendente";
    const decision = isConditionalStage(stage)
      ? getConditionalDecisionLabel(stage) || "Não definida"
      : null;

    const bodyLines = [
      `Tipo do passo: ${stageType}`,
      `Status: ${status}`,
      decision ? `Decisão: ${decision}` : "",
      `Descrição: ${configuredDescription}`,
      hasMeaningfulValue(config.atributoChave)
        ? `Atributo-chave: ${sanitizeFlowTerminology(config.atributoChave)}`
        : "",
      hasMeaningfulValue(configuredEntityType)
        ? `Tipo da entidade: ${configuredEntityType}`
        : "",
    ].filter(Boolean);

    return {
      heading: `Passo ${idx + 1} - ${stageLabel}`,
      body: bodyLines.join("\n"),
    };
  });

  const owner =
    String(
      opp?.owner || opp?.proprietario || opp?.selectedOwner || "",
    ).trim() || "Não informado";

  return {
    documentTitle: `Documento Completo do Processo - ${String(opp?.title || "Oportunidade").trim()}`,
    documentType: "Documento Completo do Processo",
    processName: String(opp?.pipelineTitle || opp?.title || "Processo").trim(),
    opportunityId: String(opp?.id || "").trim(),
    header: {
      fields: [
        {
          label: "Oportunidade",
          value: String(opp?.title || "Sem título").trim(),
        },
        {
          label: "Pipeline",
          value: String(opp?.pipelineTitle || opp?.title || "-").trim(),
        },
        {
          label: "Status",
          value: String(opp?.status || "-").trim() || "-",
        },
        {
          label: "Proprietário",
          value: owner,
        },
        {
          label: "Etapas concluídas",
          value: `${done}/${total}`,
        },
        {
          label: "Taxa de conclusão",
          value: completionRate,
        },
      ],
    },
    sections,
    footer:
      "Documento gerado automaticamente a partir da configuração da oportunidade.",
    signatureFields: [],
    aiGenerated: false,
  };
};

const openPrintPreview = (doc) => {
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const headerRows = (doc?.header?.fields || [])
    .map(
      (field) =>
        `<tr><td class='label'>${esc(field?.label)}</td><td>${esc(field?.value)}</td></tr>`,
    )
    .join("");

  const sections = (doc?.sections || [])
    .map((section) => {
      const rows = String(section?.body || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<li>${esc(line)}</li>`)
        .join("");

      const isSummary = normalizeText(section?.heading).includes(
        "resumo geral do processo",
      );
      const sectionClass = isSummary ? "summary" : "step";
      return `<section class="${sectionClass}"><h3>${esc(section?.heading)}</h3><ul>${rows}</ul></section>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${esc(doc?.documentTitle || "Documento Completo do Processo")}</title>
<style>
body{font-family:Arial,sans-serif;width:min(1200px,96vw);margin:20px auto;padding:0 10px;color:#0f172a}
h1{font-size:1.55rem;margin:0 0 .45rem}
.meta{color:#64748b;font-size:.92rem;margin-bottom:1.25rem}
table{width:100%;border-collapse:collapse;margin:0 0 1.25rem}
td{border:1px solid #e2e8f0;padding:.62rem .78rem;vertical-align:top}
.label{font-weight:700;background:#f8fafc;width:220px}
section{margin:0 0 1.2rem;padding:1rem 1.15rem;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
section.summary{border-left:5px solid #0ea5e9;background:#fff}
section.step{border-left:5px solid #22c55e}
section h3{margin:0 0 .55rem;font-size:1.05rem;color:#166534}
section ul{margin:0;padding-left:1.15rem}
section li{margin:.35rem 0;line-height:1.5}
</style>
</head>
<body>
<h1>${esc(doc?.documentTitle || "Documento Completo do Processo")}</h1>
<p class="meta">Gerado em ${new Date().toLocaleString("pt-BR")}</p>
${headerRows ? `<table><tbody>${headerRows}</tbody></table>` : ""}
${sections}
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    return;
  }
  win.addEventListener("load", () => {
    win.print();
    URL.revokeObjectURL(url);
  });
};

const DocumentosProcessoPage = () => {
  const location = useLocation();
  const [opportunities, setOpportunities] = React.useState([]);
  const [documents, setDocuments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [savingOppId, setSavingOppId] = React.useState("");
  const [deletingDocId, setDeletingDocId] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const autoGeneratedOppRef = React.useRef("");
  const autoGenerateOpportunityId = String(
    location.state?.autoGenerateOpportunityId || "",
  ).trim();

  const loadData = React.useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [oppRes, docsRes] = await Promise.all([
        fetchOpportunitiesPage({ page: 1, limit: 500, token }),
        (async () => {
          const req = DOCUMENTOS_LIST(token);
          const res = await fetch(req.url, req.options);
          if (!res.ok) return { data: [] };
          return res.json();
        })(),
      ]);

      const opps = Array.isArray(oppRes?.data) ? oppRes.data : [];
      const docs = Array.isArray(docsRes?.data) ? docsRes.data : [];
      const processDocs = docs.filter(
        (doc) =>
          normalizeText(doc?.documentType).includes("resumo do processo") ||
          normalizeText(doc?.documentType).includes(
            "documento completo do processo",
          ),
      );

      setOpportunities(opps);
      setDocuments(processDocs);
    } catch {
      setNotice("Não foi possível carregar oportunidades e documentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = React.useCallback(async (opp, options = {}) => {
    const token = getAuthToken();
    if (!token || !opp?.id) return;

    if (!isOpportunityFullyConfigured(opp)) {
      if (options?.silent !== true) {
        setNotice(
          "Conclua todos os passos da oportunidade antes de gerar o resumo do processo.",
        );
      }
      return;
    }

    setSavingOppId(String(opp.id));
    setNotice("");

    try {
      const body = buildSummaryDocumentBody(opp);
      const req = DOCUMENTO_CREATE(body, token);
      const res = await fetch(req.url, req.options);
      if (!res.ok) {
        throw new Error("Falha ao gerar documento.");
      }
      const created = await res.json();
      setDocuments((prev) => [created, ...prev]);
      setNotice("Documento completo do processo gerado com sucesso.");
    } catch {
      setNotice("Não foi possível gerar o resumo do processo.");
    } finally {
      setSavingOppId("");
    }
  }, []);

  React.useEffect(() => {
    if (!autoGenerateOpportunityId || loading) return;
    if (autoGeneratedOppRef.current === autoGenerateOpportunityId) return;

    const targetOpportunity = opportunities.find(
      (opp) => String(opp?.id || "") === autoGenerateOpportunityId,
    );

    if (!targetOpportunity) {
      autoGeneratedOppRef.current = autoGenerateOpportunityId;
      setNotice("Oportunidade para geração automática não encontrada.");
      return;
    }

    autoGeneratedOppRef.current = autoGenerateOpportunityId;
    void handleGenerate(targetOpportunity, { silent: true });
  }, [autoGenerateOpportunityId, loading, opportunities, handleGenerate]);

  const handleDelete = async (docId) => {
    const token = getAuthToken();
    if (!token || !docId) return;

    if (!window.confirm("Deseja excluir este documento de processo?")) {
      return;
    }

    setDeletingDocId(String(docId));
    try {
      const req = DOCUMENTO_DELETE(docId, token);
      const res = await fetch(req.url, req.options);
      if (!res.ok) throw new Error("delete failed");
      setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
    } catch {
      setNotice("Não foi possível excluir o documento.");
    } finally {
      setDeletingDocId("");
    }
  };

  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Documentos de Processo</h2>
        <p className={styles.subtitle}>
          Gere um documento consolidado com o processo configurado passo a passo
          em oportunidades.
        </p>
      </header>

      {notice ? <p className={styles.notice}>{notice}</p> : null}

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Gerar Documento por Oportunidade</h3>
        {loading ? (
          <p className={styles.muted}>Carregando oportunidades...</p>
        ) : opportunities.length === 0 ? (
          <p className={styles.muted}>Nenhuma oportunidade encontrada.</p>
        ) : (
          <div className={styles.opportunityList}>
            {opportunities.map((opp) => {
              const stages = Array.isArray(opp?.stages) ? opp.stages : [];
              const isReady = isOpportunityFullyConfigured(opp);
              const done = stages.filter(
                (stage) => stage?.done === true,
              ).length;
              return (
                <div key={opp.id} className={styles.opportunityRow}>
                  <div>
                    <p className={styles.oppTitle}>
                      {opp?.title || `Oportunidade #${opp.id}`}
                    </p>
                    <p className={styles.oppMeta}>
                      Pipeline: {opp?.pipelineTitle || opp?.title || "-"} ·
                      Etapas: {done}/{stages.length}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.generateBtn}
                    disabled={!isReady || savingOppId === String(opp.id)}
                    onClick={() => handleGenerate(opp)}
                    title={
                      isReady
                        ? "Gerar documento completo"
                        : "Finalize todas as etapas para habilitar"
                    }
                  >
                    {savingOppId === String(opp.id)
                      ? "Gerando..."
                      : "Gerar documento"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Documentos Gerados</h3>
        {documents.length === 0 ? (
          <p className={styles.muted}>
            Nenhum documento de processo gerado ainda.
          </p>
        ) : (
          <div className={styles.docList}>
            {documents.map((doc) => (
              <article key={doc.id} className={styles.docCard}>
                <div>
                  <p className={styles.docTitle}>
                    {doc?.documentTitle || "Sem título"}
                  </p>
                  <p className={styles.docMeta}>
                    {doc?.processName || "Processo"} ·{" "}
                    {formatDate(doc?.createdAt)}
                  </p>
                </div>
                <div className={styles.docActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => openPrintPreview(doc)}
                  >
                    Imprimir
                  </button>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    disabled={deletingDocId === String(doc.id)}
                    onClick={() => handleDelete(doc.id)}
                  >
                    {deletingDocId === String(doc.id) ? "..." : "Excluir"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default DocumentosProcessoPage;
