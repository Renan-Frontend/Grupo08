import React, { useState, useEffect } from "react";
import { API_URL } from "../../Api";
import styles from "./ActivityDashboard.module.css";

const ActivityDashboard = () => {
  const [stats, setStats] = useState({
    totalActivities: 0,
    activitiesByType: {},
    activitiesByUser: {},
    recentActivities: [],
    avgActivitiesPerLead: 0,
  });
  const [period, setPeriod] = useState("month"); // day, week, month, all
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/activities?limit=1000`);
      const data = await response.json();
      const activities = data.activities || [];

      const now = new Date();
      let filtered = activities;

      // Filtrar por período
      if (period !== "all") {
        const days = {
          day: 1,
          week: 7,
          month: 30,
        }[period];

        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        filtered = activities.filter((a) => new Date(a.data_criacao) >= cutoff);
      }

      // Agrupar por tipo
      const byType = {};
      filtered.forEach((a) => {
        byType[a.tipo] = (byType[a.tipo] || 0) + 1;
      });

      // Agrupar por usuário
      const byUser = {};
      filtered.forEach((a) => {
        const user = a.usuario_criador || "Sistema";
        byUser[user] = (byUser[user] || 0) + 1;
      });

      // Atividades recentes (últimas 10)
      const recent = filtered
        .sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao))
        .slice(0, 10);

      // Total de prospectos
      const leadsResponse = await fetch(`${API_URL}/api/leads?limit=500`);
      const leadsData = await leadsResponse.json();
      const totalLeads = leadsData.total || 1;

      setStats({
        totalActivities: filtered.length,
        activitiesByType: byType,
        activitiesByUser: byUser,
        recentActivities: recent,
        avgActivitiesPerLead: (filtered.length / totalLeads).toFixed(1),
      });
    } catch (error) {
      console.error("Erro ao buscar estatísticas:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeEmoji = (type) => {
    const emojis = {
      call: "☎️",
      email: "📧",
      meeting: "🤝",
      task: "✓",
      note: "📝",
    };
    return emojis[type] || "📌";
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString("pt-BR") +
      " " +
      date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    );
  };

  const getTopType = () => {
    const sorted = Object.entries(stats.activitiesByType).sort(
      (a, b) => b[1] - a[1],
    );
    return sorted[0] || null;
  };

  const getTopUser = () => {
    const sorted = Object.entries(stats.activitiesByUser).sort(
      (a, b) => b[1] - a[1],
    );
    return sorted[0] || null;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>📊 Dashboard de Atividades</h2>
        <div className={styles.periodSelector}>
          {["day", "week", "month", "all"].map((p) => (
            <button
              key={p}
              className={`${styles.periodBtn} ${period === p ? styles.active : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "day"
                ? "Hoje"
                : p === "week"
                  ? "Esta Semana"
                  : p === "month"
                    ? "Este Mês"
                    : "Tudo"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Carregando...</p>
        </div>
      ) : (
        <>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiValue}>{stats.totalActivities}</div>
              <div className={styles.kpiLabel}>Atividades</div>
              <div className={styles.kpiDetail}>no período</div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiValue}>
                {stats.avgActivitiesPerLead}
              </div>
              <div className={styles.kpiLabel}>Média por Prospecto</div>
              <div className={styles.kpiDetail}>atividades/prospecto</div>
            </div>

            {getTopType() && (
              <div className={styles.kpiCard}>
                <div className={styles.kpiValue}>
                  {getTypeEmoji(getTopType()[0])} {getTopType()[1]}
                </div>
                <div className={styles.kpiLabel}>Tipo Mais Comum</div>
                <div className={styles.kpiDetail}>{getTopType()[0]}</div>
              </div>
            )}

            {getTopUser() && (
              <div className={styles.kpiCard}>
                <div className={styles.kpiValue}>{getTopUser()[1]}</div>
                <div className={styles.kpiLabel}>Usuário Mais Ativo</div>
                <div className={styles.kpiDetail}>{getTopUser()[0]}</div>
              </div>
            )}
          </div>

          <div className={styles.chartsGrid}>
            <div className={styles.chart}>
              <h3>Atividades por Tipo</h3>
              <div className={styles.barChart}>
                {Object.entries(stats.activitiesByType)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([type, count]) => (
                    <div key={type} className={styles.barItem}>
                      <div className={styles.barLabel}>
                        {getTypeEmoji(type)} {type}
                      </div>
                      <div className={styles.barContainer}>
                        <div
                          className={styles.bar}
                          style={{
                            width: `${(count / Math.max(...Object.values(stats.activitiesByType))) * 100}%`,
                          }}
                        ></div>
                        <span className={styles.barValue}>{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className={styles.chart}>
              <h3>Atividades por Usuário</h3>
              <div className={styles.barChart}>
                {Object.entries(stats.activitiesByUser)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([user, count]) => (
                    <div key={user} className={styles.barItem}>
                      <div className={styles.barLabel}>👤 {user}</div>
                      <div className={styles.barContainer}>
                        <div
                          className={styles.bar}
                          style={{
                            width: `${(count / Math.max(...Object.values(stats.activitiesByUser))) * 100}%`,
                          }}
                        ></div>
                        <span className={styles.barValue}>{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className={styles.recentSection}>
            <h3>Atividades Recentes</h3>
            <div className={styles.activityList}>
              {stats.recentActivities.length > 0 ? (
                stats.recentActivities.map((activity, idx) => (
                  <div key={idx} className={styles.activityRow}>
                    <span className={styles.activityIcon}>
                      {getTypeEmoji(activity.tipo)}
                    </span>
                    <div className={styles.activityInfo}>
                      <strong>{activity.titulo}</strong>
                      <small>{formatDate(activity.data_criacao)}</small>
                    </div>
                    <div className={styles.activityMeta}>
                      <span className={styles.user}>
                        {activity.usuario_criador}
                      </span>
                      <span
                        className={styles.status}
                        style={{
                          backgroundColor:
                            activity.status === "concluido"
                              ? "#d1fae5"
                              : activity.status === "cancelado"
                                ? "#fee2e2"
                                : "#dbeafe",
                          color:
                            activity.status === "concluido"
                              ? "#065f46"
                              : activity.status === "cancelado"
                                ? "#7f1d1d"
                                : "#1e40af",
                        }}
                      >
                        {activity.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.empty}>Nenhuma atividade neste período</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ActivityDashboard;
