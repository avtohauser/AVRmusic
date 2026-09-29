import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/stores/auth';
import { Mascot, type MascotMood } from './Mascot';

const KEY = 'avr.booted';

/**
 * Launch screen: the star pops in, spins while the app starts, then bursts and hands over to the UI.
 * Shown once per session (every cold start of the Android app, first load of a browser tab).
 */
export function BootSplash() {
  const ready = useAuth((s) => s.ready);
  const [show, setShow] = useState(() => { try { return !sessionStorage.getItem(KEY); } catch { return true; } });
  const [mood, setMood] = useState<MascotMood>('hello');
  const [leaving, setLeaving] = useState(false);
  const [burst, setBurst] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setMood('think'), 1000);
    return () => clearTimeout(id);
  }, [show]);

  useEffect(() => {
    if (!show || !ready) return;
    const wait = Math.max(0, 1400 - (Date.now() - started.current));
    const t1 = setTimeout(() => { setMood('idle'); setBurst((b) => b + 1); }, wait);
    const t2 = setTimeout(() => setLeaving(true), wait + 380);
    const t3 = setTimeout(() => { setShow(false); try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } }, wait + 820);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [ready, show]);

  if (!show) return null;
  return (
    <div className={`boot-splash ${leaving ? 'leaving' : ''}`} aria-hidden="true">
      <Mascot mood={mood} burst={burst} className="w-28 h-28" />
      <div className="boot-word md-headline-sm emph">AVRmusic</div>
    </div>
  );
}
