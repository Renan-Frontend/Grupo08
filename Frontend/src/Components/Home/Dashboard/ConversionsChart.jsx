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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipValue}>{payload[0].value.toFixed(1)}%</p>
    </div>
  );
};

const ConversionsChart = ({ data, onEditData }) => (
  <div className={styles.chartCard}>
    <div className={styles.chartHeaderRow}>
      <div>
        <h2 className={styles.chartTitle}>Taxa de Conversão</h2>
        <p className={styles.chartSubtitle}>Evolução mensal (%)</p>
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
          <linearGradient id="gradientTaxa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
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
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          domain={[0, 'auto']}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="taxa"
          name="Taxa (%)"
          stroke="#6366f1"
          strokeWidth={2.5}
          fill="url(#gradientTaxa)"
          dot={false}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

export default ConversionsChart;
