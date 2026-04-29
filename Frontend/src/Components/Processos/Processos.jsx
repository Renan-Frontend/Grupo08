import React from "react";
import RegistrosPage from "../Registros/RegistrosPage";
import {
  RegistrosContext,
  RegistrosProvider,
} from "../../Context/RegistrosContext";
import { UserContext } from "../../Context/UserContext";
import styles from "../Registros/RegistrosPage.module.css";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getInputType = (tipo) => {
  const t = String(tipo || "").toLowerCase();
  if (t === "número" || t === "numero") return "number";
  if (t === "data") return "date";
  if (t === "email") return "email";
  if (t === "telefone") return "tel";
  return "text";
};

const useCustomLabels = (storageKey, defaults) => {
  const [labels, setLabels] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...defaults, ...JSON.parse(saved) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  });
};
const setLabel = (key, value) => {
  setLabels((previous) => {
    const next = { ...previous, [key]: value };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
    return next;
  });

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
    setReq((previous) => {
      const next = { ...previous, [key]: !previous[key] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return [req, toggleRequired];
};

const EditableLabel = ({ value, onChange, className }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  const commit = () => {
    const trimmed = String(draft || "").trim();
    if (trimmed) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className={styles.labelEdit}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        autoFocus
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

const FieldLabel = ({ value, onChange, required, onToggleRequired }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  const commit = () => {
    const trimmed = String(draft || "").trim();
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
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          autoFocus
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
      >
        {required ? "● obrig." : "○ opcional"}
      </button>
    </span>
  );
};

const PROCESSO_LABEL_DEFAULTS = {
  titulo_modal: "Novo Processo",
  nome: "Nome do processo",
  tipo: "Modelo",
  status: "Status",
  prioridade: "Prioridade",
  responsavel: "Responsável",
  data_inicio: "Data de início",
  data_conclusao: "Conclusão prevista",
  observacoes: "Descrição",
};

const PROCESSO_REQUIRED_DEFAULTS = {
  nome: true,
  tipo: true,
  status: false,
  prioridade: false,
  responsavel: false,
  data_inicio: false,
  data_conclusao: false,
  observacoes: false,
};

// ─── Modal dedicado para criar processo ──────────────────────────────────────

export const CreateProcessoModal = ({
  entidades,
  onClose,
  onSaved,
  opportunityId,
}) => {
  const { criarRegistro } = React.useContext(RegistrosContext);
  const { user } = React.useContext(UserContext);

  const [entidadeId, setEntidadeId] = React.useState(
    entidades.length > 0 ? String(entidades[0].id) : "",
  );
  const [nome, setNome] = React.useState("");
  const [status, setStatus] = React.useState("Em andamento");
  const [prioridade, setPrioridade] = React.useState("Média");
  const [responsavel, setResponsavel] = React.useState("");
  const [dataInicio, setDataInicio] = React.useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dataConclusao, setDataConclusao] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [dados, setDados] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [labels, setLabel] = useCustomLabels(
    "bp_labels_processos",
    PROCESSO_LABEL_DEFAULTS,
  );
  const [req, toggleRequired] = useCustomRequired(
    "bp_required_processos",
    PROCESSO_REQUIRED_DEFAULTS,
  );
  const [dynLabels, setDynLabel] = useCustomLabels(
    "bp_labels_processos_dyn",
    {},
  );
  const [dynRequired, toggleDynRequired] = useCustomRequired(
    "bp_required_processos_dyn",
    {},
  );
  const [extraCampos, setExtraCampos] = React.useState([]);
  const [camposOcultos, setCamposOcultos] = React.useState(new Set());

  const entidadeSelecionada = entidades.find(
    (e) => String(e.id) === entidadeId,
  );

  // Envolver campos em useMemo para evitar instabilidade nas dependências
  const campos = React.useMemo(
    () =>
      Array.isArray(entidadeSelecionada?.campos)
        ? entidadeSelecionada.campos
        : [],
    [entidadeSelecionada?.campos],
  );

  // Campo id_* do modelo → aparece no lugar de "Tipo"
  const idCampoKey = React.useMemo(() => {
    const c = campos.find((f) =>
      (f.nome || f.label || "").toLowerCase().startsWith("id_"),
    );
    return c ? c.nome || c.label : null;
  }, [campos]);
  const idCampoLabel = React.useMemo(() => {
    const c = campos.find((f) =>
      (f.nome || f.label || "").toLowerCase().startsWith("id_"),
    );
    if (!c) return "ID";
    const raw =
      c.label && c.label !== c.nome ? c.label : c.nome || c.label || "ID";
    return raw.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }, [campos]);
  const [idCampoValor, setIdCampoValor] = React.useState("");
  React.useEffect(() => {
    setIdCampoValor("");
  }, [idCampoKey]);

  const handleFieldChange = (nomeCampo, value) => {
    setDados((prev) => ({ ...prev, [nomeCampo]: value }));
  };

  const ocultarCampo = (nomeCampo) => {
    setCamposOcultos((prev) => new Set([...prev, nomeCampo]));
    setDados((prev) => {
      const next = { ...prev };
      delete next[nomeCampo];
      return next;
    });
  };

  const addExtraCampo = () => {
    setExtraCampos((prev) => [...prev, { id: Date.now(), texto: "" }]);
  };

  const updateExtraCampo = (id, key, value) => {
    setExtraCampos((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)),
    );
  };

  const removeExtraCampo = (id) => {
    setExtraCampos((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSave = async () => {
    if (req.tipo && !entidadeSelecionada) {
      setError("Nenhum modelo de processo configurado.");
      return;
    }
    if (req.nome && !nome.trim()) {
      setError("Informe o nome do processo.");
      return;
    }

    for (const campo of campos) {
      const nomeCampo = campo.nome || campo.label || "";
      const isRequired =
        dynRequired[nomeCampo] ?? campo.obrigatorio ?? campo.required ?? false;
      if (!isRequired) continue;
      const valor = dados[nomeCampo];
      if (campo.tipo?.toLowerCase() === "booleano") {
        if (!valor) {
          setError(
            `Preencha o campo obrigatório: ${dynLabels[nomeCampo] || nomeCampo}.`,
          );
          return;
        }
      } else if (!String(valor ?? "").trim()) {
        setError(
          `Preencha o campo obrigatório: ${dynLabels[nomeCampo] || nomeCampo}.`,
        );
        return;
      }
    }

    setError("");
    setSaving(true);
    try {
      const extraDados = {};
      for (const ec of extraCampos) {
        const txt = String(ec.texto || "").trim();
        if (!txt) continue;
        const colonIdx = txt.indexOf(":");
        const k =
          colonIdx > 0
            ? txt.slice(0, colonIdx).trim()
            : `campo_${Object.keys(extraDados).length + 1}`;
        const v = colonIdx > 0 ? txt.slice(colonIdx + 1).trim() : txt;
        if (k) extraDados[k] = v;
      }
      const payload = {
        entidadeId: entidadeSelecionada.id,
        entidadeNome: entidadeSelecionada.nome,
        papelNegocio: "processo",
        titulo: nome.trim(),
        dados: {
          ...dados,
          ...extraDados,
          ...(idCampoKey ? { [idCampoKey]: idCampoValor } : {}),
          ...(campos.some((c) => (c.nome || c.label) === "nome")
            ? { nome: nome.trim() }
            : {}),
          ...(campos.some((c) => (c.nome || c.label) === "descricao") &&
          observacoes.trim()
            ? { descricao: observacoes.trim() }
            : {}),
          status,
          prioridade,
          ...(responsavel.trim() ? { responsavel: responsavel.trim() } : {}),
          ...(dataInicio ? { data_inicio: dataInicio } : {}),
          ...(dataConclusao ? { data_conclusao: dataConclusao } : {}),
          ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
          ...(opportunityId ? { oportunidadeId: String(opportunityId) } : {}),
        },
        criadoPor: user?.nome || user?.username || "Usuário",
      };
      await criarRegistro(payload);
      onSaved();
    } catch (err) {
      setError(err.message || "Erro ao criar processo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            <EditableLabel
              value={labels.titulo_modal}
              onChange={(value) => setLabel("titulo_modal", value)}
            />
          </h2>
          <button
            className={styles.modalClose}
            onClick={onClose}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Nome */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.nome}
                onChange={(value) => setLabel("nome", value)}
                required={req.nome}
                onToggleRequired={() => toggleRequired("nome")}
              />
            </label>
            <input
              id="processoNome"
              name="processoNome"
              className={styles.formInput}
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Aprovação de compra, Onboarding de cliente..."
              required={req.nome}
              autoFocus
            />
          </div>

          {/* ID / Tipo */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              {idCampoKey ? idCampoLabel : "Tipo"}
            </label>
            <input
              id="processoTipo"
              name="processoTipo"
              className={styles.formInput}
              type="text"
              value={
                idCampoKey ? idCampoValor : entidadeSelecionada?.nome || ""
              }
              onChange={
                idCampoKey ? (e) => setIdCampoValor(e.target.value) : undefined
              }
              placeholder={
                idCampoKey ? `${idCampoLabel}...` : "Nenhum modelo configurado"
              }
              readOnly={!idCampoKey}
            />
          </div>

          {/* Status + Prioridade */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FieldLabel
                  value={labels.status}
                  onChange={(value) => setLabel("status", value)}
                  required={req.status}
                  onToggleRequired={() => toggleRequired("status")}
                />
              </label>
              <input
                className={styles.formInput}
                type="text"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="Ex: Em andamento"
                required={req.status}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FieldLabel
                  value={labels.prioridade}
                  onChange={(value) => setLabel("prioridade", value)}
                  required={req.prioridade}
                  onToggleRequired={() => toggleRequired("prioridade")}
                />
              </label>
              <input
                id="processoPrioridade"
                name="processoPrioridade"
                className={styles.formInput}
                type="text"
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                placeholder="Ex: Alta, Média, Baixa"
                required={req.prioridade}
              />
            </div>
          </div>

          {/* Responsável */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.responsavel}
                onChange={(value) => setLabel("responsavel", value)}
                required={req.responsavel}
                onToggleRequired={() => toggleRequired("responsavel")}
              />
            </label>
            <input
              id="processoResponsavel"
              name="processoResponsavel"
              className={styles.formInput}
              type="text"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Nome do responsável pelo processo"
              required={req.responsavel}
            />
          </div>

          {/* Datas */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FieldLabel
                  value={labels.data_inicio}
                  onChange={(value) => setLabel("data_inicio", value)}
                  required={req.data_inicio}
                  onToggleRequired={() => toggleRequired("data_inicio")}
                />
              </label>
              <input
                id="processoDataInicio"
                name="processoDataInicio"
                className={styles.formInput}
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                required={req.data_inicio}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FieldLabel
                  value={labels.data_conclusao}
                  onChange={(value) => setLabel("data_conclusao", value)}
                  required={req.data_conclusao}
                  onToggleRequired={() => toggleRequired("data_conclusao")}
                />
              </label>
              <input
                id="processoDataConclusao"
                name="processoDataConclusao"
                className={styles.formInput}
                type="date"
                value={dataConclusao}
                onChange={(e) => setDataConclusao(e.target.value)}
                required={req.data_conclusao}
              />
            </div>
          </div>

          {/* Campos dinâmicos da entidade */}
          {campos.length > 0 && (
            <>
              {campos
                .filter((campo) => {
                  const n = campo.nome || campo.label || "";
                  if (n === "nome" || n === "descricao") return false;
                  if (idCampoKey && n === idCampoKey) return false;
                  return !camposOcultos.has(n);
                })
                .map((campo) => {
                  const nomeCampo = campo.nome || campo.label || "";
                  const tipo = campo.tipo || "Texto";
                  const obrigatorio =
                    campo.obrigatorio || campo.required || false;
                  return (
                    <div key={nomeCampo} className={styles.extraFieldRow}>
                      <div
                        className={styles.formGroup}
                        style={{ gridColumn: "span 2" }}
                      >
                        <label className={styles.formLabel}>
                          <FieldLabel
                            value={dynLabels[nomeCampo] || nomeCampo}
                            onChange={(value) => setDynLabel(nomeCampo, value)}
                            required={dynRequired[nomeCampo] ?? obrigatorio}
                            onToggleRequired={() =>
                              toggleDynRequired(nomeCampo)
                            }
                          />
                        </label>
                        {tipo.toLowerCase() === "booleano" ? (
                          <input
                            id={`campo-booleano-${nomeCampo}`}
                            name={`campo-booleano-${nomeCampo}`}
                            type="checkbox"
                            className={styles.formCheckbox}
                            checked={!!dados[nomeCampo]}
                            onChange={(e) =>
                              handleFieldChange(nomeCampo, e.target.checked)
                            }
                          />
                        ) : (
                          <input
                            id={`campo-${nomeCampo}`}
                            name={`campo-${nomeCampo}`}
                            type={getInputType(tipo)}
                            className={styles.formInput}
                            value={dados[nomeCampo] ?? ""}
                            onChange={(e) =>
                              handleFieldChange(nomeCampo, e.target.value)
                            }
                            placeholder={`${nomeCampo}...`}
                            required={dynRequired[nomeCampo] ?? obrigatorio}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        className={styles.removeFieldBtn}
                        onClick={() => ocultarCampo(nomeCampo)}
                        title="Remover campo"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
            </>
          )}

          {/* Campos extras (adicionados pelo usuário) */}
          {extraCampos.map((ec) => (
            <div key={ec.id} className={styles.extraFieldRow}>
              <div
                className={styles.formGroup}
                style={{ gridColumn: "span 2" }}
              >
                <input
                  id={`extra-campo-${ec.id}`}
                  name={`extra-campo-${ec.id}`}
                  className={styles.formInput}
                  type="text"
                  value={ec.texto}
                  onChange={(e) =>
                    updateExtraCampo(ec.id, "texto", e.target.value)
                  }
                  placeholder="Ex: número do contrato: 12345"
                />
              </div>
              <button
                type="button"
                className={styles.removeFieldBtn}
                onClick={() => removeExtraCampo(ec.id)}
                title="Remover campo"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.addFieldBtn}
            onClick={addExtraCampo}
          >
            + Adicionar campo
          </button>

          {/* Observações */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.observacoes}
                onChange={(value) => setLabel("observacoes", value)}
                required={req.observacoes}
                onToggleRequired={() => toggleRequired("observacoes")}
              />
            </label>
            <textarea
              id="processoObservacoes"
              name="processoObservacoes"
              className={styles.formInput}
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Contexto, detalhes ou informações relevantes sobre o processo..."
              required={req.observacoes}
              style={{ resize: "vertical" }}
            />
          </div>

          {error && <p className={styles.formError}>{error}</p>}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Criando..." : "Criar processo"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Modal dedicado para editar processo ─────────────────────────────────────

export const EditProcessoModal = ({
  entidades,
  registro,
  onClose,
  onSaved,
}) => {
  const { editarRegistro } = React.useContext(RegistrosContext);
  const { user } = React.useContext(UserContext);

  const entidadeSelecionada =
    entidades.find((e) => String(e.id) === String(registro?.entidadeId)) ||
    entidades[0];
  const campos = Array.isArray(entidadeSelecionada?.campos)
    ? entidadeSelecionada.campos
    : [];

  const knownKeys = [
    "status",
    "prioridade",
    "responsavel",
    "data_inicio",
    "data_conclusao",
    "observacoes",
    "oportunidadeId",
    "etapa",
    "tipoDocumento",
    "descricao",
  ];

  const entityFieldKeys = React.useMemo(
    () => campos.map((c) => c.nome || c.label || ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // "nome" campo do modelo = titulo do processo; "descricao" campo = observacoes
  const [nome, setNome] = React.useState(
    registro?.dados?.nome || registro?.titulo || "",
  );
  const [status, setStatus] = React.useState(
    registro?.dados?.status || "Em andamento",
  );
  const [prioridade, setPrioridade] = React.useState(
    registro?.dados?.prioridade || "Média",
  );
  const [responsavel, setResponsavel] = React.useState(
    registro?.dados?.responsavel || "",
  );
  const [dataInicio, setDataInicio] = React.useState(
    registro?.dados?.data_inicio || "",
  );
  const [dataConclusao, setDataConclusao] = React.useState(
    registro?.dados?.data_conclusao || "",
  );
  const [observacoes, setObservacoes] = React.useState(
    registro?.dados?.descricao || registro?.dados?.observacoes || "",
  );
  // Campo id_* do modelo (ex: id_pedido) → aparece no campo ID
  const idCampoKey =
    entityFieldKeys.find((k) => k.toLowerCase().startsWith("id_")) || null;
  const idCampoLabel = idCampoKey
    ? idCampoKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    : "ID";
  const [idCampoValor, setIdCampoValor] = React.useState(
    idCampoKey ? String(registro?.dados?.[idCampoKey] ?? "") : "",
  );
  const [dados, setDados] = React.useState(() => {
    const d = {};
    for (const [k, v] of Object.entries(registro?.dados || {})) {
      if (!knownKeys.includes(k) && !entityFieldKeys.includes(k)) continue;
      if (entityFieldKeys.includes(k)) d[k] = v;
    }
    return d;
  });
  const [extraCampos, setExtraCampos] = React.useState(() => {
    const extras = [];
    for (const [k, v] of Object.entries(registro?.dados || {})) {
      if (!knownKeys.includes(k) && !entityFieldKeys.includes(k)) {
        extras.push({ id: k, texto: `${k}: ${String(v ?? "")}` });
      }
    }
    return extras;
  });
  const [camposOcultos, setCamposOcultos] = React.useState(new Set());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const [labels, setLabel] = useCustomLabels(
    "bp_labels_processos",
    PROCESSO_LABEL_DEFAULTS,
  );
  const [req, toggleRequired] = useCustomRequired(
    "bp_required_processos",
    PROCESSO_REQUIRED_DEFAULTS,
  );

  const handleFieldChange = (nomeCampo, value) => {
    setDados((prev) => ({ ...prev, [nomeCampo]: value }));
  };

  const ocultarCampo = (nomeCampo) => {
    setCamposOcultos((prev) => new Set([...prev, nomeCampo]));
    setDados((prev) => {
      const next = { ...prev };
      delete next[nomeCampo];
      return next;
    });
  };

  const addExtraCampo = () => {
    setExtraCampos((prev) => [...prev, { id: Date.now(), texto: "" }]);
  };

  const updateExtraCampo = (id, texto) => {
    // If the key part matches an existing entity campo, route value there
    const colonIdx = texto.indexOf(":");
    if (colonIdx > 0) {
      const k = texto.slice(0, colonIdx).trim();
      if (entityFieldKeys.includes(k)) {
        const v = texto.slice(colonIdx + 1).trim();
        handleFieldChange(k, v);
        setExtraCampos((prev) => prev.filter((c) => c.id !== id));
        return;
      }
    }
    setExtraCampos((prev) =>
      prev.map((c) => (c.id === id ? { ...c, texto } : c)),
    );
  };

  const removeExtraCampo = (id) => {
    setExtraCampos((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSave = async () => {
    if (req.nome && !nome.trim()) {
      setError("Informe o nome do processo.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const extraDados = {};
      for (const ec of extraCampos) {
        const txt = String(ec.texto || "").trim();
        if (!txt) continue;
        const colonIdx = txt.indexOf(":");
        const k =
          colonIdx > 0
            ? txt.slice(0, colonIdx).trim()
            : `campo_${Object.keys(extraDados).length + 1}`;
        const v = colonIdx > 0 ? txt.slice(colonIdx + 1).trim() : txt;
        if (k) extraDados[k] = v;
      }
      // Preserve only system-level fields from the original registro (never user-editable)
      const systemKeys = ["oportunidadeId", "etapa", "tipoDocumento"];
      const preservedDados = {};
      for (const k of systemKeys) {
        if (registro?.dados?.[k] !== undefined)
          preservedDados[k] = registro.dados[k];
      }
      const payload = {
        entidadeId: entidadeSelecionada?.id,
        entidadeNome: entidadeSelecionada?.nome,
        papelNegocio: "processo",
        titulo: nome.trim(),
        dados: {
          ...preservedDados,
          ...dados,
          ...extraDados,
          ...(idCampoKey ? { [idCampoKey]: idCampoValor } : {}),
          status,
          prioridade,
          ...(responsavel.trim() ? { responsavel: responsavel.trim() } : {}),
          ...(dataInicio ? { data_inicio: dataInicio } : {}),
          ...(dataConclusao ? { data_conclusao: dataConclusao } : {}),
          ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
          // Mirror aliases: entity campo "nome" = titulo; "descricao" = observacoes
          ...(entityFieldKeys.includes("nome") ? { nome: nome.trim() } : {}),
          ...(entityFieldKeys.includes("descricao") && observacoes.trim()
            ? { descricao: observacoes.trim() }
            : {}),
        },
        criadoPor: user?.nome || user?.username || "Usuário",
      };
      await editarRegistro(registro.id, payload);
      onSaved();
    } catch (err) {
      setError(err.message || "Erro ao salvar processo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Editar processo</h2>
          <button
            className={styles.modalClose}
            onClick={onClose}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Nome */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.nome}
                onChange={(value) => setLabel("nome", value)}
                required={req.nome}
                onToggleRequired={() => toggleRequired("nome")}
              />
            </label>
            <input
              className={styles.formInput}
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Aprovação de compra..."
              required={req.nome}
              autoFocus
            />
          </div>

          {/* ID */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{idCampoLabel}</label>
            <input
              className={styles.formInput}
              type="text"
              value={idCampoKey ? idCampoValor : registro?.id || ""}
              onChange={
                idCampoKey ? (e) => setIdCampoValor(e.target.value) : undefined
              }
              readOnly={!idCampoKey}
            />
          </div>

          {/* Status + Prioridade */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FieldLabel
                  value={labels.status}
                  onChange={(value) => setLabel("status", value)}
                  required={req.status}
                  onToggleRequired={() => toggleRequired("status")}
                />
              </label>
              <input
                id="editProcessoStatus"
                name="editProcessoStatus"
                className={styles.formInput}
                type="text"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="Ex: Em andamento"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FieldLabel
                  value={labels.prioridade}
                  onChange={(value) => setLabel("prioridade", value)}
                  required={req.prioridade}
                  onToggleRequired={() => toggleRequired("prioridade")}
                />
              </label>
              <input
                id="editProcessoPrioridade"
                name="editProcessoPrioridade"
                className={styles.formInput}
                type="text"
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                placeholder="Ex: Alta, Média, Baixa"
              />
            </div>
          </div>

          {/* Responsável */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.responsavel}
                onChange={(value) => setLabel("responsavel", value)}
                required={req.responsavel}
                onToggleRequired={() => toggleRequired("responsavel")}
              />
            </label>
            <input
              id="editProcessoResponsavel"
              name="editProcessoResponsavel"
              className={styles.formInput}
              type="text"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Nome do responsável"
            />
          </div>

          {/* Datas */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FieldLabel
                  value={labels.data_inicio}
                  onChange={(value) => setLabel("data_inicio", value)}
                  required={req.data_inicio}
                  onToggleRequired={() => toggleRequired("data_inicio")}
                />
              </label>
              <input
                id="editProcessoDataInicio"
                name="editProcessoDataInicio"
                className={styles.formInput}
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FieldLabel
                  value={labels.data_conclusao}
                  onChange={(value) => setLabel("data_conclusao", value)}
                  required={req.data_conclusao}
                  onToggleRequired={() => toggleRequired("data_conclusao")}
                />
              </label>
              <input
                id="editProcessoDataConclusao"
                name="editProcessoDataConclusao"
                className={styles.formInput}
                type="date"
                value={dataConclusao}
                onChange={(e) => setDataConclusao(e.target.value)}
              />
            </div>
          </div>

          {/* Campos dinâmicos */}
          {campos.length > 0 && (
            <>
              {campos
                .filter((campo) => {
                  const n = campo.nome || campo.label || "";
                  // "nome" = titulo (já mostrado em "Nome do processo")
                  // "descricao" = observacoes (já mostrado em "Observações")
                  // id_* = mostrado no campo ID
                  if (n === "nome" || n === "descricao") return false;
                  if (idCampoKey && n === idCampoKey) return false;
                  return !camposOcultos.has(n);
                })
                .map((campo) => {
                  const nomeCampo = campo.nome || campo.label || "";
                  const tipo = campo.tipo || "Texto";
                  const obrigatorio =
                    campo.obrigatorio || campo.required || false;
                  return (
                    <div key={nomeCampo} className={styles.extraFieldRow}>
                      <div
                        className={styles.formGroup}
                        style={{ gridColumn: "span 2" }}
                      >
                        <label className={styles.formLabel}>
                          {nomeCampo}
                          {obrigatorio && (
                            <span className={styles.requiredBadgeOn}>
                              • obrig.
                            </span>
                          )}
                        </label>
                        {tipo.toLowerCase() === "booleano" ? (
                          <input
                            id={`edit-campo-booleano-${nomeCampo}`}
                            name={`edit-campo-booleano-${nomeCampo}`}
                            type="checkbox"
                            className={styles.formCheckbox}
                            checked={!!dados[nomeCampo]}
                            onChange={(e) =>
                              handleFieldChange(nomeCampo, e.target.checked)
                            }
                          />
                        ) : (
                          <input
                            id={`edit-campo-${nomeCampo}`}
                            name={`edit-campo-${nomeCampo}`}
                            type={getInputType(tipo)}
                            className={styles.formInput}
                            value={dados[nomeCampo] ?? ""}
                            onChange={(e) =>
                              handleFieldChange(nomeCampo, e.target.value)
                            }
                            placeholder={`${nomeCampo}...`}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        className={styles.removeFieldBtn}
                        onClick={() => ocultarCampo(nomeCampo)}
                        title="Remover campo"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
            </>
          )}

          {/* Campos extras (adicionados pelo usuário) */}
          {extraCampos.map((ec) => (
            <div key={ec.id} className={styles.extraFieldRow}>
              <div
                className={styles.formGroup}
                style={{ gridColumn: "span 2" }}
              >
                <input
                  id={`edit-extra-campo-${ec.id}`}
                  name={`edit-extra-campo-${ec.id}`}
                  className={styles.formInput}
                  type="text"
                  value={ec.texto}
                  onChange={(e) => updateExtraCampo(ec.id, e.target.value)}
                  placeholder="Ex: número do contrato: 12345"
                />
              </div>
              <button
                type="button"
                className={styles.removeFieldBtn}
                onClick={() => removeExtraCampo(ec.id)}
                title="Remover campo"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.addFieldBtn}
            onClick={addExtraCampo}
          >
            + Adicionar campo
          </button>

          {/* Observações */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <FieldLabel
                value={labels.observacoes}
                onChange={(value) => setLabel("observacoes", value)}
                required={req.observacoes}
                onToggleRequired={() => toggleRequired("observacoes")}
              />
            </label>
            <textarea
              id="editProcessoObservacoes"
              name="editProcessoObservacoes"
              className={styles.formInput}
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações..."
              style={{ resize: "vertical" }}
            />
          </div>

          {error && <p className={styles.formError}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Página ───────────────────────────────────────────────────────────────────

export const ProcessosPage = () => (
  <RegistrosProvider>
    <RegistrosPage
      papelNegocio="processo"
      titulo="Processos"
      singular="processo"
      icone="🔄"
      CreateModal={CreateProcessoModal}
      EditModal={EditProcessoModal}
      createButtonLabel="+ Criar processo"
    />
  </RegistrosProvider>
);

export default ProcessosPage;
