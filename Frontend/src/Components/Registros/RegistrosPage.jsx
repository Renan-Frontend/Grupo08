import React from "react";
import { useNavigate } from "react-router-dom";
import { EntidadesContext } from "../../Context/EntidadesContext";
import { RegistrosContext } from "../../Context/RegistrosContext";
import { UserContext } from "../../Context/UserContext";
import {
  canCreateByAccessLevel,
  canDeleteByAccessLevel,
} from "../../Utils/accessControl";
import styles from "./RegistrosPage.module.css";

// ─── Helpers ────────────────────────────────────────────────────────────────

const getInputType = (tipo) => {
  const t = String(tipo || "").toLowerCase();
  if (t === "número" || t === "numero") return "number";
  if (t === "data") return "date";
  if (t === "email") return "email";
  if (t === "telefone") return "tel";
  return "text";
};

const getFirstTitle = (dados) => {
  const values = Object.values(dados || {});
  return values.find((v) => v && String(v).trim()) || "";
};

// ─── Modal para criar / editar um registro ──────────────────────────────────

export const RegistroModal = ({
  entidades,
  papelNegocio,
  registro,
  onClose,
  onSaved,
}) => {
  const { criarRegistro, editarRegistro } = React.useContext(RegistrosContext);
  const { user } = React.useContext(UserContext);

  const isEdit = Boolean(registro);
  const [entidadeId, setEntidadeId] = React.useState(
    registro ? String(registro.entidadeId) : "",
  );
  const [dados, setDados] = React.useState(registro?.dados || {});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const entidadeSelecionada = entidades.find(
    (e) => String(e.id) === entidadeId,
  );
  const campos = Array.isArray(entidadeSelecionada?.campos)
    ? entidadeSelecionada.campos
    : [];

  const handleEntidadeChange = (id) => {
    setEntidadeId(id);
    setDados({});
  };

  const handleFieldChange = (nomeCampo, value) => {
    setDados((prev) => ({ ...prev, [nomeCampo]: value }));
  };

  const handleSave = async () => {
    if (!entidadeSelecionada) {
      setError("Selecione o tipo antes de salvar.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const titulo = getFirstTitle(dados) || entidadeSelecionada.nome;
      const payload = {
        entidadeId: entidadeSelecionada.id,
        entidadeNome: entidadeSelecionada.nome,
        papelNegocio,
        titulo,
        dados,
        criadoPor: user?.nome || user?.username || "Usuário",
      };
      if (isEdit) {
        await editarRegistro(registro.id, payload);
      } else {
        await criarRegistro(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {isEdit ? "Editar registro" : "Novo registro"}
          </h2>
          <button
            className={styles.modalClose}
            onClick={onClose}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Tipo</label>
            <select
              className={styles.formSelect}
              value={entidadeId}
              onChange={(e) => handleEntidadeChange(e.target.value)}
              disabled={isEdit}
            >
              <option value="">Selecione o tipo...</option>
              {entidades.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>

          {campos.length > 0 ? (
            campos.map((campo) => {
              const nomeCampo = campo.nome || campo.label || "";
              const tipo = campo.tipo || "Texto";
              const obrigatorio = campo.obrigatorio || campo.required || false;
              return (
                <div key={nomeCampo} className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    {nomeCampo}
                    {obrigatorio && <span className={styles.required}> *</span>}
                  </label>
                  {tipo.toLowerCase() === "booleano" ? (
                    <input
                      id={`registro-campo-booleano-${nomeCampo}`}
                      name={`registro-campo-booleano-${nomeCampo}`}
                      type="checkbox"
                      className={styles.formCheckbox}
                      checked={!!dados[nomeCampo]}
                      onChange={(e) =>
                        handleFieldChange(nomeCampo, e.target.checked)
                      }
                    />
                  ) : (
                    <input
                      id={`registro-campo-${nomeCampo}`}
                      name={`registro-campo-${nomeCampo}`}
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
              );
            })
          ) : entidadeSelecionada ? (
            <p className={styles.emptyFields}>
              Esta entidade não possui campos definidos. Acesse{" "}
              <strong>Cadastros do Sistema</strong> para adicionar campos.
            </p>
          ) : null}

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
            disabled={saving || !entidadeSelecionada}
          >
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Card de registro ────────────────────────────────────────────────────────

const SYSTEM_KEYS = new Set([
  "oportunidadeId",
  "etapa",
  "tipoDocumento",
  "status",
  "prioridade",
  "responsavel",
  "data_inicio",
  "data_conclusao",
  "observacoes",
  "descricao",
  "nome",
]);

const STATUS_COLOR = {
  concluido: "#10b981",
  planejado: "#3b82f6",
  em_andamento: "#f59e0b",
  cancelado: "#ef4444",
};

const RegistroCard = ({ registro, onEdit, onDelete, canEdit, canDelete }) => {
  const titulo = registro.titulo || registro.entidadeNome || "Sem título";
  const entidadeNome = registro.entidadeNome || "";
  const showSubtitle = entidadeNome && entidadeNome !== titulo;
  const d = registro.dados || {};

  const status = d.status;
  const prioridade = d.prioridade;
  const responsavel = d.responsavel;
  const dataInicio = d.data_inicio;
  const dataConclusao = d.data_conclusao;
  const observacoes = d.observacoes || d.descricao;

  const extraEntries = Object.entries(d).filter(([k]) => !SYSTEM_KEYS.has(k));

  const fmt = (s) => (s ? new Date(s).toLocaleDateString("pt-BR") : null);

  return (
    <article className={styles.card}>
      {/* Header */}
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{titulo}</h3>
          {showSubtitle && (
            <span className={styles.cardType}>{entidadeNome}</span>
          )}
        </div>
        <div className={styles.cardActions}>
          {canEdit && (
            <button className={styles.iconBtn} onClick={onEdit} title="Editar">
              ✏️
            </button>
          )}
          {canDelete && (
            <button
              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
              onClick={onDelete}
              title="Excluir"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* Badges de status / prioridade / responsável */}
      {(status || prioridade || responsavel) && (
        <div className={styles.cardBadges}>
          {status && (
            <span
              className={styles.statusBadge}
              style={{ backgroundColor: STATUS_COLOR[status] || "#6b7280" }}
            >
              {status.replace(/_/g, " ")}
            </span>
          )}
          {prioridade && (
            <span className={styles.infoBadge}>🔺 {prioridade}</span>
          )}
          {responsavel && (
            <span className={styles.infoBadge}>👤 {responsavel}</span>
          )}
        </div>
      )}

      {/* Datas */}
      {(dataInicio || dataConclusao) && (
        <div className={styles.cardDates}>
          {dataInicio && (
            <span>
              📅 Início: <strong>{fmt(dataInicio)}</strong>
            </span>
          )}
          {dataConclusao && (
            <span>
              🏁 Conclusão: <strong>{fmt(dataConclusao)}</strong>
            </span>
          )}
        </div>
      )}

      {/* Descrição */}
      {observacoes && (
        <div className={styles.cardObsWrapper}>
          <span className={styles.cardObsLabel}>Descrição</span>
          <p className={styles.cardObs}>{observacoes}</p>
        </div>
      )}

      {/* Campos extras */}
      {extraEntries.length > 0 && (
        <dl className={styles.cardData}>
          {extraEntries.map(([key, value]) => (
            <div key={key} className={styles.dataRow}>
              <dt className={styles.dataLabel}>{key}</dt>
              <dd className={styles.dataValue}>
                {value === true
                  ? "✓"
                  : value === false
                    ? "✗"
                    : String(value ?? "")}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
};

// ─── Página principal ────────────────────────────────────────────────────────

const RegistrosPage = ({
  papelNegocio,
  titulo,
  singular,
  icone,
  CreateModal,
  EditModal,
  createButtonLabel,
}) => {
  const navigate = useNavigate();
  const { entidades: entidadesRaw } = React.useContext(EntidadesContext);
  const { registros, loading, error, fetchRegistros, deletarRegistro } =
    React.useContext(RegistrosContext);
  const { user } = React.useContext(UserContext);

  const [showModal, setShowModal] = React.useState(false);
  const [registroEmEdicao, setRegistroEmEdicao] = React.useState(null);
  const [filtroEntidade, setFiltroEntidade] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(null);

  const canCreate = canCreateByAccessLevel(user);
  const canDelete = canDeleteByAccessLevel(user);

  // Entities tagged with this papelNegocio
  const entidades = React.useMemo(
    () =>
      (Array.isArray(entidadesRaw) ? entidadesRaw : []).filter(
        (e) => String(e?.papelNegocio || "").toLowerCase() === papelNegocio,
      ),
    [entidadesRaw, papelNegocio],
  );

  // Records filtered for this papelNegocio
  const registrosFiltrados = React.useMemo(() => {
    let list = registros.filter(
      (r) => String(r?.papelNegocio || "").toLowerCase() === papelNegocio,
    );
    if (filtroEntidade) {
      list = list.filter((r) => String(r.entidadeId) === filtroEntidade);
    }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      list = list.filter(
        (r) =>
          String(r.titulo || "")
            .toLowerCase()
            .includes(q) ||
          String(r.entidadeNome || "")
            .toLowerCase()
            .includes(q) ||
          Object.values(r.dados || {}).some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(q),
          ),
      );
    }
    return list;
  }, [registros, papelNegocio, filtroEntidade, busca]);

  React.useEffect(() => {
    fetchRegistros(papelNegocio);
  }, [fetchRegistros, papelNegocio]);

  const handleDelete = async (id) => {
    try {
      await deletarRegistro(id);
    } catch {
      // silently ignore
    } finally {
      setConfirmDelete(null);
    }
  };

  const openCreate = () => {
    setRegistroEmEdicao(null);
    setShowModal(true);
  };

  const openEdit = (registro) => {
    setRegistroEmEdicao(registro);
    setShowModal(true);
  };

  const handleModalSaved = () => {
    setShowModal(false);
    setRegistroEmEdicao(null);
    fetchRegistros(papelNegocio);
  };

  return (
    <main className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.pageIcon}>{icone}</span>
          <div>
            <h1 className={styles.pageTitle}>{titulo}</h1>
            <p className={styles.pageSubtitle}>
              {entidades.length === 0
                ? `Nenhuma entidade com papel "${singular}" encontrada. Acesse Cadastros do Sistema para configurar.`
                : `${registrosFiltrados.length} registro${registrosFiltrados.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        {canCreate && (
          <button className={styles.btnCreate} onClick={openCreate}>
            {createButtonLabel || `+ Novo ${singular}`}
          </button>
        )}
      </div>

      {/* No entity types configured */}
      {entidades.length === 0 && !loading && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>{icone}</span>
          <h2 className={styles.emptyTitle}>Nenhum tipo configurado</h2>
          <p className={styles.emptyDesc}>
            Crie um tipo de entidade com o papel de negócio{" "}
            <strong>{singular}</strong> para começar a registrar dados aqui.
          </p>
        </div>
      )}

      {/* Toolbar */}
      {entidades.length > 0 && (
        <div className={styles.toolbar}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder={`Buscar ${singular}es...`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className={styles.loadingState}>Carregando...</div>
      ) : error ? (
        <div className={styles.errorState}>{error}</div>
      ) : registrosFiltrados.length === 0 && entidades.length > 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <h2 className={styles.emptyTitle}>Nenhum registro encontrado</h2>
          <p className={styles.emptyDesc}>
            {canCreate
              ? `Clique em "+ Novo ${singular}" para adicionar o primeiro registro.`
              : "Nenhum registro disponível ainda."}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {registrosFiltrados.map((r) => (
            <RegistroCard
              key={r.id}
              registro={r}
              onEdit={() => openEdit(r)}
              onDelete={() => setConfirmDelete(r.id)}
              canEdit
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showModal &&
        (registroEmEdicao ? (
          EditModal ? (
            <EditModal
              entidades={entidades}
              registro={registroEmEdicao}
              onClose={() => setShowModal(false)}
              onSaved={handleModalSaved}
            />
          ) : (
            <RegistroModal
              entidades={entidades}
              papelNegocio={papelNegocio}
              registro={registroEmEdicao}
              onClose={() => setShowModal(false)}
              onSaved={handleModalSaved}
            />
          )
        ) : CreateModal ? (
          <CreateModal
            entidades={entidades}
            onClose={() => setShowModal(false)}
            onSaved={handleModalSaved}
          />
        ) : (
          <RegistroModal
            entidades={entidades}
            papelNegocio={papelNegocio}
            registro={null}
            onClose={() => setShowModal(false)}
            onSaved={handleModalSaved}
          />
        ))}

      {confirmDelete !== null && (
        <div className={styles.modalOverlay}>
          <div
            className={styles.confirmModal}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={styles.confirmText}>
              Excluir este {singular}? Esta ação não pode ser desfeita.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => setConfirmDelete(null)}
              >
                Cancelar
              </button>
              <button
                className={styles.btnDanger}
                onClick={() => handleDelete(confirmDelete)}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default RegistrosPage;
