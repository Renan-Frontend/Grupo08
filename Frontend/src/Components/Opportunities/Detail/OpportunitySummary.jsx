import React from "react";
import styles from "../OpportunityDetail.module.css";

const OpportunitySummary = ({
  isReadOnlyMode,
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
  motivoFechamento = "",
  setMotivoFechamento,
}) => {
  const currentStatus = showPipeline ? effectiveStatus : manualStatus;
  const isClosed =
    /ganho|won|fechado/i.test(currentStatus) ||
    /perdido|lost|cancelado/i.test(currentStatus);
  const isWon = /ganho|won|fechado/i.test(currentStatus);

  return (
    <div className={styles.headerRow}>
      <div className={styles.opportunityInfo}>
        <div className={styles.avatar}>O</div>
        <div>
          <span className={styles.infoLabel}>Informacoes da oportunidade</span>
          <textarea
            className={styles.title}
            name="opportunityTitle"
            value={title}
            onChange={(e) => {
              if (isReadOnlyMode) return;
              setTitle(e.target.value.slice(0, 120));
            }}
            readOnly={isReadOnlyMode}
            placeholder="Oportunidade"
            maxLength={120}
            rows={2}
            style={{
              fontWeight: "bold",
              border: "none",
              background: "transparent",
              width: "100%",
              fontSize: "1.5em",
              resize: "none",
              overflow: "hidden",
              fontFamily: "inherit",
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
            name="opportunityCreatedDate"
            value={createdDate}
            onChange={(e) => {
              if (isReadOnlyMode) return;
              setCreatedDate(e.target.value);
            }}
            readOnly={isReadOnlyMode}
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
            name="opportunityEndDate"
            value={endDate}
            onChange={(e) => {
              if (isReadOnlyMode) return;
              setEndDate(e.target.value);
            }}
            readOnly={isReadOnlyMode}
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
              name="opportunityManualStatus"
              value={manualStatus}
              onChange={(e) => {
                if (isReadOnlyMode) return;
                setManualStatus(e.target.value);
              }}
              readOnly={isReadOnlyMode}
              placeholder="Digite o Status..."
            />
          )}
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.label}>Proprietario</span>
          <input
            type="text"
            className={styles.dateInput}
            name="opportunityOwner"
            value={selectedOwner}
            onChange={(e) => {
              if (isReadOnlyMode) return;
              setSelectedOwner(e.target.value);
            }}
            readOnly={isReadOnlyMode}
            placeholder="Digite o proprietário..."
          />
        </div>
        {isClosed && (
          <div className={styles.summaryItem}>
            <span className={styles.label}>
              {isWon ? "Motivo do ganho" : "Motivo da perda"}
            </span>
            <input
              type="text"
              className={styles.dateInput}
              value={motivoFechamento}
              onChange={(e) => {
                if (isReadOnlyMode) return;
                setMotivoFechamento?.(e.target.value);
              }}
              readOnly={isReadOnlyMode}
              placeholder={isWon ? "Ex: Melhor preço" : "Ex: Concorrência"}
              style={{ borderColor: isWon ? "#bbf7d0" : "#fecaca" }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default OpportunitySummary;
