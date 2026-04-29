import React from "react";
import styles from "./QuotesCard.module.css";

const EMPTY_QUOTE = (products = []) => ({
  id: Date.now() + Math.random(),
  titulo: "",
  condicaoPagamento: "",
  prazoEntrega: "",
  validade: "",
  desconto: 0,
  status: "rascunho",
  observacoes: "",
  items: products.map((p) => ({
    produtoId: p.id,
    nome: p.nome,
    quantidade: p.quantidade,
    precoUnitario: p.precoUnitario,
    desconto: p.desconto,
    unidade: p.unidade,
  })),
});

const STATUSES = [
  { value: "rascunho", label: "Rascunho", color: "#94a3b8" },
  { value: "enviada", label: "Enviada", color: "#3b82f6" },
  { value: "aprovada", label: "Aprovada", color: "#1e9158" },
  { value: "recusada", label: "Recusada", color: "#ef4444" },
  { value: "expirada", label: "Expirada", color: "#f59e0b" },
];

const formatCurrency = (value) => {
  const num = parseFloat(String(value || "0").replace(",", "."));
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const calcItemTotal = (item) => {
  const qty = parseFloat(item?.quantidade) || 0;
  const price =
    parseFloat(String(item?.precoUnitario || "0").replace(",", ".")) || 0;
  const disc = parseFloat(item?.desconto) || 0;
  return qty * price * (1 - disc / 100);
};

const calcQuoteTotal = (quote) =>
  (quote.items || []).reduce((acc, it) => acc + calcItemTotal(it), 0) *
  (1 - (parseFloat(quote.desconto) || 0) / 100);

const StatusBadge = ({ value }) => {
  const s = STATUSES.find((st) => st.value === value) || STATUSES[0];
  return (
    <span
      style={{
        fontSize: "0.68rem",
        fontWeight: 700,
        padding: "0.1rem 0.5rem",
        borderRadius: "999px",
        background: s.color + "22",
        color: s.color,
        border: `1px solid ${s.color}44`,
        whiteSpace: "nowrap",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {s.label}
    </span>
  );
};

const QuotesCard = ({
  quotes = [],
  products = [],
  onChange = null,
  isReadOnlyMode = false,
  opportunityTitle = "",
}) => {
  const [openId, setOpenId] = React.useState(null);

  const handleAdd = () => {
    if (isReadOnlyMode) return;
    const q = EMPTY_QUOTE(products);
    onChange?.([...quotes, q]);
    setOpenId(q.id);
  };

  const handleChange = (id, field, value) => {
    if (isReadOnlyMode) return;
    onChange?.(quotes.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  const handleItemChange = (quoteId, itemIdx, field, value) => {
    if (isReadOnlyMode) return;
    onChange?.(
      quotes.map((q) => {
        if (q.id !== quoteId) return q;
        const items = q.items.map((it, i) =>
          i === itemIdx ? { ...it, [field]: value } : it,
        );
        return { ...q, items };
      }),
    );
  };

  const handleRemoveItem = (quoteId, itemIdx) => {
    if (isReadOnlyMode) return;
    onChange?.(
      quotes.map((q) => {
        if (q.id !== quoteId) return q;
        return { ...q, items: q.items.filter((_, i) => i !== itemIdx) };
      }),
    );
  };

  const handleAddItem = (quoteId) => {
    if (isReadOnlyMode) return;
    onChange?.(
      quotes.map((q) => {
        if (q.id !== quoteId) return q;
        return {
          ...q,
          items: [
            ...q.items,
            {
              nome: "",
              quantidade: 1,
              precoUnitario: "",
              desconto: 0,
              unidade: "",
            },
          ],
        };
      }),
    );
  };

  const handleRemoveQuote = (id) => {
    if (isReadOnlyMode) return;
    if (!window.confirm("Remover esta cotação?")) return;
    onChange?.(quotes.filter((q) => q.id !== id));
    if (openId === id) setOpenId(null);
  };

  const handleImportProducts = (quoteId) => {
    if (isReadOnlyMode || products.length === 0) return;
    onChange?.(
      quotes.map((q) => {
        if (q.id !== quoteId) return q;
        return {
          ...q,
          items: products.map((p) => ({
            produtoId: p.id,
            nome: p.nome,
            quantidade: p.quantidade,
            precoUnitario: p.precoUnitario,
            desconto: p.desconto,
            unidade: p.unidade,
          })),
        };
      }),
    );
  };

  const handlePrintQuote = (q) => {
    const statusLabel =
      STATUSES.find((s) => s.value === q.status)?.label || q.status;
    const rows = (q.items || [])
      .map(
        (it) =>
          `<tr>
            <td>${it.nome || ""}</td>
            <td style="text-align:center">${it.quantidade}</td>
            <td style="text-align:center">${it.unidade || ""}</td>
            <td style="text-align:right">${formatCurrency(it.precoUnitario)}</td>
            <td style="text-align:center">${it.desconto || 0}%</td>
            <td style="text-align:right">${formatCurrency(calcItemTotal(it))}</td>
          </tr>`,
      )
      .join("");
    const subtotal = (q.items || []).reduce(
      (a, it) => a + calcItemTotal(it),
      0,
    );
    const total = calcQuoteTotal(q);
    const discountRow =
      parseFloat(q.desconto) > 0
        ? `<tr><td colspan="5" style="text-align:right">Desconto geral (${q.desconto}%)</td><td style="text-align:right">-${formatCurrency(subtotal * (parseFloat(q.desconto) / 100))}</td></tr>`
        : "";
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
      <title>Cotação – ${q.titulo || "Sem título"}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a2e; margin: 40px; }
        h1 { font-size: 1.3rem; margin: 0 0 4px; }
        .sub { color: #64748b; font-size: 0.85rem; margin-bottom: 20px; }
        .meta { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px 16px; background: #f8fafc; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
        .meta div { display: flex; flex-direction: column; }
        .meta label { font-size: 0.73rem; color: #64748b; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
        .meta strong { font-size: 0.88rem; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th { background: #1e9158; color: #fff; padding: 6px 8px; font-size: 0.77rem; text-align: left; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e9ee; font-size: 0.82rem; }
        .totals td { border: none; padding: 3px 8px; }
        .grand { font-weight: bold; font-size: 1rem; color: #1e9158; }
        .obs { margin-top: 16px; background: #f8fafc; padding: 10px 14px; border-radius: 6px; font-size: 0.82rem; }
        .obs label { font-size: 0.73rem; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px; }
        .footer { margin-top: 32px; font-size: 0.75rem; color: #94a3b8; text-align: center; }
      </style></head><body>
      <h1>${opportunityTitle || "Proposta Comercial"}</h1>
      <div class="sub">${q.titulo || "Sem título"} &nbsp;·&nbsp; Status: <strong>${statusLabel}</strong></div>
      <div class="meta">
        ${q.condicaoPagamento ? `<div><label>Cond. pagamento</label><strong>${q.condicaoPagamento}</strong></div>` : ""}
        ${q.prazoEntrega ? `<div><label>Prazo entrega</label><strong>${q.prazoEntrega}</strong></div>` : ""}
        ${q.validade ? `<div><label>Validade</label><strong>${q.validade}</strong></div>` : ""}
      </div>
      <table><thead><tr><th>Produto / Serviço</th><th style="text-align:center">Qtd</th><th style="text-align:center">Unid.</th><th style="text-align:right">Preço unit.</th><th style="text-align:center">Desc %</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot class="totals">
        <tr><td colspan="5" style="text-align:right">Subtotal</td><td style="text-align:right">${formatCurrency(subtotal)}</td></tr>
        ${discountRow}
        <tr class="grand"><td colspan="5" style="text-align:right">Total final</td><td style="text-align:right">${formatCurrency(total)}</td></tr>
      </tfoot></table>
      ${q.observacoes ? `<div class="obs"><label>Observações</label>${q.observacoes}</div>` : ""}
      <div class="footer">Documento gerado em ${new Date().toLocaleDateString("pt-BR")}</div>
    </body></html>`;
    const w = window.open("", "_blank", "width=800,height=700");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 400);
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Cotações
          {quotes.length > 0 && (
            <span className={styles.countBadge}>{quotes.length}</span>
          )}
        </span>
        {!isReadOnlyMode && (
          <button type="button" className={styles.addBtn} onClick={handleAdd}>
            + Nova cotação
          </button>
        )}
      </div>

      {quotes.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>📋</span>
          <p>Nenhuma cotação criada.</p>
          {!isReadOnlyMode && (
            <button
              type="button"
              className={styles.emptyAddBtn}
              onClick={handleAdd}
            >
              + Nova cotação
            </button>
          )}
        </div>
      ) : (
        <div className={styles.quoteList}>
          {quotes.map((q, idx) => {
            const isOpen = openId === q.id;
            return (
              <div
                key={q.id}
                className={`${styles.quoteRow} ${isOpen ? styles.quoteRowOpen : ""}`}
              >
                {/* Linha de resumo */}
                <div
                  className={styles.quoteHeader}
                  onClick={() => setOpenId(isOpen ? null : q.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setOpenId(isOpen ? null : q.id);
                  }}
                >
                  <span className={styles.quoteIndex}>#{idx + 1}</span>
                  <span className={styles.quoteTitle}>
                    {q.titulo || <em className={styles.noTitle}>Sem título</em>}
                  </span>
                  <StatusBadge value={q.status} />
                  <span className={styles.quoteTotal}>
                    {formatCurrency(calcQuoteTotal(q))}
                  </span>
                  <span className={styles.chevron}>{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* Detalhes expandidos */}
                {isOpen && (
                  <div className={styles.quoteBody}>
                    <div className={styles.metaGrid}>
                      <label>
                        <span>Título</span>
                        <input
                          className={styles.metaInput}
                          value={q.titulo}
                          onChange={(e) =>
                            handleChange(q.id, "titulo", e.target.value)
                          }
                          placeholder="Ex: Proposta padrão"
                          disabled={isReadOnlyMode}
                        />
                      </label>
                      <label>
                        <span>Status</span>
                        <select
                          className={styles.metaInput}
                          value={q.status}
                          onChange={(e) =>
                            handleChange(q.id, "status", e.target.value)
                          }
                          disabled={isReadOnlyMode}
                        >
                          {STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Cond. de pagamento</span>
                        <input
                          className={styles.metaInput}
                          value={q.condicaoPagamento}
                          onChange={(e) =>
                            handleChange(
                              q.id,
                              "condicaoPagamento",
                              e.target.value,
                            )
                          }
                          placeholder="Ex: 30/60/90 dias"
                          disabled={isReadOnlyMode}
                        />
                      </label>
                      <label>
                        <span>Prazo de entrega</span>
                        <input
                          className={styles.metaInput}
                          value={q.prazoEntrega}
                          onChange={(e) =>
                            handleChange(q.id, "prazoEntrega", e.target.value)
                          }
                          placeholder="Ex: 15 dias úteis"
                          disabled={isReadOnlyMode}
                        />
                      </label>
                      <label>
                        <span>Validade da proposta</span>
                        <input
                          className={styles.metaInput}
                          value={q.validade}
                          onChange={(e) =>
                            handleChange(q.id, "validade", e.target.value)
                          }
                          placeholder="dd/mm/aaaa"
                          disabled={isReadOnlyMode}
                        />
                      </label>
                      <label>
                        <span>Desconto geral (%)</span>
                        <input
                          className={styles.metaInput}
                          type="number"
                          min="0"
                          max="100"
                          value={q.desconto}
                          onChange={(e) =>
                            handleChange(q.id, "desconto", e.target.value)
                          }
                          disabled={isReadOnlyMode}
                        />
                      </label>
                    </div>

                    <div className={styles.itemsSection}>
                      <div className={styles.itemsHeader}>
                        <span className={styles.itemsLabel}>
                          Itens da cotação
                        </span>
                        {!isReadOnlyMode && (
                          <button
                            type="button"
                            className={styles.addItemBtn}
                            onClick={() => handleAddItem(q.id)}
                          >
                            + Item
                          </button>
                        )}
                      </div>
                      <table className={styles.itemsTable}>
                        <thead>
                          <tr>
                            <th>Produto / Serviço</th>
                            <th className={styles.nc}>Qtd</th>
                            <th className={styles.nc}>Unidade</th>
                            <th className={styles.nc}>Preço unit.</th>
                            <th className={styles.nc}>Desc %</th>
                            <th className={styles.nc}>Total</th>
                            {!isReadOnlyMode && <th className={styles.ac}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {(q.items || []).map((it, i) => (
                            <tr key={i}>
                              <td>
                                <input
                                  className={styles.cellInput}
                                  value={it.nome}
                                  onChange={(e) =>
                                    handleItemChange(
                                      q.id,
                                      i,
                                      "nome",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Produto ou serviço"
                                  disabled={isReadOnlyMode}
                                />
                              </td>
                              <td className={styles.nc}>
                                <input
                                  className={`${styles.cellInput} ${styles.narrow}`}
                                  type="number"
                                  min="0"
                                  value={it.quantidade}
                                  onChange={(e) =>
                                    handleItemChange(
                                      q.id,
                                      i,
                                      "quantidade",
                                      e.target.value,
                                    )
                                  }
                                  disabled={isReadOnlyMode}
                                />
                              </td>
                              <td className={styles.nc}>
                                <input
                                  className={`${styles.cellInput} ${styles.narrow}`}
                                  value={it.unidade}
                                  onChange={(e) =>
                                    handleItemChange(
                                      q.id,
                                      i,
                                      "unidade",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="un"
                                  disabled={isReadOnlyMode}
                                />
                              </td>
                              <td className={styles.nc}>
                                <input
                                  className={`${styles.cellInput} ${styles.narrow}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={it.precoUnitario}
                                  onChange={(e) =>
                                    handleItemChange(
                                      q.id,
                                      i,
                                      "precoUnitario",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="0,00"
                                  disabled={isReadOnlyMode}
                                />
                              </td>
                              <td className={styles.nc}>
                                <input
                                  className={`${styles.cellInput} ${styles.narrow}`}
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={it.desconto}
                                  onChange={(e) =>
                                    handleItemChange(
                                      q.id,
                                      i,
                                      "desconto",
                                      e.target.value,
                                    )
                                  }
                                  disabled={isReadOnlyMode}
                                />
                              </td>
                              <td
                                className={`${styles.nc} ${styles.totalCell}`}
                              >
                                {formatCurrency(calcItemTotal(it))}
                              </td>
                              {!isReadOnlyMode && (
                                <td className={styles.ac}>
                                  <button
                                    type="button"
                                    className={styles.removeBtn}
                                    onClick={() => handleRemoveItem(q.id, i)}
                                  >
                                    ✕
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={5} className={styles.subtotalLabel}>
                              Subtotal
                            </td>
                            <td
                              className={`${styles.nc} ${styles.subtotalValue}`}
                            >
                              {formatCurrency(
                                (q.items || []).reduce(
                                  (a, it) => a + calcItemTotal(it),
                                  0,
                                ),
                              )}
                            </td>
                            {!isReadOnlyMode && <td />}
                          </tr>
                          {parseFloat(q.desconto) > 0 && (
                            <tr>
                              <td colSpan={5} className={styles.subtotalLabel}>
                                Desconto geral ({q.desconto}%)
                              </td>
                              <td
                                className={`${styles.nc} ${styles.discountValue}`}
                              >
                                -
                                {formatCurrency(
                                  (q.items || []).reduce(
                                    (a, it) => a + calcItemTotal(it),
                                    0,
                                  ) *
                                    (parseFloat(q.desconto) / 100),
                                )}
                              </td>
                              {!isReadOnlyMode && <td />}
                            </tr>
                          )}
                          <tr>
                            <td colSpan={5} className={styles.grandTotalLabel}>
                              Total final
                            </td>
                            <td
                              className={`${styles.nc} ${styles.grandTotalValue}`}
                            >
                              {formatCurrency(calcQuoteTotal(q))}
                            </td>
                            {!isReadOnlyMode && <td />}
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className={styles.obsSection}>
                      <label>
                        <span className={styles.obsLabel}>Observações</span>
                        <textarea
                          className={styles.obsInput}
                          value={q.observacoes}
                          onChange={(e) =>
                            handleChange(q.id, "observacoes", e.target.value)
                          }
                          placeholder="Condições especiais, notas para o cliente..."
                          rows={3}
                          disabled={isReadOnlyMode}
                        />
                      </label>
                    </div>

                    <div className={styles.quoteActions}>
                      {!isReadOnlyMode && products.length > 0 && (
                        <button
                          type="button"
                          className={styles.importBtn}
                          onClick={() => handleImportProducts(q.id)}
                          title="Substitui os itens desta cotação pelos produtos da aba Produtos"
                        >
                          ↑ Importar produtos
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.printBtn}
                        onClick={() => handlePrintQuote(q)}
                      >
                        🖨 Imprimir cotação
                      </button>
                      {!isReadOnlyMode && (
                        <button
                          type="button"
                          className={styles.removeQuoteBtn}
                          onClick={() => handleRemoveQuote(q.id)}
                        >
                          Remover cotação
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QuotesCard;
