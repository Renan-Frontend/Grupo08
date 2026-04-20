import React from 'react';
import styles from './TasksGrid.module.css';

const STATUS_COLORS = {
  'Concluídas':   { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  'Em andamento': { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'Pendentes':    { bg: '#fefce8', color: '#ca8a04', border: '#fef08a' },
  'Atrasadas':    { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
};

const FALLBACK_ICONS = ['📋','🗂️','📌','🔖','🏷️','📎','🗒️','📝','🔵','🟡','🟠','🔴','🟢','⭐','🎯'];

// hash string to consistent index
const hashStr = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
};

const getTaskIcon = (task) => {
  if (task.icon) return task.icon;
  const s = String(task.status || '').toLowerCase();
  // status-based
  if (s.includes('conclu') || s.includes('done') || s.includes('finish') || s.includes('complet')) return '✅';
  if (s.includes('andamento') || s.includes('progress') || s.includes('doing') || s.includes('ativo')) return '🔄';
  if (s.includes('pendent') || s.includes('aguard') || s.includes('wait') || s.includes('todo') || s.includes('aberto')) return '⏳';
  if (s.includes('atras') || s.includes('late') || s.includes('overdue') || s.includes('vencid')) return '⚠️';
  if (s.includes('cancel') || s.includes('arquiv') || s.includes('encerr')) return '🚫';
  if (s.includes('revis') || s.includes('review') || s.includes('aprova')) return '🔍';
  if (s.includes('urgent') || s.includes('priorid') || s.includes('critical') || s.includes('alta')) return '🔥';
  if (s.includes('bloq') || s.includes('block') || s.includes('impedi')) return '🔒';
  if (s.includes('test') || s.includes('qa') || s.includes('valid')) return '🧪';
  if (s.includes('deploy') || s.includes('produc') || s.includes('entregue')) return '🚀';
  if (s.includes('plan') || s.includes('backlog')) return '📅';
  if (s.includes('reuni') || s.includes('meeting')) return '🤝';
  if (s.includes('bug') || s.includes('erro') || s.includes('falha')) return '🐛';
  if (s.includes('doc') || s.includes('relat')) return '📄';
  if (s.includes('dinheiro') || s.includes('financ') || s.includes('pagam') || s.includes('pagou')) return '💰';
  if (s.includes('jan') && s.length < 10) return '❄️';
  if (s.includes('fev')) return '💘';
  if (s.includes('mar') && !s.includes('market')) return '🌧️';
  if (s.includes('abr')) return '🌸';
  if (s.includes('mai')) return '🌻';
  if (s.includes('jun')) return '☀️';
  if (s.includes('jul')) return '🌊';
  if (s.includes('ago')) return '🌴';
  if (s.includes('set') && s.length < 10) return '🍂';
  if (s.includes('out') && s.length < 10) return '🎃';
  if (s.includes('nov')) return '🍁';
  if (s.includes('dez')) return '🎄';
  // text-hash fallback: same text always gets same icon
  return FALLBACK_ICONS[hashStr(s) % FALLBACK_ICONS.length];
};

const TasksGrid = ({ tasks, onEditData, meta, metaType = 'value', onMetaChange, onMetaTypeChange }) => {
  const total = tasks.reduce((s, t) => s + Number(t.valor || 0), 0);

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Tarefas</h2>
          <p className={styles.subtitle}>Distribuição por status · {total} total</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {meta != null && (
            <span style={{ fontSize: '0.68rem', color: '#8b5cf6', fontWeight: 600, background: '#f8f5ff', padding: '0.1rem 0.5rem', borderRadius: 4 }}>
              Meta: {metaType === 'percent' ? `${Number(meta).toFixed(2)}%` : Number(meta).toFixed(2)}
            </span>
          )}
          {onMetaTypeChange && (
            <button type="button" onClick={() => onMetaTypeChange(metaType === 'percent' ? 'value' : 'percent')}
              style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', background: '#f8f5ff', color: '#8b5cf6', cursor: 'pointer', fontWeight: 600, lineHeight: 1 }}
              title={metaType === 'percent' ? 'Modo porcentagem — clique para valor' : 'Modo valor — clique para porcentagem'}
            >{metaType === 'percent' ? '%' : '#'}</button>
          )}
          {onEditData && (
            <button type="button" className={styles.editBtn} onClick={onEditData} title="Editar dados">
              ✏️
            </button>
          )}
        </div>
      </div>
      <div className={styles.grid}>
        {tasks.map((task, i) => {
          const scheme = STATUS_COLORS[task.status] || { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' };
          const pct = total > 0 ? Math.round((Number(task.valor) / total) * 100) : 0;
          return (
            <div
              key={i}
              className={styles.card}
              style={{ background: scheme.bg, borderColor: scheme.border }}
            >
              <span className={styles.icon}>{getTaskIcon(task)}</span>
              <span className={styles.status} style={{ color: scheme.color }}>{task.status}</span>
              <strong className={styles.count} style={{ color: scheme.color }}>{task.valor}</strong>
              <div className={styles.barBg}>
                <div className={styles.barFill} style={{ width: `${pct}%`, background: scheme.color }} />
              </div>
              <span className={styles.pct} style={{ color: scheme.color }}>{pct}%</span>
              {meta != null && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: `${Math.min((meta / (total || 1)) * 100, 100)}%`, top: 0, bottom: 0, borderLeft: '2px dashed #8b5cf6', opacity: 0.6 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TasksGrid;
