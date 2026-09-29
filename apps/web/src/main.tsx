import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@/md';
import App from './App';
import './index.css';
import { initAppFullscreen } from '@/lib/appFullscreen';

registerSW({ immediate: true });
// before the router reads the URL: strips ?app=android and arms the fullscreen fallback
initAppFullscreen();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
