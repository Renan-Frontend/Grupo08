const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

const STATUS_METADATA = {
  novo: {
    key: "novo",
    label: "Novo",
    aliases: ["novo", "lead", "inicial"],
  },
  qualificado: {
    key: "qualificado",
    label: "Qualificado",
    aliases: ["qualificado", "analise", "analise inicial"],
  },
  em_contato: {
    key: "em_contato",
    label: "Em Contato",
    aliases: [
      "em contato",
      "andamento",
      "em andamento",
      "mapeamento",
      "execucao",
      "execucao do fluxo",
    ],
  },
  proposta: {
    key: "proposta",
    label: "Proposta",
    aliases: ["proposta", "orcamento", "cotacao", "cotacao enviada"],
  },
  ganho: {
    key: "ganho",
    label: "Ganho",
    aliases: ["ganho", "ganha", "won", "fechado ganho", "concluido"],
  },
  perdido: {
    key: "perdido",
    label: "Perdido",
    aliases: ["perdido", "lost", "cancelado", "negado"],
  },
};

export const STATUS_OPTIONS = Object.values(STATUS_METADATA);

const parseNumericValue = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text) return 0;

  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const parseOpportunityDateValue = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
  }

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00`);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getOpportunityStatusKey = (opportunity) => {
  const rawStatus = normalizeText(
    opportunity?.status || opportunity?.etapa || "",
  );

  if (rawStatus) {
    const matched = STATUS_OPTIONS.find((item) =>
      item.aliases.some((alias) => rawStatus.includes(normalizeText(alias))),
    );
    if (matched) return matched.key;
  }

  const hasBpmn = Boolean(
    opportunity?.bpmn?.nodes?.length || opportunity?.stages?.length,
  );
  return hasBpmn ? "em_contato" : "novo";
};

export const getOpportunityStatusLabel = (statusKey) =>
  STATUS_METADATA[statusKey]?.label || "Novo";

export const toPersistedStatusLabel = (statusKey) =>
  getOpportunityStatusLabel(statusKey);

const resolvePipelineStageStatus = (stages = []) => {
  const normalizedStages = Array.isArray(stages) ? stages : [];
  if (normalizedStages.length === 0) return "";

  const nextOpen = normalizedStages.find(
    (stage) => stage?.done !== true && String(stage?.label || "").trim(),
  );
  if (nextOpen?.label) return String(nextOpen.label).trim();

  const lastDone = [...normalizedStages]
    .reverse()
    .find((stage) => stage?.done === true && String(stage?.label || "").trim());
  if (lastDone?.label) return String(lastDone.label).trim();

  const firstLabeled = normalizedStages.find((stage) =>
    String(stage?.label || "").trim(),
  );
  return String(firstLabeled?.label || "").trim();
};

export const normalizeOpportunityForView = (opportunity) => {
  const name = String(opportunity?.name || opportunity?.nome || "").trim();
  const statusKey = getOpportunityStatusKey(opportunity);
  const stageStatusLabel = resolvePipelineStageStatus(
    opportunity?.stages || [],
  );
  const rawStatusLabel = String(
    opportunity?.status || opportunity?.etapa || "",
  ).trim();
  const resolvedStatusLabel =
    stageStatusLabel || rawStatusLabel || getOpportunityStatusLabel(statusKey);
  const valueNumber = parseNumericValue(
    opportunity?.valor ?? opportunity?.valor_estimado ?? opportunity?.value,
  );
  const createdAt =
    parseOpportunityDateValue(
      opportunity?.created_at ||
        opportunity?.createdDate ||
        opportunity?.criado_em,
    ) || null;
  const bpmnNodes = opportunity?.bpmn?.nodes || [];
  const stages = opportunity?.stages || [];

  return {
    ...opportunity,
    name,
    nome: name,
    statusKey,
    statusLabel: resolvedStatusLabel,
    valueNumber,
    hasBpmn: bpmnNodes.length > 0 || stages.length > 0,
    bpmnNodeCount: bpmnNodes.length,
    stageCount: stages.length,
    createdAt,
  };
};
