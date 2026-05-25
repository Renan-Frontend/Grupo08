import { buildOwnerPayloadFields } from "../opportunityOwnershipRules";
import {
  createOpportunity,
  deleteOpportunityById,
  updateOpportunityById,
} from "../opportunityApi";

const resolvePipelineCurrentStatus = (stages) => {
  const list = Array.isArray(stages) ? stages : [];
  if (list.length === 0) return "";

  let lastDoneLabel = "";
  let firstPendingLabel = "";

  for (const stage of list) {
    const label = typeof stage?.label === "string" ? stage.label.trim() : "";
    if (!label) continue;
    if (stage?.done === true) {
      lastDoneLabel = label;
    } else if (!firstPendingLabel) {
      firstPendingLabel = label;
    }
  }

  if (firstPendingLabel) return firstPendingLabel;
  if (lastDoneLabel) return lastDoneLabel;
  const firstLabel =
    typeof list[0]?.label === "string" ? list[0].label.trim() : "";
  return firstLabel;
};

export const buildOpportunityPayload = ({
  title,
  selectedOwner,
  owner,
  createdDate,
  endDate,
  effectiveStatus,
  stages,
  infoRows,
  pipelineTitle,
  pipelineSubtitle,
  timelineItems,
  showPipeline,
  showTopico,
  showTimeline,
  products,
  quotes,
  contacts,
  probabilidade,
  origemLead,
  motivoFechamento,
}) => {
  const resolvedPipelineTitle =
    safeTrim(pipelineTitle) || safeTrim(localStorage.getItem("pipelineTitle"));
  const resolvedPipelineSubtitle =
    safeTrim(pipelineSubtitle) ||
    safeTrim(localStorage.getItem("pipelineSubtitle"));
  const normalizedInfoRows = normalizeInfoRowsForSave(infoRows);
  const normalizedStages = Array.isArray(stages) ? stages : [];
  const isBpmnDrivenPipeline = normalizedStages.some(
    (stage) => stage?.fromBpmn === true,
  );
  const pipelineCurrentStatus = resolvePipelineCurrentStatus(normalizedStages);
  const persistedStatus = isBpmnDrivenPipeline
    ? pipelineCurrentStatus || safeTrim(effectiveStatus)
    : safeTrim(effectiveStatus) || pipelineCurrentStatus;

  let activeStageIndex = -1;
  for (let index = normalizedStages.length - 1; index >= 0; index -= 1) {
    if (normalizedStages[index]?.done === true) {
      activeStageIndex = index;
      break;
    }
  }

  const activeStage =
    activeStageIndex >= 0 ? normalizedStages[activeStageIndex] : null;
  const activeNodeId = String(activeStage?.sourceNodeId || "").trim();

  return {
    nome: title?.trim() || "Nova Oportunidade",
    name: title?.trim() || "Nova Oportunidade",
    ...buildOwnerPayloadFields({ selectedOwner, owner }),
    created_at: createdDate || "",
    createdDate: createdDate || "",
    endDate: endDate || "",
    status: persistedStatus,
    stages: normalizedStages,
    stageIndex: activeStageIndex,
    currentNodeId: activeNodeId || null,
    activeNodeId: activeNodeId || null,
    bpmnNodeId: activeNodeId || null,
    bpmnCurrentNodeId: activeNodeId || null,
    sourceNodeId: activeNodeId || null,
    infoRows: normalizedInfoRows,
    timelineItems,
    showPipeline,
    showTopico,
    showTimeline,
    pipelineTitle: resolvedPipelineTitle,
    pipelineSubtitle: resolvedPipelineSubtitle,
    products: Array.isArray(products) ? products : [],
    quotes: Array.isArray(quotes) ? quotes : [],
    contacts: Array.isArray(contacts) ? contacts : [],
    probabilidade: probabilidade ?? "",
    origemLead: origemLead ?? "",
    motivoFechamento: motivoFechamento ?? "",
  };
};

const resolvePapelNegocioFromTipoEntidade = (
  tipoEntidade,
  fallback = "processo",
) => {
  const normalized = safeTrim(tipoEntidade).toLowerCase();
  if (
    normalized === "contato" ||
    normalized.includes("cliente") ||
    normalized.includes("fornecedor") ||
    normalized.includes("parceiro") ||
    normalized.includes("pessoa") ||
    normalized.includes("empresa")
  ) {
    return "contato";
  }
  if (normalized === "processo" || normalized.includes("process")) {
    return "processo";
  }
  return fallback;
};

const safeTrim = (value) => String(value || "").trim();

