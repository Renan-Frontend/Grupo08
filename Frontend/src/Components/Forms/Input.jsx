import React from "react";
import styles from "./Input.module.css";

const Input = ({
  label,
  type,
  name,
  value,
  onChange,
  error,
  onBlur,
  placeholder,
  icon,
  id,
  autoComplete,
}) => {
  const generatedId = React.useId();
  const normalizedBase = String(name || label || placeholder || type || "campo")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fieldName = String(name || normalizedBase || "campo");
  const fieldId = String(
    id || `${fieldName}-${generatedId.replace(/[:]/g, "")}`,
  );
  const fieldAutoComplete =
    autoComplete ||
    (type === "password"
      ? "current-password"
      : type === "email"
        ? "email"
        : "on");

  return (
    <div className={styles.wrapper}>
      {!placeholder && (
        <label htmlFor={fieldId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.inputWrapper}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          id={fieldId}
          name={fieldName}
          className={icon ? styles.inputWithIcon : styles.input}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder || label}
          autoComplete={fieldAutoComplete}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
};

export default Input;
