import React from "react";
import styles from "./ContactsCard.module.css";

const EMPTY_CONTACT = () => ({
  id: Date.now() + Math.random(),
  nome: "",
  cargo: "",
  email: "",
  telefone: "",
  isPrimary: false,
});

const ContactsCard = ({
  contacts = [],
  onChange = null,
  isReadOnlyMode = false,
  activeStageLabel = "",
}) => {
  // Cada passo de Contato configura seus próprios contatos: filtramos
  // pela etapa ativa para evitar mostrar contatos de outros passos.
  // Contatos legados sem `etapa` permanecem visíveis como fallback.
  const normalizedStage = String(activeStageLabel || "")
    .trim()
    .toLowerCase();
  const annotatedContacts = React.useMemo(() => {
    return (Array.isArray(contacts) ? contacts : []).map((c) => {
      const etapaRaw = String(c?.etapa || "").trim();
      const etapaNorm = etapaRaw.toLowerCase();
      let origin = "current";
      if (!etapaRaw) {
        origin = "unscoped";
      } else if (normalizedStage && etapaNorm !== normalizedStage) {
        origin = "foreign";
      }
      return { ...c, __origin: origin, __etapaLabel: etapaRaw };
    });
  }, [contacts, normalizedStage]);

  const visibleContacts = React.useMemo(() => {
    const importedSourceIdsInCurrentStage = new Set(
      (Array.isArray(contacts) ? contacts : [])
        .filter(
          (c) =>
            String(c?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            c?.importedFromId !== undefined &&
            c?.importedFromId !== null &&
            String(c.importedFromId).trim() !== "",
        )
        .map((c) => String(c.importedFromId)),
    );

    return annotatedContacts.filter((c) => {
      if (c.__origin === "current") return true;
      return !importedSourceIdsInCurrentStage.has(String(c.id));
    });
  }, [annotatedContacts, contacts, normalizedStage]);

  const handleAdd = () => {
    if (isReadOnlyMode) return;
    const base = EMPTY_CONTACT();
    const c = activeStageLabel
      ? { ...base, etapa: String(activeStageLabel).trim() }
      : base;
    onChange?.([...(Array.isArray(contacts) ? contacts : []), c]);
  };

  const handleChange = (id, field, value) => {
    if (isReadOnlyMode) return;
    onChange?.(
      contacts.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const handleSetPrimary = (id) => {
    if (isReadOnlyMode) return;
    onChange?.(contacts.map((c) => ({ ...c, isPrimary: c.id === id })));
  };

  const handleRemove = (id) => {
    if (isReadOnlyMode) return;
    onChange?.(contacts.filter((c) => c.id !== id));
  };

  const isUsedInCurrentStep = (contact) => {
    if (contact.__origin === "current") return true;
    if (!activeStageLabel) return false;
    return (Array.isArray(contacts) ? contacts : []).some(
      (c) =>
        String(c?.etapa || "")
          .trim()
          .toLowerCase() === normalizedStage &&
        String(c?.importedFromId || "") === String(contact.id),
    );
  };

  const handleUsageToggle = (contact, shouldUse) => {
    if (isReadOnlyMode || !activeStageLabel) return;
    const currentList = Array.isArray(contacts) ? contacts : [];

    if (shouldUse) {
      if (contact.__origin === "current") return;
      const alreadyImported = currentList.some(
        (c) =>
          String(c?.etapa || "")
            .trim()
            .toLowerCase() === normalizedStage &&
          String(c?.importedFromId || "") === String(contact.id),
      );
      if (alreadyImported) return;

      const sourceIndex = currentList.findIndex(
        (c) => String(c?.id) === String(contact.id),
      );
      const next = [...currentList];
      const { __origin, __etapaLabel, ...baseContact } = contact;
      const clonedContact = {
        ...baseContact,
        id: Date.now() + Math.random(),
        etapa: String(activeStageLabel).trim(),
        isPrimary: false,
        importedFromId: contact.id,
      };
      const insertAt = sourceIndex >= 0 ? sourceIndex : next.length;
      next.splice(insertAt, 0, clonedContact);
      onChange?.(next);
      return;
    }

    if (contact.__origin === "current") {
      const isImportedClone =
        String(contact?.importedFromId || "").trim().length > 0;

      if (isImportedClone) {
        onChange?.(currentList.filter((c) => c.id !== contact.id));
        return;
      }

      // Para contatos nativos do passo atual, ao desmarcar removemos apenas
      // o vínculo de etapa em vez de apagar o registro.
      onChange?.(
        currentList.map((c) =>
          c.id === contact.id
            ? {
                ...c,
                etapa: "",
              }
            : c,
        ),
      );
      return;
    }

    onChange?.(
      currentList.filter(
        (c) =>
          !(
            String(c?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            String(c?.importedFromId || "") === String(contact.id)
          ),
      ),
    );
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          Contatos
          {visibleContacts.length > 0 && (
            <span className={styles.countBadge}>{visibleContacts.length}</span>
          )}
        </span>
        {!isReadOnlyMode && (
          <button type="button" className={styles.addBtn} onClick={handleAdd}>
            + Adicionar contato
          </button>
        )}
      </div>

      {!isReadOnlyMode && visibleContacts.length > 0 && (
        <div className={styles.selectionBar}>
          <span className={styles.selectionHint}>
            Marque os atores que serão utilizados neste passo.
          </span>
        </div>
      )}

      {visibleContacts.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>👤</span>
          <p>Nenhum contato vinculado.</p>
          {!isReadOnlyMode && (
            <button
              type="button"
              className={styles.emptyAddBtn}
              onClick={handleAdd}
            >
              + Adicionar contato
            </button>
          )}
        </div>
      ) : (
        <div className={styles.contactList}>
          {visibleContacts.map((c) => (
            <div
              key={c.id}
              className={`${styles.contactRow} ${c.isPrimary ? styles.contactRowPrimary : ""}`}
            >
              {!isReadOnlyMode && (
                <input
                  type="checkbox"
                  className={styles.rowSelector}
                  checked={isUsedInCurrentStep(c)}
                  onChange={(e) => handleUsageToggle(c, e.target.checked)}
                  title="Selecionar ator"
                  aria-label="Selecionar ator"
                />
              )}
              <div className={styles.contactAvatar}>
                {c.nome ? c.nome.charAt(0).toUpperCase() : "?"}
              </div>
              <div className={styles.contactFields}>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Nome</label>
                    <input
                      className={styles.fieldInput}
                      value={c.nome}
                      onChange={(e) =>
                        handleChange(c.id, "nome", e.target.value)
                      }
                      placeholder="Nome completo"
                      disabled={isReadOnlyMode}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Cargo</label>
                    <input
                      className={styles.fieldInput}
                      value={c.cargo}
                      onChange={(e) =>
                        handleChange(c.id, "cargo", e.target.value)
                      }
                      placeholder="Ex: Diretor Comercial"
                      disabled={isReadOnlyMode}
                    />
                  </div>
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>E-mail</label>
                    <input
                      className={styles.fieldInput}
                      type="email"
                      value={c.email}
                      onChange={(e) =>
                        handleChange(c.id, "email", e.target.value)
                      }
                      placeholder="email@empresa.com"
                      disabled={isReadOnlyMode}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Telefone</label>
                    <input
                      className={styles.fieldInput}
                      type="tel"
                      value={c.telefone}
                      onChange={(e) =>
                        handleChange(c.id, "telefone", e.target.value)
                      }
                      placeholder="(00) 00000-0000"
                      disabled={isReadOnlyMode}
                    />
                  </div>
                </div>
              </div>
              <div className={styles.contactActions}>
                {c.isPrimary ? (
                  <span className={styles.primaryBadge}>★ Principal</span>
                ) : (
                  !isReadOnlyMode && (
                    <button
                      type="button"
                      className={styles.setPrimaryBtn}
                      onClick={() => handleSetPrimary(c.id)}
                      title="Definir como contato principal"
                    >
                      ☆ Principal
                    </button>
                  )
                )}
                {!isReadOnlyMode && (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => handleRemove(c.id)}
                    title="Remover contato"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContactsCard;