const normalizeName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const normalizeManualPendingTarget = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (
    normalized === "bpmn_entidades" ||
    normalized === "bpmn" ||
    normalized === "entidades"
  ) {
    return normalized;
  }

  return "";
};

const resolveNodeStageType = (node) => {
  const rawType = String(node?.nodeType || "")
    .trim()
    .toLowerCase();
  if (rawType === "task") return "task";
  if (rawType === "condicional") return "condicional";
  return "entidade";
};

const resolveBpmnEntityName = (node) => {
  const stageType = resolveNodeStageType(node);
  if (stageType === "task") {
    return (
      safeTrim(node?.taskNome) ||
      safeTrim(node?.entidadeNome) ||
      safeTrim(node?.label) ||
      safeTrim(node?.subtitle)
    );
  }

  if (stageType === "condicional") {
    return (
      safeTrim(node?.condicionalNome) ||
      safeTrim(node?.entidadeNome) ||
      safeTrim(node?.label) ||
      safeTrim(node?.subtitle)
    );
  }

  return (
    safeTrim(node?.entidadeNome) ||
    safeTrim(node?.label) ||
    safeTrim(node?.subtitle)
  );
};

const resolveBpmnEntityDescription = (node, stageType) => {
  if (stageType === "task") {
    return (
      safeTrim(node?.taskDescricao) ||
      safeTrim(node?.descricao) ||
      "Entidade gerada pelo BPMN"
    );
  }

  if (stageType === "condicional") {
    return (
      safeTrim(node?.condicionalDescricao) ||
      safeTrim(node?.descricao) ||
      "Entidade gerada pelo BPMN"
    );
  }

  return (
    safeTrim(node?.entidadeDescricao) ||
    safeTrim(node?.descricao) ||
    "Entidade gerada pelo BPMN"
  );
};

const parseTopicFieldsFromValue = (value) => {
  const text = String(value || "");
  const descricaoMatch = text.match(/Descri[cç][aã]o\s*:\s*([^\n]*)/i);
  const atributoMatch = text.match(/Atributo\s*chave\s*:\s*([^\n]*)/i);

  return {
    descricao: safeTrim(descricaoMatch?.[1] || ""),
    atributoChave: safeTrim(atributoMatch?.[1] || ""),
  };
};

export const buildBpmnEntitiesForCatalog = ({
  bpmn,
  actorName,
  bpmnName,
  stages,
  infoRows,
}) => {
  const nodes = Array.isArray(bpmn?.nodes) ? bpmn.nodes : [];
  const dedupedEntities = new Map();
  const categoryName = safeTrim(bpmnName) || "BPMN";
  const syncTimestamp = new Date().toISOString();
  const infoRowsByLabel = new Map(
    (Array.isArray(infoRows) ? infoRows : [])
      .slice(1)
      .map((row) => [normalizeName(row?.label), row])
      .filter(([normalized]) => Boolean(normalized)),
  );

  const upsertEntity = ({
    nome,
    stageType,
    baseDescription,
    atributoChave,
    isPrimaryEntity = false,
    tipoEntidade = "",
    entidadeId = null,
  }) => {
    const normalized = normalizeName(nome);
    const rawEntityId =
      entidadeId !== null && entidadeId !== undefined
        ? String(entidadeId).trim()
        : "";
    const dedupeKey = rawEntityId
      ? `id:${rawEntityId}`
      : normalized
        ? `name:${normalized}`
        : "";
    if (!dedupeKey) return;

    const topicRow = infoRowsByLabel.get(normalized);
    const parsedTopic = parseTopicFieldsFromValue(topicRow?.value);

    const entidadePayload = {
      entidadeId: rawEntityId || null,
      nome: safeTrim(nome),
      descricao:
        safeTrim(parsedTopic.descricao) ||
        safeTrim(baseDescription) ||
        "Entidade gerada pelo BPMN",
      atributoChave:
        safeTrim(parsedTopic.atributoChave) || safeTrim(atributoChave || ""),
      categoria: categoryName,
      tipoEntidade:
        safeTrim(tipoEntidade) ||
        (isPrimaryEntity === true ? "Principal" : "Apoio"),
      papelNegocio: resolvePapelNegocioFromTipoEntidade(
        safeTrim(tipoEntidade),
        isPrimaryEntity === true ? "contato" : "processo",
      ),
      isPrimaryEntity: isPrimaryEntity === true,
      ativo: true,
      criadoPor: safeTrim(actorName) || "Usuário do sistema",
      updated_at: syncTimestamp,
    };

    dedupedEntities.set(dedupeKey, entidadePayload);
  };

  nodes.forEach((node) => {
    if (node?.active === false) return;

    const stageType = resolveNodeStageType(node);
    if (stageType !== "entidade") return;

    const nome = resolveBpmnEntityName(node);
    upsertEntity({
      nome,
      stageType,
      baseDescription: resolveBpmnEntityDescription(node, stageType),
      atributoChave: safeTrim(node?.atributoChave || ""),
      isPrimaryEntity: node?.isPrimaryEntity === true,
      tipoEntidade: safeTrim(node?.tipoEntidade || ""),
      entidadeId: node?.entidadeId,
    });
  });

  (Array.isArray(stages) ? stages : []).forEach((stage) => {
    const nome = safeTrim(stage?.label || "");
    if (!nome) return;
    const normalized = normalizeName(nome);
    const alreadyTrackedByName = [...dedupedEntities.values()].some(
      (entityPayload) => normalizeName(entityPayload?.nome) === normalized,
    );
    if (alreadyTrackedByName) return;

    const stageType = resolveNodeStageType({ nodeType: stage?.stageType });
    if (stageType !== "entidade") return;
    upsertEntity({
      nome,
      stageType,
      baseDescription: "",
      atributoChave: "",
      isPrimaryEntity: stage?.isPrimaryEntity === true,
      tipoEntidade: safeTrim(stage?.tipoEntidade || ""),
      entidadeId: stage?.entidadeId,
    });
  });

  return [...dedupedEntities.values()];
};

