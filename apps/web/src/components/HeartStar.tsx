import { useEffect, useId, useRef, useState } from 'react';

// The heart and the avr star drawn as the same four curves — top, right, bottom, left — so one flows into
// the other: the heart's dip rises into the star's top point, its lobes into the side points, its tip
// into the bottom one. Halfway it is a soft diamond.
const HEART = [50, 28, 58, 8, 94, 6, 94, 38, 94, 62, 62, 78, 50, 94, 38, 78, 6, 62, 6, 38, 6, 6, 42, 8, 50, 28];
const STAR = [50, 2, 53, 30, 70, 47, 98, 50, 70, 53, 53, 70, 50, 98, 47, 70, 30, 53, 2, 50, 30, 47, 47, 30, 50, 2];

/** The outline [k] of the way from the heart (0) to the star (1); a spring may take it a little past either. */
export function heartStarPath(k: number): string {
  const p = HEART.map((h, i) => (h + (STAR[i] - h) * k).toFixed(2));
  const seg = (from: number) => p.slice(from, from + 6).join(' ');
  return `M${p[0]} ${p[1]}C${seg(2)} ${seg(8)} ${seg(14)} ${seg(20)}Z`;
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A value that follows [target] on a spring (the expressive spatial one by default), redrawn every frame while it moves. */
export function useSpring(target: number, stiffness = 380, dampingRatio = 0.8): number {
  const [value, setValue] = useState(target);
  const s = useRef({ x: target, v: 0, raf: 0 });
  useEffect(() => {
    const st = s.current;
    cancelAnimationFrame(st.raf);
    if (reduced()) { st.x = target; st.v = 0; setValue(target); return; }
    const damping = 2 * dampingRatio * Math.sqrt(stiffness);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      st.v += (-stiffness * (st.x - target) - damping * st.v) * dt;
      st.x += st.v * dt;
      if (Math.abs(st.x - target) < 0.002 && Math.abs(st.v) < 0.02) { st.x = target; st.v = 0; setValue(target); return; }
      setValue(st.x);
      st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(st.raf);
  }, [target, stiffness, dampingRatio]);
  return value;
}

/** Small stars flying out of an element: a superlike's burst. */
export function sparkle(from: Element, count = 8) {
  if (reduced()) return;
  const host = from.getBoundingClientRect();
  const cx = host.left + host.width / 2, cy = host.top + host.height / 2;
  for (let i = 0; i < count; i++) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 100 100');
    const size = 7 + Math.random() * 7;
    Object.assign(el.style, { position: 'fixed', left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px`, pointerEvents: 'none', zIndex: '9999' });
    el.innerHTML = `<path fill="${i % 2 ? '#F2A5C3' : '#5A4FC8'}" d="${heartStarPath(1)}"/>`;
    document.body.appendChild(el);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 22 + Math.random() * 20;
    el.animate([
      { transform: 'translate(0,0) scale(.2) rotate(0deg)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(1) rotate(90deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${Math.cos(angle) * dist * 1.3}px, ${Math.sin(angle) * dist * 1.3}px) scale(0) rotate(180deg)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.finally(() => el.remove());
  }
}

/**
 * The heart of a like, the same shape flowing into the avr star for a superlike. [filled] — liked (an empty
 * heart fills in), [star] — superliked (the full heart turns into the star, its colour into the star's gradient).
 */
export function HeartStar({ filled, star, className = 'w-6 h-6' }: { filled: boolean; star: boolean; className?: string }) {
  const id = `hs${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const k = useSpring(star ? 1 : 0);
  const f = useSpring(filled || star ? 1 : 0, 520, 0.7);
  const ref = useRef<SVGSVGElement>(null);
  const was = useRef(star);
  useEffect(() => {
    // the burst only when the star is given, not when a list first shows it
    if (star && !was.current && ref.current) sparkle(ref.current);
    was.current = star;
  }, [star]);
  const d = heartStarPath(k);
  const fill = Math.max(0, Math.min(1, f));
  const kk = Math.max(0, Math.min(1, k));
  // a filled heart pops in slightly bigger and settles; the star is a touch larger than the heart
  const scale = (0.84 + 0.16 * k) * (0.86 + 0.14 * f);
  return (
    <svg ref={ref} viewBox="0 0 100 100" className={className} aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#F2A5C3" /><stop offset="1" stopColor="#5A4FC8" /></linearGradient></defs>
      <g transform={`translate(50 50) scale(${scale.toFixed(4)}) translate(-50 -50)`}>
        {fill < 1 && <path d={d} fill="none" stroke="currentColor" strokeWidth={9} strokeLinejoin="round" opacity={1 - fill} />}
        {fill > 0 && kk < 1 && <path d={d} fill="var(--md-sys-color-primary)" opacity={fill * (1 - kk)} />}
        {fill > 0 && kk > 0 && <path d={d} fill={`url(#${id})`} opacity={fill * kk} />}
      </g>
    </svg>
  );
}
