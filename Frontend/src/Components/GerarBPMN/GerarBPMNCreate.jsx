import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BPMN_EDITOR_STATE_GET, BPMN_EDITOR_STATE_PUT } from '../../Api';
import {
  createOpportunity,
  fetchOpportunitiesPage,
  getAuthToken,
  updateOpportunityById,
} from '../Opportunities/opportunityApi';
import { EntidadesContext } from '../../Context/EntidadesContext';
import { UserContext } from '../../Context/UserContext';
import { isReadOnlyAccessLevelOne } from '../../Utils/accessControl';
import BpmnFlow from '../Common/BpmnFlow';
import Close from '../Helper/Close';
import GerarBPMNContextSidebar from './contextSidebar/GerarBPMNContextSidebar';
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
  getEntidadeDescricao,
  getEntidadeId,
  getEntidadeNome,
  normalizeBpmnName,
  normalizeEditorConnection,
  normalizeEditorNode,
  normalizeEntityName,
  sanitizeConnectionForPersistence,
  sanitizeNodeForPersistence,
  slugifyBpmnName,
  toRequiredLabel,
} from './gerarBpmnCreate.shared';
import styles from './GerarBPMNCreate.module.css';

const getEntityTypeInfoLabel = (rawType) => {
  const normalized = String(rawType || '')
    .trim()
    .toLowerCase();

  if (normalized === 'principal') return 'Entidade: Principal';
  if (normalized === 'associativa') return 'Entidade: Associativa';
  if (normalized === 'externa') return 'Entidade: Externa';
  return 'Entidade: Apoio';
};

