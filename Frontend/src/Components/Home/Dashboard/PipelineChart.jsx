import React from 'react';
import styles from './PipelineChart.module.css';

const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(v);

const PipelineChart = ({ data, onEditData }) => {
  const maxLeads = Math.max(...data.map((d) => Number(d.leads) || 0), 1);

  return (
    <div className={styles.wrapper}>
      {onEditData && (
        <div className={styles.actions}>
          <button type="button" className={styles.editBtn} onClick={onEditData}>
            ✏️ Editar pipeline
          </button>
        </div>
      )}
      <div className={styles.header}>
        <h2 className={styles.title}>Pipeline de Vendas</h2>
        <p className={styles.subtitle}>Funil de oportunidades por etapa</p>
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
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineChart;
