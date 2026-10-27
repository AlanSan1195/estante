import type { BookPalette } from '../../core/domain/published';
import { contentHash } from '../../core/domain/text';
import type { CoverGenerator, CoverInput } from '../../core/ports/CoverGenerator';

/** Paletas curadas: fondo en degradado, tinta legible y un acento cálido o frío. */
const PALETTES: BookPalette[] = [
  { background: '#1e1b4b', backgroundAlt: '#3730a3', ink: '#f5f3ff', accent: '#fbbf24' },
  { background: '#0f2f24', backgroundAlt: '#166534', ink: '#ecfdf5', accent: '#fcd34d' },
  { background: '#7f1d1d', backgroundAlt: '#c2410c', ink: '#fff7ed', accent: '#fde68a' },
  { background: '#0c4a6e', backgroundAlt: '#0284c7', ink: '#f0f9ff', accent: '#fda4af' },
  { background: '#3b0764', backgroundAlt: '#86198f', ink: '#fdf4ff', accent: '#67e8f9' },
  { background: '#111113', backgroundAlt: '#2a2a31', ink: '#fafafa', accent: '#a3e635' },
  { background: '#431407', backgroundAlt: '#9a3412', ink: '#fff7ed', accent: '#fdba74' },
  { background: '#134e4a', backgroundAlt: '#0f766e', ink: '#f0fdfa', accent: '#fca5a5' },
  { background: '#efe4cc', backgroundAlt: '#d9c49a', ink: '#2b2116', accent: '#9a3412' },
  { background: '#1f2937', backgroundAlt: '#4338ca', ink: '#f9fafb', accent: '#f472b6' },
];

const WIDTH = 600;
const HEIGHT = 900;

export function createSvgCoverGenerator(): CoverGenerator {
  return {
    palette: paletteFor,
    generate(input) {
      const palette = paletteFor(input);
      return { svg: renderCover(input, palette), palette };
    },
  };
}

