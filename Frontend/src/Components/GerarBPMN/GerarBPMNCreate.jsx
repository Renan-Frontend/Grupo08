import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { BPMN_EDITOR_STATE_GET, BPMN_EDITOR_STATE_PUT } from "../../Api";
import {
  batchSyncEntidades,
  createOpportunity,
  fetchWithTimeout,
  fetchOpportunitiesPage,
  getAuthToken,
  updateOpportunityById,
} from "../Opportunities/opportunityApi";
import { EntidadesContext } from "../../Context/EntidadesContext";
import { UserContext } from "../../Context/UserContext";
import { isReadOnlyAccessLevelOne } from "../../Utils/accessControl";
import { applyBpmnAutoLayout } from "../../Utils/bpmnAutoLayout";
import BpmnFlow from "../Common/BpmnFlow";
import Close from "../Helper/Close";
import GerarBPMNContextSidebar from "./contextSidebar/GerarBPMNContextSidebar";
import {
  BPMN_EDITOR_LOCAL_STORAGE_KEY,
  BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
  DEFAULT_BPMN_NAME,
  EMPTY_CONDITIONAL_FORM,
  EMPTY_ENTITY_FORM,
  EMPTY_TASK_FORM,
  GATEWAY_TYPE_OPTIONS,
  bpmnNameFromSlug,
  createNode,
  generateUniqueId,
  getEntidadeId,
  getEntidadeDescricao,
  getEntidadeNome,
  normalizeBpmnName,
  normalizeEditorConnection,
  normalizeEditorNode,
  normalizeEntityName,
  sanitizeConnectionForPersistence,
  sanitizeNodeForPersistence,
  sanitizeStageNameByNodeType,
  slugifyBpmnName,
  toRequiredLabel,
} from "./gerarBpmnCreate.shared";
import styles from "./GerarBPMNCreate.module.css";

const NOOP = () => {};
const BPMN_CARD_WIDTH = 220;
const BPMN_CARD_HEIGHT = 110;

const getEntityTypeInfoLabel = (rawType) => {
  const normalized = String(rawType || "")
    .trim()
    .toLowerCase();

  if (normalized === "contato") return "Entidade: Contato";
  if (normalized === "processo") return "Entidade: Processo";
  return "";
};

const createEmptyEntityFieldDraft = () => ({
  id: null,
  nome: "",
  tipo: "",
  obrigatorio: null,
  keyType: "",
  referencia: "",
});

const normalizeEntityFieldEntry = (field) => ({
  id: String(field?.id || "").trim(),
  nome: String(field?.nome || "").trim(),
  tipo: String(field?.tipo || "").trim(),
  obrigatorio:
    field?.obrigatorio === true || String(field?.obrigatorio || "") === "Sim",
  keyType: String(field?.keyType || field?.chave || "NORMAL")
    .trim()
    .toUpperCase(),
  relacionamento: String(field?.relacionamento || "").trim() || null,
});

const mergeEntityFieldEntries = (baseFields = [], extraFields = []) => {
  const merged = [];
  const seen = new Set();

  const appendField = (field) => {
    const normalizedField = normalizeEntityFieldEntry(field);
    const byId = normalizedField.id
      ? `id:${normalizedField.id}`
      : `name:${String(normalizedField.nome || "")
          .trim()
          .toLowerCase()}`;

    if (!normalizedField.nome) return;
    if (seen.has(byId)) return;

    seen.add(byId);
    merged.push({
      ...normalizedField,
      id: normalizedField.id || generateUniqueId("field"),
    });
  };

  (Array.isArray(baseFields) ? baseFields : []).forEach(appendField);
  (Array.isArray(extraFields) ? extraFields : []).forEach(appendField);

  return merged;
};

const extractNodeParticipant = (node) => {
  const directParticipant = String(
    node?.participant || node?.lane || node?.pool || "",
  ).trim();
  if (directParticipant) return directParticipant;

  const info = String(node?.info || "").trim();
  const infoMatch = info.match(/Raia:\s*([^|]+)/i);
  if (infoMatch) {
    return String(infoMatch[1] || "").trim();
  }

  const descricaoValue = String(node?.descricao || "").trim();
  const descricaoMatch = descricaoValue.match(/Participante:\s*(.+)$/i);
  if (descricaoMatch) {
    return String(descricaoMatch[1] || "").trim();
  }

  return "";
};

const normalizeDecisionBranchKey = (decisionValue, fallbackIndex = 0) => {
  const normalizedDecision = String(decisionValue || "")
    .trim()
    .toLowerCase();

  if (!normalizedDecision) {
    return fallbackIndex <= 0 ? "main" : `branch:${fallbackIndex}`;
  }

  if (
    normalizedDecision === "sim" ||
    normalizedDecision === "yes" ||
    normalizedDecision === "true" ||
    normalizedDecision === "ok" ||
    normalizedDecision === "aprovado"
  ) {
    return "main";
  }

  if (
    normalizedDecision === "nao" ||
    normalizedDecision === "não" ||
    normalizedDecision === "no" ||
    normalizedDecision === "false" ||
    normalizedDecision === "reprovado"
  ) {
    return "alternate";
  }

  return `branch:${normalizedDecision}`;
};

const normalizeAiCanvasDraft = (rawDraft) => {
  if (!rawDraft || typeof rawDraft !== "object") return null;

  const draftName = String(rawDraft.name || "").trim();

  const stageEntries = Array.isArray(rawDraft.stages)
    ? rawDraft.stages
        .map((stage, index) => {
          if (!stage || typeof stage !== "object") return null;

          const label = String(
            stage.nome || stage.name || stage.label || "",
          ).trim();
          if (!label) return null;

          const stageTypeRaw = String(stage.tipo || stage.type || "task")
            .trim()
            .toLowerCase();
          const normalizedStageType = stageTypeRaw
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
          const isConditionalType = [
            "condicional",
            "conditional",
            "gateway",
            "gate",
            "decision",
            "decisao",
            "decisão",
          ].includes(normalizedStageType);
          const isEntityType = [
            "entidade",
            "dados",
            "data",
            "data entity",
            "dataentity",
            "entity",
            "entidade de dados",
            "data record",
          ].includes(normalizedStageType);
          const nodeType = isConditionalType
            ? "condicional"
            : isEntityType
              ? "entidade"
              : "task";

          const participant = String(
            stage.participante ||
              stage.participant ||
              stage.lane ||
              stage.pool ||
              stage.responsavel ||
              "",
          ).trim();

          return {
            id: String(stage.id || `ai-stage-${index + 1}`).trim(),
            label,
            nodeType,
            participant,
          };
        })
        .filter(Boolean)
    : [];

  const stageById = new Map(
    stageEntries
      .filter((stage) => stage.id)
      .map((stage) => [String(stage.id).toLowerCase(), stage]),
  );
  const stageByLabel = new Map(
    stageEntries.map((stage) => [String(stage.label).toLowerCase(), stage]),
  );

  let normalizedNodes = Array.isArray(rawDraft.nodes)
    ? rawDraft.nodes
        .filter((node) => node && typeof node === "object")
        .map((node, index) => normalizeEditorNode(node, index))
    : [];

  if (!normalizedNodes.length && stageEntries.length) {
    normalizedNodes = stageEntries.map((stage, index) =>
      normalizeEditorNode(
        {
          id: stage.id || `ai-stage-${index + 1}`,
          label: stage.label,
          nodeType: stage.nodeType,
          taskNome: stage.nodeType === "task" ? stage.label : "",
          condicionalNome: stage.nodeType === "condicional" ? stage.label : "",
          entidadeNome: stage.nodeType === "entidade" ? stage.label : "",
          info: stage.participant ? `Raia: ${stage.participant}` : "",
          x: 140 + index * 230,
          y: 140,
        },
        index,
      ),
    );
  }

  normalizedNodes = normalizedNodes.map((node, index) => {
    const nodeId = String(node?.id || "")
      .trim()
      .toLowerCase();
    const label = String(node?.label || "")
      .trim()
      .toLowerCase();
    const matchedStage =
      stageById.get(nodeId) ||
      stageByLabel.get(label) ||
      stageEntries[index] ||
      null;

    if (!matchedStage || !matchedStage.participant) {
      return node;
      // For entity nodes, info = atributoChave and descricao = description.
      // don't override them with participant lane data.
      if (node?.nodeType === "entidade") {
        return node;
      }
    }

    const participantTag = `Raia: ${matchedStage.participant}`;
    const currentInfo = String(node?.info || "").trim();
    const nextInfo = currentInfo
      ? currentInfo.includes(participantTag)
        ? currentInfo
        : `${currentInfo} | ${participantTag}`
      : participantTag;

    return {
      ...node,
      info: nextInfo,
      descricao:
        String(node?.descricao || "").trim() ||
        `Participante: ${matchedStage.participant}`,
    };
  });

  const nodeIds = new Set(
    normalizedNodes
      .map((node) => String(node?.id || "").trim())
      .filter(Boolean),
  );

  let normalizedConnections = Array.isArray(rawDraft.connections)
    ? rawDraft.connections
        .filter((connection) => connection && typeof connection === "object")
        .map((connection, index) =>
          normalizeEditorConnection(connection, index),
        )
        .filter(
          (connection) =>
            nodeIds.has(String(connection?.from || "").trim()) &&
            nodeIds.has(String(connection?.to || "").trim()),
        )
    : [];

  if (!normalizedConnections.length && normalizedNodes.length > 1) {
    normalizedConnections = normalizedNodes.slice(1).map((node, index) =>
      normalizeEditorConnection(
        {
          id: `ai-conn-${index + 1}`,
          from: normalizedNodes[index].id,
          to: node.id,
        },
        index,
      ),
    );
  }

  if (!draftName && !normalizedNodes.length && !normalizedConnections.length) {
    return null;
  }

  return {
    name: draftName,
    nodes: normalizedNodes,
    connections: normalizedConnections,
    stages: stageEntries,
  };
};

