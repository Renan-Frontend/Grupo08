import React from "react";
import {
  RegistrosContext,
  RegistrosProvider,
} from "../../../Context/RegistrosContext";
import { EntidadesContext } from "../../../Context/EntidadesContext";
import {
  EditProcessoModal,
  CreateProcessoModal,
} from "../../Processos/Processos";
import s from "./OpportunityProcessosCard.module.css";

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

const ProcessoCard = ({ registro, onEdit }) => {
  const titulo = registro.titulo || registro.entidadeNome || "Sem título";
  const entidadeNome = registro.entidadeNome || "";
  const showSubtitle = entidadeNome && entidadeNome !== titulo;
  const status = registro.dados?.status;
  const statusColor = STATUS_COLOR[status] || "#6b7280";
  const dadoEntries = Object.entries(registro.dados || {})
    .filter(([k]) => !SYSTEM_KEYS.has(k))
    .slice(0, 3);
  const updatedAt = registro.updated_at
    ? new Date(registro.updated_at).toLocaleDateString("pt-BR")
    : null;

  return (
    <div className={s.timelineItem}>
      <div className={s.dot}>⚙️</div>
      <div className={s.itemContent}>
        <p className={s.itemTitle}>{titulo}</p>
        <div className={s.itemMeta}>
          {showSubtitle && (
            <span className={s.itemSubtitle}>{entidadeNome}</span>
          )}
          {status && (
            <span
              className={s.statusBadge}
              style={{ backgroundColor: statusColor }}
            >
              {status.replace("_", " ")}
            </span>
          )}
          {updatedAt && <span className={s.itemDate}>{updatedAt}</span>}
        </div>
        {dadoEntries.length > 0 && (
          <ul className={s.dataList}>
            {dadoEntries.map(([key, value]) => (
              <li key={key} className={s.dataRow}>
                <span className={s.dataKey}>{key}:</span>
                <span>
                  {value === true
                    ? "✓"
                    : value === false
                      ? "✗"
                      : String(value ?? "")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button className={s.editBtn} onClick={onEdit} title="Editar">
          ✏️
        </button>
      </div>
    </div>
  );
};

const ProcessosInner = ({ opportunityId }) => {
  const { registros, loading, fetchRegistros } =
    React.useContext(RegistrosContext);
  const { entidades: entidadesRaw } = React.useContext(EntidadesContext);
  const [editingRegistro, setEditingRegistro] = React.useState(null);
  const [criando, setCriando] = React.useState(false);

  const entidades = React.useMemo(
    () =>
      (Array.isArray(entidadesRaw) ? entidadesRaw : []).filter(
        (e) => String(e?.papelNegocio || "").toLowerCase() === "processo",
      ),
    [entidadesRaw],
  );

  const processosDaOportunidade = React.useMemo(
    () =>
      registros.filter(
        (r) =>
          String(r?.papelNegocio || "").toLowerCase() === "processo" &&
          String(r?.dados?.oportunidadeId || "") ===
            String(opportunityId || ""),
      ),
    [registros, opportunityId],
  );

  React.useEffect(() => {
    fetchRegistros("processo");
  }, [fetchRegistros]);

  const handleSaved = () => {
    setEditingRegistro(null);
    setCriando(false);
    fetchRegistros("processo");
  };

  return (
    <div className={s.wrapper}>
      <div className={s.header}>
        <span className={s.title}>⚙️ PROCESSOS</span>
        <button
          className={s.btnAdd}
          onClick={() => setCriando(true)}
          title="Adicionar processo"
        >
          +
        </button>
      </div>
      {loading ? (
        <p className={s.empty}>Carregando...</p>
      ) : processosDaOportunidade.length === 0 ? (
        <div className={s.emptyState}>
          <span className={s.emptyIcon}>⚙️</span>
          <p>Nenhum processo adicionado.</p>
        </div>
      ) : (
        <div className={s.timeline}>
          {processosDaOportunidade.map((r) => (
            <ProcessoCard
              key={r.id}
              registro={r}
              onEdit={() => setEditingRegistro(r)}
            />
          ))}
        </div>
      )}

      {editingRegistro && (
        <EditProcessoModal
          entidades={entidades}
          registro={editingRegistro}
          onClose={() => setEditingRegistro(null)}
          onSaved={handleSaved}
        />
      )}

      {criando && (
        <CreateProcessoModal
          entidades={entidades}
          opportunityId={opportunityId}
          onClose={() => setCriando(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

const OpportunityProcessosCard = ({ opportunityId }) => (
  <RegistrosProvider>
    <ProcessosInner opportunityId={opportunityId} />
  </RegistrosProvider>
);

export default OpportunityProcessosCard;
