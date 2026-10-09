#!/usr/bin/env python3
"""Draws every brand file of avr from one geometry: the star in its colours (the base of everything), each
product's sign (the star and the product's own addition beside it), the wordmarks "avr" + suffix as real outlines (Outfit, no font needed to show them),
the lockups, the app icons and the star backgrounds. Run from the repository root:

    python3 brand/tools/build.py          (needs fontTools: pip install fonttools)
    node brand/tools/render.mjs           (then the PNGs: icons, link previews, banners — needs Playwright)

Everything lands in brand/assets/. Change the geometry here, not in the files."""
import math
import os
import random
import re
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')

TEAL, TEAL_DEEP, MIST, MIST_DIM = '#0B4248', '#08353A', '#D3E3E4', '#A9C4C6'
PINK, VIOLET, PAPER, WHITE = '#F2A5C3', '#5A4FC8', '#E9EFEF', '#FFFFFF'

# the products: the suffix after "avr", whether it is written apart ("avr music") or as one word ("avrtube")
PRODUCTS = {
  'avr': ('', None),
  'avr-music': ('music', True),
  'avrtube': ('tube', False),
  'avrgram': ('gram', False),
  'avr-studio': ('studio', True),
}
# the grounds a mark sits on and its colours there: "avr" in ink, the suffix in the accent
GROUNDS = {
  'dark': {'ink': MIST, 'accent': PINK, 'ground': TEAL},
  'light': {'ink': TEAL, 'accent': VIOLET, 'ground': PAPER},
  'mono-white': {'ink': WHITE, 'accent': WHITE, 'ground': None},
  'mono-teal': {'ink': TEAL, 'accent': TEAL, 'ground': None},
}

# ---------- the star: four concave rays in a 100 × 100 box ----------

STAR = 'M50 2 C53 30 70 47 98 50 C70 53 53 70 50 98 C47 70 30 53 2 50 C30 47 47 30 50 2Z'


def star_d(x=0.0, y=0.0, s=100.0, rot=0.0):
  """The star's path in a box of side s at (x, y), turned by rot degrees about its centre."""
  k, c = s / 100.0, math.radians(rot)
  def pt(px, py):
    dx, dy = px - 50, py - 50
    rx, ry = dx * math.cos(c) - dy * math.sin(c), dx * math.sin(c) + dy * math.cos(c)
    return f'{x + (50 + rx) * k:.2f} {y + (50 + ry) * k:.2f}'
  out = []
  for cmd, args in re.findall(r'([MCZ])([^MCZ]*)', STAR):
    n = [float(v) for v in args.split()]
    out.append(cmd + ' '.join(pt(n[i], n[i + 1]) for i in range(0, len(n), 2)))
  return ''.join(out)


def grad(gid, a=PINK, b=VIOLET):
  """The star's gradient: pink at the lower left, violet at the upper right."""
  return (f'<linearGradient id="{gid}" x1="0" y1="1" x2="1" y2="0">'
          f'<stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>')


# ---------- the star is the base; every product adds its own sign beside it ----------
# All in the sign's 140 × 100 box (the star takes 0–100), drawn the way music's waves are: lines 6 thick with round
# ends, the outer shape violet, the inner one pink. avr itself — the ecosystem — wears the star alone.

def _music(line, solid, p):     # two sound waves
  return (f'<path d="M108 30 A28 28 0 0 1 108 70" stroke="{p(PINK)}" {line}/>'
          f'<path d="M122 18 A44 44 0 0 1 122 82" stroke="{p(VIOLET)}" {line}/>')


def _tube(line, solid, p):      # a screen with a play sign in it
  return (f'<rect x="104" y="24" width="31" height="52" rx="11" stroke="{p(VIOLET)}" {line}/>'
          f'<path d="M114.5 41 L126 50 L114.5 59 Z" fill="{p(PINK)}" stroke="{p(PINK)}" stroke-width="5" stroke-linejoin="round"/>')


def _gram(line, solid, p):      # a message: the bubble and two lines of text in it
  return (f'<path d="M115 23 H124 Q135 23 135 34 V55 Q135 66 124 66 H117 L106 77 V55 Q104 51 104 46 V34 Q104 23 115 23 Z" stroke="{p(VIOLET)}" {line}/>'
          f'<path d="M113 38.5 H126 M113 50.5 H120" stroke="{p(PINK)}" {line}/>')


