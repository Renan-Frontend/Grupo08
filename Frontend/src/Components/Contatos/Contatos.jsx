import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./Contatos.module.css";
import {
  getAuthToken,
  fetchOpportunitiesPage,
  updateOpportunityById,
} from "../Opportunities/opportunityApi";
import { toOpportunitySlug } from "../Opportunities/opportunityFormatters";
import { EntidadesContext } from "../../Context/EntidadesContext";

const EMPTY_FORM = () => ({
  nome: "",
  cargo: "",
  email: "",
  telefone: "",
  isPrimary: false,
  entidadeId: "",
  _entidadeNome: "",
  _opportunityId: "",
  _opportunityNome: "",
});

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const matchEntityByContent = (
  contact = {},
  opportunity = {},
  entidades = [],
) => {
  const explicitId = String(contact?.entidadeId || "").trim();
  if (explicitId) {
    const byId = entidades.find(
      (entidade) => String(entidade?.id || "") === explicitId,
    );
    if (byId) return byId;
  }

  const explicitName = normalizeText(
    contact?.entidadeNome || contact?.entidade,
  );
  if (explicitName) {
    const byName = entidades.find(
      (entidade) => normalizeText(entidade?.nome) === explicitName,
    );
    if (byName) return byName;
  }

  const haystack = normalizeText(
    [
      contact?.nome,
      contact?.cargo,
      contact?.email,
      contact?.telefone,
      opportunity?.name,
      opportunity?.nome,
      opportunity?.empresa,
    ].join(" "),
  );
  if (!haystack) return null;

  const sorted = [...entidades].sort(
    (a, b) => String(b?.nome || "").length - String(a?.nome || "").length,
  );

  return (
    sorted.find((entidade) =>
      haystack.includes(normalizeText(entidade?.nome)),
    ) || null
  );
};

const extractContactsFromOpportunities = (
  opportunities = [],
  entidadesContato = [],
) => {
  const rows = [];

  (Array.isArray(opportunities) ? opportunities : []).forEach((opportunity) => {
    const contacts = Array.isArray(opportunity?.contacts)
      ? opportunity.contacts
      : [];

    contacts.forEach((contact, index) => {
      const matchedEntity = matchEntityByContent(
        contact,
        opportunity,
        entidadesContato,
      );

      rows.push({
        id:
          contact?.id ||
          `${String(opportunity?.id || opportunity?.name || "opp")}-${index}`,
        nome: contact?.nome || "",
        cargo: contact?.cargo || "",
        email: contact?.email || "",
        telefone: contact?.telefone || "",
        isPrimary: Boolean(contact?.isPrimary),
        oportunidadeId: opportunity?.id,
        oportunidadeNome: String(
          opportunity?.name || opportunity?.nome || "",
        ).trim(),
        entidadeId: matchedEntity?.id ?? contact?.entidadeId ?? null,
        entidadeNome: matchedEntity?.nome || contact?.entidadeNome || "",
      });
    });
  });

  return rows;
};

// ─── Editable field labels ───────────────────────────────────────────────────

