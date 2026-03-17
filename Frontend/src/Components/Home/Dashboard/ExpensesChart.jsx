import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import styles from './charts.module.css';

const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(v);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: entry.fill }} />
          {entry.name}: <strong>{formatBRL(entry.value)}</strong>
        </p>
      ))}
    </div>
  );
};

const ExpensesChart = ({ data, onEditData }) => (
  <div className={styles.chartCard}>
    <div className={styles.chartHeaderRow}>
      <div>
        <h2 className={styles.chartTitle}>Despesas Mensais</h2>
        <p className={styles.chartSubtitle}>Fixas vs. Variáveis (R$)</p>
      </div>
      {onEditData && (
        <button type="button" className={styles.editDataBtn} onClick={onEditData} title="Editar dados">
          ✏️
        </button>
      )}
    </div>
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        barSize={10}
        barGap={3}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatBRL} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', color: '#64748b' }} />
        <Bar dataKey="fixas"     name="Fixas"     fill="#ef4444" radius={[4, 4, 0, 0]} />
        <Bar dataKey="variaveis" name="Variáveis" fill="#f97316" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default ExpensesChart;
