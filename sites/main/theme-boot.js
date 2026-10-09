// Sets the theme before first paint, so a light-theme visitor never sees a dark flash.
// Kept as a file (not inline) so the page can run under a strict Content-Security-Policy.
try {
  var t = localStorage.getItem('avr.theme');
  document.documentElement.dataset.theme = (t === 'light' || t === 'dark') ? t
    : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  if (localStorage.getItem('avr.calm') === '1') document.documentElement.classList.add('lite');
} catch (e) {}