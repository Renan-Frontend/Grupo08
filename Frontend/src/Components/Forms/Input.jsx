import React from 'react';
import styles from './Input.module.css';

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
}) => {
  return (
    <div className={styles.wrapper}>
      {!placeholder && (
        <label htmlFor={name} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.inputWrapper}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          id={name}
          name={name}
          className={icon ? styles.inputWithIcon : styles.input}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder || label}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
};

export default Input;
