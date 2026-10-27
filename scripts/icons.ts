/**
 * Genera los iconos de la PWA desde `assets/icons/estante.svg`:
 *   public/icons/icon-192.png, icon-512.png           → "any" (cuadrados, a sangre)
 *   public/icons/icon-maskable-192.png, -512.png      → "maskable": el dibujo cabe en la zona segura
 *   public/apple-touch-icon.png (180)                 → iOS aplica su propia máscara redondeada
 *   public/favicon.svg                                → mismo dibujo con esquinas redondeadas
 *
 * Uso: bun run icons
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const root = join(import.meta.dir, '..');
const source = await readFile(join(root, 'assets', 'icons', 'estante.svg'), 'utf8');
const publicDir = join(root, 'public');
const iconsDir = join(publicDir, 'icons');

/** La zona segura de un icono maskable es el círculo central del 80 %: se encoge el dibujo. */
const maskable = source.replace(
  '<g id="art" transform="translate(0 0)">',
  '<g id="art" transform="translate(512 520) scale(0.74) translate(-512 -520)">',
);
const rounded = source.replaceAll('rx="0"', 'rx="228"');
if (maskable === source || rounded === source) {
  throw new Error('El SVG fuente cambió: revisa los marcadores que usa scripts/icons.ts.');
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .flatten({ background: '#0a0913' })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`  ${file.slice(root.length + 1)} (${size}×${size})`);
}

await mkdir(iconsDir, { recursive: true });
console.log('Iconos de Estante:');
await png(source, 192, join(iconsDir, 'icon-192.png'));
await png(source, 512, join(iconsDir, 'icon-512.png'));
await png(maskable, 192, join(iconsDir, 'icon-maskable-192.png'));
await png(maskable, 512, join(iconsDir, 'icon-maskable-512.png'));
await png(source, 180, join(publicDir, 'apple-touch-icon.png'));
await writeFile(join(publicDir, 'favicon.svg'), rounded);
console.log('  public/favicon.svg');
// El favicon.ico de la plantilla de Astro ya no se usa.
await rm(join(publicDir, 'favicon.ico'), { force: true });
