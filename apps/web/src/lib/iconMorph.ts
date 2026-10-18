// Icons that turn into the next one, everywhere on the site at once: whenever an icon changes its glyph
// (play → pause, repeat → repeat one, an empty heart → a full one) or fills in, the new one springs in
// from small and turned, instead of just switching.
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function startIconMorphs() {
  if (typeof MutationObserver === 'undefined' || reduced()) return;
  new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target as HTMLElement;
      if (el.tagName !== 'M3E-ICON' || r.oldValue === el.getAttribute(r.attributeName!)) continue;
      // the first glyph an icon gets is not a change
      if (r.attributeName === 'name' && r.oldValue == null) continue;
      el.animate(
        [{ transform: 'scale(.35) rotate(-30deg)', opacity: 0.2 }, { transform: 'none', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
      );
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['name', 'filled'], attributeOldValue: true });
}
