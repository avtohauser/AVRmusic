// For someone who came without an invitation (or just wants to know what this is): what avr music is, what
// it believes in, a little player to try, what is inside and how to get in. Everything here is drawn and
// animated by the page itself; the demo's music is synthesized in the browser (no recording is played).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { M3eButton } from '@/md';
import { useAuth } from '@/stores/auth';
import { useI18n } from '@/lib/i18n';
import { Mascot } from '@/components/Mascot';
import { Wordmark } from '@/components/Brand';
import { FlowText } from '@/components/FlowText';
import { MorphPlay } from '@/components/MorphPlay';
import { WavyProgress } from '@/components/WavyProgress';
import { shapeMask } from '@/lib/shapes';
import './welcome.css';

const RELEASES = 'https://github.com/avtohauser/AVRmusic/releases';

export default function Welcome() {
  const user = useAuth((s) => s.user);
  const info = useAuth((s) => s.info);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const tr = (ru: string, en: string) => (lang === 'en' ? en : ru);
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  if (user) return <Navigate to="/" replace />;
  // a server nobody has set up yet: straight to creating the first account
  if (info?.needsSetup) return <Navigate to="/login" replace />;
  return (
    <div ref={root} className="wl" data-brand-page>
      <TopBar tr={tr} lang={lang} setLang={setLang} />
      <Hero tr={tr} />
      <Philosophy tr={tr} />
      <Demo tr={tr} />
      <Features tr={tr} />
      <HowToJoin tr={tr} />
      <Apps tr={tr} />
      <footer className="wl-foot">
        <Wordmark className="text-[26px]" />
        <p className="md-body-md muted">{tr('Сделано для своих. Без рекламы и без чужих правил.', 'Made for our own people. No ads, no one else’s rules.')}</p>
        <div className="flex flex-wrap gap-2 justify-center">
          <M3eButton variant="filled" href="/register">{tr('У меня есть приглашение', 'I have an invitation')}</M3eButton>
          <M3eButton variant="text" href="/login">{tr('Войти', 'Sign in')}</M3eButton>
          <M3eButton variant="text" href="https://github.com/avtohauser/AVRmusic" target="_blank">GitHub</M3eButton>
        </div>
      </footer>
    </div>
  );
}

type Tr = (ru: string, en: string) => string;

/** Sections (and anything marked .wl-reveal) come up as they scroll into view. */
function useReveal(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll('.wl-reveal');
    if (!('IntersectionObserver' in window)) { items.forEach((i) => i.setAttribute('data-in', '')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target); }
    }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  });
}

function TopBar({ tr, lang, setLang }: { tr: Tr; lang: string; setLang: (l: 'ru' | 'en') => void }) {
  return (
    <header className="wl-top">
      <Link to="/welcome" className="flex items-center gap-2"><Mascot waves mood="idle" className="w-11 h-8" /><Wordmark className="text-[24px]" /></Link>
      <div className="flex items-center gap-1">
        <button className="wl-chip" onClick={() => setLang(lang === 'en' ? 'ru' : 'en')} aria-label="language">{lang === 'en' ? 'RU' : 'EN'}</button>
        <M3eButton variant="text" href="/login">{tr('Войти', 'Sign in')}</M3eButton>
      </div>
    </header>
  );
}

/* ---------- the first screen ---------- */