def _studio(line, solid, p):    # the showcase of projects: four cards on a wall, one of them lit (solid tiles: outlines this small close up)
  return (f'<rect x="103" y="25" width="15" height="22" rx="5" fill="{p(VIOLET)}"/>'
          f'<rect x="123" y="25" width="15" height="22" rx="5" fill="{p(VIOLET)}"/>'
          f'<rect x="103" y="53" width="15" height="22" rx="5" fill="{p(VIOLET)}"/>'
          f'<rect x="123" y="53" width="15" height="22" rx="5" fill="{p(PINK)}"/>')


ADDITIONS = {'avr-music': _music, 'avrtube': _tube, 'avrgram': _gram, 'avr-studio': _studio}


def attribute(product, mono=None):
  p = (lambda c: mono or c)
  solid = 'stroke-width="6" stroke-linecap="round" stroke-linejoin="round"'
  draw = ADDITIONS.get(product)
  return draw('fill="none" ' + solid, solid, p) if draw else ''


def has_attribute(product):
  return product in ADDITIONS


def sign_svg(product, mono=None, gid='g'):
  """The product's sign: the star and the product's own addition beside it; avr itself wears the star alone."""
  if not has_attribute(product):
    return star_svg(mono=mono, gid=gid)
  fill = mono or f'url(#{gid})'
  defs = '' if mono else f'<defs>{grad(gid)}</defs>'
  return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100">{defs}'
          f'<path fill="{fill}" d="{STAR}"/>{attribute(product, mono)}</svg>')


def star_svg(mono=None, gid='g'):
  fill = mono or f'url(#{gid})'
  defs = '' if mono else f'<defs>{grad(gid)}</defs>'
  return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{defs}<path fill="{fill}" d="{STAR}"/></svg>'


# ---------- the wordmark: real outlines of Outfit Medium ("avr") and Outfit Light (the suffix) ----------

FONTS = {w: TTFont(os.path.join(ROOT, 'fonts', f'outfit-{w}.ttf')) for w in ('medium', 'light')}


def pair_kerning(font):
  """Pair adjustments (GPOS lookup type 2), as {(left glyph, right glyph): x advance change}."""
  kern = {}
  gpos = font['GPOS'].table
  order = font.getGlyphOrder()
  for lookup in gpos.LookupList.Lookup:
    subs = lookup.SubTable
    if lookup.LookupType == 9:
      subs = [s.ExtSubTable for s in subs]
    elif lookup.LookupType != 2:
      continue
    for st in subs:
      if getattr(st, 'LookupType', 2) != 2:
        continue
      if st.Format == 1:
        for first, ps in zip(st.Coverage.glyphs, st.PairSet):
          for rec in ps.PairValueRecord:
            v = getattr(rec.Value1, 'XAdvance', 0) if rec.Value1 else 0
            if v:
              kern.setdefault((first, rec.SecondGlyph), v)
      elif st.Format == 2:
        c1 = st.ClassDef1.classDefs
        c2 = st.ClassDef2.classDefs
        for first in st.Coverage.glyphs:
          row = st.Class1Record[c1.get(first, 0)]
          for second in order:
            rec = row.Class2Record[c2.get(second, 0)]
            v = getattr(rec.Value1, 'XAdvance', 0) if rec.Value1 else 0
            if v:
              kern.setdefault((first, second), v)
  return kern


KERN = {w: pair_kerning(f) for w, f in FONTS.items()}


def text_outline(text, weight, size, x, baseline, tracking=-0.026):
  """Text as one SVG path; returns (d, the x where the next letter would start)."""
  font = FONTS[weight]
  upm = font['head'].unitsPerEm
  cmap, gs, hmtx = font.getBestCmap(), font.getGlyphSet(), font['hmtx']
  k = size / upm
  ds, prev = [], None
  for ch in text:
    g = cmap[ord(ch)]
    if prev is not None:
      x += KERN[weight].get((prev, g), 0) * k
    pen = SVGPathPen(gs)
    gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, baseline)))
    ds.append(pen.getCommands())
    x += hmtx[g][0] * k + tracking * size
    prev = g
  return ' '.join(ds), x