export const buildEntidadesSyncOperations = ({
  currentEntidades,
  bpmnEntities,
}) => {
  const entidadesAtuais = Array.isArray(currentEntidades)
    ? currentEntidades
    : [];
  const entitiesFromBpmn = Array.isArray(bpmnEntities) ? bpmnEntities : [];

  const currentByName = new Map(
    entidadesAtuais
      .map((entidade) => [normalizeName(entidade?.nome), entidade])
      .filter(([normalized]) => Boolean(normalized)),
  );
  const currentById = new Map(
    entidadesAtuais
      .map((entidade) => [
        entidade?.id !== undefined && entidade?.id !== null
          ? String(entidade.id)
          : entidade?._id !== undefined && entidade?._id !== null
            ? String(entidade._id)
            : "",
        entidade,
      ])
      .filter(([id]) => Boolean(id)),
  );

  const toCreate = [];
  const toUpdate = [];

  entitiesFromBpmn.forEach((entityPayload) => {
    const normalized = normalizeName(entityPayload?.nome);
    const payloadEntityId =
      entityPayload?.entidadeId !== undefined &&
      entityPayload?.entidadeId !== null
        ? String(entityPayload.entidadeId).trim()
        : "";
    if (!normalized && !payloadEntityId) return;

    const existing =
      (payloadEntityId ? currentById.get(payloadEntityId) : null) ||
      currentByName.get(normalized);
    if (!existing) {
      const { entidadeId: _ignoredEntityId, ...createPayload } = entityPayload;
      toCreate.push(createPayload);
      return;
    }

    const needsUpdate =
      safeTrim(existing?.descricao) !== safeTrim(entityPayload?.descricao) ||
      safeTrim(existing?.atributoChave) !==
        safeTrim(entityPayload?.atributoChave) ||
      safeTrim(existing?.categoria) !== safeTrim(entityPayload?.categoria) ||
      safeTrim(existing?.tipoEntidade) !==
        safeTrim(entityPayload?.tipoEntidade) ||
      (existing?.isPrimaryEntity === true) !==
        (entityPayload?.isPrimaryEntity === true);

    if (!needsUpdate) return;

    const existingId =
      existing?.id !== undefined && existing?.id !== null
        ? existing.id
        : existing?._id;

    const nextAtributoChave = safeTrim(entityPayload?.atributoChave);
    const shouldPreserveExistingAtributoChave =
      !nextAtributoChave || nextAtributoChave === "-";

    toUpdate.push({
      id: existingId,
      payload: (() => {
        const { entidadeId: _ignoredEntityId, ...updatePayload } =
          entityPayload;

        return {
          ...updatePayload,
          atributoChave: shouldPreserveExistingAtributoChave
            ? (existing?.atributoChave ?? null)
            : entityPayload?.atributoChave,
          campos: Array.isArray(existing?.campos) ? existing.campos : [],
        };
      })(),
    });
  });

  return { toCreate, toUpdate };
};

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value || "");
  }
};

