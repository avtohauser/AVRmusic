// Flowing type: every letter of a heading drifts through the variable-font axes (weight, width,
// roundness) in a slow wave while the heading is on screen, after "pouring in" when it first appears
// or its text changes. Google Sans Flex for Latin, Roboto Flex for Cyrillic.
//
// Smooth and cheap: the wave advances every display frame through a fixed set of axis settings that the
// browser keeps as cached font instances (see .flow in index.css), and a looping heading gets a frozen
// box (`contain: size layout paint` + its measured height), so moving letters never re-lay out the page
// around it. Headings that can't be boxed (inline or flex items) only pour in once.
// Paused off-screen and while scrolling; static with prefers-reduced-motion.
import { createElement, useEffect, useMemo, useRef, type CSSProperties } from 'react';

type Tag = 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'p';

const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s: string) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// While any scroll is going on the waves hold still, so scrolling gets the whole frame budget.
let scrolling = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('scroll', () => {
    clearTimeout(scrolling);
    scrolling = window.setTimeout(() => { scrolling = 0; }, 180);
  }, { capture: true, passive: true });
}

/**
 * One frame loop for every flowing heading on screen. The wave has POSITIONS fixed settings per turn
 * (1.5° apart); because they repeat, the browser keeps them as cached font instances. The heading
 * moves on every display frame as long as frames arrive on time; when the device starts missing
 * frames the wave updates every 2nd/3rd/4th frame instead (the steps are tiny, it still looks fluid),
 * so the flowing text never makes the app stutter — and speeds back up when there is headroom.
 */
const POSITIONS = 240;
const waves = new Map<HTMLElement, { period: number; pos: number }>();
let raf = 0;
let prev = 0;       // time of the previous frame
let refresh = 1000; // shortest frame interval seen ≈ the display's refresh interval
let skip = 1;       // update the wave every `skip` frames
let frameNo = 0;
let late = 0;       // recent frames that came late
let onTime = 0;     // frames in a row that came on time
function frame(now: number) {
  raf = 0;
  if (!waves.size) return;
  const gap = prev ? now - prev : 0;
  prev = now;
  if (gap > 0 && gap < 60 && !scrolling) {
    refresh = Math.max(6, Math.min(refresh, gap));
    if (gap > refresh * 1.6) { onTime = 0; if (++late >= 3 && skip < 4) { skip++; late = 0; } }
    else if (++onTime > 90 && skip > 1) { skip--; onTime = 0; late = 0; }
  }
  if (!scrolling && !document.hidden && ++frameNo % skip === 0) {
    waves.forEach((w, el) => {
      const pos = Math.floor(((now / w.period) % 1) * POSITIONS);
      if (pos !== w.pos) { w.pos = pos; el.style.setProperty('--t', String(pos)); }
    });
  }
  raf = requestAnimationFrame(frame);
}
function startWave(el: HTMLElement, seconds: number) {
  waves.set(el, { period: seconds * 1000, pos: -1 });
  if (!raf) raf = requestAnimationFrame(frame);
}
function stopWave(el: HTMLElement) {
  waves.delete(el);
  if (!waves.size && raf) { cancelAnimationFrame(raf); raf = 0; prev = 0; }
}

/** Can the element be boxed (block-level and not a flex/grid item)? */
function boxable(el: HTMLElement) {
  const d = getComputedStyle(el).display;
  const p = el.parentElement ? getComputedStyle(el.parentElement).display : 'block';
  return /^(block|flow-root|-webkit-box|flex|grid)$/.test(d) && !/(flex|grid)$/.test(p);
}

interface Props {
  text: string;
  as?: Tag;
  className?: string;
  style?: CSSProperties;
  /** pour the letters in when the text appears (default true) */
  intro?: boolean;
  /** keep flowing while on screen (default true; only for block-level headings) */
  loop?: boolean;
  /** seconds per wave (default 5.4) */
  speed?: number;
}

export function FlowText({ text, as = 'span', className = '', style, intro = true, loop = true, speed }: Props) {
  const ref = useRef<HTMLElement>(null);
  const words = useMemo(() => text.split(/(\s+)/).filter(Boolean).map((w) => (/^\s+$/.test(w) ? null : graphemes(w))), [text]);
  const count = useMemo(() => words.reduce((n, w) => n + (w?.length ?? 0), 0), [words]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) { el.dataset.flow = 'static'; return; }
    const looping = loop && boxable(el);
    let visible = true;
    let introRunning = intro;
    let timer = 0;
    let width = 0;
    const settle = () => {
      if (introRunning) return;
      const on = looping && visible;
      el.dataset.flow = looping ? (on ? 'on' : 'paused') : 'static';
      if (on) startWave(el, speed ?? 5.4); else stopWave(el);
    };

    // freeze the box at its resting size; measured again when the width or the fonts change
    const box = () => {
      if (!looping) return;
      const state = el.dataset.flow;
      el.classList.remove('flow-box');
      el.style.height = '';
      el.dataset.flow = 'static';
      const h = el.getBoundingClientRect().height;
      el.dataset.flow = state;
      if (h > 0) { el.style.height = `${Math.ceil(h)}px`; el.classList.add('flow-box'); }
    };
    box();
    document.fonts?.ready.then(() => { if (ref.current === el) box(); });
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w !== width) { width = w; box(); }
    });
    ro.observe(el);

    if (intro) { el.dataset.flow = 'in'; timer = window.setTimeout(() => { introRunning = false; settle(); }, 900 + count * 45); }
    else settle();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; settle(); });
    io.observe(el);
    return () => { io.disconnect(); ro.disconnect(); clearTimeout(timer); stopWave(el); el.classList.remove('flow-box'); el.style.height = ''; };
  }, [text, intro, loop, count, speed]);

  let i = 0;
  const children = words.map((w, wi) =>
    w === null ? ' ' : (
      <span key={wi} className="flow-w">
        {w.map((g) => { const n = i++; return <span key={n} className="flow-c" style={{ ['--i' as any]: n }}>{g}</span>; })}
      </span>
    ),
  );
  return createElement(
    as,
    { ref, className: `flow ${className}`, style, 'aria-label': text, 'data-flow': intro ? 'in' : 'static' },
    <span aria-hidden="true">{children}</span>,
  );
}