def wordmark_parts(product, size=100.0, x=0.0, baseline=0.0):
  """("avr" path, suffix path, right edge) for the product at a font size."""
  suffix, apart = PRODUCTS[product]
  d1, x1 = text_outline('avr', 'medium', size, x, baseline)
  if not suffix:
    return d1, '', x1
  # a name written apart keeps a narrow gap; a one-word name only changes weight and colour
  x1 += size * (0.14 if apart else 0.035)
  d2, x2 = text_outline(suffix, 'light', size, x1, baseline)
  return d1, d2, x2


XH = 0.48  # Outfit's x-height (480 of 1000 units)


def wordmark_svg(product, g):
  size, pad = 100.0, 4.0
  d1, d2, right = wordmark_parts(product, size, pad, 100.0)
  w, h = right + pad, 100.0 + 0.22 * size  # room for the descender of "g"
  return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}">'
          f'<path fill="{g["ink"]}" d="{d1}"/>' + (f'<path fill="{g["accent"]}" d="{d2}"/>' if d2 else '') + '</svg>')


def lockup_svg(product, g, gid):
  """Horizontal: the star (never the attribute) at 0.62 of the type size, centred on the x-height, then the name."""
  size = 100.0
  s = 0.62 * size
  base = 100.0
  cy = base - XH * size / 2
  star_y = cy - s / 2
  d1, d2, right = wordmark_parts(product, size, s + 0.16 * size, base)
  w, h = right + 4, base + 0.22 * size
  mono = g['ink'] if g['ground'] is None else None
  defs = '' if mono else f'<defs>{grad(gid)}</defs>'
  return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {min(0, star_y):.1f} {w:.1f} {h - min(0, star_y):.1f}">{defs}'
          f'<path fill="{mono or f"url(#{gid})"}" d="{star_d(0, star_y, s)}"/>'
          f'<path fill="{g["ink"]}" d="{d1}"/>' + (f'<path fill="{g["accent"]}" d="{d2}"/>' if d2 else '') + '</svg>')


def stacked_svg(product, g, gid):
  """Stacked: the product's sign over its name, both centred."""
  size = 60.0
  d1, d2, right = wordmark_parts(product, size, 0, 0)
  word_w = right
  sign_w = 140.0 if has_attribute(product) else 100.0
  w = max(word_w, sign_w) + 8
  sx = (w - sign_w) / 2
  base = 100 + 26 + size * 0.7
  wx = (w - word_w) / 2
  d1, d2, _ = wordmark_parts(product, size, wx, base)
  mono = g['ink'] if g['ground'] is None else None
  defs = '' if mono else f'<defs>{grad(gid)}</defs>'
  attr = attribute(product, mono) if has_attribute(product) else ''
  return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {base + size * 0.24:.1f}">{defs}'
          f'<g transform="translate({sx:.1f} 0)"><path fill="{mono or f"url(#{gid})"}" d="{STAR}"/>{attr}</g>'
          f'<path fill="{g["ink"]}" d="{d1}"/>' + (f'<path fill="{g["accent"]}" d="{d2}"/>' if d2 else '') + '</svg>')


# ---------- app icons: the sign on a teal tile (corners 22.5 % like the site's favicon) ----------

def icon_svg(product, ground=TEAL, size=1024):
  r = size * 0.225
  if has_attribute(product):
    k = size * 0.68 / 140
    ox, oy = (size - 140 * k) / 2, (size - 100 * k) / 2
    inner = f'<path fill="url(#g)" d="{STAR}"/>{attribute(product)}'
  else:
    k = size * 0.56 / 100
    ox, oy = (size - 100 * k) / 2, (size - 100 * k) / 2
    inner = f'<path fill="url(#g)" d="{STAR}"/>'
  return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"><defs>{grad("g")}</defs>'
          f'<rect width="{size}" height="{size}" rx="{r:.1f}" fill="{ground}"/>'
          f'<g transform="translate({ox:.1f} {oy:.1f}) scale({k:.4f})">{inner}</g></svg>')


