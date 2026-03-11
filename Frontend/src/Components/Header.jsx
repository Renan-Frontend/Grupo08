import React from 'react';
import styles from './Header.module.css';
import { Link } from 'react-router-dom';
import { UserContext } from '../Context/UserContext';

const Header = () => {
  const { user } = React.useContext(UserContext);

  return (
    <header className={styles.header}>
      <nav className={`${styles.nav} container`}>
        <Link
          className={styles.logo}
          to="/gerar-bpmn"
          aria-label="Gerar BPMN"
        ></Link>
        <div className={styles.headerRight}>
          {user ? (
            <Link className={styles.login} to="/gerar-bpmn">
              {user.nome}
            </Link>
          ) : (
            <Link className={styles.login} to="/login">
              Login / Criar
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
};

export default React.memo(Header);
