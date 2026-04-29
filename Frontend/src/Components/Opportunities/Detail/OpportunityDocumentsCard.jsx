import React from "react";
import styles from "./OpportunityDocumentsCard.module.css";
import {
  DOCUMENTOS_LIST,
  DOCUMENTO_CREATE,
  DOCUMENTO_UPDATE,
  DOCUMENTO_DELETE,
  API_URL,
  REGISTROS_GET,
  REGISTROS_POST,
  REGISTROS_PUT,
} from "../../../Api";
import { getAuthToken } from "../opportunityApi";
import { EntidadesContext } from "../../../Context/EntidadesContext";

const EMPTY_DOC = () => ({
  documentTitle: "",
  documentType: "",
  header: { fields: [] },
  sections: [{ heading: "Descrição", body: "" }],
  footer: "",
  signatureFields: [],
});

const normalizeLabel = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const buildHeaderFieldsFromInfoRow = (infoRows, stageLabel) => {
  if (!Array.isArray(infoRows) || !stageLabel) return [];
  const normalized = normalizeLabel(stageLabel);
  const row = infoRows.find((r) => normalizeLabel(r?.label) === normalized);
  if (!row || !Array.isArray(row.campos) || row.campos.length === 0) return [];
  return row.campos
    .filter(
      (c) =>
        String(c?.nome || "").trim() && normalizeLabel(c?.nome) !== "descricao",
    )
    .map((c) => ({
      label: String(c.nome).trim(),
      value: "",
      _isCampo: true,
      _tipo: String(c?.tipo || "Texto").trim(),
      _obrigatorio: c?.obrigatorio === true,
      _keyType: String(c?.keyType || "NORMAL")
        .trim()
        .toUpperCase(),
    }));
};

const buildDescriptionFromInfoRow = (infoRows, stageLabel) => {
  if (!Array.isArray(infoRows) || !stageLabel) return "";
  const normalized = normalizeLabel(stageLabel);
  const row = infoRows.find((r) => normalizeLabel(r?.label) === normalized);
  const raw = String(row?.value || "").trim();
  if (!raw) return "";

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const descLine = lines.find((line) => /^Descri[cç][aã]o\s*:/i.test(line));
  if (!descLine) return "";
  return String(descLine.replace(/^Descri[cç][aã]o\s*:\s*/i, "")).trim();
};

const getStageTypeLabel = (stageType) => {
  switch (String(stageType || "").toLowerCase()) {
    case "entidade":
    case "entity":
      return "Entidade";
    case "task":
      return "Tarefa";
    case "condicional":
    case "conditional":
      return "Condição";
    default:
      return "Atividade";
  }
};

const buildDefaultSections = (infoRows, stageLabel, stageObj = null) => {
  const description = buildDescriptionFromInfoRow(infoRows, stageLabel);

  // Extrai "Atributo chave" do infoRow para usar como Referência
  let referencia = "";
  if (Array.isArray(infoRows) && stageLabel) {
    const normalized = normalizeLabel(stageLabel);
    const row = infoRows.find((r) => normalizeLabel(r?.label) === normalized);
    const raw = String(row?.value || "");
    const line = raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /^Atributo\s*chave\s*:/i.test(l));
    if (line) referencia = line.replace(/^Atributo\s*chave\s*:\s*/i, "").trim();
  }

  const sections = [];
  if (referencia) sections.push({ heading: "Referência", body: referencia });
  sections.push({ heading: "Descrição", body: description });
  return sections;
};

const getInputTypeForTipo = (tipo) => {
  switch (String(tipo || "").trim()) {
    case "Número":
      return "number";
    case "Data":
      return "date";
    case "Email":
      return "email";
    case "Telefone":
      return "tel";
    default:
      return "text";
  }
};

