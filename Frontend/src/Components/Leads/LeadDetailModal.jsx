import React, { useState, useEffect } from "react";
import { API_URL } from "../../Api";
import styles from "./LeadDetailModal.module.css";
import LeadInsightsPanel from "./LeadInsightsPanel";
import { getAuthToken } from "../Opportunities/opportunityApi";

const LeadDetailModal = ({ lead, show, onClose, onActivityAdded }) => {
  const [formData, setFormData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [insights, setInsights] = useState(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);

  useEffect(() => {
    if (lead) {
      setFormData({ ...lead });
    }
  }, [lead]);

  if (!show || !formData) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "valor_estimado" ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/leads/${formData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (data.success) {
        alert("Prospecto atualizado com sucesso!");
        onActivityAdded?.();
      }
    } catch (error) {
      console.error("Erro ao atualizar prospecto:", error);
      alert("Erro ao atualizar prospecto");
    } finally {
      setIsSaving(false);
    }
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

  const handleAnalyzeWithAI = async () => {
    if (!formData?.id) {
      alert("Prospecto inválido para análise.");
      return;
    }

    setIsLoadingInsights(true);
    setInsights(null);
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(
          "Sessão expirada. Faça login novamente para usar a análise de IA.",
        );
      }

      const analysisRes = await fetch(`${API_URL}/ai/analyze-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lead: formData,
          activities: [],
        }),
      });

      if (!analysisRes.ok) {
        let detail = "Erro ao analisar prospecto com IA";
        try {
          const errJson = await analysisRes.json();
          if (typeof errJson?.detail === "string") {
            detail = errJson.detail;
          }
        } catch {
          // no-op
        }
        throw new Error(detail);
      }

      const analysisData = await analysisRes.json();
      setInsights(analysisData);
    } catch (error) {
      console.error("Erro ao analisar prospecto:", error);
      alert(error?.message || "Erro ao analisar prospecto com IA");
    } finally {
      setIsLoadingInsights(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{formData.nome}</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.infoSection}>
            <h3>Informações Gerais</h3>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Nome</label>
                <input
                  type="text"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Telefone</label>
                <input
                  type="tel"
                  name="telefone"
                  value={formData.telefone || ""}
                  onChange={handleChange}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Empresa</label>
                <input
                  type="text"
                  name="empresa"
                  value={formData.empresa || ""}
                  onChange={handleChange}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Cargo</label>
                <input
                  type="text"
                  name="cargo"
                  value={formData.cargo || ""}
                  onChange={handleChange}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Origem</label>
                <select
                  name="origem"
                  value={formData.origem || "website"}
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
                <label>Stage</label>
                <select
                  name="stage"
                  value={formData.stage || "novo"}
                  onChange={handleChange}
                >
                  <option value="novo">Novo</option>
                  <option value="qualificado">Qualificado</option>
                  <option value="em_contato">Em Contato</option>
                  <option value="convertido">Convertido</option>
                  <option value="perdido">Perdido</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Valor Estimado</label>
                <input
                  type="number"
                  name="valor_estimado"
                  value={formData.valor_estimado || 0}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Descrição</label>
              <textarea
                name="descricao"
                value={formData.descricao || ""}
                onChange={handleChange}
                rows="4"
              />
            </div>

            <div className={styles.metadata}>
              <div className={styles.metaItem}>
                <strong>Criado em:</strong>{" "}
                {new Date(formData.data_criacao).toLocaleString("pt-BR")}
              </div>
              <div className={styles.metaItem}>
                <strong>Responsável:</strong> {formData.responsavel || "-"}
              </div>
            </div>
          </div>

          <LeadInsightsPanel
            insights={insights}
            isLoading={isLoadingInsights}
          />
        </div>

        <div className={styles.footer}>
          <button
            onClick={handleAnalyzeWithAI}
            className={styles.btnAnalyze}
            disabled={isLoadingInsights}
          >
            {isLoadingInsights ? "Analisando..." : "🤖 Analisar com IA"}
          </button>
          <button onClick={onClose} className={styles.btnCancel}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className={styles.btnSave}
            disabled={isSaving}
          >
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeadDetailModal;