const formatTimelineDateTime = () =>
  new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const normalizeInfoRowsForSave = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) {
    return [{ label: "", value: "" }];
  }

  const titleRow = {
    label: String(safeRows[0]?.label || ""),
    value: String(safeRows[0]?.value || ""),
    topicType: String(safeRows[0]?.topicType || "")
      .trim()
      .toLowerCase(),
    isPrimaryEntity: safeRows[0]?.isPrimaryEntity === true,
  };

  const contentRows = safeRows.slice(1).map((row, index) => ({
    label: safeTrim(row?.label) || `Assunto ${index + 1}`,
    value: String(row?.value || ""),
    sourceNodeId: String(row?.sourceNodeId || "").trim(),
    topicType:
      String(row?.topicType || "")
        .trim()
        .toLowerCase() || "dados",
    isPrimaryEntity: row?.isPrimaryEntity === true,
    manualStatus:
      String(row?.manualStatus || "")
        .trim()
        .toLowerCase() === "concluido"
        ? "concluido"
        : "pendente",
    pendingTarget: normalizeManualPendingTarget(row?.pendingTarget),
    stepConfig: (() => {
      const raw = row?.stepConfig;
      if (!raw || typeof raw !== "object") {
        return {
          description: "",
          responsible: "",
          dueDate: "",
          checklist: [],
          usedFields: [],
        };
      }
      const checklist = Array.isArray(raw?.checklist) ? raw.checklist : [];
      const usedFields = Array.isArray(raw?.usedFields) ? raw.usedFields : [];
      return {
        description: String(raw?.description || ""),
        responsible: String(raw?.responsible || ""),
        dueDate: String(raw?.dueDate || ""),
        checklist: checklist
          .map((item) => {
            if (typeof item === "string") {
              const text = item.trim();
              return text ? { text, done: false } : null;
            }
            const text = String(item?.text || "").trim();
            if (!text) return null;
            return { text, done: item?.done === true };
          })
          .filter(Boolean),
        usedFields: usedFields
          .map((field) => {
            if (typeof field === "string") {
              const name = field.trim();
              return name ? { name, type: "texto", required: false } : null;
            }
            const name = String(field?.name || field?.field || "").trim();
            if (!name) return null;
            const type = String(field?.type || "texto")
              .trim()
              .toLowerCase();
            const allowed = [
              "texto",
              "numero",
              "data",
              "booleano",
              "moeda",
              "id",
              "outro",
            ];
            return {
              name,
              type: allowed.includes(type) ? type : "texto",
              required: field?.required === true,
            };
          })
          .filter(Boolean),
      };
    })(),
  }));

  return [titleRow, ...contentRows];
};

const parseTopicStructuredFields = (value = "") => {
  const text = String(value || "");
  const descricaoMatch = text.match(/Descri[cç][aã]o\s*:\s*([^\n]*)/i);
  const atributoMatch = text.match(/Atributo\s*chave\s*:\s*([^\n]*)/i);
  const campoMatch = text.match(/Campo\s*:\s*([^\n]*)/i);

  const descricao = safeTrim(descricaoMatch?.[1] || "");
  const atributoChave = safeTrim(atributoMatch?.[1] || "");
  const campo = safeTrim(campoMatch?.[1] || "");

  return {
    hasStructured:
      Boolean(descricaoMatch) || Boolean(atributoMatch) || Boolean(campoMatch),
    descricao,
    atributoChave,
    campo,
  };
};

