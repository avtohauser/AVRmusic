// Pages and panels that turn into one another, as in the app: every move inside the site runs in a view
// transition — what is named the same on both sides (a card's cover and title and the page's header, the
// player bar's cover and the full player's) flies to its new place, the rest cross-fades. Browsers
// without view transitions (and "reduce motion") just switch.
import { useEffect, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const canTransition = () => typeof document !== 'undefined' && 'startViewTransition' in document && !reduced();

type Options = {
  /** What the new state waits for before it is shown (a page's header that comes with its data); a moment at most. */
  ready?: () => boolean;
  /** Runs on the new state right away (names that were only for the old one go). */
  settle?: () => void;
  /** Set on <html> as data-vt-kind while it runs, so CSS can tell one kind of move from another. */
  kind?: string;
};

let busy = false;
let last = 0;

// The router draws a new page later than it changes the address (its updates are React transitions,
// which flushSync does not hurry), so a move that goes to another address waits for that page.
let commits = 0;
const waiters: Array<() => void> = [];
function pageDrawn(since: number): Promise<void> {
  if (commits !== since) return Promise.resolve();
  return new Promise((done) => {
    const cap = setTimeout(done, 1200);
    waiters.push(() => { clearTimeout(cap); done(); });
  });
}

/** Runs [update] in a view transition. */
export function withTransition(update: () => void, { ready, settle, kind }: Options = {}): Promise<void> {
  // one inside another (a link in the full player that also closes it) is part of the same move
  if (!canTransition() || busy) { update(); settle?.(); return Promise.resolve(); }
  busy = true;
  const root = document.documentElement;
  // a move started while the last one still plays is a move of its own kind
  const mine = ++last;
  if (kind) root.dataset.vtKind = kind; else delete root.dataset.vtKind;
  const t = (document as any).startViewTransition(async () => {
    try {
      const at = location.href, since = commits;
      flushSync(update);
      if (location.href !== at) await pageDrawn(since);
      settle?.();
      if (!ready) return;
      const until = performance.now() + 450;
      // a timer, not a frame: the browser draws no frames while it waits for the new state
      while (!ready() && performance.now() < until) await new Promise((r) => setTimeout(r, 16));
    } finally { busy = false; }
  });
  // safety net for a transition that was cut short
  const done = () => { if (mine === last) { busy = false; delete root.dataset.vtKind; } };
  return t.finished.then(done, done);
}

/**
 * A switch inside a page (tabs, chips, the player's lyrics and queue). For the moment what is marked .vt-tab
 * takes the name in its --vt: the controls keep their own motion instead of a cross-fade, the content under
 * them rises in.
 */
export function withTab(update: () => void): void {
  void withTransition(update, { kind: 'tab' });
}

/** Elements inside a link that do something else than open it (a like, a play button, a menu). */
const ACTION = 'button, [role="button"], m3e-icon-button, m3e-button, input, select, textarea, label';

/**
 * Turns every in-site link into a view transition. The tapped link's parts marked data-vt="cover" /
 * data-vt="title" are named for the moment, so they fly into the new page's header, which carries the same
 * names (data-vt-dest). Lives inside the router.
 */
export function ViewTransitionLinks() {
  const navigate = useNavigate();
  const loc = useLocation();
  useLayoutEffect(() => { commits++; waiters.splice(0).forEach((w) => w()); }, [loc.key]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canTransition()) return;
      const target = e.target as Element | null;
      const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.origin !== location.origin) return;
      const action = target?.closest(ACTION);
      if (action && a.contains(action)) return;
      const to = a.pathname + a.search + a.hash;
      if (to === location.pathname + location.search + location.hash || a.pathname.startsWith('/api/')) return;
      e.preventDefault();
      // this page's header gives its names up for the moment (the new one takes them), the tapped card takes them;
      // on the new page both go back, so a header or a card that stays on screen does not clash with itself
      const off = [...document.querySelectorAll<HTMLElement>('[data-vt-dest]')];
      off.forEach((el) => el.classList.add('vt-off'));
      // the link itself may be the part (a genre tile); a name is given once, two of one name break the move
      const seen = new Set<string>();
      const parts = [...(a.matches('[data-vt]') ? [a] : []), ...a.querySelectorAll<HTMLElement>('[data-vt]')]
        .filter((el) => !seen.has(el.dataset.vt!) && !!seen.add(el.dataset.vt!));
      parts.forEach((el) => { el.style.viewTransitionName = `vt-${el.dataset.vt}`; });
      void withTransition(() => navigate(to), {
        ready: parts.length ? () => !!document.querySelector('[data-vt-dest]') : undefined,
        settle: () => { off.forEach((el) => el.classList.remove('vt-off')); parts.forEach((el) => { el.style.viewTransitionName = ''; }); },
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
  return null;
}
