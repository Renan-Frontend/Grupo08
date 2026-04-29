import React from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import styles from "./Entidades.module.css";
import Pagination from "../Common/Pagination";
import { useBpmnOpportunities } from "../../Hooks/useBpmnOpportunities";
import {
  deleteOpportunityById,
  getAuthToken,
} from "../Opportunities/opportunityApi";
import { API_URL } from "../../Api";
import {
  ENTIDADE_FIELD_TYPES,
  EntidadesContext,
} from "../../Context/EntidadesContext";
import { UserContext } from "../../Context/UserContext";
import {
  canCreateByAccessLevel,
  canDeleteByAccessLevel,
  isEditOnlyAccessLevelTwo,
  isReadOnlyAccessLevelOne,
} from "../../Utils/accessControl";
import Close from "../Helper/Close";
import {
  buildBpmnFieldsByEntityKey,
  buildBpmnUsageCountByEntityKey,
  buildTableSections,
  formatDateTimeLabel,
  getEntidadeId,
  getEntityTypeLabel,
  getFieldKeyLabel,
  getFieldRelationshipLabel,
  getOpportunityName,
  mergeEntityFields,
  normalizeText,
  toEntitySlug,
} from "./helpers/entidadesSelectors";
import EntityCard from "./components/EntityCard";
import EntityFieldsDrawer from "./components/EntityFieldsDrawer";

const TABS = [
  { id: "processos", label: "Por Processo BPMN" },
  { id: "catalogo", label: "Entidades" },
  { id: "atividades", label: "Atividades" },
  { id: "condicionais", label: "Condicionais" },
];

const EMPTY_BPMN_FORM = {
  nome: "",
  tipo: "",
  obrigatorio: "",
  keyType: "",
  referencia: "",
};

