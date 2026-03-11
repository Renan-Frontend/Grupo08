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
const Pagination = ({
  page,
  limit,
  total,
  hasNext,
  hasPrev,
  onPageChange,
  currentPage,
  totalPages,
  onPrevious,
  onNext,
}) => {
  const resolvedCurrentPage = Number(currentPage ?? page ?? 1) || 1;
  const resolvedTotalPages =
    Number(totalPages) ||
    Math.ceil(Number(total || 0) / Number(limit || 1)) ||
    1;
  const resolvedHasPrev =
    typeof hasPrev === 'boolean' ? hasPrev : resolvedCurrentPage > 1;
  const resolvedHasNext =
    typeof hasNext === 'boolean'
      ? hasNext
      : resolvedCurrentPage < resolvedTotalPages;

  const handlePrevious = () => {
    if (typeof onPrevious === 'function') {
      onPrevious();
      return;
    }
    if (typeof onPageChange === 'function') {
      onPageChange(resolvedCurrentPage - 1);
    }
  };

  const handleNext = () => {
    if (typeof onNext === 'function') {
      onNext();
      return;
    }
    if (typeof onPageChange === 'function') {
      onPageChange(resolvedCurrentPage + 1);
    }
  };

  return (
    <div className={styles.pagination}>
      <button
        type="button"
        className={styles.pageButton}
        onClick={handlePrevious}
        disabled={!resolvedHasPrev}
      >
        Anterior
      </button>
      <span className={styles.pageInfo}>
        Página {resolvedCurrentPage} de {resolvedTotalPages}
      </span>
      <button
        type="button"
        className={styles.pageButton}
        onClick={handleNext}
        disabled={!resolvedHasNext}
      >
        Próxima
      </button>
    </div>
  );
};

export default Pagination;
