import React, { useState, useEffect } from "react";
import { API_URL } from "../../Api";
import styles from "./NotificationBanner.module.css";

const NotificationBanner = ({ daysThreshold = 7 }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Atualizar a cada minuto
    return () => clearInterval(interval);
  }, [daysThreshold]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const leadsResponse = await fetch(`${API_URL}/api/leads?limit=500`);
      const leadsData = await leadsResponse.json();
      const leads = leadsData.leads || [];

      const activitiesResponse = await fetch(
        `${API_URL}/api/activities?limit=1000`,
      );
      const activitiesData = activitiesResponse.json();
      const activities = (await activitiesData).activities || [];

      const now = new Date();
      const alerts = [];

      for (const lead of leads) {
        if (lead.stage === "convertido" || lead.stage === "perdido") continue;

        const lastActivity = activities
          .filter(
            (a) => a.entidade_tipo === "prospecto" && a.entidade_id === lead.id,
          )
          .sort(
            (a, b) => new Date(b.data_atividade) - new Date(a.data_atividade),
          )[0];

        const lastDate = lastActivity
          ? new Date(lastActivity.data_atividade)
          : new Date(lead.data_criacao);
        const daysInactive = Math.floor(
          (now - lastDate) / (1000 * 60 * 60 * 24),
        );

        if (daysInactive >= daysThreshold) {
          alerts.push({
            id: lead.id,
            type: daysInactive > daysThreshold * 2 ? "critical" : "warning",
            title: `${lead.nome} inativo por ${daysInactive} dias`,
            company: lead.empresa,
            lead: lead,
            daysInactive,
          });
        }
      }

      setNotifications(alerts.slice(0, 5)); // Mostrar apenas top 5
    } catch (error) {
      console.error("Erro ao buscar notificações:", error);
    } finally {
      setLoading(false);
    }
  };

  const dismissNotification = (id) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  const visibleNotifications = notifications.filter(
    (n) => !dismissed.has(n.id),
  );

  if (visibleNotifications.length === 0) return null;

  return (
    <div className={styles.container}>
      <div className={styles.banner}>
        <div className={styles.icon}>⚠️</div>
        <div className={styles.content}>
          <h3>Prospectos sem Atividade</h3>
          <p>{visibleNotifications.length} prospecto(s) sem contato recente</p>
          <div className={styles.alerts}>
            {visibleNotifications.map((alert) => (
              <div
                key={alert.id}
                className={`${styles.alertItem} ${styles[alert.type]}`}
              >
                <div className={styles.alertInfo}>
                  <strong>{alert.lead.nome}</strong>
                  {alert.company && <span>{alert.company}</span>}
                  <small>{alert.daysInactive} dias</small>
                </div>
                <button
                  className={styles.dismissBtn}
                  onClick={() => dismissNotification(alert.id)}
                  title="Descartar"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationBanner;
