/** Remember the last search (query + scope) so the "Search" destination brings the results back. */
const KEY = 'avr.lastSearch';
export function rememberSearch(search: string) {
  try { sessionStorage.setItem(KEY, search); } catch { /* ignore */ }
}
export function lastSearchUrl(): string {
  try { return `/search${sessionStorage.getItem(KEY) || ''}`; } catch { return '/search'; }
}
