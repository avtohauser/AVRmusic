// avr music, the brand: the wordmark — "avr" medium, "music" light in the accent (Outfit).
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`wordmark ${className}`} aria-label="avr music">avr<i>music</i></span>;
}
