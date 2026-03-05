import React from 'react';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './Components/Header';
import Footer from './Components/Footer';
import Navigation from './Components/Layout/Navigation';
import Login from './Components/Login/Login';
import Dashboard from './Components/Home/Dashboard';
import PagePlaceholder from './Components/Home/PagePlaceholder';
import GerarBPMN from './Components/GerarBPMN/GerarBPMN';
import OpportunitiesRoutes from './Components/Opportunities/OpportunitiesRoutes';
import Entidades from './Components/Entidades/Entidades';
import CriarEntidades from './Components/Entidades/CriarEntidades';
import Usuarios from './Components/Usuários/Usuarios';
import { UserContext } from './Context/UserContext';
import { UserStorage } from './Context/UserContext';
import { EntidadesProvider } from './Context/EntidadesContext';
import ProtectedRoute from './Components/Helper/ProtectedRoute';

function AppContent() {
  const { user, authLoading } = React.useContext(UserContext);
  const isLogged = !!user;
  const loginElement = authLoading ? null : isLogged ? (
    <Navigate to="/gerar-bpmn" replace />
  ) : (
    <Login isLogged={isLogged} />
  );
  const protectedNavigation = (
    <ProtectedRoute>
      <Navigation />
    </ProtectedRoute>
  );

  React.useEffect(() => {
    if (isLogged) {
      document.body.classList.add('with-header');
    } else {
      document.body.classList.remove('with-header');
    }
  }, [isLogged]);

  if (authLoading) {
    return (
      <div className="authLoadingScreen" role="status" aria-live="polite">
        <div className="authLoadingCard">
          <div className="authLoadingSpinner" aria-hidden="true" />
          <p className="authLoadingTitle">Carregando sua sessão...</p>
          <p className="authLoadingSubtitle">Aguarde um instante.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {isLogged && <Header />}

      <Routes>
        {/* rotas públicas */}
        <Route path="/" element={loginElement} />
        <Route path="/login" element={loginElement} />
        <Route path="/login/criar" element={loginElement} />
        <Route path="/login/perdeu" element={loginElement} />
        <Route path="/login/resetar" element={loginElement} />

        {/* rotas protegidas */}
        <Route element={protectedNavigation}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/entidades" element={<Entidades />} />
          <Route path="/entidades/:entidadeSlug" element={<Entidades />} />
          <Route path="/entidades/criar" element={<CriarEntidades />} />
          <Route
            path="/entidadesdes/criar"
            element={<Navigate to="/entidades/criar" replace />}
          />
          <Route
            path="/contatos"
            element={
              <PagePlaceholder
                title="Contatos"
                icon="📋"
                description="Gerenciamento de contatos de clientes"
              />
            }
          />
          <Route
            path="/contas"
            element={
              <PagePlaceholder
                title="Contas"
                icon="📞"
                description="Gerenciamento de contas e relacionamentos"
              />
            }
          />
          <Route path="/oportunidades/*" element={<OpportunitiesRoutes />} />
          <Route
            path="/concorrentes"
            element={
              <PagePlaceholder
                title="Concorrentes"
                icon="🤝"
                description="Análise de concorrência e mercado"
              />
            }
          />
          <Route path="/gerar-bpmn/*" element={<GerarBPMN />} />
          <Route
            path="/gerarbpmn/*"
            element={<Navigate to="/gerar-bpmn" replace />}
          />
          <Route
            path="/recomendacoes"
            element={
              <PagePlaceholder
                title="Recomendações da inteligência artificial"
                icon="💡"
                description="Recomendações geradas pela IA"
              />
            }
          />
          <Route path="*" element={<Navigate to="/gerar-bpmn" replace />} />
        </Route>
      </Routes>

      {isLogged && <Footer />}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <UserStorage>
        <EntidadesProvider>
          <AppContent />
        </EntidadesProvider>
      </UserStorage>
    </BrowserRouter>
  );
}

export default App;
