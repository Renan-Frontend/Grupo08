import React from 'react';
import styles from './Button.module.css';

const ButtonLogin = ({ children, className, ...props }) => {
  const cls = [styles.button, className].filter(Boolean).join(' ');
  return (
    <button type="submit" {...props} className={cls}>
      {children}
    </button>
  );
};

export default ButtonLogin;
