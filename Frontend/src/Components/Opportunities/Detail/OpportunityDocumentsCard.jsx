import React from "react";
import styles from "./OpportunityDocumentsCard.module.css";
import {
  API_URL,
  REGISTROS_GET,
  REGISTROS_POST,
  REGISTROS_PUT,
} from "../../../Api";
import {
  fetchOpportunitiesPage,
  getAuthToken,
  updateOpportunityById,
} from "../opportunityApi";
import { EntidadesContext } from "../../../Context/EntidadesContext";

const EMPTY_DOC = () => ({
  documentTitle: "",
  documentType: "",
  header: { fields: [] },
  sections: [{ heading: "Descrição", body: "" }],
  footer: "",
  signatureFields: [],
});

const normalizeLabel = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const CONTACT_ENTITY_PATTERN =
  /\b(contato|cliente|fornecedor|responsavel|solicitante|pessoa)\b/i;

const inferEntityRoleFromNames = (...values) => {
  const joined = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  if (!joined) return "processo";
  return CONTACT_ENTITY_PATTERN.test(joined) ? "contato" : "processo";
};

const buildHeaderFieldsFromInfoRow = (infoRows, stageLabel) => {
  if (!Array.isArray(infoRows) || !stageLabel) return [];
  const normalized = normalizeLabel(stageLabel);
  const row = infoRows.find((r) => normalizeLabel(r?.label) === normalized);
  if (!row || !Array.isArray(row.campos) || row.campos.length === 0) return [];
  return row.campos
    .filter(
      (c) =>
        String(c?.nome || "").trim() && normalizeLabel(c?.nome) !== "descricao",
    )
    .map((c) => ({
      label: String(c.nome).trim(),
      value: "",
      _isCampo: true,
      _tipo: String(c?.tipo || "Texto").trim(),
      _obrigatorio: c?.obrigatorio === true,
      _keyType: String(c?.keyType || "NORMAL")
        .trim()
        .toUpperCase(),
    }));
};

const normalizeFieldTypeLabel = (value) => {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (!normalized) return "Texto";
  if (normalized.includes("bool") || normalized === "sim/nao")
    return "Booleano";
  if (
    normalized.includes("int") ||
    normalized.includes("num") ||
    normalized.includes("decimal") ||
    normalized.includes("float")
  ) {
    return "Número";
  }
  if (normalized.includes("date") || normalized.includes("data")) return "Data";
  if (normalized.includes("mail") || normalized.includes("email"))
    return "Email";
  if (normalized.includes("tel") || normalized.includes("phone"))
    return "Telefone";
  return "Texto";
};

const buildHeaderFieldsFromBpmnNode = (bpmnNodes, stageLabel) => {
  if (!Array.isArray(bpmnNodes) || !stageLabel) return [];
  const normalized = normalizeLabel(stageLabel);
  const node = bpmnNodes.find((item) => {
    if (!item) return false;
    const names = [
      item?.taskNome,
      item?.condicionalNome,
      item?.entidadeNome,
      item?.label,
    ]
      .map((value) => normalizeLabel(value))
      .filter(Boolean);
    return names.includes(normalized);
  });

  const rawFields =
    node?.selectedEntityFields || node?.campos || node?.fields || [];

  if (!Array.isArray(rawFields) || rawFields.length === 0) return [];

  return rawFields
    .filter((field) => String(field?.nome || field?.label || "").trim())
    .map((field) => ({
      label: String(field?.nome || field?.label || "").trim(),
      value: "",
      _isCampo: true,
      _tipo: normalizeFieldTypeLabel(field?.tipo),
      _obrigatorio: field?.obrigatorio === true,
      _keyType: String(field?.keyType || "NORMAL")
        .trim()
        .toUpperCase(),
    }));
};

const buildHeaderFieldsFromTaskCatalog = (taskCatalog, stageLabel) => {
  if (!Array.isArray(taskCatalog) || !stageLabel) return [];
  const normalized = normalizeLabel(stageLabel);
  const entry = taskCatalog.find((item) => {
    if (!item) return false;
    const names = [item?.taskNome, item?.label, item?.documentTitle]
      .map((value) => normalizeLabel(value))
      .filter(Boolean);
    return names.includes(normalized);
  });

  const rawFields =
    entry?.selectedEntityFields || entry?.campos || entry?.fields || [];

  if (!Array.isArray(rawFields) || rawFields.length === 0) return [];

  return rawFields
    .filter((field) => String(field?.nome || field?.label || "").trim())
    .map((field) => ({
      label: String(field?.nome || field?.label || "").trim(),
      value: "",
      _isCampo: true,
      _tipo: normalizeFieldTypeLabel(field?.tipo),
      _obrigatorio: field?.obrigatorio === true,
      _keyType: String(field?.keyType || field?.chave || "NORMAL")
        .trim()
        .toUpperCase(),
    }));
};

const buildHeaderFieldsFromConditionalCatalog = (
  conditionalCatalog,
  stageLabel,
) => {
  if (!Array.isArray(conditionalCatalog) || !stageLabel) return [];
  const normalized = normalizeLabel(stageLabel);
  const entry = conditionalCatalog.find((item) => {
    if (!item) return false;
    const names = [item?.condicionalNome, item?.label, item?.documentTitle]
      .map((value) => normalizeLabel(value))
      .filter(Boolean);
    return names.includes(normalized);
  });

  const rawFields =
    entry?.selectedEntityFields || entry?.campos || entry?.fields || [];

  if (!Array.isArray(rawFields) || rawFields.length === 0) return [];

  return rawFields
    .filter((field) => String(field?.nome || field?.label || "").trim())
    .map((field) => ({
      label: String(field?.nome || field?.label || "").trim(),
      value: "",
      _isCampo: true,
      _tipo: normalizeFieldTypeLabel(field?.tipo),
      _obrigatorio: field?.obrigatorio === true,
      _keyType: String(field?.keyType || field?.chave || "NORMAL")
        .trim()
        .toUpperCase(),
    }));
};

const mergeHeaderFields = (...fieldGroups) => {
  const merged = [];
  const seen = new Set();

  fieldGroups.flat().forEach((field) => {
    const label = String(field?.label || "").trim();
    if (!label) return;
    const key = normalizeLabel(label);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(field);
  });

  return merged;
};

