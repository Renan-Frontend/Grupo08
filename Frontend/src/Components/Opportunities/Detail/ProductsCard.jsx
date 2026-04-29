import React from "react";
import styles from "./ProductsCard.module.css";

const EMPTY_PRODUCT = () => ({
  id: Date.now() + Math.random(),
  nome: "",
  quantidade: 1,
  precoUnitario: "",
  desconto: 0,
  unidade: "",
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

const ProductsCard = ({
  products = [],
  onChange = null,
  isReadOnlyMode = false,
}) => {
  const handleAdd = () => {
    if (isReadOnlyMode) return;
    onChange?.([...products, EMPTY_PRODUCT()]);
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

  const grandTotal = products.reduce((acc, p) => acc + calcTotal(p), 0);

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
          Produtos
        </span>
        {!isReadOnlyMode && (
          <button type="button" className={styles.addBtn} onClick={handleAdd}>
            + Adicionar produto
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>📦</span>
          <p>Nenhum produto adicionado.</p>
          {!isReadOnlyMode && (
            <button
              type="button"
              className={styles.emptyAddBtn}
              onClick={handleAdd}
            >
              + Adicionar produto
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Produto / Serviço</th>
                <th className={styles.numCol}>Qtd</th>
                <th className={styles.numCol}>Unidade</th>
                <th className={styles.numCol}>Preço unit.</th>
                <th className={styles.numCol}>Desconto %</th>
                <th className={styles.numCol}>Total</th>
                {!isReadOnlyMode && <th className={styles.actCol}></th>}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input
                      className={styles.inlineInput}
                      value={p.nome}
                      onChange={(e) =>
                        handleChange(p.id, "nome", e.target.value)
                      }
                      placeholder="Nome do produto ou serviço"
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
                      placeholder="un, kg..."
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
                  <td className={`${styles.numCol} ${styles.totalCell}`}>
                    {formatCurrency(calcTotal(p))}
                  </td>
                  {!isReadOnlyMode && (
                    <td className={styles.actCol}>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => handleRemove(p.id)}
                        title="Remover produto"
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
                  colSpan={isReadOnlyMode ? 5 : 5}
                  className={styles.grandTotalLabel}
                >
                  Total geral
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
