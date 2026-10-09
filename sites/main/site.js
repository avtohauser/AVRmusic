// Content and language switch for the visitka. Texts are Russian first, English second.
import { starfield, sparkle, starWipe } from '/brand/avr.js';

const UI = {
  ru: {
    'nav.services': 'Сервисы', 'nav.projects': 'Проекты',
    'hero.kicker': 'экосистема avr', 'hero.title': 'Своё. Для своих.',
    'hero.lead': 'Музыка, видео, мессенджер и проекты — на собственном сервере, без рекламы и слежки. Вход по приглашению.',
    calm: 'Спокойно', 'hero.music': 'Слушать avr music', 'hero.more': 'Что внутри',
    'services.title': 'Сервисы avr', 'services.lead': 'Каждый — со своим знаком рядом со звездой. Всё в одном стиле, с одним аккаунтом.',
    'projects.title': 'Проекты', 'foot': 'avr · avthsr.space · своё, для своих',
    open: 'Открыть', soon: 'Скоро', theme: 'Тема',
  },
  en: {
    'nav.services': 'Services', 'nav.projects': 'Projects',
    'hero.kicker': 'the avr ecosystem', 'hero.title': 'Ours. For our own.',
    'hero.lead': 'Music, video, messaging and projects on our own server, with no ads and no tracking. Invitation only.',
    calm: 'Calm', 'hero.music': 'Listen to avr music', 'hero.more': 'What is inside',
    'services.title': 'avr services', 'services.lead': 'Each has its own sign next to the star. One style, one account.',
    'projects.title': 'Projects', 'foot': 'avr · avthsr.space · ours, for our own',
    open: 'Open', soon: 'Soon', theme: 'Theme',
  },
};

// new products go here first; `sign` is a file from brand/assets/signs/
const SERVICES = [
  { sign: 'signs/avr-music', name: 'avr music', url: 'https://music.avthsr.space', live: true,
    desc: { ru: 'Частный стриминг: своя библиотека, друзья, сайт и приложение для Android и iPhone.', en: 'Private streaming: your own library, friends, a website and apps for Android and iPhone.' },
    tags: ['Android', 'iPhone', 'web'] },
  { sign: 'signs/avrtube', name: 'avrtube', live: false,
    desc: { ru: 'Видео без рекламы на движке NewPipe, связано с avr music.', en: 'Ad-free video on the NewPipe engine, linked with avr music.' },
    tags: ['Android', 'iPhone'] },
  { sign: 'signs/avrgram', name: 'avrgram', live: false,
    desc: { ru: 'Telegram для Android в стиле avr, с функциями защиты.', en: 'Telegram for Android in the avr style, with privacy tools.' },
    tags: ['Android', 'privacy'] },
  { sign: 'mark/star', name: 'portfolio', url: 'https://explore.avthsr.space', live: true, label: { ru: 'Портфолио', en: 'Portfolio' },
    desc: { ru: 'Личный сайт со сменной лентой, плитками и терминалом с секретами.', en: 'A personal site with a feed, tiles and a terminal with secrets.' },
    tags: ['feed', 'terminal'] },
];

