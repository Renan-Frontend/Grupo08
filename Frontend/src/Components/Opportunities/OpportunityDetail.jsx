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
import WorkflowPanel from './Detail/WorkflowPanel';
import {
  buildOpportunityAutoTimelineItems,
  buildBpmnEntitiesForCatalog,
  buildEntidadesSyncOperations,
  buildOpportunityPayload,
  deleteOpportunity,
  saveOpportunity,
} from './Detail/opportunityService';
import { getUserDisplayName } from './opportunityOwnershipRules';
import { getAuthToken, fetchOpportunitiesPage } from './opportunityApi';
import { isReadOnlyAccessLevelOne } from '../../Utils/accessControl';

const OpportunityDetail = () => {
  const { user } = useContext(UserContext);
  const { entidades, adicionarEntidade, editarEntidade } =
    useContext(EntidadesContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();
  const locationOpportunity = location.state?.opportunity || null;
  const [opportunity, setOpportunity] = React.useState(locationOpportunity);
  const owner = getUserDisplayName(user) || 'Nome da conta';
  const actorId = String(user?.id || user?._id || user?.userId || '').trim();
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const [noticeMessage, setNoticeMessage] = React.useState('');

  // When navigating from Workflows, only {id, name} is passed.
  // Fetch the full opportunity so BPMN/pipeline data is available.
  React.useEffect(() => {
    if (!opportunity?.id || opportunity?.bpmn || opportunity?.stages) return;
    let cancelled = false;
    const fetchFull = async () => {
      try {
        const token = getAuthToken();
        const res = await fetchOpportunitiesPage({ page: 1, limit: 200, token });
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        const full = rows.find((r) => String(r?.id ?? '') === String(opportunity.id));
        if (full) setOpportunity(full);
      } catch {
        // silent — keep minimal object
      }
    };
    fetchFull();
    return () => { cancelled = true; };
  }, [opportunity]);

  const [workflowActive, setWorkflowActive] = React.useState(false);
  const [visibleStageCount, setVisibleStageCount] = React.useState(null);
  const [workflowCurrentNodeId, setWorkflowCurrentNodeId] = React.useState(null);
  const [workflowExecuted, setWorkflowExecuted] = React.useState([]);
  const [workflowNote, setWorkflowNote] = React.useState(null);
  const [isSavingPipeline, setIsSavingPipeline] = React.useState(false);
  const [pipelineSaveMsg, setPipelineSaveMsg] = React.useState('');
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

  const handleSavePipelineOnly = React.useCallback(async () => {
    if (isReadOnlyMode || isCreating || !opportunity?.id) return;
    setIsSavingPipeline(true);
    setPipelineSaveMsg('');
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
        showTopico,
        showTimeline,
      });
      await saveOpportunity({ payload, token, isCreating: false, opportunityId: opportunity.id });
      setPipelineSaveMsg('Pipeline salva!');
      setTimeout(() => setPipelineSaveMsg(''), 2500);
    } catch (err) {
      setPipelineSaveMsg(err.message || 'Erro ao salvar');
      setTimeout(() => setPipelineSaveMsg(''), 3000);
    } finally {
      setIsSavingPipeline(false);
    }
  }, [
    isReadOnlyMode, isCreating, opportunity?.id,
    title, selectedOwner, owner, createdDate, endDate, effectiveStatus,
    stages, infoRows, pipelineTitle, pipelineSubtitle, timelineItems,
    showPipeline, showTopico, showTimeline,
  ]);

  const handleWorkflowStateChange = React.useCallback(
    (newState) => {
      const workflowStatus = newState?.workflowStatus ?? newState?.status ?? null;
      const currentNodeId = String(newState?.currentNodeId || '').trim();

      // Capture executed steps and current node for dynamic pipeline injection
      if (Array.isArray(newState?.executed)) {
        setWorkflowExecuted(newState.executed);
      } else if (!newState) {
        setWorkflowExecuted([]);
      }
      setWorkflowCurrentNodeId(currentNodeId || null);

      // When workflow completes, deactivate so manual stage clicks work again
      if (workflowStatus === 'completed') {
        setWorkflowActive(false);
      }

      setStages((prev) => {
        // All stages done when workflow is completed
        if (workflowStatus === 'completed') {
          return prev.map((stage) => ({ ...stage, done: true, pending: false }));
        }

        // Not started or no current node → reset all to not done
        if (!workflowStatus || workflowStatus === 'not_started' || !currentNodeId) {
          return prev.map((stage) => ({ ...stage, done: false, pending: false }));
        }

        // Build a set of completed node IDs from the executed history
        const executedNodeIds = new Set(
          Array.isArray(newState?.executed)
            ? newState.executed
                .filter((s) => s?.status === 'completed')
                .map((s) => String(s.nodeId || ''))
            : [],
        );

        // All executed node IDs (any status) — used to identify the current node
        const allExecutedIds = new Set(
          Array.isArray(newState?.executed)
            ? newState.executed.map((s) => String(s.nodeId || ''))
            : [],
        );

        // When running (not paused), also count the current node as reached
        if (workflowStatus === 'running') {
          executedNodeIds.add(currentNodeId);
        }

        // Try to find the active stage index by sourceNodeId match
        let activeIndex = prev.findIndex(
          (stage) => String(stage.sourceNodeId || '') === currentNodeId,
        );

        // Fall back to numeric stageIndex
        if (activeIndex < 0) {
          const stageIndex =
            typeof newState?.stageIndex === 'number' ? newState.stageIndex : -1;
          if (stageIndex >= 0) activeIndex = Math.min(stageIndex, prev.length - 1);
        }

        // Pipeline sync rules:
        // - task: workflow stops here (user must confirm completion) → NOT done yet
        // - condicional: workflow stops here (user must choose Sim/Não) → NOT done yet
        // - entidade: pass-through, marked done as soon as workflow arrives
        const currentStageType = activeIndex >= 0 ? prev[activeIndex]?.stageType : null;
        const isStopPoint =
          currentStageType === 'task' || currentStageType === 'condicional';
        // Fallback to pausedReason when stageType is not available
        // task → user_input, condicional → decision
        const pausedReason = newState?.workflowPausedReason ?? newState?.paused_reason ?? null;
        const isStopPointFallback =
          pausedReason === 'decision' ||
          pausedReason === 'decision_required' ||
          pausedReason === 'user_input' ||
          pausedReason === 'user_action_required';
        const shouldHoldCurrent =
          workflowStatus === 'paused' &&
          (currentStageType ? isStopPoint : isStopPointFallback);
        // The pending stage is the one the workflow is currently waiting on
        const pendingIndex = shouldHoldCurrent ? activeIndex : -1;

        return prev.map((stage, i) => {
          const nodeId = String(stage.sourceNodeId || '');
          // Mark done only based on the executed history (not by index position)
          // This ensures stages from non-taken branches aren't wrongly marked
          const byExecuted = nodeId && executedNodeIds.has(nodeId);
          // For the current (held) stage, it's not done yet but it is pending
          const isPending = i === pendingIndex;
          return { ...stage, done: byExecuted && !isPending, pending: isPending };
        });
      });

      // Progressive reveal: update how many stages are visible
      if (workflowStatus === 'completed') {
        setVisibleStageCount(null); // show all on completion
      } else if (!workflowStatus || workflowStatus === 'not_started' || !currentNodeId) {
        setVisibleStageCount(null); // show all when workflow is off
      } else {
        const stageIdx = typeof newState?.stageIndex === 'number' ? newState.stageIndex : 0;
        setVisibleStageCount((prev) => {
          const target = stageIdx + 1; // reveal up to and including current stage
          return prev === null ? target : Math.max(prev, target);
        });
      }
    },
    [setStages, setVisibleStageCount, setWorkflowExecuted, setWorkflowCurrentNodeId],
  );

  // When workflow is active, inject any executed nao-path nodes that aren't in the static stages list
  // AND filter out stages from non-taken branches so only the actual execution path is shown.
  const effectiveStages = React.useMemo(() => {
    if (!workflowActive || workflowExecuted.length === 0) return stages;

    const executedNodeIds = new Set(
      workflowExecuted.map((e) => String(e?.nodeId || '')).filter(Boolean),
    );

    const existingIds = new Set(stages.map((s) => String(s.sourceNodeId || '')).filter(Boolean));

    // Build extra stages from executed nodes not already in stages (alternate-path nodes)
    // Deduplicate by nodeId — keep the last occurrence (most recent status)
    const seenExtraIds = new Set();
    const extras = workflowExecuted
      .filter((e) => e?.nodeId && !existingIds.has(String(e.nodeId)))
      .reduceRight((acc, e) => {
        const nid = String(e.nodeId);
        if (seenExtraIds.has(nid)) return acc;
        seenExtraIds.add(nid);
        acc.unshift({
          id: `exec-${e.nodeId}`,
          label: String(e.label || e.nodeId),
          done: e.status === 'completed',
          pending: e.status === 'waiting_user' || e.status === 'waiting_decision',
          fromBpmn: true,
          sourceNodeId: String(e.nodeId),
          stageType: e.nodeType || 'task',
          dynamic: true,
        });
        return acc;
      }, []);

    // Find the last static stage that was executed — any static stages AFTER it
    // on the primary path are future stages that the workflow will still reach
    // (e.g. merge-point nodes after a gateway).
    let lastExecutedStaticIdx = -1;
    stages.forEach((s, i) => {
      if (executedNodeIds.has(String(s.sourceNodeId || ''))) lastExecutedStaticIdx = i;
    });

    // Filter static stages: keep executed ones + future ones after the last executed
    // This removes only stages from non-taken branches that are positioned BETWEEN
    // executed stages in the BFS order.
    const filtered = stages.filter((s, i) => {
      const nodeId = String(s.sourceNodeId || '');
      if (executedNodeIds.has(nodeId)) return true;
      // Keep stages that come after the last executed stage (future primary-path stages)
      if (i > lastExecutedStaticIdx) return true;
      return false;
    });

    if (extras.length === 0) return filtered;

    // Insert each extra node right after the node that precedes it in the executed sequence
    const result = [...filtered];
    for (const extra of extras) {
      const execIdx = workflowExecuted.findIndex((e) => e?.nodeId === extra.sourceNodeId);
      if (execIdx > 0) {
        const prevNodeId = String(workflowExecuted[execIdx - 1]?.nodeId || '');
        const insertAfterIdx = result.findIndex((s) => String(s.sourceNodeId || '') === prevNodeId);
        if (insertAfterIdx >= 0) {
          result.splice(insertAfterIdx + 1, 0, extra);
        } else {
          result.push(extra);
        }
      } else {
        result.unshift(extra);
      }
    }
    return result;
  }, [workflowActive, workflowExecuted, stages]);

  // When workflow is active, effectiveStages already filters to only the execution path.
  // We still slice up to the current node for progressive reveal.
  const stagesToDisplay = React.useMemo(() => {
    if (!workflowActive) return effectiveStages;
    if (!workflowCurrentNodeId) return effectiveStages;
    const idx = effectiveStages.findIndex(
      (s) => String(s.sourceNodeId || '') === workflowCurrentNodeId,
    );
    if (idx >= 0) return effectiveStages.slice(0, idx + 1);
    // current node not in effectiveStages — show all executed stages
    return effectiveStages;
  }, [workflowActive, workflowCurrentNodeId, effectiveStages]);

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
            isReadOnlyMode={isReadOnlyMode}
            isWorkflowActive={workflowActive}
            stages={workflowActive ? stagesToDisplay : effectiveStages}
            setStages={setStages}
            infoRows={infoRows}
            pipelineTitle={pipelineTitle}
            setPipelineTitle={setPipelineTitle}
            pipelineSubtitle={pipelineSubtitle}
            setPipelineSubtitle={setPipelineSubtitle}            noteOverride={workflowNote}            workflowSlot={
              (isBpmnDrivenPipeline || opportunity?.bpmn?.nodes?.length > 0) && !isCreating ? (
                <WorkflowPanel
                  compact
                  inCard
                  opportunity={opportunity}
                  stages={stages}
                  onStateChange={handleWorkflowStateChange}
                  isWorkflowActive={workflowActive}
                  onActivate={() => {
                    setStages((prev) =>
                      prev
                        .filter((s) => !s.dynamic)
                        .map((s) => ({ ...s, done: false, pending: false }))
                    );
                    setWorkflowExecuted([]);
                    setWorkflowCurrentNodeId(null);
                    setWorkflowNote(null);
                    setVisibleStageCount(1);
                    setWorkflowActive(true);
                  }}
                  onDeactivate={() => {
                    const visitedIds = new Set(
                      stagesToDisplay.map((s) => String(s.sourceNodeId || s.id || ''))
                    );
                    setStages(
                      effectiveStages.map((s) => ({
                        ...s,
                        done: visitedIds.has(String(s.sourceNodeId || s.id || '')) ? s.done : false,
                        pending: false,
                      }))
                    );
                    setWorkflowActive(false);
                    setVisibleStageCount(null);
                    setWorkflowCurrentNodeId(null);
                    setWorkflowExecuted([]);
                    setWorkflowNote(null);
                  }}
                  onHintChange={setWorkflowNote}
                />
              ) : null
            }
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
          isReadOnlyMode={isReadOnlyMode}
          showTopico={showTopico}
          isEditing={isEditing}
          showPipeline={showPipeline}
          infoRows={infoRows}
          setInfoRows={setInfoRows}
          isBpmnDrivenPipeline={isBpmnDrivenPipeline}
          toggleTopico={toggleTopico}
          workflowActive={workflowActive}
          workflowExecuted={workflowExecuted}
          workflowCurrentNodeId={workflowCurrentNodeId}
          bpmnNodes={opportunity?.bpmn?.nodes}
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
