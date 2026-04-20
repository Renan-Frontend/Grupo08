import React from 'react';
import styles from './PipelineChart.module.css';

const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(v);

const PipelineChart = ({ data, onEditData, meta, metaType = 'value', onMetaChange, onMetaTypeChange }) => {
  const maxLeads = Math.max(...data.map((d) => Number(d.leads) || 0), 1);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Pipeline de Vendas</h2>
          <p className={styles.subtitle}>Funil de oportunidades por etapa</p>
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
      <div className={styles.funnel}>
        {data.map((row, i) => {
          const pct = Math.round((Number(row.leads) / maxLeads) * 100);
          const opacity = 1 - i * 0.12;
          return (
            <div key={i} className={styles.stage}>
              <div className={styles.stageLabel}>{row.etapa}</div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${pct}%`, opacity }}
                />
              </div>
              <div className={styles.stageMeta}>
                <span className={styles.leads}>{row.leads} leads</span>
                <span className={styles.valor}>{formatBRL(row.valor)}</span>
              </div>
              {meta != null && (
                <div style={{ position: 'absolute', left: `${Math.min((meta / maxLeads) * 100, 100)}%`, top: 0, bottom: 0, borderLeft: '2px dashed #8b5cf6', opacity: 0.6, pointerEvents: 'none' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineChart;
