import React from "react";
import styles from "./EntityFieldsDrawer.module.css";
import {
  getFieldKeyLabel,
  getFieldRelationshipLabel,
} from "../helpers/entidadesSelectors";
import { ENTIDADE_FIELD_TYPES } from "../../../Context/EntidadesContext";

const EntityFieldsDrawer = ({
  entity,
  fields = [],
  campoEmEdicao,
  campoConfigForm,
  camposConfigError,
  onClose,
  onAddOrEditField,
  onEditField,
  onDeleteField,
  onCampoConfigChange,
  onCancelEdit,
  isReadOnly = false,
  canDelete = true,
}) => {
  if (!entity) return null;

  const nome = String(
    entity?.nome || entity?.name || entity?.titulo || "",
  ).trim();
  const atributoChave = String(entity?.atributoChave || "").trim();

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Drawer panel */}
      <div
        className={styles.drawer}
        role="dialog"
        aria-label={`Campos de ${nome}`}
      >
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderLeft}>
            <button type="button" className={styles.backBtn} onClick={onClose}>
              ←
            </button>
            <div>
              <div className={styles.drawerLabel}>Campos da entidade</div>
              <div className={styles.drawerTitle}>{nome || "—"}</div>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fechar painel"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.drawerBody}>
          {/* Add / edit form */}
          {!isReadOnly && (
            <div className={styles.addSection}>
              <h4 className={styles.sectionLabel}>
                {campoEmEdicao ? "✏️ Editar campo" : "+ Adicionar campo"}
              </h4>
              <div className={styles.formGrid}>
                <input
                  type="text"
                  className={`${styles.formInput} ${styles.formInputFull}`}
                  placeholder="Nome do campo *"
                  value={campoConfigForm.nome}
                  onChange={(e) => onCampoConfigChange("nome", e.target.value)}
                />
                <select
                  className={styles.formSelect}
                  value={campoConfigForm.tipo}
                  onChange={(e) => onCampoConfigChange("tipo", e.target.value)}
                >
                  <option value="" disabled>
                    Tipo *
                  </option>
                  {ENTIDADE_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select
                  className={styles.formSelect}
                  value={campoConfigForm.obrigatorio}
                  onChange={(e) =>
                    onCampoConfigChange("obrigatorio", e.target.value)
                  }
                >
                  <option value="" disabled>
                    Obrigatório? *
                  </option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>

                <select
                  className={styles.formSelect}
                  value={campoConfigForm.keyType}
                  onChange={(e) =>
                    onCampoConfigChange("keyType", e.target.value)
                  }
                >
                  <option value="" disabled>
                    Chave *
                  </option>
                  <option value="NORMAL">Normal</option>
                  <option value="PK">PK</option>
                  <option value="FK">FK</option>
                </select>

                <input
                  type="text"
                  className={`${styles.formInput} ${styles.formInputFull}`}
                  placeholder="Referência (ex: cliente.id)"
                  value={campoConfigForm.referencia}
                  onChange={(e) =>
                    onCampoConfigChange("referencia", e.target.value)
                  }
                />
              </div>

              {camposConfigError && (
                <p className={styles.formError}>{camposConfigError}</p>
              )}

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={onAddOrEditField}
                >
                  {campoEmEdicao ? "Salvar edição" : "Adicionar campo"}
                </button>
                {campoEmEdicao && (
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={onCancelEdit}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Fields list */}
          <div className={styles.fieldsSection}>
            <div className={styles.fieldsSectionHeader}>
              <h4 className={styles.sectionLabel}>
                Campos configurados
                <span className={styles.fieldCountBadge}>{fields.length}</span>
              </h4>
            </div>

            {fields.length === 0 ? (
              <div className={styles.emptyFields}>
                <span className={styles.emptyIcon}>▤</span>
                <p>Nenhum campo cadastrado</p>
                {!isReadOnly && (
                  <p className={styles.emptyHint}>
                    Use o formulário acima para adicionar campos
                  </p>
                )}
              </div>
            ) : (
              <div className={styles.fieldsList}>
                {fields.map((campo) => {
                  const keyLabel = getFieldKeyLabel(campo, atributoChave);
                  const relLabel = getFieldRelationshipLabel(campo);
                  const isObrigatorio =
                    campo.obrigatorio === true || campo.obrigatorio === "Sim";

                  return (
                    <div
                      key={campo.id}
                      className={`${styles.fieldRow} ${campo.readonlyFromBpmn ? styles.fieldRowBpmn : ""}`}
                    >
                      <div className={styles.fieldMain}>
                        <span className={styles.fieldName}>{campo.nome}</span>
                        {campo.readonlyFromBpmn && (
                          <span className={styles.bpmnBadge}>BPMN</span>
                        )}
                        {isObrigatorio && (
                          <span
                            className={styles.requiredStar}
                            title="Obrigatório"
                          >
                            *
                          </span>
                        )}
                      </div>

                      <div className={styles.fieldMeta}>
                        <span className={styles.fieldType}>
                          {campo.tipo || "Texto"}
                        </span>
                        <span
                          className={`${styles.keyBadge} ${
                            keyLabel === "PK"
                              ? styles.keyBadgePK
                              : keyLabel === "FK"
                                ? styles.keyBadgeFK
                                : styles.keyBadgeNormal
                          }`}
                        >
                          {keyLabel}
                        </span>
                        {relLabel !== "-" && (
                          <span
                            className={styles.relBadge}
                            title={`Relacionamento: ${relLabel}`}
                          >
                            ↗{" "}
                            {relLabel.length > 16
                              ? `${relLabel.slice(0, 16)}…`
                              : relLabel}
                          </span>
                        )}
                      </div>

                      {!isReadOnly && (
                        <div className={styles.fieldActions}>
                          <button
                            type="button"
                            className={styles.fieldActionBtn}
                            onClick={() => onEditField(campo)}
                            disabled={campo.readonlyFromBpmn === true}
                            title={
                              campo.readonlyFromBpmn
                                ? "Campo vindo do BPMN"
                                : "Editar campo"
                            }
                          >
                            ✏️
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              className={`${styles.fieldActionBtn} ${styles.fieldActionBtnDanger}`}
                              onClick={() => onDeleteField(campo.id)}
                              disabled={campo.readonlyFromBpmn === true}
                              title={
                                campo.readonlyFromBpmn
                                  ? "Campo vindo do BPMN"
                                  : "Deletar campo"
                              }
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default EntityFieldsDrawer;
