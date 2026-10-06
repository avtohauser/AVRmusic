import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/stores/auth';
import { Mascot, type MascotMood } from './Mascot';
import { Wordmark } from './Brand';

const KEY = 'avr.booted';

/**
 * Launch screen (avr music's teal with its rings): the star pops in and its waves go out, it spins while the
 * app starts, then bursts and hands over to the UI.
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
    const wait = Math.max(0, 600 - (Date.now() - started.current));
    const t1 = setTimeout(() => { setMood('idle'); setBurst((b) => b + 1); }, wait);
    const t2 = setTimeout(() => setLeaving(true), wait + 380);
    const t3 = setTimeout(() => { setShow(false); try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } }, wait + 820);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [ready, show]);

  if (!show) return null;
  return (
    <div className={`boot-splash ${leaving ? 'leaving' : ''}`} aria-hidden="true">
      <svg className="boot-rings" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g fill="none" stroke="#D3E3E4" strokeWidth="1.5">
          <circle cx="195" cy="422" r="150" strokeOpacity="0.10" /><circle cx="195" cy="422" r="220" strokeOpacity="0.07" /><circle cx="195" cy="422" r="290" strokeOpacity="0.04" />
        </g>
      </svg>
      <Mascot mood={mood} burst={burst} waves className="w-[134px] h-24 relative" />
      <Wordmark className="boot-word relative text-[44px]" />
    </div>
  );
}
