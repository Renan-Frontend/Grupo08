import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import styles from './charts.module.css';



const formatBRL = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(value);

const CustomTooltip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipValue}>{fmt ? fmt(v) : v}</p>
    </div>
  );
};

const RevenueChart = ({ data, onEditData, meta, metaType = 'value', onMetaChange, onMetaTypeChange }) => {
  const vals = (data || []).map(d => d.valor).filter(v => v != null);
  const minVal = vals.length ? Math.min(...vals) : 0;
  const maxVal = vals.length ? Math.max(...vals) : 0;
  const media = (minVal + maxVal) / 2;
  const range = maxVal - minVal || 1;
  const isPct = metaType === 'percent';
  const fmtDisplay = (v) => isPct ? `${((v - minVal) / range * 100).toFixed(2)}%` : formatBRL(v);
  const chartData = data;

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeaderRow}>
        <div>
          <h2 className={styles.chartTitle}>Faturamento Mensal</h2>
          <p className={styles.chartSubtitle}>Evolução ao longo do ano</p>
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
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradientValor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#27ae60" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#27ae60" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={isPct ? (v) => `${((v - minVal) / range * 100).toFixed(0)}%` : formatBRL}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip content={<CustomTooltip fmt={fmtDisplay} />} />
          {meta != null && (
            <ReferenceLine y={meta} stroke="#8b5cf6" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: fmtDisplay(meta), position: 'right', fill: '#8b5cf6', fontSize: 11 }} />
          )}
          <Area
            type="monotone"
            dataKey="valor"
            stroke="#27ae60"
            strokeWidth={2.5}
            fill="url(#gradientValor)"
            dot={false}
            activeDot={{ r: 5, fill: '#27ae60', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RevenueChart;
