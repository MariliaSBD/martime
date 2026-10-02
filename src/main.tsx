import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App';
import { AppProvider } from './state/app';
import { ToastProvider } from './components/ui';
import { registerServiceWorker } from './lib/pwa';

createRoot(document.getElementById('root')!).render(
  <AppProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </AppProvider>,
);

registerServiceWorker();
