import React from "react";
import styles from "./Sidebar.module.css";
import { useNavigate, useLocation } from "react-router-dom";
import { UserContext } from "../../Context/UserContext";
import Button from "../Forms/Button";

const Sidebar = ({ onNavigateItem }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userLogout, user } = React.useContext(UserContext);

  const handleNavigation = (path, state) => {
    navigate(path, state ? { state } : undefined);
    onNavigateItem?.();
  };

  const handleLogout = () => {
    userLogout();
    navigate("/");
    onNavigateItem?.();
  };

  const isExactActive = (path) =>
    location.pathname === path ? styles.active : "";

  const isPrefixActive = (pathPrefix) =>
    location.pathname.startsWith(pathPrefix) ? styles.active : "";

  const isIaBpmnActive = () => {
    if (location.pathname === "/ia/configurar") {
      return "";
    }
    return location.pathname.startsWith("/ia") ? styles.active : "";
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarSection}>
        <ul className={styles.menuList}>
          <li className={`${styles.menuItem} ${isExactActive("/tutorial")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/tutorial")}
            >
              <span className={styles.icon}>🗺️</span>
              Tutorial
            </div>
          </li>
        </ul>
      </div>

      <div className={styles.sidebarSection}>
        <h3 className={styles.sidebarTitle}>OPERAÇÃO</h3>
        <ul className={styles.menuList}>
          <li className={`${styles.menuItem} ${isPrefixActive("/gerar-bpmn")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/gerar-bpmn")}
            >
              <span className={styles.icon}>🤖</span>
              Gerar Fluxograma
            </div>
          </li>
          <li className={`${styles.menuItem} ${isPrefixActive("/cadastros")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/cadastros")}
            >
              <span className={styles.icon}>🧩</span>
              Cadastros
            </div>
          </li>
          <li
            className={`${styles.menuItem} ${isPrefixActive("/oportunidades")}`}
          >
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/oportunidades")}
            >
              <span className={styles.icon}>💼</span>
              Oportunidades
            </div>
          </li>
          <li
            className={`${styles.menuItem} ${isPrefixActive("/documentos-processo")}`}
          >
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/documentos-processo")}
            >
              <span className={styles.icon}>📄</span>
              Documentos de Processo
            </div>
          </li>
        </ul>
      </div>

      <div className={styles.sidebarSection}>
        <h3 className={styles.sidebarTitle}>GESTÃO</h3>
        <ul className={styles.menuList}>
          <li className={`${styles.menuItem} ${isPrefixActive("/dashboard")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/dashboard")}
            >
              <span className={styles.icon}>📄</span>
              Painel Geral
            </div>
          </li>
          <li className={`${styles.menuItem} ${isExactActive("/leads")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/leads")}
            >
              <span className={styles.icon}>📋</span>
              Prospecções
            </div>
          </li>
        </ul>
      </div>

      <div className={styles.sidebarSection}>
        <h3 className={styles.sidebarTitle}>COMERCIAL</h3>
        <ul className={styles.menuList}>
          <li className={`${styles.menuItem} ${isExactActive("/contatos")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/contatos")}
            >
              <span className={styles.icon}>👤</span>
              Contatos
            </div>
          </li>
          <li className={`${styles.menuItem} ${isExactActive("/processos")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/processos")}
            >
              <span className={styles.icon}>🔄</span>
              Processos
            </div>
          </li>
          <li className={`${styles.menuItem} ${isExactActive("/tarefas")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/tarefas")}
            >
              <span className={styles.icon}>⏱️</span>
              Tarefas
            </div>
          </li>
          <li className={`${styles.menuItem} ${isExactActive("/condicoes")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/condicoes")}
            >
              <span className={styles.icon}>🔀</span>
              Condições
            </div>
          </li>
        </ul>
      </div>

      <div className={styles.sidebarSection}>
        <h3 className={styles.sidebarTitle}>ADMINISTRAÇÃO</h3>
        <ul className={styles.menuList}>
          <li className={`${styles.menuItem} ${isPrefixActive("/usuarios")}`}>
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/usuarios")}
            >
              <span className={styles.icon}>👥</span>
              Usuários
            </div>
          </li>
          <li
            className={`${styles.menuItem} ${isExactActive("/configuracoes")}`}
          >
            <div
              className={styles.menuItemContent}
              onClick={() => handleNavigation("/configuracoes")}
            >
              <span className={styles.icon}>⚙️</span>
              Configurações
            </div>
          </li>
        </ul>
      </div>

      <div className={styles.sidebarFooter}>
        <span className={styles.footerIcon}>👤</span>
        <span className={styles.footerText}>
          {user?.nome || user?.username || "Usuário"}
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
