import React from 'react';
import { useLocation } from 'react-router-dom';
import styles from './Documentos.module.css';
import { DOCUMENTOS_LIST, DOCUMENTO_DELETE, DOCUMENTO_UPDATE } from '../../Api';
import { getAuthToken } from '../Opportunities/opportunityApi';
import { UserContext } from '../../Context/UserContext';

const Documentos = () => {
  const { user } = React.useContext(UserContext);
  const location = useLocation();
  const [docs, setDocs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedDoc, setSelectedDoc] = React.useState(null);
  const [deletingId, setDeletingId] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [editData, setEditData] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  const ownerName = user?.nome || user?.username || '';

  const fetchDocs = React.useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    setLoading(true);
    try {
      const req = DOCUMENTOS_LIST(token, ownerName);
      const res = await fetch(req.url, req.options);
      if (res.ok) {
        const json = await res.json();
        setDocs(json.data || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [ownerName]);

  React.useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Auto-open document from navigation state (only once)
  const openDocHandled = React.useRef(false);
  React.useEffect(() => {
    const openId = location.state?.openDocId;
    if (openId && docs.length > 0 && !openDocHandled.current) {
      const doc = docs.find((d) => d.id === openId);
      if (doc) {
        setSelectedDoc(doc);
        openDocHandled.current = true;
      }
    }
  }, [docs, location.state]);

  const handleDelete = async (docId) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;
    const token = getAuthToken();
    if (!token) return;
    setDeletingId(docId);
    try {
      const req = DOCUMENTO_DELETE(docId, token);
      const res = await fetch(req.url, req.options);
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
        if (selectedDoc?.id === docId) setSelectedDoc(null);
      }
    } catch { /* silent */ } finally {
      setDeletingId(null);
    }
  };

  const handleStartEdit = () => {
    if (!selectedDoc) return;
    setEditData({
      documentTitle: selectedDoc.documentTitle || '',
      documentType: selectedDoc.documentType || '',
      header: JSON.parse(JSON.stringify(selectedDoc.header || { fields: [] })),
      sections: JSON.parse(JSON.stringify(selectedDoc.sections || [])),
      footer: selectedDoc.footer || '',
      signatureFields: [...(selectedDoc.signatureFields || [])],
    });
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditData(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedDoc || !editData) return;
    const token = getAuthToken();
    if (!token) return;
    setSaving(true);
    try {
      const req = DOCUMENTO_UPDATE(selectedDoc.id, editData, token);
      const res = await fetch(req.url, req.options);
      if (res.ok) {
        const updated = await res.json();
        setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setSelectedDoc(updated);
        setEditing(false);
        setEditData(null);
      } else {
        alert('Erro ao salvar alterações.');
      }
    } catch {
      alert('Erro ao salvar alterações.');
    } finally {
      setSaving(false);
    }
  };

  const updateEditField = (field, value) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const updateHeaderField = (index, key, value) => {
    setEditData((prev) => {
      const fields = [...(prev.header?.fields || [])];
      fields[index] = { ...fields[index], [key]: value };
      return { ...prev, header: { ...prev.header, fields } };
    });
  };

  const updateSection = (index, key, value) => {
    setEditData((prev) => {
      const sections = [...prev.sections];
      sections[index] = { ...sections[index], [key]: value };
      return { ...prev, sections };
    });
  };

  const addSection = () => {
    setEditData((prev) => ({
      ...prev,
      sections: [...prev.sections, { heading: '', body: '' }],
    }));
  };

  const removeSection = (index) => {
    setEditData((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index),
    }));
  };

  const addHeaderField = () => {
    setEditData((prev) => ({
      ...prev,
      header: { ...prev.header, fields: [...(prev.header?.fields || []), { label: '', value: '' }] },
    }));
  };

  const removeHeaderField = (index) => {
    setEditData((prev) => ({
      ...prev,
      header: { ...prev.header, fields: (prev.header?.fields || []).filter((_, i) => i !== index) },
    }));
  };

  const handlePrint = (doc) => {
    const esc = (s) =>
      String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const now = new Date().toLocaleString('pt-BR');
    const headerFieldsHtml = (doc.header?.fields || [])
      .map((f) => `<tr><td style="font-weight:600;padding:4px 12px 4px 0;color:#374151;white-space:nowrap">${esc(f.label)}</td><td style="padding:4px 0;color:#1a1a1a">${esc(f.value)}</td></tr>`)
      .join('');
    const sectionsHtml = (doc.sections || [])
      .map((s) => `<div class="section"><h2>${esc(s.heading)}</h2><p>${esc(s.body)}</p></div>`)
      .join('');
    const signaturesHtml = (doc.signatureFields || [])
      .map((s) => `<div class="signature-block"><div class="signature-line"></div><span>${esc(s)}</span></div>`)
      .join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(doc.documentTitle)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:48px auto;color:#1a1a1a;font-size:11pt;line-height:1.7}
.letterhead{display:flex;align-items:center;gap:1rem;border-bottom:2px solid #1e9158;padding-bottom:.75rem;margin-bottom:.5rem}
.letterhead-brand{font-family:Arial,sans-serif;font-size:.8rem;font-weight:700;color:#1e9158;letter-spacing:.05em;text-transform:uppercase}
.letterhead-sub{font-family:Arial,sans-serif;font-size:.7rem;color:#888}
.doc-type{font-family:Arial,sans-serif;font-size:.7rem;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.15rem}
h1{font-family:Arial,sans-serif;font-size:1.45rem;color:#111;margin-bottom:.15rem;font-weight:700}
.doc-meta{font-family:Arial,sans-serif;font-size:.78rem;color:#666;margin-bottom:1.2rem}
.header-table{width:100%;border-collapse:collapse;margin-bottom:1.4rem;border:1px solid #e5e7eb;border-radius:4px}
.header-table td{font-size:.88rem;border-bottom:1px solid #f3f4f6}
.section{margin-bottom:1.3rem}
.section h2{font-family:Arial,sans-serif;font-size:.95rem;font-weight:700;color:#1e9158;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.4rem;border-bottom:1px solid #d1fae5;padding-bottom:.2rem}
.section p{font-size:10.5pt;white-space:pre-wrap}
.footer-text{margin-top:2rem;font-family:Arial,sans-serif;font-size:.72rem;color:#aaa;border-top:1px solid #eee;padding-top:.5rem}
.signatures{display:flex;gap:3rem;justify-content:center;margin-top:3rem;flex-wrap:wrap}
.signature-block{text-align:center;min-width:180px}
.signature-line{border-top:1px solid #aaa;margin-bottom:.3rem;width:100%}
.signature-block span{font-family:Arial,sans-serif;font-size:.8rem;color:#555}
@media print{body{margin:24px 32px}}
</style></head><body>
<div class="letterhead"><div><div class="letterhead-brand">BP-Company</div><div class="letterhead-sub">Sistema de Gestão de Processos</div></div></div>
${doc.documentType ? `<div class="doc-type">${esc(doc.documentType)}</div>` : ''}
<h1>${esc(doc.documentTitle)}</h1>
<div class="doc-meta">Emitido em: ${now}</div>
${headerFieldsHtml ? `<table class="header-table">${headerFieldsHtml}</table>` : ''}
${sectionsHtml}
${signaturesHtml ? `<div class="signatures">${signaturesHtml}</div>` : ''}
<div class="footer-text">${esc(doc.footer || 'Documento gerado automaticamente · BP-Company')} &middot; ${now}</div>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => { win.print(); URL.revokeObjectURL(url); });
    } else {
      URL.revokeObjectURL(url);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Documentos</h1>
          <p className={styles.subtitle}>Documentos gerados a partir dos seus processos BPMN.</p>
        </div>
        <div className={styles.headerInfo}>
          <span className={styles.countBadge}>{docs.length} documento{docs.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {loading && <p className={styles.loadingText}>Carregando...</p>}

      {!loading && docs.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📄</div>
          <p className={styles.emptyText}>Nenhum documento salvo.</p>
          <p className={styles.emptyHint}>Gere documentos a partir dos seus workflows na página de Workflows.</p>
        </div>
      )}

      {!loading && docs.length > 0 && (
        <div className={styles.docGrid}>
          {docs.map((doc) => (
            <div
              key={doc.id}
              className={`${styles.docCard} ${selectedDoc?.id === doc.id ? styles.docCardActive : ''}`}
              onClick={() => setSelectedDoc(doc)}
            >
              <div className={styles.docCardHeader}>
                <span className={styles.docCardType}>{doc.documentType || 'Documento'}</span>
                {doc.aiGenerated && <span className={styles.aiBadge}>IA</span>}
              </div>
              <h3 className={styles.docCardTitle}>{doc.documentTitle || 'Sem título'}</h3>
              <div className={styles.docCardMeta}>
                <span>{doc.processName || '—'}</span>
                <span>{formatDate(doc.createdAt)}</span>
              </div>
              <div className={styles.docCardActions}>
                <button
                  type="button"
                  className={`${styles.docCardBtn} ${styles.docCardBtnView}`}
                  title="Visualizar"
                  onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}
                >
                  👁️
                </button>
                <button
                  type="button"
                  className={`${styles.docCardBtn} ${styles.docCardBtnPrint}`}
                  title="Imprimir / PDF"
                  onClick={(e) => { e.stopPropagation(); handlePrint(doc); }}
                >
                  🖨️
                </button>
                <button
                  type="button"
                  className={`${styles.docCardBtn} ${styles.docCardBtnDanger}`}
                  title="Excluir"
                  disabled={deletingId === doc.id}
                  onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                >
                  {deletingId === doc.id ? '...' : '🗑️'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Document preview / edit modal ═══ */}
      {selectedDoc && (
        <div className={styles.modalOverlay} onClick={() => { if (!editing) { setSelectedDoc(null); } }}>
          <div className={`${styles.modalContent} ${editing ? styles.modalContentWide : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              {editing ? (
                <input
                  type="text"
                  className={styles.editTitleInput}
                  value={editData?.documentTitle || ''}
                  onChange={(e) => updateEditField('documentTitle', e.target.value)}
                  placeholder="Título do documento"
                />
              ) : (
                <h3>📄 {selectedDoc.documentTitle || 'Documento'}</h3>
              )}
              <button className={styles.modalClose} onClick={() => { setEditing(false); setEditData(null); setSelectedDoc(null); }}>✕</button>
            </div>
            <div className={styles.docPreview}>
              {/* Document Type */}
              {editing ? (
                <input
                  type="text"
                  className={styles.editTypeInput}
                  value={editData?.documentType || ''}
                  onChange={(e) => updateEditField('documentType', e.target.value)}
                  placeholder="Tipo do documento"
                />
              ) : (
                selectedDoc.documentType && (
                  <div className={styles.docType}>{selectedDoc.documentType}</div>
                )
              )}

              {/* Header fields */}
              {editing ? (
                <div>
                  <table className={styles.docHeaderTable}>
                    <tbody>
                      {(editData?.header?.fields || []).map((f, i) => (
                        <tr key={i}>
                          <td className={styles.docHeaderLabel}>
                            <input
                              type="text"
                              className={styles.editInlineInput}
                              value={f.label}
                              onChange={(e) => updateHeaderField(i, 'label', e.target.value)}
                              placeholder="Rótulo"
                            />
                          </td>
                          <td className={styles.docHeaderValue}>
                            <input
                              type="text"
                              className={styles.editInlineInput}
                              value={f.value}
                              onChange={(e) => updateHeaderField(i, 'value', e.target.value)}
                              placeholder="Valor"
                            />
                          </td>
                          <td style={{ width: '28px', padding: '2px' }}>
                            <button
                              type="button"
                              className={styles.editRemoveBtn}
                              onClick={() => removeHeaderField(i)}
                              title="Remover campo"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    className={styles.editAddSectionBtn}
                    onClick={addHeaderField}
                    style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }}
                  >
                    + Adicionar campo
                  </button>
                </div>
              ) : (
                selectedDoc.header?.fields?.length > 0 && (
                  <table className={styles.docHeaderTable}>
                    <tbody>
                      {selectedDoc.header.fields.map((f, i) => (
                        <tr key={i}>
                          <td className={styles.docHeaderLabel}>{f.label}</td>
                          <td className={styles.docHeaderValue}>{f.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* Sections */}
              {editing ? (
                <div className={styles.editSections}>
                  {(editData?.sections || []).map((s, i) => (
                    <div key={i} className={styles.editSectionBlock}>
                      <div className={styles.editSectionHeader}>
                        <input
                          type="text"
                          className={styles.editSectionTitleInput}
                          value={s.heading}
                          onChange={(e) => updateSection(i, 'heading', e.target.value)}
                          placeholder="Título da seção"
                        />
                        <button
                          type="button"
                          className={styles.editRemoveBtn}
                          onClick={() => removeSection(i)}
                          title="Remover seção"
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        className={styles.editSectionBodyInput}
                        value={s.body}
                        onChange={(e) => updateSection(i, 'body', e.target.value)}
                        placeholder="Conteúdo da seção..."
                        rows={4}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.editAddSectionBtn}
                    onClick={addSection}
                  >
                    + Adicionar seção
                  </button>
                </div>
              ) : (
                (selectedDoc.sections || []).map((s, i) => (
                  <div key={i} className={styles.docSection}>
                    <h4 className={styles.docSectionTitle}>{s.heading}</h4>
                    <p className={styles.docSectionBody}>{s.body}</p>
                  </div>
                ))
              )}

              {/* Signatures */}
              {!editing && selectedDoc.signatureFields?.length > 0 && (
                <div className={styles.docSignatures}>
                  {selectedDoc.signatureFields.map((s, i) => (
                    <div key={i} className={styles.docSignatureBlock}>
                      <div className={styles.docSignatureLine} />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              {editing ? (
                <input
                  type="text"
                  className={styles.editFooterInput}
                  value={editData?.footer || ''}
                  onChange={(e) => updateEditField('footer', e.target.value)}
                  placeholder="Rodapé"
                />
              ) : (
                selectedDoc.footer && (
                  <div className={styles.docFooter}>{selectedDoc.footer}</div>
                )
              )}
            </div>
            <div className={styles.docActions}>
              {editing ? (
                <>
                  <button
                    type="button"
                    className={styles.editSaveBtn}
                    onClick={handleSaveEdit}
                    disabled={saving}
                    title="Salvar alterações"
                  >
                    {saving ? '...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    className={styles.editCancelBtn}
                    onClick={handleCancelEdit}
                    title="Cancelar edição"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.docEditBtn}
                    onClick={handleStartEdit}
                    title="Editar documento"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className={styles.docPrintBtn}
                    onClick={() => handlePrint(selectedDoc)}
                    title="Imprimir / PDF"
                  >
                    🖨️
                  </button>
                  <button
                    type="button"
                    className={`${styles.docCardBtn} ${styles.docCardBtnDanger}`}
                    onClick={() => handleDelete(selectedDoc.id)}
                    disabled={deletingId === selectedDoc.id}
                    title="Excluir documento"
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documentos;
