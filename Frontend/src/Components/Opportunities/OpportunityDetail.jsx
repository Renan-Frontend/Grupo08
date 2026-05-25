import React, { useContext } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import EditablePipeline from "./Pipeline/EditablePipeline";
import Close from "../Helper/Close";
import styles from "./OpportunityDetail.module.css";
import { UserContext } from "../../Context/UserContext";
import { EntidadesContext } from "../../Context/EntidadesContext";
import OpportunitySummary from "./Detail/OpportunitySummary";
import OpportunityDocumentsCard from "./Detail/OpportunityDocumentsCard";
import OpportunityTopBar from "./Detail/OpportunityTopBar";
import HiddenSection from "./Detail/HiddenSection";
import ProductsCard from "./Detail/ProductsCard";
import QuotesCard from "./Detail/QuotesCard";
import ContactsCard from "./Detail/ContactsCard";
import StepAttachmentsCard from "./Detail/StepAttachmentsCard";
import useOpportunityDetailState from "./Detail/useOpportunityDetailState";
import {
  buildOpportunityAutoTimelineItems,
  buildBpmnEntitiesForCatalog,
  buildEntidadesSyncOperations,
  buildOpportunityPayload,
  buildStageActivitiesForCatalog,
  buildActivitiesSyncOperations,
  deleteOpportunity,
  saveOpportunity,
} from "./Detail/opportunityService";
import { getUserDisplayName } from "./opportunityOwnershipRules";
import {
  getAuthToken,
  fetchOpportunitiesPage,
  fetchActivitiesForOpportunity,
  updateActivityById,
  deleteActivityById,
} from "./opportunityApi";
import { isReadOnlyAccessLevelOne } from "../../Utils/accessControl";

const syncPipelineActivities = async ({
  opportunityId,
  opportunityName,
  stages,
  infoRows,
  actorName,
  token,
}) => {
  if (!opportunityId) return;

  const stageActivities = buildStageActivitiesForCatalog({
    opportunityId,
    opportunityName,
    stages,
    infoRows,
    actorName,
  });

  const currentActivities = await fetchActivitiesForOpportunity({
    opportunityId,
    token,
  });

  const { toUpdate } = buildActivitiesSyncOperations({
    currentActivities,
    stageActivities,
  });

  // Identifica atividades criadas pelo sync da pipeline (tag "pipeline")
  // que não correspondem mais a nenhum passo concluído → devem sair de /tarefas.
  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  const validRefs = new Set(
    stageActivities.map((sa) => normalize(sa?.referencia)),
  );
  const toDelete = (Array.isArray(currentActivities) ? currentActivities : [])
    .filter((activity) => {
      const tags = Array.isArray(activity?.tags) ? activity.tags : [];
      const isFromPipeline = tags.some((tag) => normalize(tag) === "pipeline");
      if (!isFromPipeline) return false;
      const ref =
        normalize(activity?.referencia) || normalize(activity?.titulo);
      return !validRefs.has(ref);
    })
    .map((activity) => activity?.id)
    .filter((id) => id !== undefined && id !== null);

  // Removido: criação automática em lote a partir do catálogo da pipeline.
  // Atividades em /tarefas devem ser criadas APENAS via o wizard do passo
  // (OpportunityDocumentsCard.upsertActivityByStage), uma de cada vez.
  // A sync continua atualizando/limpando registros já existentes para
  // refletir renomeações e remoções de passos.

  for (const operation of toUpdate) {
    try {
      await updateActivityById({
        activityId: operation.id,
        payload: operation.payload,
        token,
      });
    } catch (updateError) {
      console.error("Erro ao atualizar atividade da pipeline:", updateError);
    }
  }

  for (const activityId of toDelete) {
    try {
      await deleteActivityById({ activityId, token });
    } catch (deleteError) {
      console.error(
        "Erro ao remover atividade obsoleta da pipeline:",
        deleteError,
      );
    }
  }
};

const STEP_FLOW_TABS = [
  { key: "resumo", label: "Resumo" },
  { key: "contatos", label: "Equipe & Responsáveis" },
  { key: "produtos", label: "Itens & Serviços" },
  { key: "cotacoes", label: "Orçamentos" },
  { key: "anexosGraficos", label: "Anexos & Gráficos" },
  { key: "confirmacao", label: "Revisar & Confirmar" },
];

// Conjuntos de abas personalizadas por tipo de passo. Mantém exatamente 5
// slots com os mesmos `keys` do fluxo padrão para não quebrar os
// callbacks/navegação por índice, apenas troca rótulos e ícones.
const STEP_FLOW_TABS_BY_KIND = {
  task: [
    { key: "resumo", label: "Detalhes da Tarefa", icon: "📋" },
    { key: "contatos", label: "Responsáveis", icon: "👥" },
    { key: "produtos", label: "Checklist & Itens", icon: "✅" },
    { key: "cotacoes", label: "Recursos & Orçamento", icon: "💼" },
    { key: "anexosGraficos", label: "Anexos & Gráficos", icon: "📊" },
    { key: "confirmacao", label: "Revisar & Confirmar", icon: "✔️" },
  ],
  condicional: [
    { key: "resumo", label: "Resumo da Condição", icon: "🔀" },
    { key: "contatos", label: "Critério & Regra", icon: "📐" },
    { key: "produtos", label: "Caminhos (Sim/Não)", icon: "🔁" },
    { key: "cotacoes", label: "Impacto", icon: "📊" },
    { key: "anexosGraficos", label: "Anexos & Gráficos", icon: "📎" },
    { key: "confirmacao", label: "Revisar & Confirmar", icon: "✔️" },
  ],
  contato: [
    { key: "resumo", label: "Resumo do Contato", icon: "👤" },
    { key: "contatos", label: "Dados do Contato", icon: "📇" },
    { key: "produtos", label: "Comunicação", icon: "💬" },
    { key: "cotacoes", label: "Histórico", icon: "📜" },
    { key: "anexosGraficos", label: "Anexos & Gráficos", icon: "📎" },
    { key: "confirmacao", label: "Revisar & Confirmar", icon: "✔️" },
  ],
  processo: [
    { key: "resumo", label: "Resumo do Processo", icon: "⚙️" },
    { key: "contatos", label: "Atores Envolvidos", icon: "👥" },
    { key: "produtos", label: "Atributos do Processo", icon: "🗂️" },
    { key: "cotacoes", label: "Indicadores & SLA", icon: "📊" },
    { key: "anexosGraficos", label: "Anexos & Gráficos", icon: "📎" },
    { key: "confirmacao", label: "Revisar & Confirmar", icon: "✔️" },
  ],
};

const CONTACT_ENTITY_PATTERN = /contato|cliente|pessoa|lead/i;