const useCustomLabels = (storageKey, defaults) => {
  const [labels, setLabels] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...defaults, ...JSON.parse(saved) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  });
  const setLabel = (key, value) => {
    setLabels((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return [labels, setLabel];
};

const useCustomRequired = (storageKey, defaults) => {
  const [req, setReq] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...defaults, ...JSON.parse(saved) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  });
  const toggleRequired = (key) => {
    setReq((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return [req, toggleRequired];
};

// Usado só no título do modal
const EditableLabel = ({ value, onChange, className }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };
  if (editing) {
    return (
      <input
        className={styles.labelEdit}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        autoFocus
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <span
      className={`${styles.labelText} ${className || ""}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value} <span className={styles.labelEditIcon}>✎</span>
    </span>
  );
};

// Usado nos campos do formulário — com edição de nome + toggle obrigatório
const FieldLabel = ({ value, onChange, required, onToggleRequired }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };
  return (
    <span className={styles.fieldLabelRow}>
      {editing ? (
        <input
          className={styles.labelEdit}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className={styles.labelName}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          title="Clique para renomear"
        >
          {value}
          <span className={styles.labelEditBtn}>✎ editar</span>
        </span>
      )}
      {onToggleRequired && (
        <button
          type="button"
          className={
            required ? styles.requiredBadgeOn : styles.requiredBadgeOff
          }
          onClick={onToggleRequired}
          title={
            required
              ? "Obrigatório — clique para tornar opcional"
              : "Opcional — clique para tornar obrigatório"
          }
        >
          {required ? "● obrig." : "○ opcional"}
        </button>
      )}
    </span>
  );
};

const useExtraFields = (storageKey) => {
  const [fields, setFields] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const save = (next) => {
    setFields(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };
  const addField = () =>
    save([...fields, { id: Date.now(), label: "Novo campo", required: false }]);
  const removeField = (id) => save(fields.filter((f) => f.id !== id));
  const updateField = (id, patch) =>
    save(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  return [fields, addField, removeField, updateField];
};

const CONTATO_LABEL_DEFAULTS = {
  titulo: "Novo Contato",
  titulo_edicao: "Editar Contato",
  nome: "Nome",
  cargo: "Cargo",
  email: "Email",
  telefone: "Telefone",
  oportunidade: "Oportunidade",
  entidade: "Entidade de contato (opcional)",
  principal: "Marcar como contato principal",
};

const CONTATO_REQUIRED_DEFAULTS = {
  nome: true,
  cargo: false,
  email: false,
  telefone: false,
  oportunidade: true,
  entidade: false,
};

const CreateContactModal = ({
  opportunities,
  entidadesContato,
  onClose,
  onCreated,
}) => {
  const [form, setForm] = React.useState(EMPTY_FORM());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [labels, setLabel] = useCustomLabels(
    "bp_labels_contatos",
    CONTATO_LABEL_DEFAULTS,
  );
  const [req, toggleRequired] = useCustomRequired(
    "bp_required_contatos",
    CONTATO_REQUIRED_DEFAULTS,
  );
  const [extraFields, addExtraField, removeExtraField, updateExtraField] =
    useExtraFields("bp_extra_fields_contatos");
  const [extraValues, setExtraValues] = React.useState({});

  const opportunityOptions = React.useMemo(
    () =>
      opportunities.map((opportunity) => {
        const nome = String(
          opportunity?.name || opportunity?.nome || "",
        ).trim();
        return {
          id: String(opportunity?.id || ""),
          nome: nome || `Oportunidade #${opportunity?.id}`,
        };
      }),
    [opportunities],
  );

  const entidadeOptions = React.useMemo(
    () =>
      entidadesContato.map((entidade) => ({
        id: String(entidade?.id || ""),
        nome: String(entidade?.nome || "").trim(),
      })),
    [entidadesContato],
  );

  const set = (field, value) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const handleOpportunityInputChange = (value) => {
    const match = opportunityOptions.find(
      (option) => normalizeText(option.nome) === normalizeText(value),
    );
    setForm((previous) => ({
      ...previous,
      _opportunityNome: value,
      _opportunityId: match ? match.id : "",
    }));
  };

  const handleEntidadeInputChange = (value) => {
    const match = entidadeOptions.find(
      (option) => normalizeText(option.nome) === normalizeText(value),
    );
    setForm((previous) => ({
      ...previous,
      _entidadeNome: value,
      entidadeId: match ? match.id : "",
    }));
  };

  const handleSave = async () => {
    if (!String(form.nome || "").trim()) {
      setError("Nome é obrigatório.");
      return;
    }
    if (!String(form._opportunityId || "").trim()) {
      setError("Informe uma oportunidade válida.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const token = getAuthToken();
      const selectedOpportunity = opportunities.find(
        (opportunity) =>
          String(opportunity?.id || "") === String(form._opportunityId || ""),
      );

      if (!selectedOpportunity) {
        throw new Error("Oportunidade não encontrada.");
      }

      const selectedEntity = entidadesContato.find(
        (entidade) => String(entidade?.id) === String(form.entidadeId || ""),
      );

      const existingContacts = Array.isArray(selectedOpportunity?.contacts)
        ? selectedOpportunity.contacts
        : [];

      const newContact = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        nome: String(form.nome || "").trim(),
        cargo: String(form.cargo || "").trim(),
        email: String(form.email || "").trim(),
        telefone: String(form.telefone || "").trim(),
        isPrimary: Boolean(form.isPrimary),
        ...(selectedEntity
          ? {
              entidadeId: selectedEntity.id,
              entidadeNome: selectedEntity.nome,
            }
          : {}),
        extra: extraFields.reduce((acc, f) => {
          acc[f.label] = extraValues[f.id] || "";
          return acc;
        }, {}),
      };

      const contacts = newContact.isPrimary
        ? existingContacts
            .map((contact) => ({ ...contact, isPrimary: false }))
            .concat(newContact)
        : existingContacts.concat(newContact);

      const payload = {
        ...selectedOpportunity,
        contacts,
      };

      await updateOpportunityById({
        opportunityId: selectedOpportunity.id,
        payload,
        token,
      });

      onCreated(newContact, selectedOpportunity.id);
      setExtraValues({});
    } catch (err) {
      setError(err?.message || "Erro ao criar contato.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            <EditableLabel
              value={labels.titulo}
              onChange={(v) => setLabel("titulo", v)}
            />
          </span>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.nome}
                onChange={(v) => setLabel("nome", v)}
                required={req.nome}
                onToggleRequired={() => toggleRequired("nome")}
              />
              <input
                className={styles.formInput}
                value={form.nome}
                onChange={(event) => set("nome", event.target.value)}
                required={req.nome}
              />
            </label>

            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.cargo}
                onChange={(v) => setLabel("cargo", v)}
                required={req.cargo}
                onToggleRequired={() => toggleRequired("cargo")}
              />
              <input
                className={styles.formInput}
                value={form.cargo}
                onChange={(event) => set("cargo", event.target.value)}
                required={req.cargo}
              />
            </label>

            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.email}
                onChange={(v) => setLabel("email", v)}
                required={req.email}
                onToggleRequired={() => toggleRequired("email")}
              />
              <input
                className={styles.formInput}
                type="email"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
                required={req.email}
              />
            </label>

            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.telefone}
                onChange={(v) => setLabel("telefone", v)}
                required={req.telefone}
                onToggleRequired={() => toggleRequired("telefone")}
              />
              <input
                className={styles.formInput}
                value={form.telefone}
                onChange={(event) => set("telefone", event.target.value)}
                required={req.telefone}
              />
            </label>

            <label className={`${styles.formLabel} ${styles.formLabelFull}`}>
              <FieldLabel
                value={labels.oportunidade}
                onChange={(v) => setLabel("oportunidade", v)}
                required={req.oportunidade}
                onToggleRequired={() => toggleRequired("oportunidade")}
              />
              <input
                className={styles.formInput}
                list="contato-opportunities-list"
                value={form._opportunityNome}
                onChange={(event) =>
                  handleOpportunityInputChange(event.target.value)
                }
                required={req.oportunidade}
                placeholder="Digite ou escolha uma oportunidade"
              />
              <datalist id="contato-opportunities-list">
                {opportunityOptions.map((option) => (
                  <option key={option.id} value={option.nome} />
                ))}
              </datalist>
            </label>

            <label className={`${styles.formLabel} ${styles.formLabelFull}`}>
              <FieldLabel
                value={labels.entidade}
                onChange={(v) => setLabel("entidade", v)}
                required={req.entidade}
                onToggleRequired={() => toggleRequired("entidade")}
              />
              <input
                className={styles.formInput}
                list="contato-entidades-list"
                value={form._entidadeNome}
                onChange={(event) =>
                  handleEntidadeInputChange(event.target.value)
                }
                required={req.entidade}
                placeholder="Digite ou escolha uma entidade"
              />
              <datalist id="contato-entidades-list">
                {entidadeOptions.map((option) => (
                  <option key={option.id} value={option.nome} />
                ))}
              </datalist>
            </label>

            <label className={styles.formLabelCheckbox}>
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(event) => set("isPrimary", event.target.checked)}
              />
              <EditableLabel
                value={labels.principal}
                onChange={(v) => setLabel("principal", v)}
              />
            </label>
          </div>

          {extraFields.map((field) => (
            <div key={field.id} className={styles.extraFieldGroup}>
              <div className={styles.extraFieldHeader}>
                <FieldLabel
                  value={field.label}
                  onChange={(v) => updateExtraField(field.id, { label: v })}
                  required={field.required}
                  onToggleRequired={() =>
                    updateExtraField(field.id, { required: !field.required })
                  }
                />
                <button
                  type="button"
                  className={styles.removeFieldBtn}
                  onClick={() => removeExtraField(field.id)}
                  title="Remover campo"
                >
                  ✕
                </button>
              </div>
              <input
                className={styles.formInput}
                type="text"
                value={extraValues[field.id] || ""}
                onChange={(e) =>
                  setExtraValues((prev) => ({
                    ...prev,
                    [field.id]: e.target.value,
                  }))
                }
                required={field.required}
                placeholder="Valor..."
              />
            </div>
          ))}

          <button
            type="button"
            className={styles.addFieldBtn}
            onClick={addExtraField}
          >
            + Adicionar campo
          </button>

          {error ? <div className={styles.formError}>{error}</div> : null}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Criar contato"}
          </button>
        </div>
      </div>
    </div>
  );
};

