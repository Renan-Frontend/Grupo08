import React from 'react';
import styles from './Login.module.css';

const LoginLayout = ({ children }) => {
  return (
    <section className={styles.login}>
      <div className={styles.forms}>{children}</div>
    </section>
  );
};

export default LoginLayout;
