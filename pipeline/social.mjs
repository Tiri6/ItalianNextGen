// GENERATORE IMMAGINI SOCIAL
// Uso: npm run social
//
// Per ogni articolo pubblicato senza immagine social crea public/social/<slug>.jpg
// (1080×1080, stile blu/oro del sito): è l'immagine che Instagram e WhatsApp
// mostrano, e che il feed RSS espone ai servizi di auto-posting.

import { readFile, writeFile, readdir, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'src', 'content', 'news');
const OUT = path.join(ROOT, 'public', 'social');

const CAT = {
  news: 'NEWS', performance: 'MATCH REPORT', mercato: 'MERCATO',
  editoriale: 'EDITORIALE', taccuino: 'TACCUINO DEL GIORNO',
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Spezza il titolo in righe da ~22 caratteri (max 6 righe)
function wrap(title, max = 22, lines = 6) {
  const words = title.split(' ');
  const out = [''];
  for (const w of words) {
    if ((out[out.length - 1] + ' ' + w).trim().length > max) out.push(w);
    else out[out.length - 1] = (out[out.length - 1] + ' ' + w).trim();
  }
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] += '…';
  }
  return out;
}

function svgFor({ title, category, players }) {
  const lines = wrap(title);
  const startY = 420;
  const lineH = 86;
  const titleSvg = lines
    .map((l, i) => `<text x="90" y="${startY + i * lineH}" font-family="DejaVu Sans, sans-serif" font-size="68" font-weight="bold" fill="#eef5fc">${esc(l)}</text>`)
    .join('\n');
  const player = (players?.[0] && category !== 'taccuino') ? `<text x="90" y="960" font-family="DejaVu Sans, sans-serif" font-size="38" fill="#8fd2f7">⚽ ${esc(players[0])}</text>` : '';

  return `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d2c50"/>
      <stop offset="0.55" stop-color="#12437a"/>
      <stop offset="1" stop-color="#1a5da5"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  ${Array.from({ length: 14 }, (_, i) => `<line x1="${i * 80}" y1="0" x2="${i * 80}" y2="1080" stroke="#7cc4f0" stroke-opacity="0.12"/>`).join('')}
  <circle cx="880" cy="220" r="260" fill="none" stroke="#7cc4f0" stroke-opacity="0.3" stroke-width="3"/>
  <path d="M 640 400 A 260 260 0 0 1 1080 300" fill="none" stroke="#f0c94a" stroke-width="6" stroke-dasharray="30 12" stroke-linecap="round"/>
  <rect x="90" y="240" width="${CAT[category]?.length * 26 + 50 || 200}" height="64" rx="6" fill="#f0c94a"/>
  <text x="115" y="285" font-family="DejaVu Sans, sans-serif" font-size="34" font-weight="bold" fill="#0b2440">${CAT[category] ?? 'NEWS'}</text>
  ${titleSvg}
  ${player}
  <g transform="translate(90,110)">
    <rect width="26" height="56" fill="#009246"/><rect x="26" width="26" height="56" fill="#f4f6fa"/><rect x="52" width="26" height="56" fill="#ce2b37"/>
    <text x="100" y="42" font-family="DejaVu Sans, sans-serif" font-size="42" font-weight="bold" fill="#eef5fc">ITALIAN <tspan fill="#f0c94a">NEXT GEN</tspan></text>
  </g>
  <text x="90" y="1030" font-family="DejaVu Sans, sans-serif" font-size="30" fill="#9fc2e0">italiannextgen.it · articolo completo: link in bio</text>
</svg>`;
}

const files = (await readdir(NEWS)).filter((f) => f.endsWith('.md'));
await mkdir(OUT, { recursive: true });
let made = 0, skipped = 0;

for (const f of files) {
  const slug = f.replace(/\.md$/, '');
  const dest = path.join(OUT, `${slug}.jpg`);
  try { await access(dest); skipped++; continue; } catch {}

  const t = await readFile(path.join(NEWS, f), 'utf8');
  const fm = t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  let title = fm.match(/^title:\s*"(.*)"/m)?.[1] ?? slug;
  // Togli il nome della testata in coda ("... - Gazzetta", "... | MSN")
  title = title.replace(/\s*[-–|]\s*[A-Z][\w.' ]{2,25}$/, '').trim();
  const category = fm.match(/^category:\s*["']?(\w+)/m)?.[1] ?? 'news';
  const players = [...(fm.match(/^players:\s*\[(.*)\]/m)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  const svg = svgFor({ title, category, players });
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(dest);
  made++;
}

console.log(`🖼  Immagini social: create ${made}, già esistenti ${skipped} (in public/social/).`);
