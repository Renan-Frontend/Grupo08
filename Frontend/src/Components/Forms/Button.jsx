import React from 'react';
import styles from './Button.module.css';

const Button = ({ children, className, ...props }) => {
  const cls = [styles.button, className].filter(Boolean).join(' ');
  return (
    <button {...props} className={cls}>
      {children}
    </button>
  );
};

export default Button;
