import React, { useContext } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import EditablePipeline from './Pipeline/EditablePipeline';
import Close from '../Helper/Close';
import styles from './OpportunityDetail.module.css';
import { UserContext } from '../../Context/UserContext';
import { EntidadesContext } from '../../Context/EntidadesContext';
import OpportunitySummary from './Detail/OpportunitySummary';
import TopicCard from './Detail/TopicCard';
import TimelineCard from './Detail/TimelineCard';
import OpportunityTopBar from './Detail/OpportunityTopBar';
import HiddenSection from './Detail/HiddenSection';
import useOpportunityDetailState from './Detail/useOpportunityDetailState';
import {
  buildOpportunityAutoTimelineItems,
  buildBpmnEntitiesForCatalog,
  buildEntidadesSyncOperations,
  buildOpportunityPayload,
  deleteOpportunity,
  saveOpportunity,
} from './Detail/opportunityService';
import { getUserDisplayName } from './opportunityOwnershipRules';
import { getAuthToken } from './opportunityApi';
import { isReadOnlyAccessLevelOne } from '../../Utils/accessControl';

const OpportunityDetail = () => {
  const { user } = useContext(UserContext);
  const { entidades, adicionarEntidade, editarEntidade } =
    useContext(EntidadesContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();
  const opportunity = location.state?.opportunity || null;
  const owner = getUserDisplayName(user) || 'Nome da conta';
  const actorId = String(user?.id || user?._id || user?.userId || '').trim();
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const [noticeMessage, setNoticeMessage] = React.useState('');
  const {
    deleteConfirm,
    setDeleteConfirm,
    isEditing,
    showPipeline,
    showTopico,
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
    isBpmnDrivenPipeline,
    currentBpmnStageName,
    bpmnActivitySnapshot,
    toggleEditing,
    togglePipeline,
    toggleTopico,
    toggleTimeline,
  } = useOpportunityDetailState({
    opportunity,
    slug,
    owner,
    actorName: owner,
    actorId,
    isReadOnlyMode,
  });

  const handleDeleteClick = () => {
    if (isReadOnlyMode) {
      setNoticeMessage(
        'Seu nível de acesso permite apenas visualização de oportunidades.',
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

      localStorage.removeItem('atribuirOportunidade');
      setDeleteConfirm(false);
      navigate('/oportunidades');
    } catch (error) {
      setNoticeMessage(error.message || 'Erro ao deletar oportunidade');
    }
  };

  const isCreating = location.pathname === '/oportunidades/criar';

  React.useEffect(() => {
    if (isReadOnlyMode && isCreating) {
      setNoticeMessage(
        'Seu nível de acesso permite apenas visualização. Criação de oportunidades está bloqueada.',
      );
      navigate('/oportunidades', { replace: true });
    }
  }, [isCreating, isReadOnlyMode, navigate]);

  const handleSaveOpportunity = async () => {
    if (isReadOnlyMode) {
      setNoticeMessage(
        'Seu nível de acesso permite apenas visualização de oportunidades.',
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
        showTopico,
        showTimeline,
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
        showTopico,
        showTimeline,
      });

      const isExistingOpportunity = Boolean(opportunity?.id);
      if (!isCreating && !isExistingOpportunity) {
        throw new Error('Oportunidade não encontrada para edição');
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

      navigate('/oportunidades');
    } catch (err) {
      setNoticeMessage(err.message || 'Não foi possível salvar a oportunidade');
    }
  };

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

      {isReadOnlyMode ? (
        <p className={styles.noticeText}>
          Modo somente visualização ativo para o seu nível de acesso.
        </p>
      ) : null}

      <OpportunitySummary
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
      />

      {showPipeline && (
        <div className={isEditing ? styles.editableSection : ''}>
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
            stages={stages}
            setStages={setStages}
            pipelineTitle={pipelineTitle}
            setPipelineTitle={setPipelineTitle}
            pipelineSubtitle={pipelineSubtitle}
            setPipelineSubtitle={setPipelineSubtitle}
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

      <div className={styles.contentGrid}>
        <TopicCard
          showTopico={showTopico}
          isEditing={isEditing}
          showPipeline={showPipeline}
          infoRows={infoRows}
          setInfoRows={setInfoRows}
          isBpmnDrivenPipeline={isBpmnDrivenPipeline}
          toggleTopico={toggleTopico}
        />

        {!showTopico && isEditing && (
          <HiddenSection
            label="Tópico oculto"
            buttonLabel="Mostrar Tópico"
            onShow={toggleTopico}
          />
        )}

        <TimelineCard
          showTimeline={showTimeline}
          isEditing={isEditing}
          showPipeline={showPipeline}
          toggleTimeline={toggleTimeline}
          timelineItems={timelineItems}
        />

        {!showTimeline && isEditing && (
          <HiddenSection
            label="Linha do Tempo oculta"
            buttonLabel="Mostrar Linha do Tempo"
            onShow={toggleTimeline}
          />
        )}
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
          onConfirm={() => setNoticeMessage('')}
          onCancel={() => setNoticeMessage('')}
          confirmLabel="OK"
          hideCancel
        />
      ) : null}
    </section>
  );
};

export default OpportunityDetail;
