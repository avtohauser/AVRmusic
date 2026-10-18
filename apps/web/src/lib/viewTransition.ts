// Pages and panels that turn into one another, as in the app: every move inside the site runs in a view
// transition — what is named the same on both sides (a card's cover and title and the page's header, the
// player bar's cover and the full player's) flies to its new place, the rest cross-fades. Browsers
// without view transitions (and "reduce motion") just switch.
import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const canTransition = () => typeof document !== 'undefined' && 'startViewTransition' in document && !reduced();

/**
 * Runs [update] in a view transition. [settle] runs on the new state right away (names that were only
 * for the old one go); [ready] — what the new state waits for before it is shown (a page's header that
 * comes with its data); it waits a moment at most, then shows what there is.
 */
export function withTransition(update: () => void, ready?: () => boolean, settle?: () => void): void {
  if (!canTransition()) { update(); settle?.(); return; }
  (document as any).startViewTransition(async () => {
    flushSync(update);
    settle?.();
    if (!ready) return;
    const until = performance.now() + 450;
    while (!ready() && performance.now() < until) await new Promise((r) => requestAnimationFrame(r));
  });
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
      const parts = [...a.querySelectorAll<HTMLElement>('[data-vt]')];
      parts.forEach((el) => { el.style.viewTransitionName = `vt-${el.dataset.vt}`; });
      withTransition(
        () => navigate(to),
        parts.length ? () => !!document.querySelector('[data-vt-dest]') : undefined,
        () => { off.forEach((el) => el.classList.remove('vt-off')); parts.forEach((el) => { el.style.viewTransitionName = ''; }); },
      );
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
  return null;
}
