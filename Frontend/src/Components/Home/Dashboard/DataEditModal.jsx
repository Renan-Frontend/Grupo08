import React, { useState, useRef } from 'react';
import styles from './DataEditModal.module.css';
import { parseSpreadsheet } from './parseSpreadsheet';

const DataEditModal = ({ title, columns, rows: initialRows, onSave, onClose, meta: initialMeta, metaType: initialMetaType, onMetaSave }) => {
  const [rows, setRows] = useState(() =>
    initialRows.map((r, i) => ({ ...r, _id: i }))
  );
  const [metaValue, setMetaValue] = useState(initialMeta ?? '');
  const [metaTypeValue, setMetaTypeValue] = useState(initialMetaType || 'value');
  const [metaError, setMetaError] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const parsed = await parseSpreadsheet(file, columns);
      setRows(parsed.map((r, i) => ({ ...r, _id: Date.now() + i })));
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const updateCell = (idx, key, value) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));

  const addRow = () => {
    const empty = { _id: Date.now() };
    columns.forEach((c) => {
      if (c.type === 'number' || c.type === 'currency') empty[c.key] = 0;
      else if (c.type === 'boolean') empty[c.key] = true;
      else empty[c.key] = '';
    });
    setRows((prev) => [...prev, empty]);
  };

  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = () => {
    if (onMetaSave) {
      const mv = String(metaValue).trim();
      if (!mv) { setMetaError(true); return; }
      onMetaSave(Number(mv) || 0, metaTypeValue);
    }
    const cleaned = rows.map(({ _id, ...rest }) => {
      const obj = {};
      // preserve extra fields (e.g. icon) that are not in columns
      Object.keys(rest).forEach((k) => {
        if (!columns.find((c) => c.key === k)) obj[k] = rest[k];
      });
      columns.forEach((c) => {
        if (c.type === 'number' || c.type === 'currency') {
          obj[c.key] = Number(rest[c.key]) || 0;
        } else if (c.type === 'boolean') {
          obj[c.key] = Boolean(rest[c.key]);
        } else {
          obj[c.key] = rest[c.key] ?? '';
        }
      });
      return obj;
    });
    onSave(cleaned);
  };

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {onMetaSave && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 1rem', borderBottom: '1px solid #e5e9ee', background: '#f8f5ff' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8b5cf6', whiteSpace: 'nowrap' }}>Meta *</label>
            <button
              type="button"
              onClick={() => setMetaTypeValue(metaTypeValue === 'percent' ? 'value' : 'percent')}
              style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', border: '1px solid #e2e8f0', borderRadius: '0.25rem', background: '#fff', color: '#8b5cf6', cursor: 'pointer', fontWeight: 600, lineHeight: 1 }}
              title={metaTypeValue === 'percent' ? 'Modo porcentagem' : 'Modo valor'}
            >{metaTypeValue === 'percent' ? '%' : '#'}</button>
            <input
              type="text"
              inputMode="numeric"
              value={metaValue}
              onChange={(e) => { setMetaValue(e.target.value); setMetaError(false); }}
              placeholder="Obrigatório"
              style={{ width: '8rem', fontSize: '0.82rem', padding: '0.3rem 0.5rem', border: metaError ? '2px solid #ef4444' : '1.5px solid #e2e8f0', borderRadius: 6, textAlign: 'right' }}
            />
            {metaError && <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>Preencha a meta</span>}
          </div>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={styles.th}>
                    {c.label}
                  </th>
                ))}
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row._id} className={styles.tr}>
                  {columns.map((c) => (
                    <td key={c.key} className={styles.td}>
                      {c.type === 'boolean' ? (
                        <select
                          name={`cellBool_${idx}_${c.key}`}
                          value={String(row[c.key])}
                          onChange={(e) =>
                            updateCell(idx, c.key, e.target.value === 'true')
                          }
                          className={styles.input}
                        >
                          <option value="true">↑ Sobe</option>
                          <option value="false">↓ Desce</option>
                        </select>
                      ) : (
                        <input
                          type={
                            c.type === 'number' || c.type === 'currency'
                              ? 'number'
                              : 'text'
                          }
                          name={`cellVal_${idx}_${c.key}`}
                          value={row[c.key] ?? ''}
                          onChange={(e) => updateCell(idx, c.key, e.target.value)}
                          className={styles.input}
                          min={
                            c.type === 'number' || c.type === 'currency'
                              ? '0'
                              : undefined
                          }
                          step="1"
                        />
                      )}
                    </td>
                  ))}
                  <td className={styles.tdAction}>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeRow(idx)}
                      title="Remover linha"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {importError && (
          <div className={styles.importError}>{importError}</div>
        )}

        <div className={styles.modalFooter}>
          <div className={styles.footerLeft}>
            <button type="button" className={styles.addBtn} onClick={addRow}>
              + Linha
            </button>
            <button
              type="button"
              className={styles.importBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title="Importar CSV ou Excel (.xlsx)"
            >
              {importing ? 'Importando…' : '📂 Importar planilha'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              name="importFileModal"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
          </div>
          <div className={styles.footerRight}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className={styles.saveBtn} onClick={handleSave}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataEditModal;