const GerarBPMNCreate = () => {
  const navigate = useNavigate();
  const { bpmnSlug = '' } = useParams();
  const viewportRef = React.useRef(null);
  const workspaceFullscreenRef = React.useRef(null);
  const hasAutoFocusedRef = React.useRef(false);
  const hasNormalizedInitialLayoutRef = React.useRef(false);
  const hasHydratedBpmnRef = React.useRef(false);
  const lastSelectedNodeIdRef = React.useRef('');
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
  const baseCanvasWidth = 4200;
  const baseCanvasHeight = 2600;
  const [name, setName] = React.useState(() => bpmnNameFromSlug(bpmnSlug));
  const [nodes, setNodes] = React.useState([
    createNode('node-1', 'Entidade', 20, 30),
    createNode('node-2', 'Entidade', 300, 30),
    createNode('node-3', 'Entidade', 580, 30),
  ]);
  const [connections, setConnections] = React.useState([]);
  const [selectedNodeId, setSelectedNodeId] = React.useState('');
  const [selectedConnectionId, setSelectedConnectionId] = React.useState('');
  const [connectTarget, setConnectTarget] = React.useState('');
  const [connectorRevealMode, setConnectorRevealMode] =
    React.useState('hover-side');
  const [isCanvasFullscreen, setIsCanvasFullscreen] = React.useState(false);
  const [isSidebarHidden, setIsSidebarHidden] = React.useState(false);
  const [isPropertiesPinned, setIsPropertiesPinned] = React.useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = React.useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = React.useState(0);
  const [isTutorialLayoutReady, setIsTutorialLayoutReady] =
    React.useState(false);
  const [tutorialSpotlight, setTutorialSpotlight] = React.useState(null);
  const [tutorialPopoverStyle, setTutorialPopoverStyle] = React.useState({
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  });
  const [isDecisionPromptOpen, setIsDecisionPromptOpen] = React.useState(false);
  const [pendingDecisionConnectionId, setPendingDecisionConnectionId] =
    React.useState('');
  const [decisionPromptCustomValue, setDecisionPromptCustomValue] =
    React.useState('');
  const [sidebarConnectionDecisionDraft, setSidebarConnectionDecisionDraft] =
    React.useState('');
  const [isSavingBpmn, setIsSavingBpmn] = React.useState(false);
  const [isLoadingBpmn, setIsLoadingBpmn] = React.useState(true);
  const [invalidEntityNodeId, setInvalidEntityNodeId] = React.useState('');
  const [noticeModal, setNoticeModal] = React.useState({
    open: false,
    title: 'Aviso',
    message: '',
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
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem('desktopSidebarHidden') === 'true';
    },
  );
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = React.useState(false);
  const [viewportGridWidth, setViewportGridWidth] = React.useState(1200);
  const minimapRef = React.useRef(null);
  const MIN_ZOOM = 0.85;
  const MAX_ZOOM = 1;
  const ZOOM_STEP = 0.05;
  const [zoomButtonDirection, setZoomButtonDirection] = React.useState(-1);
  const isZoomBetweenLimits = zoom > MIN_ZOOM && zoom < MAX_ZOOM;
  const {
    entidades,
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
        user?.nome || user?.name || user?.username || user?.email || '',
      ).trim() || 'Conta atual',
    [user],
  );
  const actorAccountId = React.useMemo(
    () => String(user?.id || user?._id || user?.userId || '').trim(),
    [user],
  );

  React.useEffect(() => {
    if (isReadOnlyMode && !bpmnSlug) {
      navigate('/gerar-bpmn', { replace: true });
    }
  }, [bpmnSlug, isReadOnlyMode, navigate]);
  const [entityMode, setEntityMode] = React.useState('nova');
  const [stageConfigMode, setStageConfigMode] = React.useState('');
  const [selectedExistingEntityId, setSelectedExistingEntityId] =
    React.useState('');
  const [entityError, setEntityError] = React.useState('');
  const [entitySavedNotice, setEntitySavedNotice] = React.useState('');
  const [entitySavedNoticeNodeId, setEntitySavedNoticeNodeId] =
    React.useState('');
  const [entitySuggestionEntityId, setEntitySuggestionEntityId] =
    React.useState('');
  const [isEntitySuggestionBusy, setIsEntitySuggestionBusy] =
    React.useState(false);
  const [newEntityForm, setNewEntityForm] = React.useState(EMPTY_ENTITY_FORM);
  const [conditionalForm, setConditionalForm] = React.useState(
    EMPTY_CONDITIONAL_FORM,
  );
  const [taskForm, setTaskForm] = React.useState(EMPTY_TASK_FORM);
  const [gatewayTypeDraft, setGatewayTypeDraft] = React.useState('xor');
  const [newEntityFields, setNewEntityFields] = React.useState([]);
  const [entityDraftsByNodeId, setEntityDraftsByNodeId] = React.useState({});
  const [entityFieldDraft, setEntityFieldDraft] = React.useState({
    id: null,
    nome: '',
    tipo: '',
    obrigatorio: null,
  });
  const [linkedFieldDraft, setLinkedFieldDraft] = React.useState({
    id: null,
    nome: '',
    tipo: '',
    obrigatorio: null,
  });
  const [linkedEntityFieldsDraft, setLinkedEntityFieldsDraft] =
    React.useState(null);
  const [activeSidebarTab, setActiveSidebarTab] = React.useState('entidade');

  const tutorialSteps = React.useMemo(
    () => [
      {
        id: 'process-name',
        title: 'Nome do processo',
        description:
          'Comece por aqui: defina um nome claro e objetivo para identificar este BPMN na listagem e durante as edições futuras.',
        hint: 'Dica: use nomes curtos e específicos, por exemplo: Aprovação de orçamento.',
        selector: '[data-tutorial-id="process-name"]',
      },
      {
        id: 'reset-layout',
        title: '↺ Voltar ao padrão',
        description:
          'Reorganiza os retângulos no layout padrão automaticamente, útil quando o desenho ficou muito espalhado ou desordenado.',
        hint: 'Dica: use este botão antes de apresentar o fluxo, para deixar o layout mais legível.',
        selector: '[data-tutorial-id="reset-layout"]',
      },
      {
        id: 'fullscreen-toggle',
        title: '⛶ Tela cheia',
        description:
          'Alterna para modo tela cheia para ganhar mais espaço de edição e melhorar a visualização de fluxos maiores.',
        hint: 'Dica: em fluxos grandes, combine tela cheia + zoom para navegar com mais precisão.',
        selector: '[data-tutorial-id="fullscreen-toggle"]',
      },
      {
        id: 'desktop-sidebar-toggle',
        title: 'Seta do menu lateral',
        description:
          'Essa seta lateral recolhe/expande o menu principal do sistema. Ao recolher, aumenta o espaço útil da tela para trabalhar no BPMN.',
        hint: 'Dica: clique na seta quando quiser mais área horizontal para visualizar e editar o fluxo.',
        selector: '[data-tutorial-id="desktop-sidebar-toggle"]',
      },
      {
        id: 'save-bpmn',
        title: 'SALVAR',
        description:
          'Salva etapas, conexões e configurações do processo e depois retorna para a lista de BPMNs.',
        hint: 'Dica: como salvar retorna para a listagem, use quando concluir um bloco importante de alterações.',
        selector: '[data-tutorial-id="save-bpmn"]',
      },
      {
        id: 'add-node',
        title: '▭+ Adicionar retângulo',
        description:
          'Cria uma nova etapa no fluxo. Depois, escolha a categoria da etapa: Dados, Atividade ou Decisão.',
        hint: 'Dica: adicione as etapas principais primeiro e depois refine detalhes e conexões.',
        selector: '[data-tutorial-id="add-node"]',
      },
      {
        id: 'zoom-toggle',
        title: '− / + Zoom',
        description:
          'Ajusta o nível de zoom do canvas para facilitar leitura detalhada ou visão geral do processo.',
        hint: 'Dica: reduza o zoom para visão macro e aumente para editar condições e textos com calma.',
        selector: '[data-tutorial-id="zoom-toggle"]',
      },
      {
        id: 'properties-toggle',
        title: '▤ Propriedades fixas',
        description:
          'Mantém o painel de propriedades fixo enquanto você navega pelo fluxo, agilizando ajustes em sequência.',
        hint: 'Dica: deixe fixo quando for configurar várias etapas em sequência.',
        selector: '[data-tutorial-id="properties-toggle"]',
      },
      {
        id: 'canvas',
        title: 'Canvas do fluxo',
        description:
          'Área principal de modelagem: selecione etapas, arraste para reposicionar e crie conexões para montar a lógica do processo.',
        hint: 'Dica: clique no fundo para limpar seleção e passe o mouse nos botões para ver a função de cada um.',
        selector: '[data-tutorial-id="canvas-viewport"]',
      },
      {
        id: 'canvas-rectangles',
        title: 'Retângulos (etapas)',
        description:
          'Cada retângulo representa uma etapa do processo. Clique para selecionar, arraste para reposicionar, use o botão ✕ no canto para excluir e observe os conectores com ✓ (sim/correto) e ✕ (não) nas saídas de decisão.',
        hint: 'Dica: organize as etapas da esquerda para a direita e valide os conectores ✓ e ✕ para garantir o caminho correto da decisão.',
        selector: '[data-tutorial-id="canvas-rectangle"]',
      },
      {
        id: 'canvas-bands',
        title: 'Faixas coloridas dos cards',
        description:
          'A faixa no topo do retângulo indica o tipo da etapa: Dados (verde), Decisão (azul), Atividade (amarelo); cinza quando sem ligação.',
        hint: 'Dica: use as faixas para bater o olho e validar rapidamente se os tipos do fluxo estão corretos.',
        selector: '[data-tutorial-id="canvas-color-band"]',
      },
      {
        id: 'canvas-minimap',
        title: 'Minimapa e centralização',
        description:
          'O minimapa mostra a visão geral do fluxo. A seta dentro do círculo (botão de centralizar) reposiciona a visualização no conjunto de etapas.',
        hint: 'Dica: use a seta do minimapa para voltar rapidamente ao centro quando navegar para áreas distantes.',
        selector: '[data-tutorial-id="canvas-minimap"]',
        popoverPlacement: 'left',
      },
      {
        id: 'sidebar-overview',
        title: 'Painel contextual (visão geral)',
        description:
          'Este painel muda conforme a seleção do canvas. Clique em um retângulo para editar a etapa selecionada.',
        hint: 'Dica: se o painel não aparecer, selecione uma etapa no canvas para ativar a edição contextual.',
        selector: '[data-tutorial-id="context-sidebar"]',
        popoverPlacement: 'left',
      },
      {
        id: 'sidebar-category',
        title: 'Categoria da etapa',
        description:
          'Aqui você define o tipo da etapa: Dados, Atividade ou Decisão. Ao trocar a categoria, os campos de configuração do painel são ajustados automaticamente.',
        hint: 'Dica: escolha a categoria primeiro; isso evita preencher campos que não serão usados.',
        selector: '[data-tutorial-id="sidebar-stage-category"]',
        popoverPlacement: 'left',
      },
      {
        id: 'sidebar-config',
        title: 'Área de configuração',
        description:
          'Nesta área você preenche os detalhes da etapa selecionada: dados da entidade, campos, informações da atividade ou definição da decisão.',
        hint: 'Dica: edite um bloco por vez (categoria → dados → salvar) para reduzir erros de validação.',
        selector: '[data-tutorial-id="sidebar-config-area"]',
        popoverPlacement: 'left',
      },
      {
        id: 'sidebar-save',
        title: 'Salvar alterações',
        description:
          'Aplica no fluxo as alterações do item selecionado no painel. Use este botão sempre que finalizar uma edição da etapa ou conexão atual.',
        hint: 'Dica: confirme no card do canvas se a alteração refletiu antes de seguir para a próxima etapa.',
        selector: '[data-tutorial-id="sidebar-save-button"]',
        popoverPlacement: 'left',
      },
      {
        id: 'tutorial',
        title: 'TUTORIAL',
        description:
          'Reabre este guia dinâmico sempre que precisar revisar o fluxo de uso e o papel de cada botão.',
        hint: 'Dica: use as setas ← e → para navegar rapidamente entre as etapas do tutorial.',
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
      canvasWidth: Math.max(baseCanvasWidth, maxX + 240),
      canvasHeight: Math.max(baseCanvasHeight, maxY + 240),
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
    setSelectedConnectionId('');
  }, [selectedNodeId]);

  const entityOptions = React.useMemo(
    () =>
      (Array.isArray(entidades) ? entidades : [])
        .map((entidade) => ({
          id: getEntidadeId(entidade),
          nome: getEntidadeNome(entidade),
          categoria: String(entidade?.categoria || '').trim(),
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
      if (node.nodeType === 'task') return null;

      if (node.entidadeId !== null && node.entidadeId !== undefined) {
        const byId = entidadesById.get(String(node.entidadeId));
        if (byId) return byId;
      }

      const legacyName = normalizeEntityName(node.entidadeNome || '');
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

  const nodesForCanvas = React.useMemo(
    () =>
      nodes.map((node) => {
        if (node.nodeType === 'task') {
          return {
            ...node,
            label: String(node.taskNome || '').trim() || 'Atividade',
            subtitle:
              String(node.taskDescricao || '').trim() || 'Sem descrição',
            info: 'Configuração da atividade',
          };
        }

        if (node.nodeType === 'condicional') {
          let label =
            String(node.condicionalNome || '').trim() || 'Condicional';
          let subtitle =
            String(node.condicionalDescricao || '').trim() || 'Sem descrição';

          if (selectedNodeId === node.id && stageConfigMode === 'condicional') {
            label = String(conditionalForm.nome || '').trim() || 'Condicional';
            subtitle =
              String(conditionalForm.descricao || '').trim() || 'Sem descrição';
          }

          return {
            ...node,
            label,
            subtitle,
            info: `Decisão ${String(node.gatewayType || 'xor').toUpperCase()}`,
          };
        }

        const linkedEntity = resolveLinkedEntityFromNode(node);
        let label = String(node.label || '').trim() || 'Entidade';
        let subtitle = String(node.subtitle || '').trim() || 'Nova Etapa';
        let info = getEntityTypeInfoLabel(node?.tipoEntidade);

        if (linkedEntity) {
          label = getEntidadeNome(linkedEntity) || 'Entidade';
          subtitle = getEntidadeDescricao(linkedEntity) || 'Nova Etapa';
          info = getEntityTypeInfoLabel(
            String(node?.tipoEntidade || '').trim() ||
              linkedEntity?.tipoEntidade,
          );
        }

        if (
          selectedNodeId === node.id &&
          entityMode === 'nova' &&
          !linkedEntity
        ) {
          label = String(newEntityForm.nome || '').trim() || 'Entidade';
          subtitle =
            String(newEntityForm.descricao || '').trim() || 'Nova Etapa';
          info = getEntityTypeInfoLabel(node?.tipoEntidade);
        }

        return {
          ...node,
          label,
          subtitle,
          info,
        };
      }),
    [
      conditionalForm.descricao,
      conditionalForm.nome,
      entityMode,
      newEntityForm.descricao,
      newEntityForm.nome,
      nodes,
      resolveLinkedEntityFromNode,
      stageConfigMode,
      selectedNodeId,
    ],
  );

  const selectedNodeLinkedEntity = React.useMemo(() => {
    if (!selectedNode) return null;
    if (
      selectedNode.nodeType === 'condicional' ||
      selectedNode.nodeType === 'task'
    ) {
      return null;
    }

    const selectedId =
      selectedNode.entidadeId !== null && selectedNode.entidadeId !== undefined
        ? String(selectedNode.entidadeId)
        : '';
    const selectedName = normalizeEntityName(selectedNode.entidadeNome || '');

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
      selectedNode?.nodeType === 'condicional' ||
      selectedNode?.nodeType === 'task'
    ) {
      return null;
    }

    if (entityMode === 'existente' && selectedExistingEntityId) {
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
    if (stageConfigMode === 'condicional') {
      return null;
    }

    if (entityMode === 'existente' && selectedExistingEntity) {
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
    entityMode === 'nova' && Boolean(entitySuggestionEntityId);

  const isEditingEntityAction = Boolean(entityActionTarget);

  React.useEffect(() => {
    if (!selectedNodeId) return;

    const nextDraft = {
      stageConfigMode,
      entityMode,
      selectedExistingEntityId,
      newEntityForm,
      conditionalForm,
      newEntityFields,
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
          JSON.stringify(nextDraft.newEntityFields);

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
    selectedExistingEntityId,
    selectedNodeId,
    stageConfigMode,
  ]);

  React.useEffect(() => {
    const currentSelectedNodeId = selectedNode?.id || '';
    const hasNodeChanged =
      currentSelectedNodeId !== lastSelectedNodeIdRef.current;
    lastSelectedNodeIdRef.current = currentSelectedNodeId;

    if (
      hasNodeChanged &&
      entitySavedNotice &&
      entitySavedNoticeNodeId &&
      currentSelectedNodeId !== entitySavedNoticeNodeId
    ) {
      setEntitySavedNotice('');
      setEntitySavedNoticeNodeId('');
    }

    if (!selectedNode) {
      setEntityError('');
      setStageConfigMode('');
      setConditionalForm(EMPTY_CONDITIONAL_FORM);
      setTaskForm(EMPTY_TASK_FORM);
      setGatewayTypeDraft('xor');
      setEntityFieldDraft({
        id: null,
        nome: '',
        tipo: '',
        obrigatorio: null,
      });
      setLinkedFieldDraft({
        id: null,
        nome: '',
        tipo: '',
        obrigatorio: null,
      });
      setEntitySuggestionEntityId('');
      return;
    }

    if (!hasNodeChanged) {
      return;
    }

    const savedDraft = entityDraftsByNodeId[currentSelectedNodeId];
    const defaultStageMode =
      selectedNode.nodeType === 'condicional' ? 'condicional' : '';
    const normalizedGatewayType =
      selectedNode.gatewayType === 'and' || selectedNode.gatewayType === 'or'
        ? selectedNode.gatewayType
        : 'xor';
    setGatewayTypeDraft(normalizedGatewayType);
    setTaskForm({
      nome: String(selectedNode.taskNome || '').trim(),
      descricao: String(selectedNode.taskDescricao || '').trim(),
    });

    if (savedDraft) {
      setStageConfigMode(savedDraft.stageConfigMode || defaultStageMode);
      setEntityMode('nova');
      setSelectedExistingEntityId('');
      setNewEntityForm(savedDraft.newEntityForm || EMPTY_ENTITY_FORM);
      setConditionalForm(
        savedDraft.conditionalForm || {
          nome: String(selectedNode.condicionalNome || '').trim(),
          descricao: String(selectedNode.condicionalDescricao || '').trim(),
        },
      );
      setNewEntityFields(
        Array.isArray(savedDraft.newEntityFields)
          ? savedDraft.newEntityFields
          : [],
      );
      setEntityFieldDraft({
        id: null,
        nome: '',
        tipo: '',
        obrigatorio: null,
      });
      setLinkedFieldDraft({
        id: null,
        nome: '',
        tipo: '',
        obrigatorio: null,
      });
      setEntityError('');
      return;
    }

    setStageConfigMode(defaultStageMode);
    if (defaultStageMode === 'condicional') {
      setConditionalForm({
        nome: String(selectedNode.condicionalNome || '').trim(),
        descricao: String(selectedNode.condicionalDescricao || '').trim(),
      });
    } else {
      setConditionalForm(EMPTY_CONDITIONAL_FORM);
    }

    if (selectedNodeLinkedEntity) {
      setSelectedExistingEntityId('');
      setEntityMode('nova');
      setNewEntityForm({
        nome: String(selectedNodeLinkedEntity.nome || '').trim(),
        descricao: String(selectedNodeLinkedEntity.descricao || '').trim(),
        atributoChave: String(
          selectedNodeLinkedEntity.atributoChave || '',
        ).trim(),
      });

      const existingFields = getCamposEntidade(selectedNodeLinkedEntity).map(
        (campo) => ({
          id: campo.id ?? generateUniqueId('field'),
          nome: String(campo.nome || '').trim(),
          tipo: String(campo.tipo || '').trim(),
          obrigatorio: campo.obrigatorio === true,
        }),
      );
      setNewEntityFields(existingFields);
    } else if (hasNodeChanged) {
      setSelectedExistingEntityId('');
      setEntityMode('nova');
      setNewEntityForm({
        nome:
          String(selectedNode.entidadeNome || '').trim() ||
          String(selectedNode.label || '').trim(),
        descricao: String(selectedNode.subtitle || '').trim(),
        atributoChave: String(selectedNode.info || '').trim(),
      });
      setNewEntityFields([]);
      setEntityFieldDraft({
        id: null,
        nome: '',
        tipo: '',
        obrigatorio: null,
      });
    }

    setEntityError('');
    if (entityMode === 'existente') {
      setEntitySuggestionEntityId('');
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

  const handleSelectNode = React.useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
    setInvalidEntityNodeId('');
    if (nodeId) {
      setIsSidebarHidden(false);
    }
  }, []);

  const nodeLayoutMetrics = React.useMemo(() => {
    const viewport = viewportRef.current;
    const viewportWidth = viewport?.clientWidth || viewportGridWidth || 1200;

    if (viewportWidth <= 420) {
      return {
        nodeWidth: 92,
        nodeHeight: 64,
        rowStep: 72,
        sidePadding: 6,
        minimumHorizontalGap: 4,
      };
    }

    if (viewportWidth <= 560) {
      return {
        nodeWidth: 104,
        nodeHeight: 70,
        rowStep: 80,
        sidePadding: 8,
        minimumHorizontalGap: 4,
      };
    }

    if (viewportWidth <= 768) {
      return {
        nodeWidth: 120,
        nodeHeight: 76,
        rowStep: 88,
        sidePadding: 10,
        minimumHorizontalGap: 6,
      };
    }

    if (viewportWidth <= 900) {
      return {
        nodeWidth: 132,
        nodeHeight: 82,
        rowStep: 96,
        sidePadding: 12,
        minimumHorizontalGap: 6,
      };
    }

    return {
      nodeWidth: 220,
      nodeHeight: 110,
      rowStep: 170,
      sidePadding: 28,
      minimumHorizontalGap: 22,
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

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateDesktopSidebarHidden = () => {
      setIsDesktopSidebarHidden(
        window.localStorage.getItem('desktopSidebarHidden') === 'true',
      );
    };

    updateDesktopSidebarHidden();
    window.addEventListener(
      'desktopSidebarHiddenChange',
      updateDesktopSidebarHidden,
    );
    window.addEventListener('storage', updateDesktopSidebarHidden);

    return () => {
      window.removeEventListener(
        'desktopSidebarHiddenChange',
        updateDesktopSidebarHidden,
      );
      window.removeEventListener('storage', updateDesktopSidebarHidden);
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
    ({ fromId, fromHandle = 'right', pointer }) => {
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
      const validHandles = ['left', 'right', 'top', 'bottom'];
      const normalizedFromHandle = validHandles.includes(fromHandle)
        ? fromHandle
        : 'right';
      const oppositeHandleBySource = {
        left: 'right',
        right: 'left',
        top: 'bottom',
        bottom: 'top',
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
          computedToHandle = deltaX >= 0 ? 'left' : 'right';
        } else {
          computedToHandle = deltaY >= 0 ? 'top' : 'bottom';
        }
      }

      setNodes((previous) => [...previous, nextNode]);

      setConnections((previous) => [
        ...previous,
        {
          id: `conn-${Date.now()}-${fromId}-${nextId}`,
          from: fromId,
          to: nextId,
          fromHandle: normalizedFromHandle,
          toHandle: computedToHandle,
          decision: '',
        },
      ]);

      setSelectedNodeId(nextId);
      setIsSidebarHidden(false);
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

  const handleNodePositionChange = (nodeId, position) => {
    if (isReadOnlyMode) return;
    setNodes((previous) =>
      previous.map((node) =>
        node.id === nodeId ? { ...node, x: position.x, y: position.y } : node,
      ),
    );
  };

  const handleRemoveNodeById = React.useCallback(
    (nodeId) => {
      if (isReadOnlyMode) return;
      if (!nodeId) return;

      const fallbackSelectedNodeId =
        nodes.find((node) => node.id !== nodeId)?.id || '';

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
            removedIdsSet.has(current) ? '' : current,
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
      setConnectTarget((current) => (current === nodeId ? '' : current));
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
        decision: '',
      },
    ]);

    const sourceNode = nodes.find((node) => node.id === selectedNodeId) || null;
    const isSourceConditional = sourceNode?.nodeType === 'condicional';

    if (isSourceConditional) {
      setIsSidebarHidden(false);
      setSelectedNodeId(selectedNodeId);
      setPendingDecisionConnectionId(nextConnectionId);
      setDecisionPromptCustomValue('');
      setDecisionPromptPosition({ x: null, y: null });
      setIsDecisionPromptOpen(true);
    }
  };

  const handleCreateConnectionByDrag = React.useCallback(
    (
      fromId,
      toId,
      fromHandle = 'right',
      toHandle = 'left',
      pointerClientPosition = null,
    ) => {
      if (!fromId || !toId || fromId === toId) return;

      setConnections((previous) => {
        const exists = previous.some(
          (connection) =>
            connection.from === fromId &&
            connection.to === toId &&
            (connection.fromHandle || 'right') === fromHandle &&
            (connection.toHandle || 'left') === toHandle,
        );
        if (exists) return previous;

        const nextConnectionId = `conn-${Date.now()}-${fromId}-${toId}`;
        const sourceNode = nodes.find((node) => node.id === fromId) || null;
        const isSourceConditional = sourceNode?.nodeType === 'condicional';

        if (isSourceConditional) {
          setSelectedNodeId(fromId);
          setIsSidebarHidden(false);
          setPendingDecisionConnectionId(nextConnectionId);
          setDecisionPromptCustomValue('');
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
          setSelectedConnectionId('');
        }

        return [
          ...previous,
          {
            id: nextConnectionId,
            from: fromId,
            to: toId,
            fromHandle,
            toHandle,
            decision: '',
          },
        ];
      });
    },
    [nodes],
  );

  const handleRemoveConnection = React.useCallback((connectionId) => {
    if (!connectionId) return;
    setConnections((previous) =>
      previous.filter((connection) => connection.id !== connectionId),
    );
    setSelectedConnectionId((previous) =>
      previous === connectionId ? '' : previous,
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
      String(selectedConnection?.decision || '').trim(),
    );
  }, [selectedConnection?.decision, selectedConnection?.id]);

  const removeSelectedConnection = React.useCallback(() => {
    if (!selectedConnectionId) return;
    handleRemoveConnection(selectedConnectionId);
  }, [handleRemoveConnection, selectedConnectionId]);

  const executeDeleteSelection = React.useCallback(
    (draft) => {
      if (!draft?.id || !draft?.type) return;

      if (draft.type === 'connection') {
        handleRemoveConnection(draft.id);
        return;
      }

      if (draft.type === 'node') {
        handleRemoveNodeById(draft.id);
      }
    },
    [handleRemoveConnection, handleRemoveNodeById],
  );

  const requestDeleteSelection = React.useCallback(() => {
    const nextDraft = selectedConnectionId
      ? {
          type: 'connection',
          id: selectedConnectionId,
        }
      : selectedNodeId
        ? {
            type: 'node',
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
    ? 'connection'
    : selectedNode
      ? 'entity'
      : 'none';

  const sidebarTabs = React.useMemo(() => {
    if (sidebarContextType === 'connection') {
      return [{ id: 'connection', label: 'Conexão' }];
    }

    if (sidebarContextType === 'gateway') {
      return [
        { id: 'gateway', label: 'Gateway' },
        { id: 'conexoes', label: 'Conexões' },
      ];
    }

    if (sidebarContextType === 'task') {
      return [{ id: 'task', label: 'Task' }];
    }

    if (sidebarContextType === 'entity') {
      return [{ id: 'entidade', label: 'Painel contextual' }];
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
      const normalizedDecision = String(decision || '').trim();
      if (!normalizedDecision) return;

      if (!pendingDecisionConnectionId) {
        setIsDecisionPromptOpen(false);
        setDecisionPromptCustomValue('');
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
      setPendingDecisionConnectionId('');
      setDecisionPromptCustomValue('');
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
      typeof window !== 'undefined' ? window.innerWidth || 1200 : 1200;
    const viewportHeight =
      typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
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
      actionType = 'update',
      elementType,
      itemName,
      before = '',
      after = '',
    }) => {
      const autoKey = `sidebar-draft:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const newItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        title,
        description,
        time: new Date().toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        timestamp: new Date().toISOString(),
        actor: actorAccountName,
        actorId: actorAccountId,
        autoGenerated: true,
        source: 'bpmn-sidebar-draft',
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
          const originalBpmnSlug = String(bpmnSlug || '').trim();

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
                String(item?.autoKey || '').trim() ===
                String(newItem.autoKey || '').trim(),
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
    setEntityFieldDraft({
      id: null,
      nome: '',
      tipo: '',
      obrigatorio: null,
    });
  }, []);

  const applyEntityToSelectedNode = React.useCallback(
    (entidade) => {
      if (!selectedNodeId || !entidade) return;

      const previousName =
        String(selectedNode?.entidadeNome || '').trim() ||
        String(selectedNode?.label || '').trim() ||
        '-';

      const entidadeId = getEntidadeId(entidade);
      const nextName = String(getEntidadeNome(entidade) || '').trim() || '-';

      updateSelectedNode({
        nodeType: 'entidade',
        gatewayType: 'xor',
        entidadeId,
        entidadeNome: '',
        condicionalNome: '',
        condicionalDescricao: '',
        taskNome: '',
        taskDescricao: '',
      });

      appendPendingSidebarTimelineItem({
        title: 'Entidade atualizada no BPMN',
        description: `Antes: ${previousName} → Agora: ${nextName}`,
        actionType: 'update',
        elementType: 'entidade',
        itemName: nextName,
        before: previousName,
        after: nextName,
      });
      setEntityError('');
    },
    [
      appendPendingSidebarTimelineItem,
      selectedNode,
      selectedNodeId,
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
      setEntityError('Selecione uma entidade existente para vincular.');
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
    const nome = String(entityFieldDraft.nome || '').trim();
    if (!nome) {
      setEntityError('Nome do campo é obrigatório.');
      return null;
    }

    if (!String(entityFieldDraft.tipo || '').trim()) {
      setEntityError('Selecione o tipo do campo.');
      return null;
    }

    if (typeof entityFieldDraft.obrigatorio !== 'boolean') {
      setEntityError('Informe se o campo é obrigatório.');
      return null;
    }

    const duplicated = validarNomeCampoDuplicado(
      newEntityFields,
      nome,
      entityFieldDraft.id,
    );

    if (duplicated) {
      setEntityError('Já existe um campo com esse nome na entidade.');
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
              }
            : campo,
        )
      : [
          ...newEntityFields,
          {
            id: generateUniqueId('field'),
            nome,
            tipo: entityFieldDraft.tipo,
            obrigatorio: entityFieldDraft.obrigatorio,
          },
        ];

    setNewEntityFields(nextFields);

    setEntityError('');
    return nextFields;
  }, [entityFieldDraft, newEntityFields, validarNomeCampoDuplicado]);

  const handleCreateAndLinkEntity = React.useCallback(
    async (fieldsOverride) => {
      if (!selectedNode) return;

      setEntitySavedNotice('');
      setEntitySavedNoticeNodeId('');

      const nome = String(newEntityForm.nome || '').trim();
      const descricao = String(newEntityForm.descricao || '').trim();
      const atributoChave = String(newEntityForm.atributoChave || '').trim();
      const tipoEntidade =
        String(selectedNode?.tipoEntidade || '').trim() ||
        (selectedNode?.isPrimaryEntity === true ? 'Principal' : 'Apoio');
      const isPrimaryEntity =
        String(tipoEntidade || '')
          .trim()
          .toLowerCase() === 'principal';
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
        const token = window.localStorage.getItem('token');

        if (updateTarget) {
          const targetId = getEntidadeId(updateTarget);
          if (targetId !== null && targetId !== undefined) {
            const nomeFinal =
              String(nome || '').trim() ||
              String(updateTarget?.nome || '').trim();
            const descricaoFinal =
              String(descricao || '').trim() ||
              String(updateTarget?.descricao || '').trim() ||
              'Entidade gerada pelo BPMN';
            const atributoChaveFinal =
              String(atributoChave || '').trim() ||
              String(updateTarget?.atributoChave || '').trim();
            const camposFinais =
              Array.isArray(effectiveFields) && effectiveFields.length > 0
                ? effectiveFields
                : getCamposEntidade(updateTarget);

            if (!nomeFinal) {
              setEntityError('Preencha ao menos o nome da entidade.');
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
                categoria: updateTarget?.categoria || 'BPMN',
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
            setEntitySuggestionEntityId('');
            setEntityError('');
            setEntitySavedNotice('Entidade atualizada na página de Entidades.');
            setEntitySavedNoticeNodeId(selectedNode.id);
            return;
          }
        }

        if (!nome || !descricao || !atributoChave) {
          setEntityError(
            'Preencha nome, descrição e atributo chave da entidade.',
          );
          return;
        }

        if (!Array.isArray(effectiveFields) || effectiveFields.length === 0) {
          setActiveSidebarTab('entidade');
          setEntityError(
            'Adicione pelo menos um campo na seção Campos para salvar Dados.',
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
            categoria: 'BPMN',
            campos: effectiveFields,
          },
          token,
        );

        applyEntityToSelectedNode(entidadeCriada);
        setEntitySuggestionEntityId('');
        setEntityError('');
        setEntitySavedNotice('Entidade salva na página de Entidades.');
        setEntitySavedNoticeNodeId(selectedNode.id);
      } catch (err) {
        setEntityError(err?.message || 'Não foi possível criar a entidade.');
        setEntitySavedNotice('');
        setEntitySavedNoticeNodeId('');
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

    setEntitySavedNotice('');
    setEntitySavedNoticeNodeId('');

    const nome = String(conditionalForm.nome || '').trim();
    const descricao = String(conditionalForm.descricao || '').trim();
    const previousNome =
      String(selectedNode?.condicionalNome || '').trim() ||
      String(selectedNode?.label || '').trim() ||
      '-';

    if (!nome || !descricao) {
      setEntityError('Preencha nome e descrição da condicional.');
      return;
    }

    updateSelectedNode({
      nodeType: 'condicional',
      gatewayType:
        gatewayTypeDraft === 'and' || gatewayTypeDraft === 'or'
          ? gatewayTypeDraft
          : 'xor',
      condicionalNome: nome,
      condicionalDescricao: descricao,
      entidadeId: null,
      entidadeNome: '',
      taskNome: '',
      taskDescricao: '',
    });

    appendPendingSidebarTimelineItem({
      title: 'Condição atualizada no BPMN',
      description: `Antes: ${previousNome} → Agora: ${nome}`,
      actionType: 'update',
      elementType: 'elemento-bpmn',
      itemName: nome,
      before: previousNome,
      after: nome,
    });

    setEntityError('');
    setEntitySavedNotice('Decisão salva no fluxo.');
    setEntitySavedNoticeNodeId(selectedNode.id);
  }, [
    appendPendingSidebarTimelineItem,
    conditionalForm.descricao,
    conditionalForm.nome,
    gatewayTypeDraft,
    selectedNode,
    updateSelectedNode,
  ]);

  const handleSaveTaskStage = React.useCallback(() => {
    if (!selectedNode) return;

    const nome = String(taskForm.nome || '').trim();
    const descricao = String(taskForm.descricao || '').trim();
    const previousNome =
      String(selectedNode?.taskNome || '').trim() ||
      String(selectedNode?.label || '').trim() ||
      '-';

    if (!nome) {
      setEntityError('Preencha o nome da atividade.');
      return;
    }

    updateSelectedNode({
      nodeType: 'task',
      taskNome: nome,
      taskDescricao: descricao,
      entidadeId: null,
      entidadeNome: '',
      condicionalNome: '',
      condicionalDescricao: '',
    });

    appendPendingSidebarTimelineItem({
      title: 'Atividade atualizada no BPMN',
      description: `Antes: ${previousNome} → Agora: ${nome}`,
      actionType: 'update',
      elementType: 'elemento-bpmn',
      itemName: nome,
      before: previousNome,
      after: nome,
    });

    setEntityError('');
    setEntitySavedNotice('Atividade salva no fluxo.');
    setEntitySavedNoticeNodeId(selectedNode.id);
  }, [
    appendPendingSidebarTimelineItem,
    selectedNode,
    taskForm.descricao,
    taskForm.nome,
    updateSelectedNode,
  ]);

  const handleSaveEntityStageLocal = React.useCallback(() => {
    if (!selectedNode) return;

    setEntitySavedNotice('');
    setEntitySavedNoticeNodeId('');

    const nome = String(newEntityForm.nome || '').trim();
    const descricao = String(newEntityForm.descricao || '').trim();
    const atributoChave = String(newEntityForm.atributoChave || '').trim();
    const previousNome =
      String(selectedNode?.entidadeNome || '').trim() ||
      String(selectedNode?.label || '').trim() ||
      '-';

    if (!nome) {
      setEntityError('Preencha o nome da entidade.');
      return;
    }

    updateSelectedNode({
      nodeType: 'entidade',
      gatewayType: 'xor',
      entidadeId: null,
      entidadeNome: nome,
      label: nome,
      subtitle: descricao,
      info: atributoChave,
      condicionalNome: '',
      condicionalDescricao: '',
      taskNome: '',
      taskDescricao: '',
    });

    appendPendingSidebarTimelineItem({
      title: 'Entidade atualizada no BPMN',
      description: `Antes: ${previousNome} → Agora: ${nome}`,
      actionType: 'update',
      elementType: 'entidade',
      itemName: nome,
      before: previousNome,
      after: nome,
    });

    setEntityError('');
    setEntitySavedNotice('Dados da entidade salvos no BPMN.');
    setEntitySavedNoticeNodeId(selectedNode.id);
  }, [
    appendPendingSidebarTimelineItem,
    newEntityForm.atributoChave,
    newEntityForm.descricao,
    newEntityForm.nome,
    selectedNode,
    updateSelectedNode,
  ]);

  const handleSaveGatewayType = React.useCallback(() => {
    if (!selectedNode) return;

    updateSelectedNode({
      nodeType: 'condicional',
      gatewayType:
        gatewayTypeDraft === 'and' || gatewayTypeDraft === 'or'
          ? gatewayTypeDraft
          : 'xor',
    });

    setEntitySavedNotice('Tipo da decisão atualizado.');
    setEntitySavedNoticeNodeId(selectedNode.id);
  }, [gatewayTypeDraft, selectedNode, updateSelectedNode]);

  const handleChangeSelectedNodeType = React.useCallback(
    (nextType) => {
      if (!selectedNode) return;

      if (nextType === 'task') {
        setStageConfigMode('');
        updateSelectedNode({
          nodeType: 'task',
          isPrimaryEntity: false,
          entidadeId: null,
          entidadeNome: '',
          condicionalNome: '',
          condicionalDescricao: '',
          taskNome:
            String(selectedNode.taskNome || '').trim() ||
            String(selectedNode.label || '').trim(),
          taskDescricao:
            String(selectedNode.taskDescricao || '').trim() ||
            String(selectedNode.subtitle || '').trim(),
        });
        return;
      }

      if (nextType === 'condicional') {
        setStageConfigMode('condicional');
        updateSelectedNode({
          nodeType: 'condicional',
          isPrimaryEntity: false,
          tipoEntidade: '',
          gatewayType:
            gatewayTypeDraft === 'and' || gatewayTypeDraft === 'or'
              ? gatewayTypeDraft
              : 'xor',
          entidadeId: null,
          entidadeNome: '',
          taskNome: '',
          taskDescricao: '',
        });
        return;
      }

      setStageConfigMode('entidade');
      updateSelectedNode({
        nodeType: 'entidade',
        condicionalNome: '',
        condicionalDescricao: '',
        taskNome: '',
        taskDescricao: '',
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
            node.nodeType !== 'task' && node.nodeType !== 'condicional';
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

      const normalizedType = String(nextEntityType || '')
        .trim()
        .toLowerCase();
      const resolvedType =
        normalizedType === 'principal' ||
        normalizedType === 'apoio' ||
        normalizedType === 'associativa' ||
        normalizedType === 'externa'
          ? normalizedType
          : 'apoio';
      const nextIsPrimary = resolvedType === 'principal';

      setNodes((previous) =>
        previous.map((node) => {
          const isEntityNode =
            node.nodeType !== 'task' && node.nodeType !== 'condicional';
          if (!isEntityNode) {
            return { ...node, isPrimaryEntity: false, tipoEntidade: '' };
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

  const handleEditSuggestedEntity = React.useCallback(() => {
    if (!suggestedEntity) return;

    const entityId = getEntidadeId(suggestedEntity);
    if (entityId === null || entityId === undefined) return;

    setEntityMode('existente');
    setSelectedExistingEntityId(String(entityId));
    setNewEntityForm({
      nome: String(suggestedEntity.nome || '').trim(),
      descricao: String(suggestedEntity.descricao || '').trim(),
      atributoChave: String(suggestedEntity.atributoChave || '').trim(),
    });
    setEntityError('');
    setEntitySuggestionEntityId('');
  }, [suggestedEntity]);

  const executeDeleteSuggestedEntity = React.useCallback(
    async (entityToDelete) => {
      if (!entityToDelete) return;

      const entityId = getEntidadeId(entityToDelete);
      if (entityId === null || entityId === undefined) return;

      setIsEntitySuggestionBusy(true);

      try {
        const token = window.localStorage.getItem('token');
        await deletarEntidade(entityId, token);

        if (selectedExistingEntityId === String(entityId)) {
          setSelectedExistingEntityId('');
          if (entityMode === 'existente') {
            setEntityMode('nova');
          }
        }

        if (
          selectedNode &&
          String(resolveEntityIdFromNode(selectedNode) || '') ===
            String(entityId)
        ) {
          updateSelectedNode({
            entidadeId: null,
            entidadeNome: '',
          });
        }

        setEntitySuggestionEntityId('');
        setEntityError('');
        setEntitySavedNotice('Entidade removida da lista.');
        setEntitySavedNoticeNodeId(selectedNode?.id || '');
      } catch (err) {
        setEntityError(err?.message || 'Não foi possível remover a entidade.');
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

      setEntitySavedNotice('');
      setEntitySavedNoticeNodeId('');

      const effectiveFields = Array.isArray(fieldsOverride)
        ? fieldsOverride
        : newEntityFields;

      if (isEditingEntityAction && entityActionTarget) {
        const entidadeId = getEntidadeId(entityActionTarget);
        if (entidadeId === null || entidadeId === undefined) {
          setEntityError('Selecione uma entidade para editar.');
          setEntitySavedNotice('');
          return;
        }

        const nomeDraft = String(newEntityForm.nome || '').trim();
        const descricaoDraft = String(newEntityForm.descricao || '').trim();
        const atributoChaveDraft = String(
          newEntityForm.atributoChave || '',
        ).trim();

        const nome =
          nomeDraft || String(entityActionTarget?.nome || '').trim() || '';
        const descricao =
          descricaoDraft ||
          String(entityActionTarget?.descricao || '').trim() ||
          'Entidade gerada pelo BPMN';
        const atributoChave =
          atributoChaveDraft ||
          String(entityActionTarget?.atributoChave || '').trim();
        const tipoEntidade =
          String(
            selectedNode?.tipoEntidade ||
              entityActionTarget?.tipoEntidade ||
              '',
          ).trim() ||
          (selectedNode?.isPrimaryEntity === true ||
          entityActionTarget?.isPrimaryEntity === true
            ? 'Principal'
            : 'Apoio');
        const isPrimaryEntity =
          String(tipoEntidade || '')
            .trim()
            .toLowerCase() === 'principal';
        const camposParaSalvar =
          Array.isArray(effectiveFields) && effectiveFields.length > 0
            ? effectiveFields
            : getCamposEntidade(entityActionTarget);

        if (!nome) {
          setEntityError('Preencha ao menos o nome da entidade.');
          setEntitySavedNotice('');
          return;
        }

        try {
          const token = window.localStorage.getItem('token');
          const entidadeEditada = await editarEntidade(
            entidadeId,
            {
              nome,
              descricao,
              atributoChave,
              tipoEntidade,
              isPrimaryEntity,
              categoria: entityActionTarget.categoria || 'BPMN',
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
          setEntityError('');
          setEntitySavedNotice('Entidade salva na página de Entidades.');
          setEntitySavedNoticeNodeId(selectedNode.id);
        } catch (err) {
          setEntityError(err?.message || 'Não foi possível editar a entidade.');
          setEntitySavedNotice('');
          setEntitySavedNoticeNodeId('');
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
    if (entityMode !== 'existente') return;
    if (!selectedExistingEntity) return;

    setNewEntityForm((previous) => ({
      ...previous,
      nome: String(selectedExistingEntity.nome || '').trim(),
      descricao: String(selectedExistingEntity.descricao || '').trim(),
      atributoChave: String(selectedExistingEntity.atributoChave || '').trim(),
    }));

    const existingFields = getCamposEntidade(selectedExistingEntity).map(
      (campo) => ({
        id: campo.id ?? generateUniqueId('field'),
        nome: String(campo.nome || '').trim(),
        tipo: String(campo.tipo || '').trim(),
        obrigatorio: campo.obrigatorio === true,
      }),
    );
    setNewEntityFields(existingFields);
  }, [entityMode, getCamposEntidade, selectedExistingEntity]);

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
      setEntityError('Selecione uma entidade existente para adicionar campo.');
      return;
    }

    const nome = String(linkedFieldDraft.nome || '').trim();
    if (!nome) {
      setEntityError('Nome do campo é obrigatório.');
      return;
    }

    if (!String(linkedFieldDraft.tipo || '').trim()) {
      setEntityError('Selecione o tipo do campo.');
      return;
    }

    if (typeof linkedFieldDraft.obrigatorio !== 'boolean') {
      setEntityError('Informe se o campo é obrigatório.');
      return;
    }

    const duplicated = validarNomeCampoDuplicado(
      linkedEntityFieldsForPanel,
      nome,
      linkedFieldDraft.id,
    );

    if (duplicated) {
      setEntityError('Já existe um campo com esse nome na entidade vinculada.');
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
          },
        );
      } else {
        camposAtualizados = await adicionarCampoEntidade(
          resolvedFieldEntityTarget,
          {
            nome,
            tipo: linkedFieldDraft.tipo,
            obrigatorio: linkedFieldDraft.obrigatorio,
          },
        );
      }

      setLinkedEntityFieldsDraft(
        Array.isArray(camposAtualizados) ? camposAtualizados : null,
      );

      setLinkedFieldDraft({
        id: null,
        nome: '',
        tipo: '',
        obrigatorio: null,
      });
      setEntityError('');
    } catch (err) {
      setEntityError(err?.message || 'Não foi possível salvar o campo.');
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
          setLinkedFieldDraft({
            id: null,
            nome: '',
            tipo: '',
            obrigatorio: null,
          });
        }
      } catch (err) {
        setEntityError(err?.message || 'Não foi possível remover o campo.');
      }
    },
    [fieldEntityTarget, linkedFieldDraft.id, removerCampoEntidade],
  );

  const isConnectionTabActive = activeSidebarTab === 'connection';
  const isGatewayInfoTabActive = activeSidebarTab === 'conexoes';
  const isTaskNodeSelected = selectedNode?.nodeType === 'task';
  const isDecisionNodeSelected = selectedNode?.nodeType === 'condicional';
  const isDataNodeSelected = selectedNode?.nodeType === 'entidade';
  const isStageModeSelected =
    stageConfigMode === 'entidade' || stageConfigMode === 'condicional';
  const isConditionalStageMode =
    stageConfigMode === 'condicional'
      ? true
      : stageConfigMode === 'entidade'
        ? false
        : selectedNode?.nodeType === 'condicional';
  const shouldAutoSaveFieldDraft = React.useMemo(() => {
    if (!entityFieldDraft) return false;

    const hasName = Boolean(String(entityFieldDraft.nome || '').trim());
    const hasType = Boolean(String(entityFieldDraft.tipo || '').trim());
    const hasRequired = typeof entityFieldDraft.obrigatorio === 'boolean';
    const hasEditingId =
      entityFieldDraft.id !== null &&
      entityFieldDraft.id !== undefined &&
      String(entityFieldDraft.id).trim() !== '';

    return hasEditingId || (hasName && hasType && hasRequired);
  }, [entityFieldDraft]);

  const handleSidebarPrimaryAction = React.useCallback(async () => {
    if (isConnectionTabActive || isGatewayInfoTabActive) {
      return;
    }

    if (isTaskNodeSelected) {
      handleSaveTaskStage();
      return;
    }

    if (isDataNodeSelected && entityMode === 'nova' && !isEditingEntityAction) {
      handleSaveEntityStageLocal();
      return;
    }

    if (isDataNodeSelected && shouldAutoSaveFieldDraft) {
      const nextFields = handleSaveEntityFieldDraft();
      if (!nextFields) {
        return;
      }

      await handleSubmitEntityAction(nextFields);
      return;
    }

    if (isDecisionNodeSelected) {
      handleSaveConditionalStage();
      return;
    }

    if (!isDataNodeSelected) {
      setEntityError('Selecione uma categoria válida para salvar.');
      return;
    }

    await handleSubmitEntityAction();
  }, [
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
      return !String(taskForm.nome || '').trim();
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
    ? selectedNode.nodeType === 'task'
      ? 'task'
      : selectedNode.nodeType === 'condicional'
        ? 'condicional'
        : 'entidade'
    : 'entidade';

  const selectedNodeIsPrimaryEntity = Boolean(
    selectedNode?.nodeType !== 'task' &&
    selectedNode?.nodeType !== 'condicional' &&
    selectedNode?.isPrimaryEntity === true,
  );

  const selectedNodeEntityType = React.useMemo(() => {
    if (!selectedNode) return 'apoio';
    if (
      selectedNode?.nodeType === 'task' ||
      selectedNode?.nodeType === 'condicional'
    ) {
      return 'apoio';
    }

    const normalized = String(selectedNode?.tipoEntidade || '')
      .trim()
      .toLowerCase();

    if (
      normalized === 'principal' ||
      normalized === 'apoio' ||
      normalized === 'associativa' ||
      normalized === 'externa'
    ) {
      return normalized;
    }

    return selectedNode?.isPrimaryEntity === true ? 'principal' : 'apoio';
  }, [selectedNode]);

  const filteredEntityOptions = React.useMemo(() => {
    const categoriaAtual = selectedNodeTypeSelectorValue;

    return entityOptions.filter((entidade) => {
      const normalizedCategory = normalizeEntityName(entidade.categoria || '');

      if (categoriaAtual === 'entidade') {
        return (
          !normalizedCategory ||
          !['task', 'atividade', 'gateway', 'condicional', 'decisao'].includes(
            normalizedCategory,
          )
        );
      }

      if (categoriaAtual === 'task') {
        return (
          normalizedCategory === 'task' || normalizedCategory === 'atividade'
        );
      }

      if (categoriaAtual === 'condicional') {
        return (
          normalizedCategory === 'gateway' ||
          normalizedCategory === 'condicional' ||
          normalizedCategory === 'decisao'
        );
      }

      return true;
    });
  }, [entityOptions, selectedNodeTypeSelectorValue]);

  React.useEffect(() => {
    if (entityMode !== 'existente') return;
    if (!selectedExistingEntityId) return;

    const stillAvailable = filteredEntityOptions.some(
      (entidade) => String(entidade.id) === String(selectedExistingEntityId),
    );

    if (!stillAvailable) {
      setSelectedExistingEntityId('');
    }
  }, [
    entityMode,
    filteredEntityOptions,
    selectedExistingEntityId,
    setSelectedExistingEntityId,
  ]);

  const handleToggleNodeActive = (nodeId) => {
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
  };

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isTouchDevice ? 'auto' : 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isTouchDevice]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updateTouchMode = () => {
      setIsTouchDevice(mediaQuery.matches);
    };

    updateTouchMode();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateTouchMode);
      return () => mediaQuery.removeEventListener('change', updateTouchMode);
    }

    mediaQuery.addListener(updateTouchMode);
    return () => mediaQuery.removeListener(updateTouchMode);
  }, []);

  React.useEffect(() => {
    if (!isTouchDevice) return;

    setZoom((previousZoom) => (previousZoom === 1 ? 0.92 : previousZoom));
  }, [isTouchDevice]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const landscapeQuery = window.matchMedia('(orientation: landscape)');

    const updateLandscapeMode = () => {
      const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
      setIsMobileLandscape(landscapeQuery.matches && isCoarsePointer);
    };

    updateLandscapeMode();

    if (landscapeQuery.addEventListener) {
      landscapeQuery.addEventListener('change', updateLandscapeMode);
      window.addEventListener('resize', updateLandscapeMode);
      return () => {
        landscapeQuery.removeEventListener('change', updateLandscapeMode);
        window.removeEventListener('resize', updateLandscapeMode);
      };
    }

    landscapeQuery.addListener(updateLandscapeMode);
    window.addEventListener('resize', updateLandscapeMode);
    return () => {
      landscapeQuery.removeListener(updateLandscapeMode);
      window.removeEventListener('resize', updateLandscapeMode);
    };
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space') {
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleResetToDefault = React.useCallback(() => {
    if (isReadOnlyMode) return;
    setNodes((previous) =>
      previous.map((node, index) => {
        const nextPosition = getGridSlotPosition(index);
        return {
          ...node,
          x: nextPosition.x,
          y: nextPosition.y,
        };
      }),
    );

    setConnectorRevealMode('hover-side');
    setSelectedConnectionId('');
  }, [getGridSlotPosition, isReadOnlyMode]);

  React.useEffect(() => {
    if (hasNormalizedInitialLayoutRef.current) return;
    if (!viewportRef.current) return;
    if (nodes.length === 0) return;

    hasNormalizedInitialLayoutRef.current = true;
    setNodes((previous) =>
      previous.map((node, index) => {
        const nextPosition = getGridSlotPosition(index);
        return {
          ...node,
          x: nextPosition.x,
          y: nextPosition.y,
        };
      }),
    );
  }, [getGridSlotPosition, nodes.length]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateViewportWidth = () => {
      const nextWidth = viewport.clientWidth || 1200;
      setViewportGridWidth(nextWidth);
    };

    updateViewportWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportWidth);
      return () => window.removeEventListener('resize', updateViewportWidth);
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
        String(name || DEFAULT_BPMN_NAME || '').trim() || 'BPMN';

      const getNodeNome = (node) => {
        return String(
          node?.entidadeNome || node?.label || node?.subtitle || '',
        ).trim();
      };

      const getNodeDescricao = (node) => {
        return String(
          node?.descricao || node?.subtitle || 'Entidade gerada pelo BPMN',
        ).trim();
      };

      const dedupedEntities = new Map();
      (Array.isArray(resolvedNodes) ? resolvedNodes : []).forEach((node) => {
        if (node?.active === false) return;

        const normalizedType = String(node?.nodeType || '')
          .trim()
          .toLowerCase();

        if (normalizedType !== 'entidade') {
          return;
        }

        const nome = getNodeNome(node);
        const normalizedName = normalizeEntityName(nome);
        const rawEntityId =
          node?.entidadeId !== null && node?.entidadeId !== undefined
            ? String(node.entidadeId).trim()
            : '';
        const dedupeKey = rawEntityId
          ? `id:${rawEntityId}`
          : normalizedName
            ? `name:${normalizedName}`
            : '';

        if (!dedupeKey) return;

        dedupedEntities.set(dedupeKey, {
          rawEntityId,
          normalizedName,
          nome,
          payload: {
            nome,
            categoria: bpmnCategoryName,
            tipoEntidade:
              String(node?.tipoEntidade || '').trim() ||
              (node?.isPrimaryEntity === true ? 'Principal' : 'Apoio'),
            isPrimaryEntity: node?.isPrimaryEntity === true,
            descricao: getNodeDescricao(node),
            atributoChave: String(node?.atributoChave || '').trim(),
            ativo: true,
            criadoPor: actorAccountName,
          },
        });
      });

      if (dedupedEntities.size === 0) return;

      const existingById = new Map(
        (Array.isArray(entidades) ? entidades : [])
          .map((entidade) => [getEntidadeId(entidade), entidade])
          .filter(([id]) => id !== null && id !== undefined),
      );

      const existingByName = new Map(
        (Array.isArray(entidades) ? entidades : [])
          .map((entidade) => [
            normalizeEntityName(getEntidadeNome(entidade)),
            entidade,
          ])
          .filter(([key]) => Boolean(key)),
      );

      const token = getAuthToken();

      for (const entityCandidate of dedupedEntities.values()) {
        const { rawEntityId, normalizedName, payload } = entityCandidate;

        const existingByEntityId = rawEntityId
          ? existingById.get(rawEntityId)
          : null;
        const existingByEntityName = normalizedName
          ? existingByName.get(normalizedName)
          : null;
        const existing = existingByEntityId || existingByEntityName || null;

        const existingId = existing ? getEntidadeId(existing) : null;
        if (existingId !== null && existingId !== undefined) {
          await editarEntidade(existingId, payload, token);

          const mergedEntity = {
            ...existing,
            ...payload,
            id: existingId,
          };
          existingById.set(String(existingId), mergedEntity);
          if (normalizedName) {
            existingByName.set(normalizedName, mergedEntity);
          }
          continue;
        }

        const created = await adicionarEntidade(payload, token);
        if (created) {
          const createdId = getEntidadeId(created);
          if (createdId !== null && createdId !== undefined) {
            existingById.set(String(createdId), created);
          }
          if (normalizedName) {
            existingByName.set(normalizedName, created);
          }
        }
      }
    },
    [actorAccountName, adicionarEntidade, editarEntidade, entidades, name],
  );

  const handleSaveBpmn = React.useCallback(async () => {
    if (isReadOnlyMode) {
      setNoticeModal({
        open: true,
        title: 'Sem permissão',
        message:
          'Seu nível de acesso permite apenas visualização. Edição de BPMN está bloqueada.',
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
            node.nodeType === 'task'
              ? 'task'
              : node.nodeType === 'condicional'
                ? 'condicional'
                : 'entidade',
          entidadeId:
            resolvedEntityId !== null && resolvedEntityId !== undefined
              ? resolvedEntityId
              : null,
          entidadeNome: resolvedEntity
            ? getEntidadeNome(resolvedEntity)
            : String(node.entidadeNome || node.label || '').trim(),
        };
      });

      const hasConfiguredEntity = (node) => {
        if (!node) return false;
        if (node.nodeType === 'condicional' || node.nodeType === 'task') {
          return true;
        }

        const hasEntityId =
          node.entidadeId !== null && node.entidadeId !== undefined;
        if (hasEntityId) return true;

        const hasEntityName = Boolean(
          String(node.entidadeNome || node.label || '').trim(),
        );

        return hasEntityName;
      };

      const nodeWithoutEntity = resolvedNodes.find(
        (node) =>
          node.active !== false &&
          node.nodeType !== 'condicional' &&
          node.nodeType !== 'task' &&
          !hasConfiguredEntity(node),
      );

      if (nodeWithoutEntity) {
        const nodeDisplayName =
          String(
            nodeWithoutEntity.entidadeNome ||
              nodeWithoutEntity.label ||
              nodeWithoutEntity.subtitle ||
              '',
          ).trim() || `ID ${String(nodeWithoutEntity.id || '').trim()}`;

        setInvalidEntityNodeId(nodeWithoutEntity.id);
        setSelectedNodeId(nodeWithoutEntity.id);
        setIsSidebarHidden(false);
        setNoticeModal({
          open: true,
          title: 'Entidade obrigatória',
          message: `O bloco "${nodeDisplayName}" está ativo e ainda não possui entidade vinculada/configurada.`,
        });
        return;
      }
      const hasEntityIdUpgrade = resolvedNodes.some(
        (node, index) =>
          String(node.entidadeId ?? '') !==
          String(nodes[index]?.entidadeId ?? ''),
      );

      if (hasEntityIdUpgrade) {
        setNodes(resolvedNodes);
      }

      const persistedNodes = resolvedNodes.map(sanitizeNodeForPersistence);
      const persistedConnections = connections.map(
        sanitizeConnectionForPersistence,
      );

      setInvalidEntityNodeId('');

      const explicitPrimaryNodeWithEntity = resolvedNodes.find(
        (node) =>
          node.active !== false &&
          node.nodeType !== 'condicional' &&
          node.nodeType !== 'task' &&
          node.isPrimaryEntity === true &&
          node.entidadeId !== null &&
          node.entidadeId !== undefined,
      );

      const firstActiveNodeWithEntity = resolvedNodes.find(
        (node) =>
          node.active !== false &&
          node.nodeType !== 'condicional' &&
          node.nodeType !== 'task' &&
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
        : '';
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
          if (parsedMap && typeof parsedMap === 'object') {
            savedOpportunityBySlug = parsedMap;
          }
        }
      } catch (error) {}

      const originalBpmnSlug = String(bpmnSlug || '').trim();
      const savedOpportunityId =
        Number(
          savedOpportunityBySlug[currentBpmnSlug] ||
            (originalBpmnSlug ? savedOpportunityBySlug[originalBpmnSlug] : 0) ||
            0,
        ) || null;

      const opportunitiesPage = await fetchOpportunitiesPage({
        page: 1,
        limit: 500,
        token: getAuthToken(),
      });

      const allOpportunities = Array.isArray(opportunitiesPage?.data)
        ? opportunitiesPage.data
        : [];

      const existingOpportunity = savedOpportunityId
        ? allOpportunities.find(
            (item) => Number(item?.id) === Number(savedOpportunityId),
          ) || null
        : null;

      const token = window.localStorage.getItem('token');
      const { url, options } = BPMN_EDITOR_STATE_PUT(
        {
          name,
          nodes: persistedNodes,
          connections: persistedConnections,
        },
        token,
      );

      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error('Falha ao salvar BPMN');
      }

      const buildNodeLabel = (node) => {
        if (!node) return 'Etapa';
        if (node?.nodeType === 'task') {
          return String(node?.taskNome || '').trim() || 'Atividade';
        }
        if (node?.nodeType === 'condicional') {
          return String(node?.condicionalNome || '').trim() || 'Condicional';
        }
        return String(node?.entidadeNome || '').trim() || 'Entidade';
      };

      const getNodeMapByType = (nodes = [], nodeType = 'entidade') => {
        const map = new Map();

        (Array.isArray(nodes) ? nodes : []).forEach((node) => {
          if (node?.active === false) return;

          const isEntity =
            nodeType === 'entidade' &&
            node?.nodeType !== 'task' &&
            node?.nodeType !== 'condicional';
          const isTask = nodeType === 'task' && node?.nodeType === 'task';
          const isConditional =
            nodeType === 'condicional' && node?.nodeType === 'condicional';

          if (!isEntity && !isTask && !isConditional) return;

          const id = String(node?.id || '').trim();
          if (!id) return;

          const label = buildNodeLabel(node);
          const fingerprint =
            nodeType === 'task'
              ? `${String(node?.taskNome || '').trim()}|${String(node?.taskDescricao || '').trim()}`
              : nodeType === 'condicional'
                ? `${String(node?.condicionalNome || '').trim()}|${String(node?.condicionalDescricao || '').trim()}`
                : `${String(node?.entidadeId ?? '')}|${String(node?.entidadeNome || '').trim()}`;

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

      const previousNodes = Array.isArray(existingOpportunity?.bpmn?.nodes)
        ? existingOpportunity.bpmn.nodes
        : [];
      const previousConnections = Array.isArray(
        existingOpportunity?.bpmn?.connections,
      )
        ? existingOpportunity.bpmn.connections
        : [];

      const previousEntityMap = getNodeMapByType(previousNodes, 'entidade');
      const nextEntityMap = getNodeMapByType(persistedNodes, 'entidade');
      const entityDiff = computeNodeDiffNames(previousEntityMap, nextEntityMap);

      const existingTimelineItemsRaw = Array.isArray(
        existingOpportunity?.timelineItems,
      )
        ? existingOpportunity.timelineItems
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
          if (!item || typeof item !== 'object') return;

          const autoKey = String(item?.autoKey || '').trim();
          const source = String(item?.source || '').trim();
          const idValue = String(item?.id || '').trim();
          const title = String(item?.title || '').trim();
          const time = String(item?.time || '').trim();

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

      const nowTime = new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const nowTimestamp = new Date().toISOString();

      const timelineGeneratedItems = [];
      const noteIdBase = Date.now() + Math.floor(Math.random() * 1000);
      let noteIdOffset = 0;

      const getTypeLabel = (node) => {
        if (node?.nodeType === 'task') return 'Atividade';
        if (node?.nodeType === 'condicional') return 'Condicional';
        return 'Entidade';
      };

      const getWrittenText = (node) => {
        if (node?.nodeType === 'task') {
          return String(node?.taskDescricao || node?.taskNome || '').trim();
        }
        if (node?.nodeType === 'condicional') {
          return String(
            node?.condicionalDescricao || node?.condicionalNome || '',
          ).trim();
        }
        return String(node?.entidadeNome || '').trim();
      };

      const orderedActiveNodes = [...persistedNodes]
        .filter((node) => node?.active !== false)
        .sort((nodeA, nodeB) => {
          const xDiff = (Number(nodeA?.x) || 0) - (Number(nodeB?.x) || 0);
          if (xDiff !== 0) return xDiff;

          const yDiff = (Number(nodeA?.y) || 0) - (Number(nodeB?.y) || 0);
          if (yDiff !== 0) return yDiff;

          return String(nodeA?.id || '').localeCompare(String(nodeB?.id || ''));
        });

      const orderedActiveNodeEntries = orderedActiveNodes.map((node, index) => {
        const typeLabel = getTypeLabel(node);
        const label = buildNodeLabel(node);
        const writtenText = getWrittenText(node) || '-';
        return {
          id: String(node?.id || ''),
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

          return String(nodeA?.id || '').localeCompare(String(nodeB?.id || ''));
        })
        .map((node, index) => {
          const typeLabel = getTypeLabel(node);
          const label = buildNodeLabel(node);
          const writtenText = getWrittenText(node) || '-';
          return {
            id: String(node?.id || ''),
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
        title: savedOpportunityId ? 'BPMN atualizado' : 'BPMN criado',
        description: `Nós ${previousNodes.length}→${persistedNodes.length} | Conexões ${previousConnections.length}→${persistedConnections.length}`,
        time: nowTime,
        timestamp: nowTimestamp,
        actor: actorAccountName,
        actorId: actorAccountId,
        autoGenerated: true,
        source: 'bpmn-save',
        actionType: savedOpportunityId ? 'update' : 'create',
        elementType: 'bpmn',
        itemName: name || DEFAULT_BPMN_NAME,
        before: `Nós ${previousNodes.length} | Conexões ${previousConnections.length}`,
        after: `Nós ${persistedNodes.length} | Conexões ${persistedConnections.length}`,
      });
      noteIdOffset += 1;

      const formatEntrySummary = (entry) => {
        if (!entry) return '—';
        return `${entry.label} - ${entry.typeLabel} (ordem ${entry.order})`;
      };

      const pushEntityEntryNote = ({
        title,
        beforeEntry = null,
        afterEntry = null,
        actionType = 'update',
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
          source: 'bpmn-save',
          actionType,
          elementType: 'elemento-bpmn',
          itemName:
            String(afterEntry?.label || beforeEntry?.label || '').trim() ||
            'Elemento BPMN',
          before: formatEntrySummary(beforeEntry),
          after: formatEntrySummary(afterEntry),
        });
        noteIdOffset += 1;
      };

      if (!savedOpportunityId) {
        orderedActiveNodeEntries.forEach((entry) => {
          pushEntityEntryNote({
            title: `${entry.label} foi adicionada`,
            beforeEntry: null,
            afterEntry: entry,
            actionType: 'create',
          });
        });
      } else {
        createdEntries.forEach((entry) => {
          pushEntityEntryNote({
            title: `${entry.label} foi adicionada`,
            beforeEntry: null,
            afterEntry: entry,
            actionType: 'create',
          });
        });

        modifiedEntries.forEach((entry) => {
          const previousEntry = previousEntriesById.get(entry.id) || null;
          pushEntityEntryNote({
            title: `${entry.label} foi atualizada`,
            beforeEntry: previousEntry,
            afterEntry: entry,
            actionType: 'update',
          });
        });

        removedEntries.forEach((entry) => {
          pushEntityEntryNote({
            title: `${entry.label} foi removida`,
            beforeEntry: entry,
            afterEntry: null,
            actionType: 'delete',
          });
        });
      }

      const normalizedCurrentName = normalizeBpmnName(
        name || DEFAULT_BPMN_NAME,
      );
      const duplicated = allOpportunities.find((item) => {
        const itemName = item?.name || item?.nome || '';
        const sameName = normalizeBpmnName(itemName) === normalizedCurrentName;
        if (!sameName) return false;

        if (!savedOpportunityId) return true;
        return Number(item?.id) !== Number(savedOpportunityId);
      });

      if (duplicated) {
        setNoticeModal({
          open: true,
          title: 'Nome duplicado',
          message: 'Já existe um BPMN com esse nome na tabela.',
        });
        return;
      }

      await syncBpmnNodesToEntidadesCatalog(resolvedNodes);

      const opportunityPayload = {
        nome: name || DEFAULT_BPMN_NAME,
        name: name || DEFAULT_BPMN_NAME,
        status: 'Prospecção',
        stageIndex: 0,
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
        source: 'bpmn-create',
        bpmn: {
          nodes: persistedNodes,
          connections: persistedConnections,
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

      if (savedOpportunityId) {
        await updateOpportunityById({
          opportunityId: savedOpportunityId,
          payload: {
            ...(existingOpportunity || {}),
            ...opportunityPayload,
            id: savedOpportunityId,
          },
          token: getAuthToken(),
        });

        savedOpportunityBySlug = {
          ...savedOpportunityBySlug,
          [currentBpmnSlug]: savedOpportunityId,
          ...(originalBpmnSlug
            ? { [originalBpmnSlug]: savedOpportunityId }
            : {}),
        };

        window.localStorage.setItem(
          BPMN_EDITOR_SAVED_OPPORTUNITY_MAP_KEY,
          JSON.stringify(savedOpportunityBySlug),
        );
      } else {
        const createdOpportunityResponse = await createOpportunity({
          payload: opportunityPayload,
          token: getAuthToken(),
        });
        const createdOpportunity = await createdOpportunityResponse.json();

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
        window.localStorage.setItem(
          BPMN_EDITOR_LOCAL_STORAGE_KEY,
          JSON.stringify({
            ...currentDraftRef.current,
            pendingTimelineItems: [],
            updated_at: new Date().toISOString(),
          }),
        );
      } catch (error) {}
    } catch (error) {
      setNoticeModal({
        open: true,
        title: 'Falha ao salvar',
        message: 'Não foi possível salvar o BPMN agora.',
      });
    } finally {
      setIsSavingBpmn(false);

      if (saveSucceeded) {
        navigate('/gerar-bpmn');
      }
    }
  }, [
    bpmnSlug,
    connections,
    actorAccountId,
    actorAccountName,
    entidadesById,
    isReadOnlyMode,
    name,
    navigate,
    nodes,
    resolveEntityIdFromNode,
    syncBpmnNodesToEntidadesCatalog,
  ]);

  React.useEffect(() => {
    let isMounted = true;
    const isCreateMode = !bpmnSlug;

    const loadSavedBpmn = async () => {
      if (isCreateMode) {
        if (isMounted) {
          hasHydratedBpmnRef.current = true;
          setIsLoadingBpmn(false);
        }
        return;
      }

      let loadedFromLocalStorage = false;

      try {
        const localDraftRaw = window.localStorage.getItem(
          BPMN_EDITOR_LOCAL_STORAGE_KEY,
        );

        if (localDraftRaw) {
          const localDraft = JSON.parse(localDraftRaw);

          if (localDraft && typeof localDraft === 'object') {
            const localDraftSlug = slugifyBpmnName(localDraft.name || '');
            if (localDraftSlug !== bpmnSlug) {
              throw new Error('Rascunho local não corresponde ao BPM atual');
            }

            if (typeof localDraft.name === 'string') {
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
        const token = window.localStorage.getItem('token');
        const { url, options } = BPMN_EDITOR_STATE_GET(token);
        const response = await fetch(url, options);

        if (!response.ok) {
          throw new Error('Falha ao carregar BPMN');
        }

        const data = await response.json();
        if (!isMounted || !data || typeof data !== 'object') return;

        if (typeof data.name === 'string') {
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
  }, [bpmnSlug]);

  React.useEffect(() => {
    currentDraftRef.current = {
      name,
      nodes,
      connections,
    };
  }, [connections, name, nodes]);

  React.useEffect(() => {
    const handleBeforeUnload = () => {
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
      } catch (error) {}
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  React.useEffect(() => {
    if (hasAutoFocusedRef.current) return;
    if (nodes.length === 0) return;
    if (!viewportRef.current) return;

    hasAutoFocusedRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        centerOnNodes();
      });
    });
  }, [centerOnNodes, nodes.length]);

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

    viewport.addEventListener('wheel', handleViewportWheel, {
      passive: false,
    });

    return () => {
      viewport.removeEventListener('wheel', handleViewportWheel);
    };
  }, [handleViewportWheel]);

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
    const clickedConnector = event.target?.closest?.('[data-connector-handle]');
    const isTouchPointer =
      event.pointerType === 'touch' || event.pointerType === 'pen';

    const shouldPanWithTouch =
      isTouchPointer && !clickedNode && !clickedConnector;

    const shouldPanWithMouse =
      event.button === 1 ||
      event.button === 2 ||
      (event.button === 0 && (isSpacePressed || !clickedNode));

    const shouldPan = shouldPanWithTouch || shouldPanWithMouse;
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

      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
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

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopPan);
    window.addEventListener('pointercancel', stopPan);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopPan);
      window.removeEventListener('pointercancel', stopPan);
    };
  }, [isPanning]);

  const handleViewportKeyDown = React.useCallback(
    (event) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const key = event.key.toLowerCase();
      const panStep = event.shiftKey ? 160 : 80;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (isReadOnlyMode) return;
        if (selectedConnectionId || selectedNodeId) {
          event.preventDefault();
          requestDeleteSelection();
        }
        return;
      }

      if (event.key === 'ArrowLeft' || key === 'a') {
        event.preventDefault();
        viewport.scrollLeft -= panStep;
        return;
      }

      if (event.key === 'ArrowRight' || key === 'd') {
        event.preventDefault();
        viewport.scrollLeft += panStep;
        return;
      }

      if (event.key === 'ArrowUp' || key === 'w') {
        event.preventDefault();
        viewport.scrollTop -= panStep;
        return;
      }

      if (event.key === 'ArrowDown' || key === 's') {
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
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        targetTag === 'select' ||
        event.target?.isContentEditable;
      if (isTypingField) return;

      handleViewportKeyDown(event);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
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

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
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
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      setIsTutorialLayoutReady(true);
      return;
    }

    const target = document.querySelector(currentStep.selector);
    if (!target) {
      setTutorialSpotlight(null);
      setTutorialPopoverStyle({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
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

      if (placement === 'left') {
        rawLeft = spotlightRect.left - cardWidth - gap;
        rawTop = spotlightRect.top + spotlightRect.height / 2 - cardHeight / 2;
      } else if (placement === 'right') {
        rawLeft = spotlightRect.left + spotlightRect.width + gap;
        rawTop = spotlightRect.top + spotlightRect.height / 2 - cardHeight / 2;
      } else if (placement === 'top') {
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

    const preferredPlacement = String(currentStep?.popoverPlacement || '');
    const placementOrder = [
      preferredPlacement || 'bottom',
      'right',
      'left',
      'top',
      'bottom',
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
      transform: 'none',
    });
    setIsTutorialLayoutReady(true);
  }, [activeTutorialSteps, isTutorialOpen, tutorialStepIndex]);

  React.useEffect(() => {
    if (!isTutorialOpen) return;

    const currentStep = activeTutorialSteps[tutorialStepIndex];
    const isSidebarStep = String(currentStep?.id || '').startsWith('sidebar');
    if (isSidebarStep) {
      if (isSidebarHidden) {
        setIsSidebarHidden(false);
      }

      if (selectedConnectionId) {
        setSelectedConnectionId('');
      }

      if (!selectedNodeId && Array.isArray(nodes) && nodes.length > 0) {
        setSelectedNodeId(nodes[0].id);
      }

      if (activeSidebarTab !== 'entidade') {
        setActiveSidebarTab('entidade');
      }
    }

    setIsTutorialLayoutReady(false);
    const target = currentStep?.selector
      ? document.querySelector(currentStep.selector)
      : null;

    if (target) {
      target.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'center',
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
      if (event.key === 'Escape') {
        closeTutorial();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleNextTutorialStep();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlePreviousTutorialStep();
      }
    };

    const handleWindowUpdate = () => {
      updateTutorialLayout();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleWindowUpdate);
    window.addEventListener('scroll', handleWindowUpdate, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleWindowUpdate);
      window.removeEventListener('scroll', handleWindowUpdate, true);
    };
  }, [
    closeTutorial,
    handleNextTutorialStep,
    handlePreviousTutorialStep,
    isTutorialOpen,
    updateTutorialLayout,
  ]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const body = document.body;
    if (!body) return undefined;

    if (isTutorialOpen) {
      body.dataset.bpmnTutorialOpen = 'true';
      body.dataset.bpmnTutorialStep = String(
        activeTutorialSteps[tutorialStepIndex]?.id || '',
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
          <button
            type="button"
            className={`${styles.secondaryButton} ${styles.orientationLockButton}`}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          >
            Já girei • Atualizar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.container}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h1 className={styles.title}>Editor BPMN</h1>
          <input
            className={styles.nameInput}
            data-tutorial-id="process-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isReadOnlyMode}
            placeholder="Nome do processo"
          />
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
              className={`${styles.secondaryButton} ${styles.iconActionButton} ${isCanvasFullscreen ? styles.iconActionButtonActive : ''}`}
              data-tutorial-id="fullscreen-toggle"
              onClick={handleToggleCanvasFullscreen}
              aria-pressed={isCanvasFullscreen}
              aria-label={
                isCanvasFullscreen ? 'Sair da tela cheia' : 'Tela cheia'
              }
              title={isCanvasFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              ⛶
            </button>
          </div>
        </div>

        <div className={styles.topbarCenter}>
          <div className={styles.topbarCenterActions}>
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.tutorialButton}`}
              data-tutorial-id="save-bpmn"
              onClick={handleSaveBpmn}
              disabled={isReadOnlyMode || isSavingBpmn || isLoadingBpmn}
              aria-label="Salvar BPMN"
              title="Salvar BPMN"
            >
              {isSavingBpmn ? 'SALVANDO...' : 'SALVAR'}
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
            className={`${styles.secondaryButton} ${styles.iconActionButton} ${isZoomBetweenLimits ? styles.iconActionButtonActive : ''}`}
            data-tutorial-id="zoom-toggle"
            onClick={() => applyZoomStep(zoomButtonDirection)}
            aria-label={
              zoomButtonDirection < 0 ? 'Diminuir zoom' : 'Aumentar zoom'
            }
            title={zoomButtonDirection < 0 ? 'Diminuir zoom' : 'Aumentar zoom'}
          >
            {zoomButtonDirection < 0 ? '−' : '+'}
          </button>
          <button
            type="button"
            className={`${styles.secondaryButton} ${styles.iconActionButton} ${isPropertiesPinned ? styles.iconActionButtonActive : ''}`}
            data-tutorial-id="properties-toggle"
            onClick={handleTogglePropertiesPinned}
            aria-pressed={isPropertiesPinned}
            disabled={!hasSelection}
            aria-label={
              isPropertiesPinned
                ? 'Desligar propriedades fixas'
                : 'Ligar propriedades fixas'
            }
            title={
              isPropertiesPinned
                ? 'Desligar propriedades fixas'
                : 'Ligar propriedades fixas'
            }
          >
            ▤
          </button>
        </div>
      </header>

      <div
        className={`${styles.workspace} ${
          isCanvasFullscreen ? styles.workspaceFullscreen : ''
        } ${shouldHideProperties ? styles.sidebarHidden : ''} ${
          isTouchDevice ? styles.workspaceTouch : ''
        }`}
        ref={workspaceFullscreenRef}
      >
        {isTouchDevice ? (
          <button
            type="button"
            className={styles.mobileSidebarToggle}
            onClick={handleTogglePropertiesPinned}
            aria-pressed={isPropertiesPinned}
            disabled={!hasSelection}
            aria-label={
              isPropertiesPinned
                ? 'Desligar painel de propriedades fixo'
                : 'Ligar painel de propriedades fixo'
            }
          >
            {isPropertiesPinned
              ? '▤ Desligar propriedades fixas'
              : '▤ Ligar propriedades fixas'}
          </button>
        ) : null}
        {isCanvasFullscreen ? (
          <button
            type="button"
            className={`${styles.secondaryButton} ${styles.iconActionButton} ${styles.canvasOverlayFullscreenButton} ${styles.iconActionButtonActive}`}
            onClick={handleToggleCanvasFullscreen}
            aria-pressed={isCanvasFullscreen}
            aria-label="Sair da tela cheia"
            title="Sair da tela cheia"
          >
            ⛶
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
            className={`${styles.canvasViewport} ${isPanning ? styles.panning : ''}`}
            data-tutorial-id="canvas-viewport"
            ref={viewportRef}
            onPointerDown={handleViewportPointerDown}
            style={{
              touchAction: isTouchDevice
                ? isPanning
                  ? 'none'
                  : 'pan-x pan-y'
                : 'auto',
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
                setSelectedNodeId('');
                setSelectedConnectionId('');
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
                transformOrigin: 'top left',
              }}
            >
              <BpmnFlow
                nodes={nodesForCanvas}
                connections={connections}
                currentIndex={-1}
                onStageChange={() => {}}
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
                        : ''
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
                      'canvas-minimap'
                      ? styles.miniMapCenterButtonMuted
                      : ''
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
          className={isTouchDevice ? styles.contextSidebarTopMenu : ''}
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
              pointerEvents: isTutorialLayoutReady ? 'auto' : 'none',
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
                {activeTutorialSteps[tutorialStepIndex]?.title || 'Tutorial'}
              </h3>
              <p className={styles.tutorialPopoverStepDescription}>
                {activeTutorialSteps[tutorialStepIndex]?.description ||
                  'Siga os passos para conhecer o editor.'}
              </p>

              <p className={styles.tutorialPopoverHint}>
                {activeTutorialSteps[tutorialStepIndex]?.hint ||
                  'Dica: use as setas ← e → para navegar entre as etapas do tutorial.'}
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
            setPendingDecisionConnectionId('');
            setDecisionPromptCustomValue('');
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
              value={decisionPromptCustomValue}
              onChange={(event) =>
                setDecisionPromptCustomValue(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
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
                onClick={() => handleDecisionPromptChoice('nao')}
              >
                Não (✕)
              </button>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.decisionYesButton}`}
                onClick={() => handleDecisionPromptChoice('sim')}
              >
                Sim (✓)
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={!String(decisionPromptCustomValue || '').trim()}
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
              checked={disableCreateNodeConnectionPromptDraft}
              onChange={(event) =>
                setDisableCreateNodeConnectionPromptDraft(event.target.checked)
              }
            />
            Não quero receber essa mensagem novamente neste BPMN.
          </label>
        </Close>
      ) : null}

      {deleteSuggestedEntityDraft ? (
        <Close
          title="Deletar entidade"
          message={`Deseja realmente deletar a entidade "${getEntidadeNome(deleteSuggestedEntityDraft) || 'selecionada'}"?`}
          onConfirm={handleConfirmDeleteSuggestedEntity}
          onCancel={handleCancelDeleteSuggestedEntity}
          confirmLabel="Deletar"
        >
          <label className={styles.createNodePromptCheckboxRow}>
            <input
              type="checkbox"
              checked={disableDeleteSuggestedEntityPromptDraft}
              onChange={(event) =>
                setDisableDeleteSuggestedEntityPromptDraft(event.target.checked)
              }
            />
            Não quero receber essa mensagem novamente neste BPMN.
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
              checked={disableDeleteSelectionPromptDraft}
              onChange={(event) =>
                setDisableDeleteSelectionPromptDraft(event.target.checked)
              }
            />
            Não quero receber essa mensagem novamente neste BPMN.
          </label>
        </Close>
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
