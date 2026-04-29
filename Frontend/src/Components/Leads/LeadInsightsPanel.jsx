import React from "react";
import styles from "./LeadInsightsPanel.module.css";

const LeadInsightsPanel = ({ insights, isLoading }) => {
  if (!insights) return null;

  const score = Number(insights?.score_conversao ?? 0);
  const sentimento = String(insights?.sentimento || "neutro");
  const urgencia = String(insights?.urgencia || "média");

  const formatLabel = (value) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : "-";

  const getScoreColor = (score) => {
    if (score >= 75) return "#10b981"; // Verde
    if (score >= 50) return "#f59e0b"; // Amarelo
    return "#ef4444"; // Vermelho
  };

  const getSentimentEmoji = (sentimento) => {
    const map = {
      positivo: "😊",
      neutro: "😐",
      negativo: "😞",
    };
    return map[sentimento] || "😐";
  };

  const getUrgenciaColor = (urgencia) => {
    const map = {
      alta: "#ef4444",
      média: "#f59e0b",
      baixa: "#10b981",
    };
    return map[urgencia] || "#6b7280";
  };

  return (
    <div className={styles.panel}>
      {isLoading ? (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Analisando prospecto com IA...</p>
        </div>
      ) : (
        <>
          <div className={styles.header}>
            <h3>🤖 Análise com IA</h3>
          </div>

          <div className={styles.content}>
            {/* Score de Conversão */}
            <div className={styles.scoreSection}>
              <div className={styles.scoreLabel}>Score de Conversão</div>
              <div className={styles.scoreBar}>
                <div
                  className={styles.scoreFill}
                  style={{
                    width: `${score}%`,
                    backgroundColor: getScoreColor(score),
                  }}
                ></div>
              </div>
              <div className={styles.scoreText}>{score}% de probabilidade</div>
            </div>

            {/* Resumo */}
            {insights.resumo && (
              <div className={styles.section}>
                <label>Resumo do Relacionamento</label>
                <p className={styles.resumo}>{insights.resumo}</p>
              </div>
            )}

            {/* Sentimento e Urgência */}
            <div className={styles.row}>
              <div className={styles.badge}>
                <span className={styles.badgeIcon}>
                  {getSentimentEmoji(sentimento)}
                </span>
                <div>
                  <div className={styles.badgeLabel}>Sentimento</div>
                  <div className={styles.badgeValue}>
                    {formatLabel(sentimento)}
                  </div>
                </div>
              </div>

              <div className={styles.badge}>
                <span
                  className={styles.urgenciaIcon}
                  style={{
                    backgroundColor: getUrgenciaColor(urgencia),
                  }}
                >
                  ⚡
                </span>
                <div>
                  <div className={styles.badgeLabel}>Urgência</div>
                  <div className={styles.badgeValue}>
                    {formatLabel(urgencia)}
                  </div>
                </div>
              </div>
            </div>

            {/* Próxima Ação */}
            {insights.proxima_acao && (
              <div className={styles.actionSection}>
                <div className={styles.actionIcon}>→</div>
                <div>
                  <div className={styles.actionLabel}>
                    Próxima Ação Recomendada
                  </div>
                  <div className={styles.actionText}>
                    {insights.proxima_acao}
                  </div>
                </div>
              </div>
            )}

            {/* Motivo de Inatividade */}
            {insights.motivo_inatividade && (
              <div className={styles.inactiveSection}>
                <div className={styles.warningIcon}>⚠️</div>
                <div>
                  <div className={styles.inactiveLabel}>
                    Possível Motivo da Inatividade
                  </div>
                  <div className={styles.inactiveText}>
                    {insights.motivo_inatividade}
                  </div>
                </div>
              </div>
            )}
          </div>

          {insights.fonte && (
            <div className={styles.footer}>
              <small>Análise gerada por {insights.fonte}</small>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LeadInsightsPanel;
