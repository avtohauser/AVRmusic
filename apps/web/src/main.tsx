import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@/md';
import App from './App';
import './index.css';
import { initAppFullscreen } from '@/lib/appFullscreen';
import { initNativeApp } from '@/lib/native';

registerSW({ immediate: true });
// the Android app: safe areas + messages from its player, before anything renders
initNativeApp();
// before the router reads the URL: strips ?app=android and arms the fullscreen fallback (older app versions)
initAppFullscreen();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
