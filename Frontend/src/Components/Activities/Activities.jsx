import React, { useState, useEffect } from "react";
import { API_URL } from "../../Api";
import styles from "./Activities.module.css";
import { useLocation, useNavigate } from "react-router-dom";

// ─── Editable field labels ───────────────────────────────────────────────────

const useCustomLabels = (storageKey, defaults) => {
  const [labels, setLabels] = useState(() => {
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
  const [req, setReq] = useState(() => {
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

// Usado só no título do modal (sem toggle de obrigatório)
const EditableLabel = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
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
      className={styles.labelText}
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
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
      <button
        type="button"
        className={required ? styles.requiredBadgeOn : styles.requiredBadgeOff}
        onClick={onToggleRequired}
        title={
          required
            ? "Obrigatório — clique para tornar opcional"
            : "Opcional — clique para tornar obrigatório"
        }
      >
        {required ? "● obrig." : "○ opcional"}
      </button>
    </span>
  );
};

const useExtraFields = (storageKey) => {
  const [fields, setFields] = useState(() => {
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

const ACTIVITY_LABEL_DEFAULTS = {
  titulo_modal: "Nova Atividade",
  tipo: "Tipo",
  status: "Status",
  titulo: "Título",
  descricao: "Descrição",
  data_atividade: "Data/Hora",
  responsavel: "Responsável",
  duracao_minutos: "Duração (min)",
  local: "Local",
  participantes: "Participantes (separados por vírgula)",
  resultado: "Resultado/Observações",
  proximos_passos: "Próximos Passos",
  tags: "Tags (separadas por vírgula)",
};

const ACTIVITY_REQUIRED_DEFAULTS = {
  tipo: true,
  status: false,
  titulo: true,
  descricao: false,
  data_atividade: true,
  responsavel: false,
  duracao_minutos: false,
  local: false,
  participantes: false,
  resultado: false,
  proximos_passos: false,
  tags: false,
};

const ActivityTypeIcon = ({ tipo }) => {
  const icons = {
    call: "☎️",
    email: "📧",
    meeting: "🤝",
    task: "✓",
    note: "📝",
  };
  return icons[tipo] || "📌";
};

const ActivityStatusBadge = ({ status }) => {
  const colors = {
    planejado: "#3b82f6",
    concluido: "#10b981",
    cancelado: "#ef4444",
  };
  return (
    <span
      className={styles.statusBadge}
      style={{ backgroundColor: colors[status] }}
    >
      {status}
    </span>
  );
};

const CreateActivityModal = ({
  show,
  onClose,
  onSuccess,
  entityType = "",
  entityId = "",
  editingActivity = null,
}) => {
  const initialFormData = {
    titulo: "",
    descricao: "",
    tipo: "Nota",
    data_atividade: new Date().toISOString().slice(0, 16),
    responsavel: "",
    status: "Planejado",
    resultado: "",
    proximos_passos: "",
    duracao_minutos: "",
    local: "",
    participantes: "",
    tags: "",
  };

  const [formData, setFormData] = useState({
    ...initialFormData,
  });
  const [labels, setLabel] = useCustomLabels(
    "bp_labels_atividades",
    ACTIVITY_LABEL_DEFAULTS,
  );
  const [req, toggleRequired] = useCustomRequired(
    "bp_required_atividades",
    ACTIVITY_REQUIRED_DEFAULTS,
  );
  const [extraFields, addExtraField, removeExtraField, updateExtraField] =
    useExtraFields("bp_extra_fields_atividades");
  const [extraValues, setExtraValues] = useState({});

  const isEditMode = Boolean(editingActivity?.id);

  useEffect(() => {
    if (!show) return;

    if (isEditMode) {
      setFormData({
        titulo: editingActivity?.titulo || "",
        descricao: editingActivity?.descricao || "",
        tipo: editingActivity?.tipo || "",
        data_atividade: String(editingActivity?.data_atividade || "").slice(
          0,
          16,
        ),
        responsavel: editingActivity?.responsavel || "",
        status: editingActivity?.status || "",
        resultado: editingActivity?.resultado || "",
        proximos_passos: editingActivity?.proximos_passos || "",
        duracao_minutos:
          editingActivity?.duracao_minutos !== undefined &&
          editingActivity?.duracao_minutos !== null
            ? String(editingActivity?.duracao_minutos)
            : "",
        local: editingActivity?.local || "",
        participantes: Array.isArray(editingActivity?.participantes)
          ? editingActivity.participantes.join(", ")
          : "",
        tags: Array.isArray(editingActivity?.tags)
          ? editingActivity.tags.join(", ")
          : "",
      });
      return;
    }

    setFormData({ ...initialFormData });
  }, [show, isEditMode, editingActivity]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isEditMode
        ? `${API_URL}/api/activities/${editingActivity.id}`
        : `${API_URL}/api/activities`;

      const response = await fetch(endpoint, {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          entidade_tipo: entityType || null,
          entidade_id: entityId || null,
          usuario_criador: localStorage.getItem("user_id") || "sistema",
          duracao_minutos: formData.duracao_minutos
            ? parseInt(formData.duracao_minutos)
            : null,
          participantes: formData.participantes
            ? formData.participantes.split(",").map((p) => p.trim())
            : [],
          tags: formData.tags
            ? formData.tags.split(",").map((t) => t.trim())
            : [],
          extra: extraFields.reduce((acc, f) => {
            acc[f.label] = extraValues[f.id] || "";
            return acc;
          }, {}),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setFormData({ ...initialFormData });
        setExtraValues({});
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error("Erro ao criar atividade:", error);
    }
  };

  if (!show) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>
            {isEditMode ? (
              <span>Editar Atividade</span>
            ) : (
              <EditableLabel
                value={labels.titulo_modal}
                onChange={(v) => setLabel("titulo_modal", v)}
              />
            )}
          </h3>
          <button type="button" onClick={onClose} className={styles.closeBtn}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.tipo}
                  onChange={(v) => setLabel("tipo", v)}
                  required={req.tipo}
                  onToggleRequired={() => toggleRequired("tipo")}
                />
              </label>
              <input
                type="text"
                name="tipo"
                value={formData.tipo}
                onChange={handleChange}
                placeholder="Ex: Nota, Ligação, Reunião..."
                required={req.tipo}
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.status}
                  onChange={(v) => setLabel("status", v)}
                  required={req.status}
                  onToggleRequired={() => toggleRequired("status")}
                />
              </label>
              <input
                type="text"
                name="status"
                value={formData.status}
                onChange={handleChange}
                placeholder="Ex: Planejado, Concluído..."
                required={req.status}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>
              <FieldLabel
                value={labels.titulo}
                onChange={(v) => setLabel("titulo", v)}
                required={req.titulo}
                onToggleRequired={() => toggleRequired("titulo")}
              />
            </label>
            <input
              type="text"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              required={req.titulo}
              placeholder="Assunto da atividade"
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label>
              <FieldLabel
                value={labels.descricao}
                onChange={(v) => setLabel("descricao", v)}
                required={req.descricao}
                onToggleRequired={() => toggleRequired("descricao")}
              />
            </label>
            <textarea
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              placeholder="Detalhes da atividade"
              rows="3"
              required={req.descricao}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.data_atividade}
                  onChange={(v) => setLabel("data_atividade", v)}
                  required={req.data_atividade}
                  onToggleRequired={() => toggleRequired("data_atividade")}
                />
              </label>
              <input
                type="datetime-local"
                name="data_atividade"
                value={formData.data_atividade}
                onChange={handleChange}
                required={req.data_atividade}
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.responsavel}
                  onChange={(v) => setLabel("responsavel", v)}
                  required={req.responsavel}
                  onToggleRequired={() => toggleRequired("responsavel")}
                />
              </label>
              <input
                type="text"
                name="responsavel"
                value={formData.responsavel}
                onChange={handleChange}
                placeholder="Nome do responsável"
                required={req.responsavel}
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.duracao_minutos}
                  onChange={(v) => setLabel("duracao_minutos", v)}
                  required={req.duracao_minutos}
                  onToggleRequired={() => toggleRequired("duracao_minutos")}
                />
              </label>
              <input
                type="number"
                name="duracao_minutos"
                value={formData.duracao_minutos}
                onChange={handleChange}
                placeholder="0"
                min="0"
                required={req.duracao_minutos}
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <FieldLabel
                  value={labels.local}
                  onChange={(v) => setLabel("local", v)}
                  required={req.local}
                  onToggleRequired={() => toggleRequired("local")}
                />
              </label>
              <input
                type="text"
                name="local"
                value={formData.local}
                onChange={handleChange}
                placeholder="Sala ou URL"
                required={req.local}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>
              <FieldLabel
                value={labels.participantes}
                onChange={(v) => setLabel("participantes", v)}
                required={req.participantes}
                onToggleRequired={() => toggleRequired("participantes")}
              />
            </label>
            <input
              type="text"
              name="participantes"
              value={formData.participantes}
              onChange={handleChange}
              placeholder="João, Maria, Pedro"
              required={req.participantes}
            />
          </div>

          <div className={styles.formGroup}>
            <label>
              <FieldLabel
                value={labels.resultado}
                onChange={(v) => setLabel("resultado", v)}
                required={req.resultado}
                onToggleRequired={() => toggleRequired("resultado")}
              />
            </label>
            <textarea
              name="resultado"
              value={formData.resultado}
              onChange={handleChange}
              placeholder="O que foi discutido/decidido"
              rows="2"
              required={req.resultado}
            />
          </div>

          <div className={styles.formGroup}>
            <label>
              <FieldLabel
                value={labels.proximos_passos}
                onChange={(v) => setLabel("proximos_passos", v)}
                required={req.proximos_passos}
                onToggleRequired={() => toggleRequired("proximos_passos")}
              />
            </label>
            <textarea
              name="proximos_passos"
              value={formData.proximos_passos}
              onChange={handleChange}
              placeholder="O que fazer depois"
              rows="2"
              required={req.proximos_passos}
            />
          </div>

          <div className={styles.formGroup}>
            <label>
              <FieldLabel
                value={labels.tags}
                onChange={(v) => setLabel("tags", v)}
                required={req.tags}
                onToggleRequired={() => toggleRequired("tags")}
              />
            </label>
            <input
              type="text"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              placeholder="importante, urgente, follow-up"
              required={req.tags}
            />
          </div>

          {extraFields.length > 0 && (
            <div className={styles.extraFieldsSection}>
              {extraFields.map((field) => (
                <div key={field.id} className={styles.formGroup}>
                  <label>
                    <div className={styles.extraFieldHeader}>
                      <FieldLabel
                        value={field.label}
                        onChange={(v) =>
                          updateExtraField(field.id, { label: v })
                        }
                        required={field.required}
                        onToggleRequired={() =>
                          updateExtraField(field.id, {
                            required: !field.required,
                          })
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
                  </label>
                  <input
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
            </div>
          )}

          <button
            type="button"
            className={styles.addFieldBtn}
            onClick={addExtraField}
          >
            + Adicionar campo
          </button>

          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={onClose}
              className={styles.btnCancel}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.btnSave}>
              {isEditMode ? "Salvar alterações" : "Criar Atividade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Activities = ({ entityType = "", entityId = "" }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);

  useEffect(() => {
    fetchActivities();
  }, [entityType, entityId]);

  useEffect(() => {
    if (location.state?.openCreate) {
      setEditingActivity(null);
      setShowModal(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/activities?limit=100`;
      if (entityType && entityId) {
        url = `${API_URL}/api/activities/entity/${entityType}/${entityId}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      setActivities(data.activities || []);
    } catch (error) {
      console.error("Erro ao buscar atividades:", error);
    }
    setLoading(false);
  };

  const handleDeleteActivity = async (activityId) => {
    if (!window.confirm("Deletar esta atividade?")) return;

    try {
      const response = await fetch(`${API_URL}/api/activities/${activityId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchActivities();
      }
    } catch (error) {
      console.error("Erro ao deletar atividade:", error);
      alert("Erro ao deletar atividade");
    }
  };

  const handleEditActivity = (activity) => {
    setEditingActivity(activity);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingActivity(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR");
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>⏱️ Timeline de Atividades</h2>
          <p className={styles.subtitle}>
            Rastreie todas as interações e ações
          </p>
        </div>
        <button
          className={styles.newBtn}
          onClick={() => {
            setEditingActivity(null);
            setShowModal(true);
          }}
        >
          Nova Atividade
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Carregando atividades...</p>
        </div>
      ) : activities.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <p>Nenhuma atividade registrada</p>
          <button
            className={styles.emptyBtn}
            onClick={() => {
              setEditingActivity(null);
              setShowModal(true);
            }}
          >
            Criar primeira atividade
          </button>
        </div>
      ) : (
        <div className={styles.timeline}>
          {activities.map((activity, index) => (
            <div key={activity.id} className={styles.timelineItem}>
              <div className={styles.timelineDot}>
                <span className={styles.activityIcon}>
                  {<ActivityTypeIcon tipo={activity.tipo} />}
                </span>
              </div>
              <div className={styles.timelineContent}>
                <div className={styles.activityHeader}>
                  <div>
                    <h3 className={styles.activityTitle}>{activity.titulo}</h3>
                    <p className={styles.activityTime}>
                      {formatDate(activity.data_atividade)}
                    </p>
                  </div>
                  <div className={styles.activityMeta}>
                    <ActivityStatusBadge status={activity.status} />
                    {activity.tags && activity.tags.length > 0 && (
                      <div className={styles.tags}>
                        {activity.tags.slice(0, 2).map((tag, i) => (
                          <span key={i} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                        {activity.tags.length > 2 && (
                          <span className={styles.tag}>
                            +{activity.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {activity.descricao && (
                  <p className={styles.description}>{activity.descricao}</p>
                )}

                <div className={styles.details}>
                  {activity.responsavel && (
                    <span className={styles.detail}>
                      👤 <strong>Responsável:</strong> {activity.responsavel}
                    </span>
                  )}
                  {activity.tipo === "meeting" && activity.duracao_minutos && (
                    <span className={styles.detail}>
                      ⏱️ <strong>Duração:</strong> {activity.duracao_minutos}{" "}
                      min
                    </span>
                  )}
                  {activity.local && (
                    <span className={styles.detail}>
                      📍 <strong>Local:</strong> {activity.local}
                    </span>
                  )}
                  {activity.participantes &&
                    activity.participantes.length > 0 && (
                      <span className={styles.detail}>
                        👥 <strong>Participantes:</strong>{" "}
                        {activity.participantes.join(", ")}
                      </span>
                    )}
                </div>

                {activity.resultado && (
                  <div className={styles.resultBox}>
                    <strong>📌 Resultado:</strong>
                    <p>{activity.resultado}</p>
                  </div>
                )}

                {activity.proximos_passos && (
                  <div className={styles.nextStepsBox}>
                    <strong>➜ Próximos Passos:</strong>
                    <p>{activity.proximos_passos}</p>
                  </div>
                )}

                <div className={styles.actionsFooter}>
                  <small className={styles.createdBy}>
                    Por {activity.usuario_criador} •{" "}
                    {formatDate(activity.data_criacao)}
                  </small>
                  <div className={styles.actionButtons}>
                    <button
                      className={styles.editBtn}
                      onClick={() => handleEditActivity(activity)}
                      title="Editar atividade"
                    >
                      ✏️
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteActivity(activity.id)}
                      title="Deletar atividade"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateActivityModal
        show={showModal}
        onClose={handleCloseModal}
        onSuccess={fetchActivities}
        entityType={entityType}
        entityId={entityId}
        editingActivity={editingActivity}
      />
    </div>
  );
};

export default Activities;
