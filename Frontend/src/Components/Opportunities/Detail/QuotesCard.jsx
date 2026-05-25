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

const DEFAULT_QUOTE_LABELS = {
  title: "Cotações",
  addButton: "+ Nova cotação",
  emptyMessage: "Nenhuma cotação criada.",
  itemsTitle: "Itens da cotação",
  printButton: "\uD83D\uDDA8 Imprimir cotação",
  importButton: "\u2191 Importar produtos",
  importHint: "Substitui os itens desta cotação pelos produtos da aba Produtos",
  removeButton: "Remover cotação",
  removeConfirm: "Remover esta cotação?",
};

const mergeQuoteLabels = (labels) => {
  if (!labels) return DEFAULT_QUOTE_LABELS;
  return { ...DEFAULT_QUOTE_LABELS, ...labels };
};

const QuotesCard = ({
  quotes = [],
  products = [],
  onChange = null,
  isReadOnlyMode = false,
  opportunityTitle = "",
  activeStageLabel = "",
  labels: labelsProp = null,
}) => {
  const labels = mergeQuoteLabels(labelsProp);
  const [openId, setOpenId] = React.useState(null);

  // Mantemos TODOS os registros visíveis em todos os passos. Cada item
  // sabe a qual etapa pertence (campo `etapa`) — quando o passo ativo é
  // outro, marcamos o registro com um badge claro com o nome da etapa para
  // o usuário não confundir com algo desta etapa.
  const normalizedStage = String(activeStageLabel || "")
    .trim()
    .toLowerCase();
  const annotatedQuotes = React.useMemo(() => {
    return (Array.isArray(quotes) ? quotes : []).map((q) => {
      const etapaRaw = String(q?.etapa || "").trim();
      const etapaNorm = etapaRaw.toLowerCase();
      let origin = "current"; // pertence ao passo ativo (ou sem filtro)
      if (!etapaRaw) {
        origin = "unscoped";
      } else if (normalizedStage && etapaNorm !== normalizedStage) {
        origin = "foreign";
      }
      return { ...q, __origin: origin, __etapaLabel: etapaRaw };
    });
  }, [quotes, normalizedStage]);
  const visibleQuotes = React.useMemo(() => {
    const importedSourceIdsInCurrentStage = new Set(
      (Array.isArray(quotes) ? quotes : [])
        .filter(
          (q) =>
            String(q?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            q?.importedFromId !== undefined &&
            q?.importedFromId !== null &&
            String(q.importedFromId).trim() !== "",
        )
        .map((q) => String(q.importedFromId)),
    );

    return annotatedQuotes.filter((q) => {
      if (q.__origin === "current") return true;
      return !importedSourceIdsInCurrentStage.has(String(q.id));
    });
  }, [annotatedQuotes, quotes, normalizedStage]);

  const handleAdd = () => {
    if (isReadOnlyMode) return;
    const base = EMPTY_QUOTE(products);
    const q = activeStageLabel
      ? { ...base, etapa: String(activeStageLabel).trim() }
      : base;
    onChange?.([...(Array.isArray(quotes) ? quotes : []), q]);
    setOpenId(q.id);
  };

  const bindQuoteToActiveStage = (quote) => {
    if (!activeStageLabel) return quote;
    return {
      ...quote,
      etapa: String(activeStageLabel).trim(),
    };
  };

  const handleChange = (id, field, value) => {
    if (isReadOnlyMode) return;
    onChange?.(
      quotes.map((q) =>
        q.id === id ? bindQuoteToActiveStage({ ...q, [field]: value }) : q,
      ),
    );
  };

  const handleItemChange = (quoteId, itemIdx, field, value) => {
    if (isReadOnlyMode) return;
    onChange?.(
      quotes.map((q) => {
        if (q.id !== quoteId) return q;
        const items = q.items.map((it, i) =>
          i === itemIdx ? { ...it, [field]: value } : it,
        );
        return bindQuoteToActiveStage({ ...q, items });
      }),
    );
  };

  const handleRemoveItem = (quoteId, itemIdx) => {
    if (isReadOnlyMode) return;
    onChange?.(
      quotes.map((q) => {
        if (q.id !== quoteId) return q;
        return bindQuoteToActiveStage({
          ...q,
          items: q.items.filter((_, i) => i !== itemIdx),
        });
      }),
    );
  };

  const handleAddItem = (quoteId) => {
    if (isReadOnlyMode) return;
    onChange?.(
      quotes.map((q) => {
        if (q.id !== quoteId) return q;
        return bindQuoteToActiveStage({
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
        });
      }),
    );
  };

  const handleRemoveQuote = (id) => {
    if (isReadOnlyMode) return;
    if (!window.confirm(labels.removeConfirm)) return;
    onChange?.(quotes.filter((q) => q.id !== id));
    if (openId === id) setOpenId(null);
  };

  const isUsedInCurrentStep = (quote) => {
    if (quote.__origin === "current") return true;
    if (!activeStageLabel) return false;
    return (Array.isArray(quotes) ? quotes : []).some(
      (q) =>
        String(q?.etapa || "")
          .trim()
          .toLowerCase() === normalizedStage &&
        String(q?.importedFromId || "") === String(quote.id),
    );
  };

  const handleUsageToggle = (quote, shouldUse) => {
    if (isReadOnlyMode || !activeStageLabel) return;
    const currentList = Array.isArray(quotes) ? quotes : [];

    if (shouldUse) {
      if (quote.__origin === "current") return;
      const alreadyImported = currentList.some(
        (q) =>
          String(q?.etapa || "")
            .trim()
            .toLowerCase() === normalizedStage &&
          String(q?.importedFromId || "") === String(quote.id),
      );
      if (alreadyImported) return;

      const sourceIndex = currentList.findIndex(
        (q) => String(q?.id) === String(quote.id),
      );
      const next = [...currentList];
      const { __origin, __etapaLabel, ...baseQuote } = quote;
      const clonedQuote = {
        ...baseQuote,
        id: Date.now() + Math.random(),
        etapa: String(activeStageLabel).trim(),
        importedFromId: quote.id,
        items: (Array.isArray(quote.items) ? quote.items : []).map((it) => ({
          ...it,
        })),
      };
      const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : next.length;
      next.splice(insertAt, 0, clonedQuote);
      onChange?.(next);
      return;
    }

    if (quote.__origin === "current") {
      const isImportedClone =
        String(quote?.importedFromId || "").trim().length > 0;

      if (isImportedClone) {
        onChange?.(currentList.filter((q) => q.id !== quote.id));
        return;
      }

      onChange?.(
        currentList.map((q) =>
          q.id === quote.id
            ? {
                ...q,
                etapa: "",
              }
            : q,
        ),
      );
      return;
    }

    onChange?.(
      currentList.filter(
        (q) =>
          !(
            String(q?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            String(q?.importedFromId || "") === String(quote.id)
          ),
      ),
    );
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
          {labels.title}
          {visibleQuotes.length > 0 && (
            <span className={styles.countBadge}>{visibleQuotes.length}</span>
          )}
        </span>
        {!isReadOnlyMode && (
          <button type="button" className={styles.addBtn} onClick={handleAdd}>
            {labels.addButton}
          </button>
        )}
      </div>

      {!isReadOnlyMode && visibleQuotes.length > 0 && (
        <div className={styles.selectionBar}>
          <span className={styles.selectionHint}>
            Marque os indicadores que serão utilizados neste passo.
          </span>
        </div>
      )}

      {visibleQuotes.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>📋</span>
          <p>{labels.emptyMessage}</p>
          {!isReadOnlyMode && (
            <button
              type="button"
              className={styles.emptyAddBtn}
              onClick={handleAdd}
            >
              {labels.addButton}
            </button>
          )}
        </div>
      ) : (
        <div className={styles.quoteList}>
          {visibleQuotes.map((q, idx) => {
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
                  {!isReadOnlyMode && (
                    <input
                      type="checkbox"
                      className={styles.quoteSelector}
                      checked={isUsedInCurrentStep(q)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleUsageToggle(q, e.target.checked)}
                      title="Selecionar indicador"
                      aria-label="Selecionar indicador"
                    />
                  )}
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
                          {labels.itemsTitle}
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
                      {!isReadOnlyMode && (
                        <button
                          type="button"
                          className={styles.removeQuoteBtn}
                          onClick={() => handleRemoveQuote(q.id)}
                        >
                          {labels.removeButton}
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