function Hero({ tr }: { tr: Tr }) {
  const box = useRef<HTMLDivElement>(null);
  // the star leans toward the pointer
  useEffect(() => {
    const el = box.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', String((e.clientX - r.left) / r.width - 0.5));
      el.style.setProperty('--py', String((e.clientY - r.top) / r.height - 0.5));
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);
  return (
    <section ref={box} className="wl-hero">
      <div className="wl-rings" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="wl-orbit" aria-hidden="true">{['#F2A5C3', '#C4BCFF', '#A9C4C6', '#5A4FC8', '#F2A5C3', '#C4BCFF'].map((c, i) => <span key={i} style={{ ['--i' as any]: i, background: c, ...shapeMask(i % 2 ? 'cookie9' : 'clover') }} />)}</div>
      <div className="wl-star"><Mascot waves mood="hello" className="w-[168px] h-[120px]" /></div>
      <p className="wl-kicker">{tr('Частный музыкальный сервис', 'A private music service')}</p>
      <h1 className="wl-title"><FlowText text={tr('Своя музыка.', 'Your own music.')} /><br /><FlowText text={tr('Для своих.', 'For your own people.')} className="wl-accent" /></h1>
      <p className="wl-lead">{tr(
        'avr music — стриминг, который собрали для небольшой компании друзей. Вся музыка живёт на нашем сервере: без рекламы, без цензуры и без чужих правил.',
        'avr music is a streaming service built for a small group of friends. All the music lives on our own server: no ads, no censorship, no one else’s rules.',
      )}</p>
      <div className="flex flex-wrap gap-3 justify-center mt-7">
        <M3eButton variant="filled" size="medium" href="/register"><m3e-icon variant="rounded" slot="icon" name="key" />{tr('У меня есть приглашение', 'I have an invitation')}</M3eButton>
        <M3eButton variant="tonal" size="medium" href="#how"><m3e-icon variant="rounded" slot="icon" name="help" />{tr('Как попасть', 'How to get in')}</M3eButton>
      </div>
      <a href="#why" className="wl-scroll" aria-label={tr('Дальше', 'Next')}><m3e-icon variant="rounded" name="keyboard_arrow_down" /></a>
    </section>
  );
}

/* ---------- what it believes in ---------- */

function Philosophy({ tr }: { tr: Tr }) {
  const items: Array<[string, string, string]> = [
    ['group', tr('Для своих', 'For our own people'), tr('Вход только по приглашению. Здесь нет посторонних, рекламы и слежки — только друзья и их музыка.', 'Invitation only. No strangers, no ads, no tracking — just friends and their music.')],
    ['inventory_2', tr('Музыка остаётся с нами', 'The music stays with us'), tr('Трек попал на сервер — и он наш. Его не удалят по чужому решению, не перезальют и не спрячут за подпиской.', 'Once a track is on the server, it is ours. Nobody removes it, re-uploads it or hides it behind a subscription.')],
    ['explicit', tr('Оригиналы, а не «чистые» версии', 'Originals, not “clean” edits'), tr('Ищем исходные записи: перезалитые версии с вырезанными словами уходят вниз.', 'We look for the original recordings: re-uploads with words cut out go to the bottom.')],
    ['palette', tr('Красиво и одинаково везде', 'Beautiful, and the same everywhere'), tr('Material 3 Expressive: Android, iPhone и сайт выглядят и ведут себя одинаково.', 'Material 3 Expressive: Android, iPhone and the site look and behave the same.')],
  ];
  return (
    <section id="why" className="wl-section">
      <SectionHead kicker={tr('Философия', 'What we believe')} title={tr('Музыка не должна зависеть от чужих правил', 'Music shouldn’t depend on someone else’s rules')} />
      <div className="wl-grid4">
        {items.map(([icon, title, text], i) => (
          <article key={title} className="wl-card wl-reveal" style={{ ['--d' as any]: `${i * 90}ms` }}>
            <span className="wl-card-icon" style={shapeMask(['cookie9', 'clover', 'sunny', 'cookie12'][i] as any)}><m3e-icon variant="rounded" name={icon} filled /></span>
            <h3 className="md-title-lg mt-4">{title}</h3>
            <p className="md-body-md muted mt-1.5">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="wl-head wl-reveal">
      <p className="wl-kicker">{kicker}</p>
      <h2 className="md-display-sm wl-h2">{title}</h2>
      {children}
    </div>
  );
}

/* ---------- a player to try ---------- */

const DEMO = [
  { title: 'Northern Lights', sub: 'avr · demo', a: '#5A4FC8', b: '#F2A5C3' },
  { title: 'Teal Hours', sub: 'avr · demo', a: '#0B4248', b: '#A9C4C6' },
  { title: 'Violet Rain', sub: 'avr · demo', a: '#3F3591', b: '#C4BCFF' },
];

function Demo({ tr }: { tr: Tr }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const synth = useRef<Synth | null>(null);
  useEffect(() => () => synth.current?.stop(), []);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPos(synth.current?.progress() ?? 0), 120);
    return () => clearInterval(id);
  }, [playing]);
  const toggle = () => {
    if (!synth.current) synth.current = new Synth();
    if (playing) { synth.current.stop(); setPlaying(false); }
    else { synth.current.start(i); setPlaying(true); }
  };
  const go = (d: number) => {
    const n = (i + d + DEMO.length) % DEMO.length;
    setI(n);
    if (playing) synth.current?.start(n);
  };
  const t = DEMO[i];
  return (
    <section className="wl-section">
      <SectionHead kicker={tr('Попробуйте', 'Try it')} title={tr('Нажмите на кнопку — она живая', 'Press the button — it’s alive')}>
        <p className="md-body-lg muted mt-3 max-w-xl mx-auto">{tr('Кнопка превращается из «печенья» в квадрат, полоска идёт волной, обложки листаются колодой — как в приложении. Звук синтезируется прямо в браузере.', 'The button morphs from a cookie into a square, the bar flows like a wave, the covers flip like a deck — just like in the app. The sound is synthesized right in your browser.')}</p>
      </SectionHead>
      <div className="wl-demo wl-reveal">
        <div className="wl-deck" onClick={() => go(1)} role="button" aria-label={tr('Следующая', 'Next')}>
          {DEMO.map((d, n) => {
            const k = (n - i + DEMO.length) % DEMO.length;
            return (
              <div key={d.title} className="wl-deck-card" data-k={k} style={{ background: `linear-gradient(135deg, ${d.a}, ${d.b})` }}>
                <Mascot mood={playing && k === 0 ? 'dance' : 'idle'} className="w-24 h-24" />
              </div>
            );
          })}
        </div>
        <div className="wl-demo-body">
          <div className="md-headline-sm">{t.title}</div>
          <div className="md-title-md text-primary">{t.sub}</div>
          <WavyProgress className="mt-4" moving={playing} value={pos * 100} />
          <div className="flex items-center justify-center gap-4 mt-4">
            <button className="wl-round" onClick={() => go(-1)} aria-label={tr('Предыдущая', 'Previous')}><m3e-icon variant="rounded" name="skip_previous" filled /></button>
            <MorphPlay playing={playing} onClick={toggle} size={88} label={playing ? tr('Пауза', 'Pause') : tr('Играть', 'Play')} />
            <button className="wl-round" onClick={() => go(1)} aria-label={tr('Следующая', 'Next')}><m3e-icon variant="rounded" name="skip_next" filled /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A tiny synth for the demo: a soft pad and an arpeggio over four chords, looping (8 s). */
class Synth {
  private ctx: AudioContext | null = null;
  private timer = 0;
  private startedAt = 0;
  private master: GainNode | null = null;
  private readonly bar = 2;
  private static PROGS = [
    [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],
    [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]],
  ];
  private prog = Synth.PROGS[0];

  start(variant: number) {
    this.stop();
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = this.ctx ?? new AC();
    void this.ctx.resume();
    this.prog = Synth.PROGS[variant % Synth.PROGS.length];
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.exponentialRampToValueAtTime(0.5, this.ctx.currentTime + 0.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.master.connect(lp).connect(this.ctx.destination);
    this.startedAt = this.ctx.currentTime + 0.05;
    let next = this.startedAt;
    const schedule = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.6) { this.loop(next); next += this.bar * 4; }
    };
    schedule();
    this.timer = window.setInterval(schedule, 250);
  }

  private note(midi: number, at: number, len: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.08, len / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(this.master!);
    o.start(at); o.stop(at + len + 0.05);
  }

  private loop(t0: number) {
    this.prog.forEach((chord, c) => {
      const at = t0 + c * this.bar;
      chord.forEach((m) => this.note(m - 12, at, this.bar * 0.98, 'sine', 0.09));
      const arp = [...chord, chord[1] + 12, chord[2], chord[0] + 12, chord[1], chord[2] + 12];
      arp.forEach((m, k) => this.note(m + 12, at + k * (this.bar / 8), this.bar / 6, 'triangle', 0.06));
    });
  }

  /** where in the 8-second loop it is, 0…1 */
  progress() { return this.ctx ? (((this.ctx.currentTime - this.startedAt) % (this.bar * 4)) + this.bar * 4) % (this.bar * 4) / (this.bar * 4) : 0; }

  stop() {
    clearInterval(this.timer);
    if (this.ctx && this.master) {
      const g = this.master;
      g.gain.cancelScheduledValues(this.ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);
      setTimeout(() => g.disconnect(), 400);
    }
    this.master = null;
  }
}

/* ---------- what is inside ---------- */

function Features({ tr }: { tr: Tr }) {
  const items: Array<{ icon: string; title: string; text: string; art: ReactNode }> = [
    { icon: 'all_inclusive', title: tr('Моя волна', 'My Wave'), text: tr('Бесконечный поток под настроение: бег, фокус, вечер, вечеринка — или вкус друга.', 'An endless stream for your mood: running, focus, evening, party — or a friend’s taste.'), art: <div className="art-wave"><i /><i /><i /></div> },
    { icon: 'headphones', title: tr('Слушать вместе', 'Listen together'), text: tr('Одна очередь на всех и голоса за следующий трек — или просто следуйте за другом.', 'One queue for everyone and votes for the next song — or simply follow a friend.'), art: <div className="art-together">{[0, 1, 2].map((k) => <span key={k} style={{ ['--k' as any]: k, ...shapeMask('cookie12') }} />)}</div> },
    { icon: 'bolt', title: tr('Любой трек — сразу', 'Any song, at once'), text: tr('Нашли в каталоге — играет целиком через секунду, а сервер тем временем его скачивает.', 'Found it in the catalogue? It plays in full right away while the server fetches it.'), art: <div className="art-search"><span>{tr('найти: ', 'find: ')}</span><b>{tr('любимую песню', 'that song')}</b><i /></div> },
    { icon: 'lyrics', title: tr('Тексты караоке', 'Karaoke lyrics'), text: tr('Синхронные тексты с подсветкой по словам — и на экране блокировки.', 'Synced lyrics lit word by word — on the lock screen too.'), art: <div className="art-lyrics"><p>{tr('Слово за словом', 'Word by word')}</p><p>{tr('подсвечивается строка', 'the line lights up')}</p></div> },
    { icon: 'quiz', title: tr('Угадай мелодию', 'Guess the melody'), text: tr('Игра на скорость с друзьями по вашей же музыке.', 'A race with friends, on your own music.'), art: <div className="art-quiz">{['A', 'B', 'C', 'D'].map((x, k) => <span key={x} style={{ ['--k' as any]: k }}>{x}</span>)}</div> },
    { icon: 'swap_horiz', title: tr('Переезд за минуту', 'Move in a minute'), text: tr('Перенесите библиотеку из Spotify и Яндекс Музыки.', 'Bring your library over from Spotify and Yandex Music.'), art: <div className="art-move"><span /><m3e-icon variant="rounded" name="arrow_forward" /><span /></div> },
    { icon: 'devices', title: tr('Офлайн и устройства', 'Offline and devices'), text: tr('Скачивайте на телефон и перекидывайте музыку между телефоном и компьютером.', 'Save to your phone and hand the music over between phone and computer.'), art: <div className="art-devices"><span className="ph" /><span className="pc" /><i /></div> },
    { icon: 'send', title: tr('Статус в Telegram', 'Telegram status'), text: tr('Друзья видят в вашем профиле Telegram, что вы сейчас слушаете.', 'Friends see in your Telegram profile what you are listening to.'), art: <div className="art-tg"><span>♪ {tr('сейчас играет…', 'now playing…')}</span></div> },
  ];
  return (
    <section className="wl-section">
      <SectionHead kicker={tr('Что внутри', 'What’s inside')} title={tr('Всё, что нужно, чтобы слушать вместе', 'Everything you need to listen together')} />
      <div className="wl-grid4">
        {items.map((f, i) => (
          <article key={f.title} className="wl-feature wl-reveal" style={{ ['--d' as any]: `${(i % 4) * 80}ms` }}>
            <div className="wl-art">{f.art}</div>
            <div className="flex items-center gap-2 mt-4"><m3e-icon variant="rounded" name={f.icon} filled className="text-primary" /><h3 className="md-title-lg">{f.title}</h3></div>
            <p className="md-body-md muted mt-1.5">{f.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- how to get in ---------- */

function HowToJoin({ tr }: { tr: Tr }) {
  const steps: Array<[string, string, string]> = [
    ['mail', tr('Попросите приглашение', 'Ask for an invitation'), tr('Код даёт тот, кто уже внутри. Напишите другу, который рассказал вам про avr music.', 'Someone who is already inside gives you a code. Ask the friend who told you about avr music.')],
    ['how_to_reg', tr('Зарегистрируйтесь с кодом', 'Sign up with the code'), tr('Логин, пароль и код из приглашения — меньше минуты.', 'A login, a password and the code — under a minute.')],
    ['headphones', tr('Слушайте где удобно', 'Listen wherever you like'), tr('На сайте в браузере, в приложении для Android или iPhone.', 'On the site in your browser, or in the Android or iPhone app.')],
  ];
  return (
    <section id="how" className="wl-section">
      <SectionHead kicker={tr('Как попасть', 'How to get in')} title={tr('Три шага — и вы с нами', 'Three steps and you’re in')} />
      <ol className="wl-steps">
        {steps.map(([icon, title, text], i) => (
          <li key={title} className="wl-step wl-reveal" style={{ ['--d' as any]: `${i * 120}ms` }}>
            <span className="wl-step-n" style={shapeMask('cookie9')}>{i + 1}</span>
            <div><h3 className="md-title-lg flex items-center gap-2"><m3e-icon variant="rounded" name={icon} className="text-primary" />{title}</h3><p className="md-body-md muted mt-1">{text}</p></div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3 justify-center mt-8 wl-reveal">
        <M3eButton variant="filled" size="medium" href="/register"><m3e-icon variant="rounded" slot="icon" name="key" />{tr('Ввести код', 'Enter my code')}</M3eButton>
        <M3eButton variant="outlined" size="medium" href="/login">{tr('У меня уже есть аккаунт', 'I already have an account')}</M3eButton>
      </div>
    </section>
  );
}

function Apps({ tr }: { tr: Tr }) {
  const apps: Array<[string, string, string, string, string]> = [
    ['android', 'Android', tr('Приложение обновляется само. Скачайте APK и разрешите установку.', 'The app updates itself. Download the APK and allow installing it.'), `${RELEASES}/latest`, tr('Скачать APK', 'Download APK')],
    ['ios', 'iPhone', tr('Файл IPA ставится через AltStore или Sideloadly с вашим Apple ID.', 'Install the IPA with AltStore or Sideloadly using your Apple ID.'), RELEASES, tr('Найти IPA', 'Find the IPA')],
    ['language', tr('Сайт', 'Web'), tr('Работает прямо в браузере, можно установить как приложение.', 'Works right in the browser and installs like an app.'), '/login', tr('Открыть', 'Open')],
  ];
  return (
    <section className="wl-section">
      <SectionHead kicker={tr('Приложения', 'Apps')} title={tr('Одинаково на телефоне и компьютере', 'The same on phone and computer')} />
      <div className="wl-grid3">
        {apps.map(([icon, title, text, href, cta], i) => (
          <article key={title} className="wl-card wl-reveal flex flex-col" style={{ ['--d' as any]: `${i * 90}ms` }}>
            <span className="wl-card-icon" style={shapeMask('cookie12')}><m3e-icon variant="rounded" name={icon} filled /></span>
            <h3 className="md-title-lg mt-4">{title}</h3>
            <p className="md-body-md muted mt-1.5 flex-1">{text}</p>
            <M3eButton variant="tonal" className="mt-4 self-start" href={href} target={href.startsWith('http') ? '_blank' : undefined}>{cta}</M3eButton>
          </article>
        ))}
      </div>
    </section>
  );
}
