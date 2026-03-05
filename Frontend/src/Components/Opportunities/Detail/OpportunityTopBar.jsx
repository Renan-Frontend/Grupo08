import React from 'react';
import styles from '../OpportunityDetail.module.css';

const OpportunityTopBar = ({
  isCreating,
  isEditing,
  isReadOnlyMode,
  onSaveOpportunity,
  onToggleEditing,
  onDeleteOpportunity,
}) => {
  return (
    <div className={styles.topBar}>
      <div className={styles.headerActions}>
        {!isReadOnlyMode ? (
          <button
            type="button"
            className={`${styles.topActionButton} ${styles.topIconButton}`}
            onClick={onSaveOpportunity}
            title={isCreating ? 'Atribuir Oportunidade' : 'Editar Oportunidade'}
            aria-label={
              isCreating ? 'Atribuir Oportunidade' : 'Editar Oportunidade'
            }
          >
            💼
          </button>
        ) : null}
      </div>

      {!isReadOnlyMode ? (
        <>
          <button
            type="button"
            className={`${
              isEditing ? styles.topActionPrimary : styles.topActionButton
            } ${styles.topIconButton}`}
            onClick={onToggleEditing}
            title={isEditing ? 'Salvar Layout' : 'Editar Layout'}
            aria-label={isEditing ? 'Salvar Layout' : 'Editar Layout'}
          >
            {isEditing ? '💾' : '✏️'}
          </button>
          <button
            type="button"
            className={`${styles.topActionDanger} ${styles.topIconButton}`}
            onClick={onDeleteOpportunity}
            title="Deletar Oportunidade"
            aria-label="Deletar Oportunidade"
          >
            🗑️
          </button>
        </>
      ) : null}
    </div>
  );
};

export default OpportunityTopBar;
