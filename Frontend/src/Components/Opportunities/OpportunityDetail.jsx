import React, { useContext } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import EditablePipeline from "./Pipeline/EditablePipeline";
import Close from "../Helper/Close";
import styles from "./OpportunityDetail.module.css";
import { UserContext } from "../../Context/UserContext";
import { EntidadesContext } from "../../Context/EntidadesContext";
import OpportunitySummary from "./Detail/OpportunitySummary";
import OpportunityDocumentsCard from "./Detail/OpportunityDocumentsCard";
import TimelineCard from "./Detail/TimelineCard";
import OpportunityTopBar from "./Detail/OpportunityTopBar";
import HiddenSection from "./Detail/HiddenSection";
import ProductsCard from "./Detail/ProductsCard";
import QuotesCard from "./Detail/QuotesCard";
import ContactsCard from "./Detail/ContactsCard";
import ActivityTimeline from "../Activities/ActivityTimeline";
import OpportunityProcessosCard from "./Detail/OpportunityProcessosCard";
import useOpportunityDetailState from "./Detail/useOpportunityDetailState";
import {
  buildOpportunityAutoTimelineItems,
  buildBpmnEntitiesForCatalog,
  buildEntidadesSyncOperations,
  buildOpportunityPayload,
  deleteOpportunity,
  saveOpportunity,
} from "./Detail/opportunityService";
import { getUserDisplayName } from "./opportunityOwnershipRules";
import { getAuthToken, fetchOpportunitiesPage } from "./opportunityApi";
import { isReadOnlyAccessLevelOne } from "../../Utils/accessControl";

// ─── Componente de resumo do passo ──────────────────────────────────────────
const StepResumeCard = ({ form, stageLabel, styles }) => {
  const fields = form?.header?.fields || [];
  const sections = form?.sections || [];
  const normalizeLabel = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  const isDescriptionLabel = (label) => {
    const normalized = normalizeLabel(label);
    return normalized === "descricao" || normalized.startsWith("descricao ");
  };

  const descriptionField = fields.find(
    (field) =>
      isDescriptionLabel(field?.label) &&
      String(field?.value || "").trim().length > 0,
  );

  const descriptionFromSection = sections.find(
    (section) =>
      isDescriptionLabel(section?.heading) &&
      String(section?.body || "").trim().length > 0,
  );

  const descriptionValue =
    String(descriptionField?.value || "").trim() ||
    String(descriptionFromSection?.body || "").trim();

  const hasContent =
    fields.some((f) => String(f.value || "").trim()) ||
    sections.some((s) => String(s.body || "").trim());

  if (!hasContent) return null;

  return (
    <div className={styles.resumeCard}>
      <div className={styles.resumeCardHeader}>
        <span className={styles.resumeCardTitle}>
          📋 {stageLabel ? stageLabel : "Resumo do passo"}
        </span>
      </div>
      <div className={styles.resumeCardContent}>
        {descriptionValue && (
          <div className={styles.resumeFieldRow}>
            <span className={styles.resumeFieldLabel}>Descrição:</span>
            <span className={styles.resumeFieldValue}>{descriptionValue}</span>
          </div>
        )}
        {fields
          .filter(
            (f) =>
              String(f.value || "").trim() && !isDescriptionLabel(f?.label),
          )
          .map((f, i) => (
            <div key={i} className={styles.resumeFieldRow}>
              <span className={styles.resumeFieldLabel}>{f.label}:</span>
              <span className={styles.resumeFieldValue}>{f.value}</span>
            </div>
          ))}
        {sections
          .filter(
            (s) =>
              String(s.body || "").trim() && !isDescriptionLabel(s?.heading),
          )
          .map((s, i) => (
            <div key={i} className={styles.resumeSection}>
              {s.heading && (
                <p className={styles.resumeSectionTitle}>{s.heading}</p>
              )}
              <p className={styles.resumeSectionBody}>{s.body}</p>
            </div>
          ))}
      </div>
    </div>
  );
};

