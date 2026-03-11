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
        {isReadOnlyMode ? (
          <span className={styles.topReadOnlyBadge}>
            Modo somente visualizacao ativo para o seu nivel de acesso.
          </span>
        ) : (
          <button
            type="button"
            className={`${styles.topActionPrimary} ${styles.topIconButton}`}
            onClick={onSaveOpportunity}
            title={isCreating ? 'Atribuir Oportunidade' : 'Editar Oportunidade'}
            aria-label={
              isCreating ? 'Atribuir Oportunidade' : 'Editar Oportunidade'
            }
          >
            <span className={styles.topCheckIcon}>✓</span>
          </button>
        )}
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
            {isEditing ? <span className={styles.topCheckIcon}>✓</span> : '✏️'}
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
