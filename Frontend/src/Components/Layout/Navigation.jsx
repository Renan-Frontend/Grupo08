import React from 'react';
import { Outlet } from 'react-router-dom';
import styles from './Navigation.module.css';

import Sidebar from './Sidebar';

const Navigation = () => {
  const getIsMobileViewport = React.useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 1024;
  }, []);

  const [isMobile, setIsMobile] = React.useState(() => {
    return getIsMobileViewport();
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [isDesktopSidebarHidden, setIsDesktopSidebarHidden] = React.useState(
    () => {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem('desktopSidebarHidden') === 'true';
    },
  );

  React.useEffect(() => {
    const handleViewportChange = () => {
      const mobileViewport = getIsMobileViewport();
      setIsMobile(mobileViewport);
      if (!mobileViewport) {
        setIsMobileSidebarOpen(false);
      }
    };

    handleViewportChange();

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, [getIsMobileViewport]);

  const handleToggleMobileSidebar = () => {
    setIsMobileSidebarOpen((previous) => !previous);
  };

  const handleCloseMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const handleToggleDesktopSidebar = () => {
    setIsDesktopSidebarHidden((previous) => !previous);
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      'desktopSidebarHidden',
      String(isDesktopSidebarHidden),
    );
    window.dispatchEvent(new Event('desktopSidebarHiddenChange'));
  }, [isDesktopSidebarHidden]);

  const shouldShowSidebar = isMobile
    ? isMobileSidebarOpen
    : !isDesktopSidebarHidden;

  return (
    <div
      className={`${styles.dashboardWrapper} ${
        isMobile && isMobileSidebarOpen ? styles.dashboardWrapperMobileOpen : ''
      }`}
    >
      {!isMobile ? (
        <button
          className={`${styles.desktopSidebarToggle} ${
            isDesktopSidebarHidden ? styles.desktopSidebarToggleHidden : ''
          }`}
          data-tutorial-id="desktop-sidebar-toggle"
          onClick={handleToggleDesktopSidebar}
          aria-label={
            isDesktopSidebarHidden
              ? 'Mostrar menu lateral'
              : 'Ocultar menu lateral'
          }
          title={
            isDesktopSidebarHidden
              ? 'Mostrar menu lateral'
              : 'Ocultar menu lateral'
          }
        >
          {isDesktopSidebarHidden ? '▸' : '◂'}
        </button>
      ) : null}

      {isMobile ? (
        <button
          className={styles.mobileMenuToggle}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleToggleMobileSidebar();
          }}
          aria-label={isMobileSidebarOpen ? 'Fechar menu' : 'Abrir menu'}
          title={isMobileSidebarOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          {isMobileSidebarOpen ? '✕' : '☰'}
        </button>
      ) : null}

      {shouldShowSidebar ? (
        <Sidebar onNavigateItem={handleCloseMobileSidebar} />
      ) : null}

      <main
        className={`${styles.mainContent} ${
          !isMobile && isDesktopSidebarHidden ? styles.mainContentExpanded : ''
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default Navigation;
