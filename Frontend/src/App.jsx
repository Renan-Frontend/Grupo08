import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Header from "./Components/Header";
import Footer from "./Components/Footer";
import Navigation from "./Components/Layout/Navigation";
import Login from "./Components/Login/Login";
import { UserContext } from "./Context/UserContext";
import { UserStorage } from "./Context/UserContext";
import { EntidadesProvider } from "./Context/EntidadesContext";
import ProtectedRoute from "./Components/Helper/ProtectedRoute";
import { ContatosPage as Contatos } from "./Components/Contatos/Contatos";
import { ProcessosPage as Processos } from "./Components/Processos/Processos";

const DashboardRoutes = React.lazy(
  () => import("./Components/Home/DashboardRoutes"),
);
const GerarBPMN = React.lazy(() => import("./Components/GerarBPMN/GerarBPMN"));
const OpportunitiesRoutes = React.lazy(
  () => import("./Components/Opportunities/OpportunitiesRoutes"),
);
const Entidades = React.lazy(() => import("./Components/Entidades/Entidades"));
const CriarEntidades = React.lazy(
  () => import("./Components/Entidades/CriarEntidades"),
);
const Usuarios = React.lazy(() => import("./Components/Usuários/Usuarios"));
const CriarUsuario = React.lazy(
  () => import("./Components/Usuários/CriarUsuario"),
);
const IA = React.lazy(() => import("./Components/IA/Ia"));
const Leads = React.lazy(() => import("./Components/Leads/Leads"));
const Activities = React.lazy(
  () => import("./Components/Activities/Activities"),
);
const ActivityDashboard = React.lazy(
  () => import("./Components/Activities/ActivityDashboard"),
);
const Configuracoes = React.lazy(
  () => import("./Components/Configuracoes/Configuracoes"),
);

const LazyFallback = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "40vh",
    }}
  >
    <div className="authLoadingSpinner" aria-hidden="true" />
  </div>
);

function AppContent() {
  const { user, authLoading } = React.useContext(UserContext);

  // Pre-warm the Render backend on app load to reduce cold-start delay on login.
  React.useEffect(() => {
    import("./Api").then(({ API_URL }) => {
      fetch(`${API_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(60000),
      }).catch(() => {});
    });
  }, []);
  const isLogged = !!user;

  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);
  React.useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
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
      document.body.classList.add("with-header");
    } else {
      document.body.classList.remove("with-header");
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
      {isOffline && (
        <div className="offlineBanner" role="alert">
          <span className="offlineBannerIcon">⚡</span>
          Você está offline — exibindo dados em cache. Alterações não serão
          salvas até a conexão ser restaurada.
        </div>
      )}
      {isLogged && <Header />}

      <React.Suspense fallback={<LazyFallback />}>
        <Routes>
          {/* rotas públicas */}
          <Route path="/" element={loginElement} />
          <Route path="/login" element={loginElement} />
          <Route path="/login/criar" element={loginElement} />
          <Route path="/login/perdeu" element={loginElement} />
          <Route path="/login/resetar" element={loginElement} />

          {/* rotas protegidas */}
          <Route element={protectedNavigation}>
            <Route path="/dashboard/*" element={<DashboardRoutes />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/usuarios/criar" element={<CriarUsuario />} />
            <Route path="/cadastros" element={<Entidades />} />
            <Route path="/cadastros/id/:entidadeId" element={<Entidades />} />
            <Route path="/cadastros/:entidadeSlug" element={<Entidades />} />
            <Route path="/cadastros/criar" element={<CriarEntidades />} />
            <Route
              path="/entidades"
              element={<Navigate to="/cadastros" replace />}
            />
            <Route
              path="/entidades/criar"
              element={<Navigate to="/cadastros/criar" replace />}
            />
            <Route
              path="/entidadesdes/criar"
              element={<Navigate to="/cadastros/criar" replace />}
            />
            <Route path="/oportunidades/*" element={<OpportunitiesRoutes />} />
            <Route path="/contatos" element={<Contatos />} />
            <Route path="/processos" element={<Processos />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/atividades" element={<Activities />} />
            <Route
              path="/atividades/dashboard"
              element={<ActivityDashboard />}
            />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/gerar-bpmn/*" element={<GerarBPMN />} />
            <Route
              path="/gerarbpmn/*"
              element={<Navigate to="/gerar-bpmn" replace />}
            />
            <Route path="/ia/*" element={<IA />} />
            <Route
              path="/recomendacoes"
              element={<Navigate to="/ia" replace />}
            />
            <Route path="*" element={<Navigate to="/gerar-bpmn" replace />} />
          </Route>
        </Routes>
      </React.Suspense>

      {isLogged && <Footer />}
    </div>
  );
}

function App() {
  const baseUrl = String(import.meta.env.BASE_URL || "/");
  const routerBase = baseUrl.endsWith("/")
    ? baseUrl.slice(0, -1) || "/"
    : baseUrl;

  return (
    <BrowserRouter basename={routerBase === "/" ? undefined : routerBase}>
      <UserStorage>
        <EntidadesProvider>
          <AppContent />
        </EntidadesProvider>
      </UserStorage>
    </BrowserRouter>
  );
}

export default App;
