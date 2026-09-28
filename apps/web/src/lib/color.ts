const cache = new Map<string, string>();

/** Average colour of an image (same-origin covers), tuned for use as a hero/backdrop tint. */
export async function dominantColor(src: string | null | undefined, fallback = '#3b3b55'): Promise<string> {
  if (!src) return fallback;
  if (cache.has(src)) return cache.get(src)!;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = src; });
    const c = document.createElement('canvas');
    const n = 24;
    c.width = n; c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i + 1], d[i + 2]);
      const min = Math.min(d[i], d[i + 1], d[i + 2]);
      const sat = max === 0 ? 0 : (max - min) / max;
      const weight = 0.2 + sat;
      r += d[i] * weight; g += d[i + 1] * weight; b += d[i + 2] * weight; w += weight;
    }
    r /= w; g /= w; b /= w;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const k = lum > 140 ? 140 / lum : lum < 40 ? 1.6 : 1;
    const out = `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
    cache.set(src, out);
    return out;
  } catch {
    return fallback;
  }
}