const mergeTemplateFieldsWithSaved = (templateFields, savedFields) => {
  const template = Array.isArray(templateFields) ? templateFields : [];
  const saved = Array.isArray(savedFields) ? savedFields : [];
  const savedByLabel = new Map(
    saved
      .filter((field) => String(field?.label || "").trim())
      .map((field) => [normalizeLabel(field.label), field]),
  );

  const merged = template.map((field) => {
    const key = normalizeLabel(field.label);
    const savedField = savedByLabel.get(key);
    if (!savedField) return { ...field };
    return {
      ...field,
      ...savedField,
      label: String(savedField.label || field.label || "").trim(),
      value: savedField.value ?? field.value ?? "",
    };
  });

  saved.forEach((field) => {
    const label = String(field?.label || "").trim();
    if (!label) return;
    const key = normalizeLabel(label);
    if (
      savedByLabel.has(key) &&
      template.some((item) => normalizeLabel(item.label) === key)
    )
      return;
    merged.push({ ...field });
  });

  return merged;
};

const buildDescriptionFromInfoRow = (infoRows, stageLabel) => {
  if (!Array.isArray(infoRows) || !stageLabel) return "";
  const normalized = normalizeLabel(stageLabel);
  const row = infoRows.find((r) => normalizeLabel(r?.label) === normalized);
  const raw = String(row?.value || "").trim();
  if (!raw) return "";

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const descLine = lines.find((line) => /^Descri[cç][aã]o\s*:/i.test(line));
  if (!descLine) return "";
  return String(descLine.replace(/^Descri[cç][aã]o\s*:\s*/i, "")).trim();
};

const getStageTypeLabel = (stageType, entityRole = "") => {
  const normalizedType = String(stageType || "").toLowerCase();
  const normalizedRole = String(entityRole || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  switch (normalizedType) {
    case "entidade":
    case "entity":
      if (normalizedRole === "contato") return "Contato";
      if (normalizedRole === "processo") return "Processo";
      return "Processo";
    case "task":
      return "Tarefa";
    case "condicional":
    case "conditional":
      return "Condição";
    default:
      return "Atividade";
  }
};

const buildRferenciaField = (infoRows, stageLabel) => {
  if (!Array.isArray(infoRows) || !stageLabel) return null;
  const normalized = normalizeLabel(stageLabel);
  const row = infoRows.find((r) => normalizeLabel(r?.label) === normalized);
  if (!row) return null;
  const raw = String(row?.value || "");
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^Atributo\s*chave\s*:/i.test(l));
  if (!line) return null;
  const referenciaName = line.replace(/^Atributo\s*chave\s*:\s*/i, "").trim();
  return {
    label: referenciaName || "Referência",
    value: "",
    _isCampo: false,
    _isReference: true,
  };
};

const buildDefaultSections = (infoRows, stageLabel, stageObj = null) => {
  const description = buildDescriptionFromInfoRow(infoRows, stageLabel);
  const sections = [];
  sections.push({ heading: "Descrição", body: description });
  return sections;
};

const getInputTypeForTipo = (tipo) => {
  switch (String(tipo || "").trim()) {
    case "Número":
      return "number";
    case "Data":
      return "date";
    case "Email":
      return "email";
    case "Telefone":
      return "tel";
    default:
      return "text";
  }
};

const REGISTRO_SYSTEM_KEYS = new Set([
  "oportunidadeId",
  "etapa",
  "tipoDocumento",
  "status",
  "descricao",
]);

const CONTACT_SYSTEM_KEYS = new Set([
  "nome",
  "cargo",
  "email",
  "telefone",
  "referencia",
  "descricao",
  "etapa",
  "entidadeid",
  "entidadenome",
  "isprimary",
]);

const resolveDestinationModule = (stageType, entityRole = "") => {
  const normalizedType = normalizeLabel(stageType);
  const normalizedRole = normalizeLabel(entityRole);

  if (normalizedType === "task") return "tarefas";
  if (normalizedType === "condicional" || normalizedType === "conditional") {
    return "condicoes";
  }
  if (normalizedType === "entidade" || normalizedType === "entity") {
    if (normalizedRole === "contato") return "contatos";
    return "processos";
  }
  return "tarefas";
};

const buildStructuredStepDocument = ({
  title,
  documentType,
  description,
  reference,
  fieldValues,
  sections,
  stageLabel,
  stageType,
  entityRole,
  opportunityId,
  anexos,
  graficos,
}) => ({
  versao: 1,
  titulo: String(title || "").trim(),
  tipoDocumento: String(documentType || "").trim(),
  moduloDestino: resolveDestinationModule(stageType, entityRole),
  etapa: {
    nome: String(stageLabel || "").trim(),
    tipo: normalizeLabel(stageType) || "atividade",
    referencia: String(reference || "").trim(),
  },
  oportunidadeId: String(opportunityId || "").trim(),
  descricao: String(description || "").trim(),
  campos: { ...fieldValues },
  secoes: Array.isArray(sections)
    ? sections.map((section) => ({
        heading: String(section?.heading || "").trim(),
        body: String(section?.body || "").trim(),
      }))
    : [],
  anexos: Array.isArray(anexos) ? anexos : [],
  graficos: Array.isArray(graficos) ? graficos : [],
  atualizadoEm: new Date().toISOString(),
});

const getStoredDocument = (payload = {}) => {
  const candidate = payload?.documento;
  if (!candidate || typeof candidate !== "object") return null;
  return candidate;
};

const normalizeDocumentFields = (fields = {}) => {
  const nextValues = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (!String(key || "").trim()) return;
    const normalized = formatStoredValue(value);
    if (!String(normalized || "").trim()) return;
    nextValues[String(key).trim()] = normalized;
  });
  return nextValues;
};

const formatStoredValue = (value) => {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  if (value === null || value === undefined) return "";
  return String(value);
};

const buildSectionsText = (sections = []) =>
  (Array.isArray(sections) ? sections : [])
    .map((section) => {
      const heading = String(section?.heading || "").trim();
      const body = String(section?.body || "").trim();
      if (!heading && !body) return "";
      return heading ? `${heading}: ${body}`.trim() : body;
    })
    .filter(Boolean)
    .join("\n");

