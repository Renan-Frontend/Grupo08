import React from 'react';
import panelStyles from './ConfigurarPropriedadePanel.module.css';

const ConfigurarPropriedadePanel = ({
  selectedNode,
  isConditionalStageMode,
  fieldTypes,
  entityFieldDraft,
  setEntityFieldDraft,
  entityError,
}) => {
  if (!selectedNode) {
    return (
      <>
        <label className={panelStyles.fieldLabel}>
          Campos da nova entidade
        </label>
        <input
          className={`${panelStyles.fieldInput} ${panelStyles.fieldInputDisabled}`}
          value=""
          placeholder="Nome do Campo"
          readOnly
          aria-disabled="true"
          title="Nome do Campo"
        />
      </>
    );
  }

  if (isConditionalStageMode) {
    return (
      <p className={panelStyles.empty}>
        Etapa condicional não usa campos. Os campos são usados para salvar
        entidades (nome, tipo e obrigatório).
      </p>
    );
  }

  return (
    <>
      <div className={panelStyles.fieldGroup}>
        <label className={panelStyles.fieldLabel}>
          Campos da entidade (catálogo)
        </label>
        <input
          className={panelStyles.fieldInput}
          value={entityFieldDraft.nome}
          onChange={(event) =>
            setEntityFieldDraft((previous) => ({
              ...previous,
              nome: event.target.value,
            }))
          }
          placeholder="Nome do Campo"
          title="Nome do Campo"
        />
        <select
          className={`${panelStyles.fieldInput} ${
            !entityFieldDraft.tipo ? panelStyles.selectPlaceholder : ''
          }`}
          value={entityFieldDraft.tipo || ''}
          onChange={(event) =>
            setEntityFieldDraft((previous) => ({
              ...previous,
              tipo: event.target.value,
            }))
          }
          title="Tipo"
        >
          <option value="" disabled>
            Tipo
          </option>
          {fieldTypes.map((fieldType) => (
            <option key={fieldType} value={fieldType}>
              {fieldType}
            </option>
          ))}
        </select>
        <select
          className={`${panelStyles.fieldInput} ${
            typeof entityFieldDraft.obrigatorio !== 'boolean'
              ? panelStyles.selectPlaceholder
              : ''
          }`}
          value={
            typeof entityFieldDraft.obrigatorio === 'boolean'
              ? entityFieldDraft.obrigatorio
                ? 'Sim'
                : 'Não'
              : ''
          }
          onChange={(event) =>
            setEntityFieldDraft((previous) => ({
              ...previous,
              obrigatorio: event.target.value === 'Sim',
            }))
          }
          title="Esse campo é obrigatório?"
        >
          <option value="" disabled>
            Esse campo é obrigatório?
          </option>
          <option value="Sim">Sim</option>
          <option value="Não">Não</option>
        </select>
      </div>

      {entityError ? (
        <p className={panelStyles.errorText}>{entityError}</p>
      ) : null}
    </>
  );
};

export default ConfigurarPropriedadePanel;
