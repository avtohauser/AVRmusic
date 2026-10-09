// avr — the behaviour half of the kit (avr.css is the look): the app's shapes (cookie, clover, sunny, the
// rounded square, the star), the play button that morphs between them, things rising into view, a light / dark
// switch that remembers the choice, and the star at work: a field of stars behind a section, sparks out of a
// tap and a star that grows over the screen. No dependencies:  <script type="module" src="/brand/avr.js"></script>

const POINTS = 144;
const R = {
  cookie9: (a) => 1 - 0.16 * (0.5 - 0.5 * Math.cos(9 * a)),
  cookie12: (a) => 1 - 0.12 * (0.5 - 0.5 * Math.cos(12 * a)),
  clover: (a) => 1 - 0.42 * Math.pow(0.5 - 0.5 * Math.cos(4 * a), 1.6),
  sunny: (a) => 0.86 + 0.14 * Math.pow(Math.abs(Math.cos(4 * a)), 3),
  square: (a) => 0.98 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 4.2) + Math.pow(Math.abs(Math.sin(a)), 4.2), 1 / 4.2),
  // the brand's star as a curve through the same 144 points, so a cookie can turn into it
  star: (a) => 0.96 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 0.58) + Math.pow(Math.abs(Math.sin(a)), 0.58), 1 / 0.58),
};

/** The brand's star, exactly as drawn in the logo (a 100 × 100 box). */
export const STAR_PATH = 'M50 2C53 30 70 47 98 50C70 53 53 70 50 98C47 70 30 53 2 50C30 47 47 30 50 2Z';
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/* ---------- the star at work ---------- */

const starShape = typeof Path2D === 'function' ? new Path2D(STAR_PATH) : null;
const css = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

/**
 * A field of stars behind an element: many faint points and a few brand stars that twinkle, drift slowly up
 * and lean away from the pointer. Options: density (points per 10 000 px²), stars (share of brand stars),
 * drift (px per second), parallax (px), links (thin lines between near brand stars: a constellation).
 * Returns a function that stops it. Still when the visitor asks for less motion; asleep off screen.
 */