const buildSectionsWithDescription = (
  templateSections = [],
  description = "",
) => {
  const nextSections = structuredClone(
    Array.isArray(templateSections) ? templateSections : EMPTY_DOC().sections,
  );

  const descriptionText = String(description || "").trim();
  const descriptionIndex = nextSections.findIndex(
    (section) => normalizeLabel(section?.heading) === "descricao",
  );

  if (descriptionIndex >= 0) {
    nextSections[descriptionIndex] = {
      ...nextSections[descriptionIndex],
      body: descriptionText,
    };
    return nextSections;
  }

  if (!descriptionText) return nextSections;

  return [{ heading: "Descrição", body: descriptionText }, ...nextSections];
};

const toSavedFieldEntries = (values = {}) =>
  Object.entries(values || {})
    .filter(([label]) => String(label || "").trim())
    .map(([label, value]) => ({
      label: String(label).trim(),
      value: formatStoredValue(value),
    }));

const buildFieldValuesObject = (fields = []) => {
  const nextValues = {};

  (Array.isArray(fields) ? fields : []).forEach((field) => {
    const label = String(field?.label || "").trim();
    if (!label || field?._isReference || normalizeLabel(label) === "referencia")
      return;

    const value = formatStoredValue(field?.value);
    if (!String(value).trim()) return;
    nextValues[label] = value;
  });

  return nextValues;
};

const extractFieldValueByAliases = (fieldValues = {}, aliases = []) => {
  const entries = Object.entries(fieldValues || {});
  for (const alias of aliases) {
    const match = entries.find(
      ([key, value]) =>
        normalizeLabel(key) === normalizeLabel(alias) &&
        String(value || "").trim().length > 0,
    );
    if (match) return String(match[1] || "").trim();
  }
  return "";
};