// Rótulos dos cards reutilizados (ProductsCard / QuotesCard) por tipo de
// passo. Mantém vocabulário neutro: funciona para vendas, matrículas,
// processos administrativos etc. `undefined` = mantém o default do card.
const PRODUCT_LABELS_BY_KIND = {
  task: {
    title: "Checklist & Itens",
    addButton: "+ Adicionar item",
    emptyMessage: "Nenhum item adicionado.",
    emptyIcon: "✅",
    removeTitle: "Remover item",
    itemPlaceholder: "Descrição do item ou subtarefa",
    columns: { item: "Item / Descrição", price: "Valor unit." },
  },
  condicional: {
    title: "Caminhos (Sim / Não)",
    addButton: "+ Adicionar caminho",
    emptyMessage: "Nenhum caminho definido.",
    emptyIcon: "🔁",
    removeTitle: "Remover caminho",
    itemPlaceholder: "Nome do caminho ou regra",
    columns: { item: "Caminho / Regra", price: "Peso" },
  },
  contato: {
    title: "Canais de Comunicação",
    addButton: "+ Adicionar canal",
    emptyMessage: "Nenhum canal cadastrado.",
    emptyIcon: "💬",
    removeTitle: "Remover canal",
    itemPlaceholder: "Ex.: e-mail, WhatsApp, telefone…",
    columns: { item: "Canal / Detalhe", price: "Valor" },
  },
  processo: {
    title: "Atributos do Processo",
    addButton: "+ Adicionar atributo",
    emptyMessage: "Nenhum atributo definido.",
    emptyIcon: "🗂️",
    removeTitle: "Remover atributo",
    itemPlaceholder: "Nome do atributo",
    columns: { item: "Atributo", price: "Valor" },
  },
};

const QUOTE_LABELS_BY_KIND = {
  task: {
    title: "Recursos & Orçamento",
    addButton: "+ Novo registro",
    emptyMessage: "Nenhum anexo ou recurso registrado.",
    itemsTitle: "Itens do registro",
    printButton: "🖨 Imprimir registro",
    importButton: "↑ Importar itens",
    importHint: "Substitui os itens deste registro pelos itens da aba anterior",
    removeButton: "Remover registro",
    removeConfirm: "Remover este registro?",
  },
  condicional: {
    title: "Impacto",
    addButton: "+ Novo cenário",
    emptyMessage: "Nenhum cenário registrado.",
    itemsTitle: "Itens do cenário",
    printButton: "🖨 Imprimir cenário",
    importButton: "↑ Importar caminhos",
    importHint:
      "Substitui os itens deste cenário pelos caminhos da aba anterior",
    removeButton: "Remover cenário",
    removeConfirm: "Remover este cenário?",
  },
  contato: {
    title: "Histórico",
    addButton: "+ Novo registro",
    emptyMessage: "Nenhum registro histórico.",
    itemsTitle: "Itens do registro",
    printButton: "🖨 Imprimir histórico",
    importButton: "↑ Importar canais",
    importHint:
      "Substitui os itens deste registro pelos canais da aba anterior",
    removeButton: "Remover registro",
    removeConfirm: "Remover este registro do histórico?",
  },
  processo: {
    title: "Indicadores & SLA",
    addButton: "+ Novo indicador",
    emptyMessage: "Nenhum indicador registrado.",
    itemsTitle: "Metas do indicador",
    printButton: "🖨 Imprimir indicadores",
    importButton: "↑ Importar atributos",
    importHint:
      "Substitui as metas deste indicador pelos atributos da aba anterior",
    removeButton: "Remover indicador",
    removeConfirm: "Remover este indicador?",
  },
};

const getStepKindFromStage = (stage) => {
  const type = String(stage?.stageType || "").toLowerCase();
  if (type === "task") return "task";
  if (type === "condicional") return "condicional";
  if (type === "entidade") {
    // Prioriza o papel resolvido pelo BPMN (buildStagesFromBpmn já popula
    // stage.papelNegocio a partir do node + catálogo de entidades).
    const papel = String(stage?.papelNegocio || "")
      .trim()
      .toLowerCase();
    if (papel === "contato") return "contato";
    if (papel === "processo") return "processo";
    // Fallback heurístico pelo nome quando o papel ainda não foi sincronizado.
    const entityName = String(
      stage?.entidadeNome ||
        stage?.entityName ||
        stage?.subtitle ||
        stage?.label ||
        "",
    );
    return CONTACT_ENTITY_PATTERN.test(entityName) ? "contato" : "processo";
  }
  return "task";
};

