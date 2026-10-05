// Voice search with the browser's own speech recognition (Chrome, Edge, Safari); hidden where missing.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';

export function useVoiceInput(onText: (text: string) => void) {
  const Ctor = typeof window !== 'undefined' ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined;
  const [listening, setListening] = useState(false);
  const rec = useRef<any>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const lang = useI18n((s) => s.lang);
  useEffect(() => () => rec.current?.abort?.(), []);
  const start = () => {
    if (!Ctor) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Ctor();
    r.lang = lang === 'en' ? 'en-US' : 'ru-RU';
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>).map((x: any) => x[0]?.transcript ?? '').join(' ').trim();
      if (text) cb.current(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };
  return { supported: !!Ctor, listening, start };
}
