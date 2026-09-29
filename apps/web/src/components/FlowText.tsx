// Flowing type: every letter of a heading drifts through the variable-font axes (weight, width,
// roundness, slant, grade) in a slow wave while the heading is on screen, after "pouring in" when it
// first appears or its text changes. Google Sans Flex for Latin, Roboto Flex for Cyrillic.
// Paused off-screen; static with prefers-reduced-motion.
import { createElement, useEffect, useMemo, useRef, type CSSProperties } from 'react';

type Tag = 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'p';

const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s: string) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  text: string;
  as?: Tag;
  className?: string;
  style?: CSSProperties;
  /** pour the letters in when the text appears (default true) */
  intro?: boolean;
  /** seconds per wave (default 5.2) */
  speed?: number;
}

export function FlowText({ text, as = 'span', className = '', style, intro = true, speed }: Props) {
  const ref = useRef<HTMLElement>(null);
  const words = useMemo(() => text.split(/(\s+)/).filter(Boolean).map((w) => (/^\s+$/.test(w) ? null : graphemes(w))), [text]);
  const count = useMemo(() => words.reduce((n, w) => n + (w?.length ?? 0), 0), [words]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) { el.dataset.flow = 'static'; return; }
    let visible = true;
    let timer = 0;
    const settle = () => { el.dataset.flow = visible ? 'on' : 'paused'; };
    if (intro) { el.dataset.flow = 'in'; timer = window.setTimeout(settle, 950 + count * 32); }
    else settle();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (el.dataset.flow !== 'in') settle();
    });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [text, intro, count]);

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
    { ref, className: `flow ${className}`, style: speed ? { ...style, ['--flow-dur' as any]: `${speed}s` } : style, 'aria-label': text, 'data-flow': intro ? 'in' : 'on' },
    <span aria-hidden="true">{children}</span>,
  );
}
