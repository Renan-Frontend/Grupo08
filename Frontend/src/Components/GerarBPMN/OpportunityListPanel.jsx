import React from 'react';
import styles from './OpportunityListPanel.module.css';
import { getOpportunityName, getOpportunityStage } from './opportunityHelpers';

const OpportunityListPanel = ({
  loading,
  opportunities,
  selectedId,
  onSelect,
}) => {
  return (
    <aside className={styles.opportunityPanel}>
      <h2 className={styles.panelTitle}>Oportunidades</h2>

      {loading ? (
        <p className={styles.muted}>Carregando oportunidades...</p>
      ) : opportunities.length === 0 ? (
        <p className={styles.muted}>Nenhuma oportunidade encontrada.</p>
      ) : (
        <ul className={styles.opportunityList}>
          {opportunities.map((opportunity) => (
            <li key={opportunity.id}>
              <button
                type="button"
                className={`${styles.opportunityButton} ${
                  selectedId === String(opportunity.id) ? styles.selected : ''
                }`}
                onClick={() => onSelect(String(opportunity.id))}
              >
                <span className={styles.opportunityName}>
                  {getOpportunityName(opportunity)}
                </span>
                <span className={styles.opportunityStage}>
                  {getOpportunityStage(opportunity)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
};

export default OpportunityListPanel;
