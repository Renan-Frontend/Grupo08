import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import styles from './charts.module.css';



const CustomTooltip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className={styles.tooltipRow}>
          <span
            className={styles.tooltipDot}
            style={{ background: entry.fill }}
          />
          {entry.name}: <strong>{fmt ? fmt(entry.value) : entry.value}</strong>
        </p>
      ))}
    </div>
  );
};

const SalesBarChart = ({ data, onEditData, meta, metaType = 'value', onMetaChange, onMetaTypeChange }) => {
  const allVals = (data || []).flatMap(d => [d.vendas, d.clientes].filter(v => v != null));
  const minVal = allVals.length ? Math.min(...allVals) : 0;
  const maxVal = allVals.length ? Math.max(...allVals) : 0;
  const media = (minVal + maxVal) / 2;
  const range = maxVal - minVal || 1;
  const isPct = metaType === 'percent';
  const fmtDisplay = (v) => isPct ? `${((v - minVal) / range * 100).toFixed(2)}%` : Number(v).toFixed(2);
  const chartData = data;

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeaderRow}>
        <div>
          <h2 className={styles.chartTitle}>Vendas e Clientes</h2>
          <p className={styles.chartSubtitle}>Comparativo mensal</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 600, background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
            Média: {fmtDisplay(media)}
          </span>
          {meta != null && (
            <span style={{ fontSize: '0.68rem', color: '#8b5cf6', fontWeight: 600, background: '#f8f5ff', padding: '0.1rem 0.5rem', borderRadius: 4 }}>
              Meta: {fmtDisplay(meta)}
            </span>
          )}
          {onMetaTypeChange && (
            <button type="button" onClick={() => onMetaTypeChange(metaType === 'percent' ? 'value' : 'percent')}
              style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', background: '#f8f5ff', color: '#8b5cf6', cursor: 'pointer', fontWeight: 600, lineHeight: 1 }}
              title={metaType === 'percent' ? 'Modo porcentagem — clique para valor' : 'Modo valor — clique para porcentagem'}
            >{metaType === 'percent' ? '%' : '#'}</button>
          )}
          {onEditData && (
            <button type="button" className={styles.editDataBtn} onClick={onEditData} title="Editar dados">
              ✏️
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          barSize={10}
          barGap={3}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={isPct ? (v) => `${((v - minVal) / range * 100).toFixed(0)}%` : undefined}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip fmt={fmtDisplay} />} cursor={{ fill: '#f1f5f9' }} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '0.8rem', color: '#64748b' }}
          />
          {meta != null && (
            <ReferenceLine y={meta} stroke="#8b5cf6" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: fmtDisplay(meta), position: 'right', fill: '#8b5cf6', fontSize: 11 }} />
          )}
          <Bar
            dataKey="vendas"
            name="Vendas"
            fill="#27ae60"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="clientes"
            name="Clientes"
            fill="#93c5fd"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SalesBarChart;
