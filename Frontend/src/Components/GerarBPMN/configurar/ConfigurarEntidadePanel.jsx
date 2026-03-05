import React from 'react';
import Close from '../../Helper/Close';
import panelStyles from './ConfigurarEntidadePanel.module.css';

const toEntitySlug = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const ConfigurarEntidadePanel = ({
  selectedNode,
  stageConfigMode,
  setStageConfigMode,
  stageModeLockedTo,
  entityMode,
  setEntityMode,
  selectedExistingEntityId,
  setSelectedExistingEntityId,
  entityOptions,
  newEntityForm,
  setNewEntityForm,
  conditionalForm,
  setConditionalForm,
  newEntityFields,
  onBeforeNavigateToEntityFields,
  isReadOnlyMode = false,
}) => {
  const effectiveStageConfigMode =
    stageModeLockedTo === 'entidade' || stageModeLockedTo === 'condicional'
      ? stageModeLockedTo
      : stageConfigMode;
  const sectionTitle = 'Configuração da etapa';
  const selectedExistingEntityName =
    entityMode === 'existente'
      ? String(
          entityOptions.find(
            (item) => String(item?.id) === String(selectedExistingEntityId),
          )?.nome || '',
        ).trim()
      : '';
  const targetEntityName =
    selectedExistingEntityName || String(newEntityForm?.nome || '').trim();
  const targetEntitySlug = toEntitySlug(targetEntityName);
  const entityFieldsEditHref = targetEntitySlug
    ? `/entidades/${targetEntitySlug}`
    : '/entidades';
  const [pendingEntityFieldsHref, setPendingEntityFieldsHref] =
    React.useState('');
  const [isNavigatingToEntityFields, setIsNavigatingToEntityFields] =
    React.useState(false);

  const handleNavigateToEntityFields = (event) => {
    event.preventDefault();
    setPendingEntityFieldsHref(entityFieldsEditHref);
  };

  const handleCancelNavigateToEntityFields = () => {
    if (isNavigatingToEntityFields) return;
    setPendingEntityFieldsHref('');
  };

  const handleConfirmNavigateToEntityFields = async () => {
    if (!pendingEntityFieldsHref) return;

    setIsNavigatingToEntityFields(true);
    if (typeof onBeforeNavigateToEntityFields === 'function') {
      try {
        await onBeforeNavigateToEntityFields();
      } catch {
        // no-op: still allow navigation after best-effort save
      }
    }

    window.location.assign(pendingEntityFieldsHref);
  };

  if (!selectedNode) {
    return (
      <>
        <div className={panelStyles.fieldGroup}>
          <label className={panelStyles.fieldLabel}>{sectionTitle}</label>
          <div className={panelStyles.modeRow}>
            <label className={panelStyles.modeOption}>
              <input type="radio" name="entityModeDisabled" disabled />
              Criar nova
            </label>
            <label className={panelStyles.modeOption}>
              <input type="radio" name="entityModeDisabled" disabled />
              Usar existente
            </label>
          </div>

          <input
            className={`${panelStyles.fieldInput} ${panelStyles.fieldInputDisabled}`}
            value=""
            readOnly
            aria-disabled="true"
            placeholder="Nome da entidade"
            title="Nome da Entidade"
          />

          <textarea
            className={`${panelStyles.fieldInput} ${panelStyles.descriptionInput} ${panelStyles.fieldInputDisabled}`}
            value=""
            readOnly
            aria-disabled="true"
            placeholder="Descrição"
            title="Descrição"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className={panelStyles.fieldGroup}>
        <label className={panelStyles.fieldLabel}>{sectionTitle}</label>
        {!stageModeLockedTo ? (
          <div className={panelStyles.modeRow}>
            <label className={panelStyles.modeOption}>
              <input
                type="radio"
                name="stageConfigMode"
                checked={stageConfigMode === 'entidade'}
                onChange={() => setStageConfigMode('entidade')}
                disabled={isReadOnlyMode}
              />
              Entidade
            </label>
            <label className={panelStyles.modeOption}>
              <input
                type="radio"
                name="stageConfigMode"
                checked={stageConfigMode === 'condicional'}
                onChange={() => setStageConfigMode('condicional')}
                disabled={isReadOnlyMode}
              />
              Condicional
            </label>
          </div>
        ) : null}

        {effectiveStageConfigMode === 'condicional' ? (
          <>
            <input
              className={panelStyles.fieldInput}
              value={conditionalForm.nome}
              onChange={(event) =>
                setConditionalForm((previous) => ({
                  ...previous,
                  nome: event.target.value,
                }))
              }
              disabled={isReadOnlyMode}
              placeholder="Nome da Condicional"
              title="Nome da Condicional"
            />

            <textarea
              className={`${panelStyles.fieldInput} ${panelStyles.descriptionInput}`}
              value={conditionalForm.descricao}
              onChange={(event) =>
                setConditionalForm((previous) => ({
                  ...previous,
                  descricao: event.target.value,
                }))
              }
              disabled={isReadOnlyMode}
              placeholder="Descrição da Condicional"
              title="Descrição da Condicional"
            />
          </>
        ) : effectiveStageConfigMode === 'entidade' ? (
          <>
            <div className={panelStyles.modeRow}>
              <label className={panelStyles.modeOption}>
                <input
                  type="radio"
                  name="entityMode"
                  checked={entityMode === 'nova'}
                  onChange={() => setEntityMode('nova')}
                  disabled={isReadOnlyMode}
                />
                Criar nova
              </label>
              <label className={panelStyles.modeOption}>
                <input
                  type="radio"
                  name="entityMode"
                  checked={entityMode === 'existente'}
                  onChange={() => setEntityMode('existente')}
                  disabled={isReadOnlyMode}
                />
                Usar existente
              </label>
            </div>

            {entityMode === 'existente' ? (
              <>
                <select
                  className={panelStyles.fieldInput}
                  value={selectedExistingEntityId}
                  onChange={(event) =>
                    setSelectedExistingEntityId(event.target.value)
                  }
                  disabled={isReadOnlyMode}
                  title="Entidade existente"
                >
                  <option value="">Selecione uma entidade existente</option>
                  {entityOptions.map((entidade) => (
                    <option
                      key={`${entidade.id}-${entidade.nome}`}
                      value={String(entidade.id)}
                    >
                      {entidade.nome}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <input
              className={panelStyles.fieldInput}
              value={newEntityForm.nome}
              onChange={(event) =>
                setNewEntityForm((previous) => ({
                  ...previous,
                  nome: event.target.value,
                }))
              }
              disabled={isReadOnlyMode}
              placeholder="Nome da Entidade"
              title="Nome da Entidade"
            />

            <textarea
              className={`${panelStyles.fieldInput} ${panelStyles.descriptionInput}`}
              value={newEntityForm.descricao}
              onChange={(event) =>
                setNewEntityForm((previous) => ({
                  ...previous,
                  descricao: event.target.value,
                }))
              }
              disabled={isReadOnlyMode}
              placeholder="Descrição"
              title="Descrição"
            />

            <div className={panelStyles.entityFieldsBlock}>
              <a
                className={panelStyles.entityFieldsLink}
                href={isReadOnlyMode ? '#' : entityFieldsEditHref}
                onClick={(event) => {
                  if (isReadOnlyMode) {
                    event.preventDefault();
                    return;
                  }
                  handleNavigateToEntityFields(event);
                }}
                title="Abrir página de Entidades para editar campos"
                aria-disabled={isReadOnlyMode}
              >
                ✏️ Ir para campos
              </a>
            </div>
          </>
        ) : (
          <p className={panelStyles.empty}>
            Selecione Entidade ou Condicional para configurar esta etapa.
          </p>
        )}
      </div>

      {pendingEntityFieldsHref ? (
        <Close
          title="Sair da página"
          message="Tem certeza que deseja sair desta página? As alterações serão salvas antes de continuar."
          onConfirm={handleConfirmNavigateToEntityFields}
          onCancel={handleCancelNavigateToEntityFields}
          confirmLabel={
            isNavigatingToEntityFields ? 'Salvando...' : 'Sair e salvar'
          }
        />
      ) : null}
    </>
  );
};

export default ConfigurarEntidadePanel;