const SECTIONS = [
  { id: 'laboratory', title: { ru: 'Лаборатория', en: 'Laboratory' },
    desc: { ru: 'Базовая инженерия и массовые решения. Готовые к продакшену продукты и фундаментальные системы, на которых тихо держится всё остальное.', en: 'Core engineering and high-volume solutions. Production-ready builds and the foundational systems that quietly power everyday products.' },
    projects: [
      { title: 'LKS54', url: 'https://lks54.avthsr.space', status: { ru: 'В разработке', en: 'In development' }, tags: ['ERP', 'CRM', 'Roles'],
        desc: { ru: 'Разработанная с нуля ERP, совмещённая с CRM, — создаётся для моего колледжа. Поддерживает большое количество ролей и удобное администрирование всей системы.', en: 'A from-scratch ERP fused with a CRM, built for my college. Supports a large number of roles with convenient administration across the entire system.' } },
      { title: 'KGS', url: 'https://kgs.avthsr.space', status: { ru: 'Живой', en: 'Live' }, tags: ['Next.js', 'Medical gas', 'Corporate'],
        desc: { ru: 'Корпоративный сайт компании «КГС» — системы медицинского газоснабжения: монтаж, пуско-наладка и сервис по всей России.', en: 'A corporate site for KGS — a company specializing in medical gas supply systems: installation, commissioning and service across Russia.' } },
    ] },
  { id: 'secure', title: { ru: 'Безопасность', en: 'Security' },
    desc: { ru: 'Защищаем пользователей и их данные. Проектируем системы защиты, укрепляем инфраструктуру и закладываем приватность с самого основания.', en: 'Protecting people and their data. We design defense systems, harden infrastructure, and build privacy in from the very foundation.' },
    projects: [
      { title: 'AVR-service', status: { ru: 'Активен', en: 'Active' }, tags: ['VPN', '10+ countries', 'Anti-censorship', 'AVR X DVOLJ'],
        desc: { ru: 'Передовой VPN-сервис для обхода региональных ограничений с поддержкой 10+ стран и режимами работы в условиях максимальных ограничений.', en: 'An advanced VPN service for bypassing regional restrictions, with support for 10+ countries and modes built to work under the heaviest censorship conditions.' } },
      { title: 'Meshtastic Node', status: { ru: 'Работает', en: 'Running' }, tags: ['Mesh', 'LoRa', 'Off-grid'],
        desc: { ru: 'Собственная Meshtastic-нода — дальняя автономная mesh-связь, которая продолжает работать там, где обычные сети недоступны.', en: 'A self-hosted Meshtastic node — long-range, off-grid mesh communication that keeps working when conventional networks do not.' } },
      { title: 'RadiusBranch', status: { ru: 'В разработке', en: 'In development' }, tags: ['Python', 'Web UI', 'Geo'],
        desc: { ru: 'Локально запускаемый пакет Python-скриптов с веб-интерфейсом для расчёта, за сколько и насколько максимально мог отдалиться человек. Учитывает аэропорты, личный транспорт, кикшеринги, метро и общественный транспорт — включая рейсы поездов, электричек и самолётов.', en: 'A locally-run Python toolkit with a web interface that calculates how far a person could have travelled in a given time. Factors in airports, personal transport, kick-scooter sharing, metro and public transport — including train, commuter-rail and flight schedules.' } },
    ] },
  { id: 'experiments', title: { ru: 'Эксперименты', en: 'Experiments' },
    desc: { ru: 'Работаем на острие новых технологий. Разработка с нуля — прототипы, нестандартные подходы и решения, которых ещё нет.', en: 'Working at the edge of new technology. Built from scratch — prototypes, unconventional approaches, and solutions that do not exist yet.' },
    projects: [
      { title: 'Triangulation Spoofer', status: { ru: 'Прототип', en: 'Prototype' }, tags: ['Hardware', 'RF', 'Privacy'],
        desc: { ru: 'Собственное проектирование и сборка прибора для подмены триангуляции сотовых вышек — для максимальной анонимности, оставаясь при этом мобильным.', en: 'Designing and building a custom device that spoofs cellular tower triangulation — engineered for maximum anonymity while staying fully mobile.' } },
    ] },
  { id: 'media', title: { ru: 'Медиа', en: 'Media' },
    desc: { ru: 'Любые медиа-направления. Съёмка, монтаж, движение и визуальный контент — всё, что нужно истории, от и до.', en: 'Every media direction. Filming, editing, motion, and visual content — whatever the story needs, end to end.' },
    projects: [] },
  { id: 'signature', title: { ru: 'Сигнатура', en: 'Signature' },
    desc: { ru: 'Личные проекты для себя и команды. Работы с характером и собственным почерком, без компромиссов.', en: 'Personal work for ourselves and the team. Passion projects with a distinct signature and no compromises.' },
    projects: [
      { title: { ru: 'Портфолио', en: 'Portfolio' }, url: 'https://explore.avthsr.space', status: { ru: 'Живой', en: 'Live' }, tags: ['React', 'SPA'],
        desc: { ru: 'Личный сайт-портфолио: плитки, лента, Spotify «сейчас слушаю» и терминал с пасхалками.', en: 'The personal portfolio: tiles, a feed, Spotify now-playing and a terminal full of secrets.' } },
      { title: { ru: 'Версия Web 1.0', en: 'Web 1.0 Edition' }, url: 'https://old.avthsr.space', status: { ru: 'Живой', en: 'Live' }, tags: ['Retro', 'Nostalgia'],
        desc: { ru: 'Ностальгическая Web 1.0 версия сайта — для настроения тех времён.', en: 'A nostalgic Web 1.0 rendition of the site — tables, blink tags and all.' } },
      { title: { ru: 'Засекречено', en: 'Classified' }, status: { ru: 'Скрыто', en: 'Hidden' }, tags: ['???'],
        desc: { ru: 'И много чего, о чём мы пока не можем рассказать.', en: 'And plenty more we cannot talk about just yet.' } },
    ] },
];

