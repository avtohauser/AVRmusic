// Flowing type: every letter of a heading drifts through the variable-font axes (weight, width,
// roundness) in a slow wave while the heading is on screen, after "pouring in" when it first appears
// or its text changes. Google Sans Flex for Latin, Roboto Flex for Cyrillic.
//
// Cheap by construction: the wave moves in fixed steps ~11 times a second, so the browser only works on
// a step and reuses cached font instances (see .flow in index.css); a looping heading also gets a frozen
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
    scrolling = window.setTimeout(() => { scrolling = 0; }, 220);
  }, { capture: true, passive: true });
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
    let wave = 0;
    let step = 0;
    let width = 0;
    // one step of the wave (see .flow in index.css): 60 steps per wave
    const tick = () => {
      if (scrolling || document.hidden) return;
      step = (step + 1) % 60;
      el.style.setProperty('--t', String(step));
    };
    const settle = () => {
      if (introRunning) return;
      const on = looping && visible;
      el.dataset.flow = looping ? (on ? 'on' : 'paused') : 'static';
      if (on && !wave) wave = window.setInterval(tick, ((speed ?? 5.4) * 1000) / 60);
      else if (!on && wave) { clearInterval(wave); wave = 0; }
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
    return () => { io.disconnect(); ro.disconnect(); clearTimeout(timer); clearInterval(wave); el.classList.remove('flow-box'); el.style.height = ''; };
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
