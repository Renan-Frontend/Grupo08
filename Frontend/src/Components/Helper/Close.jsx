import React from "react";
import styles from "./Close.module.css";

const Close = ({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  hideCancel = false,
  hideActions = false,
  closeOnOverlay = false,
  children = null,
}) => {
  const handleCancel = () => {
    onCancel?.();
  };

  return (
    <div
      className={styles.overlay}
      onClick={closeOnOverlay ? handleCancel : undefined}
    >
      <div
        className={styles.modal}
        onClick={
          closeOnOverlay ? (event) => event.stopPropagation() : undefined
        }
      >
        <button className={styles.closeButton} onClick={handleCancel}>
          ×
        </button>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        {children ? <div className={styles.content}>{children}</div> : null}
        {!hideActions ? (
          <div
            className={`${styles.buttons} ${hideCancel ? styles.singleButton : ""}`}
          >
            {!hideCancel ? (
              <button className={styles.cancelButton} onClick={handleCancel}>
                {cancelLabel}
              </button>
            ) : null}
            <button className={styles.confirmButton} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Close;
