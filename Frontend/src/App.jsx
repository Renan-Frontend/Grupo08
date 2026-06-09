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
import { ContatosPage as Contatos } from "./Components/Contatos/ContatosPage";
import { ProcessosPage as Processos } from "./Components/Processos/Processos";
import { isDemoMode } from "./config/demoMode";

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
const Condicoes = React.lazy(() => import("./Components/Condicoes/Condicoes"));
const DocumentosProcessoPage = React.lazy(
  () => import("./Components/Documentos/DocumentosProcessoPage"),
);
const ActivityDashboard = React.lazy(
  () => import("./Components/Activities/ActivityDashboard"),
);
const Configuracoes = React.lazy(
  () => import("./Components/Configuracoes/Configuracoes"),
);
const Tutorial = React.lazy(() => import("./Components/Tutorial/Tutorial"));

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
  const hasSessionToken = React.useMemo(() => {
    try {
      return Boolean(
        window.sessionStorage.getItem("token") ||
        window.localStorage.getItem("token"),
      );
    } catch {
      return false;
    }
  }, []);

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
  const shouldBlockPublicLogin = authLoading && hasSessionToken && !isDemoMode;

  const loginElement = shouldBlockPublicLogin ? null : isLogged || isDemoMode ? (
    <Navigate to="/tutorial" replace />
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

  if (authLoading && hasSessionToken && !isDemoMode) {
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
      {isDemoMode && isLogged && (
        <div className="demoBanner" role="status">
          <span className="demoBannerIcon">◆</span>
          Modo demonstração — acesso automático com dados de exemplo.
        </div>
      )}
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
            <Route path="/tarefas" element={<Activities />} />
            <Route
              path="/atividades"
              element={<Navigate to="/tarefas" replace />}
            />
            <Route path="/condicoes" element={<Condicoes />} />
            <Route
              path="/documentos-processo"
              element={<DocumentosProcessoPage />}
            />
            <Route
              path="/documento-processo"
              element={<Navigate to="/documentos-processo" replace />}
            />
            <Route
              path="/condiçoes"
              element={<Navigate to="/condicoes" replace />}
            />
            <Route
              path="/condicoes/*"
              element={<Navigate to="/condicoes" replace />}
            />
            <Route path="/tarefas/dashboard" element={<ActivityDashboard />} />
            <Route
              path="/atividades/dashboard"
              element={<Navigate to="/tarefas/dashboard" replace />}
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
            <Route path="/tutorial" element={<Tutorial />} />
            <Route path="*" element={<Navigate to="/tutorial" replace />} />
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