const formatCurrency = (value) => {
  const number = Number.parseFloat(String(value || "0").replace(",", "."));
  if (Number.isNaN(number)) return "R$ 0,00";
  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const calcProductTotal = (product) => {
  const quantity = Number.parseFloat(product?.quantidade) || 0;
  const unitPrice =
    Number.parseFloat(
      String(product?.precoUnitario || "0").replace(",", "."),
    ) || 0;
  const discount = Number.parseFloat(product?.desconto) || 0;
  return quantity * unitPrice * (1 - discount / 100);
};

const calcQuoteItemTotal = (item) => {
  const quantity = Number.parseFloat(item?.quantidade) || 0;
  const unitPrice =
    Number.parseFloat(String(item?.precoUnitario || "0").replace(",", ".")) ||
    0;
  const discount = Number.parseFloat(item?.desconto) || 0;
  return quantity * unitPrice * (1 - discount / 100);
};

const calcQuoteTotal = (quote) => {
  const subtotal = (Array.isArray(quote?.items) ? quote.items : []).reduce(
    (accumulator, item) => accumulator + calcQuoteItemTotal(item),
    0,
  );
  const discount = Number.parseFloat(quote?.desconto) || 0;
  return subtotal * (1 - discount / 100);
};

const normalizeText = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const pickFieldByAliases = (fieldValues = {}, aliases = []) => {
  const entries = Object.entries(fieldValues || {});
  for (const alias of aliases) {
    const match = entries.find(
      ([key, value]) =>
        normalizeText(key) === normalizeText(alias) &&
        String(value || "").trim().length > 0,
    );
    if (match) return String(match[1] || "").trim();
  }
  return "";
};

const OpportunityDetail = () => {
  // NOSONAR S3776 - complexidade aceitável para componente principal
  const { user } = useContext(UserContext);
  const { entidades, adicionarEntidade, editarEntidade } =
    useContext(EntidadesContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();
  const locationOpportunity = location.state?.opportunity || null;
  const [opportunity, setOpportunity] = React.useState(locationOpportunity);
  const stepRecordRef = React.useRef(null);
  const owner = getUserDisplayName(user) || "Nome da conta";
  const actorId = String(user?.id || user?._id || user?.userId || "").trim();
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const [noticeMessage, setNoticeMessage] = React.useState("");
  const [showConditionalWarningModal, setShowConditionalWarningModal] =
    React.useState(false);
  const [showGenerateProcessDocModal, setShowGenerateProcessDocModal] =
    React.useState(false);
  const completionTransitionRef = React.useRef({
    initialized: false,
    wasReady: false,
    opportunityId: null,
  });

  // When navigating from Workflows, only {id, name} is passed.
  // Fetch the full opportunity so BPMN/pipeline data is available.
  React.useEffect(() => {
    if (!opportunity?.id) return;
    let cancelled = false;
    const fetchFull = async () => {
      // NOSONAR S3776 - complexidade aceitável para fetch composto
      try {
        const token = getAuthToken();
        const res = await fetchOpportunitiesPage({
          page: 1,
          limit: 200,
          token,
        });
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        const full = rows.find(
          (r) => String(r?.id ?? "") === String(opportunity.id),
        );
        if (full) {
          setOpportunity(full);
          if (Array.isArray(full.products)) setProducts(full.products);
          if (Array.isArray(full.quotes)) setQuotes(full.quotes);
          if (Array.isArray(full.contacts)) setContacts(full.contacts);
          if (full.probabilidade !== undefined)
            setProbabilidade(full.probabilidade);
          if (full.origemLead !== undefined) setOrigemLead(full.origemLead);
          if (full.motivoFechamento !== undefined)
            setMotivoFechamento(full.motivoFechamento);
        }
      } catch {
        // silent — keep minimal object
      }
    };
    fetchFull();
    return () => {
      cancelled = true;
    };
  }, [opportunity?.id]);

  const [isSavingStepRecord, setIsSavingStepRecord] = React.useState(false);
  const [activeStageId, setActiveStageId] = React.useState(null);
  const [activeStageLabel, setActiveStageLabel] = React.useState(null);
  const [conditionalDecision, setConditionalDecision] = React.useState("");
  const [activeResumoTab, setActiveResumoTab] = React.useState("resumo");
  const [furthestResumoTabIndex, setFurthestResumoTabIndex] = React.useState(0);
  const [stepPreview, setStepPreview] = React.useState(null);
  const [stepAttachments, setStepAttachments] = React.useState([]);
  const [stepCharts, setStepCharts] = React.useState([]);
  const [products, setProducts] = React.useState(() =>
    Array.isArray(locationOpportunity?.products)
      ? locationOpportunity.products
      : [],
  );
  const [quotes, setQuotes] = React.useState(() =>
    Array.isArray(locationOpportunity?.quotes)
      ? locationOpportunity.quotes
      : [],
  );
  const [contacts, setContacts] = React.useState(() =>
    Array.isArray(locationOpportunity?.contacts)
      ? locationOpportunity.contacts
      : [],
  );
  const [probabilidade, setProbabilidade] = React.useState(
    () => locationOpportunity?.probabilidade ?? "",
  );
  const [origemLead, setOrigemLead] = React.useState(
    () => locationOpportunity?.origemLead ?? "",
  );
  const [motivoFechamento, setMotivoFechamento] = React.useState(
    () => locationOpportunity?.motivoFechamento ?? "",
  );
  const {
    deleteConfirm,
    setDeleteConfirm,
    isEditing,
    showPipeline,
    pipelineTitle,
    setPipelineTitle,
    pipelineSubtitle,
    setPipelineSubtitle,
    stages,
    setStages,
    title,
    setTitle,
    infoRows,
    selectedOwner,
    setSelectedOwner,
    timelineItems,
    manualStatus,
    setManualStatus,
    createdDate,
    setCreatedDate,
    endDate,
    setEndDate,
    effectiveStatus,
    toggleEditing,
    togglePipeline,
    setTimelineNoteTitle,
    setTimelineNoteDescription,
    handleAddTimelineItem,
  } = useOpportunityDetailState({
    opportunity,
    slug,
    owner,
    actorName: owner,
    actorId,
    isReadOnlyMode,
  });

  const normalizeStageLabel = React.useCallback(
    (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase(),
    [],
  );

  // Garante etapa ativa válida mesmo quando a pipeline carrega de forma assíncrona.
  React.useEffect(() => {
    if (!Array.isArray(stages) || stages.length === 0) return;

    const hasCurrentById =
      activeStageId !== null &&
      stages.some((stage) => String(stage?.id) === String(activeStageId));
    if (hasCurrentById) return;

    const currentKey = normalizeStageLabel(activeStageLabel);
    const hasCurrent = stages.some(
      (stage) => normalizeStageLabel(stage?.label) === currentKey,
    );
    if (hasCurrent) return;

    const firstOpen = stages.find((stage) => stage?.done !== true) || stages[0];
    const nextLabel = String(firstOpen?.label || "").trim();
    if (firstOpen?.id !== undefined && firstOpen?.id !== null) {
      setActiveStageId(firstOpen.id);
    }
    if (nextLabel) setActiveStageLabel(nextLabel);
  }, [activeStageId, activeStageLabel, stages, normalizeStageLabel]);

  React.useEffect(() => {
    setActiveResumoTab("resumo");
    setFurthestResumoTabIndex(0);
    setStepPreview(null);
    // stepAttachments/stepCharts são reabastecidos pelo callback
    // onSavedRecordLoaded vindo do OpportunityDocumentsCard quando
    // o passo salvo é carregado. Aqui apenas limpamos enquanto a
    // próxima carga não chega para evitar mostrar dados do passo anterior.
    setStepAttachments([]);
    setStepCharts([]);
  }, [activeStageLabel]);

  const handleSavedRecordLoaded = React.useCallback(
    ({ anexos, graficos } = {}) => {
      setStepAttachments(Array.isArray(anexos) ? anexos : []);
      setStepCharts(Array.isArray(graficos) ? graficos : []);
    },
    [],
  );

  const activeStage = React.useMemo(() => {
    if (activeStageId !== null && activeStageId !== undefined) {
      const stageById = (Array.isArray(stages) ? stages : []).find(
        (item) => String(item?.id) === String(activeStageId),
      );
      if (stageById) return stageById;
    }

    const normalizedLabel = normalizeStageLabel(activeStageLabel);
    return (
      (Array.isArray(stages) ? stages : []).find(
        (item) => normalizeStageLabel(item?.label) === normalizedLabel,
      ) || null
    );
  }, [activeStageId, activeStageLabel, normalizeStageLabel, stages]);

  const activeStageType = React.useMemo(
    () => normalizeText(activeStage?.stageType || ""),
    [activeStage],
  );

  React.useEffect(() => {
    if (!activeStage) {
      setConditionalDecision("");
      return;
    }

    if (activeStageType !== "condicional") {
      setConditionalDecision("");
      return;
    }

    const savedDecision = String(
      activeStage?.decisaoCondicional || activeStage?.conditionOutcome || "",
    )
      .trim()
      .toLowerCase();

    if (savedDecision === "sim" || savedDecision === "nao") {
      setConditionalDecision(savedDecision);
    } else {
      setConditionalDecision("");
    }
  }, [activeStage, activeStageType]);

  const activeStageKind = React.useMemo(
    () => getStepKindFromStage(activeStage),
    [activeStage],
  );

  const isProcessFullyConfigured = React.useMemo(() => {
    const stageList = Array.isArray(stages) ? stages : [];
    if (stageList.length === 0) return false;

    return stageList.every((stage) => {
      if (stage?.done !== true) return false;
      if (normalizeText(stage?.stageType || "") !== "condicional") {
        return true;
      }

      const decision = normalizeText(
        stage?.decisaoCondicional || stage?.conditionOutcome || "",
      );
      return decision === "sim" || decision === "nao";
    });
  }, [stages]);

  React.useEffect(() => {
    const currentOpportunityId = String(opportunity?.id || "").trim();
    if (!currentOpportunityId) return;

    const tracker = completionTransitionRef.current;
    if (tracker.opportunityId !== currentOpportunityId) {
      tracker.opportunityId = currentOpportunityId;
      tracker.initialized = false;
      tracker.wasReady = false;
    }

    if (!tracker.initialized) {
      tracker.initialized = true;
      tracker.wasReady = isProcessFullyConfigured;
      return;
    }

    if (!tracker.wasReady && isProcessFullyConfigured) {
      setShowGenerateProcessDocModal(true);
    }

    tracker.wasReady = isProcessFullyConfigured;
  }, [isProcessFullyConfigured, opportunity?.id]);

  const handleGenerateProcessDocument = React.useCallback(() => {
    const opportunityId = String(opportunity?.id || "").trim();
    setShowGenerateProcessDocModal(false);
    if (!opportunityId) return;

    navigate("/documento-processo", {
      state: {
        autoGenerateOpportunityId: opportunityId,
        autoGenerateFromCompletion: true,
      },
    });
  }, [navigate, opportunity?.id]);

  const currentStepFlowTabs = React.useMemo(
    // Rótulos do wizard são fixos (sempre o conjunto "processo") para que a
    // navegação seja consistente entre todos os tipos de passo. A
    // configuração específica por tipo continua acontecendo no conteúdo de
    // cada aba (ex.: ContactsCard só aparece em passos de Contato).
    () => STEP_FLOW_TABS_BY_KIND.processo || STEP_FLOW_TABS,
    [],
  );

  const tabByKey = React.useMemo(() => {
    const map = {};
    currentStepFlowTabs.forEach((tab) => {
      map[tab.key] = tab;
    });
    return map;
  }, [currentStepFlowTabs]);

  const productLabelsForStage = React.useMemo(
    // Rótulos internos dos cards são fixos no conjunto "processo" para
    // ficarem coerentes com as abas do wizard ("Atributos do Processo" /
    // "Indicadores & SLA"), independente do tipo do passo.
    () => PRODUCT_LABELS_BY_KIND.processo || null,
    [],
  );

  const quoteLabelsForStage = React.useMemo(
    () => QUOTE_LABELS_BY_KIND.processo || null,
    [],
  );

  const activeResumoTabIndex = React.useMemo(
    () =>
      Math.max(
        currentStepFlowTabs.findIndex((tab) => tab.key === activeResumoTab),
        0,
      ),
    [activeResumoTab, currentStepFlowTabs],
  );

  const refreshStepPreview = React.useCallback(() => {
    const snapshot = stepRecordRef.current?.getStepPreviewData?.() || null;
    setStepPreview(snapshot);
    return snapshot;
  }, []);

  const handleGoToResumoTab = React.useCallback(
    (tabIndex) => {
      if (tabIndex < 0 || tabIndex >= currentStepFlowTabs.length) return;
      const nextTab = currentStepFlowTabs[tabIndex];
      if (!nextTab) return;
      if (nextTab.key === "confirmacao") {
        refreshStepPreview();
      }
      setFurthestResumoTabIndex((previous) => Math.max(previous, tabIndex));
      setActiveResumoTab(nextTab.key);
    },
    [currentStepFlowTabs, refreshStepPreview],
  );

  const handleNextResumoTab = React.useCallback(() => {
    const nextIndex = Math.min(
      activeResumoTabIndex + 1,
      currentStepFlowTabs.length - 1,
    );
    const nextTab = currentStepFlowTabs[nextIndex];
    if (!nextTab) return;
    if (nextTab.key === "confirmacao") {
      refreshStepPreview();
    }
    setFurthestResumoTabIndex((previous) => Math.max(previous, nextIndex));
    setActiveResumoTab(nextTab.key);
  }, [activeResumoTabIndex, currentStepFlowTabs, refreshStepPreview]);

  const handlePreviousResumoTab = React.useCallback(() => {
    const previousIndex = Math.max(activeResumoTabIndex - 1, 0);
    const previousTab = currentStepFlowTabs[previousIndex];
    if (!previousTab) return;
    setActiveResumoTab(previousTab.key);
  }, [activeResumoTabIndex, currentStepFlowTabs]);

  const handleSaveStepComplete = React.useCallback(
    (options = {}) => {
      if (!activeStageLabel || !Array.isArray(stages) || stages.length === 0) {
        return null;
      }

      const normalizedActiveLabel = normalizeStageLabel(activeStageLabel);
      const currentIndex =
        activeStageId !== null && activeStageId !== undefined
          ? stages.findIndex(
              (stage) => String(stage?.id) === String(activeStageId),
            )
          : stages.findIndex(
              (stage) =>
                normalizeStageLabel(stage?.label) === normalizedActiveLabel,
            );

      if (currentIndex < 0) return null;

      const decisionValue = String(options?.conditionalDecision || "")
        .trim()
        .toLowerCase();
      const updatedStages = stages.map((stage, index) => {
        if (index !== currentIndex) return stage;
        const nextStage = { ...stage, done: true };
        if (normalizeText(stage?.stageType || "") === "condicional") {
          nextStage.decisaoCondicional =
            decisionValue === "sim" || decisionValue === "nao"
              ? decisionValue
              : "";
        }
        return nextStage;
      });

      // O pipeline renderiza progresso usando `stage.done`.
      // Sem atualizar essa flag, o próximo passo não aparece visualmente.
      setStages(updatedStages);

      if (currentIndex < stages.length - 1) {
        const nextStage = stages[currentIndex + 1];
        const nextStageLabel = String(nextStage?.label || "");
        setActiveStageId(nextStage?.id ?? null);
        setActiveStageLabel(nextStageLabel);
        return { updatedStages, nextStageLabel };
      }

      return { updatedStages, nextStageLabel: null };
    },
    [activeStageId, activeStageLabel, stages, setStages, normalizeStageLabel],
  );

  const handleDeleteClick = () => {
    if (isReadOnlyMode) {
      setNoticeMessage(
        "Seu nível de acesso permite apenas visualização de oportunidades.",
      );
      return;
    }
    setDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (isReadOnlyMode) return;
    try {
      if (opportunity?.id) {
        const token = getAuthToken();
        await deleteOpportunity({ token, opportunityId: opportunity.id });
      }

      localStorage.removeItem("atribuirOportunidade");
      setDeleteConfirm(false);
      navigate("/oportunidades");
    } catch (error) {
      setNoticeMessage(error.message || "Erro ao deletar oportunidade");
    }
  };

  const handleDocumentSaved = ({ action, title }) => {
    if (isReadOnlyMode) return;

    let noteTitle = "";
    let noteDescription = "";

    if (action === "saved") {
      noteTitle = `Registro salvo: "${title}"`;
      noteDescription = `Os dados do passo "${activeStageLabel || "sem passo definido"}" foram salvos nos módulos correspondentes.`;
    }

    if (noteTitle && noteDescription) {
      setTimelineNoteTitle(noteTitle);
      setTimelineNoteDescription(noteDescription);

      // Usar setTimeout para garantir que as states foram setadas antes de chamar handleAddTimelineItem
      setTimeout(() => {
        handleAddTimelineItem();
      }, 0);
    }
  };

  const isCreating = location.pathname === "/oportunidades/criar";

  React.useEffect(() => {
    if (isReadOnlyMode && isCreating) {
      setNoticeMessage(
        "Seu nível de acesso permite apenas visualização. Criação de oportunidades está bloqueada.",
      );
      navigate("/oportunidades", { replace: true });
    }
  }, [isCreating, isReadOnlyMode, navigate]);

  const handleSaveOpportunity = async () => {
    if (isReadOnlyMode) {
      setNoticeMessage(
        "Seu nível de acesso permite apenas visualização de oportunidades.",
      );
      return;
    }
    const token = getAuthToken();
    try {
      const timelineItemsWithAutoNotes = buildOpportunityAutoTimelineItems({
        opportunity,
        actorName: owner,
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
        timelineItems,
      });

      const payload = buildOpportunityPayload({
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
        timelineItems: timelineItemsWithAutoNotes,
        showPipeline,
        products,
        quotes,
        contacts,
        probabilidade,
        origemLead,
        motivoFechamento,
      });

      const isExistingOpportunity = Boolean(opportunity?.id);
      if (!isCreating && !isExistingOpportunity) {
        throw new Error("Oportunidade não encontrada para edição");
      }

      const bpmnEntities = buildBpmnEntitiesForCatalog({
        bpmn: opportunity?.bpmn,
        actorName: owner,
        bpmnName: title,
        stages,
        infoRows,
      });
      const { toCreate, toUpdate } = buildEntidadesSyncOperations({
        currentEntidades: entidades,
        bpmnEntities,
      });

      for (const entityPayload of toCreate) {
        await adicionarEntidade(entityPayload, token);
      }

      for (const updateOperation of toUpdate) {
        const entityId = updateOperation?.id;
        if (entityId === null || entityId === undefined) continue;
        await editarEntidade(entityId, updateOperation.payload, token);
      }

      await saveOpportunity({
        payload,
        token,
        isCreating,
        opportunityId: opportunity?.id,
      });

      // Sync atividades/condicionais derivadas da pipeline
      const persistedOpportunityId = opportunity?.id;
      if (persistedOpportunityId) {
        try {
          await syncPipelineActivities({
            opportunityId: persistedOpportunityId,
            opportunityName: title,
            stages,
            infoRows,
            actorName: owner,
            token,
          });
        } catch (syncError) {
          console.error(
            "Falha ao sincronizar atividades da pipeline:",
            syncError,
          );
        }
      }

      navigate("/oportunidades");
    } catch (err) {
      setNoticeMessage(err.message || "Não foi possível salvar a oportunidade");
    }
  };

  const persistOpportunityContext = React.useCallback(
    async (options = {}) => {
      const hasStagesOverride = Array.isArray(options?.stagesOverride);
      const stagesToPersist =
        hasStagesOverride && options.stagesOverride.length > 0
          ? options.stagesOverride
          : stages;

      if (isReadOnlyMode || isCreating || !opportunity?.id) {
        throw new Error(
          "Salve a oportunidade principal antes de registrar o passo.",
        );
      }

      const token = getAuthToken();
      const payload = buildOpportunityPayload({
        title,
        selectedOwner,
        owner,
        createdDate,
        endDate,
        effectiveStatus,
        stages: stagesToPersist,
        infoRows,
        pipelineTitle,
        pipelineSubtitle,
        timelineItems,
        showPipeline,
        products,
        quotes,
        contacts,
        probabilidade,
        origemLead,
        motivoFechamento,
      });

      const savedOpportunity = await saveOpportunity({
        payload,
        token,
        isCreating: false,
        opportunityId: opportunity.id,
      });

      // Sync atividades/condicionais derivadas da pipeline
      try {
        await syncPipelineActivities({
          opportunityId: opportunity.id,
          opportunityName: title,
          stages: stagesToPersist,
          infoRows,
          actorName: owner,
          token,
        });
      } catch (syncError) {
        console.error(
          "Falha ao sincronizar atividades da pipeline:",
          syncError,
        );
      }

      if (savedOpportunity && typeof savedOpportunity === "object") {
        setOpportunity(savedOpportunity);
        if (Array.isArray(savedOpportunity.products)) {
          setProducts(savedOpportunity.products);
        }
        if (Array.isArray(savedOpportunity.quotes)) {
          setQuotes(savedOpportunity.quotes);
        }
        if (Array.isArray(savedOpportunity.contacts)) {
          setContacts(savedOpportunity.contacts);
        }
        if (hasStagesOverride) {
          // Mantém o estado de pipeline recém-editado no cliente para evitar
          // sobrescrita por payload de resposta atrasado.
          setStages(stagesToPersist);
        } else if (Array.isArray(savedOpportunity.stages)) {
          setStages(savedOpportunity.stages);
        }
      }

      return savedOpportunity;
    },
    [
      isReadOnlyMode,
      isCreating,
      opportunity?.id,
      title,
      selectedOwner,
      owner,
      createdDate,
      endDate,
      effectiveStatus,
      stages,
      setStages,
      infoRows,
      pipelineTitle,
      pipelineSubtitle,
      timelineItems,
      showPipeline,
      products,
      quotes,
      contacts,
      probabilidade,
      origemLead,
      motivoFechamento,
    ],
  );

  const handleSaveStepRecord = React.useCallback(
    async (options = {}) => {
      const skipCompletionConfirm = options?.skipCompletionConfirm === true;
      const forcedConditionalDecision = String(
        options?.forcedConditionalDecision || "",
      )
        .trim()
        .toLowerCase();
      const resolvedConditionalDecision =
        forcedConditionalDecision === "sim" ||
        forcedConditionalDecision === "nao"
          ? forcedConditionalDecision
          : conditionalDecision;

      if (isReadOnlyMode) {
        setNoticeMessage(
          "Seu nível de acesso permite apenas visualização de oportunidades.",
        );
        return;
      }

      if (isCreating || !opportunity?.id) {
        setNoticeMessage(
          "Salve a oportunidade antes de registrar os dados do passo.",
        );
        return;
      }

      if (!stepRecordRef.current?.saveStepRecord) {
        setNoticeMessage("Não foi possível acessar o editor do passo atual.");
        return;
      }

      if (
        activeStageType === "condicional" &&
        resolvedConditionalDecision !== "sim" &&
        resolvedConditionalDecision !== "nao"
      ) {
        setActiveResumoTab("confirmacao");
        setShowConditionalWarningModal(true);
        return;
      }

      if (
        activeStageType === "condicional" &&
        (resolvedConditionalDecision === "sim" ||
          resolvedConditionalDecision === "nao")
      ) {
        setConditionalDecision(resolvedConditionalDecision);
      }

      const stepLabel = String(activeStageLabel || "").trim() || "este passo";
      const confirmMsg = `Deseja realmente salvar e concluir "${stepLabel}" do jeito que está? O passo só deve ser concluído após configurar e revisar os dados.`;
      if (!skipCompletionConfirm && !globalThis.confirm(confirmMsg)) {
        return;
      }

      setIsSavingStepRecord(true);
      try {
        refreshStepPreview();
        // saveStepRecord primeiro: validar e salvar o formulário do passo
        // antes de qualquer atualização de estado que possa resetar o form.
        const stepSaved = await stepRecordRef.current.saveStepRecord();
        if (!stepSaved) {
          throw new Error("Não foi possível salvar os dados do passo.");
        }
        refreshStepPreview();
        const completion = handleSaveStepComplete({
          conditionalDecision: resolvedConditionalDecision,
        });
        await persistOpportunityContext({
          stagesOverride: completion?.updatedStages || undefined,
        });
      } catch (error) {
        const msg =
          error?.message || "Não foi possível salvar o registro do passo.";
        // Se há campos obrigatórios não preenchidos no "Resumo do Processo",
        // voltar para aquela aba para que o usuário veja os campos destacados.
        if (msg.toLowerCase().includes("obrigat")) {
          setActiveResumoTab("resumo");
          setNoticeMessage(
            "Há campos obrigatórios não preenchidos no Resumo do Processo. Verifique os campos marcados em vermelho.",
          );
        } else {
          setNoticeMessage(msg);
        }
      } finally {
        setIsSavingStepRecord(false);
      }
    },
    [
      isCreating,
      isReadOnlyMode,
      opportunity?.id,
      handleSaveStepComplete,
      persistOpportunityContext,
      refreshStepPreview,
      activeStageLabel,
      activeStageType,
      conditionalDecision,
      setConditionalDecision,
      setShowConditionalWarningModal,
      setActiveResumoTab,
    ],
  );

  const reviewContacts = React.useMemo(
    () =>
      (Array.isArray(contacts) ? contacts : []).filter(
        (contact) =>
          String(contact?.nome || "").trim() ||
          String(contact?.email || "").trim() ||
          String(contact?.telefone || "").trim(),
      ),
    [contacts],
  );

  const reviewProducts = React.useMemo(
    () =>
      (Array.isArray(products) ? products : []).filter(
        (product) =>
          String(product?.nome || "").trim() ||
          Number(product?.quantidade) ||
          String(product?.precoUnitario || "").trim(),
      ),
    [products],
  );

  const reviewQuotes = React.useMemo(
    () =>
      (Array.isArray(quotes) ? quotes : []).filter(
        (quote) =>
          String(quote?.titulo || "").trim() ||
          (Array.isArray(quote?.items) ? quote.items.length : 0) > 0,
      ),
    [quotes],
  );

  const reviewFieldValues = React.useMemo(
    () => stepPreview?.fieldValues || {},
    [stepPreview?.fieldValues],
  );

  const taskResponsible = React.useMemo(
    () =>
      pickFieldByAliases(reviewFieldValues, [
        "responsavel",
        "responsável",
        "owner",
      ]),
    [reviewFieldValues],
  );

  const taskDeadline = React.useMemo(
    () =>
      pickFieldByAliases(reviewFieldValues, [
        "prazo",
        "deadline",
        "data limite",
      ]),
    [reviewFieldValues],
  );

  const conditionRule = React.useMemo(
    () =>
      pickFieldByAliases(reviewFieldValues, [
        "regra",
        "condicao",
        "condição",
        "criterio",
      ]),
    [reviewFieldValues],
  );

  const processOwner = React.useMemo(
    () =>
      pickFieldByAliases(reviewFieldValues, [
        "responsavel",
        "responsável",
        "gestor",
      ]),
    [reviewFieldValues],
  );

  return (
    <section className={styles.container}>
      <OpportunityTopBar
        isCreating={isCreating}
        isEditing={isEditing}
        isReadOnlyMode={isReadOnlyMode}
        onSaveOpportunity={handleSaveOpportunity}
        onToggleEditing={toggleEditing}
        onDeleteOpportunity={handleDeleteClick}
      />

      <OpportunitySummary
        isReadOnlyMode={isReadOnlyMode}
        title={title}
        setTitle={setTitle}
        createdDate={createdDate}
        setCreatedDate={setCreatedDate}
        endDate={endDate}
        setEndDate={setEndDate}
        showPipeline={showPipeline}
        effectiveStatus={effectiveStatus}
        manualStatus={manualStatus}
        setManualStatus={setManualStatus}
        selectedOwner={selectedOwner}
        setSelectedOwner={setSelectedOwner}
        products={products}
        quotes={quotes}
        probabilidade={probabilidade}
        setProbabilidade={setProbabilidade}
        origemLead={origemLead}
        setOrigemLead={setOrigemLead}
        motivoFechamento={motivoFechamento}
        setMotivoFechamento={setMotivoFechamento}
      />

      {showPipeline && (
        <div className={isEditing ? styles.editableSection : ""}>
          {isEditing && (
            <div className={styles.editControls}>
              <span className={styles.editLabel}>Pipeline</span>
              <button
                type="button"
                className={styles.editButton}
                onClick={togglePipeline}
              >
                Ocultar Pipeline
              </button>
            </div>
          )}
          <EditablePipeline
            isReadOnlyMode={isReadOnlyMode}
            stages={stages}
            setStages={setStages}
            infoRows={infoRows}
            pipelineTitle={pipelineTitle}
            setPipelineTitle={setPipelineTitle}
            pipelineSubtitle={pipelineSubtitle}
            setPipelineSubtitle={setPipelineSubtitle}
            onActiveStage={(stage) => {
              setActiveStageId(stage?.id ?? null);
              setActiveStageLabel(stage ? String(stage.label || "") : null);
            }}
            bpmnNodes={opportunity?.bpmn?.nodes || []}
            bpmnConnections={opportunity?.bpmn?.connections || []}
            onStagesPersist={async (updatedStages) => {
              if (isCreating || isReadOnlyMode || !opportunity?.id) return;
              try {
                await persistOpportunityContext({
                  stagesOverride: updatedStages,
                });
              } catch (err) {
                setNoticeMessage(
                  err?.message ||
                    "Não foi possível salvar a alteração da pipeline.",
                );
              }
            }}
          />
        </div>
      )}

      {!showPipeline && isEditing && (
        <HiddenSection
          label="Pipeline oculta"
          buttonLabel="Mostrar Pipeline"
          onShow={togglePipeline}
          bordered
        />
      )}

      {/* ── Sub-tabs within Resumo: Configure step properties ── */}
      <div className={styles.resumoSubTabs}>
        {currentStepFlowTabs.map((tab, index) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.resumoSubTab} ${activeResumoTab === tab.key ? styles.resumoSubTabActive : ""}`}
            onClick={() => handleGoToResumoTab(index)}
            title={tab.label}
          >
            <span className={styles.resumoStepIndex}>{index + 1}</span>
            <span>
              {tab.icon ? `${tab.icon} ` : ""}
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Resumo: Edit current pipeline step ── */}
      <div
        className={styles.contentGrid}
        style={{ display: activeResumoTab === "resumo" ? undefined : "none" }}
      >
        <OpportunityDocumentsCard
          ref={stepRecordRef}
          opportunityId={opportunity?.id}
          ownerName={owner}
          isReadOnlyMode={isReadOnlyMode}
          activeStageLabel={activeStageLabel}
          stages={stages}
          bpmnNodes={opportunity?.bpmn?.nodes || []}
          infoRows={infoRows}
          onDocumentSaved={handleDocumentSaved}
          showSaveButton={false}
          stepAttachments={stepAttachments}
          stepCharts={stepCharts}
          onSavedRecordLoaded={handleSavedRecordLoaded}
        />
      </div>

      {/* ── Produtos ── */}
      {activeResumoTab === "produtos" && (
        <div className={styles.tabContent}>
          <div className={styles.tabSubtitle}>
            {tabByKey.produtos?.icon || "📦"}{" "}
            {tabByKey.produtos?.label || "Itens & Serviços"} do passo:{" "}
            <strong>{activeStageLabel || "—"}</strong>
          </div>
          <ProductsCard
            products={products}
            onChange={setProducts}
            isReadOnlyMode={isReadOnlyMode}
            activeStageLabel={activeStageLabel}
            labels={productLabelsForStage}
          />
        </div>
      )}

      {/* ── Cotações ── */}
      {activeResumoTab === "cotacoes" && (
        <div className={styles.tabContent}>
          <div className={styles.tabSubtitle}>
            {tabByKey.cotacoes?.icon || "💰"}{" "}
            {tabByKey.cotacoes?.label || "Orçamentos"} do passo:{" "}
            <strong>{activeStageLabel || "—"}</strong>
          </div>
          <QuotesCard
            quotes={quotes}
            products={products}
            onChange={setQuotes}
            isReadOnlyMode={isReadOnlyMode}
            opportunityTitle={title}
            activeStageLabel={activeStageLabel}
            labels={quoteLabelsForStage}
          />
        </div>
      )}

      {/* ── Contatos ── */}
      {activeResumoTab === "contatos" && (
        <div className={styles.tabContent}>
          <div className={styles.tabSubtitle}>
            {tabByKey.contatos?.icon || "👥"}{" "}
            {tabByKey.contatos?.label || "Equipe & Responsáveis"} do passo:{" "}
            <strong>{activeStageLabel || "—"}</strong>
          </div>
          <>
            <ContactsCard
              contacts={contacts}
              onChange={setContacts}
              isReadOnlyMode={isReadOnlyMode}
              activeStageLabel={activeStageLabel}
            />
          </>
        </div>
      )}

      {activeResumoTab === "anexosGraficos" && (
        <div className={styles.tabContent}>
          <div className={styles.tabSubtitle}>
            {tabByKey.anexosGraficos?.icon || "📎"}{" "}
            {tabByKey.anexosGraficos?.label || "Anexos & Gráficos"} do passo:{" "}
            <strong>{activeStageLabel || "—"}</strong>
          </div>
          <StepAttachmentsCard
            attachments={stepAttachments}
            charts={stepCharts}
            onAttachmentsChange={setStepAttachments}
            onChartsChange={setStepCharts}
            isReadOnlyMode={isReadOnlyMode}
            activeStageLabel={activeStageLabel}
          />
        </div>
      )}

      {activeResumoTab === "confirmacao" && (
        <div className={styles.tabContent}>
          <div className={styles.tabSubtitle}>
            Revise o preenchimento do passo{" "}
            <strong>{activeStageLabel || "—"}</strong> antes de confirmar.
          </div>

          <div className={styles.reviewGrid}>
            {/* 1 — Resumo do Processo */}
            <div className={styles.reviewCard}>
              <h3 className={styles.reviewCardTitle}>
                {tabByKey.resumo?.icon || "📋"}{" "}
                {tabByKey.resumo?.label || "Resumo do Processo"}
              </h3>
              <p className={styles.reviewMeta}>
                {stepPreview?.documentType || "Registro do passo"}
              </p>
              <div className={styles.reviewBlock}>
                <strong>Título</strong>
                <span>
                  {stepPreview?.title || activeStageLabel || "Sem título"}
                </span>
              </div>
              <div className={styles.reviewBlock}>
                <strong>Descrição</strong>
                <span>
                  {stepPreview?.description || "Sem descrição informada."}
                </span>
              </div>
              <div className={styles.reviewBlock}>
                <strong>Campos preenchidos</strong>
                {Object.keys(stepPreview?.fieldValues || {}).length > 0 ? (
                  <ul className={styles.reviewList}>
                    {Object.entries(stepPreview?.fieldValues || {}).map(
                      ([label, value]) => (
                        <li key={label}>
                          <strong>{label}:</strong> {String(value || "-")}
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <span>Nenhum campo adicional preenchido.</span>
                )}
              </div>
              {Array.isArray(stepPreview?.sections) &&
                stepPreview.sections.some((s) => s?.heading || s?.body) && (
                  <div className={styles.reviewBlock}>
                    <strong>Seções</strong>
                    <ul className={styles.reviewList}>
                      {stepPreview.sections
                        .filter((s) => s?.heading || s?.body)
                        .map((section, idx) => (
                          <li key={`section-${idx}-${section.heading || ""}`}>
                            <strong>
                              {section.heading || "Seção sem título"}:
                            </strong>{" "}
                            {section.body || "—"}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
            </div>

            {/* 2 — Atores Envolvidos */}
            <div className={styles.reviewCard}>
              <h3 className={styles.reviewCardTitle}>
                {tabByKey.contatos?.icon || "👥"}{" "}
                {tabByKey.contatos?.label || "Atores Envolvidos"}
              </h3>
              <p className={styles.reviewMeta}>
                {reviewContacts.length} contato(s) configurado(s)
              </p>
              {reviewContacts.length > 0 ? (
                <ul className={styles.reviewList}>
                  {reviewContacts.map((contact) => (
                    <li key={contact.id}>
                      <strong>{contact.nome || "Contato sem nome"}</strong>
                      {contact.cargo ? ` • ${contact.cargo}` : ""}
                      {contact.email ? ` • ${contact.email}` : ""}
                      {contact.telefone ? ` • ${contact.telefone}` : ""}
                      {contact.etapa ? ` • Etapa ${contact.etapa}` : ""}
                      {contact.isPrimary ? " (principal)" : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>Nenhum ator configurado nesta etapa.</span>
              )}
            </div>

            {/* 3 — Atributos do Processo */}
            <div className={styles.reviewCard}>
              <h3 className={styles.reviewCardTitle}>
                {tabByKey.produtos?.icon || "🗂️"}{" "}
                {tabByKey.produtos?.label || "Atributos do Processo"}
              </h3>
              <p className={styles.reviewMeta}>
                {reviewProducts.length} atributo(ns) cadastrado(s)
                {reviewProducts.length > 0
                  ? ` • Total ${formatCurrency(
                      reviewProducts.reduce(
                        (accumulator, product) =>
                          accumulator + calcProductTotal(product),
                        0,
                      ),
                    )}`
                  : ""}
              </p>
              {reviewProducts.length > 0 ? (
                <ul className={styles.reviewList}>
                  {reviewProducts.map((product) => (
                    <li key={product.id}>
                      <strong>{product.nome || "Atributo sem nome"}</strong>
                      {` • ${product.quantidade || 0} ${product.unidade || "un"}`}
                      {product.precoUnitario
                        ? ` • ${formatCurrency(calcProductTotal(product))}`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>Nenhum atributo configurado nesta etapa.</span>
              )}
            </div>

            {/* 4 — Indicadores & SLA */}
            <div className={styles.reviewCard}>
              <h3 className={styles.reviewCardTitle}>
                {tabByKey.cotacoes?.icon || "📊"}{" "}
                {tabByKey.cotacoes?.label || "Indicadores & SLA"}
              </h3>
              <p className={styles.reviewMeta}>
                {reviewQuotes.length} indicador(es) configurado(s)
              </p>
              {reviewQuotes.length > 0 ? (
                <ul className={styles.reviewList}>
                  {reviewQuotes.map((quote) => (
                    <li key={quote.id}>
                      <strong>{quote.titulo || "Indicador sem título"}</strong>
                      {quote.status ? ` • ${quote.status}` : ""}
                      {Array.isArray(quote.items) && quote.items.length > 0
                        ? ` • ${quote.items.length} meta(s)`
                        : ""}
                      {quote.items && quote.items.length > 0
                        ? ` • ${formatCurrency(calcQuoteTotal(quote))}`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>Nenhum indicador configurado nesta etapa.</span>
              )}
            </div>

            {/* 5 — Anexos & Gráficos */}
            <div className={styles.reviewCard}>
              <h3 className={styles.reviewCardTitle}>
                {tabByKey.anexosGraficos?.icon || "📎"}{" "}
                {tabByKey.anexosGraficos?.label || "Anexos & Gráficos"}
              </h3>
              <p className={styles.reviewMeta}>
                {stepAttachments.length} anexo(s) • {stepCharts.length}{" "}
                gráfico(s)
              </p>
              {stepAttachments.length === 0 && stepCharts.length === 0 ? (
                <span>Nenhum anexo ou gráfico adicionado.</span>
              ) : (
                <ul className={styles.reviewList}>
                  {stepAttachments.map((a) => (
                    <li key={`anexo-${a.id || a.url || a.nome}`}>
                      <strong>📎 {a.nome || "Arquivo"}</strong>
                      {a.tipo ? ` • ${a.tipo}` : ""}
                    </li>
                  ))}
                  {stepCharts.map((c) => (
                    <li key={`grafico-${c.id}`}>
                      <strong>
                        📊 {c.widgetLabel || "Gráfico"}
                        {c.dashboardName ? ` · ${c.dashboardName}` : ""}
                      </strong>
                      {c.caption ? ` • ${c.caption}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Destino do registro — depende do tipo da etapa */}
            <div className={styles.reviewCard}>
              <h3 className={styles.reviewCardTitle}>🎯 Destino do registro</h3>
              <p className={styles.reviewMeta}>
                Onde este passo será salvo ao confirmar
              </p>
              <div className={styles.reviewBlock}>
                <strong>Contatos</strong>
                <span>
                  {reviewContacts.length > 0
                    ? `${reviewContacts.length} contato(s) prontos para salvar`
                    : "Sem contatos preenchidos"}
                </span>
              </div>
              <div className={styles.reviewBlock}>
                <strong>Processos</strong>
                <span>
                  {activeStageType === "entidade"
                    ? `Aplicável • Responsável: ${processOwner || "não informado"} • ${Object.keys(reviewFieldValues).length} campo(s)`
                    : "Não aplicável neste passo"}
                </span>
              </div>
              <div className={styles.reviewBlock}>
                <strong>Tarefas</strong>
                <span>
                  {activeStageType === "task"
                    ? `Aplicável • Responsável: ${taskResponsible || "não informado"} • Prazo: ${taskDeadline || "não informado"}`
                    : "Não aplicável neste passo"}
                </span>
              </div>
              <div className={styles.reviewBlock}>
                <strong>Condições</strong>
                <span>
                  {activeStageType === "condicional"
                    ? `Aplicável • Regra: ${conditionRule || "não informada"}`
                    : "Não aplicável neste passo"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.wizardFooter}>
        <div className={styles.wizardProgress}>
          Etapa {activeResumoTabIndex + 1} de {currentStepFlowTabs.length}
        </div>
        <div className={styles.wizardActions}>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={handlePreviousResumoTab}
            disabled={activeResumoTabIndex === 0}
          >
            Anterior
          </button>

          {activeResumoTab === "confirmacao" ? (
            !isReadOnlyMode && (
              <>
                <button
                  type="button"
                  className={styles.createBtn}
                  onClick={handleSaveStepRecord}
                  disabled={isSavingStepRecord || !activeStageLabel}
                >
                  {isSavingStepRecord ? "Concluindo..." : "Concluir passo"}
                </button>
              </>
            )
          ) : (
            <button
              type="button"
              className={styles.createBtn}
              onClick={handleNextResumoTab}
              disabled={!activeStageLabel}
            >
              Próximo
            </button>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <Close
          title="Deletar Oportunidade"
          message="Tem certeza que deseja deletar esta oportunidade? Esta ação não pode ser desfeita."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}

      {noticeMessage ? (
        <Close
          title="Aviso"
          message={noticeMessage}
          onConfirm={() => setNoticeMessage("")}
          onCancel={() => setNoticeMessage("")}
          confirmLabel="OK"
          hideCancel
        />
      ) : null}

      {showConditionalWarningModal ? (
        <Close
          title="Decisão da Condicional"
          message="Ao concluir este passo, escolha qual caminho seguir."
          onCancel={() => setShowConditionalWarningModal(false)}
          hideActions
          closeOnOverlay
        >
          <div className={styles.conditionalDecisionActions}>
            <button
              type="button"
              className={styles.conditionalDecisionBtnNo}
              onClick={() => {
                setShowConditionalWarningModal(false);
                setConditionalDecision("nao");
                void handleSaveStepRecord({
                  forcedConditionalDecision: "nao",
                  skipCompletionConfirm: true,
                });
              }}
            >
              Não
            </button>
            <button
              type="button"
              className={styles.conditionalDecisionBtnYes}
              onClick={() => {
                setShowConditionalWarningModal(false);
                setConditionalDecision("sim");
                void handleSaveStepRecord({
                  forcedConditionalDecision: "sim",
                  skipCompletionConfirm: true,
                });
              }}
            >
              Sim
            </button>
          </div>
        </Close>
      ) : null}

      {showGenerateProcessDocModal ? (
        <Close
          title="Processo concluído"
          message="Todos os passos foram concluídos. Deseja gerar agora um documento completo do processo?"
          onConfirm={handleGenerateProcessDocument}
          onCancel={() => setShowGenerateProcessDocModal(false)}
          confirmLabel="Gerar documento"
          cancelLabel="Agora não"
        />
      ) : null}
    </section>
  );
};

export default OpportunityDetail;
