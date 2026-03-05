import React from 'react';
import styles from './Pagination.module.css';

/**
 * Pagination component reutilizável
 * Props:
 * - page: página atual (number)
 * - limit: itens por página (number)
 * - total: total de itens (number)
 * - hasNext: boolean (se há próxima página)
 * - hasPrev: boolean (se há página anterior)
 * - onPageChange: function (callback para mudar de página)
 */
const Pagination = ({ page, limit, total, hasNext, hasPrev, onPageChange }) => {
  const totalPages = Math.ceil(total / limit) || 1;
  return (
    <div className={styles.pagination}>
      <button
        type="button"
        className={styles.pageButton}
        onClick={() => onPageChange(page - 1)}
        disabled={!hasPrev}
      >
        Anterior
      </button>
      <span className={styles.pageInfo}>
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        className={styles.pageButton}
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNext}
      >
        Próxima
      </button>
    </div>
  );
};

export default Pagination;
