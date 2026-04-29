export const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

export const toEntitySlug = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const formatDateTimeLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getOpportunityId = (opportunity) =>
  opportunity?.id ?? opportunity?._id ?? null;

export const getEntidadeId = (entidade) =>
  entidade?.id ?? entidade?._id ?? null;

export const getOpportunityName = (opportunity) =>
  String(opportunity?.name || opportunity?.nome || "").trim();

export const getTableIdFromCategory = (categoryName) => {
  const normalized = normalizeText(categoryName || "Sem categoria");
  return `table:${normalized || "sem-categoria"}`;
};

export const getEntityTableNameKey = (entityName, tableName) => {
  const normalizedEntityName = normalizeText(entityName);
  const normalizedTableName = normalizeText(tableName || "Sem categoria");
  if (!normalizedEntityName || !normalizedTableName) return null;
  return `table:${normalizedTableName}::name:${normalizedEntityName}`;
};

export const buildTableSections = ({ entidades, bpmnSectionNames }) => {
  const categoryNamesFromEntities = Array.from(
    new Set(
      entidades
        .map((entidade) => String(entidade?.categoria || "").trim())
        .map((categoria) => categoria || "Sem categoria")
        .filter(Boolean),
    ),
  );

  const orderedTableNames = [...bpmnSectionNames];
  const seen = new Set(orderedTableNames.map((name) => normalizeText(name)));

  categoryNamesFromEntities.forEach((categoryName) => {
    const categoryNorm = normalizeText(categoryName);
    if (!categoryNorm || seen.has(categoryNorm)) return;
    seen.add(categoryNorm);
    orderedTableNames.push(categoryName);
  });

  return orderedTableNames.map((tableName) => {
    const tableNorm = normalizeText(tableName);
    const entitiesInTable = entidades.filter((entidade) => {
      const entityCategory = String(entidade?.categoria || "").trim();
      const normalizedCategory = normalizeText(
        entityCategory || "Sem categoria",
      );
      return normalizedCategory === tableNorm;
    });

    return {
      key: getTableIdFromCategory(tableName),
      tableId: getTableIdFromCategory(tableName),
      title: tableName,
      entities: entitiesInTable,
    };
  });
};

export const buildBpmnFieldsByEntityKey = (bpmnOpportunities) => {
  const map = new Map();
  const safeOpportunities = Array.isArray(bpmnOpportunities)
    ? bpmnOpportunities
    : [];

  const ensureEntityFieldMap = (entityKey) => {
    if (!map.has(entityKey)) {
      map.set(entityKey, new Map());
    }
    return map.get(entityKey);
  };

  const getFieldUniqueKey = (field) => {
    const id = String(field?.id || "").trim();
    if (id) return `id:${id}`;
    const normalizedName = normalizeText(field?.nome);
    if (normalizedName) return `name:${normalizedName}`;
    return null;
  };

  safeOpportunities.forEach((opportunity) => {
    const opportunityTableName = getOpportunityName(opportunity);
    const nodes = Array.isArray(opportunity?.bpmn?.nodes)
      ? opportunity.bpmn.nodes
      : [];

    nodes.forEach((node) => {
      if (node?.active === false) return;

      const nodeType = normalizeText(node?.nodeType);
      if (nodeType === "task" || nodeType === "condicional") return;

      const entityKeys = [];
      if (
        node?.entidadeId !== null &&
        node?.entidadeId !== undefined &&
        String(node.entidadeId).trim()
      ) {
        entityKeys.push(`id:${String(node.entidadeId).trim()}`);
      }

      const nodeEntityName = normalizeText(
        node?.entidadeNome || node?.label || node?.subtitle,
      );
      if (nodeEntityName && opportunityTableName) {
        const tableNameKey = getEntityTableNameKey(
          nodeEntityName,
          opportunityTableName,
        );
        if (tableNameKey) {
          entityKeys.push(tableNameKey);
        }
      }

      if (entityKeys.length === 0) return;

      const nodeFields = Array.isArray(node?.selectedEntityFields)
        ? node.selectedEntityFields
        : [];

      const normalizedFields = nodeFields
        .map((field) => ({
          id: String(field?.id || "").trim(),
          nome: String(field?.nome || "").trim(),
          tipo: String(field?.tipo || "").trim() || "Texto",
          obrigatorio:
            field?.obrigatorio === true ||
            String(field?.obrigatorio || "") === "Sim",
          keyType: String(field?.keyType || field?.chave || "NORMAL")
            .trim()
            .toUpperCase(),
          relacionamento: String(field?.relacionamento || "").trim() || null,
        }))
        .filter((field) => field.nome);

      if (normalizedFields.length === 0) return;

      entityKeys.forEach((entityKey) => {
        const fieldsMap = ensureEntityFieldMap(entityKey);
        normalizedFields.forEach((field) => {
          const uniqueKey = getFieldUniqueKey(field);
          if (!uniqueKey) return;
          if (fieldsMap.has(uniqueKey)) return;
          fieldsMap.set(uniqueKey, {
            ...field,
            source: "bpmn",
          });
        });
      });
    });
  });

  return map;
};