export function starfield(host, { density = 1.1, stars = 0.08, drift = 6, parallax = 14, links = false } = {}) {
  host.classList.add('avr-starfield-host');
  const canvas = document.createElement('canvas');
  canvas.className = 'avr-starfield';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, items = [], colors = {}, px = 0, py = 0, tx = 0, ty = 0, raf = 0, visible = true, last = 0;

  const palette = () => {
    const dark = parseInt((css('--background') || '#0B4248').slice(1, 3), 16) < 128;
    colors = dark
      ? { point: css('--avr-mist') || '#D3E3E4', stars: [css('--avr-pink'), css('--avr-violet'), css('--avr-mist')], a: 1 }
      : { point: css('--avr-teal') || '#0B4248', stars: [css('--avr-violet'), css('--avr-pink'), css('--avr-teal')], a: 0.55 };
  };
  const seed = () => {
    const n = Math.round((w * h) / 10000 * density);
    items = Array.from({ length: n }, (_, i) => {
      const star = Math.random() < stars;
      return {
        x: Math.random() * w, y: Math.random() * h, z: 0.3 + Math.random() * 0.7,
        r: star ? 6 + Math.random() * 12 : 0.6 + Math.random() * 1.1,
        star, c: i % 3, phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 1.4, turn: Math.random() * 0.6,
      };
    });
  };
  const size = () => {
    const r = host.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    canvas.width = w * dpr; canvas.height = h * dpr;
    seed(); draw(0);
  };
  const draw = (t) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const moving = !still();
    px += (tx - px) * 0.06; py += (ty - py) * 0.06;
    const placed = [];
    for (const s of items) {
      const y = moving ? ((s.y - (t / 1000) * drift * s.z) % h + h) % h : s.y;
      const x = s.x + px * parallax * s.z;
      const yy = y + py * parallax * s.z;
      const tw = moving ? 0.55 + 0.45 * Math.sin(t / 1000 * s.speed + s.phase) : 0.8;
      if (s.star && starShape) {
        const k = (s.r / 100) * (0.75 + 0.25 * tw);
        ctx.save();
        ctx.translate(x, yy);
        ctx.rotate(moving ? Math.sin(t / 3000 + s.phase) * s.turn : 0);
        ctx.scale(k, k);
        ctx.translate(-50, -50);
        ctx.globalAlpha = (0.35 + 0.55 * tw) * colors.a;
        ctx.fillStyle = colors.stars[s.c] || colors.point;
        ctx.fill(starShape);
        ctx.restore();
        placed.push([x, yy]);
      } else {
        ctx.globalAlpha = (0.15 + 0.45 * tw * s.z) * colors.a;
        ctx.fillStyle = colors.point;
        ctx.beginPath(); ctx.arc(x, yy, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (links) {
      ctx.strokeStyle = colors.point; ctx.lineWidth = 1;
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        const d = Math.hypot(placed[i][0] - placed[j][0], placed[i][1] - placed[j][1]);
        if (d < 180) { ctx.globalAlpha = (1 - d / 180) * 0.22 * colors.a; ctx.beginPath(); ctx.moveTo(...placed[i]); ctx.lineTo(...placed[j]); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  };
  const loop = (t) => {
    raf = 0;
    if (!visible || document.hidden) return;
    if (t - last > 30) { draw(t); last = t; }   // ~30 frames a second is plenty for a background
    if (!still()) raf = requestAnimationFrame(loop);
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const move = (e) => { tx = (e.clientX / innerWidth - 0.5) * -1; ty = (e.clientY / innerHeight - 0.5) * -1; };
  const ro = new ResizeObserver(size); ro.observe(host);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }); io.observe(host);
  const mo = new MutationObserver(() => { palette(); draw(performance.now()); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { palette(); draw(performance.now()); };
  mq.addEventListener?.('change', onScheme);
  addEventListener('pointermove', move, { passive: true });
  document.addEventListener('visibilitychange', wake);
  palette(); size(); wake();
  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect(); mq.removeEventListener?.('change', onScheme);
    removeEventListener('pointermove', move); document.removeEventListener('visibilitychange', wake); canvas.remove();
  };
}

/** Sparks: little stars thrown out of a point (an element's centre, or {x, y}) — for a like, an invite, an achievement. */
export function sparkle(from, { count = 10, spread = 70 } = {}) {
  const r = from instanceof Element ? from.getBoundingClientRect() : null;
  const x = r ? r.left + r.width / 2 : from.x, y = r ? r.top + r.height / 2 : from.y;
  const n = still() ? 1 : count;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'avr-spark';
    s.style.left = x + 'px'; s.style.top = y + 'px';
    document.body.appendChild(s);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = spread * (0.6 + Math.random() * 0.6), k = 0.5 + Math.random() * 0.9;
    const frames = still()
      ? [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.2)' }, { opacity: 0, transform: 'scale(1.2)' }]
      : [{ transform: 'translate(0,0) scale(.2) rotate(0deg)', opacity: 1 },
         { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(${k}) rotate(${90 + Math.random() * 90}deg)`, opacity: 1, offset: 0.7 },
         { transform: `translate(${Math.cos(a) * d * 1.15}px, ${Math.sin(a) * d * 1.15 + 12}px) scale(${k * 0.6}) rotate(180deg)`, opacity: 0 }];
    s.animate(frames, { duration: still() ? 500 : 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => s.remove();
  }
}

/**
 * The star wipe: a star grows from a point until it covers the screen, then [then] runs and the star shrinks
 * away — between avr's apps and sites, or into a big moment (a recap, a game). Resolves when done.
 * A plain fade when the visitor asks for less motion.
 */
export async function starWipe(at, then = () => {}, { fill } = {}) {
  const el = document.createElement('div');
  el.className = 'avr-wipe';
  if (fill) el.style.setProperty('--wipe', fill);
  const x = at?.x ?? innerWidth / 2, y = at?.y ?? innerHeight / 2;
  const big = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) * 5.2;
  const pos = (s) => ({ maskSize: `${s}px ${s}px`, webkitMaskSize: `${s}px ${s}px`, maskPosition: `${x - s / 2}px ${y - s / 2}px`, webkitMaskPosition: `${x - s / 2}px ${y - s / 2}px` });
  Object.assign(el.style, pos(0));
  document.body.appendChild(el);
  if (still()) {
    Object.assign(el.style, { maskImage: 'none', webkitMaskImage: 'none' });
    await el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' }).finished;
    await then();
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished;
  } else {
    await el.animate([pos(0), pos(big)], { duration: 650, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' }).finished;
    await then();
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out', fill: 'forwards' }).finished;
  }
  el.remove();
}

// on load: the remembered theme, morphing buttons, shaped elements ([data-avr-shape]), star fields, sparks and reveals
try { const t = localStorage.getItem('avr.theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* ignore */ }
const boot = () => {
  document.querySelectorAll('.avr-morph').forEach(morph);
  document.querySelectorAll('[data-avr-shape]').forEach((el) => shapeMask(el, el.dataset.avrShape));
  document.querySelectorAll('[data-avr-theme-toggle]').forEach((b) => b.addEventListener('click', toggleTheme));
  // <section data-avr-starfield data-links data-density="1.4">, <button data-avr-sparkle>
  document.querySelectorAll('[data-avr-starfield]').forEach((el) => starfield(el, {
    links: el.hasAttribute('data-links'),
    ...(el.dataset.density ? { density: +el.dataset.density } : {}),
    ...(el.dataset.stars ? { stars: +el.dataset.stars } : {}),
  }));
  document.querySelectorAll('[data-avr-sparkle]').forEach((b) => b.addEventListener('click', () => sparkle(b)));
  reveal();
};
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
