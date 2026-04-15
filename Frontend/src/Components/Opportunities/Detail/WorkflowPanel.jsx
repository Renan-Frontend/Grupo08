import React from 'react';
import { WORKFLOW_RUN, WORKFLOW_ADVANCE, WORKFLOW_GENERATE_OBJECTIVE, WORKFLOW_GENERATE_REPORT, WORKFLOW_STATE_GET } from '../../../Api';
import { getAuthToken } from '../opportunityApi';
import styles from './WorkflowPanel.module.css';

const NODE_TYPE_LABEL = {
  task: 'Atividade',
  condicional: 'Gateway',
  entidade: 'Entidade',
};

const GATEWAY_TYPE_LABEL = {
  xor: 'XOR — Exclusivo',
  and: 'AND — Paralelo',
  or: 'OR — Inclusivo',
};

const callApi = async (req) => {
  const res = await fetch(req.url, req.options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    // Backend validation returns {message, errors[]}
    if (detail && typeof detail === 'object' && detail.errors) {
      const err = new Error(detail.message || `HTTP ${res.status}`);
      err.errors = detail.errors;
      throw err;
    }
    throw new Error(typeof detail === 'string' ? detail : `HTTP ${res.status}`);
  }
  return res.json();
};

const WorkflowPanel = ({ opportunity, stages = [], onStateChange, compact = false, inCard = false, isWorkflowActive = false, onActivate, onDeactivate, onHintChange }) => {
  const token = getAuthToken();
  const [workflowState, setWorkflowState] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [decisionDraft, setDecisionDraft] = React.useState('');
  const [executedSteps, setExecutedSteps] = React.useState([]);
  const [objective, setObjective] = React.useState(null);
  const [objectiveBusy, setObjectiveBusy] = React.useState(false);
  const [reportBusy, setReportBusy] = React.useState(false);
  const [formData, setFormData] = React.useState({});
  const [fieldErrors, setFieldErrors] = React.useState({});
  const decisionInputRef = React.useRef(null);

  const nodes = React.useMemo(
    () => opportunity?.bpmn?.nodes ?? [],
    [opportunity],
  );
  const connections = React.useMemo(
    () => opportunity?.bpmn?.connections ?? [],
    [opportunity],
  );

  const applyState = (state) => {
    // Normalize: run/advance use `status`/`paused_reason`, state endpoint uses `workflowStatus`/`workflowPausedReason`
    const normalized = {
      ...state,
      workflowStatus: state.workflowStatus ?? state.status ?? null,
      workflowPausedReason: state.workflowPausedReason ?? state.paused_reason ?? null,
    };
    setWorkflowState(normalized);
    if (Array.isArray(state.executed)) {
      setExecutedSteps(state.executed);
    }
    onStateChange?.(normalized);
  };

  // Auto-resume: load persisted workflow state on mount
  const resumeRan = React.useRef(false);
  React.useEffect(() => {
    if (!opportunity?.id || !token || resumeRan.current) return;
    resumeRan.current = true;
    let cancelled = false;
    (async () => {
      try {
        const req = WORKFLOW_STATE_GET(opportunity.id, token);
        const res = await fetch(req.url, req.options);
        if (!res.ok || cancelled) return;
        const state = await res.json();
        const status = state?.workflowStatus ?? state?.status ?? 'not_started';
        if (status !== 'not_started' && !cancelled) {
          onActivate?.();
          const normalized = {
            ...state,
            workflowStatus: state.workflowStatus ?? state.status ?? null,
            workflowPausedReason: state.workflowPausedReason ?? state.paused_reason ?? null,
          };
          setWorkflowState(normalized);
          if (Array.isArray(state.executed)) {
            setExecutedSteps(state.executed);
          }
          onStateChange?.(normalized);
        }
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id, token]);

  const handleDeactivate = () => {
    setWorkflowState(null);
    setExecutedSteps([]);
    setError('');
    setObjective(null);
    setFormData({});
    onDeactivate?.();
  };

  const generateObjective = React.useCallback(async () => {
    setObjectiveBusy(true);
    try {
      const res = await fetch(
        WORKFLOW_GENERATE_OBJECTIVE(opportunity.id, token).url,
        WORKFLOW_GENERATE_OBJECTIVE(opportunity.id, token).options,
      );
      if (res.ok) {
        const data = await res.json();
        setObjective(data);
      }
    } catch {
      // silently fail — objective is optional
    } finally {
      setObjectiveBusy(false);
    }
  }, [opportunity.id, token]);

  const buildReportHtml = React.useCallback(async () => {
    const req = WORKFLOW_GENERATE_REPORT(opportunity.id, { executed: executedSteps }, token);
    const res = await fetch(req.url, req.options);
    const report = res.ok ? await res.json() : null;

    const now = new Date().toLocaleString('pt-BR');
    const docTitle = report?.documentTitle || objective?.objective || opportunity?.nome || 'Documento';
    const bpmnName = report?.bpmnName || opportunity?.nome || '';

    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const sectionsHtml = (report?.sections ?? [])
      .filter((s) => s.heading || s.body)
      .map(
        (s) => `
        <div class="section">
          <h2>${esc(s.heading)}</h2>
          <p>${esc(s.body)}</p>
        </div>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${esc(docTitle)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 48px auto; color: #1a1a1a; font-size: 11pt; line-height: 1.7; }
    .letterhead { display: flex; align-items: center; gap: 1rem; border-bottom: 2px solid #1e9158; padding-bottom: 0.75rem; margin-bottom: 1.5rem; }
    .letterhead-brand { font-family: Arial, sans-serif; font-size: 0.8rem; font-weight: 700; color: #1e9158; letter-spacing: 0.05em; text-transform: uppercase; }
    .letterhead-sub { font-family: Arial, sans-serif; font-size: 0.7rem; color: #888; }
    h1 { font-family: Arial, sans-serif; font-size: 1.45rem; color: #111; margin-bottom: 0.15rem; font-weight: 700; }
    .doc-meta { font-family: Arial, sans-serif; font-size: 0.78rem; color: #666; margin-bottom: 1.6rem; }
    .preamble { font-style: italic; color: #333; margin-bottom: 1.6rem; border-left: 3px solid #1e9158; padding-left: 0.85rem; }
    .section { margin-bottom: 1.5rem; }
    .section h2 { font-family: Arial, sans-serif; font-size: 0.95rem; font-weight: 700; color: #1e9158; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.45rem; border-bottom: 1px solid #d1fae5; padding-bottom: 0.2rem; }
    .section p { font-size: 10.5pt; }
    .conclusion { margin-top: 2rem; padding: 0.85rem 1rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; font-family: Arial, sans-serif; font-size: 0.9rem; color: #14532d; }
    .signature { margin-top: 3rem; display: flex; justify-content: flex-end; }
    .signature-block { text-align: center; border-top: 1px solid #aaa; padding-top: 0.4rem; min-width: 220px; font-family: Arial, sans-serif; font-size: 0.8rem; color: #555; }
    .footer { margin-top: 2.5rem; font-family: Arial, sans-serif; font-size: 0.72rem; color: #aaa; border-top: 1px solid #eee; padding-top: 0.5rem; }
    @media print { body { margin: 24px 32px; } }
  </style>
</head>
<body>
  <div class="letterhead">
    <div>
      <div class="letterhead-brand">BP-Company</div>
      <div class="letterhead-sub">Sistema de Gestão de Processos</div>
    </div>
  </div>

  <h1>${esc(docTitle)}</h1>
  <div class="doc-meta">Processo: ${esc(bpmnName)} &nbsp;|&nbsp; Emitido em: ${now}</div>

  ${report?.preamble ? `<p class="preamble">${esc(report.preamble)}</p>` : ''}

  ${sectionsHtml}

  ${report?.conclusion ? `<div class="conclusion">${esc(report.conclusion)}</div>` : ''}

  <div class="signature">
    <div class="signature-block">Assinatura / Aprovação</div>
  </div>

  <div class="footer">Documento gerado automaticamente pelo Workflow BPMN &middot; BP-Company &middot; ${now}</div>
</body>
</html>`;

    return html;
  }, [executedSteps, objective, opportunity, token]);

  const _openHtmlInTab = (html, autoPrint = false) => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) { URL.revokeObjectURL(url); return; }
    if (autoPrint) {
      win.addEventListener('load', () => {
        win.print();
        win.addEventListener('afterprint', () => { win.close(); URL.revokeObjectURL(url); });
      });
    } else {
      win.addEventListener('load', () => URL.revokeObjectURL(url));
    }
  };

  const handleDownloadPdf = React.useCallback(async () => {
    if (reportBusy) return;
    setReportBusy(true);
    try {
      const html = await buildReportHtml();
      _openHtmlInTab(html, true);
    } catch {
      // silently fail
    } finally {
      setReportBusy(false);
    }
  }, [reportBusy, buildReportHtml]);

  const handleViewReport = React.useCallback(async () => {
    if (reportBusy) return;
    setReportBusy(true);
    try {
      const html = await buildReportHtml();
      _openHtmlInTab(html, false);
    } catch {
      // silently fail
    } finally {
      setReportBusy(false);
    }
  }, [reportBusy, buildReportHtml]);

  const handleRun = async () => {
    onActivate?.();
    setBusy(true);
    setError('');
    setExecutedSteps([]);
    setObjective(null);
    setFormData({});
    try {
      const state = await callApi(WORKFLOW_RUN(opportunity.id, {}, token));
      applyState(state);
      if ((state.workflowStatus ?? state.status) === 'completed') {
        generateObjective();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAdvance = async (body) => {
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const state = await callApi(WORKFLOW_ADVANCE(opportunity.id, body, token));
      applyState(state);
      setDecisionDraft('');
      setFormData({});
      if ((state.workflowStatus ?? state.status) === 'completed') {
        generateObjective();
      }
    } catch (err) {
      // Handle backend validation errors (422)
      if (err.errors && Array.isArray(err.errors)) {
        const mapped = {};
        err.errors.forEach((msg) => {
          const match = msg.match(/^Campo '([^']+)'/);
          if (match) mapped[match[1]] = msg;
          else mapped['_general'] = msg;
        });
        setFieldErrors(mapped);
      }
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const workflowStatus = workflowState?.workflowStatus ?? null;
  const pausedReason = workflowState?.workflowPausedReason ?? null;

  React.useEffect(() => {
    if (pausedReason === 'decision' || pausedReason === 'decision_required') {
      const id = window.setTimeout(() => decisionInputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [pausedReason]);
  const currentNodeId = workflowState?.currentNodeId ?? null;
  const stageIndex = workflowState?.stageIndex ?? 0;
  const totalNodes = workflowState?.totalNodes ?? null;

  const currentNode = React.useMemo(
    () => nodes.find((n) => n.id === currentNodeId) ?? null,
    [nodes, currentNodeId],
  );

  // Fields defined for the current task node (for dynamic form rendering)
  // Prefer formSchema from pendingTask API (backend-validated), fallback to BPMN node fields
  const taskFields = React.useMemo(() => {
    const apiSchema = workflowState?.pendingTask?.formSchema;
    if (Array.isArray(apiSchema) && apiSchema.length > 0) return apiSchema;
    if (!currentNode) return [];
    return (
      currentNode.selectedEntityFields ??
      currentNode.campos ??
      []
    ).filter(Boolean);
  }, [currentNode, workflowState?.pendingTask?.formSchema]);

  // Form is valid if all required fields are filled (+ type checks)
  const isFormValid = React.useMemo(() => {
    return taskFields
      .filter((f) => f.obrigatorio)
      .every((f) => {
        const v = formData[f.nome];
        if (v === undefined || v === null) return false;
        if (typeof v === 'boolean') return true; // checkbox: false is valid choice
        return String(v).trim() !== '';
      });
  }, [taskFields, formData]);

  const statusLabel = {
    not_started: 'Não iniciado',
    running: 'Em execução',
    paused: 'Pausado',
    completed: 'Concluído',
    stopped: 'Interrompido',
  }[workflowStatus] ?? (workflowStatus ?? 'Não iniciado');

  const statusMod = {
    not_started: styles.statusIdle,
    running: styles.statusRunning,
    paused: styles.statusPaused,
    completed: styles.statusDone,
    stopped: styles.statusPaused,
  }[workflowStatus] ?? styles.statusIdle;

  /** Render a single dynamic form field based on its schema definition. */
  const renderFormField = (field) => {
    const key = field.nome;
    const label = field.label || field.nome;
    const tipo = field.tipo || 'texto';
    const opcoes = field.opcoes || [];
    const errMsg = fieldErrors[label] || fieldErrors[key] || null;

    let input;
    if (tipo === 'boolean' || tipo === 'checkbox') {
      input = (
        <label className={styles.taskFormCheckboxLabel}>
          <input
            type="checkbox"
            name={`taskForm_${key}`}
            checked={!!formData[key]}
            onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.checked }))}
          />
          {label}
        </label>
      );
    } else if (tipo === 'textarea') {
      input = (
        <textarea
          className={`${styles.taskFormInput} ${styles.taskFormTextarea || ''}`}
          name={`taskForm_${key}`}
          value={formData[key] ?? ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
          placeholder={field.placeholder || field.descricao || key}
          rows={3}
        />
      );
    } else if (tipo === 'select' || (opcoes.length > 0 && tipo !== 'number')) {
      input = (
        <select
          className={styles.taskFormInput}
          name={`taskForm_${key}`}
          value={formData[key] ?? ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
        >
          <option value="">{field.placeholder || `Selecione ${label}`}</option>
          {opcoes.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    } else {
      const htmlType =
        tipo === 'numero' || tipo === 'number' ? 'number'
        : tipo === 'data' || tipo === 'date' ? 'date'
        : tipo === 'email' ? 'email'
        : 'text';
      input = (
        <input
          className={styles.taskFormInput}
          name={`taskForm_${key}`}
          type={htmlType}
          value={formData[key] ?? ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
          placeholder={field.placeholder || field.descricao || key}
        />
      );
    }

    return (
      <div key={field.id || key} className={styles.taskFormField}>
        {tipo !== 'boolean' && tipo !== 'checkbox' && (
          <label className={styles.taskFormLabel}>
            {label}{field.obrigatorio ? <span className={styles.taskFormRequired}> *</span> : ''}
          </label>
        )}
        {input}
        {errMsg && <span className={styles.taskFormError}>{errMsg}</span>}
      </div>
    );
  };

  const currentNodeName =
    currentNode?.label ||
    currentNode?.taskNome ||
    currentNode?.condicionalNome ||
    currentNode?.entidadeNome ||
    null;

  React.useEffect(() => {
    if (!compact || !onHintChange) return;
    if (workflowStatus === 'paused') {
      if (pausedReason === 'user_input' || pausedReason === 'user_action_required') {
        onHintChange(`Atividade pendente: complete "${currentNodeName ?? 'atividade'}" e clique em concluir.`);
      } else if (pausedReason === 'decision' || pausedReason === 'decision_required') {
        onHintChange(`Decisão: "${currentNodeName ?? 'condição'}" — escolha Sim ou Não para continuar.`);
      } else {
        onHintChange(null);
      }
    } else {
      onHintChange(null);
    }
  }, [compact, onHintChange, workflowStatus, pausedReason, currentNodeName]);

  if (!nodes.length) return null;

  const allStagesDone = stages.length > 0;

  const outgoingConnections = connections.filter(
    (c) => c.from === currentNodeId,
  );

  /* ── Compact + inCard (green pipeline card — column layout) ── */
  if (compact && inCard) {
    return (
      <div className={`${styles.compactStrip} ${styles.compactStripInCard}`}>
        <span className={styles.compactLabel}>⚙ Workflow BPMN</span>
        <div className={styles.compactCardBtns}>
          {(!workflowStatus || workflowStatus === 'not_started' || workflowStatus === 'completed') && (
            <button
              className={styles.compactBtn}
              onClick={handleRun}
              disabled={busy}
            >
              {busy ? '…' : workflowStatus === 'completed' ? '↺ Reiniciar' : '▶ Iniciar'}
            </button>
          )}
          {workflowStatus && workflowStatus !== 'not_started' && (
            <button
              className={`${styles.compactBtn} ${styles.compactBtnYes}`}
              onClick={handleDeactivate}
              title="Salvar progresso do workflow na pipeline"
            >
              ✓ Salvar
            </button>
          )}
          {workflowStatus === 'paused' &&
            (pausedReason === 'user_input' || pausedReason === 'user_action_required') && (
              <>
                {taskFields.length > 0 && (
                  <div className={styles.taskFormBlock}>
                    {currentNodeName && (
                      <span className={styles.taskFormTitle}>{currentNodeName}</span>
                    )}
                    {taskFields.map(renderFormField)}
                  </div>
                )}
                <button
                  className={`${styles.compactBtn} ${styles.compactBtnYes}`}
                  onClick={() => handleAdvance({ nodeId: currentNodeId, completed: true, formData })}
                  disabled={busy || !isFormValid}
                >
                  {busy ? '…' : '✓ Concluir atividade'}
                </button>
              </>
            )}

          {workflowStatus === 'paused' &&
            (pausedReason === 'decision' || pausedReason === 'decision_required') && (
              <div className={styles.compactCardDecisionRow}>
                <button
                  className={`${styles.compactBtn} ${styles.compactBtnNo}`}
                  onClick={() => handleAdvance({ nodeId: currentNodeId, decision: 'nao' })}
                  disabled={busy || !allStagesDone}
                >
                  ✕ Não
                </button>
                <button
                  className={`${styles.compactBtn} ${styles.compactBtnYes}`}
                  onClick={() => handleAdvance({ nodeId: currentNodeId, decision: 'sim' })}
                  disabled={busy || !allStagesDone}
                >
                  ✓ Sim
                </button>
              </div>
            )}
        </div>
        {workflowStatus === 'completed' && (
          <div className={`${styles.compactCardBtns} ${styles.compactCardBtnsSep}`}>
            <button
              className={styles.compactBtn}
              onClick={handleDownloadPdf}
              disabled={reportBusy}
              title="Gerar e baixar relatório como PDF"
            >
              {reportBusy ? '⏳…' : '📄 Baixar PDF'}
            </button>
            <button
              className={styles.compactBtn}
              onClick={handleViewReport}
              disabled={reportBusy}
              title="Visualizar relatório completo em nova aba"
            >
              {reportBusy ? '⏳…' : '🔍 Visualizar'}
            </button>
          </div>
        )}
        {error && <p className={`${styles.errorMsg} ${styles.compactError}`}>{error}</p>}
      </div>
    );
  }

  /* ── Compact / embedded strip (horizontal) ────────────────── */
  if (compact) {
    return (
      <div className={styles.compactStrip}>
        <div className={styles.compactRow}>
          <span className={styles.compactLabel}>⚙ Workflow BPMN</span>
          {/* ── Left: Iniciar / Salvar ── */}
          <div className={styles.compactLeft}>
            {(!workflowStatus || workflowStatus === 'not_started' || workflowStatus === 'completed') && (
              <button
                className={styles.compactBtn}
                onClick={handleRun}
                disabled={busy || (!allStagesDone && workflowStatus !== 'completed')}
              >
                {busy ? '…' : workflowStatus === 'completed' ? '↺ Reiniciar' : '▶ Iniciar'}
              </button>
            )}
            {workflowStatus && workflowStatus !== 'not_started' && (
              <button
                className={`${styles.compactBtn} ${styles.compactBtnYes}`}
                onClick={handleDeactivate}
                title="Salvar progresso do workflow na pipeline"
              >
                ✓ Salvar
              </button>
            )}
          </div>

          {/* ── Center: info ── */}
          <div className={styles.compactInfo}>
            {currentNodeName && workflowStatus && workflowStatus !== 'not_started' && (
              <span className={styles.compactNode}>
                {currentNodeName}
                <span className={styles.nodeTypeBadge} data-type={currentNode.nodeType}>
                  {NODE_TYPE_LABEL[currentNode.nodeType] ?? currentNode.nodeType}
                </span>
              </span>
            )}
          </div>

          {/* ── Right: Concluir / Sim / Não ── */}
          <div className={styles.compactRight}>
            {workflowStatus === 'paused' &&
              (pausedReason === 'decision' || pausedReason === 'decision_required') && (
                <div className={styles.compactDecision}>
                  <span className={styles.compactDecisionLabel}>Decisão:</span>
                  <button
                    className={`${styles.compactBtn} ${styles.compactBtnNo}`}
                    onClick={() => handleAdvance({ nodeId: currentNodeId, decision: 'nao' })}
                    disabled={busy || !allStagesDone}
                  >
                    ✕ Não
                  </button>
                  <button
                    className={`${styles.compactBtn} ${styles.compactBtnYes}`}
                    onClick={() => handleAdvance({ nodeId: currentNodeId, decision: 'sim' })}
                    disabled={busy || !allStagesDone}
                  >
                    ✓ Sim
                  </button>
                </div>
              )}
            {workflowStatus === 'paused' &&
              (pausedReason === 'user_input' || pausedReason === 'user_action_required') && (
                <button
                  className={`${styles.compactBtn} ${styles.compactBtnYes}`}
                  onClick={() => handleAdvance({ nodeId: currentNodeId, completed: true })}
                  disabled={busy || !allStagesDone}
                >
                  {busy ? '…' : '✓ Concluir atividade'}
                </button>
              )}
          </div>
        </div>

        {workflowStatus === 'completed' && (
          <span className={styles.compactCompletedMsg}>Workflow concluído!</span>
        )}
        {error && <p className={`${styles.errorMsg} ${styles.compactError}`}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Workflow BPMN</span>
        <span className={`${styles.statusBadge} ${statusMod}`}>
          {statusLabel}
        </span>
        {workflowState?.bpmnVersion && (
          <span className={styles.versionTag}>v{workflowState.bpmnVersion}</span>
        )}
        {currentNode && (
          <span className={styles.currentNodeLabel}>
            Nó atual:{' '}
            <strong>
              {currentNode.label ||
                currentNode.taskNome ||
                currentNode.condicionalNome ||
                currentNode.entidadeNome ||
                currentNodeId}
            </strong>
          </span>
        )}
      </div>

      {/* Current node details */}
      {currentNode && (
        <div className={styles.nodeCard}>
          <div className={styles.nodeCardHeader}>
            <span className={styles.nodeCardTitle}>
              {currentNode.label ||
                currentNode.taskNome ||
                currentNode.condicionalNome ||
                currentNode.entidadeNome ||
                'Etapa atual'}
            </span>
            <span
              className={styles.nodeTypeBadge}
              data-type={currentNode.nodeType}
            >
              {NODE_TYPE_LABEL[currentNode.nodeType] ?? currentNode.nodeType}
            </span>
            {currentNode.isPrimaryEntity && (
              <span className={styles.primaryBadge}>primária</span>
            )}
          </div>

          <div className={styles.nodeCardBody}>
            {/* Task */}
            {currentNode.nodeType === 'task' && (
              <>
                {currentNode.taskNome && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Atividade</span>
                    <span className={styles.detailVal}>
                      {currentNode.taskNome}
                    </span>
                  </div>
                )}
                {currentNode.taskDescricao && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Descrição</span>
                    <span className={styles.detailVal}>
                      {currentNode.taskDescricao}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Condicional */}
            {currentNode.nodeType === 'condicional' && (
              <>
                {currentNode.condicionalNome && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Decisão</span>
                    <span className={styles.detailVal}>
                      {currentNode.condicionalNome}
                    </span>
                  </div>
                )}
                {currentNode.condicionalDescricao && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Descrição</span>
                    <span className={styles.detailVal}>
                      {currentNode.condicionalDescricao}
                    </span>
                  </div>
                )}
                {currentNode.gatewayType && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Tipo</span>
                    <span className={styles.detailVal}>
                      {GATEWAY_TYPE_LABEL[currentNode.gatewayType] ??
                        currentNode.gatewayType}
                    </span>
                  </div>
                )}
                {outgoingConnections.length > 0 && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Caminhos</span>
                    <ul className={styles.pathList}>
                      {outgoingConnections.map((conn) => {
                        const target = nodes.find((n) => n.id === conn.to);
                        const targetLabel =
                          target?.label ||
                          target?.taskNome ||
                          target?.condicionalNome ||
                          target?.entidadeNome ||
                          conn.to;
                        return (
                          <li key={conn.id} className={styles.pathItem}>
                            <span className={styles.pathCondition}>
                              {conn.decision
                                ? `"${conn.decision}"`
                                : '(sem condição)'}
                            </span>
                            <span className={styles.pathArrow}>→</span>
                            <span>{targetLabel}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Entidade */}
            {currentNode.nodeType === 'entidade' && (
              <>
                {currentNode.entidadeNome && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Entidade</span>
                    <span className={styles.detailVal}>
                      {currentNode.entidadeNome}
                    </span>
                  </div>
                )}
                {currentNode.tipoEntidade && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailKey}>Tipo</span>
                    <span className={styles.detailVal}>
                      {currentNode.tipoEntidade}
                    </span>
                  </div>
                )}
                {Array.isArray(currentNode.selectedEntityFields) &&
                  currentNode.selectedEntityFields.length > 0 && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Campos</span>
                      <table className={styles.fieldsTable}>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Tipo</th>
                            <th>Obrigatório</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentNode.selectedEntityFields.map((field) => (
                            <tr key={field.id || field.nome}>
                              <td>{field.nome || field.id}</td>
                              <td>{field.tipo || '—'}</td>
                              <td>{field.obrigatorio ? '✓' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                {Array.isArray(currentNode.selectedEntityFieldNames) &&
                  currentNode.selectedEntityFieldNames.length > 0 &&
                  !currentNode.selectedEntityFields?.length && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailKey}>Campos</span>
                      <span className={styles.detailVal}>
                        {currentNode.selectedEntityFieldNames.join(', ')}
                      </span>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      {totalNodes != null && totalNodes > 0 && workflowStatus && workflowStatus !== 'not_started' && (
        <div className={styles.progressRow}>
          <span className={styles.progressText}>
            Etapa {stageIndex + 1} de {totalNodes}
          </span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round(((stageIndex + 1) / totalNodes) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Contextual guidance */}
      {workflowStatus === 'paused' && (
        <div className={styles.guidanceBox}>
          {(pausedReason === 'user_input' || pausedReason === 'user_action_required') && (
            <>
              <p className={styles.guidanceTitle}>📋 Atividade — confirmação necessária</p>
              <p className={styles.guidanceText}>
                O workflow parou nesta <strong>atividade</strong>. Realize a atividade e, quando concluída,
                clique em <strong>"✓ Marcar atividade como concluída"</strong> para avançar.
              </p>
              {workflowState?.pendingTask && (
                <div className={styles.taskMeta}>
                  <span className={styles.taskMetaLabel}>Task #{workflowState.pendingTask.taskId}</span>
                  {workflowState.pendingTask.assignee && (
                    <span className={styles.taskMetaAssignee}>
                      Atribuído a: <strong>{workflowState.pendingTask.assignee}</strong>
                    </span>
                  )}
                  {workflowState.pendingTask.description && (
                    <span className={styles.taskMetaDesc}>{workflowState.pendingTask.description}</span>
                  )}
                </div>
              )}
            </>
          )}
          {(pausedReason === 'decision' || pausedReason === 'decision_required') && (
            <>
              <p className={styles.guidanceTitle}>🔀 Condição — escolha um caminho</p>
              <p className={styles.guidanceText}>
                O workflow está em um ponto de <strong>decisão</strong>. Escolha <strong>Sim</strong> para
                o caminho aprovado ou <strong>Não</strong> para o caminho alternativo.
                Você também pode digitar uma condição personalizada.
              </p>
            </>
          )}
        </div>
      )}

      {/* Executed steps history */}
      {executedSteps.length > 0 && (
        <details className={styles.historyDetails}>
          <summary className={styles.historySummary}>
            Histórico desta execução ({executedSteps.length} etapa{executedSteps.length !== 1 ? 's' : ''})
          </summary>
          <ol className={styles.historyList}>
            {executedSteps.map((step, idx) => (
              <li key={step.nodeId || idx} className={styles.historyItem} data-status={step.status}>
                <span className={styles.historyStatus}>
                  {step.status === 'completed' ? '✓' : step.status === 'waiting_user' ? '⏸' : step.status === 'waiting_decision' ? '🔀' : '•'}
                </span>
                <span className={styles.historyLabel}>{step.label || step.nodeId}</span>
                <span className={styles.historyType}>{NODE_TYPE_LABEL[step.nodeType] ?? step.nodeType}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {!allStagesDone && workflowStatus !== 'completed' && (
          <p className={styles.pipelineBlockedMsg}>
            O BPMN não possui etapas configuradas na pipeline.
          </p>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}

        {(!workflowStatus ||
          workflowStatus === 'not_started' ||
          workflowStatus === 'completed') && (
          <button
            className={styles.primaryBtn}
            onClick={handleRun}
            disabled={busy || (!allStagesDone && workflowStatus !== 'completed')}
            title={!allStagesDone && workflowStatus !== 'completed' ? 'Configure a pipeline do BPMN primeiro' : undefined}
          >
            {workflowStatus === 'completed'
              ? '↺ Reiniciar Workflow'
              : '▶ Iniciar Workflow'}
          </button>
        )}

        {workflowStatus === 'paused' &&
          (pausedReason === 'decision' || pausedReason === 'decision_required') && (
            <div className={styles.decisionGroup}>
              <p className={styles.decisionPrompt}>
                {currentNodeName ? `"${currentNodeName}"` : 'Condição'} — escolha o caminho:
              </p>
              <div className={styles.decisionRow}>
                <button
                  className={`${styles.secondaryBtn} ${styles.btnNo}`}
                  onClick={() =>
                    handleAdvance({
                      nodeId: currentNodeId,
                      decision: 'nao',
                    })
                  }
                  disabled={busy || !allStagesDone}
                >
                  ✕ Não
                </button>
                <button
                  className={`${styles.secondaryBtn} ${styles.btnYes}`}
                  onClick={() =>
                    handleAdvance({
                      nodeId: currentNodeId,
                      decision: 'sim',
                    })
                  }
                  disabled={busy || !allStagesDone}
                >
                  ✓ Sim
                </button>
                <input
                  ref={decisionInputRef}
                  className={styles.decisionInput}
                  name="decisionInput"
                  type="text"
                  placeholder="Condição personalizada..."
                  value={decisionDraft}
                  onChange={(e) => setDecisionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && decisionDraft.trim() && allStagesDone) {
                      handleAdvance({
                        nodeId: currentNodeId,
                        decision: decisionDraft.trim(),
                      });
                    }
                  }}
                />
                <button
                  className={styles.secondaryBtn}
                  disabled={!decisionDraft.trim() || busy || !allStagesDone}
                  onClick={() =>
                    handleAdvance({
                      nodeId: currentNodeId,
                      decision: decisionDraft.trim(),
                    })
                  }
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}

        {workflowStatus === 'paused' &&
          (pausedReason === 'user_input' || pausedReason === 'user_action_required') && (
            <div className={styles.userActionGroup}>
              <p className={styles.decisionPrompt}>
                Atividade: {currentNodeName ? `"${currentNodeName}"` : 'atividade'} — preencha e conclua para avançar.
              </p>
              {taskFields.length > 0 && (
                <div className={styles.taskFormBlock}>
                  {taskFields.map(renderFormField)}
                </div>
              )}
              <button
                className={styles.primaryBtn}
                onClick={() =>
                  handleAdvance({ nodeId: currentNodeId, completed: true, formData })
                }
                disabled={busy || !isFormValid}
                title={!isFormValid ? 'Preencha os campos obrigatórios antes de concluir' : undefined}
              >
                ✓ Marcar atividade como concluída
              </button>
            </div>
          )}

        {workflowStatus === 'completed' && (
          <p className={styles.completedMsg}>Workflow concluído!</p>
        )}
      </div>
    </div>
  );
};

export default WorkflowPanel;
