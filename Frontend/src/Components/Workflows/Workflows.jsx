import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Workflows.module.css';
import {
  WORKFLOWS_LIST,
  WORKFLOW_TASKS_LIST,
  WORKFLOW_TASK_COMPLETE,
  WORKFLOW_TASK_ASSIGN,
  WORKFLOW_TASK_DELETE,
  WORKFLOW_TASK_COMMENT_ADD,
  WORKFLOW_TASK_COMMENTS,
  WORKFLOW_HISTORY,
  METRICS_DASHBOARD,
  USERS_BY_ROLE,
  OPORTUNIDADES_LIST,
  OPORTUNIDADE_SHARE,
  ENTIDADES_GET,
} from '../../Api';
import { getAuthToken } from '../Opportunities/opportunityApi';
import { toOpportunitySlug } from '../Opportunities/opportunityFormatters';
import { UserContext } from '../../Context/UserContext';
import { fetchOpportunityUsers } from '../Opportunities/opportunityApi';

const PAGES = [
  { key: 'mine', label: 'Meus Workflows' },
  { key: 'shared', label: 'Compartilhados' },
];

const VIEWS = [
  { key: 'workflows', label: 'Workflows' },
  { key: 'tasks', label: 'Tarefas' },
];

const MINE_SECTIONS = [
  { key: 'workflows', label: 'Workflows', icon: '🔄' },
  { key: 'bpmns', label: 'BPMNs', icon: '📐' },
  { key: 'entidades', label: 'Entidades', icon: '🗂️' },
];

const WF_FILTERS = [
  { key: null, label: 'Todos' },
  { key: 'running', label: 'Em execução' },
  { key: 'paused', label: 'Pausado' },
  { key: 'completed', label: 'Concluído' },
  { key: 'stopped', label: 'Interrompido' },
];