const OpportunityDetail = () => {
  const { user } = useContext(UserContext);
  const { entidades, adicionarEntidade, editarEntidade, deletarEntidade } =
    useContext(EntidadesContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();
  const locationOpportunity = location.state?.opportunity || null;
  const [opportunity, setOpportunity] = React.useState(locationOpportunity);
  const owner = getUserDisplayName(user) || "Nome da conta";
  const actorId = String(user?.id || user?._id || user?.userId || "").trim();
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const [noticeMessage, setNoticeMessage] = React.useState("");

  // When navigating from Workflows, only {id, name} is passed.
  // Fetch the full opportunity so BPMN/pipeline data is available.
  React.useEffect(() => {
    if (!opportunity?.id || opportunity?.bpmn || opportunity?.stages) return;
    let cancelled = false;
    const fetchFull = async () => {
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
  }, [opportunity]);

  const [isSavingPipeline, setIsSavingPipeline] = React.useState(false);
  const [pipelineSaveMsg, setPipelineSaveMsg] = React.useState("");
  const [activeStageLabel, setActiveStageLabel] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("resumo");
  const [currentStepForm, setCurrentStepForm] = React.useState(null);

  const handleFormChange = React.useCallback((form, activeDoc) => {
    setCurrentStepForm(form);
  }, []);
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
    showTimeline,
    pipelineTitle,
    setPipelineTitle,
    pipelineSubtitle,
    setPipelineSubtitle,
    stages,
    setStages,
    title,
    setTitle,
    infoRows,
    setInfoRows,
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
    toggleTimeline,
    timelineNoteTitle,
    setTimelineNoteTitle,
    timelineNoteDescription,
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

    const currentKey = normalizeStageLabel(activeStageLabel);
    const hasCurrent = stages.some(
      (stage) => normalizeStageLabel(stage?.label) === currentKey,
    );
    if (hasCurrent) return;

    const firstOpen = stages.find((stage) => stage?.done !== true) || stages[0];
    const nextLabel = String(firstOpen?.label || "").trim();
    if (nextLabel) setActiveStageLabel(nextLabel);
  }, [activeStageLabel, stages, normalizeStageLabel]);

  const handleSaveStepComplete = React.useCallback(() => {
    // Reset resumo
    setCurrentStepForm(null);

    if (!activeStageLabel || !Array.isArray(stages) || stages.length === 0) {
      return;
    }

    const normalizedActiveLabel = normalizeStageLabel(activeStageLabel);
    const currentIndex = stages.findIndex(
      (stage) => normalizeStageLabel(stage?.label) === normalizedActiveLabel,
    );

    if (currentIndex < 0) return;

    // O pipeline renderiza progresso usando `stage.done`.
    // Sem atualizar essa flag, o próximo passo não aparece visualmente.
    setStages((previous) =>
      previous.map((stage, index) =>
        index === currentIndex ? { ...stage, done: true } : stage,
      ),
    );

    if (currentIndex < stages.length - 1) {
      const nextStage = stages[currentIndex + 1];
      setActiveStageLabel(String(nextStage?.label || ""));
    }
  }, [activeStageLabel, stages, setStages, normalizeStageLabel]);

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

    if (action === "created") {
      noteTitle = `Tópico criado: "${title}"`;
      noteDescription = `Novo tópico "${title}" foi criado no passo "${activeStageLabel || "sem passo definido"}".`;
    } else if (action === "updated") {
      noteTitle = `Tópico atualizado: "${title}"`;
      noteDescription = `Tópico "${title}" foi atualizado no passo "${activeStageLabel || "sem passo definido"}".`;
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

      navigate("/oportunidades");
    } catch (err) {
      setNoticeMessage(err.message || "Não foi possível salvar a oportunidade");
    }
  };

  const handleSavePipelineOnly = React.useCallback(async () => {
    if (isReadOnlyMode || isCreating || !opportunity?.id) return;
    setIsSavingPipeline(true);
    setPipelineSaveMsg("");
    try {
      const token = getAuthToken();
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
        timelineItems,
        showPipeline,
        products,
        quotes,
        contacts,
        probabilidade,
        origemLead,
        motivoFechamento,
      });
      await saveOpportunity({
        payload,
        token,
        isCreating: false,
        opportunityId: opportunity.id,
      });
      setPipelineSaveMsg("Pipeline salva!");
      setTimeout(() => setPipelineSaveMsg(""), 2500);
    } catch (err) {
      setPipelineSaveMsg(err.message || "Erro ao salvar");
      setTimeout(() => setPipelineSaveMsg(""), 3000);
    } finally {
      setIsSavingPipeline(false);
    }
  }, [
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
  ]);

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
            onActiveStage={(stage) =>
              setActiveStageLabel(stage ? String(stage.label || "") : null)
            }
            bpmnNodes={opportunity?.bpmn?.nodes || []}
            bpmnConnections={opportunity?.bpmn?.connections || []}
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

      {/* ── Tabs Dynamics-style ── */}
      <div className={styles.detailTabs}>
        {[
          { key: "resumo", label: "Resumo" },
          { key: "contatos", label: "Contatos" },
          { key: "produtos", label: "Produtos" },
          { key: "cotacoes", label: "Cotações" },
          { key: "processos", label: "Processos" },
          { key: "atividades", label: "Atividades" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.detailTab} ${activeTab === tab.key ? styles.detailTabActive : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "resumo" && (
        <div className={styles.contentGrid}>
          <OpportunityDocumentsCard
            opportunityId={opportunity?.id}
            ownerName={owner}
            isReadOnlyMode={isReadOnlyMode}
            activeStageLabel={activeStageLabel}
            stages={stages}
            infoRows={infoRows}
            onDocumentSaved={handleDocumentSaved}
            onFormChange={handleFormChange}
            onSaveComplete={handleSaveStepComplete}
          />

          <div>
            <TimelineCard
              showTimeline={showTimeline}
              isEditing={isEditing}
              showPipeline={showPipeline}
              toggleTimeline={toggleTimeline}
              timelineItems={timelineItems}
              stages={stages}
              activeStageLabel={activeStageLabel}
              noteTitle={timelineNoteTitle}
              setNoteTitle={setTimelineNoteTitle}
              noteDescription={timelineNoteDescription}
              setNoteDescription={setTimelineNoteDescription}
              onAddNote={handleAddTimelineItem}
              isReadOnlyMode={isReadOnlyMode}
            />
            {currentStepForm && (
              <StepResumeCard
                form={currentStepForm}
                stageLabel={activeStageLabel}
                styles={styles}
              />
            )}
          </div>

          {!showTimeline && isEditing && (
            <HiddenSection
              label="Timeline oculta"
              buttonLabel="Mostrar Timeline"
              onShow={toggleTimeline}
            />
          )}
        </div>
      )}

      {activeTab === "produtos" && (
        <div className={styles.tabContent}>
          <ProductsCard
            products={products}
            onChange={setProducts}
            isReadOnlyMode={isReadOnlyMode}
          />
        </div>
      )}

      {activeTab === "cotacoes" && (
        <div className={styles.tabContent}>
          <QuotesCard
            quotes={quotes}
            products={products}
            onChange={setQuotes}
            isReadOnlyMode={isReadOnlyMode}
            opportunityTitle={title}
          />
        </div>
      )}

      {activeTab === "contatos" && (
        <div className={styles.tabContent}>
          <ContactsCard
            contacts={contacts}
            onChange={setContacts}
            isReadOnlyMode={isReadOnlyMode}
          />
        </div>
      )}

      {activeTab === "processos" && (
        <div className={styles.tabContent}>
          <OpportunityProcessosCard opportunityId={opportunity?.id} />
        </div>
      )}

      {activeTab === "atividades" && (
        <div className={styles.tabContent}>
          <div style={{ padding: "1rem 0" }}>
            <ActivityTimeline
              entityType="oportunidade"
              entityId={String(opportunity?.id || "")}
              limit={20}
              onAddActivity={() => setActiveTab("atividades")}
            />
          </div>
        </div>
      )}

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
    </section>
  );
};

export default OpportunityDetail;
