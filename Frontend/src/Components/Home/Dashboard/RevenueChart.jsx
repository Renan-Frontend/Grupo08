import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipValue}>{formatBRL(payload[0].value)}</p>
    </div>
  );
};

const RevenueChart = ({ data, onEditData }) => (
  <div className={styles.chartCard}>
    <div className={styles.chartHeaderRow}>
      <div>
        <h2 className={styles.chartTitle}>Faturamento Mensal</h2>
        <p className={styles.chartSubtitle}>Evolução ao longo do ano</p>
      </div>
      {onEditData && (
        <button type="button" className={styles.editDataBtn} onClick={onEditData} title="Editar dados">
          ✏️
        </button>
      )}
    </div>
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradientValor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#27ae60" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#27ae60" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatBRL}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip content={<CustomTooltip />} />
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

export default RevenueChart;
