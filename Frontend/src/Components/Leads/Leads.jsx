import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { API_URL } from "../../Api";
import styles from "./Leads.module.css";
import LeadDetailModal from "./LeadDetailModal";
import { useLocation, useNavigate } from "react-router-dom";

const CreateLeadModal = ({ show, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    cargo: "",
    origem: "website",
    valor_estimado: 0,
    descricao: "",
  });

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
      const response = await fetch(`${API_URL}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (data.success) {
        setFormData({
          nome: "",
          email: "",
          telefone: "",
          empresa: "",
          cargo: "",
          origem: "website",
          valor_estimado: 0,
          descricao: "",
        });
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error("Erro ao criar prospecto:", error);
      alert("Erro ao criar prospecto");
    }
  };

  if (!show) return null;

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Novo Prospecto</h3>
          <button onClick={onClose} className={styles.closeBtn}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label htmlFor="lead-nome">Nome *</label>
            <input
              id="lead-nome"
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              required
              placeholder="Nome completo"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="lead-email">Email *</label>
            <input
              id="lead-email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="email@exemplo.com"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="lead-telefone">Telefone</label>
            <input
              id="lead-telefone"
              type="tel"
              name="telefone"
              value={formData.telefone}
              onChange={handleChange}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="lead-empresa">Empresa</label>
            <input
              id="lead-empresa"
              type="text"
              name="empresa"
              value={formData.empresa}
              onChange={handleChange}
              placeholder="Nome da empresa"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="lead-cargo">Cargo</label>
            <input
              id="lead-cargo"
              type="text"
              name="cargo"
              value={formData.cargo}
              onChange={handleChange}
              placeholder="Cargo na empresa"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="lead-origem">Origem</label>
            <select
              id="lead-origem"
              name="origem"
              value={formData.origem}
              onChange={handleChange}
            >
              <option value="website">Website</option>
              <option value="linkedin">LinkedIn</option>
              <option value="referencia">Referência</option>
              <option value="evento">Evento</option>
              <option value="email">Email</option>
              <option value="telefone">Telefone</option>
              <option value="midia-social">Mídia Social</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="lead-valor">Valor Estimado</label>
            <input
              id="lead-valor"
              type="number"
              name="valor_estimado"
              value={formData.valor_estimado}
              onChange={handleChange}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="lead-descricao">Descrição</label>
            <textarea
              id="lead-descricao"
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              placeholder="Informações adicionais sobre o lead"
              rows="3"
            />
          </div>
          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={onClose}
              className={styles.btnCancel}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.btnSave}>
              Criar Prospecto
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

CreateLeadModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

const Leads = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 50,
        ...(searchTerm && { search: searchTerm }),
      });
      const response = await fetch(`${API_URL}/api/leads?${params}`);
      const data = await response.json();
      setLeads(data.leads || []);
      setTotalPages(data.pages || 1);
    } catch (error) {
      console.error("Erro ao buscar leads:", error);
    }
    setLoading(false);
  }, [page, searchTerm]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    if (location.state?.openCreate) {
      setShowModal(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const handleConvertToOpp = async (leadId) => {
    if (!globalThis.confirm("Converter este prospecto em oportunidade?"))
      return;

    try {
      const response = await fetch(
        `${API_URL}/api/leads/${leadId}/convert-to-opp`,
        {
          method: "POST",
        },
      );
      const data = await response.json();
      if (data.success) {
        alert("Prospecto convertido para oportunidade com sucesso!");
        fetchLeads();
      }
    } catch (error) {
      console.error("Erro ao converter prospecto:", error);
      alert("Erro ao converter prospecto");
    }
  };

  const handleGenerateBpmn = async (leadId) => {
    try {
      const response = await fetch(
        `${API_URL}/api/leads/${leadId}/generate-bpmn`,
        {
          method: "POST",
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Erro ao gerar Fluxograma com IA");
      }

      if (data.success) {
        alert(
          "Fluxograma gerado com sucesso! Agora você pode converter em oportunidade.",
        );
        fetchLeads();
      }
    } catch (error) {
      console.error("Erro ao gerar BPMN:", error);
      alert(error?.message || "Erro ao gerar Fluxograma com IA");
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!globalThis.confirm("Deletar este prospecto?")) return;

    try {
      const response = await fetch(`${API_URL}/api/leads/${leadId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchLeads();
      }
    } catch (error) {
      console.error("Erro ao deletar prospecto:", error);
      alert("Erro ao deletar prospecto");
    }
  };

  const handleOpenDetail = (lead) => {
    setSelectedLead(lead);
    setShowDetailModal(true);
  };

  const getStageColor = (stage) => {
    const colors = {
      novo: "#3b82f6",
      qualificado: "#10b981",
      em_contato: "#f59e0b",
      convertido: "#8b5cf6",
      perdido: "#ef4444",
    };
    return colors[stage] || "#6b7280";
  };

  let leadsContent;
  if (loading) {
    leadsContent = (
      <div className={styles.state}>
        <div className={styles.spinner}></div>
        <p>Carregando prospectos...</p>
      </div>
    );
  } else if (leads.length === 0) {
    leadsContent = (
      <div className={styles.state}>
        <span className={styles.emptyIcon}>📭</span>
        <p>Nenhum prospecto encontrado</p>
      </div>
    );
  } else {
    leadsContent = (
      <>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Empresa</th>
                <th>Origem</th>
                <th>Stage</th>
                <th>Valor Est.</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => handleOpenDetail(lead)}
                  style={{ cursor: "pointer" }}
                >
                  <td className={styles.nameCell}>
                    <div>
                      <div className={styles.leadName}>{lead.nome}</div>
                      <div className={styles.leadCargo}>{lead.cargo}</div>
                    </div>
                  </td>
                  <td>
                    <a
                      href={`mailto:${lead.email}`}
                      className={styles.emailLink}
                    >
                      {lead.email}
                    </a>
                  </td>
                  <td>{lead.empresa || "-"}</td>
                  <td>
                    <span className={styles.badge} title={lead.origem}>
                      {lead.origem || "-"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={styles.stageBadge}
                      style={{ backgroundColor: getStageColor(lead.stage) }}
                      title={lead.stage}
                    >
                      {lead.stage}
                    </span>
                  </td>
                  <td>
                    {lead.valor_estimado
                      ? `R$ ${lead.valor_estimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "-"}
                  </td>
                  <td className={styles.actionsCell}>
                    {lead.stage !== "convertido" && (
                      <>
                        {!lead.bpmn_generated && (
                          <button
                            className={styles.btnBpmn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateBpmn(lead.id);
                            }}
                            title="Gerar Fluxograma com IA"
                          >
                            AI
                          </button>
                        )}

                        <button
                          className={styles.btnConvert}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConvertToOpp(lead.id);
                          }}
                          title={
                            lead.bpmn_generated
                              ? "Converter para oportunidade"
                              : "Gere o Fluxograma com IA antes de converter"
                          }
                          disabled={!lead.bpmn_generated}
                        >
                          ➜
                        </button>
                      </>
                    )}
                    <button
                      className={styles.btnDelete}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLead(lead.id);
                      }}
                      title="Deletar prospecto"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.paginationBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Anterior
            </button>
            <span className={styles.pageInfo}>
              Página {page} de {totalPages}
            </span>
            <button
              className={styles.paginationBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Próxima →
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Prospectos</h1>
          <p className={styles.subtitle}>
            Gerencie seus prospectos e qualifique vendas
          </p>
        </div>
        <button className={styles.newBtn} onClick={() => setShowModal(true)}>
          + Novo Prospecto
        </button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por nome, email ou empresa..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {leadsContent}

      <CreateLeadModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={fetchLeads}
      />

      <LeadDetailModal
        lead={selectedLead}
        show={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onActivityAdded={fetchLeads}
      />
    </div>
  );
};

export default Leads;
