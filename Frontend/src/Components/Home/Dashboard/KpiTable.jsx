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
const SingleTooltip = ({ active, payload, label, metaVal, fmt }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  const above = metaVal !== null && val != null && val >= metaVal;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipValue} style={{ color: metaVal === null ? '#f8fafc' : above ? '#4ade80' : '#f87171' }}>
        {fmt ? fmt(val) : (val ?? '')}
      </p>
      {metaVal !== null && (
        <p style={{ fontSize: '0.7rem', color: '#a78bfa', margin: '0.15rem 0 0' }}>Meta: {fmt ? fmt(metaVal) : metaVal}</p>
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
const IndicatorChart = ({ row, index, onEdit, onDelete, onReset, onMetaChange, onMetaTypeChange }) => {
  const isMetaDefinir = row.meta === 'definir';
  const metaVal = isMetaDefinir ? null : toPct(row.meta);
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

  const rawVals = chartData.map((d) => d.valor).filter(v => v != null);
  const dataMin = rawVals.length ? Math.min(...rawVals) : 0;
  const dataMax = rawVals.length ? Math.max(...rawVals) : 0;
  const dataMedia = Number(((dataMin + dataMax) / 2).toFixed(2));
  const dataRange = dataMax - dataMin || 1;

  const isPct = (row.metaType || 'value') === 'percent';
  const fmtDisplay = (v) => isPct ? `${((v - dataMin) / dataRange * 100).toFixed(2)}%` : Number(v).toFixed(2);

  const displayData = chartData;
  const displayMeta = metaVal;

  const displayVals = displayData.map((d) => d.valor).filter(v => v != null);
  if (displayMeta !== null) displayVals.push(displayMeta);
  const minY = Math.max(0, Math.floor(Math.min(...(displayVals.length ? displayVals : [0])) - 5));
  const maxY = Math.ceil(Math.max(...(displayVals.length ? displayVals : [100])) + 5);

  return (
    <div className={styles.chartCard} style={{ padding: '1rem 1.25rem' }}>
      <div className={styles.chartHeaderRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className={styles.chartTitle} style={{ fontSize: '0.88rem', wordBreak: 'break-word' }} title={row.name}>
            {row.name}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.15rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: trendColor(row.tendencia) }}>
              {trend}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 600, background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
            Média: {fmtDisplay(dataMedia)}
          </span>
          {row.meta != null && (
            <span style={{ fontSize: '0.68rem', color: isMetaDefinir ? '#94a3b8' : '#8b5cf6', fontWeight: 600, background: isMetaDefinir ? '#f1f5f9' : '#f8f5ff', padding: '0.1rem 0.5rem', borderRadius: 4, fontStyle: isMetaDefinir ? 'italic' : 'normal' }}>
              {isMetaDefinir ? 'Meta: definir' : `Meta: ${fmtDisplay(metaVal !== null ? metaVal : Number(row.meta))}`}
            </span>
          )}
          {onMetaTypeChange && (
            <button type="button" onClick={() => onMetaTypeChange(isPct ? 'value' : 'percent')}
              style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', background: '#f8f5ff', color: '#8b5cf6', cursor: 'pointer', fontWeight: 600, lineHeight: 1 }}
              title={isPct ? 'Modo porcentagem — clique para valor' : 'Modo valor — clique para porcentagem'}
            >{isPct ? '%' : '#'}</button>
          )}
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
        <AreaChart data={displayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`kpi_grad_${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 8, fill: '#94a3b8', angle: -35, textAnchor: 'end' }}
            axisLine={false}
            tickLine={false}
            interval={0}
            height={32}
          />
          <YAxis
            domain={[minY, maxY]}
            tickFormatter={isPct ? (v) => `${((v - dataMin) / dataRange * 100).toFixed(0)}%` : undefined}
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={isPct ? 52 : 46}
          />
          <Tooltip content={<SingleTooltip metaVal={metaVal} fmt={fmtDisplay} />} />
          {metaVal !== null && (
            <ReferenceLine
              y={metaVal}
              stroke="#8b5cf6"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              label={{ value: fmtDisplay(metaVal), position: 'right', fill: '#8b5cf6', fontSize: 11 }}
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
   KpiChart — renders indicator charts grouped by section
   ══════════════════════════════════════════════ */
const KpiChart = ({ data = [], onEditIndicator, onDeleteIndicator, onResetIndicator, onMetaChange, onMetaTypeChange }) => {
  if (!data.length) return null;

  /* Group rows by section, preserving order */
  const groups = useMemo(() => {
    const result = [];
    let currentSection = null;
    let currentRows = [];
    data.forEach((row, i) => {
      const sec = (row.section || '').trim();
      if (sec !== currentSection) {
        if (currentRows.length) result.push({ section: currentSection, rows: currentRows });
        currentSection = sec;
        currentRows = [];
      }
      currentRows.push({ row, origIndex: i });
    });
    if (currentRows.length) result.push({ section: currentSection, rows: currentRows });
    return result;
  }, [data]);

  return (
    <>
      {groups.map((g, gi) => (
        <React.Fragment key={g.section || gi}>
          {g.section && (
            <div className={styles.kpiSectionHeader}>
              <span className={styles.kpiSectionLabel}>{g.section}</span>
              <span className={styles.kpiSectionLine} />
            </div>
          )}
          {g.rows.map(({ row, origIndex }) => (
            <IndicatorChart
              key={row.name || origIndex}
              row={row}
              index={origIndex}
              onEdit={onEditIndicator ? () => onEditIndicator(origIndex) : null}
              onDelete={onDeleteIndicator ? () => onDeleteIndicator(origIndex) : null}
              onReset={onResetIndicator ? () => onResetIndicator(origIndex) : null}
              onMetaChange={onMetaChange ? (val) => onMetaChange(origIndex, val) : null}
              onMetaTypeChange={onMetaTypeChange ? (type) => onMetaTypeChange(origIndex, type) : null}
            />
          ))}
        </React.Fragment>
      ))}
    </>
  );
};

export default KpiChart;