const OpportunityDocumentsCard = React.forwardRef(
  function OpportunityDocumentsCard(
    {
      opportunityId,
      ownerName = "",
      isReadOnlyMode = false,
      activeStageLabel = null,
      stages = [],
      bpmnNodes = [],
      infoRows = [],
      onDocumentSaved = null,
      onSaveComplete = null,
      showSaveButton = true,
      stepAttachments = [],
      stepCharts = [],
      onSavedRecordLoaded = null,
    },
    ref,
  ) {
    const { entidades } = React.useContext(EntidadesContext);
    const [preservedTasksCatalog, setPreservedTasksCatalog] = React.useState(
      [],
    );
    const [preservedConditionalsCatalog, setPreservedConditionalsCatalog] =
      React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [form, setForm] = React.useState(EMPTY_DOC());
    const [saving, setSaving] = React.useState(false);
    const [fieldErrors, setFieldErrors] = React.useState({});

    // Rastreia se o usuário editou o formulário; impede que o efeito
    // syncStageRecord (disparado pelo carregamento async de catálogos)
    // sobreescreva os valores digitados pelo usuário.
    const isDirtyRef = React.useRef(false);
    const prevStageLabelRef = React.useRef(null);

    const activeStageType = React.useMemo(() => {
      const stageLabel = String(activeStageLabel || "")
        .trim()
        .toLowerCase();
      if (!stageLabel) return null;
      const stage = (Array.isArray(stages) ? stages : []).find(
        (s) =>
          String(s?.label || "")
            .trim()
            .toLowerCase() === stageLabel,
      );
      return stage?.stageType || null;
    }, [activeStageLabel, stages]);

    const activeStage = React.useMemo(() => {
      const label = String(activeStageLabel || "")
        .trim()
        .toLowerCase();
      if (!label) return null;
      return (
        (Array.isArray(stages) ? stages : []).find(
          (s) =>
            String(s?.label || "")
              .trim()
              .toLowerCase() === label,
        ) || null
      );
    }, [activeStageLabel, stages]);

    const processEntity = React.useMemo(() => {
      if (activeStageType === "condicional" || activeStageType === "task") {
        return null;
      }

      const stageLabel = String(activeStageLabel || "")
        .trim()
        .toLowerCase();
      if (!stageLabel) return null;

      const catalog = Array.isArray(entidades) ? entidades : [];
      const fromCatalog =
        catalog.find((entity) => {
          const entityName = String(entity?.nome || "")
            .trim()
            .toLowerCase();
          return entityName && entityName === stageLabel;
        }) || null;

      // papelNegocio do passo (já resolvido em buildStagesFromBpmn) tem
      // precedência: garante que um passo marcado como "Contato" no BPMN
      // sempre seja salvo em /contatos, mesmo que o catálogo de entidades
      // ainda não esteja sincronizado.
      const stagePapel = String(activeStage?.papelNegocio || "")
        .trim()
        .toLowerCase();
      const inferredRole = inferEntityRoleFromNames(
        activeStage?.entidadeNome,
        activeStage?.entityName,
        activeStage?.subtitle,
        activeStageLabel,
        fromCatalog?.nome,
      );
      const effectiveRole =
        stagePapel === "contato" || stagePapel === "processo"
          ? stagePapel
          : inferredRole;

      if (fromCatalog) {
        const catalogPapel = String(fromCatalog?.papelNegocio || "")
          .trim()
          .toLowerCase();
        if (effectiveRole && effectiveRole !== catalogPapel) {
          return { ...fromCatalog, papelNegocio: effectiveRole };
        }
        return fromCatalog;
      }

      // Sem entrada no catálogo: usamos o próprio passo como entidade
      // virtual para que o fluxo de save em /contatos funcione.
      if (effectiveRole === "contato" || effectiveRole === "processo") {
        return {
          id: null,
          nome: String(activeStageLabel || "").trim(),
          papelNegocio: effectiveRole,
        };
      }

      return null;
    }, [activeStage, activeStageLabel, activeStageType, entidades]);

    const defaultDocumentType = React.useMemo(
      () => getStageTypeLabel(activeStageType, processEntity?.papelNegocio),
      [activeStageType, processEntity?.papelNegocio],
    );

    const buildTemplateForm = React.useCallback(() => {
      const stageType = String(activeStage?.stageType || "")
        .trim()
        .toLowerCase();
      const referenciaField = buildRferenciaField(infoRows, activeStageLabel);
      const baseFields = mergeHeaderFields(
        buildHeaderFieldsFromInfoRow(infoRows, activeStageLabel),
        buildHeaderFieldsFromTaskCatalog(
          preservedTasksCatalog,
          activeStageLabel,
        ),
        stageType === "condicional"
          ? buildHeaderFieldsFromConditionalCatalog(
              preservedConditionalsCatalog,
              activeStageLabel,
            )
          : [],
        buildHeaderFieldsFromBpmnNode(bpmnNodes, activeStageLabel),
      );
      const preFields = referenciaField
        ? [referenciaField, ...baseFields]
        : baseFields;

      return {
        ...EMPTY_DOC(),
        documentTitle: activeStageLabel || "",
        documentType: defaultDocumentType,
        header: { fields: preFields },
        sections: buildDefaultSections(infoRows, activeStageLabel, activeStage),
      };
    }, [
      activeStage,
      activeStageLabel,
      bpmnNodes,
      defaultDocumentType,
      infoRows,
      preservedConditionalsCatalog,
      preservedTasksCatalog,
    ]);

    const fetchOpportunitySnapshot = React.useCallback(async () => {
      const token = getAuthToken();
      if (!token || !opportunityId) return null;

      const json = await fetchOpportunitiesPage({
        page: 1,
        limit: 10000,
        token,
      });

      const items = Array.isArray(json?.data) ? json.data : [];
      return (
        items.find(
          (opportunity) =>
            String(opportunity?.id || "") === String(opportunityId || ""),
        ) || null
      );
    }, [opportunityId]);

    const resolveReferenceValue = React.useCallback(
      (fields = form.header?.fields) => {
        const referenceField = (Array.isArray(fields) ? fields : []).find(
          (field) =>
            field?._isReference ||
            normalizeLabel(field?.label) === "referencia",
        );
        const value = String(referenceField?.value || "").trim();
        if (value) return value;
        return String(activeStageLabel || "").trim();
      },
      [activeStageLabel, form.header?.fields],
    );

    const serializeCurrentStep = React.useCallback(
      (fieldsOverride) => {
        const fields = fieldsOverride || form.header?.fields || [];
        const fieldValues = buildFieldValuesObject(fields);
        const description = buildSectionsText(form.sections || []);
        const reference = resolveReferenceValue(fields);

        return {
          title: String(
            form.documentTitle || activeStageLabel || "Registro",
          ).trim(),
          documentType: String(
            form.documentType || defaultDocumentType || "",
          ).trim(),
          description,
          reference,
          fieldValues,
          sections: (Array.isArray(form.sections) ? form.sections : []).map(
            (section) => ({
              heading: String(section?.heading || "").trim(),
              body: String(section?.body || "").trim(),
            }),
          ),
          anexos: Array.isArray(stepAttachments) ? stepAttachments : [],
          graficos: Array.isArray(stepCharts) ? stepCharts : [],
        };
      },
      [
        activeStageLabel,
        defaultDocumentType,
        form.documentTitle,
        form.documentType,
        form.header?.fields,
        form.sections,
        resolveReferenceValue,
        stepAttachments,
        stepCharts,
      ],
    );

    const buildFormFromSavedRecord = React.useCallback(
      (templateForm, savedRecord) => {
        if (!savedRecord) return templateForm;

        return {
          ...templateForm,
          documentTitle: String(
            savedRecord.title || templateForm.documentTitle || "",
          ).trim(),
          documentType: String(
            savedRecord.documentType || templateForm.documentType || "",
          ).trim(),
          header: {
            fields: mergeTemplateFieldsWithSaved(
              templateForm.header?.fields || [],
              toSavedFieldEntries(savedRecord.fieldValues || {}),
            ),
          },
          sections: buildSectionsWithDescription(
            templateForm.sections || [],
            savedRecord.description || "",
          ),
        };
      },
      [],
    );

    const loadProcessStageRecord = React.useCallback(async () => {
      if (!processEntity) return null;
      const token = getAuthToken();
      if (!token) return null;

      const request = REGISTROS_GET(
        token,
        String(processEntity.papelNegocio || "processo"),
        String(processEntity.id),
      );
      const response = await fetch(request.url, request.options);
      const existing = response.ok ? await response.json() : [];

      const match = (Array.isArray(existing) ? existing : []).find(
        (registro) => {
          const sameOpportunity =
            String(registro?.dados?.oportunidadeId || "") ===
            String(opportunityId || "");
          const sameStage =
            normalizeLabel(registro?.dados?.etapa) ===
            normalizeLabel(activeStageLabel);
          return sameOpportunity && sameStage;
        },
      );

      if (!match) return null;

      const storedDocument = getStoredDocument(match?.dados);
      if (storedDocument) {
        return {
          title:
            storedDocument.titulo || match?.titulo || String(activeStageLabel),
          documentType:
            storedDocument.tipoDocumento ||
            match?.dados?.tipoDocumento ||
            defaultDocumentType,
          description:
            storedDocument.descricao || match?.dados?.descricao || "",
          fieldValues: normalizeDocumentFields(storedDocument.campos || {}),
        };
      }

      const fieldValues = {};
      Object.entries(match?.dados || {}).forEach(([key, value]) => {
        if (REGISTRO_SYSTEM_KEYS.has(key)) return;
        if (normalizeLabel(key) === "documento") return;
        fieldValues[key] = formatStoredValue(value);
      });

      return {
        title: match?.titulo || activeStageLabel,
        documentType: match?.dados?.tipoDocumento || defaultDocumentType,
        description: match?.dados?.descricao || "",
        fieldValues,
      };
    }, [activeStageLabel, defaultDocumentType, opportunityId, processEntity]);

    const loadActivityStageRecord = React.useCallback(async () => {
      // NOSONAR S3776 - complexidade aceitável
      const stageType = String(activeStageType || "")
        .trim()
        .toLowerCase();
      if (stageType !== "task" && stageType !== "condicional") return null;

      const entityId = String(opportunityId || "").trim();
      if (!entityId) return null;

      const response = await fetch(
        `${API_URL}/api/activities/entity/oportunidade/${entityId}?limit=500`,
      );
      const json = response.ok ? await response.json() : { activities: [] };
      const list = Array.isArray(json?.activities) ? json.activities : [];

      const match = list.find((activity) => {
        const sameType =
          normalizeLabel(activity?.tipo) === normalizeLabel(stageType);
        const stageTag = Array.isArray(activity?.tags)
          ? activity.tags.some(
              (tag) => normalizeLabel(tag) === normalizeLabel(activeStageLabel),
            )
          : false;
        const sameReference =
          normalizeLabel(activity?.referencia) ===
          normalizeLabel(activeStageLabel);
        return sameType && (stageTag || sameReference);
      });

      if (!match) return null;

      const storedDocument = getStoredDocument(match?.extra);
      if (storedDocument) {
        return {
          title: storedDocument.titulo || match?.titulo || activeStageLabel,
          documentType: storedDocument.tipoDocumento || defaultDocumentType,
          description: storedDocument.descricao || match?.descricao || "",
          fieldValues: {
            ...normalizeDocumentFields(storedDocument.campos || {}),
            ...(match?.referencia ? { Referência: match.referencia } : {}),
          },
          anexos: Array.isArray(storedDocument.anexos)
            ? storedDocument.anexos
            : [],
          graficos: Array.isArray(storedDocument.graficos)
            ? storedDocument.graficos
            : [],
        };
      }

      const extraValues =
        match?.extra && typeof match.extra === "object"
          ? Object.fromEntries(
              Object.entries(match.extra).filter(
                ([key]) => normalizeLabel(key) !== "documento",
              ),
            )
          : {};

      return {
        title: match?.titulo || activeStageLabel,
        documentType: defaultDocumentType,
        description: match?.descricao || "",
        fieldValues: {
          ...extraValues,
          ...(match?.referencia ? { Referência: match.referencia } : {}),
        },
      };
    }, [activeStageLabel, activeStageType, defaultDocumentType, opportunityId]);

    const loadContactStageRecord = React.useCallback(async () => {
      if (normalizeLabel(processEntity?.papelNegocio) !== "contato")
        return null;

      const opportunity = await fetchOpportunitySnapshot();
      if (!opportunity) return null;

      const contacts = Array.isArray(opportunity?.contacts)
        ? opportunity.contacts
        : [];
      const match = contacts.find((contact) => {
        const sameStage =
          normalizeLabel(contact?.etapa) === normalizeLabel(activeStageLabel);
        const sameEntity = processEntity?.id
          ? String(contact?.entidadeId || "") === String(processEntity.id)
          : true;
        return sameStage && sameEntity;
      });

      if (!match) return null;

      const extra =
        match?.extra && typeof match.extra === "object" ? match.extra : {};
      const storedDocument = getStoredDocument(extra);
      const extraFieldValues = Object.fromEntries(
        Object.entries(extra).filter(
          ([key]) => normalizeLabel(key) !== "documento",
        ),
      );

      return {
        title:
          storedDocument?.titulo || match?.nome || String(activeStageLabel),
        documentType: storedDocument?.tipoDocumento || defaultDocumentType,
        description: storedDocument?.descricao || match?.descricao || "",
        fieldValues: {
          Nome: match?.nome || "",
          Cargo: match?.cargo || "",
          Email: match?.email || "",
          Telefone: match?.telefone || "",
          ...(match?.referencia ? { Referência: match.referencia } : {}),
          ...normalizeDocumentFields(storedDocument?.campos || {}),
          ...Object.fromEntries(
            Object.entries(extraFieldValues).filter(
              ([key]) => !CONTACT_SYSTEM_KEYS.has(normalizeLabel(key)),
            ),
          ),
        },
      };
    }, [
      activeStageLabel,
      defaultDocumentType,
      fetchOpportunitySnapshot,
      processEntity,
    ]);

    const upsertProcessRegistro = React.useCallback(
      async ({
        title,
        documentType,
        description,
        fieldValues,
        stepDocument,
      }) => {
        if (!processEntity) return;
        const token = getAuthToken();
        if (!token) return;

        const payload = {
          entidadeId: processEntity.id,
          entidadeNome: processEntity.nome,
          papelNegocio: String(processEntity.papelNegocio || "processo"),
          titulo: title,
          dados: {
            ...fieldValues,
            status: "concluido",
            oportunidadeId: String(opportunityId || ""),
            etapa: String(activeStageLabel || ""),
            tipoDocumento: documentType,
            descricao: description,
            documento: stepDocument,
          },
          criadoPor: localStorage.getItem("user_id") || ownerName || "sistema",
        };

        const getReq = REGISTROS_GET(
          token,
          String(processEntity.papelNegocio || "processo"),
          String(processEntity.id),
        );
        const getRes = await fetch(getReq.url, getReq.options);
        const existing = getRes.ok ? await getRes.json() : [];

        const match = (Array.isArray(existing) ? existing : []).find(
          (registro) => {
            const sameOpportunity =
              String(registro?.dados?.oportunidadeId || "") ===
              String(opportunityId || "");
            const sameStage =
              normalizeLabel(registro?.dados?.etapa) ===
              normalizeLabel(activeStageLabel);
            return sameOpportunity && sameStage;
          },
        );

        if (match?.id !== undefined && match?.id !== null) {
          const putReq = REGISTROS_PUT(match.id, payload, token);
          await fetch(putReq.url, putReq.options);
          return;
        }

        const postReq = REGISTROS_POST(payload, token);
        await fetch(postReq.url, postReq.options);
      },
      [activeStageLabel, opportunityId, ownerName, processEntity],
    );

    const upsertContactByStage = React.useCallback(
      async ({ description, fieldValues, stepDocument }) => {
        if (normalizeLabel(processEntity?.papelNegocio) !== "contato") return;

        const token = getAuthToken();
        if (!token) return;

        const snapshot = await fetchOpportunitySnapshot();
        if (!snapshot) return;

        const existingContacts = Array.isArray(snapshot?.contacts)
          ? snapshot.contacts
          : [];

        const match = existingContacts.find((contact) => {
          const sameStage =
            normalizeLabel(contact?.etapa) === normalizeLabel(activeStageLabel);
          const sameEntity = processEntity?.id
            ? String(contact?.entidadeId || "") === String(processEntity.id)
            : true;
          return sameStage && sameEntity;
        });

        const nome =
          extractFieldValueByAliases(fieldValues, [
            "nome",
            "contato",
            "cliente",
          ]) ||
          match?.nome ||
          activeStageLabel ||
          "Contato";
        const cargo =
          extractFieldValueByAliases(fieldValues, [
            "cargo",
            "funcao",
            "função",
          ]) ||
          match?.cargo ||
          "";
        const email =
          extractFieldValueByAliases(fieldValues, ["email", "e-mail"]) ||
          match?.email ||
          "";
        const telefone =
          extractFieldValueByAliases(fieldValues, [
            "telefone",
            "celular",
            "fone",
            "whatsapp",
          ]) ||
          match?.telefone ||
          "";

        const extra = Object.fromEntries(
          Object.entries(fieldValues).filter(
            ([key]) => !CONTACT_SYSTEM_KEYS.has(normalizeLabel(key)),
          ),
        );

        const nextContact = {
          ...match,
          id: match?.id || Date.now() + Math.floor(Math.random() * 1000),
          nome,
          cargo,
          email,
          telefone,
          isPrimary: Boolean(match?.isPrimary),
          entidadeId: processEntity?.id ?? match?.entidadeId ?? "",
          entidadeNome: processEntity?.nome ?? match?.entidadeNome ?? "",
          etapa: String(activeStageLabel || ""),
          referencia: resolveReferenceValue(),
          descricao: description,
          extra: {
            ...extra,
            documento: stepDocument,
          },
        };

        const contacts = match
          ? existingContacts.map((contact) =>
              contact.id === match.id ? nextContact : contact,
            )
          : [...existingContacts, nextContact];

        await updateOpportunityById({
          opportunityId: snapshot.id,
          payload: {
            ...snapshot,
            contacts,
          },
          token,
        });
        // O backend (Backend/main.py _sync_opportunity_contacts_to_independent_table)
        // já sincroniza automaticamente oportunidade.contacts → contatos.json a cada
        // POST/PUT de oportunidade. Não duplicar a chamada aqui — gera duplicatas.
      },
      [
        activeStageLabel,
        fetchOpportunitySnapshot,
        processEntity,
        resolveReferenceValue,
      ],
    );

    const upsertActivityByStage = React.useCallback(
      async ({ title, description, fieldValues, stepDocument }) => {
        const stageType = String(activeStageType || "")
          .trim()
          .toLowerCase();

        const entityId = String(opportunityId || "").trim();
        if (!entityId) return;

        // Determina o tipo da atividade espelhada:
        //   - task        → /tarefas
        //   - condicional → /condicoes
        //   - contato     → /contatos  (entidade com papelNegocio="contato")
        //   - processo    → /processos (entidade com papelNegocio="processo")
        const papelNegocio = normalizeLabel(processEntity?.papelNegocio);
        let tipo;
        if (stageType === "condicional") {
          tipo = "condicional";
        } else if (stageType === "entidade") {
          if (papelNegocio === "contato") {
            tipo = "contato";
          } else if (papelNegocio === "processo") {
            tipo = "processo";
          } else {
            tipo = "processo";
          }
        } else {
          tipo = "task";
        }
        const stageKind =
          tipo === "contato" || tipo === "processo"
            ? tipo
            : stageType || "task";
        const tags = [
          defaultDocumentType,
          String(activeStageLabel || "").trim(),
          stageKind,
        ]
          .map((item) => String(item || "").trim())
          .filter(Boolean);

        const normalizedConditionalDecision = normalizeLabel(
          activeStage?.decisaoCondicional || activeStage?.conditionOutcome,
        );
        const conditionalDecisionText =
          normalizedConditionalDecision === "sim"
            ? "Sim"
            : normalizedConditionalDecision === "nao"
              ? "Não"
              : "";

        const mergedExtra = {
          ...fieldValues,
          documento: stepDocument,
          stage_kind: stageKind,
          stage_label: String(activeStageLabel || "").trim(),
        };

        if (stageType === "condicional" && conditionalDecisionText) {
          mergedExtra.resultado_condicional = conditionalDecisionText;
          mergedExtra.decisao_condicional = normalizedConditionalDecision;
          if (!String(mergedExtra.resultado || "").trim()) {
            mergedExtra.resultado = conditionalDecisionText;
          }
        }

        const payload = {
          titulo: title,
          referencia: resolveReferenceValue(),
          descricao: description || null,
          tipo,
          status: "concluido",
          entidade_tipo: "oportunidade",
          entidade_id: entityId,
          usuario_criador:
            localStorage.getItem("user_id") || ownerName || "sistema",
          tags,
          resultado:
            stageType === "condicional" && conditionalDecisionText
              ? conditionalDecisionText
              : undefined,
          extra: mergedExtra,
        };

        const listRes = await fetch(
          `${API_URL}/api/activities/entity/oportunidade/${entityId}?limit=500`,
        );
        const listJson = listRes.ok ? await listRes.json() : { activities: [] };
        const list = Array.isArray(listJson?.activities)
          ? listJson.activities
          : [];

        const match = list.find((activity) => {
          const sameType =
            normalizeLabel(activity?.tipo) === normalizeLabel(tipo);
          const stageTag = Array.isArray(activity?.tags)
            ? activity.tags.some(
                (tag) =>
                  normalizeLabel(tag) === normalizeLabel(activeStageLabel),
              )
            : false;
          const sameReference =
            normalizeLabel(activity?.referencia) ===
            normalizeLabel(activeStageLabel);
          const sameStageLabel =
            normalizeLabel(activity?.extra?.stage_label) ===
            normalizeLabel(activeStageLabel);
          return sameType && (sameStageLabel || stageTag || sameReference);
        });

        if (match?.id) {
          await fetch(`${API_URL}/api/activities/${match.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          return;
        }

        await fetch(`${API_URL}/api/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      },
      [
        activeStage,
        activeStageLabel,
        activeStageType,
        defaultDocumentType,
        opportunityId,
        ownerName,
        processEntity?.papelNegocio,
        resolveReferenceValue,
      ],
    );

    React.useEffect(() => {
      let cancelled = false;

      const loadTaskCatalog = async () => {
        try {
          const token = getAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch(`${API_URL}/api/bpmn-catalog/tasks`, {
            headers,
          });
          if (!res.ok || cancelled) return;
          const json = await res.json();
          if (!cancelled) {
            setPreservedTasksCatalog(Array.isArray(json) ? json : []);
          }
        } catch {
          /* silent */
        }
      };

      const loadConditionalCatalog = async () => {
        try {
          const token = getAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch(`${API_URL}/api/bpmn-catalog/condicionais`, {
            headers,
          });
          if (!res.ok || cancelled) return;
          const json = await res.json();
          if (!cancelled) {
            setPreservedConditionalsCatalog(Array.isArray(json) ? json : []);
          }
        } catch {
          /* silent */
        }
      };

      loadTaskCatalog();
      loadConditionalCatalog();
      return () => {
        cancelled = true;
      };
    }, []);

    React.useEffect(() => {
      let cancelled = false;

      const syncStageRecord = async () => {
        // NOSONAR S3776 - complexidade aceitável
        if (!activeStageLabel) {
          setForm(EMPTY_DOC());
          isDirtyRef.current = false;
          prevStageLabelRef.current = null;
          return;
        }

        // Se o passo não mudou e o usuário já editou o formulário,
        // não recarregar (catálogos async não devem apagar o input do usuário).
        const stageChanged = prevStageLabelRef.current !== activeStageLabel;
        if (!stageChanged && isDirtyRef.current) return;
        prevStageLabelRef.current = activeStageLabel;
        isDirtyRef.current = false;

        const templateForm = buildTemplateForm();
        setLoading(true);
        setFieldErrors({});

        try {
          let savedRecord = null;

          if (normalizeLabel(processEntity?.papelNegocio) === "contato") {
            savedRecord = await loadContactStageRecord();
          } else if (processEntity) {
            savedRecord = await loadProcessStageRecord();
          } else {
            savedRecord = await loadActivityStageRecord();
          }

          if (cancelled) return;

          setForm(buildFormFromSavedRecord(templateForm, savedRecord));
          if (onSavedRecordLoaded) {
            onSavedRecordLoaded({
              anexos: Array.isArray(savedRecord?.anexos)
                ? savedRecord.anexos
                : [],
              graficos: Array.isArray(savedRecord?.graficos)
                ? savedRecord.graficos
                : [],
            });
          }
        } catch {
          if (cancelled) return;
          setForm(templateForm);
          if (onSavedRecordLoaded) {
            onSavedRecordLoaded({ anexos: [], graficos: [] });
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      syncStageRecord();

      return () => {
        cancelled = true;
      };
    }, [
      activeStageLabel,
      buildFormFromSavedRecord,
      buildTemplateForm,
      loadActivityStageRecord,
      loadContactStageRecord,
      loadProcessStageRecord,
      processEntity,
      onSavedRecordLoaded,
    ]);

    const updateField = (key, value) => {
      isDirtyRef.current = true;
      setForm((p) => ({ ...p, [key]: value }));
    };

    const updateHeaderField = (i, key, value) => {
      isDirtyRef.current = true;
      setForm((p) => {
        const fields = [...(p.header?.fields || [])];
        fields[i] = { ...fields[i], [key]: value };
        return { ...p, header: { ...p.header, fields } };
      });
    };

    const addHeaderField = () =>
      setForm((p) => ({
        ...p,
        header: {
          ...p.header,
          fields: [...(p.header?.fields || []), { label: "", value: "" }],
        },
      }));

    const removeHeaderField = (i) =>
      setForm((p) => ({
        ...p,
        header: {
          ...p.header,
          fields: p.header.fields.filter((_, idx) => idx !== i),
        },
      }));

    const updateSection = (i, key, value) => {
      isDirtyRef.current = true;
      setForm((p) => {
        const sections = [...p.sections];
        sections[i] = { ...sections[i], [key]: value };
        return { ...p, sections };
      });
    };

    const addSection = () =>
      setForm((p) => ({
        ...p,
        sections: [...p.sections, { heading: "", body: "" }],
      }));

    const removeSection = (i) =>
      setForm((p) => ({
        ...p,
        sections: p.sections.filter((_, idx) => idx !== i),
      }));

    const save = React.useCallback(async () => {
      const token = getAuthToken();
      if (!token || !activeStageLabel) {
        throw new Error("Não foi possível validar o passo atual.");
      }

      // Auto-preenche campos Data vazios com a data de hoje (ex: data_criacao)
      const today = new Date().toISOString().split("T")[0];
      const processedFields = (form.header?.fields || []).map((field) => {
        if (
          field._isCampo &&
          field._tipo === "Data" &&
          !String(field.value || "").trim()
        ) {
          return { ...field, value: today };
        }
        return field;
      });

      const errors = {};
      processedFields.forEach((field, index) => {
        // Campos PK/FK são chaves de sistema geradas automaticamente;
        // não devem bloquear o save mesmo que marcados como obrigatórios.
        const keyType = String(field._keyType || "NORMAL").toUpperCase();
        if (
          field._isCampo &&
          field._obrigatorio &&
          keyType !== "PK" &&
          keyType !== "FK" &&
          !String(field.value || "").trim()
        ) {
          errors[index] = `"${field.label}" é obrigatório`;
        }
      });

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const names = Object.values(errors).join(", ");
        throw new Error(
          `Preencha os campos obrigatórios antes de confirmar: ${names}`,
        );
      }

      setFieldErrors({});
      setSaving(true);

      try {
        const serialized = serializeCurrentStep(processedFields);
        const stepDocument = buildStructuredStepDocument({
          title: serialized.title,
          documentType: serialized.documentType,
          description: serialized.description,
          reference: serialized.reference,
          fieldValues: serialized.fieldValues,
          sections: serialized.sections,
          stageLabel: activeStageLabel,
          stageType: activeStageType,
          entityRole: processEntity?.papelNegocio,
          opportunityId,
          anexos: stepAttachments,
          graficos: stepCharts,
        });

        if (normalizeLabel(processEntity?.papelNegocio) === "contato") {
          await upsertContactByStage({
            description: serialized.description,
            fieldValues: serialized.fieldValues,
            stepDocument,
          });
        } else if (processEntity) {
          await upsertProcessRegistro({
            title: serialized.title,
            documentType: serialized.documentType,
            description: serialized.description,
            fieldValues: serialized.fieldValues,
            stepDocument,
          });
        }

        // Independentemente do tipo do passo (task, condicional, entidade
        // ou processo), também persistimos um registro de atividade para
        // que cada passo configurado apareça em /tarefas.
        await upsertActivityByStage({
          title: serialized.title,
          description: serialized.description,
          fieldValues: serialized.fieldValues,
          stepDocument,
        });

        if (onDocumentSaved) {
          onDocumentSaved({
            action: "saved",
            title: serialized.title || activeStageLabel || "Registro",
          });
        }

        if (onSaveComplete) {
          onSaveComplete();
        }
        return true;
      } catch (error) {
        throw error || new Error("Não foi possível salvar o passo.");
      } finally {
        setSaving(false);
      }
    }, [
      activeStageLabel,
      activeStageType,
      form.header?.fields,
      onDocumentSaved,
      onSaveComplete,
      opportunityId,
      processEntity,
      serializeCurrentStep,
      stepAttachments,
      stepCharts,
      upsertActivityByStage,
      upsertContactByStage,
      upsertProcessRegistro,
    ]);

    React.useImperativeHandle(
      ref,
      () => ({
        saveStepRecord: save,
        getStepPreviewData: () => serializeCurrentStep(),
      }),
      [save, serializeCurrentStep],
    );

    return (
      <div className={styles.card}>
        {loading && (
          <div className={styles.editorHeader}>
            <div className={styles.docSelect} aria-live="polite">
              Carregando registro do passo...
            </div>
          </div>
        )}

        <div className={styles.editorBody}>
          <input
            type="text"
            id="documentTitle"
            name="documentTitle"
            className={styles.titleInput}
            value={form.documentTitle}
            onChange={(e) => updateField("documentTitle", e.target.value)}
            placeholder="Título do passo"
            disabled={isReadOnlyMode || Boolean(activeStageLabel)}
          />

          <input
            type="text"
            id="documentType"
            name="documentType"
            className={styles.typeInput}
            value={form.documentType}
            onChange={(e) => updateField("documentType", e.target.value)}
            placeholder="Tipo do registro"
            disabled={isReadOnlyMode || Boolean(defaultDocumentType)}
          />

          <table className={styles.headerTable}>
            <tbody>
              {(form.header?.fields || []).map((f, i) => {
                const isCampo = f._isCampo === true;
                const inputType = isCampo
                  ? getInputTypeForTipo(f._tipo)
                  : "text";
                const isBooleano = isCampo && f._tipo === "Booleano";
                const keyBadge =
                  isCampo && f._keyType !== "NORMAL" ? f._keyType : null;
                const hasError = !!fieldErrors[i];
                const obrigatorioSuffix = f._obrigatorio
                  ? " (obrigatório)"
                  : "";
                const inputPlaceholder = isCampo
                  ? `${f._tipo}${obrigatorioSuffix}`
                  : "Valor";
                const fieldRowKey = `field-${f._key || i}`; // NOSONAR S6479 - chave estável: linhas só adicionam/removem
                return (
                  <tr key={fieldRowKey}>
                    <td className={styles.headerLabel}>
                      <div className={styles.fieldLabelRow}>
                        {isCampo ? (
                          <span
                            className={`${styles.inlineLabelStatic} ${hasError ? styles.inlineLabelError : ""}`}
                          >
                            {f.label}
                            {f._obrigatorio && (
                              <span
                                className={styles.requiredStar}
                                title="Obrigatório"
                              >
                                *
                              </span>
                            )}
                            {keyBadge && (
                              <span
                                className={styles.keyBadge}
                                data-key={keyBadge}
                              >
                                {keyBadge}
                              </span>
                            )}
                          </span>
                        ) : (
                          <input
                            type="text"
                            id={`header-field-label-${i}`}
                            name={`header-field-label-${i}`}
                            className={styles.inlineInput}
                            value={f.label}
                            onChange={(e) =>
                              updateHeaderField(i, "label", e.target.value)
                            }
                            placeholder="Campo"
                            disabled={isReadOnlyMode}
                          />
                        )}
                      </div>
                    </td>
                    <td className={styles.headerValue}>
                      {isBooleano ? (
                        <select
                          id={`header-field-${i}-select`}
                          name={`header-field-${i}`}
                          className={`${styles.inlineInput} ${hasError ? styles.inlineInputError : ""}`}
                          value={f.value}
                          onChange={(e) => {
                            updateHeaderField(i, "value", e.target.value);
                            setFieldErrors((p) => {
                              const n = { ...p };
                              delete n[i];
                              return n;
                            });
                          }}
                          disabled={isReadOnlyMode}
                          required={f._obrigatorio}
                        >
                          <option value="">— selecione —</option>
                          <option value="Sim">Sim</option>
                          <option value="Não">Não</option>
                        </select>
                      ) : (
                        <input
                          type={inputType}
                          id={`header-field-${i}`}
                          name={`header-field-${i}`}
                          className={`${styles.inlineInput} ${hasError ? styles.inlineInputError : ""}`}
                          value={f.value}
                          onChange={(e) => {
                            updateHeaderField(i, "value", e.target.value);
                            setFieldErrors((p) => {
                              const n = { ...p };
                              delete n[i];
                              return n;
                            });
                          }}
                          placeholder={inputPlaceholder}
                          disabled={isReadOnlyMode}
                          required={isCampo && f._obrigatorio}
                        />
                      )}
                      {hasError && (
                        <div className={styles.fieldErrorMsg}>
                          {fieldErrors[i]}
                        </div>
                      )}
                    </td>
                    {!isReadOnlyMode && (
                      <td className={styles.removeTd}>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => {
                            removeHeaderField(i);
                            setFieldErrors((p) => {
                              const n = { ...p };
                              delete n[i];
                              return n;
                            });
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!isReadOnlyMode && (
            <button
              type="button"
              className={styles.addFieldBtn}
              onClick={addHeaderField}
            >
              + Adicionar campo
            </button>
          )}

          <div className={styles.sections}>
            {form.sections.map((s, i) => (
              <div
                key={`section-${i}`} // NOSONAR S6479 - índice estável: seções só são adicionadas/removidas no fim
                className={styles.sectionBlock}
              >
                <div className={styles.sectionHeader}>
                  <input
                    type="text"
                    id={`section-heading-${i}`}
                    name={`section-heading-${i}`}
                    className={styles.sectionTitleInput}
                    value={s.heading}
                    onChange={(e) =>
                      updateSection(i, "heading", e.target.value)
                    }
                    placeholder={`${i + 1}. Título da seção`}
                    disabled={isReadOnlyMode}
                  />
                  {!isReadOnlyMode && (
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeSection(i)}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <textarea
                  id={`section-body-${i}`}
                  name={`section-body-${i}`}
                  className={styles.sectionBody}
                  value={s.body}
                  onChange={(e) => updateSection(i, "body", e.target.value)}
                  placeholder="Conteúdo da seção..."
                  rows={4}
                  disabled={isReadOnlyMode}
                />
              </div>
            ))}
            {!isReadOnlyMode && (
              <button
                type="button"
                className={styles.addSectionBtn}
                onClick={addSection}
              >
                + Adicionar seção
              </button>
            )}
          </div>
        </div>

        {!isReadOnlyMode && showSaveButton && (
          <div className={styles.editorFooter}>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={save}
              disabled={saving || loading || !activeStageLabel}
            >
              {saving ? "Salvando registro..." : "Salvar registro do passo"}
            </button>
          </div>
        )}
      </div>
    );
  },
);

export default OpportunityDocumentsCard;
