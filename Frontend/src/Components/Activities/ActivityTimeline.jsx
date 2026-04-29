import React, { useState, useEffect } from "react";
import { API_URL } from "../../Api";
import styles from "./ActivityTimeline.module.css";

const ActivityTypeIcon = ({ tipo }) => {
  const icons = {
    call: "☎️",
    email: "📧",
    meeting: "🤝",
    task: "✓",
    note: "📝",
  };
  return icons[tipo] || "📌";
};

const ActivityStatusBadge = ({ status }) => {
  const colors = {
    planejado: "#3b82f6",
    concluido: "#10b981",
    cancelado: "#ef4444",
  };
  return (
    <span
      className={styles.statusBadge}
      style={{ backgroundColor: colors[status] }}
    >
      {status}
    </span>
  );
};

const ActivityTimeline = ({
  entityType,
  entityId,
  limit = 5,
  onAddActivity,
}) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entityType && entityId) {
      fetchActivities();
    }
  }, [entityType, entityId]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/activities/entity/${entityType}/${entityId}?limit=${limit}`,
      );
      const data = await response.json();
      setActivities(data.activities || []);
    } catch (error) {
      console.error("Erro ao buscar atividades:", error);
    }
    setLoading(false);
  };

  const handleDeleteActivity = async (activityId) => {
    if (!window.confirm("Deletar esta atividade?")) return;

    try {
      const response = await fetch(`${API_URL}/api/activities/${activityId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchActivities();
      }
    } catch (error) {
      console.error("Erro ao deletar atividade:", error);
      alert("Erro ao deletar atividade");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Ontem";
    } else {
      return date.toLocaleDateString("pt-BR");
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3>⏱️ Atividades Recentes</h3>
        </div>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>⏱️ Atividades Recentes</h3>
        <button
          className={styles.addBtn}
          onClick={onAddActivity}
          title="Adicionar atividade"
        >
          +
        </button>
      </div>

      {activities.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Nenhuma atividade registrada</p>
        </div>
      ) : (
        <div className={styles.timeline}>
          {activities.slice(0, limit).map((activity, index) => (
            <div key={activity.id} className={styles.timelineItem}>
              <div className={styles.dot}>
                <span>{<ActivityTypeIcon tipo={activity.tipo} />}</span>
              </div>
              <div className={styles.content}>
                <div className={styles.title}>{activity.titulo}</div>
                <div className={styles.meta}>
                  <span className={styles.date}>
                    {formatDate(activity.data_atividade)}
                  </span>
                  <ActivityStatusBadge status={activity.status} />
                  {activity.responsavel && (
                    <span className={styles.responsible}>
                      👤 {activity.responsavel}
                    </span>
                  )}
                </div>
                {activity.descricao && (
                  <p className={styles.description}>{activity.descricao}</p>
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDeleteActivity(activity.id)}
                  title="Deletar"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;
