import React from 'react';
import styles from './MetricsGrid.module.css';

const DEFAULT_METRICS = [
  {
    icon: '💰',
    label: 'FATURAMENTO TOTAL',
    value: 'R$ 847.250',
    change: '↑ 12,5%',
    up: true,
  },
  {
    icon: '👥',
    label: 'TOTAL DE CLIENTES',
    value: '1.284',
    change: '↑ 8,2%',
    up: true,
  },
  {
    icon: '🛒',
    label: 'TOTAL DE VENDAS',
    value: '3.647',
    change: '↑ 15,3%',
    up: true,
  },
];

const MetricsGrid = ({ metrics = DEFAULT_METRICS, onEditData }) => (
  <div className={styles.metricsWrapper}>
    {onEditData && (
      <div className={styles.metricsActions}>
        <button type="button" className={styles.editBtn} onClick={onEditData}>
          ✏️ Editar métricas
        </button>
      </div>
    )}
    <div className={styles.metricsGrid}>
      {metrics.map((metric, i) => (
        <div key={i} className={styles.metricCard}>
          <div className={styles.metricIcon}>{metric.icon}</div>
          <div className={styles.metricContent}>
            <p className={styles.metricLabel}>{metric.label}</p>
            <h3 className={styles.metricValue}>{metric.value}</h3>
            <p
              className={`${styles.metricChange} ${metric.up ? styles.up : styles.down}`}
            >
              {metric.change}
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default MetricsGrid;