export const buildOpportunityAutoTimelineItems = ({
  opportunity,
  actorName,
  actorId,
  title,
  selectedOwner,
  owner,
  effectiveStatus,
  createdDate,
  endDate,
  stages,
  infoRows,
  pipelineTitle,
  pipelineSubtitle,
  showPipeline,
  showTopico,
  showTimeline,
  timelineItems,
}) => {
  const actor = safeTrim(actorName) || "Conta atual";
  const normalizedActorId = safeTrim(actorId);
  const now = formatTimelineDateTime();
  const nowTimestamp = new Date().toISOString();
  const baseId = Date.now() + Math.floor(Math.random() * 1000);
  let offset = 0;

  const originalTitle = safeTrim(opportunity?.name || opportunity?.nome || "");
  const nextTitle = safeTrim(title);

  const originalStatus = safeTrim(
    opportunity?.status || opportunity?.etapa || "",
  );
  const nextStatus = safeTrim(effectiveStatus);

  const originalOwnerName = safeTrim(
    opportunity?.owner ||
      opportunity?.criadoPor ||
      opportunity?.responsavelNome ||
      opportunity?.responsavel ||
      "",
  );
  const nextOwnerName = safeTrim(selectedOwner || owner || "");

  const originalCreatedDate = safeTrim(
    opportunity?.createdDate || opportunity?.created_at || "",
  );
  const nextCreatedDate = safeTrim(createdDate);

  const originalEndDate = safeTrim(opportunity?.endDate || "");
  const nextEndDate = safeTrim(endDate);

  const originalStages = Array.isArray(opportunity?.stages)
    ? opportunity.stages
    : [];
  const nextStages = Array.isArray(stages) ? stages : [];
  const hasAnyActiveStage = nextStages.some((stage) => stage?.done === true);
  const stagesChanged =
    safeStringify(
      originalStages.map((stage) => ({
        label: safeTrim(stage?.label),
        done: stage?.done === true,
      })),
    ) !==
    safeStringify(
      nextStages.map((stage) => ({
        label: safeTrim(stage?.label),
        done: stage?.done === true,
      })),
    );

  const originalInfoRows = normalizeInfoRowsForSave(
    opportunity?.infoRows || [],
  );
  const nextInfoRows = normalizeInfoRowsForSave(infoRows || []);
  const infoRowsChanged =
    safeStringify(originalInfoRows) !== safeStringify(nextInfoRows);

  const normalizeVisibility = (value, fallback) =>
    typeof value === "boolean" ? value : fallback;

  const originalShowPipeline = normalizeVisibility(
    opportunity?.showPipeline,
    true,
  );
  const originalShowTopico = normalizeVisibility(
    opportunity?.showTopico,
    false,
  );
  const originalShowTimeline = normalizeVisibility(
    opportunity?.showTimeline,
    true,
  );

  const nextShowPipeline = normalizeVisibility(showPipeline, true);
  const nextShowTopico = normalizeVisibility(showTopico, false);
  const nextShowTimeline = normalizeVisibility(showTimeline, true);

  const newAutoNotes = [];

  const pushNote = ({
    titleText,
    descriptionText,
    actionType = "update",
    elementType = "oportunidade",
    itemName,
    before = "",
    after = "",
    comment = "",
  }) => {
    newAutoNotes.push({
      id: baseId + offset,
      title: titleText,
      description: descriptionText,
      time: now,
      timestamp: nowTimestamp,
      actor,
      actorId: normalizedActorId,
      autoGenerated: true,
      source: "opportunity-save",
      actionType,
      elementType,
      itemName: safeTrim(itemName || titleText) || "Registro",
      before,
      after,
      comment,
    });
    offset += 1;
  };

  if (originalTitle !== nextTitle && nextTitle) {
    pushNote({
      titleText: "Nome da oportunidade foi alterado",
      descriptionText: `Antes: ${originalTitle || "-"} → Agora: ${nextTitle}`,
      actionType: "update",
      elementType: "oportunidade",
      itemName: "Nome da oportunidade",
      before: originalTitle || "-",
      after: nextTitle,
    });
  }

  if (originalStatus !== nextStatus && nextStatus) {
    pushNote({
      titleText: "Status da oportunidade foi alterado",
      descriptionText: `Antes: ${originalStatus || "-"} → Agora: ${nextStatus}`,
      actionType: "update",
      elementType: "status",
      itemName: "Status da oportunidade",
      before: originalStatus || "-",
      after: nextStatus,
    });
  }

  if (
    originalCreatedDate !== nextCreatedDate ||
    originalEndDate !== nextEndDate
  ) {
    pushNote({
      titleText: "Datas da oportunidade foram atualizadas",
      descriptionText: `Criação: ${originalCreatedDate || "-"} → ${nextCreatedDate || "-"} | Final: ${originalEndDate || "-"} → ${nextEndDate || "-"}`,
      actionType: "update",
      elementType: "datas",
      itemName: "Datas da oportunidade",
      before: `Criação: ${originalCreatedDate || "-"} | Final: ${originalEndDate || "-"}`,
      after: `Criação: ${nextCreatedDate || "-"} | Final: ${nextEndDate || "-"}`,
    });
  }

  const resolvedPipelineTitle =
    safeTrim(pipelineTitle) || safeTrim(localStorage.getItem("pipelineTitle"));
  const resolvedPipelineSubtitle =
    safeTrim(pipelineSubtitle) ||
    safeTrim(localStorage.getItem("pipelineSubtitle"));
  const originalPipelineTitle = safeTrim(opportunity?.pipelineTitle || "");
  const originalPipelineSubtitle = safeTrim(
    opportunity?.pipelineSubtitle || "",
  );

  if (originalOwnerName !== nextOwnerName && nextOwnerName) {
    pushNote({
      titleText: "Proprietário da oportunidade foi alterado",
      descriptionText: `Antes: ${originalOwnerName || "-"} → Agora: ${nextOwnerName}`,
      actionType: "update",
      elementType: "proprietario",
      itemName: "Proprietário",
      before: originalOwnerName || "-",
      after: nextOwnerName,
    });
  }

  if (
    stagesChanged ||
    originalPipelineTitle !== resolvedPipelineTitle ||
    originalPipelineSubtitle !== resolvedPipelineSubtitle
  ) {
    const changedParts = [];
    if (originalPipelineTitle !== resolvedPipelineTitle)
      changedParts.push("título");
    if (originalPipelineSubtitle !== resolvedPipelineSubtitle)
      changedParts.push("subtítulo");
    if (stagesChanged) changedParts.push("nódulos ativos/inativos");

    pushNote({
      titleText: "Pipeline foi alterada",
      descriptionText: `Antes: ${[
        originalPipelineTitle || "-",
        originalPipelineSubtitle || "-",
      ].join(" | ")} → Agora: ${[
        resolvedPipelineTitle || "-",
        resolvedPipelineSubtitle || "-",
      ].join(" | ")} | Alterações: ${
        changedParts.length > 0 ? changedParts.join(", ") : "estrutura"
      }`,
      actionType: "update",
      elementType: "pipeline",
      itemName: "Pipeline principal",
      before: hasAnyActiveStage
        ? `${originalPipelineTitle || "-"} | ${originalPipelineSubtitle || "-"}`
        : originalStatus || "-",
      after: `${resolvedPipelineTitle || "-"} | ${resolvedPipelineSubtitle || "-"}`,
      comment:
        changedParts.length > 0
          ? `Campos alterados: ${changedParts.join(", ")}`
          : "Estrutura atualizada",
    });
  }

  if (infoRowsChanged) {
    const originalContentRows = originalInfoRows.slice(1);
    const nextContentRows = nextInfoRows.slice(1);

    const maxRows = Math.max(
      originalContentRows.length,
      nextContentRows.length,
    );

    for (let index = 0; index < maxRows; index += 1) {
      const previousRow = originalContentRows[index] || null;
      const currentRow = nextContentRows[index] || null;

      if (!previousRow && currentRow) {
        const label = safeTrim(currentRow?.label) || `Assunto ${index + 1}`;
        pushNote({
          titleText: `${label} foi adicionado`,
          descriptionText: "Antes: inexistente → Agora: tópico criado",
          actionType: "create",
          elementType: "topico",
          itemName: label,
          before: "Inexistente",
          after: "Tópico criado",
        });
        continue;
      }

      if (previousRow && !currentRow) {
        const label = safeTrim(previousRow?.label) || `Assunto ${index + 1}`;
        pushNote({
          titleText: `${label} foi removido`,
          descriptionText: "Antes: tópico existente → Agora: removido",
          actionType: "delete",
          elementType: "topico",
          itemName: label,
          before: "Tópico existente",
          after: "Removido",
        });
        continue;
      }

      const previousLabel =
        safeTrim(previousRow?.label) || `Assunto ${index + 1}`;
      const currentLabel =
        safeTrim(currentRow?.label) || `Assunto ${index + 1}`;
      const previousValue = safeTrim(previousRow?.value);
      const currentValue = safeTrim(currentRow?.value);

      if (previousLabel !== currentLabel || previousValue !== currentValue) {
        const previousStructured = parseTopicStructuredFields(
          previousRow?.value,
        );
        const currentStructured = parseTopicStructuredFields(currentRow?.value);

        if (previousLabel !== currentLabel) {
          pushNote({
            titleText: "Assunto do tópico foi renomeado",
            descriptionText: `Antes: ${previousLabel} → Agora: ${currentLabel}`,
            actionType: "update",
            elementType: "topico",
            itemName: currentLabel,
            before: previousLabel,
            after: currentLabel,
          });
        }

        if (
          previousStructured.hasStructured ||
          currentStructured.hasStructured
        ) {
          if (previousStructured.descricao !== currentStructured.descricao) {
            pushNote({
              titleText: `Descrição atualizada em ${currentLabel}`,
              descriptionText:
                "Antes: descrição anterior → Agora: descrição atual",
              actionType: "update",
              elementType: "topico",
              itemName: `${currentLabel} • Descrição`,
              before: previousStructured.descricao || "-",
              after: currentStructured.descricao || "-",
            });
          }

          if (
            previousStructured.atributoChave !== currentStructured.atributoChave
          ) {
            pushNote({
              titleText: `Atributo chave atualizado em ${currentLabel}`,
              descriptionText:
                "Antes: atributo chave anterior → Agora: atributo chave atual",
              actionType: "update",
              elementType: "topico",
              itemName: `${currentLabel} • Atributo chave`,
              before: previousStructured.atributoChave || "-",
              after: currentStructured.atributoChave || "-",
            });
          }

          if (previousStructured.campo !== currentStructured.campo) {
            pushNote({
              titleText: `Campo atualizado em ${currentLabel}`,
              descriptionText: "Antes: campo anterior → Agora: campo atual",
              actionType: "update",
              elementType: "topico",
              itemName: `${currentLabel} • Campo`,
              before: previousStructured.campo || "-",
              after: currentStructured.campo || "-",
            });
          }

          continue;
        }

        pushNote({
          titleText: `${currentLabel} foi atualizado`,
          descriptionText: "Antes: versão anterior → Agora: versão atual",
          actionType: "update",
          elementType: "topico",
          itemName: currentLabel,
          before: "Versão anterior",
          after: "Versão atual",
        });
      }
    }

    const originalTopicTitle = safeTrim(originalInfoRows?.[0]?.label || "");
    const nextTopicTitle = safeTrim(nextInfoRows?.[0]?.label || "");

    if (originalTopicTitle !== nextTopicTitle && nextTopicTitle) {
      pushNote({
        titleText: "Título do tópico foi alterado",
        descriptionText: `Antes: ${originalTopicTitle || "-"} → Agora: ${nextTopicTitle}`,
        actionType: "update",
        elementType: "topico",
        itemName: "Título do tópico",
        before: originalTopicTitle || "-",
        after: nextTopicTitle,
      });
    }
  }

  if (
    originalShowPipeline !== nextShowPipeline ||
    originalShowTopico !== nextShowTopico ||
    originalShowTimeline !== nextShowTimeline
  ) {
    const changedSections = [];
    if (originalShowPipeline !== nextShowPipeline) {
      changedSections.push(
        `Pipeline: ${originalShowPipeline ? "visível" : "oculta"} → ${nextShowPipeline ? "visível" : "oculta"}`,
      );
    }
    if (originalShowTopico !== nextShowTopico) {
      changedSections.push(
        `Tópico: ${originalShowTopico ? "visível" : "oculto"} → ${nextShowTopico ? "visível" : "oculto"}`,
      );
    }
    if (originalShowTimeline !== nextShowTimeline) {
      changedSections.push(
        `Linha do tempo: ${originalShowTimeline ? "visível" : "oculta"} → ${nextShowTimeline ? "visível" : "oculta"}`,
      );
    }

    pushNote({
      titleText: "Layout da oportunidade foi alterado",
      descriptionText: changedSections.join(" | "),
      actionType: "update",
      elementType: "layout",
      itemName: "Layout da oportunidade",
      before: "Configuração anterior",
      after: "Configuração atual",
      comment: changedSections.join(" | "),
    });
  }

  if (newAutoNotes.length === 0) {
    return Array.isArray(timelineItems) ? timelineItems : [];
  }

  return [
    ...newAutoNotes,
    ...(Array.isArray(timelineItems) ? timelineItems : []),
  ];
};

