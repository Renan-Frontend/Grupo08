import React from 'react';
import styles from './Sidebar.module.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserContext } from '../../Context/UserContext';
import {
  isReadOnlyAccessLevelOne,
  canCreateByAccessLevel,
} from '../../Utils/accessControl';
import Button from '../Forms/Button';

const Sidebar = ({ onNavigateItem }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userLogout, user } = React.useContext(UserContext);
  const isReadOnlyMode = isReadOnlyAccessLevelOne(user);
  const canCreate = canCreateByAccessLevel(user);
  const isAdmin = user?.admin === true || user?.role === 'admin';

  const handleNavigation = (path) => {
    navigate(path);
    onNavigateItem?.();
  };

  const handleCreateGerarBpmn = () => {
    try {
      window.localStorage.removeItem('bpmn_editor_create_draft_v1');
    } catch {}
    navigate('/gerar-bpmn/criar');
    onNavigateItem?.();
  };

  const handleLogout = () => {
    userLogout();
    navigate('/');
    onNavigateItem?.();
  };

  const isActive = (path) => {
    if (path === '/usuarios') {
      return location.pathname === '/usuarios' ? styles.active : '';
    }
    return location.pathname === path ? styles.active : '';
  };

  const isUsuariosCreating = () => {
    return location.pathname === '/usuarios/criar' ? styles.active : '';
  };

  const isEntidadesActive = () => {
    // Ativar Entidades exceto quando estiver em /entidades/criar
    if (location.pathname === '/entidades/criar') {
      return '';
    }
    return location.pathname.startsWith('/entidades') ? styles.active : '';
  };

  const isEntidadesCreating = () => {
    return location.pathname === '/entidades/criar' ? styles.active : '';
  };

  const isIaActive = () => {
    if (location.pathname === '/ia/configurar') {
      return '';
    }
    return location.pathname.startsWith('/ia') ? styles.active : '';
  };

  const isIaConfigurarActive = () => {
    return location.pathname === '/ia/configurar' ? styles.active : '';
  };

  const isGerarBpmnCreating = () => {
    return location.pathname === '/gerar-bpmn/criar' ? styles.active : '';
  };

  const isDashboardCreating = () => {
    return location.pathname === '/dashboard/criar' ? styles.active : '';
  };

  const isOportunidadesCreating = () => {
    return location.pathname === '/oportunidades/criar' ? styles.active : '';
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarSection}>
        <h3 className={styles.sidebarTitle}>Menu</h3>
        <ul className={styles.menuList}>
          <li className={`${styles.menuItem} ${isActive('/gerar-bpmn')}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation('/gerar-bpmn')}
            >
              <span className={styles.icon}>🤖</span>
              Gerar BPMN
            </div>
            <div className={styles.addButtonWrapper}>
              {!isReadOnlyMode ? (
                <button
                  className={`${styles.addButton} ${isGerarBpmnCreating()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateGerarBpmn();
                  }}
                  title="Criar BPMN"
                >
                  +
                </button>
              ) : null}
            </div>
          </li>
          <li className={`${styles.menuItem} ${isActive('/dashboard')}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation('/dashboard')}
            >
              <span className={styles.icon}>📄</span>
              Dashboard
            </div>
            <div className={styles.addButtonWrapper}>
              {canCreate ? (
                <button
                  className={`${styles.addButton} ${isDashboardCreating()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigation('/dashboard/criar');
                  }}
                  title="Criar Dashboard"
                >
                  +
                </button>
              ) : null}
            </div>
          </li>
          <li className={`${styles.menuItem} ${isIaActive()}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation('/ia')}
            >
              <span className={styles.icon}>✨</span>
              IA BPMN
            </div>
            <div className={styles.addButtonWrapper}>
              {!isReadOnlyMode ? (
                <button
                  className={`${styles.addButton} ${isIaConfigurarActive()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigation('/ia/configurar');
                  }}
                  title="Criar Processo"
                >
                  +
                </button>
              ) : null}
            </div>
          </li>
          <li className={`${styles.menuItem} ${isActive('/usuarios')}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation('/usuarios')}
            >
              <span className={styles.icon}>👥</span>
              Usuários
            </div>
            <div className={styles.addButtonWrapper}>
              {isAdmin ? (
                <button
                  className={`${styles.addButton} ${isUsuariosCreating()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigation('/usuarios/criar');
                  }}
                  title="Criar Usuário"
                >
                  +
                </button>
              ) : null}
            </div>
          </li>
          <li className={`${styles.menuItem} ${isEntidadesActive()}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation('/entidades')}
            >
              <span className={styles.icon}>🏫</span>
              Entidades
            </div>
            <div className={styles.addButtonWrapper}>
              {!isReadOnlyMode ? (
                <button
                  className={`${styles.addButton} ${isEntidadesCreating()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigation('/entidades/criar');
                  }}
                  title="Criar Entidade"
                >
                  +
                </button>
              ) : null}
            </div>
          </li>
          <li className={`${styles.menuItem} ${isActive('/oportunidades')}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation('/oportunidades')}
            >
              <span className={styles.icon}>💼</span>
              Oportunidades
            </div>
            <div className={styles.addButtonWrapper}>
              {!isReadOnlyMode ? (
                <button
                  className={`${styles.addButton} ${isOportunidadesCreating()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigation('/oportunidades/criar');
                  }}
                  title="Criar Oportunidade"
                >
                  +
                </button>
              ) : null}
            </div>
          </li>
          <li className={`${styles.menuItem} ${isActive('/workflows')}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation('/workflows')}
            >
              <span className={styles.icon}>🔄</span>
              Workflows
            </div>
          </li>
          <li className={`${styles.menuItem} ${isActive('/documentos')}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation('/documentos')}
            >
              <span className={styles.icon}>📄</span>
              Documentos
            </div>
          </li>
        </ul>
      </div>

      <div className={styles.sidebarFooter}>
        <span className={styles.footerIcon}>👤</span>
        <span className={styles.footerText}>
          {user?.nome || user?.username || 'Usuário'}
        </span>
        <Button
          className={styles.logoutButton}
          onClick={handleLogout}
          title="Sair da conta"
        >
          Sair
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
