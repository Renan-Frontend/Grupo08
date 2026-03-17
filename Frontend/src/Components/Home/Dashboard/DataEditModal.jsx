import React, { useState } from 'react';
import styles from './DataEditModal.module.css';

const DataEditModal = ({ title, columns, rows: initialRows, onSave, onClose }) => {
  const [rows, setRows] = useState(() =>
    initialRows.map((r, i) => ({ ...r, _id: i }))
  );

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

        <div className={styles.modalFooter}>
          <button type="button" className={styles.addBtn} onClick={addRow}>
            + Linha
          </button>
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
