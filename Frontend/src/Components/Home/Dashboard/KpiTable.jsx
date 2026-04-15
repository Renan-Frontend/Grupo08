import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import styles from './charts.module.css';

/* ── helpers ── */
const toNum = (v) => {
  if (v === '' || v === undefined || v === null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim();
  const pctMatch = s.match(/^([\d.,]+)\s*%$/);
  if (pctMatch) return Number(pctMatch[1].replace(',', '.')) / 100;
  const n = Number(s.replace(',', '.'));
  return isNaN(n) ? null : n;
};

const toPct = (v) => {
  const n = toNum(v);
  if (n === null) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n;
};

const fmtPct = (v) => {
  if (v === null || v === undefined) return '';
  return `${Number(v).toFixed(2)}%`;
};

const trendArrow = (t) => {
  const s = String(t || '').trim();
  if (s === '↑' || /up|cima|subir/i.test(s)) return '↑';
  if (s === '↓' || /down|baixo|cair/i.test(s)) return '↓';
  return '→';
};

const trendColor = (t) => {
  const a = trendArrow(t);
  if (a === '↑') return '#16a34a';
  if (a === '↓') return '#dc2626';
  return '#64748b';
};

/* ── Tooltip ── */
const SingleTooltip = ({ active, payload, label, metaVal }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  const above = metaVal !== null && val != null && val >= metaVal;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipValue} style={{ color: metaVal === null ? '#f8fafc' : above ? '#4ade80' : '#f87171' }}>
        {fmtPct(val)}
      </p>
      {metaVal !== null && (
        <p style={{ fontSize: '0.7rem', color: '#a78bfa', margin: '0.15rem 0 0' }}>Meta: {fmtPct(metaVal)}</p>
      )}
    </div>
  );
};

/* ── Custom dot: green when >= meta, red when below ── */
const ColorDot = ({ cx, cy, payload, metaVal }) => {
  if (cx == null || cy == null || payload?.valor == null) return null;
  const above = metaVal !== null ? payload.valor >= metaVal : true;
  return <circle cx={cx} cy={cy} r={3} fill={above ? '#22c55e' : '#ef4444'} stroke="#fff" strokeWidth={1.5} />;
};

/* ══════════════════════════════════════════════
   Single indicator chart card
   ══════════════════════════════════════════════ */
const IndicatorChart = ({ row, index, onEdit, onDelete, onReset }) => {
  const metaVal = toPct(row.meta);
  const mediaVal = toPct(row.media);
  const trend = trendArrow(row.tendencia);

  const chartData = useMemo(() => {
    const months = row.months || {};
    return Object.entries(months).map(([label, raw]) => ({
      month: label,
      valor: toPct(raw),
    })).filter((d) => d.valor !== null);
  }, [row.months]);

  if (!chartData.length) return null;

  const vals = chartData.map((d) => d.valor);
  if (metaVal !== null) vals.push(metaVal);
  const minY = Math.max(0, Math.floor(Math.min(...vals) - 5));
  const maxY = Math.ceil(Math.max(...vals) + 5);

  return (
    <div className={styles.chartCard} style={{ padding: '1rem 1.25rem' }}>
      <div className={styles.chartHeaderRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className={styles.chartTitle} style={{ fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.name}>
            {row.name}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.15rem', flexWrap: 'wrap' }}>
            {metaVal !== null && (
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#7c3aed', background: '#ede9fe', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
                Meta {fmtPct(metaVal)}
              </span>
            )}
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: trendColor(row.tendencia) }}>
              {trend}
            </span>
            {mediaVal !== null && (
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
                Média {fmtPct(mediaVal)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
          {onReset && (
            <button type="button" className={styles.editDataBtn} onClick={onReset} title="Resetar para valor original"
              style={{ borderColor: '#fbbf24', color: '#92400e' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fffbeb'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
            >
              ↩
            </button>
          )}
          {onEdit && (
            <button type="button" className={styles.editDataBtn} onClick={onEdit} title="Editar indicador">
              ✏️
            </button>
          )}
          {onDelete && (
            <button type="button" className={styles.editDataBtn} onClick={onDelete} title="Apagar indicador"
              style={{ borderColor: '#fecaca', color: '#dc2626' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={`kpi_grad_${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
          />
          <YAxis
            domain={[minY, maxY]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<SingleTooltip metaVal={metaVal} />} />
          {metaVal !== null && (
            <ReferenceLine
              y={metaVal}
              stroke="#8b5cf6"
              strokeDasharray="6 3"
              strokeWidth={1.5}
            />
          )}
          <Area
            type="monotone"
            dataKey="valor"
            stroke="#6366f1"
            strokeWidth={2}
            fill={`url(#kpi_grad_${index})`}
            dot={<ColorDot metaVal={metaVal} />}
            activeDot={{ r: 5, strokeWidth: 0 }}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ══════════════════════════════════════════════
   KpiChart — renders a grid of individual indicator charts
   ══════════════════════════════════════════════ */
const KpiChart = ({ data = [], onEditIndicator, onDeleteIndicator, onResetIndicator }) => {
  if (!data.length) return null;

  return (
    <>
      {data.map((row, i) => (
        <IndicatorChart
          key={row.name || i}
          row={row}
          index={i}
          onEdit={onEditIndicator ? () => onEditIndicator(i) : null}
          onDelete={onDeleteIndicator ? () => onDeleteIndicator(i) : null}
          onReset={onResetIndicator ? () => onResetIndicator(i) : null}
        />
      ))}
    </>
  );
};

export default KpiChart;