function paletteFor(input: CoverInput): BookPalette {
  if (input.color && /^#?[0-9a-f]{6}$/i.test(input.color)) return paletteFromColor(input.color);
  const hash = Number.parseInt(contentHash(input.title.toLowerCase()).slice(-6), 16);
  return PALETTES[hash % PALETTES.length] ?? (PALETTES[0] as BookPalette);
}

/* ───────────────────────── Color ───────────────────────── */

function hexToHsl(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hsl(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const lig = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function paletteFromColor(color: string): BookPalette {
  const [h, s, l] = hexToHsl(color.startsWith('#') ? color : `#${color}`);
  const dark = l < 0.6;
  return {
    background: hsl(h, s, dark ? Math.min(l, 0.28) : Math.max(l, 0.82)),
    backgroundAlt: hsl(
      h + 18,
      s * 0.95,
      dark ? Math.min(l + 0.14, 0.42) : Math.max(l - 0.12, 0.66),
    ),
    ink: dark ? '#fbfaf7' : '#231a12',
    accent: hsl(h + 150, Math.max(0.6, s), dark ? 0.68 : 0.36),
  };
}

/* ───────────────────────── Tipografía ───────────────────────── */

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Corte de líneas aproximado por ancho medio de carácter. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${(kept[maxLines - 1] ?? '').replace(/[\s,;:.]+$/, '')}…`;
    return kept;
  }
  return lines;
}

function titleSize(title: string): number {
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  if (title.length <= 7 && longest <= 7) return 132;
  if (title.length <= 12 && longest <= 10) return 100;
  if (title.length <= 22) return 76;
  return 60;
}

function renderCover(input: CoverInput, palette: BookPalette): string {
  const seed = contentHash(input.slug);
  const rnd = (i: number) => Number.parseInt(seed.slice(i % 12, (i % 12) + 2), 16) / 255;

  const size = titleSize(input.title);
  const titleLines = wrap(input.title, Math.max(6, Math.floor(480 / (size * 0.56))), 4);
  const titleTop = 230;
  const titleLeading = size * 1.02;
  const subtitleTop = titleTop + titleLines.length * titleLeading + 26;
  const subtitleLines = input.subtitle ? wrap(input.subtitle, 30, 4) : [];

  // Motivo de "líneas de código": barras redondeadas con sangrías deterministas.
  // Se colocan en el hueco libre entre el subtítulo y el filete del autor (y ≤ 760).
  const textBottom = subtitleTop + Math.max(0, subtitleLines.length - 1) * 36;
  const barsTop = Math.max(590, textBottom + 48);
  const barCount = Math.max(0, Math.min(8, Math.floor((760 - barsTop) / 21) + 1));
  const bars = Array.from({ length: barCount }, (_, i) => {
    const indent = [0, 1, 2, 2, 1, 2, 1, 0][i] ?? 0;
    const length = 120 + Math.round(rnd(i * 3) * 220);
    const x = 60 + indent * 34;
    const y = barsTop + i * 21;
    const opacity = (0.16 + rnd(i * 5 + 1) * 0.22).toFixed(2);
    const fill = i % 3 === 1 ? palette.accent : palette.ink;
    return `<rect x="${x}" y="${y}" width="${length}" height="9" rx="4.5" fill="${fill}" opacity="${opacity}"/>`;
  }).join('');

  const title = titleLines
    .map(
      (line, i) =>
        `<text x="60" y="${titleTop + i * titleLeading}" font-size="${size}" font-weight="700" letter-spacing="-1.5">${escapeXml(line)}</text>`,
    )
    .join('');
  const subtitle = subtitleLines
    .map(
      (line, i) =>
        `<text x="60" y="${subtitleTop + i * 36}" font-size="27" opacity="0.86" font-family="ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', sans-serif">${escapeXml(line)}</text>`,
    )
    .join('');

  // Ids únicos por libro: varias portadas en línea en la misma página no comparten degradados.
  const uid = `c${seed.slice(0, 8)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${escapeXml(input.title)}">
<defs>
<linearGradient id="${uid}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.background}"/><stop offset="1" stop-color="${palette.backgroundAlt}"/></linearGradient>
<radialGradient id="${uid}-glow" cx="0.85" cy="0.12" r="0.7"><stop offset="0" stop-color="${palette.accent}" stop-opacity="0.32"/><stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/></radialGradient>
<linearGradient id="${uid}-spine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${uid}-bg)"/>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${uid}-glow)"/>
<circle cx="${470 + Math.round(rnd(2) * 60)}" cy="${150 + Math.round(rnd(4) * 60)}" r="190" fill="none" stroke="${palette.ink}" stroke-opacity="0.07" stroke-width="2"/>
<circle cx="${470 + Math.round(rnd(2) * 60)}" cy="${150 + Math.round(rnd(4) * 60)}" r="132" fill="none" stroke="${palette.ink}" stroke-opacity="0.06" stroke-width="2"/>
<g fill="${palette.accent}" font-family="ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', sans-serif" font-size="17" font-weight="600" letter-spacing="5"><text x="60" y="96">LIBRO DE ESTUDIO</text></g>
<rect x="60" y="116" width="56" height="3" rx="1.5" fill="${palette.accent}"/>
<g fill="${palette.ink}" font-family="'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif">${title}</g>
<g fill="${palette.ink}">${subtitle}</g>
${bars}
<rect x="60" y="${HEIGHT - 96}" width="${WIDTH - 120}" height="1" fill="${palette.ink}" opacity="0.25"/>
<text x="60" y="${HEIGHT - 58}" fill="${palette.ink}" font-family="ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', sans-serif" font-size="20" font-weight="600" letter-spacing="4">${escapeXml(input.author.toUpperCase())}</text>
<rect width="26" height="${HEIGHT}" fill="url(#${uid}-spine)"/>
</svg>
`;
}
