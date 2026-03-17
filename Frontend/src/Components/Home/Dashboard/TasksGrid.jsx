import React from 'react';
import styles from './TasksGrid.module.css';

const STATUS_COLORS = {
  'Concluídas':   { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  'Em andamento': { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'Pendentes':    { bg: '#fefce8', color: '#ca8a04', border: '#fef08a' },
  'Atrasadas':    { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
};

const TasksGrid = ({ tasks, onEditData }) => {
  const total = tasks.reduce((s, t) => s + Number(t.valor || 0), 0);

  return (
    <div className={styles.wrapper}>
      {onEditData && (
        <div className={styles.actions}>
          <button type="button" className={styles.editBtn} onClick={onEditData}>
            ✏️ Editar tarefas
          </button>
        </div>
      )}
      <div className={styles.header}>
        <h2 className={styles.title}>Tarefas</h2>
        <p className={styles.subtitle}>Distribuição por status · {total} total</p>
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
              <span className={styles.icon}>{task.icon}</span>
              <span className={styles.status} style={{ color: scheme.color }}>{task.status}</span>
              <strong className={styles.count} style={{ color: scheme.color }}>{task.valor}</strong>
              <div className={styles.barBg}>
                <div className={styles.barFill} style={{ width: `${pct}%`, background: scheme.color }} />
              </div>
              <span className={styles.pct} style={{ color: scheme.color }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TasksGrid;