const GerarBPMNCreate = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { bpmnSlug = "" } = useParams();
  const BPMN_EDITOR_NAME_DRAFT_KEY = React.useMemo(
    () => `bpmn_editor_name_draft:${String(bpmnSlug || "").trim() || "create"}`,
    [bpmnSlug],
  );
  const viewportRef = React.useRef(null);
  const workspaceFullscreenRef = React.useRef(null);
  const hasAutoFocusedRef = React.useRef(false);
  const hasNormalizedInitialLayoutRef = React.useRef(false);
  const hasHydratedBpmnRef = React.useRef(false);
  const skipNavigationPromptRef = React.useRef(false);
  const isPageUnloadingRef = React.useRef(false);
  const currentPageUrlRef = React.useRef("");
  const lastSelectedNodeIdRef = React.useRef("");
  const pendingTimelineItemsRef = React.useRef([]);
  const currentDraftRef = React.useRef({
    name: DEFAULT_BPMN_NAME,
    nodes: [],
    connections: [],
  });
  const [zoom, setZoom] = React.useState(1);
  const [isSpacePressed, setIsSpacePressed] = React.useState(false);
  const [isPanning, setIsPanning] = React.useState(false);
  const [isViewportHovered, setIsViewportHovered] = React.useState(false);
  const panRef = React.useRef({
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    pointerId: null,
  });
  const pinchRef = React.useRef({ startDist: 0, startZoom: 1 });
  const baseCanvasWidth = 4200;
  const baseCanvasHeight = 2600;
  const [name, setName] = React.useState(() => {
    const fallbackName = bpmnNameFromSlug(bpmnSlug);
    const isCreateMode = !String(bpmnSlug || "").trim();

    if (!isCreateMode || typeof window === "undefined") {
      return fallbackName;
    }

    // Prioridade 1: nome vindo do painel de IA (processName ou aiCanvasDraft.name)
    const aiProcessName =
      String(location?.state?.aiCanvasDraft?.name || "").trim() ||
      String(location?.state?.processName || "").trim();
    if (aiProcessName) return aiProcessName;

    // Prioridade 2: rascunho salvo na sessão
    try {
      const savedName = window.sessionStorage.getItem(
        "bpmn_editor_name_draft:create",
      );
      window.localStorage.removeItem("bpmn_editor_name_draft:create");
      const normalizedSavedName = String(savedName || "").trim();
      return normalizedSavedName || fallbackName;
    } catch {
      return fallbackName;
    }
  });
  const [nodes, setNodes] = React.useState([
    createNode("node-1", "Entidade", 20, 30),
    createNode("node-2", "Entidade", 300, 30),
    createNode("node-3", "Entidade", 580, 30),
  ]);
  const [connections, setConnections] = React.useState([]);
  const [selectedNodeId, setSelectedNodeId] = React.useState("");
  const [selectedConnectionId, setSelectedConnectionId] = React.useState("");
  const [connectTarget, setConnectTarget] = React.useState("");
  const [connectorRevealMode, setConnectorRevealMode] =
    React.useState("hover-side");
  const [isCanvasFullscreen, setIsCanvasFullscreen] = React.useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = React.useState(false);
  const [isPropertiesPinned, setIsPropertiesPinned] = React.useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = React.useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = React.useState(0);
  const [isTutorialLayoutReady, setIsTutorialLayoutReady] =
    React.useState(false);
  const [tutorialSpotlight, setTutorialSpotlight] = React.useState(null);
  const [tutorialPopoverStyle, setTutorialPopoverStyle] = React.useState({
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  });
  const [isDecisionPromptOpen, setIsDecisionPromptOpen] = React.useState(false);
  const [pendingDecisionConnectionId, setPendingDecisionConnectionId] =
    React.useState("");
  const [decisionPromptCustomValue, setDecisionPromptCustomValue] =
    React.useState("");
  const [sidebarConnectionDecisionDraft, setSidebarConnectionDecisionDraft] =
    React.useState("");
  const [isSavingBpmn, setIsSavingBpmn] = React.useState(false);
  const [isLoadingBpmn, setIsLoadingBpmn] = React.useState(true);
  const [invalidEntityNodeId, setInvalidEntityNodeId] = React.useState("");
  const [noticeModal, setNoticeModal] = React.useState({
    open: false,
    title: "Aviso",
    message: "",
  });
  const [createNodeFromConnectionDraft, setCreateNodeFromConnectionDraft] =
    React.useState(null);
  const [skipCreateNodeConnectionPrompt, setSkipCreateNodeConnectionPrompt] =
    React.useState(false);
  const [
    disableCreateNodeConnectionPromptDraft,
    setDisableCreateNodeConnectionPromptDraft,
  ] = React.useState(false);
  const [deleteSelectionDraft, setDeleteSelectionDraft] = React.useState(null);
  const [skipDeleteSelectionPrompt, setSkipDeleteSelectionPrompt] =
    React.useState(false);
  const [
    disableDeleteSelectionPromptDraft,
    setDisableDeleteSelectionPromptDraft,
  ] = React.useState(false);
  const [deleteSuggestedEntityDraft, setDeleteSuggestedEntityDraft] =
    React.useState(null);
  const [skipDeleteSuggestedEntityPrompt, setSkipDeleteSuggestedEntityPrompt] =
    React.useState(false);
  const [
    disableDeleteSuggestedEntityPromptDraft,
    setDisableDeleteSuggestedEntityPromptDraft,
  ] = React.useState(false);
  const [decisionPromptPosition, setDecisionPromptPosition] = React.useState({
    x: null,
    y: null,
  });
  const [viewportMetrics, setViewportMetrics] = React.useState({
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 0,
    clientHeight: 0,
  });
  const [isDesktopSidebarHidden, setIsDesktopSidebarHidden] = React.useState(
    () => {
      if (typeof window === "undefined") return false;
      return window.localStorage.getItem("desktopSidebarHidden") === "true";
    },
  );
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = React.useState(false);
  const [viewportGridWidth, setViewportGridWidth] = React.useState(1200);
  const minimapRef = React.useRef(null);
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 1;
  const ZOOM_STEP = 0.05;
  const [zoomButtonDirection, setZoomButtonDirection] = React.useState(-1);
  const isZoomBetweenLimits = zoom > MIN_ZOOM && zoom < MAX_ZOOM;
  const {
    entidades,
    refetchEntidades,
    adicionarEntidade,
    editarEntidade,
    deletarEntidade,
    getCamposEntidade,
    adicionarCampoEntidade,
    editarCampoEntidade,
    removerCampoEntidade,
    validarNomeEntidadeDuplicado,
    validarNomeCampoDuplicado,
  } = React.useContext(EntidadesContext);
  const { user } = React.useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const actorAccountName = React.useMemo(
    () =>
      String(
        user?.nome || user?.name || user?.username || user?.email || "",
      ).trim() || "Conta atual",
    [user],
  );
  const actorAccountId = React.useMemo(
    () => String(user?.id || user?._id || user?.userId || "").trim(),
    [user],
  );

  React.useEffect(() => {
    if (isReadOnlyMode && !bpmnSlug) {
      navigate("/gerar-bpmn", { replace: true });
    }
  }, [bpmnSlug, isReadOnlyMode, navigate]);

  React.useEffect(() => {
    refetchEntidades().catch(() => {});
  }, [refetchEntidades]);

  const [entityMode, setEntityMode] = React.useState("nova");
  const [stageConfigMode, setStageConfigMode] = React.useState("");
  const [selectedExistingEntityId, setSelectedExistingEntityId] =
    React.useState("");
  const [entityError, setEntityError] = React.useState("");
  const [entitySavedNotice, setEntitySavedNotice] = React.useState("");
  const [entitySavedNoticeNodeId, setEntitySavedNoticeNodeId] =
    React.useState("");
  const [editorNameSaveFeedback, setEditorNameSaveFeedback] =
    React.useState("");
  const [entitySuggestionEntityId, setEntitySuggestionEntityId] =
    React.useState("");
  const [isEntitySuggestionBusy, setIsEntitySuggestionBusy] =
    React.useState(false);
  const [newEntityForm, setNewEntityForm] = React.useState(EMPTY_ENTITY_FORM);
  const [conditionalForm, setConditionalForm] = React.useState(
    EMPTY_CONDITIONAL_FORM,
  );
  const [taskForm, setTaskForm] = React.useState(EMPTY_TASK_FORM);
  const [gatewayTypeDraft, setGatewayTypeDraft] = React.useState("xor");
  const [newEntityFields, setNewEntityFields] = React.useState([]);
  const [selectedDataFieldIds, setSelectedDataFieldIds] = React.useState([]);
  const [entityDraftsByNodeId, setEntityDraftsByNodeId] = React.useState({});
  const [entityFieldDraft, setEntityFieldDraft] = React.useState(() =>
    createEmptyEntityFieldDraft(),
  );
  const [linkedFieldDraft, setLinkedFieldDraft] = React.useState(() =>
    createEmptyEntityFieldDraft(),
  );
  const [linkedEntityFieldsDraft, setLinkedEntityFieldsDraft] =
    React.useState(null);
  const [activeSidebarTab, setActiveSidebarTab] = React.useState("entidade");
  const [pendingAiContextPanel, setPendingAiContextPanel] = React.useState(
    () => {
      const raw = location?.state?.aiContextPanel;
      return raw && typeof raw === "object" ? raw : null;
    },
  );
  const [pendingAiCanvasDraft, setPendingAiCanvasDraft] = React.useState(() =>
    normalizeAiCanvasDraft(location?.state?.aiCanvasDraft),
  );
  const aiContextAppliedRef = React.useRef(false);
  const aiCanvasAppliedRef = React.useRef(false);

  const [leavePageModalOpen, setLeavePageModalOpen] = React.useState(false);
  const pendingLeaveNavRef = React.useRef(null);

  const openLeavePageModal = React.useCallback((onProceed) => {
    pendingLeaveNavRef.current = onProceed;
    setLeavePageModalOpen(true);
  }, []);

  const handleLeaveConfirm = React.useCallback(() => {
    setLeavePageModalOpen(false);
    skipNavigationPromptRef.current = true;
    const fn = pendingLeaveNavRef.current;
    pendingLeaveNavRef.current = null;
    fn?.();
  }, []);

  const handleLeaveCancel = React.useCallback(() => {
    setLeavePageModalOpen(false);
    pendingLeaveNavRef.current = null;
  }, []);

  const tutorialSteps = React.useMemo(
    () => [
      {
        id: "process-name",
        title: "Nome do processo",
        description:
          "Comece por aqui: defina um nome claro e objetivo para identificar este BPMN na listagem e durante as edições futuras.",
        hint: "Dica: use nomes curtos e específicos, por exemplo: Aprovação de orçamento.",
        selector: '[data-tutorial-id="process-name"]',
      },
      {
        id: "reset-layout",
        title: "↺ Voltar ao padrão",
        description:
          "Reorganiza os retângulos no layout padrão automaticamente, útil quando o desenho ficou muito espalhado ou desordenado.",
        hint: "Dica: use este botão antes de apresentar o fluxo, para deixar o layout mais legível.",
        selector: '[data-tutorial-id="reset-layout"]',
      },
      {
        id: "fullscreen-toggle",
        title: "⛶ Tela cheia",
        description:
          "Alterna para modo tela cheia para ganhar mais espaço de edição e melhorar a visualização de fluxos maiores.",
        hint: "Dica: em fluxos grandes, combine tela cheia + zoom para navegar com mais precisão.",
        selector: '[data-tutorial-id="fullscreen-toggle"]',
      },
      {
        id: "desktop-sidebar-toggle",
        title: "Seta do menu lateral",
        description:
          "Essa seta lateral recolhe/expande o menu principal do sistema. Ao recolher, aumenta o espaço útil da tela para trabalhar no BPMN.",
        hint: "Dica: clique na seta quando quiser mais área horizontal para visualizar e editar o fluxo.",
        selector: '[data-tutorial-id="desktop-sidebar-toggle"]',
      },
      {
        id: "save-bpmn",
        title: "SALVAR",
        description:
          "Salva etapas, conexões e configurações do processo e depois retorna para a lista de BPMNs.",
        hint: "Dica: como salvar retorna para a listagem, use quando concluir um bloco importante de alterações.",
        selector: '[data-tutorial-id="save-bpmn"]',
      },
      {
        id: "add-node",
        title: "▭+ Adicionar retângulo",
        description:
          "Cria uma nova etapa no fluxo. Depois, escolha a categoria da etapa: Entidade, Atividade ou Decisão.",
        hint: "Dica: adicione as etapas principais primeiro e depois refine detalhes e conexões.",
        selector: '[data-tutorial-id="add-node"]',
      },
      {
        id: "zoom-toggle",
        title: "− / + Zoom",
        description:
          "Ajusta o nível de zoom do canvas para facilitar leitura detalhada ou visão geral do processo.",
        hint: "Dica: reduza o zoom para visão macro e aumente para editar condições e textos com calma.",
        selector: '[data-tutorial-id="zoom-toggle"]',
      },
      {
        id: "properties-toggle",
        title: "▤ Propriedades fixas",
        description:
          "Mantém o painel de propriedades fixo enquanto você navega pelo fluxo, agilizando ajustes em sequência.",
        hint: "Dica: deixe fixo quando for configurar várias etapas em sequência.",
        selector: '[data-tutorial-id="properties-toggle"]',
      },
      {
        id: "canvas",
        title: "Canvas do fluxo",
        description:
          "Área principal de modelagem: selecione etapas, arraste para reposicionar e crie conexões para montar a lógica do processo.",
        hint: "Dica: clique no fundo para limpar seleção e passe o mouse nos botões para ver a função de cada um.",
        selector: '[data-tutorial-id="canvas-viewport"]',
      },
      {
        id: "canvas-rectangles",
        title: "Retângulos (etapas)",
        description:
          "Cada retângulo representa uma etapa do processo. Clique para selecionar, arraste para reposicionar, use o botão ✕ no canto para excluir e observe os conectores com ✓ (sim/correto) e ✕ (não) nas saídas de decisão.",
        hint: "Dica: organize as etapas da esquerda para a direita e valide os conectores ✓ e ✕ para garantir o caminho correto da decisão.",
        selector: '[data-tutorial-id="canvas-rectangle"]',
      },
      {
        id: "canvas-bands",
        title: "Faixas coloridas dos cards",
        description:
          "A faixa no topo do retângulo indica o tipo da etapa: Entidade (verde), Decisão (azul), Atividade (amarelo); cinza quando sem ligação.",
        hint: "Dica: use as faixas para bater o olho e validar rapidamente se os tipos do fluxo estão corretos.",
        selector: '[data-tutorial-id="canvas-color-band"]',
      },
      {
        id: "canvas-minimap",
        title: "Minimapa e centralização",
        description:
          "O minimapa mostra a visão geral do fluxo. A seta dentro do círculo (botão de centralizar) reposiciona a visualização no conjunto de etapas.",
        hint: "Dica: use a seta do minimapa para voltar rapidamente ao centro quando navegar para áreas distantes.",
        selector: '[data-tutorial-id="canvas-minimap"]',
        popoverPlacement: "left",
      },
      {
        id: "sidebar-overview",
        title: "Painel contextual (visão geral)",
        description:
          "Este painel muda conforme a seleção do canvas. Clique em um retângulo para editar a etapa selecionada.",
        hint: "Dica: se o painel não aparecer, selecione uma etapa no canvas para ativar a edição contextual.",
        selector: '[data-tutorial-id="context-sidebar"]',
        popoverPlacement: "left",
      },
      {
        id: "sidebar-category",
        title: "Categoria da etapa",
        description:
          "Aqui você define o tipo da etapa: Entidade, Atividade ou Decisão. Ao trocar a categoria, os campos de configuração do painel são ajustados automaticamente.",
        hint: "Dica: escolha a categoria primeiro; isso evita preencher campos que não serão usados.",
        selector: '[data-tutorial-id="sidebar-stage-category"]',
        popoverPlacement: "left",
      },
      {
        id: "sidebar-config",
        title: "Área de configuração",
        description:
          "Nesta área você preenche os detalhes da etapa selecionada: dados da entidade, campos, informações da atividade ou definição da decisão.",
        hint: "Dica: edite um bloco por vez (categoria → entidade → salvar) para reduzir erros de validação.",
        selector: '[data-tutorial-id="sidebar-config-area"]',
        popoverPlacement: "left",
      },
      {
        id: "sidebar-save",
        title: "Salvar alterações",
        description:
          "Aplica no fluxo as alterações do item selecionado no painel. Use este botão sempre que finalizar uma edição da etapa ou conexão atual.",
        hint: "Dica: confirme no card do canvas se a alteração refletiu antes de seguir para a próxima etapa.",
        selector: '[data-tutorial-id="sidebar-save-button"]',
        popoverPlacement: "left",
      },
      {
        id: "tutorial",
        title: "TUTORIAL",
        description:
          "Reabre este guia dinâmico sempre que precisar revisar o fluxo de uso e o papel de cada botão.",
        hint: "Dica: use as setas ← e → para navegar rapidamente entre as etapas do tutorial.",
        selector: '[data-tutorial-id="tutorial-button"]',
      },
    ],
    [],
  );

  const activeTutorialSteps = tutorialSteps;

  const { canvasWidth, canvasHeight } = React.useMemo(() => {
    if (nodes.length === 0) {
      return {
        canvasWidth: baseCanvasWidth,
        canvasHeight: baseCanvasHeight,
      };
    }

    const maxX = Math.max(...nodes.map((node) => (node.x || 0) + 320));
    const maxY = Math.max(...nodes.map((node) => (node.y || 0) + 240));

    return {
      canvasWidth: Math.max(baseCanvasWidth, maxX + 480),
      canvasHeight: Math.max(baseCanvasHeight, maxY + 400),
    };
  }, [nodes]);

  const selectedNode = React.useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const hasSelectedNode = Boolean(selectedNodeId);
  const hasSelection = Boolean(selectedNodeId || selectedConnectionId);
  const shouldHideProperties = isSidebarHidden || !hasSelection;

  const handleTogglePropertiesPinned = React.useCallback(() => {
    if (!hasSelection) return;

    setIsPropertiesPinned((previousPinned) => {
      const nextPinned = !previousPinned;

      if (nextPinned || hasSelection) {
        setIsSidebarHidden(false);
      }

      return nextPinned;
    });
  }, [hasSelection]);

  React.useEffect(() => {
    if (hasSelection) return;
    setIsPropertiesPinned(false);
    setIsSidebarHidden(true);
  }, [hasSelection]);

  React.useEffect(() => {
    if (!selectedNodeId) return;

    setIsSidebarHidden(false);
    setSelectedConnectionId("");
  }, [selectedNodeId]);

  const entityOptions = React.useMemo(
    () =>
      (Array.isArray(entidades) ? entidades : [])
        .map((entidade) => ({
          id: getEntidadeId(entidade),
          nome: getEntidadeNome(entidade),
          categoria: String(entidade?.categoria || "").trim(),
        }))
        .filter((entidade) => entidade.nome),
    [entidades],
  );

  const entidadesById = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(entidades) ? entidades : []).forEach((entidade) => {
      const entidadeId = getEntidadeId(entidade);
      if (entidadeId !== null && entidadeId !== undefined) {
        map.set(String(entidadeId), entidade);
      }
    });
    return map;
  }, [entidades]);

  const entidadesByNormalizedName = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(entidades) ? entidades : []).forEach((entidade) => {
      const normalizedName = normalizeEntityName(getEntidadeNome(entidade));
      if (normalizedName) {
        map.set(normalizedName, entidade);
      }
    });
    return map;
  }, [entidades]);

  const resolveLinkedEntityFromNode = React.useCallback(
    (node) => {
      if (!node) return null;
      if (node.nodeType === "task") return null;

      if (node.entidadeId !== null && node.entidadeId !== undefined) {
        const byId = entidadesById.get(String(node.entidadeId));
        if (byId) return byId;
      }

      const legacyName = normalizeEntityName(node.entidadeNome || "");
      if (!legacyName) return null;
      return entidadesByNormalizedName.get(legacyName) || null;
    },
    [entidadesById, entidadesByNormalizedName],
  );

  const resolveEntityIdFromNode = React.useCallback(
    (node) => {
      if (!node) return null;

      if (node.entidadeId !== null && node.entidadeId !== undefined) {
        const byId = entidadesById.get(String(node.entidadeId));
        if (byId) {
          return getEntidadeId(byId);
        }
      }

      const byName = resolveLinkedEntityFromNode(node);
      return byName ? getEntidadeId(byName) : null;
    },
    [entidadesById, resolveLinkedEntityFromNode],
  );

  // REMOVED: The effect that was auto-filling descricao with catalog descriptions.
  // Descriptions should only come from the contextual panel form, not auto-populated.
  // This prevents descriptions from appearing outside the panel on unselected nodes.

  const nodesForCanvas = React.useMemo(
    () =>
      nodes.map((node) => {
        if (node.nodeType === "task") {
          const taskLabel = String(node.taskNome || "").trim() || "Atividade";

          // Priority: form (selected) > draft (saved) > AI-generated (node data)
          const taskDraftDesc = String(
            entityDraftsByNodeId[node.id]?.taskForm?.descricao || "",
          ).trim();
          const aiDesc = String(node.taskDescricao || "").trim();
          const stripTask = (t) =>
            t && t.toLowerCase() !== taskLabel.toLowerCase() ? t : "";

          let descricao = "";
          if (selectedNodeId === node.id) {
            descricao = stripTask(String(taskForm.descricao || "").trim());
          } else if (taskDraftDesc) {
            descricao = stripTask(taskDraftDesc);
          } else {
            descricao = stripTask(aiDesc);
          }

          return {
            ...node,
            label: taskLabel,
            descricao,
            info: "Configuração da atividade",
          };
        }

        if (node.nodeType === "condicional") {
          let label =
            String(node.condicionalNome || "").trim() || "Condicional";

          // Priority: form (selected) > draft (saved) > AI-generated (node data)
          const condDraftDesc = String(
            entityDraftsByNodeId[node.id]?.conditionalForm?.descricao || "",
          ).trim();
          const aiDesc = String(node.condicionalDescricao || "").trim();
          const stripCond = (t) =>
            t && t.toLowerCase() !== label.toLowerCase() ? t : "";

          let descricao = "";
          if (selectedNodeId === node.id && stageConfigMode === "condicional") {
            label = String(conditionalForm.nome || "").trim() || "Condicional";
            descricao = stripCond(
              String(conditionalForm.descricao || "").trim(),
            );
          } else if (condDraftDesc) {
            descricao = stripCond(condDraftDesc);
          } else {
            descricao = stripCond(aiDesc);
          }

          return {
            ...node,
            label,
            descricao,
            info: `Decisão ${String(node.gatewayType || "xor").toUpperCase()}`,
          };
        }

        const linkedEntity =
          resolveLinkedEntityFromNode(node) ||
          (Array.isArray(entidades) ? entidades : []).find((e) => {
            const eId = getEntidadeId(e);
            const eName = normalizeEntityName(getEntidadeNome(e));
            const nodeEntidadeId =
              node.entidadeId !== null && node.entidadeId !== undefined
                ? String(node.entidadeId)
                : "";
            const nodeEntidadeName = normalizeEntityName(
              node.entidadeNome || "",
            );
            return (
              (nodeEntidadeId && String(eId) === nodeEntidadeId) ||
              (nodeEntidadeName && eName === nodeEntidadeName)
            );
          }) ||
          null;
        const entityName = linkedEntity
          ? getEntidadeNome(linkedEntity)
          : String(node.entidadeNome || node.label || "").trim();
        let label = entityName || "Entidade";

        // Helper: return empty string when text is just the entity name repeated
        const stripIfName = (text) => {
          const t = String(text || "").trim();
          return t.toLowerCase() === label.toLowerCase() ? "" : t;
        };

        const catalogDesc = stripIfName(
          linkedEntity ? getEntidadeDescricao(linkedEntity) : "",
        );
        const nodeDraftDesc = stripIfName(
          String(
            entityDraftsByNodeId[node.id]?.newEntityForm?.descricao || "",
          ).trim(),
        );
        const aiDesc = stripIfName(node.descricao);
        let descricao = nodeDraftDesc || catalogDesc || aiDesc;

        // Prefer node's explicit type (set by user/AI on the canvas) over catalog entity type
        let info = getEntityTypeInfoLabel(
          String(node?.tipoEntidade || "").trim() || linkedEntity?.tipoEntidade,
        );

        if (selectedNodeId === node.id && entityMode === "nova") {
          const formNome = String(newEntityForm.nome || "").trim();
          label = formNome || entityName || "Entidade";
          const formDesc = stripIfName(
            String(newEntityForm.descricao || "").trim(),
          );
          descricao = formDesc || nodeDraftDesc || catalogDesc || aiDesc;
          info = getEntityTypeInfoLabel(
            String(node?.tipoEntidade || "").trim() ||
              linkedEntity?.tipoEntidade,
          );
        }

        return {
          ...node,
          label,
          descricao,
          info,
        };
      }),
    [
      conditionalForm.descricao,
      conditionalForm.nome,
      entidades,
      entityMode,
      entityDraftsByNodeId,
      newEntityForm.descricao,
      newEntityForm.nome,
      nodes,
      resolveLinkedEntityFromNode,
      stageConfigMode,
      selectedNodeId,
      taskForm.descricao,
    ],
  );

  const selectedNodeLinkedEntity = React.useMemo(() => {
    if (!selectedNode) return null;
    if (
      selectedNode.nodeType === "condicional" ||
      selectedNode.nodeType === "task"
    ) {
      return null;
    }

    const selectedId =
      selectedNode.entidadeId !== null && selectedNode.entidadeId !== undefined
        ? String(selectedNode.entidadeId)
        : "";
    const selectedName = normalizeEntityName(selectedNode.entidadeNome || "");

    return (
      (Array.isArray(entidades) ? entidades : []).find((entidade) => {
        const entidadeId = getEntidadeId(entidade);
        const entidadeNome = normalizeEntityName(getEntidadeNome(entidade));
        return (
          (selectedId && String(entidadeId) === selectedId) ||
          (selectedName && entidadeNome === selectedName)
        );
      }) || null
    );
  }, [entidades, selectedNode]);

  const fieldEntityTarget = React.useMemo(() => {
    if (
      selectedNode?.nodeType === "condicional" ||
      selectedNode?.nodeType === "task"
    ) {
      return null;
    }

    if (entityMode === "existente" && selectedExistingEntityId) {
      return (
        (Array.isArray(entidades) ? entidades : []).find(
          (entidade) =>
            String(getEntidadeId(entidade)) === selectedExistingEntityId,
        ) || null
      );
    }

    return selectedNodeLinkedEntity || null;
  }, [
    entidades,
    entityMode,
    selectedExistingEntityId,
    selectedNode?.nodeType,
    selectedNodeLinkedEntity,
  ]);

  const linkedEntityFields = React.useMemo(() => {
    if (!fieldEntityTarget) return [];
    return getCamposEntidade(fieldEntityTarget);
  }, [fieldEntityTarget, getCamposEntidade]);

  const linkedEntityFieldsForPanel = React.useMemo(
    () =>
      Array.isArray(linkedEntityFieldsDraft)
        ? linkedEntityFieldsDraft
        : linkedEntityFields,
    [linkedEntityFields, linkedEntityFieldsDraft],
  );

  const selectedDataFieldsForNode = React.useMemo(() => {
    const fieldMap = new Map(
      (Array.isArray(newEntityFields) ? newEntityFields : []).map((field) => [
        String(field?.id ?? "").trim(),
        {
          id: String(field?.id ?? "").trim(),
          nome: String(field?.nome || "").trim(),
        },
      ]),
    );

    return (Array.isArray(selectedDataFieldIds) ? selectedDataFieldIds : [])
      .map((fieldId) => fieldMap.get(String(fieldId || "").trim()))
      .filter(Boolean);
  }, [newEntityFields, selectedDataFieldIds]);

  React.useEffect(() => {
    setLinkedEntityFieldsDraft(null);
  }, [selectedExistingEntityId, selectedNodeId]);

  const selectedExistingEntity = React.useMemo(() => {
    if (!selectedExistingEntityId) return null;
    return (
      (Array.isArray(entidades) ? entidades : []).find(
        (entidade) =>
          String(getEntidadeId(entidade)) === selectedExistingEntityId,
      ) || null
    );
  }, [entidades, selectedExistingEntityId]);

  const entityActionTarget = React.useMemo(
    () => selectedExistingEntity || selectedNodeLinkedEntity || null,
    [selectedExistingEntity, selectedNodeLinkedEntity],
  );

  const suggestedEntity = React.useMemo(() => {
    if (stageConfigMode === "condicional") {
      return null;
    }

    if (entityMode === "existente" && selectedExistingEntity) {
      return selectedExistingEntity;
    }

    if (!entitySuggestionEntityId) return null;

    return (
      (Array.isArray(entidades) ? entidades : []).find(
        (entidade) =>
          String(getEntidadeId(entidade)) === entitySuggestionEntityId,
      ) || null
    );
  }, [
    entidades,
    entityMode,
    entitySuggestionEntityId,
    selectedExistingEntity,
    stageConfigMode,
  ]);

  const isDuplicateSuggestion =
    entityMode === "nova" && Boolean(entitySuggestionEntityId);

  const isEditingEntityAction = Boolean(entityActionTarget);

  React.useEffect(() => {
    if (!selectedNodeId) return;

    const nextDraft = {
      stageConfigMode,
      entityMode,
      selectedExistingEntityId,
      newEntityForm,
      conditionalForm,
      taskForm,
      newEntityFields,
      selectedDataFieldIds,
    };

    setEntityDraftsByNodeId((previous) => {
      const current = previous[selectedNodeId];
      const isSameDraft =
        current &&
        current.stageConfigMode === nextDraft.stageConfigMode &&
        current.entityMode === nextDraft.entityMode &&
        current.selectedExistingEntityId ===
          nextDraft.selectedExistingEntityId &&
        JSON.stringify(current.newEntityForm) ===
          JSON.stringify(nextDraft.newEntityForm) &&
        JSON.stringify(current.conditionalForm) ===
          JSON.stringify(nextDraft.conditionalForm) &&
        JSON.stringify(current.newEntityFields) ===
          JSON.stringify(nextDraft.newEntityFields) &&
        JSON.stringify(current.selectedDataFieldIds) ===
          JSON.stringify(nextDraft.selectedDataFieldIds);

      if (isSameDraft) return previous;

      return {
        ...previous,
        [selectedNodeId]: nextDraft,
      };
    });
  }, [
    conditionalForm,
    entityMode,
    newEntityFields,
    newEntityForm,
    selectedDataFieldIds,
    selectedExistingEntityId,
    selectedNodeId,
    stageConfigMode,
    taskForm,
  ]);

  React.useEffect(() => {
    const currentSelectedNodeId = selectedNode?.id || "";
    const hasNodeChanged =
      currentSelectedNodeId !== lastSelectedNodeIdRef.current;
    lastSelectedNodeIdRef.current = currentSelectedNodeId;

    if (
      hasNodeChanged &&
      entitySavedNotice &&
      entitySavedNoticeNodeId &&
      currentSelectedNodeId !== entitySavedNoticeNodeId
    ) {
      setEntitySavedNotice("");
      setEntitySavedNoticeNodeId("");
    }

    if (!selectedNode) {
      setEntityError("");
      setStageConfigMode("");
      setConditionalForm(EMPTY_CONDITIONAL_FORM);
      setTaskForm(EMPTY_TASK_FORM);
      setGatewayTypeDraft("xor");
      setSelectedDataFieldIds([]);
      setEntityFieldDraft(createEmptyEntityFieldDraft());
      setLinkedFieldDraft(createEmptyEntityFieldDraft());
      setEntitySuggestionEntityId("");
      return;
    }

    if (!hasNodeChanged) {
      return;
    }

    const savedDraft = entityDraftsByNodeId[currentSelectedNodeId];
    const defaultStageMode =
      selectedNode.nodeType === "condicional" ? "condicional" : "";
    const normalizedGatewayType =
      selectedNode.gatewayType === "and" || selectedNode.gatewayType === "or"
        ? selectedNode.gatewayType
        : "xor";
    setGatewayTypeDraft(normalizedGatewayType);
    setTaskForm({
      nome: String(selectedNode.taskNome || "").trim(),
      descricao: String(selectedNode.taskDescricao || "").trim(),
    });

    if (savedDraft) {
      setStageConfigMode(savedDraft.stageConfigMode || defaultStageMode);
      setEntityMode("nova");
      setSelectedExistingEntityId("");
      setNewEntityForm(savedDraft.newEntityForm || EMPTY_ENTITY_FORM);
      setConditionalForm(
        savedDraft.conditionalForm || {
          nome: String(selectedNode.condicionalNome || "").trim(),
          descricao: String(selectedNode.condicionalDescricao || "").trim(),
        },
      );
      setNewEntityFields(
        Array.isArray(savedDraft.newEntityFields)
          ? savedDraft.newEntityFields
          : [],
      );
      setSelectedDataFieldIds(
        Array.isArray(savedDraft.selectedDataFieldIds)
          ? savedDraft.selectedDataFieldIds
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : (Array.isArray(savedDraft.newEntityFields)
              ? savedDraft.newEntityFields
              : []
            )
              .map((field) => String(field?.id ?? "").trim())
              .filter(Boolean),
      );
      setEntityFieldDraft(createEmptyEntityFieldDraft());
      setLinkedFieldDraft(createEmptyEntityFieldDraft());
      setEntityError("");
      return;
    }

    setStageConfigMode(defaultStageMode);
    if (defaultStageMode === "condicional") {
      setConditionalForm({
        nome: String(selectedNode.condicionalNome || "").trim(),
        descricao: String(selectedNode.condicionalDescricao || "").trim(),
      });
    } else {
      setConditionalForm(EMPTY_CONDITIONAL_FORM);
    }

    const stripIfName = (text, nodeLabel) => {
      const value = String(text || "").trim();
      if (!value) return "";
      if (!nodeLabel) return value;
      return value.toLowerCase() ===
        String(nodeLabel || "")
          .trim()
          .toLowerCase()
        ? ""
        : value;
    };

    if (selectedNodeLinkedEntity) {
      setSelectedExistingEntityId("");
      setEntityMode("nova");

      const linkedEntityDesc = String(
        selectedNodeLinkedEntity.descricao || "",
      ).trim();
      const nodeDescValue = String(selectedNode.descricao || "").trim();
      const nodeLabel =
        String(selectedNodeLinkedEntity.nome || "").trim() ||
        String(selectedNode.entidadeNome || selectedNode.label || "").trim();

      const isSameAsLabel =
        nodeDescValue.toLowerCase() === nodeLabel.toLowerCase();
      const finalDesc =
        linkedEntityDesc || (isSameAsLabel ? "" : nodeDescValue);

      setNewEntityForm({
        nome: String(selectedNodeLinkedEntity.nome || "").trim(),
        descricao: finalDesc,
        atributoChave: String(
          selectedNodeLinkedEntity.atributoChave || "",
        ).trim(),
      });

      const existingFields = getCamposEntidade(selectedNodeLinkedEntity).map(
        normalizeEntityFieldEntry,
      );
      const restoredNodeFields = Array.isArray(
        selectedNode?.selectedEntityFields,
      )
        ? selectedNode.selectedEntityFields.map(normalizeEntityFieldEntry)
        : [];
      const mergedFields = mergeEntityFieldEntries(
        existingFields,
        restoredNodeFields,
      );

      setNewEntityFields(mergedFields);
      const availableFieldIds = new Set(
        mergedFields
          .map((field) => String(field?.id ?? "").trim())
          .filter(Boolean),
      );
      const storedNodeFieldIds = (
        Array.isArray(selectedNode?.selectedEntityFieldIds)
          ? selectedNode.selectedEntityFieldIds
          : []
      )
        .map((value) => String(value || "").trim())
        .filter((value) => availableFieldIds.has(value));

      setSelectedDataFieldIds(
        storedNodeFieldIds.length > 0
          ? storedNodeFieldIds
          : Array.from(availableFieldIds),
      );
    } else if (hasNodeChanged) {
      setSelectedExistingEntityId("");
      setEntityMode("nova");
      const nodeLabel =
        String(selectedNode.entidadeNome || "").trim() ||
        String(selectedNode.label || "").trim();
      const nodeDescValue = String(selectedNode.descricao || "").trim();

      const isSameAsLabel =
        nodeDescValue.toLowerCase() === nodeLabel.toLowerCase();

      setNewEntityForm({
        nome: nodeLabel,
        descricao: isSameAsLabel ? "" : nodeDescValue,
        atributoChave: String(selectedNode.info || "").trim(),
      });
      const restoredNodeFields = Array.isArray(
        selectedNode?.selectedEntityFields,
      )
        ? selectedNode.selectedEntityFields.map((field) => ({
            id: String(field?.id || "").trim(),
            nome: String(field?.nome || "").trim(),
            tipo: String(field?.tipo || "").trim(),
            obrigatorio:
              field?.obrigatorio === true ||
              String(field?.obrigatorio || "") === "Sim",
            keyType: String(field?.keyType || field?.chave || "NORMAL")
              .trim()
              .toUpperCase(),
            relacionamento: String(field?.relacionamento || "").trim() || null,
          }))
        : [];
      setNewEntityFields(restoredNodeFields);
      setSelectedDataFieldIds(
        (() => {
          const restoredIds = (
            Array.isArray(selectedNode?.selectedEntityFieldIds)
              ? selectedNode.selectedEntityFieldIds
              : []
          )
            .map((value) => String(value || "").trim())
            .filter(Boolean);

          if (restoredIds.length > 0) return restoredIds;

          return restoredNodeFields
            .map((field) => String(field?.id || "").trim())
            .filter(Boolean);
        })(),
      );
      setEntityFieldDraft(createEmptyEntityFieldDraft());
    }

    setEntityError("");
    if (entityMode === "existente") {
      setEntitySuggestionEntityId("");
    }
  }, [
    entityDraftsByNodeId,
    entityMode,
    entitySavedNotice,
    entitySavedNoticeNodeId,
    getCamposEntidade,
    selectedNode,
    selectedNodeLinkedEntity,
    stageConfigMode,
  ]);

  const handleNodeLabelChange = React.useCallback(
    (nodeId, newLabel) => {
      if (isReadOnlyMode || !nodeId || !newLabel) return;
      setNodes((previous) =>
        previous.map((node) => {
          if (node.id !== nodeId) return node;
          if (node.nodeType === "task") {
            return { ...node, taskNome: newLabel };
          }
          if (node.nodeType === "condicional") {
            return { ...node, condicionalNome: newLabel };
          }
          return node;
        }),
      );
    },
    [isReadOnlyMode],
  );

  const handleConnectionWaypointChange = React.useCallback(
    (connectionId, newWaypoints) => {
      if (isReadOnlyMode) return;
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connectionId ? { ...c, waypoints: newWaypoints } : c,
        ),
      );
    },
    [isReadOnlyMode],
  );

  const handleSelectNode = React.useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
    setInvalidEntityNodeId("");
    if (nodeId) {
      setIsSidebarHidden(false);
    }
  }, []);

  const nodeLayoutMetrics = React.useMemo(() => {
    const viewport = viewportRef.current;
    const viewportWidth = viewport?.clientWidth || viewportGridWidth || 1200;

    if (viewportWidth <= 420) {
      return {
        nodeWidth: BPMN_CARD_WIDTH,
        nodeHeight: BPMN_CARD_HEIGHT,
        rowStep: 178,
        sidePadding: 18,
        minimumHorizontalGap: 30,
      };
    }

    if (viewportWidth <= 560) {
      return {
        nodeWidth: BPMN_CARD_WIDTH,
        nodeHeight: BPMN_CARD_HEIGHT,
        rowStep: 184,
        sidePadding: 20,
        minimumHorizontalGap: 32,
      };
    }

    if (viewportWidth <= 768) {
      return {
        nodeWidth: BPMN_CARD_WIDTH,
        nodeHeight: BPMN_CARD_HEIGHT,
        rowStep: 190,
        sidePadding: 22,
        minimumHorizontalGap: 34,
      };
    }

    if (viewportWidth <= 900) {
      return {
        nodeWidth: BPMN_CARD_WIDTH,
        nodeHeight: BPMN_CARD_HEIGHT,
        rowStep: 196,
        sidePadding: 24,
        minimumHorizontalGap: 36,
      };
    }

    return {
      nodeWidth: BPMN_CARD_WIDTH,
      nodeHeight: BPMN_CARD_HEIGHT,
      rowStep: 204,
      sidePadding: 30,
      minimumHorizontalGap: 42,
    };
  }, [viewportGridWidth]);

  const getGridSlotPosition = React.useCallback(
    (slotIndex) => {
      const viewport = viewportRef.current;
      const viewportWidth = viewport?.clientWidth || viewportGridWidth || 1200;
      const viewportLeft = viewport?.scrollLeft || 0;
      const preferredColumns =
        shouldHideProperties && isDesktopSidebarHidden
          ? 6
          : shouldHideProperties || isDesktopSidebarHidden
            ? 5
            : 4;
      const { nodeWidth, rowStep, sidePadding, minimumHorizontalGap } =
        nodeLayoutMetrics;
      const topPadding = 30;
      const usableWidth = Math.max(nodeWidth, viewportWidth - sidePadding * 2);
      const maxColumnsThatFit = Math.max(
        1,
        Math.floor(
          (usableWidth + minimumHorizontalGap) /
            (nodeWidth + minimumHorizontalGap),
        ),
      );
      const columnsPerRow = Math.max(
        1,
        Math.min(preferredColumns, maxColumnsThatFit),
      );
      const horizontalStep =
        columnsPerRow > 1 ? (usableWidth - nodeWidth) / (columnsPerRow - 1) : 0;

      const col = slotIndex % columnsPerRow;
      const row = Math.floor(slotIndex / columnsPerRow);

      return {
        x: viewportLeft + sidePadding + col * horizontalStep,
        y: topPadding + row * rowStep,
      };
    },
    [
      isDesktopSidebarHidden,
      nodeLayoutMetrics,
      shouldHideProperties,
      viewportGridWidth,
    ],
  );

  const getCompactLayoutedNodes = React.useCallback(
    (nodeList, connectionList) => {
      if (!Array.isArray(nodeList) || nodeList.length === 0) {
        return [];
      }

      const viewport = viewportRef.current;
      const viewportLeft = viewport?.scrollLeft || 0;
      const {
        nodeWidth,
        nodeHeight,
        rowStep,
        sidePadding,
        minimumHorizontalGap,
      } = nodeLayoutMetrics;
      const topPadding = 30;
      const horizontalStep = Math.max(
        nodeWidth + minimumHorizontalGap + 36,
        Math.round(nodeWidth * 1.32),
      );
      const stackStep = Math.max(
        viewportGridWidth <= 768 ? 142 : 156,
        Math.round(nodeHeight * 1.34),
      );
      const branchStepUnits = 2;
      const laneGap = Math.max(56, Math.round(rowStep * 0.42));

      const nodeOrder = new Map(
        nodeList.map((node, index) => [String(node?.id || ""), index]),
      );
      const outgoingById = new Map();
      const incomingById = new Map();

      nodeList.forEach((node) => {
        outgoingById.set(String(node?.id || ""), []);
        incomingById.set(String(node?.id || ""), []);
      });

      (Array.isArray(connectionList) ? connectionList : []).forEach(
        (connection) => {
          const fromId = String(connection?.from || "").trim();
          const toId = String(connection?.to || "").trim();
          if (!nodeOrder.has(fromId) || !nodeOrder.has(toId)) return;

          outgoingById.get(fromId)?.push(connection);
          incomingById.get(toId)?.push(connection);
        },
      );

      outgoingById.forEach((items) => {
        items.sort((left, right) => {
          const leftDecision = String(left?.decision || "")
            .trim()
            .toLowerCase();
          const rightDecision = String(right?.decision || "")
            .trim()
            .toLowerCase();
          if (leftDecision === rightDecision) {
            return (
              (nodeOrder.get(String(left?.to || "").trim()) ?? 0) -
              (nodeOrder.get(String(right?.to || "").trim()) ?? 0)
            );
          }

          if (leftDecision === "sim" || leftDecision === "yes") return -1;
          if (rightDecision === "sim" || rightDecision === "yes") return 1;
          if (
            leftDecision === "nao" ||
            leftDecision === "não" ||
            leftDecision === "no"
          ) {
            return 1;
          }
          if (
            rightDecision === "nao" ||
            rightDecision === "não" ||
            rightDecision === "no"
          ) {
            return -1;
          }

          return leftDecision.localeCompare(rightDecision);
        });
      });

      const depthById = new Map();
      const rootNodes = nodeList.filter(
        (node) => (incomingById.get(String(node?.id || "")) || []).length === 0,
      );
      const traversalQueue = rootNodes.length ? [...rootNodes] : [...nodeList];

      traversalQueue.forEach((node) => {
        depthById.set(String(node?.id || ""), 0);
      });

      for (let index = 0; index < traversalQueue.length; index += 1) {
        const currentNode = traversalQueue[index];
        const currentId = String(currentNode?.id || "").trim();
        const currentDepth = depthById.get(currentId) ?? 0;
        const outgoing = outgoingById.get(currentId) || [];

        outgoing.forEach((connection) => {
          const targetId = String(connection?.to || "").trim();
          const nextDepth = currentDepth + 1;
          if (!depthById.has(targetId)) {
            depthById.set(targetId, nextDepth);
            const targetNode = nodeList[nodeOrder.get(targetId) ?? -1];
            if (targetNode) traversalQueue.push(targetNode);
            return;
          }

          if ((depthById.get(targetId) ?? 0) < nextDepth) {
            depthById.set(targetId, nextDepth);
            // Re-enfileira para propagar o caminho mais longo aos filhos
            const targetNode = nodeList[nodeOrder.get(targetId) ?? -1];
            if (targetNode) traversalQueue.push(targetNode);
          }
        });
      }

      let fallbackDepth = 0;
      nodeList.forEach((node) => {
        const nodeId = String(node?.id || "").trim();
        if (depthById.has(nodeId)) {
          fallbackDepth = Math.max(fallbackDepth, depthById.get(nodeId) ?? 0);
          return;
        }

        fallbackDepth += 1;
        depthById.set(nodeId, fallbackDepth);
      });

      const laneOrder = [];
      const laneIndexByKey = new Map();
      nodeList.forEach((node) => {
        const laneKey = extractNodeParticipant(node) || "__default__";
        if (laneIndexByKey.has(laneKey)) return;
        laneIndexByKey.set(laneKey, laneOrder.length);
        laneOrder.push(laneKey);
      });

      const branchRowByLane = new Map();
      const placementCounter = new Map();
      const laneSpanByKey = new Map();
      const placementByNodeId = new Map();

      nodeList.forEach((node, index) => {
        const nodeId = String(node?.id || "").trim();
        const laneKey = extractNodeParticipant(node) || "__default__";
        const incoming = incomingById.get(nodeId) || [];
        let branchKey = "main";

        if (incoming.length > 0) {
          const prioritizedIncoming = [...incoming].sort((left, right) => {
            const leftSourceOrder =
              nodeOrder.get(String(left?.from || "").trim()) ??
              Number.MAX_SAFE_INTEGER;
            const rightSourceOrder =
              nodeOrder.get(String(right?.from || "").trim()) ??
              Number.MAX_SAFE_INTEGER;
            return leftSourceOrder - rightSourceOrder;
          });
          const selectedIncoming = prioritizedIncoming[0];
          const selectedSourceId = String(selectedIncoming?.from || "").trim();
          const siblingConnections = outgoingById.get(selectedSourceId) || [];
          const siblingIndex = siblingConnections.findIndex(
            (connection) => String(connection?.to || "").trim() === nodeId,
          );
          branchKey = normalizeDecisionBranchKey(
            selectedIncoming?.decision,
            siblingIndex,
          );
        }

        const laneBranchKey = `${laneKey}:${branchKey}`;
        if (!branchRowByLane.has(laneBranchKey)) {
          const laneBranches = Array.from(branchRowByLane.keys()).filter(
            (key) => key.startsWith(`${laneKey}:`),
          );
          let nextBranchIndex = laneBranches.length;
          if (branchKey === "main") nextBranchIndex = 0;
          if (branchKey === "alternate")
            nextBranchIndex = Math.max(1, laneBranches.length);
          branchRowByLane.set(laneBranchKey, nextBranchIndex);
        }

        const branchRow = branchRowByLane.get(laneBranchKey) ?? 0;
        const depth = depthById.get(nodeId) ?? index;
        const bucketKey = `${laneKey}|${depth}|${branchRow}`;
        const bucketIndex = placementCounter.get(bucketKey) ?? 0;
        placementCounter.set(bucketKey, bucketIndex + 1);

        const isAlternateBranch =
          branchKey === "alternate" ||
          String(branchKey).startsWith("branch:nao") ||
          String(branchKey).startsWith("branch:não") ||
          String(branchKey).startsWith("branch:no");
        const alternateBranchOffset = isAlternateBranch ? 1 : 0;

        const rowUnit =
          branchRow * branchStepUnits + bucketIndex + alternateBranchOffset;
        const currentLaneSpan = laneSpanByKey.get(laneKey) ?? 0;
        laneSpanByKey.set(laneKey, Math.max(currentLaneSpan, rowUnit + 1));
        placementByNodeId.set(nodeId, { laneKey, depth, rowUnit });
      });

      let accumulatedLaneOffset = 0;
      const laneOffsetByKey = new Map();
      laneOrder.forEach((laneKey) => {
        laneOffsetByKey.set(laneKey, accumulatedLaneOffset);
        const laneSpan = laneSpanByKey.get(laneKey) ?? 1;
        accumulatedLaneOffset += laneSpan * stackStep + laneGap;
      });

      return nodeList.map((node, index) => {
        const nodeId = String(node?.id || "").trim();
        const placement = placementByNodeId.get(nodeId);

        if (!placement) {
          const fallbackPosition = getGridSlotPosition(index);
          return {
            ...node,
            x: fallbackPosition.x,
            y: fallbackPosition.y,
          };
        }

        return {
          ...node,
          x: viewportLeft + sidePadding + placement.depth * horizontalStep,
          y:
            topPadding +
            (laneOffsetByKey.get(placement.laneKey) ?? 0) +
            placement.rowUnit * stackStep,
        };
      });
    },
    [getGridSlotPosition, nodeLayoutMetrics, viewportGridWidth],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const updateDesktopSidebarHidden = () => {
      setIsDesktopSidebarHidden(
        window.localStorage.getItem("desktopSidebarHidden") === "true",
      );
    };

    updateDesktopSidebarHidden();
    window.addEventListener(
      "desktopSidebarHiddenChange",
      updateDesktopSidebarHidden,
    );
    window.addEventListener("storage", updateDesktopSidebarHidden);

    return () => {
      window.removeEventListener(
        "desktopSidebarHiddenChange",
        updateDesktopSidebarHidden,
      );
      window.removeEventListener("storage", updateDesktopSidebarHidden);
    };
  }, []);

  const addNode = () => {
    if (isReadOnlyMode) return;
    const nextId = `node-${Date.now()}`;
    const nextNumber = nodes.length + 1;
    const { nodeWidth, nodeHeight } = nodeLayoutMetrics;

    const overlapsExistingNode = (x, y) =>
      nodes.some((node) => {
        const existingX = node.x || 0;
        const existingY = node.y || 0;
        const overlapX = Math.abs(existingX - x) < nodeWidth * 0.7;
        const overlapY = Math.abs(existingY - y) < nodeHeight * 0.8;
        return overlapX && overlapY;
      });

    let slotIndex = nodes.length;
    let nextPosition = getGridSlotPosition(slotIndex);

    while (overlapsExistingNode(nextPosition.x, nextPosition.y)) {
      slotIndex += 1;
      nextPosition = getGridSlotPosition(slotIndex);
      if (slotIndex > nodes.length + 500) break;
    }

    const nextX = nextPosition.x;
    const nextY = nextPosition.y;

    const nextNode = createNode(nextId, `Etapa ${nextNumber}`, nextX, nextY);
    setNodes((previous) => [...previous, nextNode]);
    setSelectedNodeId(nextId);
  };

  const executeCreateNodeFromConnection = React.useCallback(
    ({ fromId, fromHandle = "right", pointer }) => {
      if (isReadOnlyMode) return;
      if (!fromId) return;

      const { nodeWidth, nodeHeight } = nodeLayoutMetrics;
      const nextId = `node-${Date.now()}`;
      const nextNumber = nodes.length + 1;

      const pointerX = Number.isFinite(pointer?.x)
        ? pointer.x
        : (nodes[nodes.length - 1]?.x || 0) + 260;
      const pointerY = Number.isFinite(pointer?.y)
        ? pointer.y
        : nodes[nodes.length - 1]?.y || 30;

      const nextX = Math.max(
        0,
        Math.min(pointerX - nodeWidth / 2, canvasWidth - nodeWidth),
      );
      const nextY = Math.max(
        0,
        Math.min(pointerY - nodeHeight / 2, canvasHeight - nodeHeight),
      );

      const nextNode = {
        ...createNode(nextId, `Etapa ${nextNumber}`, nextX, nextY),
        active: true,
      };

      const sourceNode = nodes.find((node) => node.id === fromId) || null;
      const validHandles = ["left", "right", "top", "bottom"];
      const normalizedFromHandle = validHandles.includes(fromHandle)
        ? fromHandle
        : "right";
      const oppositeHandleBySource = {
        left: "right",
        right: "left",
        top: "bottom",
        bottom: "top",
      };

      let computedToHandle = oppositeHandleBySource[normalizedFromHandle];

      if (sourceNode) {
        const sourceCenterX = (sourceNode.x || 0) + nodeWidth / 2;
        const sourceCenterY = (sourceNode.y || 0) + nodeHeight / 2;
        const targetCenterX = nextX + nodeWidth / 2;
        const targetCenterY = nextY + nodeHeight / 2;
        const deltaX = targetCenterX - sourceCenterX;
        const deltaY = targetCenterY - sourceCenterY;

        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          computedToHandle = deltaX >= 0 ? "left" : "right";
        } else {
          computedToHandle = deltaY >= 0 ? "top" : "bottom";
        }
      }

      const nextConnectionId = `conn-${Date.now()}-${fromId}-${nextId}`;
      const isSourceConditional = sourceNode?.nodeType === "condicional";

      setNodes((previous) => [...previous, nextNode]);

      setConnections((previous) => [
        ...previous,
        {
          id: nextConnectionId,
          from: fromId,
          to: nextId,
          fromHandle: normalizedFromHandle,
          toHandle: computedToHandle,
          decision: "",
        },
      ]);

      if (isSourceConditional) {
        setSelectedNodeId(fromId);
        setPendingDecisionConnectionId(nextConnectionId);
        setDecisionPromptCustomValue("");
        setDecisionPromptPosition({ x: null, y: null });
        setIsDecisionPromptOpen(true);
        setIsSidebarHidden(false);
      } else {
        setSelectedNodeId(nextId);
        setIsSidebarHidden(false);
      }
    },
    [canvasHeight, canvasWidth, isReadOnlyMode, nodeLayoutMetrics, nodes],
  );

  React.useEffect(() => {
    setSkipCreateNodeConnectionPrompt(false);
    setDisableCreateNodeConnectionPromptDraft(false);
    setCreateNodeFromConnectionDraft(null);
    setSkipDeleteSelectionPrompt(false);
    setDisableDeleteSelectionPromptDraft(false);
    setDeleteSelectionDraft(null);
    setSkipDeleteSuggestedEntityPrompt(false);
    setDisableDeleteSuggestedEntityPromptDraft(false);
    setDeleteSuggestedEntityDraft(null);
  }, [bpmnSlug]);

  const handleCreateNodeFromConnection = React.useCallback(
    (payload) => {
      if (isReadOnlyMode) return;
      if (!payload?.fromId) return;

      if (skipCreateNodeConnectionPrompt) {
        executeCreateNodeFromConnection(payload);
        return;
      }

      setDisableCreateNodeConnectionPromptDraft(false);
      setCreateNodeFromConnectionDraft(payload);
    },
    [
      executeCreateNodeFromConnection,
      isReadOnlyMode,
      skipCreateNodeConnectionPrompt,
    ],
  );

  const handleConfirmCreateNodeFromConnection = React.useCallback(() => {
    if (!createNodeFromConnectionDraft) return;

    if (disableCreateNodeConnectionPromptDraft) {
      setSkipCreateNodeConnectionPrompt(true);
    }

    executeCreateNodeFromConnection(createNodeFromConnectionDraft);
    setCreateNodeFromConnectionDraft(null);
    setDisableCreateNodeConnectionPromptDraft(false);
  }, [
    createNodeFromConnectionDraft,
    disableCreateNodeConnectionPromptDraft,
    executeCreateNodeFromConnection,
  ]);

  const handleCancelCreateNodeFromConnection = React.useCallback(() => {
    if (disableCreateNodeConnectionPromptDraft) {
      setSkipCreateNodeConnectionPrompt(true);
    }

    setCreateNodeFromConnectionDraft(null);
    setDisableCreateNodeConnectionPromptDraft(false);
  }, [disableCreateNodeConnectionPromptDraft]);

  const handleNodePositionChange = React.useCallback(
    (nodeId, position) => {
      if (isReadOnlyMode) return;
      setNodes((previous) =>
        previous.map((node) =>
          node.id === nodeId ? { ...node, x: position.x, y: position.y } : node,
        ),
      );
    },
    [isReadOnlyMode],
  );

  const handleRemoveNodeById = React.useCallback(
    (nodeId) => {
      if (isReadOnlyMode) return;
      if (!nodeId) return;

      const fallbackSelectedNodeId =
        nodes.find((node) => node.id !== nodeId)?.id || "";

      setNodes((previous) => previous.filter((node) => node.id !== nodeId));

      setConnections((previous) => {
        const removedConnectionIds = previous
          .filter(
            (connection) =>
              connection.from === nodeId || connection.to === nodeId,
          )
          .map((connection) => connection.id);

        if (removedConnectionIds.length > 0) {
          const removedIdsSet = new Set(removedConnectionIds);
          setSelectedConnectionId((current) =>
            removedIdsSet.has(current) ? "" : current,
          );
        }

        return previous.filter(
          (connection) =>
            connection.from !== nodeId && connection.to !== nodeId,
        );
      });

      setSelectedNodeId((current) =>
        current === nodeId ? fallbackSelectedNodeId : current,
      );
      setConnectTarget((current) => (current === nodeId ? "" : current));
    },
    [isReadOnlyMode, nodes],
  );

  const connectSelectedToTarget = () => {
    if (!selectedNodeId || !connectTarget || selectedNodeId === connectTarget) {
      return;
    }

    const exists = connections.some(
      (connection) =>
        connection.from === selectedNodeId && connection.to === connectTarget,
    );

    if (exists) return;

    const nextConnectionId = `conn-${Date.now()}`;

    setConnections((previous) => [
      ...previous,
      {
        id: nextConnectionId,
        from: selectedNodeId,
        to: connectTarget,
        decision: "",
      },
    ]);

    const sourceNode = nodes.find((node) => node.id === selectedNodeId) || null;
    const isSourceConditional = sourceNode?.nodeType === "condicional";

    if (isSourceConditional) {
      setIsSidebarHidden(false);
      setSelectedNodeId(selectedNodeId);
      setPendingDecisionConnectionId(nextConnectionId);
      setDecisionPromptCustomValue("");
      setDecisionPromptPosition({ x: null, y: null });
      setIsDecisionPromptOpen(true);
    }
  };

  const handleCreateConnectionByDrag = React.useCallback(
    (
      fromId,
      toId,
      fromHandle = "right",
      toHandle = "left",
      pointerClientPosition = null,
    ) => {
      if (!fromId || !toId || fromId === toId) return;

      // Não permite ligação entre duas condições
      const sourceNode = nodes.find((node) => node.id === fromId) || null;
      const targetNode = nodes.find((node) => node.id === toId) || null;
      if (
        sourceNode?.nodeType === "condicional" &&
        targetNode?.nodeType === "condicional"
      )
        return;

      const exists = connections.some(
        (connection) => connection.from === fromId && connection.to === toId,
      );
      if (exists) return;

      const nextConnectionId = `conn-${Date.now()}-${fromId}-${toId}`;
      const isSourceConditional = sourceNode?.nodeType === "condicional";

      setConnections((previous) => [
        ...previous,
        {
          id: nextConnectionId,
          from: fromId,
          to: toId,
          fromHandle,
          toHandle,
          decision: "",
        },
      ]);

      if (isSourceConditional) {
        setSelectedNodeId(fromId);
        setIsSidebarHidden(false);
        setPendingDecisionConnectionId(nextConnectionId);
        setDecisionPromptCustomValue("");
        if (
          pointerClientPosition &&
          Number.isFinite(pointerClientPosition.clientX) &&
          Number.isFinite(pointerClientPosition.clientY)
        ) {
          setDecisionPromptPosition({
            x: pointerClientPosition.clientX,
            y: pointerClientPosition.clientY,
          });
        } else {
          setDecisionPromptPosition({ x: null, y: null });
        }
        setIsDecisionPromptOpen(true);
      } else {
        setSelectedConnectionId("");
      }
    },
    [connections, nodes],
  );

  const handleRemoveConnection = React.useCallback((connectionId) => {
    if (!connectionId) return;
    setConnections((previous) =>
      previous.filter((connection) => connection.id !== connectionId),
    );
    setSelectedConnectionId((previous) =>
      previous === connectionId ? "" : previous,
    );
  }, []);

  const selectedConnection = React.useMemo(
    () =>
      connections.find(
        (connection) => connection.id === selectedConnectionId,
      ) || null,
    [connections, selectedConnectionId],
  );

  const selectedConnectionSourceNode = React.useMemo(
    () =>
      selectedConnection
        ? nodes.find((node) => node.id === selectedConnection.from) || null
        : null,
    [nodes, selectedConnection],
  );

  const selectedConnectionTargetNode = React.useMemo(
    () =>
      selectedConnection
        ? nodes.find((node) => node.id === selectedConnection.to) || null
        : null,
    [nodes, selectedConnection],
  );

  React.useEffect(() => {
    setSidebarConnectionDecisionDraft(
      String(selectedConnection?.decision || "").trim(),
    );
  }, [selectedConnection?.decision, selectedConnection?.id]);

  const removeSelectedConnection = React.useCallback(() => {
    if (!selectedConnectionId) return;
    handleRemoveConnection(selectedConnectionId);
  }, [handleRemoveConnection, selectedConnectionId]);

  const executeDeleteSelection = React.useCallback(
    (draft) => {
      if (!draft?.id || !draft?.type) return;

      if (draft.type === "connection") {
        handleRemoveConnection(draft.id);
        return;
      }

      if (draft.type === "node") {
        handleRemoveNodeById(draft.id);
      }
    },
    [handleRemoveConnection, handleRemoveNodeById],
  );

  const requestDeleteSelection = React.useCallback(() => {
    const nextDraft = selectedConnectionId
      ? {
          type: "connection",
          id: selectedConnectionId,
        }
      : selectedNodeId
        ? {
            type: "node",
            id: selectedNodeId,
          }
        : null;

    if (!nextDraft) return;

    if (skipDeleteSelectionPrompt) {
      executeDeleteSelection(nextDraft);
      return;
    }

    setDisableDeleteSelectionPromptDraft(false);
    setDeleteSelectionDraft(nextDraft);
  }, [
    executeDeleteSelection,
    selectedConnectionId,
    selectedNodeId,
    skipDeleteSelectionPrompt,
  ]);

  const handleConfirmDeleteSelection = React.useCallback(() => {
    if (!deleteSelectionDraft) return;

    if (disableDeleteSelectionPromptDraft) {
      setSkipDeleteSelectionPrompt(true);
    }

    executeDeleteSelection(deleteSelectionDraft);
    setDeleteSelectionDraft(null);
    setDisableDeleteSelectionPromptDraft(false);
  }, [
    deleteSelectionDraft,
    disableDeleteSelectionPromptDraft,
    executeDeleteSelection,
  ]);

  const handleCancelDeleteSelection = React.useCallback(() => {
    if (disableDeleteSelectionPromptDraft) {
      setSkipDeleteSelectionPrompt(true);
    }

    setDeleteSelectionDraft(null);
    setDisableDeleteSelectionPromptDraft(false);
  }, [disableDeleteSelectionPromptDraft]);

  const selectedConnectionOutgoingCount = React.useMemo(() => {
    if (!selectedConnection) return 0;
    return connections.filter(
      (connection) => connection.from === selectedConnection.from,
    ).length;
  }, [connections, selectedConnection]);

  const sidebarContextType = selectedConnection
    ? "connection"
    : selectedNode
      ? "entity"
      : "none";

  const sidebarTabs = React.useMemo(() => {
    if (sidebarContextType === "connection") {
      return [{ id: "connection", label: "Conexão" }];
    }

    if (sidebarContextType === "gateway") {
      return [
        { id: "gateway", label: "Gateway" },
        { id: "conexoes", label: "Conexões" },
      ];
    }

    if (sidebarContextType === "task") {
      return [{ id: "task", label: "Task" }];
    }

    if (sidebarContextType === "entity") {
      return [{ id: "entidade", label: "Painel contextual" }];
    }

    return [];
  }, [sidebarContextType]);

  React.useEffect(() => {
    if (sidebarTabs.length === 0) return;
    if (sidebarTabs.some((tab) => tab.id === activeSidebarTab)) return;
    setActiveSidebarTab(sidebarTabs[0].id);
  }, [activeSidebarTab, sidebarTabs]);

  const handleUpdateSelectedConnectionDecision = React.useCallback(
    (decision) => {
      if (!selectedConnectionId) return;
      setConnections((previous) =>
        previous.map((connection) =>
          connection.id === selectedConnectionId
            ? { ...connection, decision }
            : connection,
        ),
      );
    },
    [selectedConnectionId],
  );

  const handleDecisionPromptChoice = React.useCallback(
    (decision) => {
      const normalizedDecision = String(decision || "").trim();
      if (!normalizedDecision) return;

      if (!pendingDecisionConnectionId) {
        setIsDecisionPromptOpen(false);
        setDecisionPromptCustomValue("");
        setDecisionPromptPosition({ x: null, y: null });
        return;
      }

      setConnections((previous) =>
        previous.map((connection) =>
          connection.id === pendingDecisionConnectionId
            ? { ...connection, decision: normalizedDecision }
            : connection,
        ),
      );

      setIsDecisionPromptOpen(false);
      setPendingDecisionConnectionId("");
      setDecisionPromptCustomValue("");
      setDecisionPromptPosition({ x: null, y: null });
    },
    [pendingDecisionConnectionId],
  );

  const decisionPromptStyle = React.useMemo(() => {
    if (
      !Number.isFinite(decisionPromptPosition.x) ||
      !Number.isFinite(decisionPromptPosition.y)
    ) {
      return undefined;
    }

    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth || 1200 : 1200;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight || 800 : 800;
    const panelWidth = 320;
    const panelHeight = 124;
    const offsetX = -(panelWidth / 2) + 4;
    const offsetY = 18;

    const left = Math.max(
      8,
      Math.min(
        decisionPromptPosition.x + offsetX,
        viewportWidth - panelWidth - 8,
      ),
    );

    const top = Math.max(
      8,
      Math.min(
        decisionPromptPosition.y + offsetY,
        viewportHeight - panelHeight - 8,
      ),
    );

    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [decisionPromptPosition.x, decisionPromptPosition.y]);

  const updateSelectedNode = React.useCallback(
    (patch) => {
      if (!selectedNodeId) return;
      setNodes((previous) => {
        const nextNodes = previous.map((node) =>
          node.id === selectedNodeId ? { ...node, ...patch } : node,
        );

        const nextSnapshot = {
          name,
          nodes: nextNodes,
          connections,
        };

        currentDraftRef.current = nextSnapshot;

        if (hasHydratedBpmnRef.current) {
          try {
            window.localStorage.setItem(
              BPMN_EDITOR_LOCAL_STORAGE_KEY,
              JSON.stringify({
                ...nextSnapshot,
                pendingTimelineItems: pendingTimelineItemsRef.current,
                updated_at: new Date().toISOString(),
              }),
            );
          } catch (error) {}
        }

        return nextNodes;
      });
    },
    [connections, name, selectedNodeId],
  );

  const appendPendingSidebarTimelineItem = React.useCallback(
    ({
      title,
      description,
      actionType = "update",
      elementType,
      itemName,
      before = "",
      after = "",
    }) => {
      const autoKey = `sidebar-draft:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const newItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        title,
        description,
        time: new Date().toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        timestamp: new Date().toISOString(),
        actor: actorAccountName,
        actorId: actorAccountId,
        autoGenerated: true,
        source: "bpmn-sidebar-draft",
        autoKey,
        actionType,
        elementType,
        itemName,
        before,
        after,
      };

      pendingTimelineItemsRef.current = [
        newItem,
        ...(Array.isArray(pendingTimelineItemsRef.current)
          ? pendingTimelineItemsRef.current
          : []),
      ];

      if (hasHydratedBpmnRef.current) {
        try {
          window.localStorage.setItem(
            BPMN_EDITOR_LOCAL_STORAGE_KEY,
            JSON.stringify({
              ...currentDraftRef.current,
              pendingTimelineItems: pendingTimelineItemsRef.current,
              updated_at: new Date().toISOString(),
            }),
          );
        } catch (error) {}
      }

      const syncSidebarDraftToOpportunity = async () => {
        try {
          const currentBpmnSlug = slugifyBpmnName(name);
          const originalBpmnSlug = String(bpmnSlug || "").trim();

          const rawMap = window.localStorage.getItem(
            BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
          );
          const parsedMap = rawMap ? JSON.parse(rawMap) : null;
          const opportunityId = Number(
            parsedMap?.[currentBpmnSlug] ||
              (originalBpmnSlug ? parsedMap?.[originalBpmnSlug] : 0) ||
              0,
          );

          if (!opportunityId) return;

          const response = await fetchOpportunitiesPage({
            page: 1,
            limit: 500,
            token: getAuthToken(),
          });

          const rows = Array.isArray(response?.data) ? response.data : [];
          const existingOpportunity =
            rows.find((item) => Number(item?.id) === opportunityId) || null;

          if (!existingOpportunity) return;

          const existingTimelineItems = Array.isArray(
            existingOpportunity.timelineItems,
          )
            ? existingOpportunity.timelineItems
            : [];

          if (
            existingTimelineItems.some(
              (item) =>
                String(item?.autoKey || "").trim() ===
                String(newItem.autoKey || "").trim(),
            )
          ) {
            return;
          }

          await updateOpportunityById({
            opportunityId,
            payload: {
              ...existingOpportunity,
              id: opportunityId,
              timelineItems: [newItem, ...existingTimelineItems],
              bpmn: {
                ...(existingOpportunity?.bpmn || {}),
                nodes: (Array.isArray(currentDraftRef.current?.nodes)
                  ? currentDraftRef.current.nodes
                  : []
                ).map(sanitizeNodeForPersistence),
                connections: (Array.isArray(
                  currentDraftRef.current?.connections,
                )
                  ? currentDraftRef.current.connections
                  : []
                ).map(sanitizeConnectionForPersistence),
              },
            },
            token: getAuthToken(),
          });
        } catch (error) {
          // best effort sync
        }
      };

      syncSidebarDraftToOpportunity();
    },
    [actorAccountId, actorAccountName, bpmnSlug, name],
  );

  const resetNewEntityForm = React.useCallback(() => {
    setNewEntityForm(EMPTY_ENTITY_FORM);
    setNewEntityFields([]);
    setSelectedDataFieldIds([]);
    setEntityFieldDraft(createEmptyEntityFieldDraft());
  }, []);

  const applyEntityToSelectedNode = React.useCallback(
    (entidade) => {
      if (!selectedNodeId || !entidade) return;

      const previousName =
        String(selectedNode?.entidadeNome || "").trim() ||
        String(selectedNode?.label || "").trim() ||
        "-";

      const entidadeId = getEntidadeId(entidade);
      const nextName = String(getEntidadeNome(entidade) || "").trim() || "-";

      const entidadeTipo = String(entidade?.tipoEntidade || "")
        .trim()
        .toLowerCase();
      const resolvedEntidadeTipo =
        entidadeTipo === "contato"
          ? "contato"
          : entidadeTipo === "processo"
            ? "processo"
            : "processo";

      updateSelectedNode({
        nodeType: "entidade",
        gatewayType: "xor",
        entidadeId,
        tipoEntidade: resolvedEntidadeTipo,
        isPrimaryEntity: resolvedEntidadeTipo === "contato",
        entidadeNome: "",
        condicionalNome: "",
        condicionalDescricao: "",
        taskNome: "",
        taskDescricao: "",
        selectedEntityFieldIds: selectedDataFieldsForNode.map((field) =>
          String(field.id || "").trim(),
        ),
        selectedEntityFieldNames: selectedDataFieldsForNode
          .map((field) => String(field.nome || "").trim())
          .filter(Boolean),
        selectedEntityFields: selectedDataFieldsForNode.map((field) => ({
          id: String(field?.id || "").trim(),
          nome: String(field?.nome || "").trim(),
          tipo: String(field?.tipo || "").trim(),
          obrigatorio:
            field?.obrigatorio === true ||
            String(field?.obrigatorio || "") === "Sim",
          keyType: String(field?.keyType || field?.chave || "NORMAL")
            .trim()
            .toUpperCase(),
          relacionamento: String(field?.relacionamento || "").trim() || null,
        })),
      });

      appendPendingSidebarTimelineItem({
        title: "Entidade atualizada no BPMN",
        description: `Antes: ${previousName} → Agora: ${nextName}`,
        actionType: "update",
        elementType: "entidade",
        itemName: nextName,
        before: previousName,
        after: nextName,
      });
      setEntityError("");
    },
    [
      appendPendingSidebarTimelineItem,
      selectedNode,
      selectedNodeId,
      selectedDataFieldsForNode,
      updateSelectedNode,
    ],
  );

  const handleLinkExistingEntityToNode = React.useCallback(() => {
    if (!selectedNode) return;

    const targetEntity = (Array.isArray(entidades) ? entidades : []).find(
      (entidade) =>
        String(getEntidadeId(entidade)) === selectedExistingEntityId,
    );

    if (!targetEntity) {
      setEntityError("Selecione uma entidade existente para vincular.");
      return;
    }

    applyEntityToSelectedNode(targetEntity);
  }, [
    applyEntityToSelectedNode,
    entidades,
    selectedExistingEntityId,
    selectedNode,
  ]);

  const handleSaveEntityFieldDraft = React.useCallback(() => {
    const isEditingField = Boolean(entityFieldDraft.id);
    const nome = String(entityFieldDraft.nome || "").trim();
    if (!nome) {
      setEntitySavedNotice("");
      setEntityError("Nome do campo é obrigatório.");
      return null;
    }

    if (!String(entityFieldDraft.tipo || "").trim()) {
      setEntitySavedNotice("");
      setEntityError("Selecione o tipo do campo.");
      return null;
    }

    if (typeof entityFieldDraft.obrigatorio !== "boolean") {
      setEntitySavedNotice("");
      setEntityError("Informe se o campo é obrigatório.");
      return null;
    }

    if (!String(entityFieldDraft.keyType || "").trim()) {
      setEntitySavedNotice("");
      setEntityError("Selecione o tipo de chave do campo.");
      return null;
    }

    const normalizedKeyType = String(entityFieldDraft.keyType || "NORMAL")
      .trim()
      .toUpperCase();
    const referencia = String(entityFieldDraft.referencia || "").trim();

    const duplicated = validarNomeCampoDuplicado(
      newEntityFields,
      nome,
      entityFieldDraft.id,
    );

    if (duplicated) {
      setEntitySavedNotice("");
      setEntityError("Já existe um campo com esse nome na entidade.");
      return null;
    }

    const nextFields = entityFieldDraft.id
      ? newEntityFields.map((campo) =>
          String(campo.id) === String(entityFieldDraft.id)
            ? {
                ...campo,
                nome,
                tipo: entityFieldDraft.tipo,
                obrigatorio: entityFieldDraft.obrigatorio,
                keyType: normalizedKeyType,
                relacionamento: referencia || null,
              }
            : campo,
        )
      : [
          ...newEntityFields,
          {
            id: generateUniqueId("field"),
            nome,
            tipo: entityFieldDraft.tipo,
            obrigatorio: entityFieldDraft.obrigatorio,
            keyType: normalizedKeyType,
            relacionamento: referencia || null,
          },
        ];

    setNewEntityFields(nextFields);
    setSelectedDataFieldIds((previous) => {
      const validIds = nextFields
        .map((field) => String(field?.id ?? "").trim())
        .filter(Boolean);
      const validSet = new Set(validIds);
      const preservedIds = (Array.isArray(previous) ? previous : [])
        .map((value) => String(value || "").trim())
        .filter((value) => validSet.has(value));

      if (entityFieldDraft.id) {
        return preservedIds;
      }

      const createdFieldId = String(
        nextFields[nextFields.length - 1]?.id || "",
      ).trim();
      if (!createdFieldId) return preservedIds;
      return Array.from(new Set([...preservedIds, createdFieldId]));
    });

    setEntityError("");
    setEntitySavedNotice(
      isEditingField
        ? "Campo atualizado na configuracao da etapa."
        : "Campo adicionado na configuracao da etapa.",
    );
    setEntitySavedNoticeNodeId(String(selectedNode?.id || "").trim());

    if (!isEditingField) {
      setEntityFieldDraft(createEmptyEntityFieldDraft());
    }

    return nextFields;
  }, [
    entityFieldDraft,
    newEntityFields,
    selectedNode?.id,
    validarNomeCampoDuplicado,
  ]);

  const handleEditEntityFieldDraft = React.useCallback((field) => {
    if (!field) return;

    setEntityFieldDraft({
      id: String(field?.id || "").trim() || null,
      nome: String(field?.nome || "").trim(),
      tipo: String(field?.tipo || field?.type || "").trim(),
      obrigatorio:
        field?.obrigatorio === true || String(field?.obrigatorio) === "Sim",
      keyType: String(field?.keyType || field?.chave || "NORMAL")
        .trim()
        .toUpperCase(),
      referencia: String(field?.relacionamento || "").trim(),
    });
    setEntityError("");
  }, []);

  const handleSelectCreateNewEntityMode = React.useCallback(() => {
    setEntityMode("nova");
    setSelectedExistingEntityId("");
    setNewEntityForm(EMPTY_ENTITY_FORM);
    setNewEntityFields([]);
    setSelectedDataFieldIds([]);
    setEntityFieldDraft(createEmptyEntityFieldDraft());
    setEntityError("");
    setEntitySavedNotice("");
  }, []);

  const handleRemoveEntityFieldDraft = React.useCallback(
    (fieldId) => {
      const normalizedId = String(fieldId || "").trim();
      if (!normalizedId) return;

      const nextFields = (
        Array.isArray(newEntityFields) ? newEntityFields : []
      ).filter((field) => String(field?.id || "").trim() !== normalizedId);

      setNewEntityFields(nextFields);
      setSelectedDataFieldIds((previous) =>
        (Array.isArray(previous) ? previous : []).filter(
          (value) => String(value || "").trim() !== normalizedId,
        ),
      );

      if (String(entityFieldDraft?.id || "").trim() === normalizedId) {
        setEntityFieldDraft(createEmptyEntityFieldDraft());
      }

      setEntitySavedNotice("Campo removido da configuracao da etapa.");
      setEntitySavedNoticeNodeId(String(selectedNode?.id || "").trim());
      setEntityError("");
    },
    [entityFieldDraft?.id, newEntityFields, selectedNode?.id],
  );

  const handleCreateAndLinkEntity = React.useCallback(
    async (fieldsOverride) => {
      if (!selectedNode) return;

      setEntitySavedNotice("");
      setEntitySavedNoticeNodeId("");

      const nome = String(newEntityForm.nome || "").trim();
      const descricao = String(newEntityForm.descricao || "").trim();
      const atributoChave = String(newEntityForm.atributoChave || "").trim();
      const tipoEntidade =
        String(selectedNode?.tipoEntidade || "").trim() ||
        String(selectedNode?.isPrimaryEntity === true ? "contato" : "processo");
      const isPrimaryEntity =
        String(tipoEntidade || "")
          .trim()
          .toLowerCase() === "contato";
      const effectiveFields = Array.isArray(fieldsOverride)
        ? fieldsOverride
        : newEntityFields;

      const duplicatedEntity = (Array.isArray(entidades) ? entidades : []).find(
        (entidade) =>
          normalizeEntityName(getEntidadeNome(entidade)) ===
          normalizeEntityName(nome),
      );
      const updateTarget = selectedNodeLinkedEntity || duplicatedEntity || null;

      try {
        const token = getAuthToken();

        if (updateTarget) {
          const targetId = getEntidadeId(updateTarget);
          if (targetId !== null && targetId !== undefined) {
            const nomeFinal =
              String(nome || "").trim() ||
              String(updateTarget?.nome || "").trim();
            const descricaoFinal =
              String(descricao || "").trim() ||
              String(updateTarget?.descricao || "").trim() ||
              "Entidade gerada pelo BPMN";
            const atributoChaveFinal =
              String(atributoChave || "").trim() ||
              String(updateTarget?.atributoChave || "").trim();
            const camposFinais =
              Array.isArray(effectiveFields) && effectiveFields.length > 0
                ? effectiveFields
                : getCamposEntidade(updateTarget);

            if (!nomeFinal) {
              setEntityError("Preencha ao menos o nome da entidade.");
              return;
            }

            const entidadeEditada = await editarEntidade(
              targetId,
              {
                nome: nomeFinal,
                descricao: descricaoFinal,
                atributoChave: atributoChaveFinal,
                tipoEntidade,
                isPrimaryEntity,
                categoria: updateTarget?.categoria || "BPMN",
                campos: camposFinais,
                updated_at: new Date().toISOString(),
              },
              token,
            );

            const entidadeAtualizada = {
              ...updateTarget,
              ...entidadeEditada,
              nome: nomeFinal,
              descricao: descricaoFinal,
              atributoChave: atributoChaveFinal,
              tipoEntidade,
              isPrimaryEntity,
              updated_at: new Date().toISOString(),
            };

            applyEntityToSelectedNode(entidadeAtualizada);
            setEntitySuggestionEntityId("");
            setEntityError("");
            setEntitySavedNotice("Entidade atualizada na página de Entidades.");
            setEntitySavedNoticeNodeId(selectedNode.id);
            return;
          }
        }

        if (!nome || !descricao || !atributoChave) {
          setEntityError(
            "Preencha nome, descrição e atributo chave da entidade.",
          );
          return;
        }

        if (!Array.isArray(effectiveFields) || effectiveFields.length === 0) {
          setActiveSidebarTab("entidade");
          setEntityError(
            "Adicione pelo menos um campo na seção Campos para salvar a Entidade.",
          );
          return;
        }

        const entidadeCriada = await adicionarEntidade(
          {
            nome,
            descricao,
            atributoChave,
            tipoEntidade,
            isPrimaryEntity,
            categoria: "BPMN",
            campos: effectiveFields,
          },
          token,
        );

        applyEntityToSelectedNode(entidadeCriada);
        setEntitySuggestionEntityId("");
        setEntityError("");
        setEntitySavedNotice("Entidade salva na página de Entidades.");
        setEntitySavedNoticeNodeId(selectedNode.id);
      } catch (err) {
        setEntityError(err?.message || "Não foi possível criar a entidade.");
        setEntitySavedNotice("");
        setEntitySavedNoticeNodeId("");
      }
    },
    [
      adicionarEntidade,
      applyEntityToSelectedNode,
      editarEntidade,
      getCamposEntidade,
      newEntityFields,
      newEntityForm.atributoChave,
      newEntityForm.descricao,
      newEntityForm.nome,
      entidades,
      setActiveSidebarTab,
      selectedNode,
      selectedNodeLinkedEntity,
    ],
  );

  const handleSaveConditionalStage = React.useCallback(() => {
    if (!selectedNode) return;

    setEntitySavedNotice("");
    setEntitySavedNoticeNodeId("");

    const nome = sanitizeStageNameByNodeType(
      conditionalForm.nome,
      "condicional",
      "Condicional",
    );
    const descricao = String(conditionalForm.descricao || "").trim();
    const previousNome =
      String(selectedNode?.condicionalNome || "").trim() ||
      String(selectedNode?.label || "").trim() ||
      "-";

    if (!nome || !descricao) {
      setEntityError("Preencha nome e descrição da condicional.");
      return;
    }

    updateSelectedNode({
      nodeType: "condicional",
      gatewayType:
        gatewayTypeDraft === "and" || gatewayTypeDraft === "or"
          ? gatewayTypeDraft
          : "xor",
      condicionalNome: nome,
      condicionalDescricao: descricao,
      entidadeId: null,
      entidadeNome: "",
      taskNome: "",
      taskDescricao: "",
      selectedEntityFieldIds: newEntityFields
        .map((f) => String(f?.id || "").trim())
        .filter(Boolean),
      selectedEntityFieldNames: newEntityFields
        .map((f) => String(f?.nome || "").trim())
        .filter(Boolean),
      selectedEntityFields: newEntityFields.map((f) => ({ ...f })),
    });

    appendPendingSidebarTimelineItem({
      title: "Condição atualizada no BPMN",
      description: `Antes: ${previousNome} → Agora: ${nome}`,
      actionType: "update",
      elementType: "elemento-bpmn",
      itemName: nome,
      before: previousNome,
      after: nome,
    });

    setEntityError("");
    setEntitySavedNotice("Decisão salva no fluxo.");
    setEntitySavedNoticeNodeId(selectedNode.id);
  }, [
    appendPendingSidebarTimelineItem,
    conditionalForm.descricao,
    conditionalForm.nome,
    gatewayTypeDraft,
    newEntityFields,
    selectedNode,
    updateSelectedNode,
  ]);

  const handleSaveTaskStage = React.useCallback(() => {
    if (!selectedNode) return;

    const nome = sanitizeStageNameByNodeType(
      taskForm.nome,
      "task",
      "Atividade",
    );
    const descricao = String(taskForm.descricao || "").trim();
    const previousNome =
      String(selectedNode?.taskNome || "").trim() ||
      String(selectedNode?.label || "").trim() ||
      "-";

    if (!nome) {
      setEntityError("Preencha o nome da atividade.");
      return;
    }

    updateSelectedNode({
      nodeType: "task",
      taskNome: nome,
      taskDescricao: descricao,
      entidadeId: null,
      entidadeNome: "",
      condicionalNome: "",
      condicionalDescricao: "",
      selectedEntityFieldIds: newEntityFields
        .map((f) => String(f?.id || "").trim())
        .filter(Boolean),
      selectedEntityFieldNames: newEntityFields
        .map((f) => String(f?.nome || "").trim())
        .filter(Boolean),
      selectedEntityFields: newEntityFields.map((f) => ({ ...f })),
    });

    appendPendingSidebarTimelineItem({
      title: "Atividade atualizada no BPMN",
      description: `Antes: ${previousNome} → Agora: ${nome}`,
      actionType: "update",
      elementType: "elemento-bpmn",
      itemName: nome,
      before: previousNome,
      after: nome,
    });

    setEntityError("");
    setEntitySavedNotice("Atividade salva no fluxo.");
    setEntitySavedNoticeNodeId(selectedNode.id);
  }, [
    appendPendingSidebarTimelineItem,
    newEntityFields,
    selectedNode,
    taskForm.descricao,
    taskForm.nome,
    updateSelectedNode,
  ]);

  const handleSaveEntityStageLocal = React.useCallback(() => {
    if (!selectedNode) return;

    setEntitySavedNotice("");
    setEntitySavedNoticeNodeId("");

    const nome = sanitizeStageNameByNodeType(
      newEntityForm.nome,
      "entidade",
      "Entidade",
    );
    const descricao = String(newEntityForm.descricao || "").trim();
    const atributoChave = String(newEntityForm.atributoChave || "").trim();
    const previousNome =
      String(selectedNode?.entidadeNome || "").trim() ||
      String(selectedNode?.label || "").trim() ||
      "-";

    if (!nome) {
      setEntityError("Preencha o nome da entidade.");
      return;
    }

    updateSelectedNode({
      nodeType: "entidade",
      gatewayType: "xor",
      entidadeId: null,
      entidadeNome: nome,
      label: nome,
      descricao,
      info: atributoChave,
      condicionalNome: "",
      condicionalDescricao: "",
      taskNome: "",
      taskDescricao: "",
      selectedEntityFieldIds: selectedDataFieldsForNode.map((field) =>
        String(field.id || "").trim(),
      ),
      selectedEntityFieldNames: selectedDataFieldsForNode
        .map((field) => String(field.nome || "").trim())
        .filter(Boolean),
      selectedEntityFields: selectedDataFieldsForNode.map((field) => ({
        id: String(field?.id || "").trim(),
        nome: String(field?.nome || "").trim(),
        tipo: String(field?.tipo || "").trim(),
        obrigatorio:
          field?.obrigatorio === true ||
          String(field?.obrigatorio || "") === "Sim",
        keyType: String(field?.keyType || field?.chave || "NORMAL")
          .trim()
          .toUpperCase(),
        relacionamento: String(field?.relacionamento || "").trim() || null,
      })),
    });

    appendPendingSidebarTimelineItem({
      title: "Entidade atualizada no BPMN",
      description: `Antes: ${previousNome} → Agora: ${nome}`,
      actionType: "update",
      elementType: "entidade",
      itemName: nome,
      before: previousNome,
      after: nome,
    });

    setEntityError("");
    setEntitySavedNotice("Entidade salva no BPMN.");
    setEntitySavedNoticeNodeId(selectedNode.id);
  }, [
    appendPendingSidebarTimelineItem,
    newEntityForm.atributoChave,
    newEntityForm.descricao,
    newEntityForm.nome,
    selectedDataFieldsForNode,
    selectedNode,
    updateSelectedNode,
  ]);

  const handleSaveGatewayType = React.useCallback(() => {
    if (!selectedNode) return;

    updateSelectedNode({
      nodeType: "condicional",
      gatewayType:
        gatewayTypeDraft === "and" || gatewayTypeDraft === "or"
          ? gatewayTypeDraft
          : "xor",
    });

    setEntitySavedNotice("Tipo da decisão atualizado.");
    setEntitySavedNoticeNodeId(selectedNode.id);
  }, [gatewayTypeDraft, selectedNode, updateSelectedNode]);

  const handleChangeSelectedNodeType = React.useCallback(
    (nextType) => {
      if (!selectedNode) return;

      if (nextType === "task") {
        setStageConfigMode("");
        updateSelectedNode({
          nodeType: "task",
          isPrimaryEntity: false,
          entidadeId: null,
          entidadeNome: "",
          condicionalNome: "",
          condicionalDescricao: "",
          selectedEntityFieldIds: [],
          selectedEntityFieldNames: [],
          selectedEntityFields: [],
          taskNome:
            String(selectedNode.taskNome || "").trim() ||
            String(selectedNode.label || "").trim(),
          taskDescricao:
            String(selectedNode.taskDescricao || "").trim() ||
            String(selectedNode.descricao || "").trim(),
        });
        return;
      }

      if (nextType === "condicional") {
        setStageConfigMode("condicional");
        updateSelectedNode({
          nodeType: "condicional",
          isPrimaryEntity: false,
          tipoEntidade: "",
          gatewayType:
            gatewayTypeDraft === "and" || gatewayTypeDraft === "or"
              ? gatewayTypeDraft
              : "xor",
          entidadeId: null,
          entidadeNome: "",
          taskNome: "",
          taskDescricao: "",
          selectedEntityFieldIds: [],
          selectedEntityFieldNames: [],
          selectedEntityFields: [],
        });
        return;
      }

      setStageConfigMode("entidade");
      updateSelectedNode({
        nodeType: "entidade",
        condicionalNome: "",
        condicionalDescricao: "",
        taskNome: "",
        taskDescricao: "",
      });
    },
    [gatewayTypeDraft, selectedNode, updateSelectedNode],
  );

  const handleSetSelectedNodeAsPrimaryEntity = React.useCallback(
    (nextIsPrimaryEntity) => {
      if (!selectedNodeId) return;

      setNodes((previous) =>
        previous.map((node) => {
          const isEntityNode =
            node.nodeType !== "task" && node.nodeType !== "condicional";
          if (!isEntityNode) {
            return { ...node, isPrimaryEntity: false };
          }

          if (node.id === selectedNodeId) {
            return {
              ...node,
              isPrimaryEntity: nextIsPrimaryEntity === true,
            };
          }

          return node;
        }),
      );
    },
    [selectedNodeId],
  );

  const handleSetSelectedNodeEntityType = React.useCallback(
    (nextEntityType) => {
      if (!selectedNodeId) return;

      const normalizedType = String(nextEntityType || "")
        .trim()
        .toLowerCase();
      const resolvedType =
        normalizedType === "contato" || normalizedType === "processo"
          ? normalizedType
          : "processo";
      const nextIsPrimary = resolvedType === "contato";

      setNodes((previous) =>
        previous.map((node) => {
          const isEntityNode =
            node.nodeType !== "task" && node.nodeType !== "condicional";
          if (!isEntityNode) {
            return { ...node, isPrimaryEntity: false, tipoEntidade: "" };
          }

          if (node.id === selectedNodeId) {
            return {
              ...node,
              tipoEntidade: resolvedType,
              isPrimaryEntity: nextIsPrimary,
            };
          }

          return node;
        }),
      );
    },
    [selectedNodeId],
  );

  React.useEffect(() => {
    if (aiContextAppliedRef.current) return;
    if (!pendingAiContextPanel) return;

    if (!selectedNode) {
      if (Array.isArray(nodes) && nodes.length > 0) {
        setSelectedNodeId(String(nodes[0].id || ""));
      }
      return;
    }

    const suggestion =
      pendingAiContextPanel && typeof pendingAiContextPanel === "object"
        ? pendingAiContextPanel
        : {};
    const stageCategory = String(suggestion.stageCategory || "dados")
      .trim()
      .toLowerCase();
    const stageNodeType =
      stageCategory === "task"
        ? "task"
        : stageCategory === "condicional"
          ? "condicional"
          : "entidade";

    const entityTypeCandidate = String(suggestion.entityType || "processo")
      .trim()
      .toLowerCase();
    const entityType =
      entityTypeCandidate === "contato" || entityTypeCandidate === "processo"
        ? entityTypeCandidate
        : "processo";

    const entityModeCandidate = String(suggestion.entityMode || "nova")
      .trim()
      .toLowerCase();
    const entityModeNext =
      entityModeCandidate === "existente" ? "existente" : "nova";

    const newEntity =
      suggestion.newEntity && typeof suggestion.newEntity === "object"
        ? suggestion.newEntity
        : {};
    const task =
      suggestion.task && typeof suggestion.task === "object"
        ? suggestion.task
        : {};
    const conditional =
      suggestion.conditional && typeof suggestion.conditional === "object"
        ? suggestion.conditional
        : {};
    const rawFields = Array.isArray(suggestion.fields) ? suggestion.fields : [];

    const mappedFields = rawFields
      .map((field) => {
        if (!field || typeof field !== "object") return null;
        const nome = String(field.nome || "").trim();
        if (!nome) return null;
        const tipo = String(field.tipo || "Texto").trim() || "Texto";
        const keyTypeRaw = String(field.keyType || "NORMAL")
          .trim()
          .toUpperCase();
        const keyType = ["PK", "FK", "NORMAL"].includes(keyTypeRaw)
          ? keyTypeRaw
          : "NORMAL";
        return {
          id: generateUniqueId("field"),
          nome,
          tipo,
          obrigatorio: field.obrigatorio === true,
          keyType,
          relacionamento: String(field.referencia || "").trim() || null,
        };
      })
      .filter(Boolean);

    setActiveSidebarTab("entidade");
    setStageConfigMode(
      stageNodeType === "condicional" ? "condicional" : "entidade",
    );
    setEntityMode(entityModeNext);
    setConditionalForm({
      nome: String(conditional.nome || "").trim(),
      descricao: String(conditional.descricao || "").trim(),
    });
    setTaskForm({
      nome: String(task.nome || "").trim(),
      descricao: String(task.descricao || "").trim(),
    });
    setNewEntityForm({
      nome: String(newEntity.nome || "").trim(),
      descricao: String(newEntity.descricao || "").trim(),
      atributoChave: String(newEntity.atributoChave || "").trim(),
    });
    setNewEntityFields(mappedFields);
    setSelectedDataFieldIds(
      mappedFields
        .map((field) => String(field?.id || "").trim())
        .filter(Boolean),
    );
    setEntityFieldDraft(createEmptyEntityFieldDraft());

    const selectedEntityByName =
      entityModeNext === "existente"
        ? (Array.isArray(entityOptions) ? entityOptions : []).find(
            (item) =>
              normalizeEntityName(item?.nome || "") ===
              normalizeEntityName(newEntity.nome || ""),
          )
        : null;

    setSelectedExistingEntityId(
      selectedEntityByName ? String(selectedEntityByName.id || "") : "",
    );

    updateSelectedNode({
      nodeType: stageNodeType,
      isPrimaryEntity: entityType === "contato",
      tipoEntidade: stageNodeType === "entidade" ? entityType : "",
      condicionalNome:
        stageNodeType === "condicional"
          ? String(conditional.nome || "").trim()
          : "",
      condicionalDescricao:
        stageNodeType === "condicional"
          ? String(conditional.descricao || "").trim()
          : "",
      taskNome: stageNodeType === "task" ? String(task.nome || "").trim() : "",
      taskDescricao:
        stageNodeType === "task" ? String(task.descricao || "").trim() : "",
      entidadeId: null,
      entidadeNome:
        stageNodeType === "entidade" ? String(newEntity.nome || "").trim() : "",
      label:
        stageNodeType === "entidade"
          ? String(newEntity.nome || "").trim()
          : stageNodeType === "task"
            ? String(task.nome || "").trim()
            : String(conditional.nome || "").trim(),
      descricao:
        stageNodeType === "entidade"
          ? String(newEntity.descricao || "").trim()
          : stageNodeType === "task"
            ? String(task.descricao || "").trim()
            : String(conditional.descricao || "").trim(),
      selectedEntityFieldIds:
        stageNodeType === "entidade"
          ? mappedFields
              .map((field) => String(field?.id || "").trim())
              .filter(Boolean)
          : [],
      selectedEntityFieldNames:
        stageNodeType === "entidade"
          ? mappedFields
              .map((field) => String(field?.nome || "").trim())
              .filter(Boolean)
          : [],
      selectedEntityFields:
        stageNodeType === "entidade"
          ? mappedFields.map((field) => ({
              id: String(field?.id || "").trim(),
              nome: String(field?.nome || "").trim(),
              tipo: String(field?.tipo || "").trim(),
              obrigatorio: field?.obrigatorio === true,
              keyType: String(field?.keyType || "NORMAL")
                .trim()
                .toUpperCase(),
              relacionamento:
                String(field?.relacionamento || "").trim() || null,
            }))
          : [],
    });

    setEntityError("");
    setEntitySavedNotice(
      "Configuração sugerida pela IA aplicada no painel contextual.",
    );
    setEntitySavedNoticeNodeId(String(selectedNode.id || "").trim());
    aiContextAppliedRef.current = true;
    setPendingAiContextPanel(null);
  }, [
    entityOptions,
    nodes,
    pendingAiContextPanel,
    selectedNode,
    updateSelectedNode,
  ]);

  const handleEditSuggestedEntity = React.useCallback(() => {
    if (!suggestedEntity) return;

    const entityId = getEntidadeId(suggestedEntity);
    if (entityId === null || entityId === undefined) return;

    setEntityMode("existente");
    setSelectedExistingEntityId(String(entityId));
    setNewEntityForm({
      nome: String(suggestedEntity.nome || "").trim(),
      descricao: String(suggestedEntity.descricao || "").trim(),
      atributoChave: String(suggestedEntity.atributoChave || "").trim(),
    });
    setEntityError("");
    setEntitySuggestionEntityId("");
  }, [suggestedEntity]);

  const executeDeleteSuggestedEntity = React.useCallback(
    async (entityToDelete) => {
      if (!entityToDelete) return;

      const entityId = getEntidadeId(entityToDelete);
      if (entityId === null || entityId === undefined) return;

      setIsEntitySuggestionBusy(true);

      try {
        const token = getAuthToken();
        await deletarEntidade(entityId, token);

        if (selectedExistingEntityId === String(entityId)) {
          setSelectedExistingEntityId("");
          if (entityMode === "existente") {
            setEntityMode("nova");
          }
        }

        if (
          selectedNode &&
          String(resolveEntityIdFromNode(selectedNode) || "") ===
            String(entityId)
        ) {
          updateSelectedNode({
            entidadeId: null,
            entidadeNome: "",
          });
        }

        setEntitySuggestionEntityId("");
        setEntityError("");
        setEntitySavedNotice("Entidade removida da lista.");
        setEntitySavedNoticeNodeId(selectedNode?.id || "");
      } catch (err) {
        setEntityError(err?.message || "Não foi possível remover a entidade.");
      } finally {
        setIsEntitySuggestionBusy(false);
      }
    },
    [
      deletarEntidade,
      entityMode,
      resolveEntityIdFromNode,
      selectedExistingEntityId,
      selectedNode,
      updateSelectedNode,
    ],
  );

  const handleDeleteSuggestedEntity = React.useCallback(() => {
    if (!suggestedEntity) return;

    if (skipDeleteSuggestedEntityPrompt) {
      executeDeleteSuggestedEntity(suggestedEntity);
      return;
    }

    setDisableDeleteSuggestedEntityPromptDraft(false);
    setDeleteSuggestedEntityDraft(suggestedEntity);
  }, [
    executeDeleteSuggestedEntity,
    skipDeleteSuggestedEntityPrompt,
    suggestedEntity,
  ]);

  const handleConfirmDeleteSuggestedEntity = React.useCallback(async () => {
    if (!deleteSuggestedEntityDraft) return;

    if (disableDeleteSuggestedEntityPromptDraft) {
      setSkipDeleteSuggestedEntityPrompt(true);
    }

    await executeDeleteSuggestedEntity(deleteSuggestedEntityDraft);
    setDeleteSuggestedEntityDraft(null);
    setDisableDeleteSuggestedEntityPromptDraft(false);
  }, [
    deleteSuggestedEntityDraft,
    disableDeleteSuggestedEntityPromptDraft,
    executeDeleteSuggestedEntity,
  ]);

  const handleCancelDeleteSuggestedEntity = React.useCallback(() => {
    if (disableDeleteSuggestedEntityPromptDraft) {
      setSkipDeleteSuggestedEntityPrompt(true);
    }

    setDeleteSuggestedEntityDraft(null);
    setDisableDeleteSuggestedEntityPromptDraft(false);
  }, [disableDeleteSuggestedEntityPromptDraft]);

  const handleSubmitEntityAction = React.useCallback(
    async (fieldsOverride) => {
      if (!selectedNode) return;

      setEntitySavedNotice("");
      setEntitySavedNoticeNodeId("");

      const effectiveFields = Array.isArray(fieldsOverride)
        ? fieldsOverride
        : newEntityFields;

      if (isEditingEntityAction && entityActionTarget) {
        const entidadeId = getEntidadeId(entityActionTarget);
        if (entidadeId === null || entidadeId === undefined) {
          setEntityError("Selecione uma entidade para editar.");
          setEntitySavedNotice("");
          return;
        }

        const nomeDraft = String(newEntityForm.nome || "").trim();
        const descricaoDraft = String(newEntityForm.descricao || "").trim();
        const atributoChaveDraft = String(
          newEntityForm.atributoChave || "",
        ).trim();

        const nome =
          nomeDraft || String(entityActionTarget?.nome || "").trim() || "";
        const descricao =
          descricaoDraft ||
          String(entityActionTarget?.descricao || "").trim() ||
          "Entidade gerada pelo BPMN";
        const atributoChave =
          atributoChaveDraft ||
          String(entityActionTarget?.atributoChave || "").trim();
        const tipoEntidade =
          String(
            selectedNode?.tipoEntidade ||
              entityActionTarget?.tipoEntidade ||
              "",
          ).trim() ||
          (selectedNode?.isPrimaryEntity === true ||
          entityActionTarget?.isPrimaryEntity === true
            ? "contato"
            : "processo");
        const isPrimaryEntity =
          String(tipoEntidade || "")
            .trim()
            .toLowerCase() === "contato";
        const camposParaSalvar =
          Array.isArray(effectiveFields) && effectiveFields.length > 0
            ? effectiveFields
            : getCamposEntidade(entityActionTarget);

        if (!nome) {
          setEntityError("Preencha ao menos o nome da entidade.");
          setEntitySavedNotice("");
          return;
        }

        try {
          const token = getAuthToken();
          const entidadeEditada = await editarEntidade(
            entidadeId,
            {
              nome,
              descricao,
              atributoChave,
              tipoEntidade,
              isPrimaryEntity,
              categoria: entityActionTarget.categoria || "BPMN",
              campos: camposParaSalvar,
            },
            token,
          );

          const entidadeAtualizada = {
            ...entityActionTarget,
            ...entidadeEditada,
            nome,
            descricao,
            atributoChave,
            tipoEntidade,
            isPrimaryEntity,
          };

          applyEntityToSelectedNode(entidadeAtualizada);
          setSelectedExistingEntityId(
            String(getEntidadeId(entidadeAtualizada)),
          );
          setEntityError("");
          setEntitySavedNotice("Entidade salva na página de Entidades.");
          setEntitySavedNoticeNodeId(selectedNode.id);
        } catch (err) {
          setEntityError(err?.message || "Não foi possível editar a entidade.");
          setEntitySavedNotice("");
          setEntitySavedNoticeNodeId("");
        }

        return;
      }

      await handleCreateAndLinkEntity(effectiveFields);
    },
    [
      applyEntityToSelectedNode,
      editarEntidade,
      entityActionTarget,
      getCamposEntidade,
      handleCreateAndLinkEntity,
      isEditingEntityAction,
      newEntityFields,
      newEntityForm.atributoChave,
      newEntityForm.descricao,
      newEntityForm.nome,
      selectedNode,
    ],
  );

  React.useEffect(() => {
    if (entityMode !== "existente") return;
    if (!selectedExistingEntity) return;

    const existingName = String(selectedExistingEntity.nome || "").trim();
    const existingDesc = String(selectedExistingEntity.descricao || "").trim();
    const nodeDescValue = String(selectedNode?.descricao || "").trim();
    const nodeLabel =
      existingName ||
      String(selectedNode?.entidadeNome || selectedNode?.label || "").trim();

    const isSameAsLabel =
      nodeDescValue.toLowerCase() === nodeLabel.toLowerCase();
    const descFallback = isSameAsLabel ? "" : nodeDescValue;

    setNewEntityForm((previous) => ({
      ...previous,
      nome: existingName,
      descricao: existingDesc || descFallback,
      atributoChave: String(selectedExistingEntity.atributoChave || "").trim(),
    }));

    const existingFields = getCamposEntidade(selectedExistingEntity).map(
      normalizeEntityFieldEntry,
    );
    const restoredNodeFields = Array.isArray(selectedNode?.selectedEntityFields)
      ? selectedNode.selectedEntityFields.map(normalizeEntityFieldEntry)
      : [];
    const mergedFields = mergeEntityFieldEntries(
      existingFields,
      restoredNodeFields,
    );

    setNewEntityFields(mergedFields);
    setSelectedDataFieldIds(
      mergedFields
        .map((field) => String(field?.id ?? "").trim())
        .filter(Boolean),
    );
  }, [
    entityMode,
    getCamposEntidade,
    selectedExistingEntity,
    selectedNode?.selectedEntityFields,
    selectedNode?.descricao,
    selectedNode?.entidadeNome,
    selectedNode?.label,
  ]);

  const handleSaveLinkedField = React.useCallback(async () => {
    const resolvedFieldEntityTarget =
      fieldEntityTarget ||
      (selectedExistingEntityId
        ? (Array.isArray(entidades) ? entidades : []).find(
            (entidade) =>
              String(getEntidadeId(entidade)) ===
              String(selectedExistingEntityId),
          ) || null
        : null) ||
      selectedNodeLinkedEntity ||
      null;

    if (!resolvedFieldEntityTarget) {
      setEntityError("Selecione uma entidade existente para adicionar campo.");
      return;
    }

    const nome = String(linkedFieldDraft.nome || "").trim();
    if (!nome) {
      setEntityError("Nome do campo é obrigatório.");
      return;
    }

    if (!String(linkedFieldDraft.tipo || "").trim()) {
      setEntityError("Selecione o tipo do campo.");
      return;
    }

    if (typeof linkedFieldDraft.obrigatorio !== "boolean") {
      setEntityError("Informe se o campo é obrigatório.");
      return;
    }

    if (!String(linkedFieldDraft.keyType || "").trim()) {
      setEntityError("Selecione o tipo de chave do campo.");
      return;
    }

    const normalizedKeyType = String(linkedFieldDraft.keyType || "NORMAL")
      .trim()
      .toUpperCase();
    const referencia = String(linkedFieldDraft.referencia || "").trim();

    const duplicated = validarNomeCampoDuplicado(
      linkedEntityFieldsForPanel,
      nome,
      linkedFieldDraft.id,
    );

    if (duplicated) {
      setEntityError("Já existe um campo com esse nome na entidade vinculada.");
      return;
    }

    try {
      let camposAtualizados = null;

      if (linkedFieldDraft.id) {
        camposAtualizados = await editarCampoEntidade(
          resolvedFieldEntityTarget,
          linkedFieldDraft.id,
          {
            nome,
            tipo: linkedFieldDraft.tipo,
            obrigatorio: linkedFieldDraft.obrigatorio,
            keyType: normalizedKeyType,
            relacionamento: referencia || null,
          },
        );
      } else {
        camposAtualizados = await adicionarCampoEntidade(
          resolvedFieldEntityTarget,
          {
            nome,
            tipo: linkedFieldDraft.tipo,
            obrigatorio: linkedFieldDraft.obrigatorio,
            keyType: normalizedKeyType,
            relacionamento: referencia || null,
          },
        );
      }

      setLinkedEntityFieldsDraft(
        Array.isArray(camposAtualizados) ? camposAtualizados : null,
      );

      setLinkedFieldDraft(createEmptyEntityFieldDraft());
      setEntityError("");
    } catch (err) {
      setEntityError(err?.message || "Não foi possível salvar o campo.");
    }
  }, [
    adicionarCampoEntidade,
    editarCampoEntidade,
    entidades,
    fieldEntityTarget,
    linkedEntityFieldsForPanel,
    linkedFieldDraft,
    selectedExistingEntityId,
    selectedNodeLinkedEntity,
    validarNomeCampoDuplicado,
  ]);

  const handleRemoveLinkedField = React.useCallback(
    async (campoId) => {
      if (!fieldEntityTarget) return;
      try {
        const camposAtualizados = await removerCampoEntidade(
          fieldEntityTarget,
          campoId,
        );
        setLinkedEntityFieldsDraft(
          Array.isArray(camposAtualizados) ? camposAtualizados : null,
        );
        if (String(linkedFieldDraft.id) === String(campoId)) {
          setLinkedFieldDraft(createEmptyEntityFieldDraft());
        }
      } catch (err) {
        setEntityError(err?.message || "Não foi possível remover o campo.");
      }
    },
    [fieldEntityTarget, linkedFieldDraft.id, removerCampoEntidade],
  );

  const isConnectionTabActive = activeSidebarTab === "connection";
  const isGatewayInfoTabActive = activeSidebarTab === "conexoes";
  const isTaskNodeSelected = selectedNode?.nodeType === "task";
  const isDecisionNodeSelected = selectedNode?.nodeType === "condicional";
  const isDataNodeSelected = selectedNode?.nodeType === "entidade";
  const isStageModeSelected =
    stageConfigMode === "entidade" || stageConfigMode === "condicional";
  const isConditionalStageMode =
    stageConfigMode === "condicional"
      ? true
      : stageConfigMode === "entidade"
        ? false
        : selectedNode?.nodeType === "condicional";
  const shouldAutoSaveFieldDraft = React.useMemo(() => {
    if (!entityFieldDraft) return false;

    const hasName = Boolean(String(entityFieldDraft.nome || "").trim());
    const hasType = Boolean(String(entityFieldDraft.tipo || "").trim());
    const hasRequired = typeof entityFieldDraft.obrigatorio === "boolean";
    const hasEditingId =
      entityFieldDraft.id !== null &&
      entityFieldDraft.id !== undefined &&
      String(entityFieldDraft.id).trim() !== "";

    return hasEditingId || (hasName && hasType && hasRequired);
  }, [entityFieldDraft]);

  const persistEditorDraftToLocalStorage = React.useCallback(() => {
    if (!hasHydratedBpmnRef.current) return;

    try {
      window.localStorage.setItem(
        BPMN_EDITOR_LOCAL_STORAGE_KEY,
        JSON.stringify({
          ...currentDraftRef.current,
          pendingTimelineItems: pendingTimelineItemsRef.current,
          updated_at: new Date().toISOString(),
        }),
      );
    } catch {
      // no-op
    }
  }, []);

  const clearEditorDraftFromLocalStorage = React.useCallback(() => {
    try {
      window.localStorage.removeItem(BPMN_EDITOR_LOCAL_STORAGE_KEY);
      window.localStorage.removeItem(BPMN_EDITOR_NAME_DRAFT_KEY);
      window.sessionStorage.removeItem(BPMN_EDITOR_NAME_DRAFT_KEY);
    } catch {
      // no-op
    }
  }, [BPMN_EDITOR_NAME_DRAFT_KEY]);

  const handleSidebarPrimaryAction = React.useCallback(async () => {
    if (isConnectionTabActive || isGatewayInfoTabActive) {
      return;
    }

    if (isTaskNodeSelected) {
      handleSaveTaskStage();
      persistEditorDraftToLocalStorage();
      return;
    }

    if (isDataNodeSelected && entityMode === "nova" && !isEditingEntityAction) {
      handleSaveEntityStageLocal();
      persistEditorDraftToLocalStorage();
      return;
    }

    if (isDataNodeSelected && shouldAutoSaveFieldDraft) {
      const nextFields = handleSaveEntityFieldDraft();
      if (!nextFields) {
        return;
      }

      await handleSubmitEntityAction(nextFields);
      persistEditorDraftToLocalStorage();
      return;
    }

    if (isDecisionNodeSelected) {
      handleSaveConditionalStage();
      persistEditorDraftToLocalStorage();
      return;
    }

    if (!isDataNodeSelected) {
      setEntityError("Selecione uma categoria válida para salvar.");
      return;
    }

    await handleSubmitEntityAction();
    persistEditorDraftToLocalStorage();
  }, [
    persistEditorDraftToLocalStorage,
    entityMode,
    handleSaveEntityFieldDraft,
    handleSaveConditionalStage,
    handleSaveEntityStageLocal,
    handleSaveTaskStage,
    handleSubmitEntityAction,
    isEditingEntityAction,
    isDataNodeSelected,
    isDecisionNodeSelected,
    isConnectionTabActive,
    isGatewayInfoTabActive,
    isTaskNodeSelected,
    shouldAutoSaveFieldDraft,
    setEntityError,
  ]);

  const shouldShowSidebarPrimaryAction =
    !isConnectionTabActive && !isGatewayInfoTabActive;

  const isSidebarPrimaryActionDisabled = React.useMemo(() => {
    if (!shouldShowSidebarPrimaryAction) return true;
    if (!selectedNode) return true;
    if (isTaskNodeSelected) {
      return !String(taskForm.nome || "").trim();
    }

    if (isDecisionNodeSelected) {
      return false;
    }

    if (isDataNodeSelected) {
      return false;
    }

    if (!isStageModeSelected) return true;

    return false;
  }, [
    isDataNodeSelected,
    isDecisionNodeSelected,
    isStageModeSelected,
    isTaskNodeSelected,
    selectedNode,
    shouldShowSidebarPrimaryAction,
    taskForm.nome,
  ]);

  const selectedNodeTypeSelectorValue = selectedNode
    ? selectedNode.nodeType === "task"
      ? "task"
      : selectedNode.nodeType === "condicional"
        ? "condicional"
        : "entidade"
    : "entidade";

  const selectedNodeIsPrimaryEntity = Boolean(
    selectedNode?.nodeType !== "task" &&
    selectedNode?.nodeType !== "condicional" &&
    selectedNode?.isPrimaryEntity === true,
  );

  const selectedNodeEntityType = React.useMemo(() => {
    if (!selectedNode) return "processo";
    if (
      selectedNode?.nodeType === "task" ||
      selectedNode?.nodeType === "condicional"
    ) {
      return "processo";
    }

    const normalized = String(selectedNode?.tipoEntidade || "")
      .trim()
      .toLowerCase();

    if (normalized === "contato" || normalized === "processo") {
      return normalized;
    }

    // Legacy mapping: old "principal" values map to "contato"
    if (normalized === "principal") return "contato";

    return selectedNode?.isPrimaryEntity === true ? "contato" : "processo";
  }, [selectedNode]);

  const filteredEntityOptions = React.useMemo(() => {
    const categoriaAtual = selectedNodeTypeSelectorValue;

    return entityOptions.filter((entidade) => {
      const normalizedCategory = normalizeEntityName(entidade.categoria || "");

      if (categoriaAtual === "entidade") {
        return (
          !normalizedCategory ||
          !["task", "atividade", "gateway", "condicional", "decisao"].includes(
            normalizedCategory,
          )
        );
      }

      if (categoriaAtual === "task") {
        return (
          normalizedCategory === "task" || normalizedCategory === "atividade"
        );
      }

      if (categoriaAtual === "condicional") {
        return (
          normalizedCategory === "gateway" ||
          normalizedCategory === "condicional" ||
          normalizedCategory === "decisao"
        );
      }

      return true;
    });
  }, [entityOptions, selectedNodeTypeSelectorValue]);

  React.useEffect(() => {
    if (entityMode !== "existente") return;
    if (!selectedExistingEntityId) return;

    const stillAvailable = filteredEntityOptions.some(
      (entidade) => String(entidade.id) === String(selectedExistingEntityId),
    );

    if (!stillAvailable) {
      setSelectedExistingEntityId("");
    }
  }, [
    entityMode,
    filteredEntityOptions,
    selectedExistingEntityId,
    setSelectedExistingEntityId,
  ]);

  const handleToggleNodeActive = React.useCallback((nodeId) => {
    setNodes((previous) => {
      const activeCount = previous.filter(
        (node) => node.active !== false,
      ).length;
      return previous.map((node) => {
        if (node.id !== nodeId) return node;
        if (node.active !== false && activeCount <= 1) {
          return node;
        }
        return { ...node, active: node.active === false };
      });
    });
  }, []);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isTouchDevice ? "auto" : "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isTouchDevice]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updateTouchMode = () => {
      setIsTouchDevice(mediaQuery.matches);
    };

    updateTouchMode();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateTouchMode);
      return () => mediaQuery.removeEventListener("change", updateTouchMode);
    }

    mediaQuery.addListener(updateTouchMode);
    return () => mediaQuery.removeListener(updateTouchMode);
  }, []);

  React.useEffect(() => {
    if (!isTouchDevice) return;

    setZoom((previousZoom) => (previousZoom === 1 ? 0.65 : previousZoom));
  }, [isTouchDevice]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const landscapeQuery = window.matchMedia("(orientation: landscape)");

    const updateLandscapeMode = () => {
      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      setIsMobileLandscape(landscapeQuery.matches && isCoarsePointer);
    };

    updateLandscapeMode();

    if (landscapeQuery.addEventListener) {
      landscapeQuery.addEventListener("change", updateLandscapeMode);
      window.addEventListener("resize", updateLandscapeMode);
      return () => {
        landscapeQuery.removeEventListener("change", updateLandscapeMode);
        window.removeEventListener("resize", updateLandscapeMode);
      };
    }

    landscapeQuery.addListener(updateLandscapeMode);
    window.addEventListener("resize", updateLandscapeMode);
    return () => {
      landscapeQuery.removeListener(updateLandscapeMode);
      window.removeEventListener("resize", updateLandscapeMode);
    };
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === "Space") {
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (event) => {
      if (event.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleResetToDefault = React.useCallback(() => {
    if (isReadOnlyMode) return;
    setNodes((previous) => getCompactLayoutedNodes(previous, connections));

    setConnectorRevealMode("hover-side");
    setSelectedConnectionId("");
  }, [connections, getCompactLayoutedNodes, isReadOnlyMode]);

  React.useEffect(() => {
    if (hasNormalizedInitialLayoutRef.current) return;
    if (!viewportRef.current) return;
    if (nodes.length === 0) return;

    hasNormalizedInitialLayoutRef.current = true;
    setNodes((previous) => getCompactLayoutedNodes(previous, connections));
  }, [connections, getCompactLayoutedNodes, nodes.length]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateViewportWidth = () => {
      const nextWidth = viewport.clientWidth || 1200;
      setViewportGridWidth(nextWidth);
    };

    updateViewportWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportWidth);
      return () => window.removeEventListener("resize", updateViewportWidth);
    }

    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  const centerOnNodes = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || nodes.length === 0) return;

    const padding = 120;
    const minX = Math.min(...nodes.map((node) => node.x || 0));
    const minY = Math.min(...nodes.map((node) => node.y || 0));
    const maxX = Math.max(...nodes.map((node) => (node.x || 0) + 220));
    const maxY = Math.max(...nodes.map((node) => (node.y || 0) + 110));

    const centerX = ((minX + maxX) / 2) * zoom;
    const centerY = ((minY + maxY) / 2) * zoom;

    viewport.scrollLeft = Math.max(0, centerX - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, centerY - viewport.clientHeight / 2);

    if (nodes.length === 1) {
      viewport.scrollLeft = Math.max(0, (minX - padding) * zoom);
      viewport.scrollTop = Math.max(0, (minY - padding) * zoom);
    }
  }, [nodes, zoom]);

  const fitNodesToViewport = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || nodes.length === 0) return;

    const minX = Math.min(...nodes.map((node) => node.x || 0));
    const minY = Math.min(...nodes.map((node) => node.y || 0));
    const maxX = Math.max(...nodes.map((node) => (node.x || 0) + 280));
    const maxY = Math.max(...nodes.map((node) => (node.y || 0) + 160));

    const horizontalPadding = 280;
    const verticalPadding = 240;
    const contentWidth = Math.max(320, maxX - minX + horizontalPadding);
    const contentHeight = Math.max(180, maxY - minY + verticalPadding);

    const availableWidth = Math.max(260, viewport.clientWidth - 56);
    const availableHeight = Math.max(220, viewport.clientHeight - 56);
    const fittedZoom = Number(
      Math.max(
        MIN_ZOOM,
        Math.min(
          MAX_ZOOM,
          Math.min(
            availableWidth / contentWidth,
            availableHeight / contentHeight,
          ),
        ),
      ).toFixed(2),
    );

    setZoom(fittedZoom);
    setZoomButtonDirection(fittedZoom <= MIN_ZOOM ? 1 : -1);

    requestAnimationFrame(() => {
      const centeredWorldX = minX + (maxX - minX) / 2;
      const centeredWorldY = minY + (maxY - minY) / 2;

      viewport.scrollLeft = Math.max(
        0,
        centeredWorldX * fittedZoom - viewport.clientWidth / 2,
      );
      viewport.scrollTop = Math.max(
        0,
        centeredWorldY * fittedZoom - viewport.clientHeight / 2,
      );
    });
  }, [MAX_ZOOM, MIN_ZOOM, nodes]);

  const updateViewportMetrics = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    setViewportMetrics({
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      clientWidth: viewport.clientWidth,
      clientHeight: viewport.clientHeight,
    });
  }, []);

  React.useEffect(() => {
    updateViewportMetrics();
  }, [updateViewportMetrics, zoom, canvasWidth, canvasHeight, nodes.length]);

  const minimapState = React.useMemo(() => {
    if (canvasWidth <= 0 || canvasHeight <= 0) return null;

    const width = 180;
    const height = Math.max(92, Math.round((canvasHeight / canvasWidth) * 180));
    const normalizedZoom = Math.max(0.1, zoom || 1);

    const viewX =
      (viewportMetrics.scrollLeft / normalizedZoom / canvasWidth) * width;
    const viewY =
      (viewportMetrics.scrollTop / normalizedZoom / canvasHeight) * height;
    const viewWidth =
      (viewportMetrics.clientWidth / normalizedZoom / canvasWidth) * width;
    const viewHeight =
      (viewportMetrics.clientHeight / normalizedZoom / canvasHeight) * height;

    return {
      width,
      height,
      viewX: Math.max(0, Math.min(width, viewX)),
      viewY: Math.max(0, Math.min(height, viewY)),
      viewWidth: Math.max(12, Math.min(width, viewWidth)),
      viewHeight: Math.max(12, Math.min(height, viewHeight)),
    };
  }, [canvasHeight, canvasWidth, viewportMetrics, zoom]);

  const handleMiniMapPointerDown = React.useCallback(
    (event) => {
      const minimapElement = minimapRef.current;
      const viewport = viewportRef.current;
      if (!minimapElement || !viewport || !minimapState) return;

      const rect = minimapElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const ratioX = Math.max(
        0,
        Math.min(1, (event.clientX - rect.left) / rect.width),
      );
      const ratioY = Math.max(
        0,
        Math.min(1, (event.clientY - rect.top) / rect.height),
      );

      const normalizedZoom = Math.max(0.1, zoom || 1);
      const worldX = ratioX * canvasWidth;
      const worldY = ratioY * canvasHeight;

      const targetLeft = Math.max(
        0,
        (worldX - viewport.clientWidth / (2 * normalizedZoom)) * normalizedZoom,
      );
      const targetTop = Math.max(
        0,
        (worldY - viewport.clientHeight / (2 * normalizedZoom)) *
          normalizedZoom,
      );

      viewport.scrollLeft = Math.min(
        targetLeft,
        Math.max(0, viewport.scrollWidth - viewport.clientWidth),
      );
      viewport.scrollTop = Math.min(
        targetTop,
        Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      );

      updateViewportMetrics();
    },
    [canvasHeight, canvasWidth, minimapState, updateViewportMetrics, zoom],
  );

  const syncBpmnNodesToEntidadesCatalog = React.useCallback(
    async (resolvedNodes = []) => {
      const bpmnCategoryName =
        String(name || DEFAULT_BPMN_NAME || "").trim() || "BPMN";
      const normalizedBpmnCategoryName = normalizeEntityName(bpmnCategoryName);
      const buildNameCategoryKey = (entityName, categoryName) => {
        const normalizedEntityName = normalizeEntityName(entityName);
        const normalizedCategoryName = normalizeEntityName(categoryName);
        if (!normalizedEntityName || !normalizedCategoryName) return "";
        return `${normalizedEntityName}@@${normalizedCategoryName}`;
      };
      const syncedNodes = (
        Array.isArray(resolvedNodes) ? resolvedNodes : []
      ).map((node) => ({ ...node }));

      const rebindSyncedNodesEntity = ({
        rawEntityId,
        normalizedName,
        entityId,
        entityName,
      }) => {
        if (entityId === null || entityId === undefined) return;

        syncedNodes.forEach((node) => {
          const nodeType = String(node?.nodeType || "")
            .trim()
            .toLowerCase();
          if (nodeType !== "entidade") return;

          const matchesById =
            rawEntityId &&
            String(node?.entidadeId ?? "").trim() === rawEntityId;
          const matchesByName =
            !rawEntityId &&
            normalizeEntityName(
              node?.entidadeNome || node?.label || node?.descricao || "",
            ) === normalizedName;

          if (!matchesById && !matchesByName) return;

          node.entidadeId = entityId;
          node.entidadeNome = String(
            entityName || node?.entidadeNome || "",
          ).trim();
        });
      };
      const getNodeNome = (node) => {
        return String(
          node?.entidadeNome || node?.label || node?.descricao || "",
        ).trim();
      };

      const getNodeDescricao = (node) => {
        const rawDescricao = String(node?.descricao || "").trim();
        const rawLabel = String(node?.label || "").trim();
        if (
          rawDescricao &&
          rawDescricao.toLowerCase() !== rawLabel.toLowerCase()
        ) {
          return rawDescricao;
        }
        return "";
      };

      const getNodeCampos = (node) => {
        const rawFields = Array.isArray(node?.selectedEntityFields)
          ? node.selectedEntityFields
          : [];

        return rawFields
          .map((field) => ({
            id:
              String(field?.id || "").trim() ||
              `campo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      };

      const dedupedEntities = new Map();
      (Array.isArray(resolvedNodes) ? resolvedNodes : []).forEach((node) => {
        if (node?.active === false) return;

        const normalizedType = String(node?.nodeType || "")
          .trim()
          .toLowerCase();

        if (normalizedType !== "entidade") {
          return;
        }

        const nome = getNodeNome(node);
        const normalizedName = normalizeEntityName(nome);
        const rawEntityId =
          node?.entidadeId !== null && node?.entidadeId !== undefined
            ? String(node.entidadeId).trim()
            : "";
        const dedupeKey = rawEntityId
          ? `id:${rawEntityId}`
          : normalizedName
            ? `name:${normalizedName}`
            : "";

        if (!dedupeKey) return;

        dedupedEntities.set(dedupeKey, {
          rawEntityId,
          normalizedName,
          nome,
          payload: {
            nome,
            categoria: bpmnCategoryName,
            tipoEntidade:
              String(node?.tipoEntidade || "").trim() ||
              (node?.isPrimaryEntity === true ? "Principal" : "Apoio"),
            isPrimaryEntity: node?.isPrimaryEntity === true,
            descricao: getNodeDescricao(node),
            atributoChave: String(
              node?.atributoChave || node?.info || "",
            ).trim(),
            ativo: true,
            criadoPor: actorAccountName,
            campos: getNodeCampos(node),
          },
        });
      });

      if (dedupedEntities.size === 0) return;

      const existingById = new Map(
        (Array.isArray(entidades) ? entidades : [])
          .map((entidade) => [getEntidadeId(entidade), entidade])
          .filter(([id]) => id !== null && id !== undefined),
      );

      const existingByNameAndCategory = new Map(
        (Array.isArray(entidades) ? entidades : [])
          .map((entidade) => [
            buildNameCategoryKey(
              getEntidadeNome(entidade),
              String(entidade?.categoria || "").trim(),
            ),
            entidade,
          ])
          .filter(([key]) => Boolean(key)),
      );

      const token = getAuthToken();

      const batchItems = [...dedupedEntities.values()].map(
        (entityCandidate) => {
          const { rawEntityId, normalizedName, payload } = entityCandidate;
          const nameCategoryKey =
            normalizedName && normalizedBpmnCategoryName
              ? `${normalizedName}@@${normalizedBpmnCategoryName}`
              : "";

          const existingByEntityId = rawEntityId
            ? existingById.get(rawEntityId)
            : null;
          const existingByEntityIdCategoryMatches =
            existingByEntityId &&
            normalizeEntityName(
              String(existingByEntityId?.categoria || "").trim(),
            ) === normalizedBpmnCategoryName;
          const existingByEntityNameAndCategory = nameCategoryKey
            ? existingByNameAndCategory.get(nameCategoryKey)
            : null;
          const existing = existingByEntityIdCategoryMatches
            ? existingByEntityId
            : existingByEntityNameAndCategory || null;

          const existingId = existing ? getEntidadeId(existing) : null;

          return {
            action: "upsert",
            id:
              existingId !== null && existingId !== undefined
                ? existingId
                : null,
            data: payload,
            _rawEntityId: rawEntityId,
            _normalizedName: normalizedName,
          };
        },
      );

      try {
        const batchResult = await batchSyncEntidades({
          items: batchItems.map(
            ({ _rawEntityId, _normalizedName, ...rest }) => rest,
          ),
          token,
        });

        const resultItems = Array.isArray(batchResult?.items)
          ? batchResult.items
          : [];

        resultItems.forEach((resultEntity, index) => {
          if (!resultEntity || resultEntity.error) return;
          const batchItem = batchItems[index];
          if (!batchItem) return;

          rebindSyncedNodesEntity({
            rawEntityId: batchItem._rawEntityId,
            normalizedName: batchItem._normalizedName,
            entityId: resultEntity.id,
            entityName: resultEntity.nome || batchItem.data.nome,
          });
        });
      } catch (syncErr) {
        console.warn("[BPMN Sync] Falha no batch de entidades:", syncErr);
      }

      return syncedNodes;
    },
    [actorAccountName, entidades, name],
  );

  const handleSaveBpmn = React.useCallback(async () => {
    if (isReadOnlyMode) {
      setNoticeModal({
        open: true,
        title: "Sem permissão",
        message:
          "Seu nível de acesso permite apenas visualização. Edição de BPMN está bloqueada.",
      });
      return;
    }
    setIsSavingBpmn(true);
    let saveSucceeded = false;

    try {
      const resolvedNodes = nodes.map((node) => {
        const resolvedEntityId = resolveEntityIdFromNode(node);
        const resolvedEntity =
          resolvedEntityId !== null && resolvedEntityId !== undefined
            ? entidadesById.get(String(resolvedEntityId)) || null
            : null;
        return {
          ...node,
          nodeType:
            node.nodeType === "task"
              ? "task"
              : node.nodeType === "condicional"
                ? "condicional"
                : "entidade",
          entidadeId:
            resolvedEntityId !== null && resolvedEntityId !== undefined
              ? resolvedEntityId
              : null,
          entidadeNome: resolvedEntity
            ? getEntidadeNome(resolvedEntity)
            : String(node.entidadeNome || node.label || "").trim(),
        };
      });

      const resolvedNodesWithDrafts = resolvedNodes.map((node) => {
        if (node?.nodeType === "condicional" || node?.nodeType === "task") {
          return node;
        }

        const draftByNode = entityDraftsByNodeId[node.id] || null;
        const isCurrentNode = String(node.id) === String(selectedNodeId || "");

        const currentNodeDraft = isCurrentNode
          ? {
              newEntityForm,
              newEntityFields,
              selectedDataFieldIds,
            }
          : null;

        const effectiveDraft = currentNodeDraft || draftByNode;
        if (!effectiveDraft) return node;

        const fieldsFromDraft = Array.isArray(effectiveDraft.newEntityFields)
          ? effectiveDraft.newEntityFields
          : [];
        const selectedFieldIds = (
          Array.isArray(effectiveDraft.selectedDataFieldIds)
            ? effectiveDraft.selectedDataFieldIds
            : []
        )
          .map((value) => String(value || "").trim())
          .filter(Boolean);

        const shouldUseAllFields = selectedFieldIds.length === 0;
        const selectedFields = fieldsFromDraft
          .filter((field) => {
            if (shouldUseAllFields) return true;
            const fieldId = String(field?.id || "").trim();
            return fieldId && selectedFieldIds.includes(fieldId);
          })
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
          .filter((field) => field.id || field.nome);

        const draftName = String(
          effectiveDraft?.newEntityForm?.nome || "",
        ).trim();
        const draftDescricao = String(
          effectiveDraft?.newEntityForm?.descricao || "",
        ).trim();
        const draftAtributoChave = String(
          effectiveDraft?.newEntityForm?.atributoChave || "",
        ).trim();

        return {
          ...node,
          entidadeNome:
            draftName || String(node?.entidadeNome || node?.label || "").trim(),
          label: draftName || String(node?.label || "").trim(),
          descricao: draftDescricao || String(node?.descricao || "").trim(),
          info: draftAtributoChave || String(node?.info || "").trim(),
          selectedEntityFieldIds: selectedFields
            .map((field) => String(field?.id || "").trim())
            .filter(Boolean),
          selectedEntityFieldNames: selectedFields
            .map((field) => String(field?.nome || "").trim())
            .filter(Boolean),
          selectedEntityFields: selectedFields,
        };
      });

      const hasConfiguredEntity = (node) => {
        if (!node) return false;
        if (node.nodeType === "condicional" || node.nodeType === "task") {
          return true;
        }

        const hasEntityId =
          node.entidadeId !== null && node.entidadeId !== undefined;
        if (hasEntityId) return true;

        const hasEntityName = Boolean(
          String(node.entidadeNome || node.label || "").trim(),
        );

        return hasEntityName;
      };

      const nodeWithoutEntity = resolvedNodesWithDrafts.find(
        (node) =>
          node.active !== false &&
          node.nodeType !== "condicional" &&
          node.nodeType !== "task" &&
          !hasConfiguredEntity(node),
      );

      if (nodeWithoutEntity) {
        const nodeDisplayName =
          String(
            nodeWithoutEntity.entidadeNome ||
              nodeWithoutEntity.label ||
              nodeWithoutEntity.descricao ||
              "",
          ).trim() || `ID ${String(nodeWithoutEntity.id || "").trim()}`;

        setInvalidEntityNodeId(nodeWithoutEntity.id);
        setSelectedNodeId(nodeWithoutEntity.id);
        setIsSidebarHidden(false);
        setNoticeModal({
          open: true,
          title: "Entidade obrigatória",
          message: `O bloco "${nodeDisplayName}" está ativo e ainda não possui entidade vinculada/configurada.`,
        });
        return;
      }
      const syncedResolvedNodes = await syncBpmnNodesToEntidadesCatalog(
        resolvedNodesWithDrafts,
      );
      const finalResolvedNodes =
        Array.isArray(syncedResolvedNodes) &&
        syncedResolvedNodes.length === resolvedNodesWithDrafts.length
          ? syncedResolvedNodes
          : resolvedNodesWithDrafts;

      const hasEntityIdUpgrade = finalResolvedNodes.some(
        (node, index) =>
          String(node.entidadeId ?? "") !==
          String(nodes[index]?.entidadeId ?? ""),
      );

      if (hasEntityIdUpgrade) {
        setNodes(finalResolvedNodes);
      }

      const persistedNodes = finalResolvedNodes.map(sanitizeNodeForPersistence);
      const persistedConnections = connections.map(
        sanitizeConnectionForPersistence,
      );

      setInvalidEntityNodeId("");

      const explicitPrimaryNodeWithEntity = finalResolvedNodes.find(
        (node) =>
          node.active !== false &&
          node.nodeType !== "condicional" &&
          node.nodeType !== "task" &&
          node.isPrimaryEntity === true &&
          node.entidadeId !== null &&
          node.entidadeId !== undefined,
      );

      const firstActiveNodeWithEntity = finalResolvedNodes.find(
        (node) =>
          node.active !== false &&
          node.nodeType !== "condicional" &&
          node.nodeType !== "task" &&
          node.entidadeId !== null &&
          node.entidadeId !== undefined,
      );

      const primaryEntityNode =
        explicitPrimaryNodeWithEntity || firstActiveNodeWithEntity;

      const primaryEntity = primaryEntityNode
        ? entidadesById.get(String(primaryEntityNode.entidadeId)) || null
        : null;
      const primaryEntityName = primaryEntity
        ? getEntidadeNome(primaryEntity)
        : "";
      const primaryEntityId = primaryEntity
        ? getEntidadeId(primaryEntity)
        : null;

      const currentBpmnSlug = slugifyBpmnName(name);
      let savedOpportunityBySlug = {};

      try {
        const rawMap = window.localStorage.getItem(
          BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
        );

        if (rawMap) {
          const parsedMap = JSON.parse(rawMap);
          if (parsedMap && typeof parsedMap === "object") {
            savedOpportunityBySlug = parsedMap;
          }
        }
      } catch (error) {}

      const originalBpmnSlug = String(bpmnSlug || "").trim();
      let resolvedOpportunityId =
        Number(
          savedOpportunityBySlug[currentBpmnSlug] ||
            (originalBpmnSlug ? savedOpportunityBySlug[originalBpmnSlug] : 0) ||
            0,
        ) || null;

      const token = getAuthToken();
      const bpmnStatePutPayload = BPMN_EDITOR_STATE_PUT(
        {
          name,
          nodes: persistedNodes,
          connections: persistedConnections,
        },
        token,
      );

      const searchName = name || DEFAULT_BPMN_NAME;

      const [opportunitiesPage, bpmnStateResponse] = await Promise.all([
        fetchOpportunitiesPage({
          page: 1,
          limit: 50,
          token,
          search: searchName,
        }),
        fetchWithTimeout(bpmnStatePutPayload.url, bpmnStatePutPayload.options),
      ]);

      if (!bpmnStateResponse.ok) {
        let detail = "";
        try {
          const errorPayload = await bpmnStateResponse.json();
          detail = String(errorPayload?.detail || "").trim();
        } catch (error) {
          // no-op
        }

        throw new Error(detail || "Falha ao salvar BPMN");
      }

      const allOpportunities = Array.isArray(opportunitiesPage?.data)
        ? opportunitiesPage.data
        : [];

      let resolvedExistingOpportunity = resolvedOpportunityId
        ? allOpportunities.find(
            (item) => Number(item?.id) === Number(resolvedOpportunityId),
          ) || null
        : null;

      const buildNodeLabel = (node) => {
        if (!node) return "Etapa";
        if (node?.nodeType === "task") {
          return String(node?.taskNome || "").trim() || "Atividade";
        }
        if (node?.nodeType === "condicional") {
          return String(node?.condicionalNome || "").trim() || "Condicional";
        }
        return String(node?.entidadeNome || "").trim() || "Entidade";
      };

      const getNodeMapByType = (nodes = [], nodeType = "entidade") => {
        const map = new Map();

        (Array.isArray(nodes) ? nodes : []).forEach((node) => {
          if (node?.active === false) return;

          const isEntity =
            nodeType === "entidade" &&
            node?.nodeType !== "task" &&
            node?.nodeType !== "condicional";
          const isTask = nodeType === "task" && node?.nodeType === "task";
          const isConditional =
            nodeType === "condicional" && node?.nodeType === "condicional";

          if (!isEntity && !isTask && !isConditional) return;

          const id = String(node?.id || "").trim();
          if (!id) return;

          const label = buildNodeLabel(node);
          const fingerprint =
            nodeType === "task"
              ? `${String(node?.taskNome || "").trim()}|${String(node?.taskDescricao || "").trim()}`
              : nodeType === "condicional"
                ? `${String(node?.condicionalNome || "").trim()}|${String(node?.condicionalDescricao || "").trim()}`
                : `${String(node?.entidadeId ?? "")}|${String(node?.entidadeNome || "").trim()}`;

          map.set(id, {
            id,
            label,
            fingerprint,
          });
        });

        return map;
      };

      const computeNodeDiffNames = (previousMap, nextMap) => {
        const created = [];
        const removed = [];
        const modified = [];

        nextMap.forEach((nextItem, id) => {
          const previousItem = previousMap.get(id);
          if (!previousItem) {
            created.push(nextItem.label);
            return;
          }

          if (previousItem.fingerprint !== nextItem.fingerprint) {
            modified.push(nextItem.label);
          }
        });

        previousMap.forEach((previousItem, id) => {
          if (!nextMap.has(id)) {
            removed.push(previousItem.label);
          }
        });

        const sorter = (a, b) => String(a).localeCompare(String(b));
        return {
          created: [...new Set(created)].sort(sorter),
          modified: [...new Set(modified)].sort(sorter),
          removed: [...new Set(removed)].sort(sorter),
        };
      };

      const previousNodes = Array.isArray(
        resolvedExistingOpportunity?.bpmn?.nodes,
      )
        ? resolvedExistingOpportunity.bpmn.nodes
        : [];
      const previousConnections = Array.isArray(
        resolvedExistingOpportunity?.bpmn?.connections,
      )
        ? resolvedExistingOpportunity.bpmn.connections
        : [];

      const previousEntityMap = getNodeMapByType(previousNodes, "entidade");
      const nextEntityMap = getNodeMapByType(persistedNodes, "entidade");
      const entityDiff = computeNodeDiffNames(previousEntityMap, nextEntityMap);

      const existingTimelineItemsRaw = Array.isArray(
        resolvedExistingOpportunity?.timelineItems,
      )
        ? resolvedExistingOpportunity.timelineItems
        : [];

      const existingTimelineItems = existingTimelineItemsRaw;

      const pendingDraftTimelineItems = Array.isArray(
        pendingTimelineItemsRef.current,
      )
        ? pendingTimelineItemsRef.current
        : [];

      const mergeUniqueTimelineItems = (...groups) => {
        const seen = new Set();
        const merged = [];

        groups.flat().forEach((item, index) => {
          if (!item || typeof item !== "object") return;

          const autoKey = String(item?.autoKey || "").trim();
          const source = String(item?.source || "").trim();
          const idValue = String(item?.id || "").trim();
          const title = String(item?.title || "").trim();
          const time = String(item?.time || "").trim();

          const uniqueKey = autoKey
            ? `auto:${autoKey}`
            : idValue
              ? `id:${idValue}`
              : `fallback:${source}:${title}:${time}:${index}`;

          if (seen.has(uniqueKey)) return;
          seen.add(uniqueKey);
          merged.push(item);
        });

        return merged;
      };

      const nowTime = new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const nowTimestamp = new Date().toISOString();

      const timelineGeneratedItems = [];
      const noteIdBase = Date.now() + Math.floor(Math.random() * 1000);
      let noteIdOffset = 0;

      const getTypeLabel = (node) => {
        if (node?.nodeType === "task") return "Atividade";
        if (node?.nodeType === "condicional") return "Condicional";
        return "Entidade";
      };

      const getWrittenText = (node) => {
        if (node?.nodeType === "task") {
          return String(node?.taskDescricao || node?.taskNome || "").trim();
        }
        if (node?.nodeType === "condicional") {
          return String(
            node?.condicionalDescricao || node?.condicionalNome || "",
          ).trim();
        }
        return String(node?.entidadeNome || "").trim();
      };

      const orderedActiveNodes = [...persistedNodes]
        .filter((node) => node?.active !== false)
        .sort((nodeA, nodeB) => {
          const xDiff = (Number(nodeA?.x) || 0) - (Number(nodeB?.x) || 0);
          if (xDiff !== 0) return xDiff;

          const yDiff = (Number(nodeA?.y) || 0) - (Number(nodeB?.y) || 0);
          if (yDiff !== 0) return yDiff;

          return String(nodeA?.id || "").localeCompare(String(nodeB?.id || ""));
        });

      const orderedActiveNodeEntries = orderedActiveNodes.map((node, index) => {
        const typeLabel = getTypeLabel(node);
        const label = buildNodeLabel(node);
        const writtenText = getWrittenText(node) || "-";
        return {
          id: String(node?.id || ""),
          order: index + 1,
          label,
          typeLabel,
          writtenText,
          fingerprint: `${typeLabel}|${label}|${writtenText}`,
        };
      });

      const previousActiveNodeEntries = [...previousNodes]
        .filter((node) => node?.active !== false)
        .sort((nodeA, nodeB) => {
          const xDiff = (Number(nodeA?.x) || 0) - (Number(nodeB?.x) || 0);
          if (xDiff !== 0) return xDiff;

          const yDiff = (Number(nodeA?.y) || 0) - (Number(nodeB?.y) || 0);
          if (yDiff !== 0) return yDiff;

          return String(nodeA?.id || "").localeCompare(String(nodeB?.id || ""));
        })
        .map((node, index) => {
          const typeLabel = getTypeLabel(node);
          const label = buildNodeLabel(node);
          const writtenText = getWrittenText(node) || "-";
          return {
            id: String(node?.id || ""),
            order: index + 1,
            label,
            typeLabel,
            writtenText,
            fingerprint: `${typeLabel}|${label}|${writtenText}`,
          };
        });

      const previousEntriesById = new Map(
        previousActiveNodeEntries.map((entry) => [entry.id, entry]),
      );
      const nextEntriesById = new Map(
        orderedActiveNodeEntries.map((entry) => [entry.id, entry]),
      );

      const createdEntries = orderedActiveNodeEntries.filter(
        (entry) => !previousEntriesById.has(entry.id),
      );

      const modifiedEntries = orderedActiveNodeEntries.filter((entry) => {
        const previousEntry = previousEntriesById.get(entry.id);
        if (!previousEntry) return false;
        return previousEntry.fingerprint !== entry.fingerprint;
      });

      const removedEntries = previousActiveNodeEntries.filter(
        (entry) => !nextEntriesById.has(entry.id),
      );

      timelineGeneratedItems.push({
        id: noteIdBase + noteIdOffset,
        title: resolvedOpportunityId ? "BPMN atualizado" : "BPMN criado",
        description: `Nós ${previousNodes.length}→${persistedNodes.length} | Conexões ${previousConnections.length}→${persistedConnections.length}`,
        time: nowTime,
        timestamp: nowTimestamp,
        actor: actorAccountName,
        actorId: actorAccountId,
        autoGenerated: true,
        source: "bpmn-save",
        actionType: resolvedOpportunityId ? "update" : "create",
        elementType: "bpmn",
        itemName: name || DEFAULT_BPMN_NAME,
        before: `Nós ${previousNodes.length} | Conexões ${previousConnections.length}`,
        after: `Nós ${persistedNodes.length} | Conexões ${persistedConnections.length}`,
      });
      noteIdOffset += 1;

      const formatEntrySummary = (entry) => {
        if (!entry) return "—";
        return `${entry.label} - ${entry.typeLabel} (ordem ${entry.order})`;
      };

      const pushEntityEntryNote = ({
        title,
        beforeEntry = null,
        afterEntry = null,
        actionType = "update",
      }) => {
        timelineGeneratedItems.push({
          id: noteIdBase + noteIdOffset,
          title,
          description: `Antes: ${formatEntrySummary(beforeEntry)} → Agora: ${formatEntrySummary(afterEntry)}`,
          time: nowTime,
          timestamp: nowTimestamp,
          actor: actorAccountName,
          actorId: actorAccountId,
          autoGenerated: true,
          source: "bpmn-save",
          actionType,
          elementType: "elemento-bpmn",
          itemName:
            String(afterEntry?.label || beforeEntry?.label || "").trim() ||
            "Elemento BPMN",
          before: formatEntrySummary(beforeEntry),
          after: formatEntrySummary(afterEntry),
        });
        noteIdOffset += 1;
      };

      if (!resolvedOpportunityId) {
        orderedActiveNodeEntries.forEach((entry) => {
          pushEntityEntryNote({
            title: `${entry.label} foi adicionada`,
            beforeEntry: null,
            afterEntry: entry,
            actionType: "create",
          });
        });
      } else {
        createdEntries.forEach((entry) => {
          pushEntityEntryNote({
            title: `${entry.label} foi adicionada`,
            beforeEntry: null,
            afterEntry: entry,
            actionType: "create",
          });
        });

        modifiedEntries.forEach((entry) => {
          const previousEntry = previousEntriesById.get(entry.id) || null;
          pushEntityEntryNote({
            title: `${entry.label} foi atualizada`,
            beforeEntry: previousEntry,
            afterEntry: entry,
            actionType: "update",
          });
        });

        removedEntries.forEach((entry) => {
          pushEntityEntryNote({
            title: `${entry.label} foi removida`,
            beforeEntry: entry,
            afterEntry: null,
            actionType: "delete",
          });
        });
      }

      const normalizedCurrentName = normalizeBpmnName(
        name || DEFAULT_BPMN_NAME,
      );
      const duplicated = allOpportunities.find((item) => {
        const itemName = item?.name || item?.nome || "";
        const sameName = normalizeBpmnName(itemName) === normalizedCurrentName;
        if (!sameName) return false;

        if (!resolvedOpportunityId) return true;
        return Number(item?.id) !== Number(resolvedOpportunityId);
      });

      if (duplicated) {
        if (!resolvedOpportunityId && duplicated?.id) {
          resolvedOpportunityId = Number(duplicated.id);
          resolvedExistingOpportunity = duplicated;
        } else {
          setNoticeModal({
            open: true,
            title: "Nome duplicado",
            message: "Já existe um BPMN com esse nome na tabela.",
          });
          return;
        }
      }

      const opportunityPayload = {
        // Keep table metadata synchronized with the diagram structure.
        stages: orderedActiveNodeEntries.map((entry, index) => {
          const baseNode = orderedActiveNodes[index] || {};
          const infoText = String(baseNode?.info || "").trim();
          const participant = infoText.includes("Raia:")
            ? infoText.split("Raia:")[1].split("|")[0].trim()
            : "";
          const rawType = String(baseNode?.nodeType || "entidade")
            .trim()
            .toLowerCase();
          const stageType =
            rawType === "task"
              ? "task"
              : rawType === "condicional"
                ? "condicional"
                : "entidade";

          return {
            id: String(entry?.id || "").trim() || `stage-${index + 1}`,
            index,
            nome: String(entry?.label || "").trim() || `Etapa ${index + 1}`,
            tipo: stageType,
            participante: participant,
          };
        }),
        nome: name || DEFAULT_BPMN_NAME,
        name: name || DEFAULT_BPMN_NAME,
        status: "Prospecção",
        stageIndex: 0,
        currentNodeId:
          String(selectedNodeId || "").trim() ||
          String(orderedActiveNodes[0]?.id || "").trim() ||
          null,
        activeNodeId:
          String(selectedNodeId || "").trim() ||
          String(orderedActiveNodes[0]?.id || "").trim() ||
          null,
        bpmnNodeId:
          String(selectedNodeId || "").trim() ||
          String(orderedActiveNodes[0]?.id || "").trim() ||
          null,
        bpmnCurrentNodeId:
          String(selectedNodeId || "").trim() ||
          String(orderedActiveNodes[0]?.id || "").trim() ||
          null,
        sourceNodeId: String(orderedActiveNodes[0]?.id || "").trim() || null,
        timelineItems: mergeUniqueTimelineItems(
          timelineGeneratedItems,
          pendingDraftTimelineItems,
          existingTimelineItems,
        ),
        ...(primaryEntityName
          ? {
              entidade: primaryEntityName,
              entidadeNome: primaryEntityName,
              entity: primaryEntityName,
            }
          : {}),
        source: "bpmn-create",
        bpmn: {
          nodes: persistedNodes,
          connections: persistedConnections,
          stages: orderedActiveNodeEntries.map((entry, index) => {
            const baseNode = orderedActiveNodes[index] || {};
            const infoText = String(baseNode?.info || "").trim();
            const participant = infoText.includes("Raia:")
              ? infoText.split("Raia:")[1].split("|")[0].trim()
              : "";
            const rawType = String(baseNode?.nodeType || "entidade")
              .trim()
              .toLowerCase();
            const stageType =
              rawType === "task"
                ? "task"
                : rawType === "condicional"
                  ? "condicional"
                  : "entidade";

            return {
              id: String(entry?.id || "").trim() || `stage-${index + 1}`,
              index,
              nome: String(entry?.label || "").trim() || `Etapa ${index + 1}`,
              tipo: stageType,
              participante: participant,
            };
          }),
          ...(primaryEntityName
            ? {
                primaryEntityName,
                primaryEntityId,
              }
            : {}),
        },
        created_at: new Date().toISOString(),
        createdDate: new Date().toISOString(),
      };

      if (resolvedOpportunityId) {
        await updateOpportunityById({
          opportunityId: resolvedOpportunityId,
          payload: {
            ...(resolvedExistingOpportunity || {}),
            ...opportunityPayload,
            id: resolvedOpportunityId,
          },
          token: getAuthToken(),
        });

        savedOpportunityBySlug = {
          ...savedOpportunityBySlug,
          [currentBpmnSlug]: resolvedOpportunityId,
          ...(originalBpmnSlug
            ? { [originalBpmnSlug]: resolvedOpportunityId }
            : {}),
        };

        window.localStorage.setItem(
          BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
          JSON.stringify(savedOpportunityBySlug),
        );
      } else {
        const createdOpportunity = await createOpportunity({
          payload: opportunityPayload,
          token: getAuthToken(),
        });

        if (createdOpportunity?.id) {
          savedOpportunityBySlug = {
            ...savedOpportunityBySlug,
            [currentBpmnSlug]: createdOpportunity.id,
          };

          window.localStorage.setItem(
            BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
            JSON.stringify(savedOpportunityBySlug),
          );
        }
      }

      saveSucceeded = true;

      pendingTimelineItemsRef.current = [];
      try {
        window.localStorage.removeItem(BPMN_EDITOR_LOCAL_STORAGE_KEY);
      } catch (error) {}
    } catch (error) {
      console.error("[BPMN Save Error]", error);
      setNoticeModal({
        open: true,
        title: "Falha ao salvar",
        message:
          String(error?.message || "").trim() ||
          "Não foi possível salvar o BPMN agora.",
      });
    } finally {
      setIsSavingBpmn(false);

      if (saveSucceeded) {
        skipNavigationPromptRef.current = true;
        navigate("/gerar-bpmn");
      }
    }
  }, [
    bpmnSlug,
    connections,
    actorAccountId,
    actorAccountName,
    entityDraftsByNodeId,
    entidadesById,
    isReadOnlyMode,
    name,
    navigate,
    newEntityFields,
    newEntityForm,
    nodes,
    resolveEntityIdFromNode,
    selectedDataFieldIds,
    selectedNodeId,
    syncBpmnNodesToEntidadesCatalog,
  ]);

  React.useEffect(() => {
    let isMounted = true;
    const isCreateMode = !bpmnSlug;

    const loadSavedBpmn = async () => {
      let loadedFromLocalStorage = false;

      if (isCreateMode && pendingAiCanvasDraft && !aiCanvasAppliedRef.current) {
        if (typeof pendingAiCanvasDraft.name === "string") {
          const nextName = String(pendingAiCanvasDraft.name || "").trim();
          if (nextName) {
            setName(nextName);
          }
        }

        if (Array.isArray(pendingAiCanvasDraft.nodes)) {
          // Run bpmn-auto-layout to compute optimal positions
          let _finalNodes = pendingAiCanvasDraft.nodes.map(normalizeEditorNode);
          let _finalConns = Array.isArray(pendingAiCanvasDraft.connections)
            ? pendingAiCanvasDraft.connections.map(normalizeEditorConnection)
            : [];

          try {
            const _layoutResult = await applyBpmnAutoLayout(
              _finalNodes,
              _finalConns,
            );
            _finalNodes = _layoutResult.nodes;
            _finalConns = _layoutResult.connections;
          } catch (_layoutErr) {
            console.warn(
              "[GerarBPMN] auto-layout falhou, usando posições do backend:",
              _layoutErr,
            );
          }

          setNodes(_finalNodes);
          setConnections(_finalConns);

          const firstNodeId = String(_finalNodes[0]?.id || "").trim();
          if (firstNodeId) {
            setSelectedNodeId(firstNodeId);
          }

          // Zoom-to-fit: calcula zoom para caber todos os nós na janela visível
          const _aiNodes = _finalNodes;
          if (_aiNodes.length > 0) {
            requestAnimationFrame(() => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              const _CW = 220,
                _CH = 110;
              const _xs = _aiNodes.map((n) => Number(n.x) || 0);
              const _ys = _aiNodes.map((n) => Number(n.y) || 0);
              const _minX = Math.min(..._xs);
              const _minY = Math.min(..._ys);
              const _maxX = Math.max(..._xs) + _CW;
              const _maxY = Math.max(..._ys) + _CH;
              const _cw = Math.max(320, _maxX - _minX + 200);
              const _ch = Math.max(180, _maxY - _minY + 160);
              const _aw = Math.max(260, viewport.clientWidth - 60);
              const _ah = Math.max(220, viewport.clientHeight - 60);
              const _fz = Number(
                Math.max(
                  0.45,
                  Math.min(1, Math.min(_aw / _cw, _ah / _ch)),
                ).toFixed(2),
              );
              setZoom(_fz);
              setZoomButtonDirection(_fz <= 0.45 ? 1 : -1);
              requestAnimationFrame(() => {
                const _cx = _minX + (_maxX - _minX) / 2;
                const _cy = _minY + (_maxY - _minY) / 2;
                viewport.scrollLeft = Math.max(
                  0,
                  _cx * _fz - viewport.clientWidth / 2,
                );
                viewport.scrollTop = Math.max(
                  0,
                  _cy * _fz - viewport.clientHeight / 2,
                );
              });
            });
          }
        } else if (Array.isArray(pendingAiCanvasDraft.connections)) {
          setConnections(
            pendingAiCanvasDraft.connections.map(normalizeEditorConnection),
          );
        }

        pendingTimelineItemsRef.current = [];
        aiCanvasAppliedRef.current = true;
        setPendingAiCanvasDraft(null);

        if (isMounted) {
          hasHydratedBpmnRef.current = true;
          setIsLoadingBpmn(false);
        }
        return;
      }

      if (isCreateMode) {
        try {
          const localDraftRaw = window.localStorage.getItem(
            BPMN_EDITOR_LOCAL_STORAGE_KEY,
          );

          if (localDraftRaw) {
            const localDraft = JSON.parse(localDraftRaw);

            // Se o rascunho tem nós e um nome que corresponde a um BPMN já salvo
            // (slug não-vazio), ignora — pertence a uma sessão de edição anterior.
            const draftSlug = slugifyBpmnName(localDraft?.name || "");
            if (
              draftSlug &&
              Array.isArray(localDraft?.nodes) &&
              localDraft.nodes.length > 0
            ) {
              throw new Error(
                "Rascunho de edição existente ignorado no modo criação",
              );
            }

            if (localDraft && typeof localDraft === "object") {
              if (typeof localDraft.name === "string") {
                setName(localDraft.name);
              }

              if (Array.isArray(localDraft.nodes)) {
                setNodes(localDraft.nodes.map(normalizeEditorNode));
              }

              if (Array.isArray(localDraft.connections)) {
                setConnections(
                  localDraft.connections.map(normalizeEditorConnection),
                );
              }

              pendingTimelineItemsRef.current = Array.isArray(
                localDraft.pendingTimelineItems,
              )
                ? localDraft.pendingTimelineItems
                : [];

              loadedFromLocalStorage = true;
            }
          }
        } catch {
          // no-op
        }

        if (isMounted) {
          hasHydratedBpmnRef.current = true;
          setIsLoadingBpmn(false);
        }
        return;
      }

      try {
        const localDraftRaw = window.localStorage.getItem(
          BPMN_EDITOR_LOCAL_STORAGE_KEY,
        );

        if (localDraftRaw) {
          const localDraft = JSON.parse(localDraftRaw);

          if (localDraft && typeof localDraft === "object") {
            const localDraftSlug = slugifyBpmnName(localDraft.name || "");
            if (localDraftSlug !== bpmnSlug) {
              throw new Error("Rascunho local não corresponde ao BPM atual");
            }

            if (typeof localDraft.name === "string") {
              setName(localDraft.name);
            }

            if (Array.isArray(localDraft.nodes)) {
              setNodes(localDraft.nodes.map(normalizeEditorNode));
            }

            if (Array.isArray(localDraft.connections)) {
              setConnections(
                localDraft.connections.map(normalizeEditorConnection),
              );
            }

            pendingTimelineItemsRef.current = Array.isArray(
              localDraft.pendingTimelineItems,
            )
              ? localDraft.pendingTimelineItems
              : [];

            loadedFromLocalStorage = true;
          }
        }
      } catch (error) {}

      if (loadedFromLocalStorage) {
        if (isMounted) {
          hasHydratedBpmnRef.current = true;
          setIsLoadingBpmn(false);
        }
        return;
      }

      try {
        const token = getAuthToken();
        const { url, options } = BPMN_EDITOR_STATE_GET(token);
        const response = await fetch(url, options);

        if (!response.ok) {
          throw new Error("Falha ao carregar BPMN");
        }

        const data = await response.json();
        if (!isMounted || !data || typeof data !== "object") return;

        if (typeof data.name === "string") {
          setName(data.name);
        }

        if (Array.isArray(data.nodes)) {
          setNodes(data.nodes.map(normalizeEditorNode));
        }

        if (Array.isArray(data.connections)) {
          setConnections(data.connections.map(normalizeEditorConnection));
        }
      } catch (error) {
      } finally {
        if (isMounted) {
          hasHydratedBpmnRef.current = true;
          setIsLoadingBpmn(false);
        }
      }
    };

    loadSavedBpmn();

    return () => {
      isMounted = false;
    };
  }, [bpmnSlug, pendingAiCanvasDraft]);

  React.useEffect(() => {
    currentDraftRef.current = {
      name,
      nodes,
      connections,
    };
  }, [connections, name, nodes]);

  // Auto-persist draft to localStorage on every state change (debounced)
  // and on component unmount (SPA navigation).
  React.useEffect(() => {
    if (!hasHydratedBpmnRef.current) return undefined;

    const timerId = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          BPMN_EDITOR_LOCAL_STORAGE_KEY,
          JSON.stringify({
            ...currentDraftRef.current,
            pendingTimelineItems: pendingTimelineItemsRef.current,
            updated_at: new Date().toISOString(),
          }),
        );
      } catch {
        // quota error – ignore
      }
    }, 400);

    return () => {
      window.clearTimeout(timerId);

      // Persist immediately on unmount so SPA navigation never loses data.
      // Skip if save already succeeded (navigating away intentionally).
      if (hasHydratedBpmnRef.current && !skipNavigationPromptRef.current) {
        try {
          window.localStorage.setItem(
            BPMN_EDITOR_LOCAL_STORAGE_KEY,
            JSON.stringify({
              ...currentDraftRef.current,
              pendingTimelineItems: pendingTimelineItemsRef.current,
              updated_at: new Date().toISOString(),
            }),
          );
        } catch {
          // quota error – ignore
        }
      }
    };
  }, [connections, name, nodes]);

  const handleSaveEditorNameDraft = React.useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      const normalizedName = String(name || "").trim();
      if (normalizedName) {
        window.sessionStorage.setItem(
          BPMN_EDITOR_NAME_DRAFT_KEY,
          normalizedName,
        );
        window.localStorage.removeItem(BPMN_EDITOR_NAME_DRAFT_KEY);
        setEditorNameSaveFeedback("Nome do editor salvo nesta sessao.");
        return;
      }

      window.sessionStorage.removeItem(BPMN_EDITOR_NAME_DRAFT_KEY);
      window.localStorage.removeItem(BPMN_EDITOR_NAME_DRAFT_KEY);
      setEditorNameSaveFeedback(
        "Nome do editor removido do rascunho desta sessao.",
      );
    } catch {
      setEditorNameSaveFeedback(
        "Nao foi possivel salvar o nome do editor agora.",
      );
    }
  }, [BPMN_EDITOR_NAME_DRAFT_KEY, name]);

  React.useEffect(() => {
    if (!editorNameSaveFeedback) return undefined;

    const timeoutId = window.setTimeout(() => {
      setEditorNameSaveFeedback("");
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [editorNameSaveFeedback]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    currentPageUrlRef.current = window.location.href;

    const persistSnapshot = () => {
      if (!hasHydratedBpmnRef.current) return;

      try {
        const snapshot = {
          ...currentDraftRef.current,
          pendingTimelineItems: pendingTimelineItemsRef.current,
          updated_at: new Date().toISOString(),
        };

        window.localStorage.setItem(
          BPMN_EDITOR_LOCAL_STORAGE_KEY,
          JSON.stringify(snapshot),
        );
      } catch {
        // no-op
      }
    };

    const handleBeforeUnload = (event) => {
      isPageUnloadingRef.current = true;
      persistSnapshot();

      if (skipNavigationPromptRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClickCapture = (event) => {
      if (skipNavigationPromptRef.current) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#")) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      const isSameRoute =
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search &&
        nextUrl.hash === currentUrl.hash;

      if (isSameRoute) return;

      event.preventDefault();
      event.stopPropagation();
      const targetHref = anchor.href;
      openLeavePageModal(() => {
        if (nextUrl.origin === window.location.origin) {
          navigate(nextUrl.pathname + nextUrl.search + nextUrl.hash);
        } else {
          window.location.href = targetHref;
        }
      });
    };

    const originalPushState = window.history.pushState;
    window.history.pushState = function patchedPushState(...args) {
      if (!skipNavigationPromptRef.current) {
        const target = args?.[2];
        if (target) {
          const nextUrl = new URL(String(target), window.location.href);
          const currentUrl = new URL(window.location.href);
          const isSameRoute =
            nextUrl.pathname === currentUrl.pathname &&
            nextUrl.search === currentUrl.search &&
            nextUrl.hash === currentUrl.hash;

          if (!isSameRoute) {
            openLeavePageModal(() => {
              if (nextUrl.origin === window.location.origin) {
                navigate(nextUrl.pathname + nextUrl.search + nextUrl.hash);
              } else {
                originalPushState.apply(window.history, args);
                currentPageUrlRef.current = window.location.href;
              }
            });
            return;
          }
        }
      }

      const result = originalPushState.apply(this, args);
      currentPageUrlRef.current = window.location.href;
      return result;
    };

    const handlePopState = () => {
      if (skipNavigationPromptRef.current) {
        currentPageUrlRef.current = window.location.href;
        return;
      }

      const targetUrl = window.location.href;
      window.history.pushState(null, "", currentPageUrlRef.current);

      openLeavePageModal(() => {
        const parsed = new URL(targetUrl);
        if (parsed.origin === window.location.origin) {
          navigate(parsed.pathname + parsed.search + parsed.hash);
        } else {
          window.location.href = targetUrl;
        }
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClickCapture, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClickCapture, true);
      window.removeEventListener("popstate", handlePopState);
      window.history.pushState = originalPushState;
    };
  }, [openLeavePageModal, navigate]);

  React.useEffect(() => {
    return () => {
      // Keep name draft on refresh/tab close, but reset when leaving this route.
      if (isPageUnloadingRef.current) return;
      try {
        window.sessionStorage.removeItem(BPMN_EDITOR_NAME_DRAFT_KEY);
        window.localStorage.removeItem(BPMN_EDITOR_NAME_DRAFT_KEY);
      } catch {
        // no-op
      }
    };
  }, [BPMN_EDITOR_NAME_DRAFT_KEY]);

  React.useEffect(() => {
    if (hasAutoFocusedRef.current) return;
    if (nodes.length === 0) return;
    if (!viewportRef.current) return;

    hasAutoFocusedRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitNodesToViewport();
      });
    });
  }, [fitNodesToViewport, nodes.length]);

  const applyZoomStep = React.useCallback(
    (direction) => {
      const rawNextZoom = Number((zoom + direction * ZOOM_STEP).toFixed(2));
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawNextZoom));

      setZoom(nextZoom);

      if (nextZoom <= MIN_ZOOM) {
        setZoomButtonDirection(1);
        return;
      }

      if (nextZoom >= MAX_ZOOM) {
        setZoomButtonDirection(-1);
      }
    },
    [MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, zoom],
  );

  const handleViewportWheel = React.useCallback(
    (event) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      event.preventDefault();

      if (event.deltaY > 0) {
        applyZoomStep(-1);
        return;
      }

      if (event.deltaY < 0) {
        applyZoomStep(1);
      }
    },
    [applyZoomStep],
  );

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    viewport.addEventListener("wheel", handleViewportWheel, {
      passive: false,
    });

    return () => {
      viewport.removeEventListener("wheel", handleViewportWheel);
    };
  }, [handleViewportWheel]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isTouchDevice) return undefined;

    const getTouchDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        pinchRef.current.startDist = getTouchDist(event.touches);
        pinchRef.current.startZoom = zoom;
      }
    };

    const onTouchMove = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const dist = getTouchDist(event.touches);
        const scale = dist / pinchRef.current.startDist;
        const newZoom = Math.min(
          1,
          Math.max(0.85, pinchRef.current.startZoom * scale),
        );
        setZoom(Math.round(newZoom * 100) / 100);
      }
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: false });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
    };
  }, [isTouchDevice, zoom]);

  const startPan = (event) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      pointerId: event.pointerId ?? null,
    };
    setIsPanning(true);
  };

  const handleViewportPointerDown = (event) => {
    const clickedNode = event.target?.closest?.('[data-bpmn-node="true"]');
    const clickedConnector = event.target?.closest?.("[data-connector-handle]");
    const isTouchPointer =
      event.pointerType === "touch" || event.pointerType === "pen";

    const shouldPanWithMouse =
      event.button === 1 ||
      event.button === 2 ||
      (event.button === 0 && (isSpacePressed || !clickedNode));

    // On touch devices we rely on native scroll/pan from the viewport.
    const shouldPan = !isTouchPointer && shouldPanWithMouse;
    if (!shouldPan) return;

    startPan(event);
    event.preventDefault();
  };

  React.useEffect(() => {
    if (!isPanning) return;

    const handlePointerMove = (event) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (
        panRef.current.pointerId !== null &&
        event.pointerId !== undefined &&
        event.pointerId !== panRef.current.pointerId
      ) {
        return;
      }

      const dx = event.clientX - panRef.current.startX;
      const dy = event.clientY - panRef.current.startY;
      viewport.scrollLeft = panRef.current.startScrollLeft - dx;
      viewport.scrollTop = panRef.current.startScrollTop - dy;

      if (event.pointerType === "touch" || event.pointerType === "pen") {
        event.preventDefault();
      }
    };

    const stopPan = (event) => {
      if (
        panRef.current.pointerId !== null &&
        event?.pointerId !== undefined &&
        event.pointerId !== panRef.current.pointerId
      ) {
        return;
      }

      panRef.current.pointerId = null;
      setIsPanning(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPan);
    window.addEventListener("pointercancel", stopPan);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPan);
      window.removeEventListener("pointercancel", stopPan);
    };
  }, [isPanning]);

  const handleViewportKeyDown = React.useCallback(
    (event) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const key = event.key.toLowerCase();
      const panStep = event.shiftKey ? 160 : 80;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (isReadOnlyMode) return;
        if (selectedConnectionId || selectedNodeId) {
          event.preventDefault();
          requestDeleteSelection();
        }
        return;
      }

      if (event.key === "ArrowLeft" || key === "a") {
        event.preventDefault();
        viewport.scrollLeft -= panStep;
        return;
      }

      if (event.key === "ArrowRight" || key === "d") {
        event.preventDefault();
        viewport.scrollLeft += panStep;
        return;
      }

      if (event.key === "ArrowUp" || key === "w") {
        event.preventDefault();
        viewport.scrollTop -= panStep;
        return;
      }

      if (event.key === "ArrowDown" || key === "s") {
        event.preventDefault();
        viewport.scrollTop += panStep;
      }
    },
    [
      isReadOnlyMode,
      requestDeleteSelection,
      selectedConnectionId,
      selectedNodeId,
    ],
  );

  React.useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      const viewport = viewportRef.current;
      const viewportIsActive =
        isViewportHovered || document.activeElement === viewport;
      if (!viewportIsActive) return;

      const targetTag = event.target?.tagName?.toLowerCase();
      const isTypingField =
        targetTag === "input" ||
        targetTag === "textarea" ||
        targetTag === "select" ||
        event.target?.isContentEditable;
      if (isTypingField) return;

      handleViewportKeyDown(event);
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleViewportKeyDown, isViewportHovered]);

  const handleToggleCanvasFullscreen = React.useCallback(async () => {
    const workspaceElement = workspaceFullscreenRef.current;
    if (!workspaceElement) return;

    if (document.fullscreenElement === workspaceElement) {
      await document.exitFullscreen();
      return;
    }

    await workspaceElement.requestFullscreen();
  }, []);

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsCanvasFullscreen(
        document.fullscreenElement === workspaceFullscreenRef.current,
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const closeTutorial = React.useCallback(() => {
    setIsTutorialOpen(false);
    setIsTutorialLayoutReady(false);
    setTutorialSpotlight(null);
  }, []);

  const handleOpenTutorial = React.useCallback(() => {
    setTutorialStepIndex(0);
    setIsTutorialLayoutReady(false);
    setIsTutorialOpen(true);
  }, []);

  React.useEffect(() => {
    setTutorialStepIndex((previous) =>
      Math.min(previous, Math.max(0, activeTutorialSteps.length - 1)),
    );
  }, [activeTutorialSteps.length]);

  const handleNextTutorialStep = React.useCallback(() => {
    setTutorialStepIndex((previous) =>
      Math.min(previous + 1, activeTutorialSteps.length - 1),
    );
  }, [activeTutorialSteps.length]);

  const handlePreviousTutorialStep = React.useCallback(() => {
    setTutorialStepIndex((previous) => Math.max(previous - 1, 0));
  }, []);

  const updateTutorialLayout = React.useCallback(() => {
    if (!isTutorialOpen) return;

    const currentStep = activeTutorialSteps[tutorialStepIndex];
    if (!currentStep?.selector) {
      setTutorialSpotlight(null);
      setTutorialPopoverStyle({
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      });
      setIsTutorialLayoutReady(true);
      return;
    }

    const target = document.querySelector(currentStep.selector);
    if (!target) {
      setTutorialSpotlight(null);
      setTutorialPopoverStyle({
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      });
      setIsTutorialLayoutReady(true);
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 8;
    const spotlightRect = {
      top: Math.max(6, rect.top - padding),
      left: Math.max(6, rect.left - padding),
      width: Math.max(40, rect.width + padding * 2),
      height: Math.max(34, rect.height + padding * 2),
    };

    setTutorialSpotlight(spotlightRect);

    const viewportWidth = window.innerWidth || 1200;
    const viewportHeight = window.innerHeight || 800;
    const cardWidth = Math.min(360, Math.max(240, viewportWidth - 24));
    const cardHeight = 260;
    const margin = 12;
    const gap = 14;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const overlapArea = (rectA, rectB) => {
      const overlapWidth =
        Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left);
      const overlapHeight =
        Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top);
      if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
      return overlapWidth * overlapHeight;
    };

    const buildCandidate = (placement) => {
      let rawLeft = margin;
      let rawTop = margin;

      if (placement === "left") {
        rawLeft = spotlightRect.left - cardWidth - gap;
        rawTop = spotlightRect.top + spotlightRect.height / 2 - cardHeight / 2;
      } else if (placement === "right") {
        rawLeft = spotlightRect.left + spotlightRect.width + gap;
        rawTop = spotlightRect.top + spotlightRect.height / 2 - cardHeight / 2;
      } else if (placement === "top") {
        rawLeft = spotlightRect.left + spotlightRect.width / 2 - cardWidth / 2;
        rawTop = spotlightRect.top - cardHeight - gap;
      } else {
        rawLeft = spotlightRect.left + spotlightRect.width / 2 - cardWidth / 2;
        rawTop = spotlightRect.top + spotlightRect.height + gap;
      }

      const left = clamp(rawLeft, margin, viewportWidth - cardWidth - margin);
      const top = clamp(rawTop, margin, viewportHeight - cardHeight - margin);
      const cardRect = {
        left,
        top,
        right: left + cardWidth,
        bottom: top + cardHeight,
      };

      return {
        left,
        top,
        overlap: overlapArea(cardRect, {
          left: spotlightRect.left,
          top: spotlightRect.top,
          right: spotlightRect.left + spotlightRect.width,
          bottom: spotlightRect.top + spotlightRect.height,
        }),
      };
    };

    const preferredPlacement = String(currentStep?.popoverPlacement || "");
    const placementOrder = [
      preferredPlacement || "bottom",
      "right",
      "left",
      "top",
      "bottom",
    ].filter(
      (placement, index, list) =>
        placement && list.indexOf(placement) === index,
    );

    const candidates = placementOrder.map((placement) =>
      buildCandidate(placement),
    );
    const bestCandidate =
      candidates.find((candidate) => candidate.overlap === 0) || candidates[0];

    setTutorialPopoverStyle({
      top: `${bestCandidate.top}px`,
      left: `${bestCandidate.left}px`,
      transform: "none",
    });
    setIsTutorialLayoutReady(true);
  }, [activeTutorialSteps, isTutorialOpen, tutorialStepIndex]);

  React.useEffect(() => {
    if (!isTutorialOpen) return;

    const currentStep = activeTutorialSteps[tutorialStepIndex];
    const isSidebarStep = String(currentStep?.id || "").startsWith("sidebar");
    if (isSidebarStep) {
      if (isSidebarHidden) {
        setIsSidebarHidden(false);
      }

      if (selectedConnectionId) {
        setSelectedConnectionId("");
      }

      if (!selectedNodeId && Array.isArray(nodes) && nodes.length > 0) {
        setSelectedNodeId(nodes[0].id);
      }

      if (activeSidebarTab !== "entidade") {
        setActiveSidebarTab("entidade");
      }
    }

    setIsTutorialLayoutReady(false);
    const target = currentStep?.selector
      ? document.querySelector(currentStep.selector)
      : null;

    if (target) {
      target.scrollIntoView({
        behavior: "auto",
        block: "center",
        inline: "center",
      });
    }

    let rafB = null;
    const rafA = window.requestAnimationFrame(() => {
      rafB = window.requestAnimationFrame(() => {
        updateTutorialLayout();
      });
    });

    return () => {
      window.cancelAnimationFrame(rafA);
      if (rafB !== null) {
        window.cancelAnimationFrame(rafB);
      }
    };
  }, [
    activeTutorialSteps,
    activeSidebarTab,
    isSidebarHidden,
    isTutorialOpen,
    nodes,
    selectedConnectionId,
    selectedNodeId,
    tutorialStepIndex,
    updateTutorialLayout,
  ]);

  React.useEffect(() => {
    if (!isTutorialOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeTutorial();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNextTutorialStep();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePreviousTutorialStep();
      }
    };

    const handleWindowUpdate = () => {
      updateTutorialLayout();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleWindowUpdate);
    window.addEventListener("scroll", handleWindowUpdate, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleWindowUpdate);
      window.removeEventListener("scroll", handleWindowUpdate, true);
    };
  }, [
    closeTutorial,
    handleNextTutorialStep,
    handlePreviousTutorialStep,
    isTutorialOpen,
    updateTutorialLayout,
  ]);

  React.useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const body = document.body;
    if (!body) return undefined;

    if (isTutorialOpen) {
      body.dataset.bpmnTutorialOpen = "true";
      body.dataset.bpmnTutorialStep = String(
        activeTutorialSteps[tutorialStepIndex]?.id || "",
      );
    } else {
      delete body.dataset.bpmnTutorialOpen;
      delete body.dataset.bpmnTutorialStep;
    }

    return () => {
      delete body.dataset.bpmnTutorialOpen;
      delete body.dataset.bpmnTutorialStep;
    };
  }, [activeTutorialSteps, isTutorialOpen, tutorialStepIndex]);

  if (isTouchDevice && !isMobileLandscape) {
    return (
      <section className={styles.container}>
        <div className={styles.orientationLock}>
          <h2 className={styles.orientationLockTitle}>Use no modo deitado</h2>
          <p className={styles.orientationLockText}>
            O editor BPMN em celular foi otimizado para tela horizontal. Gire o
            aparelho para continuar editando e mover as entidades.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.container}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h1 className={styles.title}>Editor BPMN</h1>
          <div className={styles.editorNameGroup}>
            <div className={styles.editorNameRow}>
              <input
                className={styles.nameInput}
                data-tutorial-id="process-name"
                name="bpmnProcessName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isReadOnlyMode}
                placeholder="Nome do processo"
              />
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.iconActionButton}`}
                onClick={handleSaveEditorNameDraft}
                disabled={isReadOnlyMode}
                aria-label="Salvar nome do editor"
                title="Salvar nome do editor sem sair"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M4 4H17L20 7V20H4V4Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 4V10H15V4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 20V14H16V20"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <span
              className={`${styles.editorNameSaveFeedback} ${
                editorNameSaveFeedback
                  ? styles.editorNameSaveFeedbackVisible
                  : styles.editorNameSaveFeedbackHidden
              }`}
              role="status"
              aria-live="polite"
            >
              {editorNameSaveFeedback || "Mensagem de confirmacao"}
            </span>
          </div>
          {!isTouchDevice ? (
            <div className={styles.topbarInlineActions}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.iconActionButton}`}
                data-tutorial-id="reset-layout"
                onClick={handleResetToDefault}
                disabled={isReadOnlyMode}
                aria-label="Voltar ao padrão"
                title="Voltar ao padrão"
              >
                ↺
              </button>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.iconActionButton} ${styles.fullscreenToggleButton} ${isCanvasFullscreen ? styles.iconActionButtonActive : ""}`}
                data-tutorial-id="fullscreen-toggle"
                onClick={handleToggleCanvasFullscreen}
                aria-pressed={isCanvasFullscreen}
                aria-label={
                  isCanvasFullscreen ? "Sair da tela cheia" : "Tela cheia"
                }
                title={isCanvasFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              >
                {isCanvasFullscreen ? "⤡" : "⤢"}
              </button>
            </div>
          ) : null}
        </div>

        <div className={styles.topbarCenter}>
          <div className={styles.topbarCenterActions}>
            {isTouchDevice ? (
              <>
                <button
                  type="button"
                  className={`${styles.secondaryButton} ${styles.iconActionButton}`}
                  data-tutorial-id="reset-layout"
                  onClick={handleResetToDefault}
                  disabled={isReadOnlyMode}
                  aria-label="Voltar ao padrão"
                  title="Voltar ao padrão"
                >
                  ↺
                </button>
                <button
                  type="button"
                  className={`${styles.secondaryButton} ${styles.iconActionButton} ${styles.fullscreenToggleButton} ${isCanvasFullscreen ? styles.iconActionButtonActive : ""}`}
                  data-tutorial-id="fullscreen-toggle"
                  onClick={handleToggleCanvasFullscreen}
                  aria-pressed={isCanvasFullscreen}
                  aria-label={
                    isCanvasFullscreen ? "Sair da tela cheia" : "Tela cheia"
                  }
                  title={
                    isCanvasFullscreen ? "Sair da tela cheia" : "Tela cheia"
                  }
                >
                  {isCanvasFullscreen ? "⤡" : "⤢"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.tutorialButton}`}
              data-tutorial-id="save-bpmn"
              onClick={handleSaveBpmn}
              disabled={isReadOnlyMode || isSavingBpmn || isLoadingBpmn}
              aria-label="Salvar BPMN"
              title="Salvar BPMN"
            >
              {isSavingBpmn ? "SALVANDO..." : "SALVAR"}
            </button>
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.tutorialButton}`}
              data-tutorial-id="tutorial-button"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenTutorial();
              }}
              aria-label="Abrir tutorial"
              title="Abrir tutorial"
            >
              TUTORIAL
            </button>
          </div>
        </div>

        <div className={styles.topbarActions}>
          <button
            type="button"
            className={`${styles.secondaryButton} ${styles.iconActionButton}`}
            data-tutorial-id="add-node"
            onClick={addNode}
            disabled={isReadOnlyMode}
            aria-label="Adicionar retângulo"
            title="Adicionar retângulo"
          >
            ▭+
          </button>
          <button
            type="button"
            className={`${styles.secondaryButton} ${styles.iconActionButton} ${isZoomBetweenLimits ? styles.iconActionButtonActive : ""}`}
            data-tutorial-id="zoom-toggle"
            onClick={() => applyZoomStep(zoomButtonDirection)}
            aria-label={
              zoomButtonDirection < 0 ? "Diminuir zoom" : "Aumentar zoom"
            }
            title={zoomButtonDirection < 0 ? "Diminuir zoom" : "Aumentar zoom"}
          >
            {zoomButtonDirection < 0 ? "−" : "+"}
          </button>
          <button
            type="button"
            className={`${styles.secondaryButton} ${styles.iconActionButton} ${isPropertiesPinned ? styles.iconActionButtonActive : ""}`}
            data-tutorial-id="properties-toggle"
            onClick={handleTogglePropertiesPinned}
            aria-pressed={isPropertiesPinned}
            disabled={!hasSelection}
            aria-label={
              isPropertiesPinned
                ? "Desligar propriedades fixas"
                : "Ligar propriedades fixas"
            }
            title={
              isPropertiesPinned
                ? "Desligar propriedades fixas"
                : "Ligar propriedades fixas"
            }
          >
            ▤
          </button>
        </div>
      </header>

      <div
        className={`${styles.workspace} ${
          isCanvasFullscreen ? styles.workspaceFullscreen : ""
        } ${shouldHideProperties ? styles.sidebarHidden : ""} ${
          isTouchDevice ? styles.workspaceTouch : ""
        }`}
        ref={workspaceFullscreenRef}
      >
        {null /* mobile sidebar toggle removed */}
        {isCanvasFullscreen ? (
          <button
            type="button"
            className={`${styles.secondaryButton} ${styles.iconActionButton} ${styles.fullscreenToggleButton} ${styles.canvasOverlayFullscreenButton} ${styles.iconActionButtonActive}`}
            onClick={handleToggleCanvasFullscreen}
            aria-pressed={isCanvasFullscreen}
            aria-label="Sair da tela cheia"
            title="Sair da tela cheia"
          >
            ⤡
          </button>
        ) : null}
        <div className={styles.canvas}>
          {isMobileLandscape ? (
            <div className={styles.landscapeTip}>
              Dica (modo deitado): use "Ocultar propriedades" e "Tela cheia"
              para ganhar mais área no canvas.
            </div>
          ) : null}
          <div className={styles.canvasHintRow}>
            <div className={styles.canvasHint}>
              Para dúvidas, clique no botão <strong>TUTORIAL</strong>.
            </div>
          </div>
          <div
            className={`${styles.canvasViewport} ${isPanning ? styles.panning : ""}`}
            data-tutorial-id="canvas-viewport"
            ref={viewportRef}
            onPointerDown={handleViewportPointerDown}
            style={{
              touchAction: isTouchDevice
                ? isPanning
                  ? "none"
                  : "pan-x pan-y"
                : "auto",
            }}
            onMouseEnter={() => setIsViewportHovered(true)}
            onMouseLeave={() => setIsViewportHovered(false)}
            onFocus={() => setIsViewportHovered(true)}
            onBlur={() => setIsViewportHovered(false)}
            onClick={(event) => {
              const targetElement =
                event.target instanceof Element
                  ? event.target
                  : event.target?.parentElement;
              const clickedNode = targetElement?.closest?.(
                '[data-bpmn-node="true"]',
              );
              if (!clickedNode) {
                setSelectedNodeId("");
                setSelectedConnectionId("");
                if (!isPropertiesPinned) {
                  setIsSidebarHidden(true);
                }
              }
            }}
            onScroll={updateViewportMetrics}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={handleViewportKeyDown}
            tabIndex={0}
          >
            <div
              className={styles.canvasSurface}
              style={{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <BpmnFlow
                nodes={nodesForCanvas}
                connections={connections}
                currentIndex={-1}
                onStageChange={NOOP}
                onSelectNode={handleSelectNode}
                onRemoveNode={handleRemoveNodeById}
                selectedNodeId={selectedNodeId}
                onToggleNodeActive={handleToggleNodeActive}
                draggable={!isReadOnlyMode}
                disabled={isReadOnlyMode}
                zoom={zoom}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                onNodePositionChange={handleNodePositionChange}
                disableNodeDrag={isReadOnlyMode || isSpacePressed || isPanning}
                onCreateConnection={handleCreateConnectionByDrag}
                onCreateNodeFromConnection={handleCreateNodeFromConnection}
                onRemoveConnection={handleRemoveConnection}
                onSelectConnection={setSelectedConnectionId}
                selectedConnectionId={selectedConnectionId}
                invalidNodeId={invalidEntityNodeId}
                connectorsEnabled
                connectorRevealMode={connectorRevealMode}
                onNodeLabelChange={handleNodeLabelChange}
                onConnectionWaypointChange={handleConnectionWaypointChange}
              />
            </div>
          </div>

          {minimapState ? (
            <div
              className={styles.miniMapWrap}
              data-tutorial-id="canvas-minimap"
            >
              <div
                ref={minimapRef}
                className={styles.miniMap}
                style={{
                  width: `${minimapState.width}px`,
                  height: `${minimapState.height}px`,
                }}
                onPointerDown={handleMiniMapPointerDown}
                title="Mini mapa"
              >
                {nodesForCanvas.map((node) => (
                  <span
                    key={`minimap-${node.id}`}
                    className={`${styles.miniMapNode} ${
                      selectedNodeId === node.id
                        ? styles.miniMapNodeSelected
                        : ""
                    }`}
                    style={{
                      left: `${((node.x || 0) / canvasWidth) * minimapState.width}px`,
                      top: `${((node.y || 0) / canvasHeight) * minimapState.height}px`,
                    }}
                    aria-hidden="true"
                  />
                ))}
                <span
                  className={styles.miniMapViewport}
                  style={{
                    left: `${minimapState.viewX}px`,
                    top: `${minimapState.viewY}px`,
                    width: `${minimapState.viewWidth}px`,
                    height: `${minimapState.viewHeight}px`,
                  }}
                />
                <button
                  type="button"
                  data-tutorial-id="canvas-minimap-center"
                  className={`${styles.secondaryButton} ${styles.iconActionButton} ${styles.miniMapCenterButton} ${
                    isTutorialOpen &&
                    activeTutorialSteps[tutorialStepIndex]?.id !==
                      "canvas-minimap"
                      ? styles.miniMapCenterButtonMuted
                      : ""
                  }`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    centerOnNodes();
                    updateViewportMetrics();
                  }}
                  title="Centralizar"
                  aria-label="Centralizar"
                >
                  ◎
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <GerarBPMNContextSidebar
          className={isTouchDevice ? styles.contextSidebarTopMenu : ""}
          isMobileMenu={isTouchDevice}
          tutorialTargetId="context-sidebar"
          shouldHideProperties={shouldHideProperties}
          sidebarTabs={sidebarTabs}
          activeSidebarTab={activeSidebarTab}
          setActiveSidebarTab={setActiveSidebarTab}
          selectedNode={selectedNode}
          selectedConnection={selectedConnection}
          selectedNodeTypeSelectorValue={selectedNodeTypeSelectorValue}
          selectedNodeIsPrimaryEntity={selectedNodeIsPrimaryEntity}
          selectedNodeEntityType={selectedNodeEntityType}
          onSetSelectedNodeAsPrimaryEntity={
            handleSetSelectedNodeAsPrimaryEntity
          }
          onSetSelectedNodeEntityType={handleSetSelectedNodeEntityType}
          handleChangeSelectedNodeType={handleChangeSelectedNodeType}
          sidebarConnectionDecisionDraft={sidebarConnectionDecisionDraft}
          setSidebarConnectionDecisionDraft={setSidebarConnectionDecisionDraft}
          selectedConnectionSourceNode={selectedConnectionSourceNode}
          selectedConnectionTargetNode={selectedConnectionTargetNode}
          selectedConnectionId={selectedConnectionId}
          handleUpdateSelectedConnectionDecision={
            handleUpdateSelectedConnectionDecision
          }
          removeSelectedConnection={removeSelectedConnection}
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          gatewayTypeDraft={gatewayTypeDraft}
          setGatewayTypeDraft={setGatewayTypeDraft}
          handleSaveGatewayType={handleSaveGatewayType}
          stageConfigMode={stageConfigMode}
          setStageConfigMode={setStageConfigMode}
          entityMode={entityMode}
          setEntityMode={setEntityMode}
          selectedExistingEntityId={selectedExistingEntityId}
          setSelectedExistingEntityId={setSelectedExistingEntityId}
          entityOptions={filteredEntityOptions}
          newEntityForm={newEntityForm}
          setNewEntityForm={setNewEntityForm}
          conditionalForm={conditionalForm}
          setConditionalForm={setConditionalForm}
          isConditionalStageMode={isConditionalStageMode}
          entityFieldDraft={entityFieldDraft}
          setEntityFieldDraft={setEntityFieldDraft}
          newEntityFields={newEntityFields}
          onSaveEntityFieldDraft={handleSaveEntityFieldDraft}
          onEditEntityFieldDraft={handleEditEntityFieldDraft}
          onRemoveEntityFieldDraft={handleRemoveEntityFieldDraft}
          onSelectCreateNewEntityMode={handleSelectCreateNewEntityMode}
          selectedDataFieldIds={selectedDataFieldIds}
          setSelectedDataFieldIds={setSelectedDataFieldIds}
          setNewEntityFields={setNewEntityFields}
          toRequiredLabel={toRequiredLabel}
          entityError={entityError}
          shouldShowSidebarPrimaryAction={shouldShowSidebarPrimaryAction}
          handleSidebarPrimaryAction={handleSidebarPrimaryAction}
          isSidebarPrimaryActionDisabled={isSidebarPrimaryActionDisabled}
          suggestedEntity={suggestedEntity}
          isDuplicateSuggestion={isDuplicateSuggestion}
          isEntitySuggestionBusy={isEntitySuggestionBusy}
          handleEditSuggestedEntity={handleEditSuggestedEntity}
          handleDeleteSuggestedEntity={handleDeleteSuggestedEntity}
          entitySavedNotice={entitySavedNotice}
          isReadOnlyMode={isReadOnlyMode}
        />
      </div>

      {isTutorialOpen ? (
        <div
          className={styles.tutorialGuideOverlay}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            closeTutorial();
          }}
        >
          {tutorialSpotlight ? (
            <div
              className={styles.tutorialSpotlight}
              style={{
                top: `${tutorialSpotlight.top}px`,
                left: `${tutorialSpotlight.left}px`,
                width: `${tutorialSpotlight.width}px`,
                height: `${tutorialSpotlight.height}px`,
                opacity: isTutorialLayoutReady ? 1 : 0,
              }}
            />
          ) : null}

          <div
            className={styles.tutorialPopover}
            style={{
              ...tutorialPopoverStyle,
              opacity: isTutorialLayoutReady ? 1 : 0,
              pointerEvents: isTutorialLayoutReady ? "auto" : "none",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.tutorialPopoverHeader}>
              <div>
                <h2 className={styles.tutorialPopoverTitle}>Tutorial guiado</h2>
                <p className={styles.tutorialPopoverStepCounter}>
                  Etapa {tutorialStepIndex + 1} de {activeTutorialSteps.length}
                </p>
              </div>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.iconActionButton} ${styles.tutorialCloseButton}`}
                onClick={closeTutorial}
                aria-label="Fechar tutorial"
                title="Fechar tutorial"
              >
                ✕
              </button>
            </div>

            <div className={styles.tutorialPopoverBody}>
              <h3 className={styles.tutorialPopoverStepTitle}>
                {activeTutorialSteps[tutorialStepIndex]?.title || "Tutorial"}
              </h3>
              <p className={styles.tutorialPopoverStepDescription}>
                {activeTutorialSteps[tutorialStepIndex]?.description ||
                  "Siga os passos para conhecer o editor."}
              </p>

              <p className={styles.tutorialPopoverHint}>
                {activeTutorialSteps[tutorialStepIndex]?.hint ||
                  "Dica: use as setas ← e → para navegar entre as etapas do tutorial."}
              </p>

              <div className={styles.tutorialPopoverActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handlePreviousTutorialStep}
                  disabled={tutorialStepIndex === 0}
                >
                  Voltar
                </button>
                {tutorialStepIndex < activeTutorialSteps.length - 1 ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleNextTutorialStep}
                  >
                    Próximo
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={closeTutorial}
                  >
                    Finalizar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isDecisionPromptOpen ? (
        <div
          className={styles.decisionPromptOverlay}
          onClick={() => {
            setIsDecisionPromptOpen(false);
            setPendingDecisionConnectionId("");
            setDecisionPromptCustomValue("");
            setDecisionPromptPosition({ x: null, y: null });
          }}
        >
          <div
            className={styles.decisionPromptModal}
            style={decisionPromptStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              className={styles.decisionPromptInput}
              type="text"
              name="decisionPromptCustom"
              value={decisionPromptCustomValue}
              onChange={(event) =>
                setDecisionPromptCustomValue(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleDecisionPromptChoice(decisionPromptCustomValue);
                }
              }}
              placeholder="Condição personalizada"
              title="Condição personalizada"
            />
            <div className={styles.decisionPromptActions}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.decisionNoButton}`}
                onClick={() => handleDecisionPromptChoice("nao")}
              >
                Não (✕)
              </button>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.decisionYesButton}`}
                onClick={() => handleDecisionPromptChoice("sim")}
              >
                Sim (✓)
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={!String(decisionPromptCustomValue || "").trim()}
                onClick={() =>
                  handleDecisionPromptChoice(decisionPromptCustomValue)
                }
              >
                Salvar condição
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createNodeFromConnectionDraft ? (
        <Close
          title="Criar novo retângulo"
          message="Deseja criar um novo retângulo e ligar nesta conexão?"
          onConfirm={handleConfirmCreateNodeFromConnection}
          onCancel={handleCancelCreateNodeFromConnection}
          confirmLabel="Criar"
        >
          <label className={styles.createNodePromptCheckboxRow}>
            <input
              type="checkbox"
              name="disableCreateNodePrompt"
              checked={disableCreateNodeConnectionPromptDraft}
              onChange={(event) =>
                setDisableCreateNodeConnectionPromptDraft(event.target.checked)
              }
            />
            Não receber essa mensagem novamente
          </label>
        </Close>
      ) : null}

      {deleteSuggestedEntityDraft ? (
        <Close
          title="Deletar entidade"
          message={`Deseja realmente deletar a entidade "${getEntidadeNome(deleteSuggestedEntityDraft) || "selecionada"}"?`}
          onConfirm={handleConfirmDeleteSuggestedEntity}
          onCancel={handleCancelDeleteSuggestedEntity}
          confirmLabel="Deletar"
        >
          <label className={styles.createNodePromptCheckboxRow}>
            <input
              type="checkbox"
              name="disableDeleteEntityPrompt"
              checked={disableDeleteSuggestedEntityPromptDraft}
              onChange={(event) =>
                setDisableDeleteSuggestedEntityPromptDraft(event.target.checked)
              }
            />
            Não receber essa mensagem novamente
          </label>
        </Close>
      ) : null}

      {deleteSelectionDraft ? (
        <Close
          title="Confirmar exclusão"
          message="Deseja realmente deletar o item selecionado?"
          onConfirm={handleConfirmDeleteSelection}
          onCancel={handleCancelDeleteSelection}
          confirmLabel="Deletar"
        >
          <label className={styles.createNodePromptCheckboxRow}>
            <input
              type="checkbox"
              name="disableDeleteSelectionPrompt"
              checked={disableDeleteSelectionPromptDraft}
              onChange={(event) =>
                setDisableDeleteSelectionPromptDraft(event.target.checked)
              }
            />
            Não receber essa mensagem novamente
          </label>
        </Close>
      ) : null}

      {leavePageModalOpen ? (
        <Close
          title="Sair da página"
          message="Tem certeza que deseja sair desta página? As alterações não salvas podem ser perdidas."
          onConfirm={handleLeaveConfirm}
          onCancel={handleLeaveCancel}
          confirmLabel="Sair"
          cancelLabel="Ficar"
        />
      ) : null}

      {noticeModal.open ? (
        <Close
          title={noticeModal.title}
          message={noticeModal.message}
          onConfirm={() =>
            setNoticeModal((previous) => ({ ...previous, open: false }))
          }
          onCancel={() =>
            setNoticeModal((previous) => ({ ...previous, open: false }))
          }
          confirmLabel="OK"
          hideCancel
        />
      ) : null}
    </section>
  );
};

export default GerarBPMNCreate;