const OpportunityDocumentsCard = ({
  opportunityId,
  ownerName = "",
  isReadOnlyMode = false,
  activeStageLabel = null,
  stages = [],
  infoRows = [],
  onDocumentSaved = null,
  onFormChange = null,
  onSaveComplete = null,
}) => {
  const { entidades } = React.useContext(EntidadesContext);
  const [docs, setDocs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  // activeDoc === null → modo "novo"; activeDoc.id → modo "editar existente"
  const [activeDoc, setActiveDoc] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY_DOC());
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState(null);
  const [fieldErrors, setFieldErrors] = React.useState({});

  // Notificar parent sempre que form ou activeDoc mudar
  React.useEffect(() => {
    if (onFormChange) onFormChange(form, activeDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, activeDoc]);

  const activeStageType = React.useMemo(() => {
    const stageLabel = String(activeStageLabel || "")
      .trim()
      .toLowerCase();
    if (!stageLabel) return null;
    const stage = (Array.isArray(stages) ? stages : []).find(
      (s) =>
        String(s?.label || "")
          .trim()
          .toLowerCase() === stageLabel,
    );
    return stage?.stageType || null;
  }, [activeStageLabel, stages]);

  const activeStage = React.useMemo(() => {
    const label = String(activeStageLabel || "")
      .trim()
      .toLowerCase();
    if (!label) return null;
    return (
      (Array.isArray(stages) ? stages : []).find(
        (s) =>
          String(s?.label || "")
            .trim()
            .toLowerCase() === label,
      ) || null
    );
  }, [activeStageLabel, stages]);

  const processEntity = React.useMemo(() => {
    // Condicional and task stages are treated as activities, not entities
    if (activeStageType === "condicional" || activeStageType === "task")
      return null;

    const stageLabel = String(activeStageLabel || "")
      .trim()
      .toLowerCase();
    if (!stageLabel) return null;

    const catalog = Array.isArray(entidades) ? entidades : [];
    return (
      catalog.find((entity) => {
        const entityName = String(entity?.nome || "")
          .trim()
          .toLowerCase();
        return entityName && entityName === stageLabel;
      }) || null
    );
  }, [activeStageLabel, activeStageType, entidades]);

  const upsertProcessRegistro = React.useCallback(
    async ({ title, status }) => {
      if (!processEntity) return;
      const token = getAuthToken();
      if (!token) return;

      const payload = {
        entidadeId: processEntity.id,
        entidadeNome: processEntity.nome,
        papelNegocio: String(processEntity.papelNegocio || "processo"),
        titulo: title,
        dados: {
          status,
          oportunidadeId: String(opportunityId || ""),
          etapa: String(activeStageLabel || ""),
          tipoDocumento: String(form.documentType || "").trim(),
          descricao:
            form.sections
              ?.map((s) => `${s.heading ? `${s.heading}: ` : ""}${s.body}`)
              .filter(Boolean)
              .join("\n") || "",
        },
        criadoPor: localStorage.getItem("user_id") || ownerName || "sistema",
      };

      const getReq = REGISTROS_GET(
        token,
        String(processEntity.papelNegocio || "processo"),
        String(processEntity.id),
      );
      const getRes = await fetch(getReq.url, getReq.options);
      const existing = getRes.ok ? await getRes.json() : [];

      const match = (Array.isArray(existing) ? existing : []).find(
        (registro) => {
          const sameOpportunity =
            String(registro?.dados?.oportunidadeId || "") ===
            String(opportunityId || "");
          const sameStage =
            String(registro?.dados?.etapa || "")
              .trim()
              .toLowerCase() ===
            String(activeStageLabel || "")
              .trim()
              .toLowerCase();
          return sameOpportunity && sameStage;
        },
      );

      if (match?.id !== undefined && match?.id !== null) {
        const putReq = REGISTROS_PUT(match.id, payload, token);
        await fetch(putReq.url, putReq.options);
        return;
      }

      const postReq = REGISTROS_POST(payload, token);
      await fetch(postReq.url, postReq.options);
    },
    [
      activeStageLabel,
      form.documentType,
      form.sections,
      opportunityId,
      ownerName,
      processEntity,
    ],
  );

  const createActivityFallback = React.useCallback(
    ({ title, status }) => {
      fetch(`${API_URL}/api/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: title,
          descricao:
            form.sections
              ?.map((s) => `${s.heading ? `${s.heading}: ` : ""}${s.body}`)
              .filter(Boolean)
              .join("\n") || null,
          tipo: "task",
          status,
          entidade_tipo: "oportunidade",
          entidade_id: String(opportunityId || ""),
          usuario_criador:
            localStorage.getItem("user_id") || ownerName || "sistema",
          tags: form.documentType ? [form.documentType] : [],
        }),
      }).catch(() => {
        /* silent */
      });
    },
    [form.documentType, form.sections, opportunityId, ownerName],
  );

  // ── Load docs for this opportunity ──
  const fetchDocs = React.useCallback(async () => {
    if (!opportunityId) return;
    const token = getAuthToken();
    if (!token) return;
    setLoading(true);
    try {
      const req = DOCUMENTOS_LIST(token, "", opportunityId);
      const res = await fetch(req.url, req.options);
      if (res.ok) {
        const json = await res.json();
        setDocs(json.data || []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  React.useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // ── Sync editor with active pipeline step ──
  React.useEffect(() => {
    if (!activeStageLabel) return;
    const preFields = buildHeaderFieldsFromInfoRow(infoRows, activeStageLabel);
    const preSections = buildDefaultSections(
      infoRows,
      activeStageLabel,
      activeStage,
    );
    // Sempre prioriza o template do cadastro da etapa ativa.
    setActiveDoc(null);
    setForm({
      ...EMPTY_DOC(),
      documentTitle: activeStageLabel,
      header: { fields: preFields },
      sections: preSections,
    });
  }, [activeStageLabel, infoRows, activeStage]);

  // ── Helpers ──
  const updateField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const updateHeaderField = (i, key, value) =>
    setForm((p) => {
      const fields = [...(p.header?.fields || [])];
      fields[i] = { ...fields[i], [key]: value };
      return { ...p, header: { ...p.header, fields } };
    });

  const addHeaderField = () =>
    setForm((p) => ({
      ...p,
      header: {
        ...p.header,
        fields: [...(p.header?.fields || []), { label: "", value: "" }],
      },
    }));

  const removeHeaderField = (i) =>
    setForm((p) => ({
      ...p,
      header: {
        ...p.header,
        fields: p.header.fields.filter((_, idx) => idx !== i),
      },
    }));

  const updateSection = (i, key, value) =>
    setForm((p) => {
      const sections = [...p.sections];
      sections[i] = { ...sections[i], [key]: value };
      return { ...p, sections };
    });

  const addSection = () =>
    setForm((p) => ({
      ...p,
      sections: [...p.sections, { heading: "", body: "" }],
    }));

  const removeSection = (i) =>
    setForm((p) => ({
      ...p,
      sections: p.sections.filter((_, idx) => idx !== i),
    }));

  // ── Actions ──
  const loadNew = () => {
    const preFields = buildHeaderFieldsFromInfoRow(infoRows, activeStageLabel);
    const preSections = buildDefaultSections(
      infoRows,
      activeStageLabel,
      activeStage,
    );
    setForm({
      ...EMPTY_DOC(),
      documentTitle: activeStageLabel || "",
      header: { fields: preFields },
      sections: preSections,
    });
    setActiveDoc(null);
  };

  const loadDoc = (doc) => {
    const loadedSections = JSON.parse(JSON.stringify(doc.sections || []));
    const hasDescricao = loadedSections.some(
      (section) => normalizeLabel(section?.heading) === "descricao",
    );

    const defaultDescription = buildDescriptionFromInfoRow(
      infoRows,
      activeStageLabel,
    );

    setForm({
      documentTitle: doc.documentTitle || "",
      documentType: doc.documentType || "",
      header: JSON.parse(JSON.stringify(doc.header || { fields: [] })),
      sections: hasDescricao
        ? loadedSections
        : [
            { heading: "Descrição", body: defaultDescription },
            ...loadedSections,
          ],
      footer: doc.footer || "",
      signatureFields: [...(doc.signatureFields || [])],
    });
    setActiveDoc(doc);
  };

  const handleSelectChange = (e) => {
    const val = e.target.value;
    if (val === "") {
      loadNew();
    } else {
      const doc = docs.find((d) => String(d.id) === val);
      if (doc) loadDoc(doc);
    }
  };

  const save = async () => {
    const token = getAuthToken();
    if (!token) return;
    // Validar campos obrigatórios
    const errors = {};
    (form.header?.fields || []).forEach((f, i) => {
      if (f._isCampo && f._obrigatorio && !String(f.value || "").trim()) {
        errors[i] = `"${f.label}" é obrigatório`;
      }
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      if (!activeDoc) {
        // criar novo
        const req = DOCUMENTO_CREATE(
          { ...form, opportunityId, owner: ownerName },
          token,
        );
        const res = await fetch(req.url, req.options);
        if (res.ok) {
          const created = await res.json();
          setDocs((p) => [created, ...p]);
          loadDoc(created); // permanece no editor com o doc recém-criado
          if (processEntity) {
            await upsertProcessRegistro({
              title: form.documentTitle || "Novo tópico",
              status: "planejado",
            });
          } else {
            createActivityFallback({
              title: form.documentTitle || "Novo tópico",
              status: "planejado",
            });
          }
          // Notificar que um documento foi criado
          if (onDocumentSaved) {
            onDocumentSaved({
              action: "created",
              title: form.documentTitle || "Novo tópico",
            });
          }
          // Em criação também deve avançar para o próximo passo.
          if (onSaveComplete) {
            onSaveComplete();
          }
        }
      } else {
        // atualizar existente
        const req = DOCUMENTO_UPDATE(activeDoc.id, form, token);
        const res = await fetch(req.url, req.options);
        if (res.ok) {
          const updated = await res.json();
          setDocs((p) => p.map((d) => (d.id === updated.id ? updated : d)));
          setActiveDoc(updated);
          if (processEntity) {
            await upsertProcessRegistro({
              title: form.documentTitle || "Tópico",
              status: "concluido",
            });
          } else {
            createActivityFallback({
              title: form.documentTitle || "Tópico",
              status: "concluido",
            });
          }
          // Notificar que um documento foi atualizado
          if (onDocumentSaved) {
            onDocumentSaved({
              action: "updated",
              title: form.documentTitle || "Tópico",
            });
          }
          // Notificar que salvou com sucesso (para resetar resumo e avançar passo)
          if (onSaveComplete) {
            onSaveComplete();
          }
        }
      }
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeDoc) return;
    if (!window.confirm("Excluir este tópico?")) return;
    const token = getAuthToken();
    if (!token) return;
    setDeletingId(activeDoc.id);
    try {
      const req = DOCUMENTO_DELETE(activeDoc.id, token);
      const res = await fetch(req.url, req.options);
      if (res.ok) {
        setDocs((p) => p.filter((d) => d.id !== activeDoc.id));
        loadNew();
      }
    } catch {
      /* silent */
    } finally {
      setDeletingId(null);
    }
  };

  const handlePrint = (doc) => {
    const esc = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const now = new Date().toLocaleString("pt-BR");
    const headerFieldsHtml = (doc.header?.fields || [])
      .map(
        (f) =>
          `<tr><td style="font-weight:600;padding:4px 12px 4px 0;color:#374151;white-space:nowrap">${esc(f.label)}</td><td style="padding:4px 0;color:#1a1a1a">${esc(f.value)}</td></tr>`,
      )
      .join("");
    const sectionsHtml = (doc.sections || [])
      .map(
        (s) =>
          `<div class="section"><h2>${esc(s.heading)}</h2><p>${esc(s.body)}</p></div>`,
      )
      .join("");
    const signaturesHtml = (doc.signatureFields || [])
      .map(
        (s) =>
          `<div class="signature-block"><div class="signature-line"></div><span>${esc(s)}</span></div>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(doc.documentTitle)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:48px auto;color:#1a1a1a;font-size:11pt;line-height:1.7}
.letterhead{display:flex;align-items:center;gap:1rem;border-bottom:2px solid #1e9158;padding-bottom:.75rem;margin-bottom:.5rem}
.letterhead-brand{font-family:Arial,sans-serif;font-size:.8rem;font-weight:700;color:#1e9158;letter-spacing:.05em;text-transform:uppercase}
.letterhead-sub{font-family:Arial,sans-serif;font-size:.7rem;color:#888}
.doc-type{font-family:Arial,sans-serif;font-size:.7rem;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.15rem}
h1{font-family:Arial,sans-serif;font-size:1.45rem;color:#111;margin-bottom:.15rem;font-weight:700}
.doc-meta{font-family:Arial,sans-serif;font-size:.78rem;color:#666;margin-bottom:1.2rem}
.header-table{width:100%;border-collapse:collapse;margin-bottom:1.4rem;border:1px solid #e5e7eb;border-radius:4px}
.header-table td{font-size:.88rem;border-bottom:1px solid #f3f4f6}
.section{margin-bottom:1.3rem}.section h2{font-family:Arial,sans-serif;font-size:.95rem;font-weight:700;color:#1e9158;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.4rem;border-bottom:1px solid #d1fae5;padding-bottom:.2rem}
.section p{font-size:10.5pt;white-space:pre-wrap}
.footer-text{margin-top:2rem;font-family:Arial,sans-serif;font-size:.72rem;color:#aaa;border-top:1px solid #eee;padding-top:.5rem}
.signatures{display:flex;gap:3rem;justify-content:center;margin-top:3rem;flex-wrap:wrap}
.signature-block{text-align:center;min-width:180px}.signature-line{border-top:1px solid #aaa;margin-bottom:.3rem;width:100%}
.signature-block span{font-family:Arial,sans-serif;font-size:.8rem;color:#555}
@media print{body{margin:24px 32px}}</style></head><body>
<div class="letterhead"><div><div class="letterhead-brand">BP-Company</div><div class="letterhead-sub">Sistema de Gestão de Processos</div></div></div>
${doc.documentType ? `<div class="doc-type">${esc(doc.documentType)}</div>` : ""}
<h1>${esc(doc.documentTitle)}</h1><div class="doc-meta">Emitido em: ${now}</div>
${headerFieldsHtml ? `<table class="header-table">${headerFieldsHtml}</table>` : ""}
${sectionsHtml}
${signaturesHtml ? `<div class="signatures">${signaturesHtml}</div>` : ""}
<div class="footer-text">${esc(doc.footer || "Documento gerado automaticamente · BP-Company")} · ${now}</div>
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win)
      win.addEventListener("load", () => {
        win.print();
        URL.revokeObjectURL(url);
      });
    else URL.revokeObjectURL(url);
  };

  // ── Editor (sempre visível) ──
  return (
    <div className={styles.card}>
      {/* Barra superior: seletor de tópico + ações */}
      <div className={styles.editorHeader}>
        <select
          id="documentSelector"
          name="documentSelector"
          className={styles.docSelect}
          value={activeDoc ? String(activeDoc.id) : ""}
          onChange={handleSelectChange}
          disabled={loading}
        >
          <option value="">+ Novo tópico</option>
          {docs
            .filter((d) =>
              stages.some(
                (s) =>
                  (s?.label || "").trim().toLowerCase() ===
                  (d.documentTitle || "").trim().toLowerCase(),
              ),
            )
            .map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.documentTitle || "Sem título"}
                {d.documentType ? ` — ${d.documentType}` : ""}
              </option>
            ))}
        </select>

        <div className={styles.editorHeaderActions}>
          {activeDoc && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => handlePrint(activeDoc)}
              title="Imprimir / PDF"
            >
              🖨️
            </button>
          )}
          {activeDoc && !isReadOnlyMode && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={handleDelete}
              disabled={deletingId === activeDoc?.id}
              title="Excluir tópico"
            >
              {deletingId === activeDoc?.id ? "..." : "🗑️"}
            </button>
          )}
        </div>
      </div>

      <div className={styles.editorBody}>
        {/* Título */}
        <input
          type="text"
          id="documentTitle"
          name="documentTitle"
          className={styles.titleInput}
          value={form.documentTitle}
          onChange={(e) => updateField("documentTitle", e.target.value)}
          placeholder="Título do tópico"
          disabled={isReadOnlyMode}
        />

        {/* Tipo */}
        <input
          type="text"
          id="documentType"
          name="documentType"
          className={styles.typeInput}
          value={form.documentType}
          onChange={(e) => updateField("documentType", e.target.value)}
          placeholder="Tipo (ex: Contrato, Proposta...)"
          disabled={isReadOnlyMode}
        />

        {/* Campos de cabeçalho */}
        <table className={styles.headerTable}>
          <tbody>
            {(form.header?.fields || []).map((f, i) => {
              const isCampo = f._isCampo === true;
              const inputType = isCampo ? getInputTypeForTipo(f._tipo) : "text";
              const isBooleano = isCampo && f._tipo === "Booleano";
              const keyBadge =
                isCampo && f._keyType !== "NORMAL" ? f._keyType : null;
              const hasError = !!fieldErrors[i];
              return (
                <tr key={i}>
                  <td className={styles.headerLabel}>
                    <div className={styles.fieldLabelRow}>
                      {isCampo ? (
                        <span
                          className={`${styles.inlineLabelStatic} ${hasError ? styles.inlineLabelError : ""}`}
                        >
                          {f.label}
                          {f._obrigatorio && (
                            <span
                              className={styles.requiredStar}
                              title="Obrigatório"
                            >
                              *
                            </span>
                          )}
                          {keyBadge && (
                            <span
                              className={styles.keyBadge}
                              data-key={keyBadge}
                            >
                              {keyBadge}
                            </span>
                          )}
                        </span>
                      ) : (
                        <input
                          type="text"
                          id={`header-field-label-${i}`}
                          name={`header-field-label-${i}`}
                          className={styles.inlineInput}
                          value={f.label}
                          onChange={(e) =>
                            updateHeaderField(i, "label", e.target.value)
                          }
                          placeholder="Campo"
                          disabled={isReadOnlyMode}
                        />
                      )}
                    </div>
                  </td>
                  <td className={styles.headerValue}>
                    {isBooleano ? (
                      <select
                        id={`header-field-${i}-select`}
                        name={`header-field-${i}`}
                        className={`${styles.inlineInput} ${hasError ? styles.inlineInputError : ""}`}
                        value={f.value}
                        onChange={(e) => {
                          updateHeaderField(i, "value", e.target.value);
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n[i];
                            return n;
                          });
                        }}
                        disabled={isReadOnlyMode}
                        required={f._obrigatorio}
                      >
                        <option value="">— selecione —</option>
                        <option value="Sim">Sim</option>
                        <option value="Não">Não</option>
                      </select>
                    ) : (
                      <input
                        type={inputType}
                        id={`header-field-${i}`}
                        name={`header-field-${i}`}
                        className={`${styles.inlineInput} ${hasError ? styles.inlineInputError : ""}`}
                        value={f.value}
                        onChange={(e) => {
                          updateHeaderField(i, "value", e.target.value);
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n[i];
                            return n;
                          });
                        }}
                        placeholder={
                          isCampo
                            ? `${f._tipo}${f._obrigatorio ? " (obrigatório)" : ""}`
                            : "Valor"
                        }
                        disabled={isReadOnlyMode}
                        required={isCampo && f._obrigatorio}
                      />
                    )}
                    {hasError && (
                      <div className={styles.fieldErrorMsg}>
                        {fieldErrors[i]}
                      </div>
                    )}
                  </td>
                  {!isReadOnlyMode && (
                    <td className={styles.removeTd}>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => {
                          removeHeaderField(i);
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n[i];
                            return n;
                          });
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isReadOnlyMode && (
          <button
            type="button"
            className={styles.addFieldBtn}
            onClick={addHeaderField}
          >
            + Adicionar campo
          </button>
        )}

        {/* Seções */}
        <div className={styles.sections}>
          {form.sections.map((s, i) => (
            <div key={i} className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <input
                  type="text"
                  id={`section-heading-${i}`}
                  name={`section-heading-${i}`}
                  className={styles.sectionTitleInput}
                  value={s.heading}
                  onChange={(e) => updateSection(i, "heading", e.target.value)}
                  placeholder={`${i + 1}. Título da seção`}
                  disabled={isReadOnlyMode}
                />
                {!isReadOnlyMode && (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeSection(i)}
                  >
                    ✕
                  </button>
                )}
              </div>
              <textarea
                id={`section-body-${i}`}
                name={`section-body-${i}`}
                className={styles.sectionBody}
                value={s.body}
                onChange={(e) => updateSection(i, "body", e.target.value)}
                placeholder="Conteúdo da seção..."
                rows={4}
                disabled={isReadOnlyMode}
              />
            </div>
          ))}
          {!isReadOnlyMode && (
            <button
              type="button"
              className={styles.addSectionBtn}
              onClick={addSection}
            >
              + Adicionar seção
            </button>
          )}
        </div>
      </div>

      {!isReadOnlyMode && (
        <div className={styles.editorFooter}>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={save}
            disabled={saving}
          >
            {saving
              ? "Salvando..."
              : activeDoc
                ? "Salvar alterações"
                : "Criar tópico"}
          </button>
          {activeDoc && (
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={loadNew}
            >
              Novo
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default OpportunityDocumentsCard;