export const saveOpportunity = async ({
  payload,
  token,
  isCreating,
  opportunityId,
}) => {
  if (isCreating) {
    return createOpportunity({ payload, token });
  }

  return updateOpportunityById({
    opportunityId,
    payload,
    token,
  });
};

export const deleteOpportunity = async ({ token, opportunityId }) => {
  return deleteOpportunityById({ token, opportunityId });
};

// ─── Pipeline → atividades/condicionais (catálogo) ───────────────────────────

const STAGE_TYPE_TO_ACTIVITY_TIPO = {
  task: "task",
  condicional: "condicional",
};

// Conjuntos de tipos equivalentes — "task"/"tarefa" são considerados
// o mesmo tipo para evitar duplicação entre o sync da pipeline e o
// fluxo de "Confirmar e salvar passo" do OpportunityDocumentsCard.
const ACTIVITY_TIPO_ALIASES = {
  task: new Set(["task", "tarefa"]),
  tarefa: new Set(["task", "tarefa"]),
  condicional: new Set(["condicional"]),
};

const tipoAliases = (tipo) =>
  ACTIVITY_TIPO_ALIASES[normalizeName(tipo)] || new Set([normalizeName(tipo)]);

const resolveActivityStatus = (stage) => {
  if (stage?.done === true) return "concluido";
  if (
    safeTrim(stage?.manualStatus).toLowerCase() === "concluido" ||
    safeTrim(stage?.status).toLowerCase() === "concluido"
  ) {
    return "concluido";
  }
  return "planejado";
};

