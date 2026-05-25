import React from "react";
import styles from "../OpportunityDetail.module.css";

const OpportunityTopBar = ({ isReadOnlyMode }) => {
  if (!isReadOnlyMode) return null;

  return (
    <div className={styles.topBar}>
      <div className={styles.headerActions}>
        <span className={styles.topReadOnlyBadge}>
          Modo somente visualizacao ativo para o seu nivel de acesso.
        </span>
      </div>
    </div>
  );
};

export default OpportunityTopBar;