const EditContactModal = ({
  contact,
  opportunity,
  opportunities,
  entidadesContato,
  onClose,
  onSaved,
}) => {
  const [form, setForm] = React.useState({
    nome: contact?.nome || "",
    cargo: contact?.cargo || "",
    email: contact?.email || "",
    telefone: contact?.telefone || "",
    isPrimary: Boolean(contact?.isPrimary),
    entidadeId: String(contact?.entidadeId || ""),
    _entidadeNome: contact?.entidadeNome || "",
    _opportunityId: String(opportunity?.id || ""),
    _opportunityNome: String(opportunity?.name || opportunity?.nome || ""),
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [labels, setLabel] = useCustomLabels(
    "bp_labels_contatos",
    CONTATO_LABEL_DEFAULTS,
  );
  const [req, toggleRequired] = useCustomRequired(
    "bp_required_contatos",
    CONTATO_REQUIRED_DEFAULTS,
  );
  const [extraFields, addExtraField, removeExtraField, updateExtraField] =
    useExtraFields("bp_extra_fields_contatos");
  const [extraValues, setExtraValues] = React.useState({});

  const entidadeOptions = React.useMemo(
    () =>
      entidadesContato.map((e) => ({
        id: String(e?.id || ""),
        nome: String(e?.nome || "").trim(),
      })),
    [entidadesContato],
  );

  const opportunityOptions = React.useMemo(
    () =>
      opportunities.map((o) => ({
        id: String(o?.id || ""),
        nome: String(o?.name || o?.nome || "").trim(),
      })),
    [opportunities],
  );

  const set = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  React.useEffect(() => {
    const rawExtra =
      contact && typeof contact.extra === "object" && contact.extra
        ? contact.extra
        : {};
    const mapped = {};
    extraFields.forEach((field) => {
      mapped[field.id] = String(rawExtra[field.label] || "");
    });
    setExtraValues(mapped);
  }, [contact, extraFields]);

  const handleOpportunityInputChange = (value) => {
    const match = opportunityOptions.find(
      (o) => normalizeText(o.nome) === normalizeText(value),
    );
    setForm((prev) => ({
      ...prev,
      _opportunityNome: value,
      _opportunityId: match ? match.id : "",
    }));
  };

  const handleEntidadeInputChange = (value) => {
    const match = entidadeOptions.find(
      (e) => normalizeText(e.nome) === normalizeText(value),
    );
    setForm((prev) => ({
      ...prev,
      _entidadeNome: value,
      entidadeId: match ? match.id : "",
    }));
  };

  const handleSave = async () => {
    if (req.nome && !String(form.nome || "").trim()) {
      setError(`${labels.nome} é obrigatório.`);
      return;
    }
    if (req.email && !String(form.email || "").trim()) {
      setError(`${labels.email} é obrigatório.`);
      return;
    }
    if (req.cargo && !String(form.cargo || "").trim()) {
      setError(`${labels.cargo} é obrigatório.`);
      return;
    }
    if (req.telefone && !String(form.telefone || "").trim()) {
      setError(`${labels.telefone} é obrigatório.`);
      return;
    }
    const targetOpp = opportunities.find(
      (o) => String(o?.id || "") === String(form._opportunityId || ""),
    );
    if (!targetOpp) {
      setError("Informe uma oportunidade válida.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const token = getAuthToken();
      const selectedEntity = entidadesContato.find(
        (e) => String(e?.id) === String(form.entidadeId || ""),
      );
      const existingContacts = Array.isArray(targetOpp?.contacts)
        ? targetOpp.contacts
        : [];
      const updatedContact = {
        ...contact,
        nome: String(form.nome || "").trim(),
        cargo: String(form.cargo || "").trim(),
        email: String(form.email || "").trim(),
        telefone: String(form.telefone || "").trim(),
        isPrimary: Boolean(form.isPrimary),
        ...(selectedEntity
          ? { entidadeId: selectedEntity.id, entidadeNome: selectedEntity.nome }
          : {}),
        extra: extraFields.reduce((acc, field) => {
          acc[field.label] = extraValues[field.id] || "";
          return acc;
        }, {}),
      };
      let contacts;
      const isSameOpp = String(opportunity?.id) === String(targetOpp.id);
      if (isSameOpp) {
        contacts = existingContacts.map((c) =>
          String(c?.id) === String(contact?.id)
            ? updatedContact
            : updatedContact.isPrimary
              ? { ...c, isPrimary: false }
              : c,
        );
        await updateOpportunityById({
          opportunityId: targetOpp.id,
          payload: { ...targetOpp, contacts },
          token,
        });
      } else {
        // Move para outra oportunidade
        const oldContacts = (
          Array.isArray(opportunity?.contacts) ? opportunity.contacts : []
        ).filter((c) => String(c?.id) !== String(contact?.id));
        await updateOpportunityById({
          opportunityId: opportunity.id,
          payload: { ...opportunity, contacts: oldContacts },
          token,
        });
        const newContacts = updatedContact.isPrimary
          ? existingContacts
              .map((c) => ({ ...c, isPrimary: false }))
              .concat(updatedContact)
          : existingContacts.concat(updatedContact);
        await updateOpportunityById({
          opportunityId: targetOpp.id,
          payload: { ...targetOpp, contacts: newContacts },
          token,
        });
      }
      onSaved(
        updatedContact,
        opportunity.id,
        targetOpp.id,
        isSameOpp ? null : oldContacts,
      );
    } catch (err) {
      setError(err?.message || "Erro ao salvar contato.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            <EditableLabel
              value={labels.titulo_edicao}
              onChange={(v) => setLabel("titulo_edicao", v)}
            />
          </span>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.nome}
                onChange={(v) => setLabel("nome", v)}
                required={req.nome}
                onToggleRequired={() => toggleRequired("nome")}
              />
              <input
                className={styles.formInput}
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                required={req.nome}
              />
            </label>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.cargo}
                onChange={(v) => setLabel("cargo", v)}
                required={req.cargo}
                onToggleRequired={() => toggleRequired("cargo")}
              />
              <input
                className={styles.formInput}
                value={form.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                required={req.cargo}
              />
            </label>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.email}
                onChange={(v) => setLabel("email", v)}
                required={req.email}
                onToggleRequired={() => toggleRequired("email")}
              />
              <input
                className={styles.formInput}
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required={req.email}
              />
            </label>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.telefone}
                onChange={(v) => setLabel("telefone", v)}
                required={req.telefone}
                onToggleRequired={() => toggleRequired("telefone")}
              />
              <input
                className={styles.formInput}
                value={form.telefone}
                onChange={(e) => set("telefone", e.target.value)}
                required={req.telefone}
              />
            </label>
            <label className={`${styles.formLabel} ${styles.formLabelFull}`}>
              <FieldLabel
                value={labels.oportunidade}
                onChange={(v) => setLabel("oportunidade", v)}
                required={req.oportunidade}
                onToggleRequired={() => toggleRequired("oportunidade")}
              />
              <input
                className={styles.formInput}
                list="edit-contato-opportunities-list"
                value={form._opportunityNome}
                onChange={(e) => handleOpportunityInputChange(e.target.value)}
                required={req.oportunidade}
                placeholder="Digite ou escolha uma oportunidade"
              />
              <datalist id="edit-contato-opportunities-list">
                {opportunityOptions.map((o) => (
                  <option key={o.id} value={o.nome} />
                ))}
              </datalist>
            </label>
            <label className={`${styles.formLabel} ${styles.formLabelFull}`}>
              <FieldLabel
                value={labels.entidade}
                onChange={(v) => setLabel("entidade", v)}
                required={req.entidade}
                onToggleRequired={() => toggleRequired("entidade")}
              />
              <input
                className={styles.formInput}
                list="edit-contato-entidades-list"
                value={form._entidadeNome}
                onChange={(e) => handleEntidadeInputChange(e.target.value)}
                required={req.entidade}
                placeholder="Digite ou escolha uma entidade"
              />
              <datalist id="edit-contato-entidades-list">
                {entidadeOptions.map((e) => (
                  <option key={e.id} value={e.nome} />
                ))}
              </datalist>
            </label>
            <label className={styles.formLabelCheckbox}>
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(e) => set("isPrimary", e.target.checked)}
              />
              <EditableLabel
                value={labels.principal}
                onChange={(v) => setLabel("principal", v)}
              />
            </label>
          </div>

          {extraFields.map((field) => (
            <div key={field.id} className={styles.extraFieldGroup}>
              <div className={styles.extraFieldHeader}>
                <FieldLabel
                  value={field.label}
                  onChange={(v) => updateExtraField(field.id, { label: v })}
                  required={field.required}
                  onToggleRequired={() =>
                    updateExtraField(field.id, { required: !field.required })
                  }
                />
                <button
                  type="button"
                  className={styles.removeFieldBtn}
                  onClick={() => removeExtraField(field.id)}
                  title="Remover campo"
                >
                  ✕
                </button>
              </div>
              <input
                className={styles.formInput}
                type="text"
                value={extraValues[field.id] || ""}
                onChange={(e) =>
                  setExtraValues((prev) => ({
                    ...prev,
                    [field.id]: e.target.value,
                  }))
                }
                required={field.required}
                placeholder="Valor..."
              />
            </div>
          ))}

          <button
            type="button"
            className={styles.addFieldBtn}
            onClick={addExtraField}
          >
            + Adicionar campo
          </button>

          {error ? <div className={styles.formError}>{error}</div> : null}
        </div>
        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Contatos = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { entidades } = React.useContext(EntidadesContext);

  const [opportunities, setOpportunities] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [copied, setCopied] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(
    () => location.state?.openCreate === true,
  );
  const [editingContact, setEditingContact] = React.useState(null);

  const entidadesContato = React.useMemo(
    () =>
      (Array.isArray(entidades) ? entidades : []).filter(
        (entidade) => normalizeText(entidade?.papelNegocio) === "contato",
      ),
    [entidades],
  );

  const contacts = React.useMemo(
    () => extractContactsFromOpportunities(opportunities, entidadesContato),
    [opportunities, entidadesContato],
  );

  const filteredContacts = React.useMemo(() => {
    const query = normalizeText(search);
    if (!query) return contacts;

    return contacts.filter((contact) => {
      const haystack = normalizeText(
        [
          contact?.nome,
          contact?.cargo,
          contact?.email,
          contact?.telefone,
          contact?.oportunidadeNome,
          contact?.entidadeNome,
        ].join(" "),
      );
      return haystack.includes(query);
    });
  }, [contacts, search]);

  const primaryCount = React.useMemo(
    () => contacts.filter((contact) => contact?.isPrimary === true).length,
    [contacts],
  );

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = getAuthToken();
      const allOpportunities = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await fetchOpportunitiesPage({
          page,
          limit: 50,
          token,
          search: "",
        });

        const items = Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response?.data)
            ? response.data
            : [];

        allOpportunities.push(...items);

        totalPages = Number(
          response?.total_pages ||
            response?.totalPages ||
            response?.pagination?.total_pages ||
            1,
        );

        page += 1;
      } while (page <= totalPages && page <= 20);

      setOpportunities(allOpportunities);
    } catch (err) {
      setError(err?.message || "Erro ao buscar contatos.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopy = async (value) => {
    const text = String(value || "").trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      // no-op
    }
  };

  const handleOpenOpportunity = (opportunityName) => {
    const slug = toOpportunitySlug(opportunityName || "oportunidade");
    navigate(`/oportunidades/${slug}`);
  };

  const handleCreated = (newContact, opportunityId) => {
    setShowCreate(false);
    setOpportunities((previous) =>
      previous.map((opportunity) => {
        if (String(opportunity?.id) !== String(opportunityId))
          return opportunity;
        const existing = Array.isArray(opportunity?.contacts)
          ? opportunity.contacts
          : [];
        return {
          ...opportunity,
          contacts: newContact?.isPrimary
            ? existing
                .map((contact) => ({ ...contact, isPrimary: false }))
                .concat(newContact)
            : existing.concat(newContact),
        };
      }),
    );
  };

  const handleEditSaved = (updatedContact, oldOppId, newOppId) => {
    setEditingContact(null);
    setOpportunities((prev) =>
      prev.map((opp) => {
        const oppId = String(opp?.id);
        if (oppId === String(oldOppId) && oppId === String(newOppId)) {
          // Mesma oportunidade: atualiza in-place
          return {
            ...opp,
            contacts: (Array.isArray(opp.contacts) ? opp.contacts : []).map(
              (c) =>
                String(c?.id) === String(updatedContact?.id)
                  ? updatedContact
                  : c,
            ),
          };
        }
        if (oppId === String(oldOppId)) {
          // Remove da antiga
          return {
            ...opp,
            contacts: (Array.isArray(opp.contacts) ? opp.contacts : []).filter(
              (c) => String(c?.id) !== String(updatedContact?.id),
            ),
          };
        }
        if (oppId === String(newOppId)) {
          // Adiciona na nova
          const existing = Array.isArray(opp.contacts) ? opp.contacts : [];
          return {
            ...opp,
            contacts: updatedContact.isPrimary
              ? existing
                  .map((c) => ({ ...c, isPrimary: false }))
                  .concat(updatedContact)
              : existing.concat(updatedContact),
          };
        }
        return opp;
      }),
    );
  };

  const handleDelete = async (contact) => {
    if (!window.confirm(`Remover o contato "${contact?.nome || "?"}"?`)) return;
    const opp = opportunities.find(
      (o) => String(o?.id) === String(contact?.oportunidadeId),
    );
    if (!opp) return;
    try {
      const token = getAuthToken();
      const updatedContacts = (
        Array.isArray(opp.contacts) ? opp.contacts : []
      ).filter((c) => String(c?.id) !== String(contact?.id));
      await updateOpportunityById({
        opportunityId: opp.id,
        payload: { ...opp, contacts: updatedContacts },
        token,
      });
      setOpportunities((prev) =>
        prev.map((o) =>
          String(o?.id) === String(opp.id)
            ? { ...o, contacts: updatedContacts }
            : o,
        ),
      );
    } catch (err) {
      alert(err?.message || "Erro ao remover contato.");
    }
  };

  return (
    <div className={styles.page}>
      {showCreate && (
        <CreateContactModal
          opportunities={opportunities}
          entidadesContato={entidadesContato}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {editingContact &&
        (() => {
          const opp = opportunities.find(
            (o) => String(o?.id) === String(editingContact?.oportunidadeId),
          );
          return (
            <EditContactModal
              contact={editingContact}
              opportunity={opp || {}}
              opportunities={opportunities}
              entidadesContato={entidadesContato}
              onClose={() => setEditingContact(null)}
              onSaved={handleEditSaved}
            />
          );
        })()}

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            <span>👤</span>
            Contatos
          </h1>
          <p className={styles.pageSubtitle}>
            {contacts.length} contato{contacts.length !== 1 ? "s" : ""} em
            oportunidades
            {primaryCount > 0
              ? ` · ${primaryCount} principal${primaryCount !== 1 ? "is" : ""}`
              : ""}
            {entidadesContato.length > 0
              ? ` · ${entidadesContato.length} entidade${entidadesContato.length !== 1 ? "s" : ""} de contato`
              : ""}
          </p>
        </div>

        <button
          type="button"
          className={styles.newBtn}
          onClick={() => setShowCreate(true)}
          disabled={loading}
        >
          Novo contato
        </button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>🔎</span>
          <input
            className={styles.searchInput}
            placeholder="Buscar por nome, cargo, email, telefone, oportunidade ou entidade..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className={styles.state}>
          <span className={styles.spinner} />
          Carregando contatos...
        </div>
      ) : error ? (
        <div className={styles.stateError}>{error}</div>
      ) : filteredContacts.length === 0 ? (
        <div className={styles.state}>
          <span className={styles.emptyIcon}>📭</span>
          Nenhum contato encontrado.
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thName}>Nome</th>
                <th>Cargo</th>
                <th>Email</th>
                <th>Telefone</th>
                <th>Entidade</th>
                <th>Oportunidade</th>
                <th className={styles.thActions}>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => (
                <tr key={contact.id} className={styles.row}>
                  <td className={styles.tdName}>
                    <div className={styles.nameCell}>
                      <div
                        className={`${styles.avatar} ${
                          contact.isPrimary ? styles.avatarPrimary : ""
                        }`}
                      >
                        {String(contact?.nome || "?")
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>
                      <div>
                        <span className={styles.contactName}>
                          {contact?.nome || (
                            <span className={styles.noValue}>Sem nome</span>
                          )}
                        </span>
                        {contact.isPrimary ? (
                          <span className={styles.primaryBadge}>Principal</span>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td>
                    {contact?.cargo || (
                      <span className={styles.tdMuted}>-</span>
                    )}
                  </td>

                  <td>
                    {contact?.email ? (
                      <div className={styles.copyCell}>
                        <a
                          className={styles.emailLink}
                          href={`mailto:${contact.email}`}
                        >
                          {contact.email}
                        </a>
                        <button
                          type="button"
                          className={styles.copyBtn}
                          onClick={() => handleCopy(contact.email)}
                          title={
                            copied === contact.email ? "Copiado" : "Copiar"
                          }
                        >
                          {copied === contact.email ? "✓" : "⧉"}
                        </button>
                      </div>
                    ) : (
                      <span className={styles.tdMuted}>-</span>
                    )}
                  </td>

                  <td>
                    {contact?.telefone ? (
                      <div className={styles.copyCell}>
                        <a
                          className={styles.phoneLink}
                          href={`tel:${contact.telefone}`}
                        >
                          {contact.telefone}
                        </a>
                        <button
                          type="button"
                          className={styles.copyBtn}
                          onClick={() => handleCopy(contact.telefone)}
                          title={
                            copied === contact.telefone ? "Copiado" : "Copiar"
                          }
                        >
                          {copied === contact.telefone ? "✓" : "⧉"}
                        </button>
                      </div>
                    ) : (
                      <span className={styles.tdMuted}>-</span>
                    )}
                  </td>

                  <td>
                    {contact?.entidadeNome || (
                      <span className={styles.tdMuted}>-</span>
                    )}
                  </td>

                  <td>
                    {contact?.oportunidadeNome ? (
                      <button
                        type="button"
                        className={styles.oppLink}
                        onClick={() =>
                          handleOpenOpportunity(contact.oportunidadeNome)
                        }
                      >
                        {contact.oportunidadeNome}
                      </button>
                    ) : (
                      <span className={styles.tdMuted}>-</span>
                    )}
                  </td>

                  <td className={styles.tdActions}>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnEdit}`}
                      onClick={() => setEditingContact(contact)}
                      title="Editar"
                      aria-label="Editar contato"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={styles.actionIcon}
                        aria-hidden="true"
                      >
                        <path
                          d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25z"
                          fill="#f59e0b"
                        />
                        <path
                          d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42L18.37 3.29a1.003 1.003 0 0 0-1.42 0l-1.13 1.13 3.75 3.75 1.14-1.13z"
                          fill="#ef4444"
                        />
                        <path d="M3 21l3.3-.9-2.4-2.4L3 21z" fill="#334155" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                      onClick={() => handleDelete(contact)}
                      title="Apagar"
                      aria-label="Apagar contato"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={styles.actionIcon}
                        style={{ color: "#9ca3af" }}
                        aria-hidden="true"
                      >
                        <path
                          d="M9 3h6l1 2h4v2H4V5h4l1-2z"
                          style={{ fill: "#9ca3af", stroke: "none" }}
                        />
                        <path
                          d="M7 8h10l-1 11H8L7 8z"
                          style={{ fill: "#9ca3af", stroke: "none" }}
                        />
                        <rect
                          x="10"
                          y="10"
                          width="1.5"
                          height="7"
                          style={{ fill: "#e5e7eb", stroke: "none" }}
                        />
                        <rect
                          x="12.5"
                          y="10"
                          width="1.5"
                          height="7"
                          style={{ fill: "#e5e7eb", stroke: "none" }}
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export { Contatos as ContatosPage };
export default Contatos;