const TASK_FILTERS = [
  { key: null, label: 'Todas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'completed', label: 'Concluídas' },
  { key: 'cancelled', label: 'Canceladas' },
];

const STATUS_LABEL = {
  running: 'Em execução',
  paused: 'Pausado',
  completed: 'Concluído',
  stopped: 'Interrompido',
  not_started: 'Não iniciado',
};

const STATUS_BADGE = {
  running: 'badgeRunning',
  paused: 'badgePaused',
  completed: 'badgeCompleted',
  stopped: 'badgeStopped',
  not_started: 'badgeNotStarted',
};

const TASK_STATUS_LABEL = {
  pending: 'Pendente',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const TASK_STATUS_BADGE = {
  pending: 'badgePaused',
  completed: 'badgeCompleted',
  cancelled: 'badgeStopped',
};

const NODE_TYPE_LABEL = {
  task: 'Atividade',
  condicional: 'Condição',
  entidade: 'Entidade',
};

const NODE_TYPE_BADGE = {
  task: 'nodeTypeTask',
  condicional: 'nodeTypeCondicional',
  entidade: 'nodeTypeEntidade',
};

const formatDate = (iso) => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const Workflows = () => {
  const navigate = useNavigate();
  const { user, authLoading, hasPermission, hasRole, refreshAccessToken } = React.useContext(UserContext);

  // Fetch helper that retries once on 401 after refreshing the token
  const authFetch = React.useCallback(async (requestBuilder, ...args) => {
    const token = getAuthToken();
    const { url, options } = requestBuilder(token, ...args);
    let res = await fetch(url, options);
    if (res.status === 401 && refreshAccessToken) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const { url: u2, options: o2 } = requestBuilder(newToken, ...args);
        res = await fetch(u2, o2);
      }
    }
    return res;
  }, [refreshAccessToken]);

  /* ─── Page-level state ─── */
  const [page, setPage] = React.useState('mine');
  const [view, setView] = React.useState('workflows');
  const [mineSection, setMineSection] = React.useState('workflows');

  /* ─── Data ─── */
  const [workflows, setWorkflows] = React.useState([]);
  const [sharedWorkflows, setSharedWorkflows] = React.useState([]);
  const [tasks, setTasks] = React.useState([]);
  const [myOpportunities, setMyOpportunities] = React.useState([]);
  const [myEntities, setMyEntities] = React.useState([]);
  const [userOptions, setUserOptions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [wfFilter, setWfFilter] = React.useState(null);
  const [taskFilter, setTaskFilter] = React.useState(null);
  const [busyTaskId, setBusyTaskId] = React.useState(null);
  const [myTasksOnly, setMyTasksOnly] = React.useState(false);
  const [sharingId, setSharingId] = React.useState(null);

  /* ─── Search & date filters ─── */
  const [searchTerm, setSearchTerm] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const searchRef = React.useRef({ searchTerm: '', dateFrom: '', dateTo: '' });

  /* ─── Comments ─── */
  const [expandedTaskId, setExpandedTaskId] = React.useState(null);
  const [comments, setComments] = React.useState([]);
  const [commentText, setCommentText] = React.useState('');
  const [loadingComments, setLoadingComments] = React.useState(false);

  /* ─── Activity log timeline ─── */
  const [timelineOpId, setTimelineOpId] = React.useState(null);
  const [timelineData, setTimelineData] = React.useState(null);

  /* ─── Metrics dashboard ─── */
  const [showMetrics, setShowMetrics] = React.useState(false);
  const [metricsData, setMetricsData] = React.useState(null);

  const ownerName = user?.nome || user?.username || '';

  /* ─── Fetch functions ─── */
  const fetchMyWorkflows = React.useCallback(async () => {
    if (!ownerName) return;
    try {
      const res = await authFetch((token) => WORKFLOWS_LIST(token, null, { owner: ownerName }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setWorkflows(json.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [authFetch, ownerName]);

  const fetchSharedWorkflows = React.useCallback(async () => {
    try {
      const res = await authFetch((token) => WORKFLOWS_LIST(token, null, { shared: true }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSharedWorkflows(json.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [authFetch]);

  const fetchTasks = React.useCallback(async () => {
    const s = searchRef.current;
    try {
      const res = await authFetch((token) => WORKFLOW_TASKS_LIST(token, {
        myTasks: myTasksOnly,
        search: s.searchTerm || undefined,
        dateFrom: s.dateFrom || undefined,
        dateTo: s.dateTo || undefined,
      }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTasks(json.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [myTasksOnly, authFetch]);

  // Keep ref in sync and debounce re-fetch on search/date changes
  React.useEffect(() => {
    searchRef.current = { searchTerm, dateFrom, dateTo };
    const timer = setTimeout(() => {
      if (!authLoading) fetchTasks();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, dateFrom, dateTo]);

  const fetchMyOpportunities = React.useCallback(async () => {
    if (!ownerName) return;
    try {
      const res = await authFetch((token) => OPORTUNIDADES_LIST(token, { owner: ownerName }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setMyOpportunities(json.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [authFetch, ownerName]);

  const fetchMyEntities = React.useCallback(async () => {
    if (!ownerName) return;
    try {
      const token = getAuthToken();
      const { url, options } = ENTIDADES_GET(token);
      // Add owner param
      const u = new URL(url);
      u.searchParams.set('owner', ownerName);
      let res = await fetch(u.toString(), options);
      if (res.status === 401 && refreshAccessToken) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          options.headers = { ...options.headers, Authorization: `Bearer ${newToken}` };
          res = await fetch(u.toString(), options);
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMyEntities(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }, [ownerName, refreshAccessToken]);

  /* ─── Initial load ─── */
  React.useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchMyWorkflows(),
      fetchSharedWorkflows(),
      fetchTasks(),
      fetchMyOpportunities(),
      fetchMyEntities(),
      fetchOpportunityUsers({ token: getAuthToken() })
        .then((users) => setUserOptions(users || []))
        .catch(() => setUserOptions([])),
    ]).finally(() => setLoading(false));
  }, [fetchMyWorkflows, fetchSharedWorkflows, fetchTasks, fetchMyOpportunities, fetchMyEntities, authLoading]);

  /* ─── Handlers ─── */
  const handleOpen = (wf) => {
    const slug = wf.opportunitySlug || toOpportunitySlug(wf.opportunityName);
    navigate(`/oportunidades/${slug}`, {
      state: { opportunity: { id: wf.opportunityId, name: wf.opportunityName } },
    });
  };

  const handleOpenOpp = (opp) => {
    const bpmnName = opp.bpmn?.name || opp.nome || opp.name || '';
    const bpmnSlug = String(bpmnName)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'novo-bpmn';
    navigate(`/gerar-bpmn/${bpmnSlug}`);
  };

  const handleCompleteTask = async (taskId) => {
    setBusyTaskId(taskId);
    try {
      const body = { completedBy: user?.nome || user?.username || 'Usuário' };
      const res = await authFetch((token) => WORKFLOW_TASK_COMPLETE(taskId, body, token));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchTasks();
      await fetchMyWorkflows();
    } catch {
      // silent
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleAssignTask = async (taskId, assignee) => {
    try {
      const isRoleAssignment = assignee && assignee.startsWith('role:');
      const body = isRoleAssignment
        ? { assignedRole: assignee.replace('role:', ''), assignee: null }
        : { assignee, assignedRole: null };
      const res = await authFetch((token) => WORKFLOW_TASK_ASSIGN(taskId, body, token));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchTasks();
    } catch {
      // silent
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Deseja apagar esta tarefa?')) return;
    setBusyTaskId(taskId);
    try {
      const res = await authFetch((token) => WORKFLOW_TASK_DELETE(taskId, token));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchTasks();
      await fetchMyWorkflows();
    } catch {
      // silent
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleToggleShare = async (opId, currentShared) => {
    setSharingId(opId);
    try {
      const res = await authFetch((token) => OPORTUNIDADE_SHARE(opId, !currentShared, token));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await Promise.all([fetchMyWorkflows(), fetchSharedWorkflows(), fetchMyOpportunities()]);
    } catch {
      // silent
    } finally {
      setSharingId(null);
    }
  };

  /* ─── Comments handlers ─── */
  const handleToggleComments = async (taskId) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      setComments([]);
      setCommentText('');
      return;
    }
    setExpandedTaskId(taskId);
    setLoadingComments(true);
    try {
      const res = await authFetch((token) => WORKFLOW_TASK_COMMENTS(taskId, token));
      if (res.ok) {
        const json = await res.json();
        setComments(json.data || []);
      }
    } catch { /* silent */ }
    setLoadingComments(false);
  };

  const handleAddComment = async (taskId) => {
    if (!commentText.trim()) return;
    try {
      const res = await authFetch((token) =>
        WORKFLOW_TASK_COMMENT_ADD(taskId, { text: commentText.trim() }, token)
      );
      if (res.ok) {
        const newComment = await res.json();
        setComments((prev) => [...prev, newComment]);
        setCommentText('');
      }
    } catch { /* silent */ }
  };

  /* ─── Activity log timeline ─── */
  const handleShowTimeline = async (opId) => {
    if (timelineOpId === opId) {
      setTimelineOpId(null);
      setTimelineData(null);
      return;
    }
    setTimelineOpId(opId);
    try {
      const res = await authFetch((token) => WORKFLOW_HISTORY(opId, token));
      if (res.ok) {
        const json = await res.json();
        setTimelineData(json);
      }
    } catch { /* silent */ }
  };

  /* ─── Metrics dashboard ─── */
  const handleShowMetrics = async () => {
    if (showMetrics) {
      setShowMetrics(false);
      return;
    }
    setShowMetrics(true);
    try {
      const res = await authFetch((token) => METRICS_DASHBOARD(token));
      if (res.ok) {
        const json = await res.json();
        setMetricsData(json);
      }
    } catch { /* silent */ }
  };

  /* ─── Export CSV ─── */
  const handleExportCSV = (dataType) => {
    let rows = [];
    let filename = '';
    if (dataType === 'tasks') {
      filename = 'tarefas.csv';
      rows = [['#', 'Tarefa', 'Oportunidade', 'Atribuído', 'Status', 'Criado', 'Prazo'].join(';')];
      for (const t of filteredTasks) {
        rows.push([
          t.taskId,
          `"${(t.label || '').replace(/"/g, '""')}"`,
          `"${(t.opportunityName || '').replace(/"/g, '""')}"`,
          t.assignee || '',
          TASK_STATUS_LABEL[t.status] || t.status,
          t.createdAt || '',
          t.dueAt || '',
        ].join(';'));
      }
    } else {
      filename = 'workflows.csv';
      rows = [['Oportunidade', 'Status', 'Etapa Atual', 'Progresso', 'Versão', 'Atualizado'].join(';')];
      for (const wf of filteredWorkflows) {
        rows.push([
          `"${(wf.opportunityName || '').replace(/"/g, '""')}"`,
          STATUS_LABEL[wf.status] || wf.status,
          wf.currentNodeLabel || '',
          `${wf.progress}%`,
          wf.bpmnVersion || '',
          wf.updatedAt || '',
        ].join(';'));
      }
    }
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─── Derived data ─── */
  const filteredWorkflows = React.useMemo(() => {
    const src = page === 'mine' ? workflows : sharedWorkflows;
    if (!wfFilter) return src;
    return src.filter((w) => w.status === wfFilter);
  }, [workflows, sharedWorkflows, page, wfFilter]);

  const filteredTasks = React.useMemo(() => {
    if (!taskFilter) return tasks;
    return tasks.filter((t) => t.status === taskFilter);
  }, [tasks, taskFilter]);

  const pendingCount = React.useMemo(
    () => tasks.filter((t) => t.status === 'pending').length,
    [tasks],
  );

  // Group entities by categoria
  const entitiesByCat = React.useMemo(() => {
    const map = {};
    for (const e of myEntities) {
      const cat = e.categoria || 'Sem categoria';
      if (!map[cat]) map[cat] = [];
      map[cat].push(e);
    }
    return map;
  }, [myEntities]);

  // Check if user can see "Meus Workflows" (is owner or admin)
  const canSeeMine = user?.admin || hasRole?.('admin', 'gestor') || true; // always visible for account owner

  /* ─── Loading / Error states ─── */
  if (loading && !workflows.length && !tasks.length) {
    return (
      <div className={styles.container}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (error && !workflows.length && !tasks.length) {
    return (
      <div className={styles.container}>
        <p style={{ color: 'red' }}>Erro: {error}</p>
      </div>
    );
  }

  /* ─── Render helpers ─── */
  const renderWorkflowTable = (items, showShare = false) => (
    items.length === 0 ? (
      <div className={styles.tableWrapper}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔄</div>
          <p className={styles.emptyText}>
            {wfFilter
              ? `Nenhum workflow "${STATUS_LABEL[wfFilter] || wfFilter}".`
              : 'Nenhum workflow encontrado.'}
          </p>
        </div>
      </div>
    ) : (
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colName}>Oportunidade</th>
              <th className={styles.colStatus}>Status</th>
              <th className={styles.colStep}>Etapa Atual</th>
              <th className={styles.colProgress}>Progresso</th>
              <th className={styles.colVersion}>Versão</th>
              <th className={styles.colUpdated}>Atualizado</th>
              <th className={styles.colActions}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((wf) => (
              <tr key={wf.opportunityId}>
                <td className={styles.colName}>
                  <button
                    type="button"
                    className={styles.nameLink}
                    onClick={() => handleOpen(wf)}
                  >
                    {wf.opportunityName}
                  </button>
                  {wf.shared && <span className={styles.sharedBadge}>compartilhado</span>}
                </td>
                <td className={styles.colStatus}>
                  <span
                    className={`${styles.badge} ${styles[STATUS_BADGE[wf.status] || 'badgeNotStarted']}`}
                  >
                    {STATUS_LABEL[wf.status] || wf.status}
                  </span>
                </td>
                <td className={styles.colStep}>
                  {wf.currentNodeLabel ? (
                    <div className={styles.stepInfo}>
                      <span
                        className={`${styles.stepLabel} ${styles[NODE_TYPE_BADGE[wf.currentNodeType] || ''] || ''}`}
                      >
                        {wf.currentNodeLabel}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
                <td className={styles.colProgress}>
                  <div className={styles.progressWrap}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{
                          width: `${wf.progress}%`,
                          background: wf.progress >= 75 ? '#16a34a' : wf.progress >= 40 ? '#f59e0b' : wf.progress > 0 ? '#ef4444' : '#d1d5db',
                        }}
                      />
                    </div>
                    <span
                      className={styles.progressText}
                      style={{
                        color: wf.progress >= 75 ? '#16a34a' : wf.progress >= 40 ? '#d97706' : wf.progress > 0 ? '#dc2626' : '#9ca3af',
                      }}
                    >
                      {wf.progress}%
                    </span>
                  </div>
                </td>
                <td className={styles.colVersion}>
                  {wf.bpmnVersion ? (
                    <span className={styles.versionBadge}>v{wf.bpmnVersion}</span>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
                <td className={styles.colUpdated}>
                  {formatDate(wf.updatedAt)}
                </td>
                <td className={styles.colActions}>
                  <div className={styles.taskActionsWrap}>
                    {showShare && (
                      <button
                        type="button"
                        className={`${styles.actionButton} ${wf.shared ? styles.unshareButton : styles.shareButton}`}
                        title={wf.shared ? 'Remover compartilhamento' : 'Compartilhar'}
                        disabled={sharingId === wf.opportunityId}
                        onClick={() => handleToggleShare(wf.opportunityId, wf.shared)}
                      >
                        {wf.shared ? '🔒' : '🔗'}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.openButton}`}
                      title="Abrir oportunidade"
                      onClick={() => handleOpen(wf)}
                    >
                      ➜
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  const renderTaskTable = () => (
    filteredTasks.length === 0 ? (
      <div className={styles.tableWrapper}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📋</div>
          <p className={styles.emptyText}>
            {taskFilter
              ? `Nenhuma tarefa "${TASK_STATUS_LABEL[taskFilter] || taskFilter}".`
              : 'Nenhuma tarefa encontrada.'}
          </p>
        </div>
      </div>
    ) : (
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colTaskId}>#</th>
              <th className={styles.colTaskLabel}>Tarefa</th>
              <th className={styles.colTaskOpp}>Oportunidade</th>
              <th className={styles.colTaskAssignee}>Atribuído</th>
              <th className={styles.colTaskStatus}>Status</th>
              <th className={styles.colTaskDate}>Criado</th>
              <th className={styles.colTaskActions}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((t) => (
              <React.Fragment key={t.taskId}>
              <tr>
                <td className={styles.colTaskId}>{t.taskId}</td>
                <td className={styles.colTaskLabel}>
                  <div className={styles.taskLabelWrap}>
                    <span className={styles.taskName}>{t.label}</span>
                    {t.description && (
                      <span className={styles.taskDesc}>{t.description}</span>
                    )}
                  </div>
                </td>
                <td className={styles.colTaskOpp}>
                  <button
                    type="button"
                    className={styles.nameLink}
                    onClick={() =>
                      handleOpen({
                        opportunityId: t.opportunityId,
                        opportunityName: t.opportunityName,
                        opportunitySlug: '',
                      })
                    }
                  >
                    {t.opportunityName}
                  </button>
                </td>
                <td className={styles.colTaskAssignee}>
                  {hasPermission('tasks:assign') ? (
                    <select
                      className={styles.assignSelect}
                      name={`taskAssignee_${t.taskId}`}
                      value={t.assignee || ''}
                      onChange={(e) => handleAssignTask(t.taskId, e.target.value)}
                      disabled={t.status !== 'pending'}
                    >
                      <option value="">— Não atribuído —</option>
                      {[t.assignee, ...userOptions]
                        .filter(Boolean)
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                  ) : (
                    <span>{t.assignee || '-'}</span>
                  )}
                </td>
                <td className={styles.colTaskStatus}>
                  <span
                    className={`${styles.badge} ${styles[TASK_STATUS_BADGE[t.status] || 'badgeNotStarted']}`}
                  >
                    {TASK_STATUS_LABEL[t.status] || t.status}
                  </span>
                </td>
                <td className={styles.colTaskDate}>
                  {formatDate(t.createdAt)}
                </td>
                <td className={styles.colTaskActions}>
                  <div className={styles.taskActionsWrap}>
                    {t.status === 'pending' && (
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.completeBtn}`}
                        title="Concluir tarefa"
                        disabled={busyTaskId === t.taskId}
                        onClick={() => handleCompleteTask(t.taskId)}
                      >
                        {busyTaskId === t.taskId ? '...' : '✓'}
                      </button>
                    )}
                    {t.status === 'completed' && t.completedBy && (
                      <span className={styles.completedBy}>
                        por {t.completedBy}
                      </span>
                    )}
                    <button
                      type="button"
                      className={`${styles.actionButton} ${expandedTaskId === t.taskId ? styles.commentBtnActive : styles.commentBtn}`}
                      title="Comentários"
                      onClick={() => handleToggleComments(t.taskId)}
                    >
                      💬{(t.comments || []).length > 0 ? ` ${t.comments.length}` : ''}
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.timelineBtn}`}
                      title="Histórico"
                      onClick={() => handleShowTimeline(t.opportunityId)}
                    >
                      📜
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.deleteBtn}`}
                      title="Apagar tarefa"
                      disabled={busyTaskId === t.taskId}
                      onClick={() => handleDeleteTask(t.taskId)}
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
              {/* Expandable comments row */}
              {expandedTaskId === t.taskId && (
                <tr className={styles.commentsRow}>
                  <td colSpan={7}>
                    <div className={styles.commentsSection}>
                      <div className={styles.commentsHeader}>
                        <strong>Comentários — {t.label}</strong>
                      </div>
                      {loadingComments ? (
                        <p className={styles.commentsLoading}>Carregando...</p>
                      ) : (
                        <>
                          {comments.length === 0 && (
                            <p className={styles.commentsEmpty}>Nenhum comentário ainda.</p>
                          )}
                          <div className={styles.commentsList}>
                            {comments.map((c) => (
                              <div key={c.id} className={styles.commentItem}>
                                <div className={styles.commentMeta}>
                                  <span className={styles.commentAuthor}>{c.author}</span>
                                  <span className={styles.commentDate}>{formatDate(c.createdAt)}</span>
                                </div>
                                <p className={styles.commentText}>{c.text}</p>
                              </div>
                            ))}
                          </div>
                          <div className={styles.commentForm}>
                            <input
                              type="text"
                              className={styles.commentInput}
                              placeholder="Adicionar comentário..."
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddComment(t.taskId)}
                              maxLength={2000}
                            />
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.commentSubmitBtn}`}
                              onClick={() => handleAddComment(t.taskId)}
                              disabled={!commentText.trim()}
                            >
                              Enviar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  const renderBpmns = () => {
    const oppsWithBpmn = myOpportunities.filter((o) => o.bpmn && (o.bpmn.nodes || []).length > 0);
    if (oppsWithBpmn.length === 0) {
      return (
        <div className={styles.tableWrapper}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📐</div>
            <p className={styles.emptyText}>Nenhum BPMN criado ainda.</p>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.cardsGrid}>
        {oppsWithBpmn.map((opp) => {
          const bpmn = opp.bpmn || {};
          const nodes = bpmn.nodes || [];
          const taskCount = nodes.filter((n) => n.nodeType === 'task').length;
          const condCount = nodes.filter((n) => n.nodeType === 'condicional').length;
          const entCount = nodes.filter((n) => n.nodeType === 'entidade').length;
          return (
            <div key={opp.id} className={styles.card} onClick={() => handleOpenOpp(opp)}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{bpmn.name || opp.nome || opp.name}</h3>
                {opp.shared && <span className={styles.sharedBadge}>compartilhado</span>}
              </div>
              <div className={styles.cardMeta}>
                <span className={styles.cardStat}>{nodes.length} nós</span>
                <span className={styles.cardDot}>·</span>
                <span className={styles.cardStat}>{taskCount} atividades</span>
                <span className={styles.cardDot}>·</span>
                <span className={styles.cardStat}>{condCount} decisões</span>
                <span className={styles.cardDot}>·</span>
                <span className={styles.cardStat}>{entCount} entidades</span>
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardDate}>{formatDate(opp.created_at)}</span>
                <button
                  type="button"
                  className={`${styles.actionButton} ${opp.shared ? styles.unshareButton : styles.shareButton}`}
                  title={opp.shared ? 'Remover compartilhamento' : 'Compartilhar'}
                  disabled={sharingId === opp.id}
                  onClick={(e) => { e.stopPropagation(); handleToggleShare(opp.id, opp.shared); }}
                >
                  {opp.shared ? '🔒' : '🔗'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderEntities = () => {
    if (myEntities.length === 0) {
      return (
        <div className={styles.tableWrapper}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🗂️</div>
            <p className={styles.emptyText}>Nenhuma entidade criada ainda.</p>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.entityGroups}>
        {Object.entries(entitiesByCat).map(([cat, entities]) => (
          <div key={cat} className={styles.entityGroup}>
            <h4 className={styles.entityGroupTitle}>{cat}</h4>
            <div className={styles.entityCards}>
              {entities.map((ent) => (
                <div key={ent.id} className={styles.entityCard}>
                  <div className={styles.entityName}>{ent.nome}</div>
                  <div className={styles.entityDesc}>{ent.descricao || ''}</div>
                  <div className={styles.entityMeta}>
                    {ent.campos?.length || 0} campos
                    {ent.tipoEntidade && <span className={styles.entityType}>{ent.tipoEntidade}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* ─── Header ─── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Workflows</h1>
          <p className={styles.subtitle}>
            {page === 'mine'
              ? 'Seus processos BPMN, oportunidades e entidades.'
              : 'Workflows compartilhados por outros usuários.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.metricsBtn}`}
            onClick={handleShowMetrics}
            title="Métricas"
          >
            📊 Métricas
          </button>
          {view === 'workflows' && (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.exportBtn}`}
              onClick={() => handleExportCSV('workflows')}
              title="Exportar CSV"
            >
              📥 CSV
            </button>
          )}
          <div className={styles.pageTabs}>
            {PAGES.map((p) => (
              <button
                key={p.key}
                className={`${styles.pageTab} ${page === p.key ? styles.pageTabActive : ''}`}
                onClick={() => { setPage(p.key); setWfFilter(null); }}
              >
                {p.label}
                {p.key === 'mine' && workflows.length > 0 && (
                  <span className={styles.tabBadge}>{workflows.length}</span>
                )}
                {p.key === 'shared' && sharedWorkflows.length > 0 && (
                  <span className={styles.tabBadge}>{sharedWorkflows.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          PAGE: MEUS WORKFLOWS
         ═══════════════════════════════════════════════ */}
      {page === 'mine' && (
        <>
          {/* Section tabs: Workflows / BPMNs / Entidades */}
          <div className={styles.sectionTabs}>
            {MINE_SECTIONS.map((s) => (
              <button
                key={s.key}
                className={`${styles.sectionTab} ${mineSection === s.key ? styles.sectionTabActive : ''}`}
                onClick={() => setMineSection(s.key)}
              >
                <span className={styles.sectionIcon}>{s.icon}</span>
                {s.label}
                {s.key === 'workflows' && workflows.length > 0 && (
                  <span className={styles.sectionCount}>{workflows.length}</span>
                )}
                {s.key === 'bpmns' && (
                  <span className={styles.sectionCount}>
                    {myOpportunities.filter((o) => o.bpmn && (o.bpmn.nodes || []).length > 0).length}
                  </span>
                )}
                {s.key === 'entidades' && myEntities.length > 0 && (
                  <span className={styles.sectionCount}>{myEntities.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* MINE → Workflows sub-section */}
          {mineSection === 'workflows' && (
            <>
              {/* View toggle: Workflows / Tarefas */}
              <div className={styles.viewTabs} style={{ marginBottom: '0.5rem' }}>
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    className={`${styles.viewTab} ${view === v.key ? styles.viewTabActive : ''}`}
                    onClick={() => setView(v.key)}
                  >
                    {v.label}
                    {v.key === 'tasks' && pendingCount > 0 && (
                      <span className={styles.tabBadge}>{pendingCount}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Filter bar */}
              <div className={styles.filterBar}>
                {(view === 'workflows' ? WF_FILTERS : TASK_FILTERS).map((f) => (
                  <button
                    key={f.key ?? 'all'}
                    className={`${styles.filterTab} ${
                      (view === 'workflows' ? wfFilter : taskFilter) === f.key
                        ? styles.filterTabActive
                        : ''
                    }`}
                    onClick={() =>
                      view === 'workflows' ? setWfFilter(f.key) : setTaskFilter(f.key)
                    }
                  >
                    {f.label}
                  </button>
                ))}
                {view === 'tasks' && (
                  <label className={styles.myTasksToggle}>
                    <input
                      type="checkbox"
                      name="myTasksOnly"
                      checked={myTasksOnly}
                      onChange={(e) => setMyTasksOnly(e.target.checked)}
                    />
                    Minhas tarefas
                  </label>
                )}
              </div>

              {/* Search & date filters (tasks only) */}
              {view === 'tasks' && (
                <div className={styles.searchBar}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Buscar tarefas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    title="Data início"
                  />
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    title="Data fim"
                  />
                  {(searchTerm || dateFrom || dateTo) && (
                    <button
                      type="button"
                      className={styles.clearFiltersBtn}
                      onClick={() => { setSearchTerm(''); setDateFrom(''); setDateTo(''); }}
                    >
                      ✕ Limpar
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.exportBtn}`}
                    onClick={() => handleExportCSV('tasks')}
                    title="Exportar CSV"
                  >
                    📥 CSV
                  </button>
                </div>
              )}

              {view === 'workflows' && renderWorkflowTable(filteredWorkflows, true)}
              {view === 'tasks' && renderTaskTable()}
            </>
          )}

          {/* MINE → BPMNs sub-section */}
          {mineSection === 'bpmns' && renderBpmns()}

          {/* MINE → Entidades sub-section */}
          {mineSection === 'entidades' && renderEntities()}
        </>
      )}

      {/* ═══════════════════════════════════════════════
          PAGE: COMPARTILHADOS
         ═══════════════════════════════════════════════ */}
      {page === 'shared' && (
        <>
          {/* Filter bar for shared */}
          <div className={styles.filterBar}>
            {WF_FILTERS.map((f) => (
              <button
                key={f.key ?? 'all'}
                className={`${styles.filterTab} ${wfFilter === f.key ? styles.filterTabActive : ''}`}
                onClick={() => setWfFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {renderWorkflowTable(filteredWorkflows, false)}
        </>
      )}

      {/* ═══════════════════════════════════════════════
          TIMELINE MODAL
         ═══════════════════════════════════════════════ */}
      {timelineOpId && timelineData && (
        <div className={styles.modalOverlay} onClick={() => { setTimelineOpId(null); setTimelineData(null); }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Histórico — Oportunidade #{timelineOpId}</h3>
              <button className={styles.modalClose} onClick={() => { setTimelineOpId(null); setTimelineData(null); }}>✕</button>
            </div>
            <div className={styles.timelineWrap}>
              {timelineData.summary && (
                <div className={styles.timelineSummary}>
                  <span>Total de eventos: {timelineData.summary.totalEvents || 0}</span>
                  <span>Tarefas: {timelineData.summary.totalTasks || 0}</span>
                </div>
              )}
              <div className={styles.timeline}>
                {(timelineData.timeline || []).map((item, i) => (
                  <div key={i} className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineBody}>
                      <div className={styles.timelineType}>
                        {item.type === 'event'
                          ? `📡 ${item.eventType || 'evento'}`
                          : `📋 Tarefa: ${item.label || ''}`}
                      </div>
                      <div className={styles.timelineDate}>{formatDate(item.timestamp || item.createdAt)}</div>
                      {item.type === 'event' && item.data && (
                        <div className={styles.timelineDetail}>
                          {item.data.assignee && <span>Atribuído: {item.data.assignee}</span>}
                          {item.data.label && <span>{item.data.label}</span>}
                        </div>
                      )}
                      {item.type === 'task' && (
                        <div className={styles.timelineDetail}>
                          <span className={`${styles.badge} ${styles[TASK_STATUS_BADGE[item.status] || '']}`}>
                            {TASK_STATUS_LABEL[item.status] || item.status}
                          </span>
                          {item.assignee && <span>→ {item.assignee}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {(!timelineData.timeline || timelineData.timeline.length === 0) && (
                  <p className={styles.commentsEmpty}>Nenhum evento registrado.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          METRICS PANEL
         ═══════════════════════════════════════════════ */}
      {showMetrics && metricsData && (
        <div className={styles.modalOverlay} onClick={handleShowMetrics}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>📊 Métricas</h3>
              <button className={styles.modalClose} onClick={handleShowMetrics}>✕</button>
            </div>
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>{metricsData.tasks?.totalTasks ?? '-'}</div>
                <div className={styles.metricLabel}>Total de Tarefas</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>{metricsData.tasks?.pending ?? '-'}</div>
                <div className={styles.metricLabel}>Pendentes</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>{metricsData.tasks?.completed ?? '-'}</div>
                <div className={styles.metricLabel}>Concluídas</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>{metricsData.workflows?.totalWorkflows ?? '-'}</div>
                <div className={styles.metricLabel}>Workflows</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>{metricsData.workflows?.byStatus?.running ?? 0}</div>
                <div className={styles.metricLabel}>Em Execução</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>{metricsData.workflows?.completedWorkflows?.count ?? 0}</div>
                <div className={styles.metricLabel}>Concluídos</div>
              </div>
              {metricsData.tasks?.slaCompliance && (
                <div className={styles.metricCard}>
                  <div className={styles.metricValue}>{metricsData.tasks.slaCompliance.complianceRate ?? '-'}%</div>
                  <div className={styles.metricLabel}>SLA Compliance</div>
                </div>
              )}
              {metricsData.sla && (
                <>
                  <div className={styles.metricCard}>
                    <div className={styles.metricValue}>{metricsData.sla.atRiskTasks ?? 0}</div>
                    <div className={styles.metricLabel}>Em Risco</div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricValue}>{metricsData.sla.overdueTasks ?? 0}</div>
                    <div className={styles.metricLabel}>Atrasadas</div>
                  </div>
                </>
              )}
              {metricsData.tasks?.avgDurationHuman && (
                <div className={styles.metricCard}>
                  <div className={styles.metricValue}>{metricsData.tasks.avgDurationHuman}</div>
                  <div className={styles.metricLabel}>Duração Média</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workflows;