const Entidades = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { entidadeSlug = "", entidadeId: entidadeIdFromRoute = "" } =
    useParams();

  const {
    entidades: entidadesRaw,
    loading: entidadesLoading,
    error: entidadesError,
    refetchEntidades,
    deletarEntidade,
    deletarCampo,
    editarCampoEntidade,
    adicionarCampoEntidade,
  } = React.useContext(EntidadesContext);
  const { user } = React.useContext(UserContext);

  // Always refetch when entering the page to avoid stale in-memory cache.
  React.useEffect(() => {
    refetchEntidades().catch(() => {});
  }, [refetchEntidades]);

  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const isEditOnlyMode = isEditOnlyAccessLevelTwo(user);
  const canCreate = canCreateByAccessLevel(user);
  const canDelete = canDeleteByAccessLevel(user);

  const entidades = React.useMemo(
    () => (Array.isArray(entidadesRaw) ? entidadesRaw : []),
    [entidadesRaw],
  );

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState("processos");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [drawerEntityId, setDrawerEntityId] = React.useState(null);
  const [paginasPorTabela, setPaginasPorTabela] = React.useState({});
  const itemsPorPagina = 11;
  const [deleteConfirm, setDeleteConfirm] = React.useState(null);
  const [deleteTabelaConfirm, setDeleteTabelaConfirm] = React.useState(null);
  const [skipDeleteEntidadeConfirm, setSkipDeleteEntidadeConfirm] =
    React.useState(false);
  const [
    disableDeleteEntidadePromptDraft,
    setDisableDeleteEntidadePromptDraft,
  ] = React.useState(false);
  const [campoEmEdicao, setCampoEmEdicao] = React.useState(null);
  const [campoConfigForm, setCampoConfigForm] = React.useState({
    nome: "",
    tipo: "",
    obrigatorio: "",
    keyType: "",
    referencia: "",
  });
  const [camposConfigError, setCamposConfigError] = React.useState("");
  const [drawerBpmnNode, setDrawerBpmnNode] = React.useState(null);
  const [deleteBpmnNodeConfirm, setDeleteBpmnNodeConfirm] =
    React.useState(null);
  const [bpmnCampoEmEdicao, setBpmnCampoEmEdicao] = React.useState(null);
  const [bpmnCampoConfigForm, setBpmnCampoConfigForm] = React.useState({
    nome: "",
    tipo: "",
    obrigatorio: "",
    keyType: "",
    referencia: "",
  });
  const [bpmnCamposError, setBpmnCamposError] = React.useState("");

  // ── Catálogo preservado de tasks/condicionais (sobrevivem à deleção do BPMN) ──
  const [preservedTasksCatalog, setPreservedTasksCatalog] = React.useState([]);
  const [preservedCondicionaisCatalog, setPreservedCondicionaisCatalog] =
    React.useState([]);

  React.useEffect(() => {
    const token = getAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch(`${API_URL}/api/bpmn-catalog/tasks`, { headers }).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`${API_URL}/api/bpmn-catalog/condicionais`, { headers }).then(
        (r) => (r.ok ? r.json() : []),
      ),
    ])
      .then(([tasks, conds]) => {
        setPreservedTasksCatalog(Array.isArray(tasks) ? tasks : []);
        setPreservedCondicionaisCatalog(Array.isArray(conds) ? conds : []);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    const saved =
      window.localStorage.getItem("entidades:skipDeleteEntidadeConfirm") ===
      "true";
    setSkipDeleteEntidadeConfirm(saved);
  }, []);

  // Handle incoming deep links
  const entityIdFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return String(params.get("entidadeId") || "").trim() || null;
  }, [location.search]);

  React.useEffect(() => {
    const targetId =
      String(entidadeIdFromRoute || "").trim() || entityIdFromQuery;
    if (targetId) {
      setDrawerEntityId(targetId);
      return;
    }
    if (entidadeSlug) {
      const slug = toEntitySlug(entidadeSlug);
      const matched = entidades.find((e) => toEntitySlug(e?.nome) === slug);
      if (matched) setDrawerEntityId(String(getEntidadeId(matched) ?? ""));
    }
  }, [entidadeIdFromRoute, entityIdFromQuery, entidadeSlug, entidades]);

  // Always keep drawer entity fresh from context
  const drawerEntity = React.useMemo(() => {
    if (!drawerEntityId) return null;
    return (
      entidades.find((e) => String(getEntidadeId(e)) === drawerEntityId) ?? null
    );
  }, [drawerEntityId, entidades]);

  // Reset field form when drawer entity changes
  React.useEffect(() => {
    setCamposConfigError("");
    setCampoEmEdicao(null);
    setCampoConfigForm({
      nome: "",
      tipo: "",
      obrigatorio: "",
      keyType: "",
      referencia: "",
    });
  }, [drawerEntityId]);

  // ── BPMN-derived data ─────────────────────────────────────────────────────
  const {
    opportunities: bpmnOpportunities,
    removeOpportunity,
    updateOpportunityData,
  } = useBpmnOpportunities();

  const bpmnSectionNames = React.useMemo(() => {
    const safe = Array.isArray(bpmnOpportunities) ? bpmnOpportunities : [];
    const used = new Set();
    const ordered = [];
    safe.forEach((opp) => {
      const name = getOpportunityName(opp);
      const key = normalizeText(name);
      if (!key || used.has(key)) return;
      used.add(key);
      ordered.push(name);
    });
    return ordered;
  }, [bpmnOpportunities]);

  const tableSections = React.useMemo(
    () => buildTableSections({ entidades, bpmnSectionNames }),
    [bpmnSectionNames, entidades],
  );

  const bpmnFieldsByEntityKey = React.useMemo(
    () => buildBpmnFieldsByEntityKey(bpmnOpportunities),
    [bpmnOpportunities],
  );

  const bpmnUsageCountByEntityKey = React.useMemo(
    () => buildBpmnUsageCountByEntityKey(bpmnOpportunities),
    [bpmnOpportunities],
  );

  const getMergedEntityFields = React.useCallback(
    (entidade) => mergeEntityFields({ entidade, bpmnFieldsByEntityKey }),
    [bpmnFieldsByEntityKey],
  );

  const getEntityFieldCount = React.useCallback(
    (item) => getMergedEntityFields(item).length,
    [getMergedEntityFields],
  );

  const getEntityBpmnUsageCount = React.useCallback(
    (item) => {
      const id = item?.id ?? item?._id ?? null;
      const name = item?.nome || item?.name || item?.titulo || "";
      const keys = [
        id !== null && id !== undefined && String(id).trim()
          ? `id:${String(id).trim()}`
          : null,
        normalizeText(name) ? `name:${normalizeText(name)}` : null,
      ].filter(Boolean);
      if (keys.length === 0) return 0;
      return keys.reduce(
        (hi, k) => Math.max(hi, bpmnUsageCountByEntityKey.get(k) || 0),
        0,
      );
    },
    [bpmnUsageCountByEntityKey],
  );

  // ── Header stats ──────────────────────────────────────────────────────────
  const totalFields = React.useMemo(
    () => entidades.reduce((acc, e) => acc + getEntityFieldCount(e), 0),
    [entidades, getEntityFieldCount],
  );

  // ── BPMN task / condicional catalog ───────────────────────────────────────
  const bpmnTaskCatalog = React.useMemo(() => {
    const seen = new Set();
    const nodes = [];
    (Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []).forEach(
      (opp) => {
        const bpmnNodes = Array.isArray(opp?.bpmn?.nodes) ? opp.bpmn.nodes : [];
        let taskCount = 0;
        bpmnNodes.forEach((node) => {
          if (node?.nodeType !== "task") return;
          const nome = String(node?.taskNome || node?.label || "").trim();
          if (!nome) return;
          const oppId = String(opp?.id ?? opp?._id ?? "");
          // Dedup within each opportunity, not globally across all opportunities
          const key = `${oppId}|${normalizeText(nome)}`;
          if (seen.has(key)) return;
          seen.add(key);
          nodes.push({
            ...node,
            _oppId: opp?.id ?? opp?._id,
            _oppName: getOpportunityName(opp),
            _oppSlug:
              String(getOpportunityName(opp) || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "") || "novo-bpmn",
          });
          taskCount++;
        });
        if (taskCount > 0) {
        }
      },
    );

    // Adicionar entradas preservadas cujo BPMN foi deletado
    const liveOppIds = new Set(
      (Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []).map((opp) =>
        String(opp?.id ?? opp?._id ?? ""),
      ),
    );
    preservedTasksCatalog.forEach((node) => {
      const oppId = String(node._oppId ?? "");
      if (liveOppIds.has(oppId)) return; // BPMN ainda existe, já está no catálogo acima
      const nome = String(node?.taskNome || node?.label || "").trim();
      const key = `${oppId}|${normalizeText(nome)}`;
      if (seen.has(key)) return;
      seen.add(key);
      nodes.push(node);
    });

    return nodes;
  }, [bpmnOpportunities, preservedTasksCatalog]);

  const bpmnCondicionalCatalog = React.useMemo(() => {
    const seen = new Set();
    const nodes = [];
    (Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []).forEach(
      (opp) => {
        const bpmnNodes = Array.isArray(opp?.bpmn?.nodes) ? opp.bpmn.nodes : [];
        bpmnNodes.forEach((node) => {
          if (node?.nodeType !== "condicional") return;
          const nome = String(
            node?.condicionalNome || node?.label || "",
          ).trim();
          if (!nome) return;
          const oppId = String(opp?.id ?? opp?._id ?? "");
          // Dedup within each opportunity, not globally across all opportunities
          const key = `${oppId}|${normalizeText(nome)}`;
          if (seen.has(key)) return;
          seen.add(key);
          nodes.push({
            ...node,
            _oppId: opp?.id ?? opp?._id,
            _oppName: getOpportunityName(opp),
            _oppSlug:
              String(getOpportunityName(opp) || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "") || "novo-bpmn",
          });
        });
      },
    );

    // Adicionar entradas preservadas cujo BPMN foi deletado
    const liveOppIds = new Set(
      (Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []).map((opp) =>
        String(opp?.id ?? opp?._id ?? ""),
      ),
    );
    preservedCondicionaisCatalog.forEach((node) => {
      const oppId = String(node._oppId ?? "");
      if (liveOppIds.has(oppId)) return; // BPMN ainda existe, já está no catálogo acima
      const nome = String(node?.condicionalNome || node?.label || "").trim();
      const key = `${oppId}|${normalizeText(nome)}`;
      if (seen.has(key)) return;
      seen.add(key);
      nodes.push(node);
    });

    return nodes;
  }, [bpmnOpportunities, preservedCondicionaisCatalog]);

  const bpmnLinkedCount = React.useMemo(
    () => entidades.filter((e) => getEntityBpmnUsageCount(e) > 0).length,
    [entidades, getEntityBpmnUsageCount],
  );

  // ── BPMN nodes grouped by process name ───────────────────────────────────
  const bpmnTasksByProcess = React.useMemo(() => {
    const map = new Map();
    bpmnTaskCatalog.forEach((node) => {
      const key = normalizeText(node._oppName || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(node);
    });
    return map;
  }, [bpmnTaskCatalog]);

  const bpmnCondicionalsByProcess = React.useMemo(() => {
    const map = new Map();
    bpmnCondicionalCatalog.forEach((node) => {
      const key = normalizeText(node._oppName || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(node);
    });
    return map;
  }, [bpmnCondicionalCatalog]);

  // ── BPMN node usage counts (how many opportunities contain that node name) ─
  const bpmnTaskUsageByName = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []).forEach(
      (opp) => {
        (Array.isArray(opp?.bpmn?.nodes) ? opp.bpmn.nodes : []).forEach(
          (node) => {
            if (node?.nodeType !== "task") return;
            const key = normalizeText(
              String(node?.taskNome || node?.label || "").trim(),
            );
            if (!key) return;
            map.set(key, (map.get(key) || 0) + 1);
          },
        );
      },
    );
    return map;
  }, [bpmnOpportunities]);

  const bpmnCondicionalUsageByName = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []).forEach(
      (opp) => {
        (Array.isArray(opp?.bpmn?.nodes) ? opp.bpmn.nodes : []).forEach(
          (node) => {
            if (node?.nodeType !== "condicional") return;
            const key = normalizeText(
              String(node?.condicionalNome || node?.label || "").trim(),
            );
            if (!key) return;
            map.set(key, (map.get(key) || 0) + 1);
          },
        );
      },
    );
    return map;
  }, [bpmnOpportunities]);

  // ── Opportunity lookup by id ──────────────────────────────────────────────
  const bpmnOppById = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []).forEach(
      (opp) => {
        if (opp?.id) map.set(String(opp.id), opp);
      },
    );
    return map;
  }, [bpmnOpportunities]);

  // ── Filtered entities for catalog tab ────────────────────────────────────
  const filteredEntities = React.useMemo(() => {
    const query = normalizeText(searchQuery);
    return entidades.filter((e) => {
      if (query) {
        const nome = normalizeText(e?.nome || "");
        const desc = normalizeText(e?.descricao || "");
        const cat = normalizeText(e?.categoria || "");
        if (
          !nome.includes(query) &&
          !desc.includes(query) &&
          !cat.includes(query)
        )
          return false;
      }
      return true;
    });
  }, [entidades, searchQuery]);

  // ── Drawer fields ─────────────────────────────────────────────────────────
  const drawerFields = React.useMemo(
    () => (drawerEntity ? getMergedEntityFields(drawerEntity) : []),
    [drawerEntity, getMergedEntityFields],
  );

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const handleEdit = (item) => {
    if (isReadOnlyMode) return;
    const entidadeId = getEntidadeId(item);
    if (entidadeId === null || entidadeId === undefined) return;
    navigate(
      `/cadastros/criar?entidadeId=${encodeURIComponent(String(entidadeId))}`,
    );
  };

  const handleDelete = (id) => {
    if (!canDelete || id === null || id === undefined) return;
    if (skipDeleteEntidadeConfirm) {
      deletarEntidade(id);
      return;
    }
    setDeleteConfirm({ type: "entidade", id });
  };

  const handleDeleteCampo = (id) => {
    if (!canDelete) return;
    setDeleteConfirm({ type: "campo", id });
  };

  const handleDeleteTabela = async () => {
    if (!canDelete || !deleteTabelaConfirm) return;

    const sectionKey = normalizeText(deleteTabelaConfirm.title);
    const linkedOpportunities = (
      Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []
    ).filter((opp) => normalizeText(getOpportunityName(opp)) === sectionKey);

    for (const entity of deleteTabelaConfirm.entities || []) {
      const id = getEntidadeId(entity);
      if (id !== null && id !== undefined) {
        await Promise.resolve(deletarEntidade(id));
      }
    }

    for (const opp of linkedOpportunities) {
      const opportunityId = opp?.id ?? opp?._id;
      if (opportunityId === null || opportunityId === undefined) continue;
      await deleteOpportunityById({
        opportunityId,
        token: getAuthToken(),
      });
      removeOpportunity(opportunityId);
    }

    setDeleteTabelaConfirm(null);
  };

  const confirmDelete = () => {
    if (isReadOnlyMode || !deleteConfirm) return;
    if (deleteConfirm.type === "entidade" && disableDeleteEntidadePromptDraft) {
      window.localStorage.setItem(
        "entidades:skipDeleteEntidadeConfirm",
        "true",
      );
      setSkipDeleteEntidadeConfirm(true);
    }
    if (deleteConfirm.type === "entidade") deletarEntidade(deleteConfirm.id);
    else if (deleteConfirm.type === "campo") deletarCampo(deleteConfirm.id);
    setDeleteConfirm(null);
    setDisableDeleteEntidadePromptDraft(false);
  };

  const handleEditCampo = (campo) => {
    if (isReadOnlyMode || !campo) return;
    const obrigatorio =
      campo.obrigatorio === true || campo.obrigatorio === "Sim";
    const keyTypeRaw = String(campo?.keyType || campo?.chave || "NORMAL")
      .trim()
      .toUpperCase();
    const keyType = ["PK", "FK", "NORMAL"].includes(keyTypeRaw)
      ? keyTypeRaw
      : "NORMAL";
    const rel = campo?.relacionamento;
    const referencia = (() => {
      if (!rel) return "";
      if (typeof rel === "string") return rel;
      const e = String(rel?.entidade || rel?.targetEntity || "").trim();
      const c = String(rel?.campo || rel?.targetField || "").trim();
      return e && c ? `${e}.${c}` : e || c || "";
    })();
    setCampoEmEdicao({
      campoId: campo.id,
      entidadeRef:
        campo.entidadeId ||
        campo.entidadeNome ||
        drawerEntity?.id ||
        drawerEntity?._id ||
        drawerEntity?.nome ||
        null,
    });
    setCampoConfigForm({
      nome: String(campo.nome || ""),
      tipo: String(campo.tipo || "Texto"),
      obrigatorio: obrigatorio ? "Sim" : "Não",
      keyType,
      referencia,
    });
    setCamposConfigError("");
  };

  const handleAddOrEditCampo = async () => {
    if (isReadOnlyMode || !drawerEntity) return;
    const nome = String(campoConfigForm.nome || "").trim();
    if (!nome) {
      setCamposConfigError("Informe o nome do campo.");
      return;
    }
    if (!campoConfigForm.tipo) {
      setCamposConfigError("Selecione o tipo do campo.");
      return;
    }
    if (!campoConfigForm.obrigatorio) {
      setCamposConfigError("Selecione se o campo é obrigatório.");
      return;
    }
    if (!campoConfigForm.keyType) {
      setCamposConfigError("Selecione o tipo de chave.");
      return;
    }
    setCamposConfigError("");
    try {
      const payload = {
        nome,
        tipo: campoConfigForm.tipo,
        obrigatorio: campoConfigForm.obrigatorio === "Sim",
        keyType: String(campoConfigForm.keyType || "NORMAL")
          .trim()
          .toUpperCase(),
        relacionamento: String(campoConfigForm.referencia || "").trim() || null,
      };
      if (campoEmEdicao?.campoId && campoEmEdicao?.entidadeRef) {
        await editarCampoEntidade(
          campoEmEdicao.entidadeRef,
          campoEmEdicao.campoId,
          payload,
        );
      } else {
        await adicionarCampoEntidade(drawerEntity, payload);
      }
      setCampoConfigForm({
        nome: "",
        tipo: "",
        obrigatorio: "",
        keyType: "",
        referencia: "",
      });
      setCampoEmEdicao(null);
    } catch (error) {
      setCamposConfigError(
        String(error?.message || "Não foi possível salvar o campo."),
      );
    }
  };

  const handleCampoConfigChange = (key, value) => {
    setCampoConfigForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCancelarEdicaoCampo = () => {
    setCampoEmEdicao(null);
    setCampoConfigForm({
      nome: "",
      tipo: "",
      obrigatorio: "",
      keyType: "",
      referencia: "",
    });
    setCamposConfigError("");
  };

  const handleCloseDrawer = () => {
    setDrawerEntityId(null);
    if (location.search.includes("entidadeId")) {
      navigate("/cadastros", { replace: true });
    }
  };

  // ── BPMN node campo handlers ──────────────────────────────────────────────
  const handleBpmnCampoConfigChange = React.useCallback((field, value) => {
    setBpmnCampoConfigForm((prev) => ({ ...prev, [field]: value }));
    setBpmnCamposError("");
  }, []);

  const handleBpmnCancelEdit = React.useCallback(() => {
    setBpmnCampoEmEdicao(null);
    setBpmnCampoConfigForm(EMPTY_BPMN_FORM);
    setBpmnCamposError("");
  }, []);

  const handleBpmnCloseDawer = React.useCallback(() => {
    setDrawerBpmnNode(null);
    setBpmnCampoEmEdicao(null);
    setBpmnCampoConfigForm(EMPTY_BPMN_FORM);
    setBpmnCamposError("");
  }, []);

  const persistBpmnNodeFields = React.useCallback(
    async (node, newFields) => {
      if (!node?._oppId) return;
      const opp = (
        Array.isArray(bpmnOpportunities) ? bpmnOpportunities : []
      ).find((o) => String(o?.id ?? o?._id) === String(node._oppId));
      if (!opp) return;
      const updatedNodes = (
        Array.isArray(opp?.bpmn?.nodes) ? opp.bpmn.nodes : []
      ).map((n) =>
        n?.id === node?.id ? { ...n, selectedEntityFields: newFields } : n,
      );
      await updateOpportunityData({
        selectedOpportunity: opp,
        patch: { bpmn: { ...opp.bpmn, nodes: updatedNodes } },
      });
      setDrawerBpmnNode((prev) =>
        prev ? { ...prev, selectedEntityFields: newFields } : prev,
      );
    },
    [bpmnOpportunities, updateOpportunityData],
  );

  const handleBpmnAddOrEditCampo = React.useCallback(async () => {
    const { nome, tipo, obrigatorio, keyType } = bpmnCampoConfigForm;
    if (!nome.trim()) {
      setBpmnCamposError("Nome é obrigatório.");
      return;
    }
    if (!tipo) {
      setBpmnCamposError("Tipo é obrigatório.");
      return;
    }
    if (!obrigatorio) {
      setBpmnCamposError("Obrigatório é obrigatório.");
      return;
    }
    if (!keyType) {
      setBpmnCamposError("Chave é obrigatória.");
      return;
    }

    const currentFields = Array.isArray(drawerBpmnNode?.selectedEntityFields)
      ? drawerBpmnNode.selectedEntityFields
      : [];

    let newFields;
    if (bpmnCampoEmEdicao) {
      newFields = currentFields.map((c) =>
        c?.id === bpmnCampoEmEdicao?.id ? { ...c, ...bpmnCampoConfigForm } : c,
      );
    } else {
      const newId = `bpmn-campo-${Date.now()}`;
      newFields = [...currentFields, { id: newId, ...bpmnCampoConfigForm }];
    }

    await persistBpmnNodeFields(drawerBpmnNode, newFields);
    setBpmnCampoEmEdicao(null);
    setBpmnCampoConfigForm(EMPTY_BPMN_FORM);
    setBpmnCamposError("");
  }, [
    bpmnCampoConfigForm,
    bpmnCampoEmEdicao,
    drawerBpmnNode,
    persistBpmnNodeFields,
  ]);

  const handleBpmnEditCampo = React.useCallback((campo) => {
    setBpmnCampoEmEdicao(campo);
    setBpmnCampoConfigForm({
      nome: campo.nome || "",
      tipo: campo.tipo || "",
      obrigatorio: campo.obrigatorio || "",
      keyType: campo.keyType || "",
      referencia: campo.referencia || "",
    });
    setBpmnCamposError("");
  }, []);

  const handleBpmnDeleteCampo = React.useCallback(
    async (campoId) => {
      const currentFields = Array.isArray(drawerBpmnNode?.selectedEntityFields)
        ? drawerBpmnNode.selectedEntityFields
        : [];
      const newFields = currentFields.filter((c) => c?.id !== campoId);
      await persistBpmnNodeFields(drawerBpmnNode, newFields);
    },
    [drawerBpmnNode, persistBpmnNodeFields],
  );

  // ── Process tab renderTable ───────────────────────────────────────────────
  const renderTable = (section) => {
    const sectionKey = normalizeText(section.title);
    const cats = Array.isArray(section?.entities) ? section.entities : [];
    const tasks = bpmnTasksByProcess.get(sectionKey) || [];
    const condicionais = bpmnCondicionalsByProcess.get(sectionKey) || [];

    // Build merged rows: entities first, then tasks, then condicionais
    const entityRows = cats.map((item) => ({ _kind: "entity", item }));
    const taskRows = tasks.map((node) => ({ _kind: "task", node }));
    const condicionalRows = condicionais.map((node) => ({
      _kind: "condicional",
      node,
    }));
    const allRows = [...entityRows, ...taskRows, ...condicionalRows];
    const rows = allRows;

    return (
      <div className={styles.sectionGroup} key={section.key}>
        <div className={styles.sectionTopRow}>
          <h2 className={styles.tableTitle}>{section.title}</h2>
          {canDelete && rows.length > 0 && (
            <button
              className={styles.deleteTabelaBtn}
              onClick={() => setDeleteTabelaConfirm(section)}
            >
              🗑️ Deletar tabela
            </button>
          )}
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Campos</th>
                <th>Usos BPMN</th>
                <th>Tipo</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyState}>
                    Nenhum item nesta categoria
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  if (row._kind === "entity") {
                    const item = row.item;
                    return (
                      <tr key={getEntidadeId(item) ?? item.nome}>
                        <td
                          className={styles.nameCell}
                          onClick={() =>
                            setDrawerEntityId(
                              String(getEntidadeId(item) ?? item.nome),
                            )
                          }
                          style={{ cursor: "pointer" }}
                          title="Clique para ver os campos"
                        >
                          {item.nome}
                        </td>
                        <td className={styles.descCell}>
                          {item.descricao || "-"}
                        </td>
                        <td>{getEntityFieldCount(item)}</td>
                        <td>{getEntityBpmnUsageCount(item)}</td>
                        <td>{getEntityTypeLabel(item)}</td>
                        <td>
                          {formatDateTimeLabel(
                            item.updated_at || item.created_at,
                          )}
                        </td>
                        <td className={styles.actionsCell}>
                          <div className={styles.actions}>
                            {!isReadOnlyMode && (
                              <button
                                className={styles.iconBtn}
                                onClick={() => handleEdit(item)}
                                title="Editar"
                              >
                                ✏️
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                onClick={() =>
                                  handleDelete(getEntidadeId(item))
                                }
                                title="Deletar"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (row._kind === "task") {
                    const node = row.node;
                    const nome = String(
                      node?.taskNome || node?.label || "",
                    ).trim();
                    const descricao = String(node?.taskDescricao || "").trim();
                    const campos = Array.isArray(node?.selectedEntityFields)
                      ? node.selectedEntityFields.filter((c) =>
                          String(c?.nome || "").trim(),
                        )
                      : [];
                    return (
                      <tr key={`task-${node?.id ?? idx}`}>
                        <td
                          className={`${styles.nameCell} ${styles.nameCellTask}`}
                          onClick={() => setDrawerBpmnNode(node)}
                          style={{ cursor: "pointer" }}
                          title="Clique para ver os campos"
                        >
                          {nome || "—"}
                        </td>
                        <td className={styles.descCell}>{descricao || "-"}</td>
                        <td>{campos.length}</td>
                        <td>
                          {bpmnTaskUsageByName.get(normalizeText(nome)) || 1}
                        </td>
                        <td>Atividade</td>
                        <td>
                          {formatDateTimeLabel(
                            bpmnOppById.get(String(node._oppId ?? ""))
                              ?.updated_at ||
                              bpmnOppById.get(String(node._oppId ?? ""))
                                ?.created_at,
                          )}
                        </td>
                        <td className={styles.actionsCell}>
                          <div className={styles.actions}>
                            <button
                              className={styles.iconBtn}
                              onClick={() => setDrawerBpmnNode(node)}
                              title="Ver/editar campos"
                            >
                              ▤
                            </button>
                            {!isReadOnlyMode && (
                              <button
                                className={styles.iconBtn}
                                onClick={() =>
                                  navigate(`/gerar-bpmn/${node._oppSlug}`)
                                }
                                title="Editar no BPMN"
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // condicional
                  const node = row.node;
                  const nome = String(
                    node?.condicionalNome || node?.label || "",
                  ).trim();
                  const descricao = String(
                    node?.condicionalDescricao || "",
                  ).trim();
                  const campos = Array.isArray(node?.selectedEntityFields)
                    ? node.selectedEntityFields.filter((c) =>
                        String(c?.nome || "").trim(),
                      )
                    : [];
                  return (
                    <tr key={`cond-${node?.id ?? idx}`}>
                      <td
                        className={`${styles.nameCell} ${styles.nameCellCondicional}`}
                        onClick={() => setDrawerBpmnNode(node)}
                        style={{ cursor: "pointer" }}
                        title="Clique para ver os campos"
                      >
                        {nome || "—"}
                      </td>
                      <td className={styles.descCell}>{descricao || "-"}</td>
                      <td>{campos.length}</td>
                      <td>
                        {bpmnCondicionalUsageByName.get(normalizeText(nome)) ||
                          1}
                      </td>
                      <td>Condicional</td>
                      <td>
                        {formatDateTimeLabel(
                          bpmnOppById.get(String(node._oppId ?? ""))
                            ?.updated_at ||
                            bpmnOppById.get(String(node._oppId ?? ""))
                              ?.created_at,
                        )}
                      </td>
                      <td className={styles.actionsCell}>
                        <div className={styles.actions}>
                          <button
                            className={styles.iconBtn}
                            onClick={() => setDrawerBpmnNode(node)}
                            title="Ver/editar campos"
                          >
                            ▤
                          </button>
                          {!isReadOnlyMode && (
                            <button
                              className={styles.iconBtn}
                              onClick={() =>
                                navigate(`/gerar-bpmn/${node._oppSlug}`)
                              }
                              title="Editar no BPMN"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className={styles.page}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <h1 className={styles.pageTitle}>Cadastros do Sistema</h1>
          <p className={styles.pageSubtitle}>
            Entidades, campos e relacionamentos cadastrados
          </p>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{entidades.length}</span>
            <span className={styles.statLabel}>Entidades</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{totalFields}</span>
            <span className={styles.statLabel}>Campos</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{bpmnLinkedCount}</span>
            <span className={styles.statLabel}>Em processos</span>
          </div>
        </div>

        <div className={styles.pageHeaderActions}>
          {(isReadOnlyMode || isEditOnlyMode) && (
            <span className={styles.accessBadge}>
              {isReadOnlyMode ? "Somente leitura" : "Edição limitada"}
            </span>
          )}
          {canCreate && (
            <button
              className={styles.newEntityBtn}
              onClick={() => navigate("/cadastros/criar")}
            >
              + Nova Entidade
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Catalog tab */}
      {activeTab === "catalogo" && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.searchWrapper}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar por nome, descrição ou categoria..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className={styles.clearSearch}
                  onClick={() => setSearchQuery("")}
                  title="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {entidadesLoading && entidades.length === 0 ? (
            <div className={styles.stateCenter}>
              <div className={styles.spinner} />
              <p>Carregando entidades...</p>
            </div>
          ) : entidadesError && entidades.length === 0 ? (
            <div className={styles.stateCenter}>
              <p className={styles.stateError}>
                Erro ao carregar entidades: {entidadesError}
              </p>
            </div>
          ) : filteredEntities.length === 0 ? (
            <div className={styles.stateCenter}>
              <span className={styles.stateEmoji}>📭</span>
              <p>
                {searchQuery
                  ? "Nenhuma entidade encontrada com esse filtro"
                  : "Nenhuma entidade cadastrada"}
              </p>
              {canCreate && !searchQuery && (
                <button
                  className={styles.newEntityBtn}
                  onClick={() => navigate("/cadastros/criar")}
                  style={{ marginTop: "0.5rem" }}
                >
                  + Criar primeira entidade
                </button>
              )}
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {filteredEntities.map((entity) => (
                <EntityCard
                  key={getEntidadeId(entity) ?? entity.nome}
                  entity={entity}
                  fieldCount={getEntityFieldCount(entity)}
                  bpmnUsageCount={getEntityBpmnUsageCount(entity)}
                  onViewFields={() =>
                    setDrawerEntityId(
                      String(getEntidadeId(entity) ?? entity.nome),
                    )
                  }
                  onEdit={() => handleEdit(entity)}
                  onDelete={() => handleDelete(getEntidadeId(entity))}
                  canEdit={!isReadOnlyMode}
                  canDelete={canDelete}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Processes tab */}
      {activeTab === "processos" && (
        <div className={styles.sectionsWrapper}>
          {tableSections.filter((s) => {
            if (s.entities.length > 0) return true;
            const key = normalizeText(s.title);
            return (
              (bpmnTasksByProcess.get(key)?.length ?? 0) > 0 ||
              (bpmnCondicionalsByProcess.get(key)?.length ?? 0) > 0
            );
          }).length === 0 ? (
            <div className={styles.stateCenter}>
              <span className={styles.stateEmoji}>🔄</span>
              <p>Nenhum processo BPMN cadastrado</p>
            </div>
          ) : (
            tableSections
              .filter((s) => {
                if (s.entities.length > 0) return true;
                const key = normalizeText(s.title);
                return (
                  (bpmnTasksByProcess.get(key)?.length ?? 0) > 0 ||
                  (bpmnCondicionalsByProcess.get(key)?.length ?? 0) > 0
                );
              })
              .map((section) => renderTable(section))
          )}
        </div>
      )}

      {/* Atividades tab */}
      {activeTab === "atividades" && (
        <>
          {bpmnTaskCatalog.length === 0 ? (
            <div className={styles.stateCenter}>
              <span className={styles.stateEmoji}>⏱️</span>
              <p>Nenhuma atividade cadastrada nos processos BPMN</p>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {bpmnTaskCatalog.map((node, idx) => {
                const nome = String(node?.taskNome || node?.label || "").trim();
                const descricao = String(node?.taskDescricao || "").trim();
                const campos = Array.isArray(node?.selectedEntityFields)
                  ? node.selectedEntityFields.filter((c) =>
                      String(c?.nome || "").trim(),
                    )
                  : [];
                return (
                  <article key={node?.id ?? idx} className={styles.bpmnCard}>
                    <div className={styles.bpmnCardAccent} />
                    <div className={styles.cardInner}>
                      <div className={styles.topRow}>
                        <span
                          className={`${styles.typeBadge} ${styles.typeBadgeTask}`}
                        >
                          ⏱ Atividade
                        </span>
                        {node._oppName && (
                          <span className={styles.bpmnBadge}>
                            {node._oppName}
                          </span>
                        )}
                      </div>
                      <h3 className={styles.entityName}>
                        {nome || (
                          <span className={styles.unnamed}>Sem nome</span>
                        )}
                      </h3>
                      {descricao ? (
                        <p className={styles.entityDesc}>{descricao}</p>
                      ) : (
                        <p className={styles.entityDescEmpty}>Sem descrição</p>
                      )}
                      <div className={styles.metaRow}>
                        <span className={styles.metaItem}>
                          <span className={styles.metaIcon}>▤</span>
                          {campos.length}{" "}
                          {campos.length === 1 ? "campo" : "campos"}
                        </span>
                      </div>
                    </div>
                    <div className={styles.cardFooter}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => setDrawerBpmnNode(node)}
                        title="Ver campos da atividade"
                      >
                        ▤ Campos
                      </button>
                      {!isReadOnlyMode && (
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() =>
                            navigate(`/gerar-bpmn/${node._oppSlug}`)
                          }
                          title="Editar no BPMN"
                        >
                          ✏️
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnDanger}`}
                          onClick={() => setDeleteBpmnNodeConfirm(node)}
                          title="Remover atividade"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Condicionais tab */}
      {activeTab === "condicionais" && (
        <>
          {bpmnCondicionalCatalog.length === 0 ? (
            <div className={styles.stateCenter}>
              <span className={styles.stateEmoji}>🔀</span>
              <p>Nenhuma condicional cadastrada nos processos BPMN</p>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {bpmnCondicionalCatalog.map((node, idx) => {
                const nome = String(
                  node?.condicionalNome || node?.label || "",
                ).trim();
                const descricao = String(
                  node?.condicionalDescricao || "",
                ).trim();
                const campos = Array.isArray(node?.selectedEntityFields)
                  ? node.selectedEntityFields.filter((c) =>
                      String(c?.nome || "").trim(),
                    )
                  : [];
                return (
                  <article key={node?.id ?? idx} className={styles.bpmnCard}>
                    <div
                      className={`${styles.bpmnCardAccent} ${styles.bpmnCardAccentCondicional}`}
                    />
                    <div className={styles.cardInner}>
                      <div className={styles.topRow}>
                        <span
                          className={`${styles.typeBadge} ${styles.typeBadgeCondicional}`}
                        >
                          🔀 Decisão
                        </span>
                        {node._oppName && (
                          <span className={styles.bpmnBadge}>
                            {node._oppName}
                          </span>
                        )}
                      </div>
                      <h3 className={styles.entityName}>
                        {nome || (
                          <span className={styles.unnamed}>Sem nome</span>
                        )}
                      </h3>
                      {descricao ? (
                        <p className={styles.entityDesc}>{descricao}</p>
                      ) : (
                        <p className={styles.entityDescEmpty}>Sem descrição</p>
                      )}
                      <div className={styles.metaRow}>
                        <span className={styles.metaItem}>
                          <span className={styles.metaIcon}>▤</span>
                          {campos.length}{" "}
                          {campos.length === 1 ? "campo" : "campos"}
                        </span>
                      </div>
                    </div>
                    <div className={styles.cardFooter}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => setDrawerBpmnNode(node)}
                        title="Ver campos da condicional"
                      >
                        ▤ Campos
                      </button>
                      {!isReadOnlyMode && (
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() =>
                            navigate(`/gerar-bpmn/${node._oppSlug}`)
                          }
                          title="Editar no BPMN"
                        >
                          ✏️
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnDanger}`}
                          onClick={() => setDeleteBpmnNodeConfirm(node)}
                          title="Remover condicional"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Fields Drawer – BPMN node (task / condicional) */}
      {drawerBpmnNode &&
        (() => {
          const isTask = drawerBpmnNode?.nodeType === "task";
          const nodeName = String(
            isTask
              ? drawerBpmnNode?.taskNome
              : drawerBpmnNode?.condicionalNome || drawerBpmnNode?.label || "",
          ).trim();
          const nodeFields = Array.isArray(drawerBpmnNode?.selectedEntityFields)
            ? drawerBpmnNode.selectedEntityFields.filter((c) =>
                String(c?.nome || "").trim(),
              )
            : [];
          const fakeEntity = {
            nome: nodeName || (isTask ? "Atividade" : "Condicional"),
            atributoChave: "",
          };
          return (
            <EntityFieldsDrawer
              entity={fakeEntity}
              fields={nodeFields}
              campoEmEdicao={bpmnCampoEmEdicao}
              campoConfigForm={bpmnCampoConfigForm}
              camposConfigError={bpmnCamposError}
              onClose={handleBpmnCloseDawer}
              onAddOrEditField={handleBpmnAddOrEditCampo}
              onEditField={handleBpmnEditCampo}
              onDeleteField={handleBpmnDeleteCampo}
              onCampoConfigChange={handleBpmnCampoConfigChange}
              onCancelEdit={handleBpmnCancelEdit}
              isReadOnly={isReadOnlyMode}
              canDelete={canDelete}
            />
          );
        })()}

      {/* Fields Drawer */}
      {drawerEntity && (
        <EntityFieldsDrawer
          entity={drawerEntity}
          fields={drawerFields}
          campoEmEdicao={campoEmEdicao}
          campoConfigForm={campoConfigForm}
          camposConfigError={camposConfigError}
          onClose={handleCloseDrawer}
          onAddOrEditField={handleAddOrEditCampo}
          onEditField={handleEditCampo}
          onDeleteField={handleDeleteCampo}
          onCampoConfigChange={handleCampoConfigChange}
          onCancelEdit={handleCancelarEdicaoCampo}
          isReadOnly={isReadOnlyMode}
          canDelete={canDelete}
        />
      )}

      {/* Delete confirms */}
      {deleteBpmnNodeConfirm &&
        (() => {
          const isTask = deleteBpmnNodeConfirm?.nodeType === "task";
          const nodeName =
            String(
              isTask
                ? deleteBpmnNodeConfirm?.taskNome
                : deleteBpmnNodeConfirm?.condicionalNome ||
                    deleteBpmnNodeConfirm?.label ||
                    "",
            ).trim() || (isTask ? "Atividade" : "Condicional");
          return (
            <Close
              title={`Remover ${isTask ? "atividade" : "condicional"}`}
              message={`Para remover "${nodeName}" acesse o editor BPMN do processo "${deleteBpmnNodeConfirm._oppName || ""}" e exclua o elemento lá.`}
              onConfirm={() => {
                navigate(`/gerar-bpmn/${deleteBpmnNodeConfirm._oppSlug}`);
                setDeleteBpmnNodeConfirm(null);
              }}
              onCancel={() => setDeleteBpmnNodeConfirm(null)}
              confirmLabel="Ir para o BPMN"
            />
          );
        })()}

      {deleteTabelaConfirm && (
        <Close
          title="Deletar tabela inteira"
          message={`Tem certeza que deseja deletar a tabela "${deleteTabelaConfirm.title}"? Isso removerá ${deleteTabelaConfirm.entities.length} entidade(s) e o processo BPMN vinculado.`}
          onConfirm={handleDeleteTabela}
          onCancel={() => setDeleteTabelaConfirm(null)}
        />
      )}

      {deleteConfirm && (
        <Close
          title={
            deleteConfirm.type === "entidade"
              ? "Deletar Entidade"
              : "Deletar Campo"
          }
          message={
            deleteConfirm.type === "entidade"
              ? "Tem certeza que deseja deletar esta entidade? Esta ação não pode ser desfeita."
              : "Tem certeza que deseja deletar este campo? Esta ação não pode ser desfeita."
          }
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteConfirm(null);
            setDisableDeleteEntidadePromptDraft(false);
          }}
        >
          {deleteConfirm.type === "entidade" && (
            <label className={styles.deleteConfirmOptOut}>
              <input
                type="checkbox"
                checked={disableDeleteEntidadePromptDraft}
                onChange={(e) =>
                  setDisableDeleteEntidadePromptDraft(e.target.checked)
                }
              />
              Não quero receber essa mensagem novamente.
            </label>
          )}
        </Close>
      )}
    </section>
  );
};

export default Entidades;
