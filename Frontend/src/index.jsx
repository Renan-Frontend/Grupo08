import ReactDOM from 'react-dom/client';
import App from './App';

// Em dev, desregistra qualquer service worker antigo para evitar interceptações do Workbox
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => reg.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