// the product signs drawn inline, so their parts can move while the slide is current (same geometry as brand/assets/signs)
const STAR = '<path fill="url(#g)" d="M50 2 C53 30 70 47 98 50 C70 53 53 70 50 98 C47 70 30 53 2 50 C30 47 47 30 50 2Z"/>';
const DEFS = '<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#F2A5C3"/><stop offset="1" stop-color="#5A4FC8"/></linearGradient></defs>';
const stroke = 'fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"';
const SIGNS = {
  'signs/avr-music': `<path class="w1" d="M108 30 A28 28 0 0 1 108 70" stroke="#F2A5C3" ${stroke}/><path class="w2" d="M122 18 A44 44 0 0 1 122 82" stroke="#5A4FC8" ${stroke}/>`,
  'signs/avrtube': `<rect x="104" y="24" width="31" height="52" rx="11" stroke="#5A4FC8" ${stroke}/><path class="play" d="M114.5 41 L126 50 L114.5 59 Z" fill="#F2A5C3" stroke="#F2A5C3" stroke-width="5" stroke-linejoin="round"/>`,
  'signs/avrgram': `<path d="M115 23 H124 Q135 23 135 34 V55 Q135 66 124 66 H117 L106 77 V55 Q104 51 104 46 V34 Q104 23 115 23 Z" stroke="#5A4FC8" ${stroke}/><path class="l1" pathLength="1" d="M113 38.5 H126" stroke="#F2A5C3" ${stroke}/><path class="l2" pathLength="1" d="M113 50.5 H120" stroke="#F2A5C3" ${stroke}/>`,
};
const signImg = (key, cls) => SIGNS[key]
  ? `<svg class="${cls}" viewBox="0 0 140 100" aria-hidden="true">${DEFS}${STAR}${SIGNS[key]}</svg>`
  : `<img class="${cls}" src="/brand/assets/${key}.svg" alt="">`;
