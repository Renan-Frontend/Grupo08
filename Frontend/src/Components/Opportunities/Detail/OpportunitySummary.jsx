import React from 'react';
import styles from '../OpportunityDetail.module.css';

const OpportunitySummary = ({
  title,
  setTitle,
  createdDate,
  setCreatedDate,
  endDate,
  setEndDate,
  showPipeline,
  effectiveStatus,
  manualStatus,
  setManualStatus,
  selectedOwner,
  setSelectedOwner,
}) => {
  return (
    <div className={styles.headerRow}>
      <div className={styles.opportunityInfo}>
        <div className={styles.avatar}>O</div>
        <div>
          <span className={styles.infoLabel}>Informacoes da oportunidade</span>
          <input
            className={styles.title}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 50))}
            placeholder="Oportunidade"
            maxLength={20}
            style={{
              fontWeight: 'bold',
              border: 'none',
              background: 'transparent',
              width: '100%',
              fontSize: '1.5em',
            }}
          />
        </div>
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span className={styles.label}>Data inicial</span>
          <input
            type="text"
            className={styles.dateInput}
            value={createdDate}
            onChange={(e) => setCreatedDate(e.target.value)}
            placeholder="dd/mm/aaaa"
            autoComplete="off"
            inputMode="numeric"
          />
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.label}>Data final</span>
          <input
            type="text"
            className={styles.dateInput}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder="dd/mm/aaaa"
            autoComplete="off"
            inputMode="numeric"
          />
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.label}>Status</span>
          {showPipeline ? (
            <strong className={styles.summaryFieldValue}>
              {effectiveStatus}
            </strong>
          ) : (
            <input
              type="text"
              className={styles.dateInput}
              value={manualStatus}
              onChange={(e) => setManualStatus(e.target.value)}
              placeholder="Digite o Status..."
            />
          )}
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.label}>Proprietario</span>
          <input
            type="text"
            className={styles.dateInput}
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            placeholder="Digite o proprietário..."
          />
        </div>
      </div>
    </div>
  );
};

export default OpportunitySummary;
