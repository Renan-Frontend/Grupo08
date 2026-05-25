import React from "react";
import styles from "./EntityCard.module.css";
import { normalizeText } from "../helpers/entidadesSelectors";

const TYPE_CONFIG = {
  contato: {
    label: "Contato",
    color: "#0369a1",
    bg: "#e0f2fe",
    borderColor: "#7dd3fc",
  },
  processo: {
    label: "Processo",
    color: "#854d0e",
    bg: "#fef9c3",
    borderColor: "#fde047",
  },
  principal: {
    label: "Principal",
    color: "#059669",
    bg: "#d1fae5",
    borderColor: "#6ee7b7",
  },
  associativa: {
    label: "Associativa",
    color: "#7c3aed",
    bg: "#ede9fe",
    borderColor: "#c4b5fd",
  },
  externa: {
    label: "Externa",
    color: "#d97706",
    bg: "#fef3c7",
    borderColor: "#fcd34d",
  },
};

const getTypeConfig = (tipoEntidade) => {
  const key = normalizeText(tipoEntidade || "");
  return TYPE_CONFIG[key] || TYPE_CONFIG.processo;
};

const EntityCard = ({
  entity,
  fieldCount = 0,
  bpmnUsageCount = 0,
  onViewFields,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}) => {
  const tipo = getTypeConfig(entity?.tipoEntidade);
  const nome = String(
    entity?.nome || entity?.name || entity?.titulo || "",
  ).trim();
  const descricao = String(entity?.descricao || "").trim();
  const categoria = String(entity?.categoria || "").trim();

  return (
    <article className={styles.card}>
      <div className={styles.accentBar} style={{ background: "#059669" }} />

      <div className={styles.cardInner}>
        <div className={styles.topRow}>
          <span
            className={styles.typeBadge}
            style={{
              color: tipo.color,
              background: tipo.bg,
              borderColor: tipo.borderColor,
            }}
          >
            {tipo.label}
          </span>
          {entity?.papelNegocio === "contato" && (
            <span
              className={styles.roleBadge}
              style={{
                background: "#e0f2fe",
                color: "#0369a1",
                borderColor: "#7dd3fc",
              }}
            >
              👤 Contato
            </span>
          )}
          {entity?.papelNegocio === "processo" && (
            <span
              className={styles.roleBadge}
              style={{
                background: "#fef9c3",
                color: "#854d0e",
                borderColor: "#fde047",
              }}
            >
              🔄 Processo
            </span>
          )}
          {bpmnUsageCount > 0 && (
            <span className={styles.bpmnBadge}>
              {bpmnUsageCount} processo{bpmnUsageCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <h3 className={styles.entityName} title={nome}>
          {nome || <span className={styles.unnamed}>Sem nome</span>}
        </h3>

        {descricao ? (
          <p className={styles.entityDesc}>{descricao}</p>
        ) : (
          <p className={styles.entityDescEmpty}>Sem descrição</p>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <span className={styles.metaIcon}>▤</span>
            {fieldCount} {fieldCount === 1 ? "campo" : "campos"}
          </span>
          {categoria && (
            <>
              <span className={styles.metaSep}>·</span>
              <span
                className={styles.metaCategory}
                title={`Categoria: ${categoria}`}
              >
                {categoria.length > 20
                  ? `${categoria.slice(0, 20)}…`
                  : categoria}
              </span>
            </>
          )}
        </div>
      </div>

      <div className={styles.cardFooter}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={onViewFields}
          title="Ver e configurar campos"
        >
          ▤ Campos
        </button>
        {canEdit && (
          <button
            type="button"
            className={styles.btn}
            onClick={onEdit}
            title="Editar entidade"
          >
            ✏️
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={onDelete}
            title="Deletar entidade"
          >
            🗑️
          </button>
        )}
      </div>
    </article>
  );
};

export default EntityCard;
