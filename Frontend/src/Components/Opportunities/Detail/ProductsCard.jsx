import React from "react";
import styles from "./ProductsCard.module.css";

const EMPTY_PRODUCT = () => ({
  id: Date.now() + Math.random(),
  nome: "",
  quantidade: 1,
  precoUnitario: "",
  desconto: 0,
  unidade: "",
  justificativa: "",
});

const formatCurrency = (value) => {
  const num = parseFloat(String(value).replace(",", "."));
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const calcTotal = (product) => {
  const qty = parseFloat(product.quantidade) || 0;
  const price =
    parseFloat(String(product.precoUnitario).replace(",", ".")) || 0;
  const discount = parseFloat(product.desconto) || 0;
  return qty * price * (1 - discount / 100);
};

const DEFAULT_PRODUCT_LABELS = {
  title: "Produtos",
  addButton: "+ Adicionar produto",
  emptyMessage: "Nenhum produto adicionado.",
  emptyIcon: "\uD83D\uDCE6",
  removeTitle: "Remover produto",
  itemPlaceholder: "Nome do produto ou serviço",
  unitPlaceholder: "un, kg...",
  columns: {
    item: "Produto / Serviço",
    quantity: "Qtd",
    unit: "Unidade",
    price: "Preço unit.",
    discount: "Desconto %",
    justification: "Justificativa",
    total: "Total",
    grandTotal: "Total geral",
  },
};

const mergeProductLabels = (labels) => {
  if (!labels) return DEFAULT_PRODUCT_LABELS;
  return {
    ...DEFAULT_PRODUCT_LABELS,
    ...labels,
    columns: labels.columns
      ? { ...DEFAULT_PRODUCT_LABELS.columns, ...labels.columns }
      : DEFAULT_PRODUCT_LABELS.columns,
  };
};

const ProductsCard = ({
  products = [],
  onChange = null,
  isReadOnlyMode = false,
  activeStageLabel = "",
  labels: labelsProp = null,
}) => {
  const labels = mergeProductLabels(labelsProp);

  // Filtra produtos pela etapa ativa para evitar que dados de outros
  // passos da pipeline vazem entre si. Itens antigos sem `etapa` ficam
  // visíveis em todos os passos como fallback (legado).
  const normalizedStage = String(activeStageLabel || "")
    .trim()
    .toLowerCase();
  const annotatedProducts = React.useMemo(() => {
    return (Array.isArray(products) ? products : []).map((p) => {
      const etapaRaw = String(p?.etapa || "").trim();
      const etapaNorm = etapaRaw.toLowerCase();
      let origin = "current";
      if (!etapaRaw) {
        origin = "unscoped";
      } else if (normalizedStage && etapaNorm !== normalizedStage) {
        origin = "foreign";
      }
      return { ...p, __origin: origin, __etapaLabel: etapaRaw };
    });
  }, [products, normalizedStage]);

  const visibleProducts = React.useMemo(() => {
    const importedSourceIdsInCurrentStage = new Set(
      (Array.isArray(products) ? products : [])
        .filter(
          (p) =>
            String(p?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            p?.importedFromId !== undefined &&
            p?.importedFromId !== null &&
            String(p.importedFromId).trim() !== "",
        )
        .map((p) => String(p.importedFromId)),
    );

    return annotatedProducts.filter((p) => {
      if (p.__origin === "current") return true;
      return !importedSourceIdsInCurrentStage.has(String(p.id));
    });
  }, [annotatedProducts, products, normalizedStage]);

  const isUsedInCurrentStep = (product) => {
    if (product.__origin === "current") return true;
    if (!activeStageLabel) return false;
    return (Array.isArray(products) ? products : []).some(
      (p) =>
        String(p?.etapa || "")
          .trim()
          .toLowerCase() === normalizedStage &&
        String(p?.importedFromId || "") === String(product.id),
    );
  };

  const handleAdd = () => {
    if (isReadOnlyMode) return;
    const base = EMPTY_PRODUCT();
    const novo = activeStageLabel
      ? { ...base, etapa: String(activeStageLabel).trim() }
      : base;
    onChange?.([...(Array.isArray(products) ? products : []), novo]);
  };

  const handleChange = (id, field, value) => {
    if (isReadOnlyMode) return;
    onChange?.(
      products.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };

  const handleRemove = (id) => {
    if (isReadOnlyMode) return;
    onChange?.(products.filter((p) => p.id !== id));
  };

  const handleUsageToggle = (product, shouldUse) => {
    if (isReadOnlyMode || !activeStageLabel) return;
    const currentList = Array.isArray(products) ? products : [];

    if (shouldUse) {
      if (product.__origin === "current") return;
      const alreadyImported = currentList.some(
        (p) =>
          String(p?.etapa || "")
            .trim()
            .toLowerCase() === normalizedStage &&
          String(p?.importedFromId || "") === String(product.id),
      );
      if (alreadyImported) return;
      const sourceIndex = currentList.findIndex(
        (p) => String(p?.id) === String(product.id),
      );
      const next = [...currentList];
      const clonedProduct = {
        ...product,
        id: Date.now() + Math.random(),
        etapa: String(activeStageLabel).trim(),
        importedFromId: product.id,
      };
      const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : next.length;
      next.splice(insertAt, 0, clonedProduct);
      onChange?.(next);
      return;
    }

    if (product.__origin === "current") {
      onChange?.(currentList.filter((p) => p.id !== product.id));
      return;
    }

    onChange?.(
      currentList.filter(
        (p) =>
          !(
            String(p?.etapa || "")
              .trim()
              .toLowerCase() === normalizedStage &&
            String(p?.importedFromId || "") === String(product.id)
          ),
      ),
    );
  };

  const grandTotal = visibleProducts.reduce((acc, p) => acc + calcTotal(p), 0);

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
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
          {labels.title}
        </span>
        {!isReadOnlyMode && (
          <button type="button" className={styles.addBtn} onClick={handleAdd}>
            {labels.addButton}
          </button>
        )}
      </div>

      {!isReadOnlyMode && visibleProducts.length > 0 && (
        <div className={styles.selectionBar}>
          <span className={styles.selectionHint}>
            Marque os atributos que serão utilizados neste passo.
          </span>
        </div>
      )}

      {visibleProducts.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>{labels.emptyIcon}</span>
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
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {!isReadOnlyMode && <th className={styles.selCol}></th>}
                <th>{labels.columns.item}</th>
                <th className={styles.numCol}>{labels.columns.quantity}</th>
                <th className={styles.numCol}>{labels.columns.unit}</th>
                <th className={styles.numCol}>{labels.columns.price}</th>
                <th className={styles.numCol}>{labels.columns.discount}</th>
                <th>{labels.columns.justification}</th>
                <th className={styles.numCol}>{labels.columns.total}</th>
                {!isReadOnlyMode && <th className={styles.actCol}></th>}
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => (
                <tr key={p.id}>
                  {!isReadOnlyMode && (
                    <td className={styles.selCol}>
                      <input
                        type="checkbox"
                        className={styles.rowSelector}
                        checked={isUsedInCurrentStep(p)}
                        onChange={(e) => handleUsageToggle(p, e.target.checked)}
                        title="Selecionar atributo"
                        aria-label="Selecionar atributo"
                      />
                    </td>
                  )}
                  <td>
                    <input
                      className={styles.inlineInput}
                      value={p.nome}
                      onChange={(e) =>
                        handleChange(p.id, "nome", e.target.value)
                      }
                      placeholder={labels.itemPlaceholder}
                      disabled={isReadOnlyMode}
                    />
                  </td>
                  <td className={styles.numCol}>
                    <input
                      className={`${styles.inlineInput} ${styles.narrow}`}
                      type="number"
                      min="0"
                      value={p.quantidade}
                      onChange={(e) =>
                        handleChange(p.id, "quantidade", e.target.value)
                      }
                      disabled={isReadOnlyMode}
                    />
                  </td>
                  <td className={styles.numCol}>
                    <input
                      className={`${styles.inlineInput} ${styles.narrow}`}
                      value={p.unidade}
                      onChange={(e) =>
                        handleChange(p.id, "unidade", e.target.value)
                      }
                      placeholder={labels.unitPlaceholder}
                      disabled={isReadOnlyMode}
                    />
                  </td>
                  <td className={styles.numCol}>
                    <input
                      className={`${styles.inlineInput} ${styles.narrow}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={p.precoUnitario}
                      onChange={(e) =>
                        handleChange(p.id, "precoUnitario", e.target.value)
                      }
                      placeholder="0,00"
                      disabled={isReadOnlyMode}
                    />
                  </td>
                  <td className={styles.numCol}>
                    <input
                      className={`${styles.inlineInput} ${styles.narrow}`}
                      type="number"
                      min="0"
                      max="100"
                      value={p.desconto}
                      onChange={(e) =>
                        handleChange(p.id, "desconto", e.target.value)
                      }
                      disabled={isReadOnlyMode}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.inlineInput}
                      value={p.justificativa || ""}
                      onChange={(e) =>
                        handleChange(p.id, "justificativa", e.target.value)
                      }
                      placeholder="Motivo, regra ou observação do atributo"
                      disabled={isReadOnlyMode}
                    />
                  </td>
                  <td className={`${styles.numCol} ${styles.totalCell}`}>
                    {formatCurrency(calcTotal(p))}
                  </td>
                  {!isReadOnlyMode && (
                    <td className={styles.actCol}>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => handleRemove(p.id)}
                        title={labels.removeTitle}
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
                <td
                  colSpan={isReadOnlyMode ? 6 : 7}
                  className={styles.grandTotalLabel}
                >
                  {labels.columns.grandTotal}
                </td>
                <td className={`${styles.numCol} ${styles.grandTotalValue}`}>
                  {formatCurrency(grandTotal)}
                </td>
                {!isReadOnlyMode && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProductsCard;
