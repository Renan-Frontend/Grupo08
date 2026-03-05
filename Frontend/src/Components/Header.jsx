import React from 'react';
import styles from './Header.module.css';
import { Link } from 'react-router-dom';
import { UserContext } from '../Context/UserContext';

const Header = () => {
  const { getUser } = React.useContext(UserContext);
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const token = window.localStorage.getItem('token');
    if (token) {
      getUser(token)
        .then(setUser)
        .catch(() => setUser(null));
    } else {
      setUser(null);
    }
  }, [getUser]);

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

export default Header;
