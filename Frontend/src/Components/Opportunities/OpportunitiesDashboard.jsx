import React from "react";
import styles from "./Opportunities.module.css";
import { parseOpportunityDateValue } from "./opportunityViewModel";

const OpportunitiesDashboard = ({ opportunities }) => {
  // Calcula métricas
  const stats = React.useMemo(() => {
    const total = opportunities.length;
    const ganhos = opportunities.filter((o) => o.statusKey === "ganho").length;
    const perdidos = opportunities.filter(
      (o) => o.statusKey === "perdido",
    ).length;
    const abertos = total - ganhos - perdidos;
    const comBpmn = opportunities.filter((o) => o.hasBpmn).length;

    const valorTotal = opportunities.reduce(
      (sum, o) => sum + (o.valueNumber || 0),
      0,
    );
    const taxaConversao = total > 0 ? ((ganhos / total) * 100).toFixed(1) : 0;

    // Tempo médio no funil (dias)
    const diasNoFunil = opportunities
      .map((o) => {
        const created =
          o.createdAt ||
          parseOpportunityDateValue(
            o.createdDate || o.criado_em || o.created_at,
          );
        if (!created) return 0;
        const agora = new Date();
        return Math.floor((agora - created) / (1000 * 60 * 60 * 24));
      })
      .filter((d) => d > 0);
    const tempoMedio =
      diasNoFunil.length > 0
        ? Math.round(
            diasNoFunil.reduce((a, b) => a + b, 0) / diasNoFunil.length,
          )
        : 0;

    return {
      total,
      ganhos,
      perdidos,
      abertos,
      comBpmn,
      valorTotal,
      taxaConversao,
      tempoMedio,
    };
  }, [opportunities]);

  const formatarValor = (valor) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  };

  return (
    <div className={styles.dashboardContainer}>
      <h3 className={styles.dashboardTitle}>📊 Resumo de Vendas (Mês)</h3>
      <div className={styles.metricsGrid}>
        {/* Card 1: Total de Oportunidades */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total de Oportunidades</span>
          </div>
          <div className={styles.metricValue}>{stats.total}</div>
          <div className={styles.metricBreakdown}>
            <span className={styles.breakdown}>🟢 {stats.ganhos} Ganho</span>
            <span className={styles.breakdown}>
              🔴 {stats.perdidos} Perdido
            </span>
            <span className={styles.breakdown}>⚪ {stats.abertos} Aberto</span>
            <span className={styles.breakdown}>
              🤖 {stats.comBpmn} com fluxo
            </span>
          </div>
        </div>

        {/* Card 2: Valor em Pipeline */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Pipeline Total</span>
          </div>
          <div className={styles.metricValue}>
            {formatarValor(stats.valorTotal)}
          </div>
          <div className={styles.metricTrend}>📈 Valor médio por opp</div>
          <div className={styles.metricBreakdown}>
            {stats.total > 0
              ? formatarValor(stats.valorTotal / stats.total)
              : "R$ 0,00"}
          </div>
        </div>

        {/* Card 3: Taxa de Conversão */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Taxa de Conversão</span>
          </div>
          <div className={styles.metricValue}>{stats.taxaConversao}%</div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${stats.taxaConversao}%` }}
            />
          </div>
          <div className={styles.metricNote}>
            {stats.ganhos} ganhos de {stats.total} oportunidades
          </div>
        </div>

        {/* Card 4: Tempo Médio no Funil */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Tempo Médio no Funil</span>
          </div>
          <div className={styles.metricValue}>{stats.tempoMedio} dias</div>
          <div className={styles.metricTrend}>⏱️ Dias em aberto</div>
          <div className={styles.metricNote}>Reduzir = Vendas mais rápidas</div>
        </div>
      </div>
    </div>
  );
};

export default OpportunitiesDashboard;