const buildActivityDescriptionFromInfoRow = (row) => {
  if (!row) return "";
  const parsed = parseTopicFieldsFromValue(row?.value);
  return safeTrim(parsed.descricao) || safeTrim(row?.value);
};

export const buildStageActivitiesForCatalog = ({
  opportunityId,
  opportunityName,
  stages,
  infoRows,
  actorName,
}) => {
  const oppId = opportunityId ? String(opportunityId).trim() : "";
  if (!oppId) return [];

  const infoRowsByLabel = new Map(
    (Array.isArray(infoRows) ? infoRows : [])
      .slice(1)
      .map((row) => [normalizeName(row?.label), row])
      .filter(([normalized]) => Boolean(normalized)),
  );

  const syncTimestamp = new Date().toISOString();
  const categoryName = safeTrim(opportunityName) || "Oportunidade";

  return (Array.isArray(stages) ? stages : [])
    .map((stage) => {
      const stageTypeRaw = String(stage?.stageType || "")
        .trim()
        .toLowerCase();
      const tipo = STAGE_TYPE_TO_ACTIVITY_TIPO[stageTypeRaw];
      if (!tipo) return null;

      const titulo = safeTrim(stage?.label || "");
      if (!titulo) return null;

      const matchedRow = infoRowsByLabel.get(normalizeName(titulo));
      const rowDescricao = buildActivityDescriptionFromInfoRow(matchedRow);

      // Só persiste em /tarefas (e /condicoes) os passos que o usuário
      // efetivamente concluiu via "Confirmar e salvar passo" ou marcando
      // o círculo da pipeline. Descrições vindas do BPMN não contam como
      // "configurado pelo usuário".
      if (stage?.done !== true) return null;

      const descricao =
        rowDescricao ||
        safeTrim(stage?.descricao) ||
        `${tipo === "task" ? "Tarefa" : "Condicional"} configurada na pipeline`;

      return {
        titulo,
        referencia: titulo,
        descricao,
        tipo,
        status: resolveActivityStatus(stage),
        entidade_tipo: "oportunidade",
        entidade_id: oppId,
        responsavel: safeTrim(actorName) || "Usuário do sistema",
        usuario_criador: safeTrim(actorName) || "Usuário do sistema",
        data_atualizacao: syncTimestamp,
        // Inclui o label do passo nas tags para casar com o matching usado
        // pelo OpportunityDocumentsCard ao salvar o registro do passo.
        tags: ["pipeline", tipo, categoryName, titulo].filter(Boolean),
      };
    })
    .filter(Boolean);
};