def adaptive_foreground_svg(product, size=432, mono=None):
  """Android's adaptive icon: the sign alone in the 66/108 safe circle of a 108-unit layer."""
  inner_w = size * (60 / 108)
  if has_attribute(product):
    k = inner_w / 140
    w, h = 140, 100
  else:
    k = inner_w * 0.82 / 100
    w, h = 100, 100
  ox, oy = (size - w * k) / 2, (size - h * k) / 2
  fill = mono or 'url(#g)'
  defs = '' if mono else f'<defs>{grad("g")}</defs>'
  attr = attribute(product, mono) if has_attribute(product) else ''
  return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">{defs}'
          f'<g transform="translate({ox:.1f} {oy:.1f}) scale({k:.4f})"><path fill="{fill}" d="{STAR}"/>{attr}</g></svg>')


# ---------- the star as a background ----------

def starfield_svg(theme, w=960, h=640, seed=7):
  """A field of stars to tile behind a hero: a few brand stars among many points, never in rows."""
  rnd = random.Random(seed)
  ground = TEAL if theme == 'dark' else PAPER
  dot = MIST if theme == 'dark' else TEAL
  out = [f'<rect width="{w}" height="{h}" fill="{ground}"/>']
  for _ in range(140):  # points
    x, y, r = rnd.uniform(0, w), rnd.uniform(0, h), rnd.choice((0.8, 1, 1, 1.3, 1.6))
    out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{dot}" opacity="{rnd.uniform(.12, .5) if theme == "dark" else rnd.uniform(.08, .28):.2f}"/>')
  for i in range(14):  # small brand stars
    s = rnd.choice((10, 12, 14, 18, 22, 28))
    x, y = rnd.uniform(0, w - s), rnd.uniform(0, h - s)
    col = (PINK, VIOLET, MIST if theme == 'dark' else TEAL)[i % 3]
    out.append(f'<path fill="{col}" opacity="{rnd.uniform(.35, .8) if theme == "dark" else rnd.uniform(.25, .55):.2f}" d="{star_d(x, y, s)}"/>')
  return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">' + ''.join(out) + '</svg>'


def bigstar_svg(theme, w=1200, h=800):
  """One star much bigger than the page, cut by the corner: a quiet watermark behind a section."""
  ground = TEAL if theme == 'dark' else PAPER
  s = h * 1.5
  return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><defs>{grad("g")}</defs>'
          f'<rect width="{w}" height="{h}" fill="{ground}"/>'
          f'<path fill="url(#g)" opacity="{0.16 if theme == "dark" else 0.12}" d="{star_d(w - s * 0.62, -s * 0.32, s, 0)}"/></svg>')


def write(rel, text):
  p = os.path.join(OUT, rel)
  os.makedirs(os.path.dirname(p), exist_ok=True)
  with open(p, 'w') as f:
    f.write(text + '\n')


def main():
  # the mark
  write('mark/star.svg', star_svg())
  for name, col in (('mist', MIST), ('teal', TEAL), ('white', WHITE), ('pink', PINK), ('violet', VIOLET)):
    write(f'mark/star-{name}.svg', star_svg(mono=col))
  # signs, wordmarks, lockups, icons per product
  for p in PRODUCTS:
    if has_attribute(p):
      write(f'signs/{p}.svg', sign_svg(p))
      write(f'signs/{p}-white.svg', sign_svg(p, mono=WHITE))
      write(f'signs/{p}-teal.svg', sign_svg(p, mono=TEAL))
    for gname, g in GROUNDS.items():
      write(f'wordmarks/{p}-{gname}.svg', wordmark_svg(p, g))
      write(f'lockups/{p}-{gname}.svg', lockup_svg(p, g, 'g'))
      write(f'lockups/{p}-stacked-{gname}.svg', stacked_svg(p, g, 'g'))
    write(f'icons/{p}.svg', icon_svg(p))
    write(f'icons/{p}-adaptive-foreground.svg', adaptive_foreground_svg(p))
    write(f'icons/{p}-adaptive-monochrome.svg', adaptive_foreground_svg(p, mono=WHITE))
  # the star behind things
  for t in ('dark', 'light'):
    write(f'backgrounds/starfield-{t}.svg', starfield_svg(t))
    write(f'backgrounds/bigstar-{t}.svg', bigstar_svg(t))
  print('brand/assets: done')


if __name__ == '__main__':
  main()
