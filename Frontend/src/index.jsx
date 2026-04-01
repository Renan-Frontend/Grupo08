import ReactDOM from 'react-dom/client';
import App from './App';

// Em dev, desregistra qualquer service worker antigo para evitar interceptações do Workbox
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => reg.unregister());
  });
}

// Quando um chunk dinâmico falha (chunk hash mudou após novo deploy),
// recarrega a página para que o SW sirva o index.html atualizado.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
