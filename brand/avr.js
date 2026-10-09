// avr — the behaviour half of the kit (avr.css is the look): the app's shapes (cookie, clover, sunny, the
// rounded square), the play button that morphs between them, things rising into view, and a light / dark
// switch that remembers the choice. No dependencies:  <script type="module" src="/brand/avr.js"></script>

const POINTS = 144;
const R = {
  cookie9: (a) => 1 - 0.16 * (0.5 - 0.5 * Math.cos(9 * a)),
  cookie12: (a) => 1 - 0.12 * (0.5 - 0.5 * Math.cos(12 * a)),
  clover: (a) => 1 - 0.42 * Math.pow(0.5 - 0.5 * Math.cos(4 * a), 1.6),
  sunny: (a) => 0.86 + 0.14 * Math.pow(Math.abs(Math.cos(4 * a)), 3),
  square: (a) => 0.98 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 4.2) + Math.pow(Math.abs(Math.sin(a)), 4.2), 1 / 4.2),
};

/** A shape as an SVG path in a 100 × 100 box (every shape has the same points, so any two can morph). */
export function shapePath(name) {
  const r = R[name] ?? (() => 1);
  let d = '';
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2, k = r(a) * 50;
    d += `${i ? 'L' : 'M'}${(50 + k * Math.sin(a)).toFixed(2)} ${(50 - k * Math.cos(a)).toFixed(2)}`;
  }
  return d + 'Z';
}

/** Cuts an element (a photo, a cover, an icon tile) to a shape at any size. */
export function shapeMask(el, name) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${shapePath(name)}'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  Object.assign(el.style, { webkitMaskImage: url, maskImage: url, webkitMaskSize: '100% 100%', maskSize: '100% 100%' });
}

/** <button class="avr-morph" data-playing="false" data-shape="cookie9">: a cookie that becomes a square. */
export function morph(btn) {
  if (!btn.querySelector('svg')) {
    btn.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="avr-morph-shape"/><path class="avr-morph-icon" fill="currentColor"/></svg>');
  }
  const path = btn.querySelector('.avr-morph-shape'), icon = btn.querySelector('.avr-morph-icon');
  const draw = () => {
    const on = btn.dataset.playing === 'true';
    const d = shapePath(on ? 'square' : btn.dataset.shape || 'cookie9');
    path.setAttribute('d', d);
    path.style.d = `path('${d}')`;
    // play: a rounded triangle; pause: two bars
    icon.setAttribute('d', on ? 'M38 34h8v32h-8zM54 34h8v32h-8z' : 'M41 33.5q0-3 2.6-1.5l22 13.8q2.4 1.6 0 3.2l-22 13.9Q41 64.5 41 61.5z');
    btn.setAttribute('aria-label', on ? 'Пауза' : 'Играть');
  };
  draw();
  new MutationObserver(draw).observe(btn, { attributes: true, attributeFilter: ['data-playing', 'data-shape'] });
}

/** Elements with .avr-reveal rise into place when they scroll into view. */
export function reveal(root = document) {
  const items = root.querySelectorAll('.avr-reveal:not([data-in])');
  if (!('IntersectionObserver' in window)) { items.forEach((i) => i.setAttribute('data-in', '')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target); }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  items.forEach((i) => io.observe(i));
}

/** Light or dark: "light" | "dark" | null (the system decides); remembered on this device. */
export function setTheme(mode) {
  try { mode ? localStorage.setItem('avr.theme', mode) : localStorage.removeItem('avr.theme'); } catch { /* private mode */ }
  mode ? document.documentElement.setAttribute('data-theme', mode) : document.documentElement.removeAttribute('data-theme');
}
export function toggleTheme() {
  const now = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(now === 'dark' ? 'light' : 'dark');
}

// on load: the remembered theme, morphing buttons, shaped elements ([data-avr-shape]) and reveals
try { const t = localStorage.getItem('avr.theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* ignore */ }
const boot = () => {
  document.querySelectorAll('.avr-morph').forEach(morph);
  document.querySelectorAll('[data-avr-shape]').forEach((el) => shapeMask(el, el.dataset.avrShape));
  document.querySelectorAll('[data-avr-theme-toggle]').forEach((b) => b.addEventListener('click', toggleTheme));
  reveal();
};
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