export const mergeEntityFields = ({ entidade, bpmnFieldsByEntityKey }) => {
  if (!entidade) return [];

  const baseFields = Array.isArray(entidade?.campos) ? entidade.campos : [];
  const mergedMap = new Map();

  baseFields.forEach((field) => {
    const id = String(field?.id || "").trim();
    const nameKey = normalizeText(field?.nome);
    const uniqueKey = id ? `id:${id}` : nameKey ? `name:${nameKey}` : null;
    if (!uniqueKey) return;

    mergedMap.set(uniqueKey, {
      ...field,
      id,
      nome: String(field?.nome || "").trim(),
      tipo: String(field?.tipo || "").trim() || "Texto",
      obrigatorio:
        field?.obrigatorio === true ||
        String(field?.obrigatorio || "") === "Sim",
      keyType: String(field?.keyType || field?.chave || "NORMAL")
        .trim()
        .toUpperCase(),
      relacionamento: String(field?.relacionamento || "").trim() || null,
      source: "entidade",
      entidadeId: getEntidadeId(entidade),
      entidadeNome: String(entidade?.nome || "").trim(),
    });
  });

  const entityId = getEntidadeId(entidade);
  const entityName = entidade?.nome || entidade?.name || entidade?.titulo || "";
  const entityCategory = entidade?.categoria || "Sem categoria";
  const entityKeys = [
    entityId !== null && entityId !== undefined && String(entityId).trim()
      ? `id:${String(entityId).trim()}`
      : null,
    getEntityTableNameKey(entityName, entityCategory),
  ].filter(Boolean);

  entityKeys.forEach((entityKey) => {
    const bpmnFields = bpmnFieldsByEntityKey.get(entityKey);
    if (!bpmnFields) return;

    bpmnFields.forEach((field, fieldKey) => {
      if (mergedMap.has(fieldKey)) return;

      mergedMap.set(fieldKey, {
        ...field,
        id:
          String(field?.id || "").trim() ||
          `bpmn-${normalizeText(entidade?.nome)}-${normalizeText(field?.nome)}`,
        entidadeId: getEntidadeId(entidade),
        entidadeNome: String(entidade?.nome || "").trim(),
        readonlyFromBpmn: true,
      });
    });
  });

  return Array.from(mergedMap.values());
};

export const buildBpmnUsageCountByEntityKey = (bpmnOpportunities) => {
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

      const nodeType = String(node?.nodeType || "")
        .trim()
        .toLowerCase();
      if (nodeType === "task" || nodeType === "condicional") return;

      const nodeEntityId = node?.entidadeId;
      if (
        nodeEntityId !== null &&
        nodeEntityId !== undefined &&
        String(nodeEntityId).trim()
      ) {
        keysInOpportunity.add(`id:${String(nodeEntityId).trim()}`);
      }

      const nodeEntityName = String(
        node?.entidadeNome || node?.label || node?.subtitle || "",
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
};

export const getEntityTypeLabel = (item) => {
  const explicitType = normalizeText(item?.tipoEntidade);
  if (explicitType === "contato") return "Contato";
  if (explicitType === "processo") return "Processo";
  // Backward compat with old values
  if (explicitType === "principal") return "Processo";
  if (explicitType === "apoio") return "Contato";
  if (explicitType === "associativa") return "Processo";
  if (explicitType === "externa") return "Contato";
  return item?.isPrimaryEntity === true ? "Contato" : "Processo";
};

export const getFieldKeyLabel = (campo, entidadeAtributoChave) => {
  const explicitKeyType = normalizeText(campo?.keyType || campo?.chave);
  if (explicitKeyType === "pk") return "PK";
  if (explicitKeyType === "fk") return "FK";
  if (explicitKeyType === "normal") return "Normal";

  const campoNome = normalizeText(campo?.nome);
  const atributoChaveNome = normalizeText(entidadeAtributoChave);

  if (campoNome && atributoChaveNome && campoNome === atributoChaveNome) {
    return "PK";
  }

  return "Normal";
};

export const getFieldRelationshipLabel = (campo) => {
  const relationship = campo?.relacionamento;
  if (!relationship) return "-";

  if (typeof relationship === "string") {
    return String(relationship).trim() || "-";
  }

  const targetEntity = String(
    relationship?.entidade || relationship?.targetEntity || "",
  ).trim();
  const targetField = String(
    relationship?.campo || relationship?.targetField || "",
  ).trim();

  if (targetEntity && targetField) return `${targetEntity}.${targetField}`;
  if (targetEntity) return targetEntity;
  if (targetField) return targetField;

  return "-";
};
