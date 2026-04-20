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

const MetricsGrid = ({ metrics = DEFAULT_METRICS, onEditData, meta, metaType = 'value', onMetaChange, onMetaTypeChange }) => (
  <div className={styles.wrapper}>
    <div className={styles.headerRow}>
      <div>
        <h2 className={styles.title}>Métricas KPI</h2>
        <p className={styles.subtitle}>{metrics.length} indicadores</p>
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
