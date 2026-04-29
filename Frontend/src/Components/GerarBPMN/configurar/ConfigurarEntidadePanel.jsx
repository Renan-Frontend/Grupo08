import React from "react";
import Close from "../../Helper/Close";
import {
  CONDITIONAL_NAME_MAX_LENGTH,
  ENTITY_NAME_MAX_LENGTH,
} from "../gerarBpmnCreate.shared";
import panelStyles from "./ConfigurarEntidadePanel.module.css";

const toEntitySlug = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeEntityOptionName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

// ── Shared campos editor (reused for entity, condicional and task) ──────────
const CamposEditorBlock = ({
  entityFieldDraft,
  setEntityFieldDraft,
  onSaveEntityFieldDraft,
  onEditEntityFieldDraft,
  onRemoveEntityFieldDraft,
  newEntityFields,
  lastCreatedField,
  lastCreatedFieldType,
  isReadOnlyMode,
  onFieldClick,
  headerSlot = null,
}) => (
  <>
    <div className={panelStyles.entityFieldEditorBlock}>
      <p className={panelStyles.entityFieldEditorTitle}>
        Criar campo no painel
      </p>
      <div className={panelStyles.entityFieldEditorGrid}>
        <input
          className={panelStyles.fieldInput}
          name="entityFieldNameInput"
          value={String(entityFieldDraft?.nome || "")}
          onChange={(event) =>
            setEntityFieldDraft?.((previous) => ({
              ...previous,
              nome: event.target.value,
            }))
          }
          disabled={isReadOnlyMode}
          placeholder="Nome do campo"
          title="Nome do campo"
        />
        <select
          className={panelStyles.fieldInput}
          name="entityFieldTypeSelect"
          value={String(entityFieldDraft?.tipo || "")}
          onChange={(event) =>
            setEntityFieldDraft?.((previous) => ({
              ...previous,
              tipo: event.target.value,
            }))
          }
          disabled={isReadOnlyMode}
          title="Tipo do campo"
        >
          <option value="" disabled>
            Tipo
          </option>
          <option value="Texto">Texto</option>
          <option value="Número">Número</option>
          <option value="Data">Data</option>
          <option value="Email">Email</option>
          <option value="Telefone">Telefone</option>
          <option value="Booleano">Booleano</option>
        </select>
        <select
          className={panelStyles.fieldInput}
          name="entityFieldRequiredSelect"
          value={
            typeof entityFieldDraft?.obrigatorio === "boolean"
              ? entityFieldDraft.obrigatorio
                ? "Sim"
                : "Não"
              : ""
          }
          onChange={(event) =>
            setEntityFieldDraft?.((previous) => ({
              ...previous,
              obrigatorio: event.target.value === "Sim",
            }))
          }
          disabled={isReadOnlyMode}
          title="Campo obrigatório"
        >
          <option value="" disabled>
            Obrigatório?
          </option>
          <option value="Sim">Sim</option>
          <option value="Não">Não</option>
        </select>
        <select
          className={panelStyles.fieldInput}
          name="entityFieldKeyTypeSelect"
          value={String(entityFieldDraft?.keyType || "")}
          onChange={(event) =>
            setEntityFieldDraft?.((previous) => ({
              ...previous,
              keyType: event.target.value,
            }))
          }
          disabled={isReadOnlyMode}
          title="Tipo de chave"
        >
          <option value="" disabled>
            Chave:
          </option>
          <option value="NORMAL">Normal</option>
          <option value="PK">PK</option>
          <option value="FK">FK</option>
        </select>
        <input
          className={panelStyles.fieldInput}
          name="entityFieldReferenceInput"
          value={String(entityFieldDraft?.referencia || "")}
          onChange={(event) =>
            setEntityFieldDraft?.((previous) => ({
              ...previous,
              referencia: event.target.value,
            }))
          }
          disabled={isReadOnlyMode}
          placeholder="Referência (ex: cliente.id)"
          title="Referência"
        />
      </div>
      <div className={panelStyles.entityFieldEditorActions}>
        <button
          type="button"
          className={panelStyles.entityFieldsSelectionButton}
          onClick={() => onSaveEntityFieldDraft?.()}
          disabled={isReadOnlyMode}
        >
          {entityFieldDraft?.id ? "Atualizar campo" : "Adicionar campo"}
        </button>
        {entityFieldDraft?.id ? (
          <button
            type="button"
            className={panelStyles.entityFieldsSelectionButton}
            onClick={() =>
              setEntityFieldDraft?.({
                id: null,
                nome: "",
                tipo: "",
                obrigatorio: null,
                keyType: "",
                referencia: "",
              })
            }
            disabled={isReadOnlyMode}
          >
            Cancelar edição
          </button>
        ) : null}
      </div>
    </div>

    {lastCreatedField ? (
      <div className={panelStyles.entityFieldsSelectionBlock}>
        <div className={panelStyles.entityFieldsHeader}>
          <div className={panelStyles.entityFieldsTitleGroup}>
            <p className={panelStyles.entityFieldsTitle}>
              Ultimo Campo criado:
            </p>
            {headerSlot}
          </div>
          <span className={panelStyles.entityFieldsCount}>
            {(Array.isArray(newEntityFields) ? newEntityFields : []).length}
          </span>
        </div>
        <div
          className={`${panelStyles.entityFieldItem} ${panelStyles.entityFieldItemCompact}`}
          role="button"
          tabIndex={0}
          onClick={() => onFieldClick?.()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onFieldClick?.();
            }
          }}
          title="Clique para ver o conteúdo completo"
        >
          <div className={panelStyles.entityFieldMainRow}>
            <span
              className={`${panelStyles.entityFieldName} ${panelStyles.entityFieldNameTruncated}`}
            >
              {String(lastCreatedField?.nome || "").trim() || "Campo sem nome"}
            </span>
            <div className={panelStyles.entityFieldSelectionActions}>
              <button
                type="button"
                className={`${panelStyles.entityFieldSelectionMiniButton} ${panelStyles.entityFieldActionIconButton}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onEditEntityFieldDraft?.(lastCreatedField);
                }}
                aria-label="Editar campo"
                title="Editar campo"
                disabled={isReadOnlyMode}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M4 20H8L19 9L15 5L4 16V20Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M13.5 6.5L17.5 10.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className={`${panelStyles.entityFieldSelectionMiniButton} ${panelStyles.entityFieldActionIconButton}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveEntityFieldDraft?.(lastCreatedField?.id);
                }}
                aria-label="Apagar campo"
                title="Apagar campo"
                disabled={isReadOnlyMode}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M5 7H19"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M9 7V5H15V7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 7L9 19H15L16 7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div
            className={`${panelStyles.entityFieldBadges} ${panelStyles.entityFieldBadgesSingleLine}`}
          >
            {lastCreatedFieldType ? (
              <span
                className={`${panelStyles.entityFieldBadgeMuted} ${panelStyles.entityFieldBadgeTruncated}`}
              >
                {lastCreatedFieldType}
              </span>
            ) : null}
            {typeof lastCreatedField?.obrigatorio === "boolean" ? (
              <span
                className={`${panelStyles.entityFieldBadgeMuted} ${panelStyles.entityFieldBadgeTruncated}`}
              >
                {lastCreatedField.obrigatorio ? "Sim" : "Nao"}
              </span>
            ) : null}
            {String(lastCreatedField?.keyType || "").trim() ? (
              <span
                className={`${panelStyles.entityFieldBadgeMuted} ${panelStyles.entityFieldBadgeTruncated}`}
              >
                {String(lastCreatedField.keyType).trim()}
              </span>
            ) : null}
            {String(lastCreatedField?.relacionamento || "").trim() ? (
              <span
                className={`${panelStyles.entityFieldBadgeMuted} ${panelStyles.entityFieldBadgeTruncated}`}
              >
                {String(lastCreatedField.relacionamento).trim()}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    ) : null}
  </>
);

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
  taskForm,
  setTaskForm,
  newEntityFields,
  entityFieldDraft,
  setEntityFieldDraft,
  onSaveEntityFieldDraft,
  onEditEntityFieldDraft,
  onRemoveEntityFieldDraft,
  onSelectCreateNewEntityMode,
  onBeforeNavigateToEntityFields,
  isReadOnlyMode = false,
}) => {
  const effectiveStageConfigMode =
    stageModeLockedTo === "entidade" ||
    stageModeLockedTo === "condicional" ||
    stageModeLockedTo === "task"
      ? stageModeLockedTo
      : stageConfigMode;
  const sectionTitle = "Configuração da etapa";
  const selectedExistingEntityName =
    entityMode === "existente"
      ? String(
          entityOptions.find(
            (item) => String(item?.id) === String(selectedExistingEntityId),
          )?.nome || "",
        ).trim()
      : "";
  const entityOptionsWithDuplicateIndex = React.useMemo(() => {
    const normalizedNames = (Array.isArray(entityOptions) ? entityOptions : [])
      .map((entidade) => normalizeEntityOptionName(entidade?.nome || ""))
      .filter(Boolean);

    const nameCounts = normalizedNames.reduce((acc, name) => {
      acc.set(name, (acc.get(name) || 0) + 1);
      return acc;
    }, new Map());

    const occurrenceMap = new Map();
    return (Array.isArray(entityOptions) ? entityOptions : []).map(
      (entidade) => {
        const normalizedName = normalizeEntityOptionName(entidade?.nome || "");
        const totalCount = normalizedName
          ? nameCounts.get(normalizedName) || 0
          : 0;
        const currentOccurrence = normalizedName
          ? (occurrenceMap.get(normalizedName) || 0) + 1
          : 1;

        if (normalizedName) {
          occurrenceMap.set(normalizedName, currentOccurrence);
        }

        const baseName = String(entidade?.nome || "").trim();
        const displayName =
          totalCount > 1 ? `${baseName} (${currentOccurrence})` : baseName;

        return {
          ...entidade,
          displayName,
        };
      },
    );
  }, [entityOptions]);
  const targetEntityName =
    selectedExistingEntityName || String(newEntityForm?.nome || "").trim();
  const lastCreatedField =
    Array.isArray(newEntityFields) && newEntityFields.length > 0
      ? newEntityFields[newEntityFields.length - 1]
      : null;
  const lastCreatedFieldType = String(
    lastCreatedField?.tipo ||
      lastCreatedField?.type ||
      lastCreatedField?.tipoCampo ||
      "",
  ).trim();
  const targetEntitySlug = toEntitySlug(targetEntityName);
  const entityFieldsEditHref = targetEntitySlug
    ? `/cadastros/${targetEntitySlug}`
    : "/cadastros";
  const [pendingEntityFieldsHref, setPendingEntityFieldsHref] =
    React.useState("");
  const [isNavigatingToEntityFields, setIsNavigatingToEntityFields] =
    React.useState(false);
  const [isLastFieldDetailsOpen, setIsLastFieldDetailsOpen] =
    React.useState(false);

  const handleNavigateToEntityFields = (event) => {
    event.preventDefault();
    setPendingEntityFieldsHref(entityFieldsEditHref);
  };

  const handleCancelNavigateToEntityFields = () => {
    if (isNavigatingToEntityFields) return;
    setPendingEntityFieldsHref("");
  };

  const handleConfirmNavigateToEntityFields = async () => {
    if (!pendingEntityFieldsHref) return;

    setIsNavigatingToEntityFields(true);
    if (typeof onBeforeNavigateToEntityFields === "function") {
      try {
        await onBeforeNavigateToEntityFields();
      } catch {
        // no-op: still allow navigation after best-effort save
      }
    }

    window.location.assign(pendingEntityFieldsHref);
  };

  const handleSelectCreateNewEntityMode = () => {
    if (typeof onSelectCreateNewEntityMode === "function") {
      onSelectCreateNewEntityMode();
      return;
    }

    setEntityMode("nova");
    setSelectedExistingEntityId("");
    setNewEntityForm((previous) => ({
      ...previous,
      nome: "",
      descricao: "",
      atributoChave: "",
    }));
    setEntityFieldDraft?.({
      id: null,
      nome: "",
      tipo: "",
      obrigatorio: null,
      keyType: "",
      referencia: "",
    });
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
            name="entityNameDisabled"
            value=""
            readOnly
            aria-disabled="true"
            placeholder="Nome da entidade"
            title="Nome da Entidade"
          />

          <textarea
            className={`${panelStyles.fieldInput} ${panelStyles.descriptionInput} ${panelStyles.fieldInputDisabled}`}
            name="entityDescriptionDisabled"
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
                checked={stageConfigMode === "entidade"}
                onChange={() => setStageConfigMode("entidade")}
                disabled={isReadOnlyMode}
              />
              Entidade
            </label>
            <label className={panelStyles.modeOption}>
              <input
                type="radio"
                name="stageConfigMode"
                checked={stageConfigMode === "condicional"}
                onChange={() => setStageConfigMode("condicional")}
                disabled={isReadOnlyMode}
              />
              Condicional
            </label>
          </div>
        ) : null}

        {effectiveStageConfigMode === "condicional" ? (
          <>
            <input
              className={panelStyles.fieldInput}
              name="conditionalNameInput"
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
              maxLength={CONDITIONAL_NAME_MAX_LENGTH}
            />
            {String(conditionalForm.nome || "").length >
            Math.floor(CONDITIONAL_NAME_MAX_LENGTH * 0.7) ? (
              <p
                className={panelStyles.charHint}
                data-warn={
                  String(conditionalForm.nome || "").length >=
                  Math.floor(CONDITIONAL_NAME_MAX_LENGTH * 0.9)
                    ? "true"
                    : undefined
                }
              >
                {CONDITIONAL_NAME_MAX_LENGTH -
                  String(conditionalForm.nome || "").length}{" "}
                caracteres restantes — prefira nomes curtos
              </p>
            ) : null}

            <p className={panelStyles.descriptionTitle}>
              Descrição da Condição
            </p>
            <textarea
              className={`${panelStyles.fieldInput} ${panelStyles.descriptionInput}`}
              name="conditionalDescriptionInput"
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
              rows={5}
            />
          </>
        ) : effectiveStageConfigMode === "entidade" ? (
          <>
            <div className={panelStyles.modeRow}>
              <label className={panelStyles.modeOption}>
                <input
                  type="radio"
                  name="entityMode"
                  checked={entityMode === "nova"}
                  onChange={handleSelectCreateNewEntityMode}
                  disabled={isReadOnlyMode}
                />
                Criar nova
              </label>
              <label className={panelStyles.modeOption}>
                <input
                  type="radio"
                  name="entityMode"
                  checked={entityMode === "existente"}
                  onChange={() => setEntityMode("existente")}
                  disabled={isReadOnlyMode}
                />
                Usar existente
              </label>
            </div>

            {entityMode === "existente" ? (
              <>
                <select
                  className={panelStyles.fieldInput}
                  name="existingEntitySelect"
                  value={selectedExistingEntityId}
                  onChange={(event) =>
                    setSelectedExistingEntityId(event.target.value)
                  }
                  disabled={isReadOnlyMode}
                  title="Entidade existente"
                >
                  <option value="" disabled>
                    Selecione uma entidade existente
                  </option>
                  {entityOptionsWithDuplicateIndex.map((entidade) => (
                    <option
                      key={`${entidade.id}-${entidade.nome}`}
                      value={String(entidade.id)}
                    >
                      {entidade.displayName}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <input
              className={panelStyles.fieldInput}
              name="newEntityNameInput"
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
              maxLength={ENTITY_NAME_MAX_LENGTH}
            />
            {String(newEntityForm.nome || "").length >
            Math.floor(ENTITY_NAME_MAX_LENGTH * 0.7) ? (
              <p
                className={panelStyles.charHint}
                data-warn={
                  String(newEntityForm.nome || "").length >=
                  Math.floor(ENTITY_NAME_MAX_LENGTH * 0.9)
                    ? "true"
                    : undefined
                }
              >
                {ENTITY_NAME_MAX_LENGTH -
                  String(newEntityForm.nome || "").length}{" "}
                caracteres restantes — prefira nomes curtos
              </p>
            ) : null}

            <p className={panelStyles.descriptionTitle}>
              Descrição da Entidade
            </p>
            <textarea
              className={`${panelStyles.fieldInput} ${panelStyles.descriptionInput}`}
              name="newEntityDescriptionInput"
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
              rows={5}
            />

            <CamposEditorBlock
              entityFieldDraft={entityFieldDraft}
              setEntityFieldDraft={setEntityFieldDraft}
              onSaveEntityFieldDraft={onSaveEntityFieldDraft}
              onEditEntityFieldDraft={onEditEntityFieldDraft}
              onRemoveEntityFieldDraft={onRemoveEntityFieldDraft}
              newEntityFields={newEntityFields}
              lastCreatedField={lastCreatedField}
              lastCreatedFieldType={lastCreatedFieldType}
              isReadOnlyMode={isReadOnlyMode}
              onFieldClick={() => setIsLastFieldDetailsOpen(true)}
              headerSlot={
                <a
                  className={`${panelStyles.entityFieldSelectionMiniButton} ${panelStyles.entityFieldInlineLink} ${panelStyles.entityFieldIconLink}`}
                  href={isReadOnlyMode ? "#" : entityFieldsEditHref}
                  onClick={(event) => {
                    if (isReadOnlyMode) {
                      event.preventDefault();
                      return;
                    }
                    handleNavigateToEntityFields(event);
                  }}
                  aria-label="Ir para campos"
                  title="Abrir página de Entidades para editar campos"
                  aria-disabled={isReadOnlyMode}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M14 5H19V10"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10 14L19 5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M19 14V19H5V5H10"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              }
            />
          </>
        ) : effectiveStageConfigMode === "task" ? (
          <>
            <p className={panelStyles.descriptionTitle}>Campos da atividade</p>
            <CamposEditorBlock
              entityFieldDraft={entityFieldDraft}
              setEntityFieldDraft={setEntityFieldDraft}
              onSaveEntityFieldDraft={onSaveEntityFieldDraft}
              onEditEntityFieldDraft={onEditEntityFieldDraft}
              onRemoveEntityFieldDraft={onRemoveEntityFieldDraft}
              newEntityFields={newEntityFields}
              lastCreatedField={lastCreatedField}
              lastCreatedFieldType={lastCreatedFieldType}
              isReadOnlyMode={isReadOnlyMode}
              onFieldClick={() => setIsLastFieldDetailsOpen(true)}
            />
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
            isNavigatingToEntityFields ? "Salvando..." : "Sair e salvar"
          }
        />
      ) : null}

      {isLastFieldDetailsOpen && lastCreatedField ? (
        <Close
          title="Detalhes do campo"
          message={`Nome: ${String(lastCreatedField?.nome || "").trim() || "Campo sem nome"}\nTipo: ${lastCreatedFieldType || "-"}\nObrigatorio: ${lastCreatedField?.obrigatorio === true ? "Sim" : "Nao"}\nChave: ${String(lastCreatedField?.keyType || "").trim() || "-"}${String(lastCreatedField?.relacionamento || "").trim() ? `\nReferencia: ${String(lastCreatedField.relacionamento).trim()}` : ""}`}
          onConfirm={() => setIsLastFieldDetailsOpen(false)}
          onCancel={() => setIsLastFieldDetailsOpen(false)}
          confirmLabel="Fechar"
          hideCancel
        />
      ) : null}
    </>
  );
};

export default ConfigurarEntidadePanel;