const matchActivityForStage = (currentActivities, stageActivity) => {
  const normalizedRef = normalizeName(stageActivity?.referencia);
  const aliases = tipoAliases(stageActivity?.tipo);
  return (currentActivities || []).find((activity) => {
    if (!aliases.has(normalizeName(activity?.tipo))) return false;
    const sameRef =
      normalizeName(activity?.referencia) === normalizedRef ||
      normalizeName(activity?.titulo) === normalizedRef;
    if (sameRef) return true;
    const tags = Array.isArray(activity?.tags) ? activity.tags : [];
    return tags.some((tag) => normalizeName(tag) === normalizedRef);
  });
};

export const buildActivitiesSyncOperations = ({
  currentActivities,
  stageActivities,
}) => {
  const toCreate = [];
  const toUpdate = [];

  (Array.isArray(stageActivities) ? stageActivities : []).forEach(
    (stageActivity) => {
      const match = matchActivityForStage(currentActivities, stageActivity);
      if (!match) {
        toCreate.push(stageActivity);
        return;
      }

      const needsUpdate =
        safeTrim(match?.titulo) !== safeTrim(stageActivity?.titulo) ||
        safeTrim(match?.descricao) !== safeTrim(stageActivity?.descricao) ||
        safeTrim(match?.status) !== safeTrim(stageActivity?.status) ||
        safeTrim(match?.referencia) !== safeTrim(stageActivity?.referencia);

      if (!needsUpdate) return;

      toUpdate.push({
        id: match.id,
        payload: {
          ...stageActivity,
          tags: Array.from(
            new Set([
              ...(Array.isArray(match?.tags) ? match.tags : []),
              ...(Array.isArray(stageActivity?.tags) ? stageActivity.tags : []),
            ]),
          ),
        },
      });
    },
  );

  return { toCreate, toUpdate };
};