let lang = (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';
try { lang = localStorage.getItem('avr-lang') || lang; } catch {}

const t = (v) => (typeof v === 'string' ? v : v[lang]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tags = (list) => `<div class="tags">${list.map((x) => `<span>${esc(x)}</span>`).join('')}</div>`;
const L = (ru, en) => (lang === 'ru' ? ru : en);

const deck = document.getElementById('deck');
const corners = ['tr', 'bl', 'tl', 'br'];

function heroSlide() {
  return `<section class="slide avr-glow" id="hello" data-slide="hello">
    <i class="avr-star avr-star-in hero-star" style="--i:0" aria-hidden="true"></i>
    <p class="avr-kicker" style="--i:1">${UI[lang]['hero.kicker']}</p>
    <h1 class="avr-display" style="--i:2">${UI[lang]['hero.title']}</h1>
    <p class="avr-body lead avr-muted" style="--i:3">${UI[lang]['hero.lead']}</p>
    <div class="actions" style="--i:4">
      <a class="avr-btn big" href="https://music.avthsr.space">${UI[lang]['hero.music']}</a>
      <button class="avr-btn tonal big" type="button" data-go="1">${UI[lang]['hero.more']}</button>
    </div></section>`;
}

function aboutSlide() {
  return `<section class="slide avr-bigstar" id="about" data-slide="about" data-corner="bl" style="--size:110%">
    <span class="no" style="--i:0">${L('о создателе', 'the maker')}</span>
    <h2 class="avr-display" style="--i:1">Stefan / Avtohauser</h2>
    <p class="avr-body lead avr-muted" style="--i:2">${L(
      'Студент по информационной безопасности и full-stack разработчик. Всё в avr сделано своими руками, на своём сервере, для себя и друзей.',
      'A student of information security and a full-stack developer. Everything in avr is made by hand, on our own server, for ourselves and our friends.')}</p>
    <div class="actions" style="--i:3">
      <a class="avr-btn big" href="https://explore.avthsr.space">${L('Портфолио', 'Portfolio')}</a>
      <a class="avr-btn tonal big" href="https://music.avthsr.space">avr music</a>
    </div></section>`;
}
function productSlide(s, n, k) {
  const status = s.live ? t(s.label || { ru: 'Работает', en: 'Live' }) : UI[lang].soon;
  const action = s.url
    ? `<a class="avr-btn big" href="${s.url}">${UI[lang].open}</a>`
    : `<button class="avr-btn tonal big" type="button" data-avr-sparkle disabled>${UI[lang].soon}</button>`;
  return `<section class="slide avr-bigstar product" id="${s.id}" data-slide="${s.id}" data-corner="${corners[k % 4]}" style="--size:120%">
    ${signImg(s.sign, `product-sign live-${s.id}`).replace('<svg ', '<svg style="--i:0" ').replace('<img ', '<img style="--i:0" ')}
    <div class="status-row" style="--i:1"><span class="status${s.live ? '' : ' soon'}">${esc(status)}</span>${s.url ? `<span class="pulse" data-check="${s.id}"><i class="avr-star"></i><b></b></span>` : ''}</div>
    <h2 class="avr-display" style="--i:2">${esc(s.name)}</h2>
    <p class="avr-body lead avr-muted" style="--i:3">${esc(t(s.desc))}</p>
    <div style="--i:4">${tags(s.tags)}</div>
    <div class="actions" style="--i:5">${action}</div></section>`;
}

function projectCard(p) {
  const inner = `<div class="card-top"><h3 class="avr-title">${esc(t(p.title))}</h3><span class="status">${esc(t(p.status))}</span></div>
    <p class="avr-body-sm avr-muted">${esc(t(p.desc))}</p>${tags(p.tags)}`;
  return p.url ? `<a class="avr-card" href="${p.url}">${inner}</a>` : `<article class="avr-card">${inner}</article>`;
}

function sectionSlide(s, k) {
  return `<section class="slide avr-bigstar" id="${s.id}" data-slide="${s.id}" data-corner="${corners[(k + 2) % 4]}" data-acc="${k % 3}" style="--size:110%">
    <span class="no" style="--i:0">${String(k + 1).padStart(2, '0')} / ${String(SECTIONS.length).padStart(2, '0')}</span>
    <h2 class="avr-display" style="--i:1">${esc(t(s.title))}</h2>
    <p class="avr-body lead avr-muted" style="--i:2">${esc(t(s.desc))}</p>
    <div class="cards" style="--i:3">${s.projects.length
      ? s.projects.map(projectCard).join('')
      : `<div class="empty">${L('Скоро здесь появится первая работа.', 'The first piece will appear here soon.')}</div>`}</div></section>`;
}

SERVICES.forEach((s, i) => { s.id = ['music', 'avrtube', 'avrgram', 'portfolio'][i]; });

let slides = [];
let stopField = null;
let lite = document.documentElement.classList.contains('lite');
let current = 0;

function render() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = UI[lang][el.dataset.i18n]; });
  document.getElementById('lang').textContent = lang === 'ru' ? 'EN' : 'RU';
  deck.innerHTML = heroSlide() + SERVICES.map((s, k) => productSlide(s, k, k)).join('') + aboutSlide() + SECTIONS.map(sectionSlide).join('');
  // a screen reader hears which slide it is on
  slides_label();
  slides = [...deck.querySelectorAll('.slide')];
  stopField?.();
  stopField = lite ? null : starfield(slides[0], { density: 0.9, links: true });
  // a constellation: one star per slide, joined by lines that light up as you go
  document.getElementById('dots').innerHTML = slides.map((s, i) => `${i ? '<i></i>' : ''}<button type="button" aria-label="${i + 1}" data-go="${i}"></button>`).join('');
  checkServices();
  deck.querySelectorAll('[data-avr-sparkle]').forEach((b) => b.addEventListener('click', () => sparkle(b)));
  go(Math.max(0, slides.findIndex((s) => s.id === location.hash.slice(1))), true);
}

// while the deck glides to a chosen slide, the slides it passes on the way are not announced
let target = -1;
function go(i, instant = false) {
  i = Math.min(slides.length - 1, Math.max(0, i));
  target = instant ? -1 : i;
  deck.scrollTo({ left: slides[i].offsetLeft, behavior: instant ? 'instant' : 'smooth' });
  mark(i);
}

function slides_label() {
  document.querySelectorAll('.slide').forEach((s, i, all) => {
    s.setAttribute('role', 'group');
    s.setAttribute('aria-roledescription', 'slide');
    s.setAttribute('aria-label', `${i + 1} / ${all.length}`);
  });
}

function mark(i) {
  current = i;
  const title = slides[i].querySelector('h1, h2');
  const live = document.getElementById('live');
  if (live && title) live.textContent = title.textContent;
  slides.forEach((s, k) => s.toggleAttribute('data-on', k === i));
  document.querySelectorAll('#dots button').forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
  document.querySelectorAll('#dots i').forEach((l, k) => l.toggleAttribute('data-passed', k < i));
  document.getElementById('prev').disabled = i === 0;
  document.getElementById('next').disabled = i === slides.length - 1;
  history.replaceState(null, '', `#${slides[i].id}`);
}

