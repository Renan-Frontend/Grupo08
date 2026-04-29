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
}) => {
  const handleAdd = () => {
    if (isReadOnlyMode) return;
    const c = EMPTY_CONTACT();
    onChange?.([...contacts, c]);
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
          {contacts.length > 0 && (
            <span className={styles.countBadge}>{contacts.length}</span>
          )}
        </span>
        {!isReadOnlyMode && (
          <button type="button" className={styles.addBtn} onClick={handleAdd}>
            + Adicionar contato
          </button>
        )}
      </div>

      {contacts.length === 0 ? (
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
          {contacts.map((c) => (
            <div
              key={c.id}
              className={`${styles.contactRow} ${c.isPrimary ? styles.contactRowPrimary : ""}`}
            >
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