// a service shows the star twinkling when it answers; the server writes /status.json every minute
async function checkServices() {
  let status = {};
  try { status = await (await fetch('/status.json', { cache: 'no-store' })).json(); } catch { return; }
  document.querySelectorAll('[data-check]').forEach((el) => {
    const up = status[el.dataset.check];
    if (up === undefined) return;
    el.dataset.state = up ? 'up' : 'down';
    el.lastElementChild.textContent = up ? L('на связи', 'online') : L('не отвечает', 'not answering');
  });
}
// the deck scrolls natively (swipe, trackpad); this keeps the dots and the arrivals in step with it
let ticking = false;
let still;
deck.addEventListener('scroll', () => {
  deck.classList.add('moving');
  clearTimeout(still);
  still = setTimeout(() => deck.classList.remove('moving'), 140);
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const i = Math.round(deck.scrollLeft / deck.clientWidth);
    if (target >= 0) { if (Math.abs(deck.scrollLeft - slides[target].offsetLeft) < 2) target = -1; return; }
    if (i !== current) mark(i);
  });
}, { passive: true });

// a finger or key press during the glide takes over from it
['touchstart', 'pointerdown'].forEach((ev) => deck.addEventListener(ev, () => { target = -1; }, { passive: true }));

// a mouse wheel moves between slides unless the slide itself still has more to scroll
let lock = 0;
deck.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  const s = slides[current];
  const room = e.deltaY > 0 ? s.scrollTop + s.clientHeight < s.scrollHeight - 2 : s.scrollTop > 0;
  if (room) return;
  e.preventDefault();
  const now = Date.now();
  if (now - lock < 650 || Math.abs(e.deltaY) < 8) return;
  lock = now;
  go(current + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  const next = ['ArrowRight', 'PageDown', ' '], prev = ['ArrowLeft', 'PageUp'];
  if (next.includes(e.key) && e.target === document.body) { e.preventDefault(); go(current + 1); }
  else if (next.includes(e.key) && e.key !== ' ') go(current + 1);
  else if (prev.includes(e.key)) go(current - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(slides.length - 1);
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) {
    const to = Number(b.dataset.go);
    if (Math.abs(to - current) > 1 && !lite) starWipe({ x: e.clientX, y: e.clientY }, () => go(to, true));
    else go(to);
  }
  const a = e.target.closest('a[href^="#"]');
  if (a) {
    const i = slides.findIndex((s) => s.id === a.getAttribute('href').slice(1));
    if (i >= 0) { e.preventDefault(); go(i); }
  }
});
document.getElementById('prev').addEventListener('click', () => go(current - 1));
document.getElementById('next').addEventListener('click', () => go(current + 1));
addEventListener('hashchange', () => { const i = slides.findIndex((s) => s.id === location.hash.slice(1)); if (i >= 0 && i !== current) go(i); });
addEventListener('resize', () => deck.scrollTo({ left: slides[current].offsetLeft, behavior: 'instant' }));

document.getElementById('calm').setAttribute('aria-pressed', String(lite));
document.getElementById('calm').addEventListener('click', () => {
  // the calm version removes the turning stars and the star field; a reload applies it cleanly
  try { localStorage.setItem('avr.calm', lite ? '0' : '1'); } catch {}
  location.reload();
});

document.getElementById('lang').addEventListener('click', () => {
  lang = lang === 'ru' ? 'en' : 'ru';
  try { localStorage.setItem('avr-lang', lang); } catch {}
  render();
});
// the browser would otherwise restore an older scroll position after load and undo a deep link
history.scrollRestoration = 'manual';
render();
addEventListener('load', () => go(Math.max(0, slides.findIndex((s) => s.id === location.hash.slice(1))), true));

// a slow device gets a calm version: no turning stars, no star field, no looping sign animations.
// We time 40 frames after load; the median over 24 ms (under ~40 fps) or "save data" switches it on.
function measureSpeed() {
  if (lite) return;
  const saver = navigator.connection?.saveData;
  const frames = [];
  let last = performance.now();
  const tick = (now) => {
    frames.push(now - last); last = now;
    if (frames.length < 50) return requestAnimationFrame(tick);
    const sorted = frames.slice(10).sort((a, b) => a - b);
    if (saver || sorted[Math.floor(sorted.length / 2)] > 24) {
      lite = true;
      document.documentElement.classList.add('lite');
      stopField?.(); stopField = null;
    }
  };
  requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(tick), 600));
}
measureSpeed();