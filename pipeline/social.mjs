// GENERATORE IMMAGINI SOCIAL
// Uso: npm run social
//
// Per ogni articolo pubblicato senza immagine social crea public/social/<slug>.jpg
// (1080×1080, stile blu/oro del sito): è l'immagine che Instagram e WhatsApp
// mostrano, e che il feed RSS espone ai servizi di auto-posting.

import { readFile, writeFile, readdir, mkdir, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { figureSvg, stadiumSvg, jerseySvg, tacticsBoardSvg, trophySvg, formationNames } from './social-art.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'src', 'content', 'news');
const OUT = process.env.SOCIAL_OUT || path.join(ROOT, 'public', 'social');

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

function svgClassic({ title, category, players }) {
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


// ============================================================================
// ILLUSTRAZIONI STILIZZATE (regole approvate da Marco il 23 ott 2026)
//   Taccuino              → lavagnetta da allenatore con un modulo
//   Europei / Mondiali    → coppa stilizzata
//   Mercato               → solo lo stadio
//   Un calciatore         → calciatore stilizzato + stadio sullo sfondo ("ibrida")
//   Più giocatori / club  → maglia del club della maggioranza dei giocatori (a parità: club nel titolo, poi scelta fissa per articolo)
//   Club non riconosciuto → cover classica
// ============================================================================
const CLUBS = JSON.parse(await readFile(path.join(ROOT, 'data', 'clubs.json'), 'utf8'));
delete CLUBS._note;
const PLAYERS = (() => { try { const d = JSON.parse(readFileSync(path.join(ROOT, 'data', 'players.json'), 'utf8')); return d.players ?? d; } catch { return []; } })();
const CLUB_OF = new Map(PLAYERS.map((p) => [p.name, p.club]));

const hash = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pickSeeded = (arr, seed) => arr[hash(seed) % arr.length];

/** "Atalanta U23" / "Milan Futuro" / "Catanzaro (prestito Milan)" → nome club presente in clubs.json */
function baseClub(raw) {
  if (!raw) return null;
  let n = raw.replace(/\(.*?\)/g, '').replace(/\b(U\d\d|Futuro|Primavera)\b/gi, '').trim();
  if (CLUBS[n]) return n;
  for (const [k, v] of Object.entries(CLUBS)) if ([k, ...(v.alias ?? [])].some((a) => a.toLowerCase() === n.toLowerCase())) return k;
  return null;
}

/** Club citati nel titolo (parola intera, rispettando le maiuscole). L'Italia solo se non c'è altro. */
function clubsInTitle(title) {
  const found = [];
  for (const [k, v] of Object.entries(CLUBS)) {
    if (k === 'Italia') continue;
    const names = [k, ...(v.alias ?? [])];
    if (names.some((a) => new RegExp(`(^|[^\\p{L}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(title))) found.push(k);
  }
  if (!found.length && CLUBS.Italia && ['Italia', ...(CLUBS.Italia.alias ?? [])].some((a) => new RegExp(`(^|[^\\p{L}])${a}($|[^\\p{L}])`, 'u').test(title))) found.push('Italia');
  return found;
}

/** Coppa: solo se il TITOLO o il sommario parlano davvero di Europei/Mondiali (i tag competizione sono troppo larghi:
 *  includono ogni convocazione Under 21). "difensori europei" in minuscolo plurale non conta. */
function trophyKind({ title, excerpt, category }) {
  const text = category === 'mercato' ? title : `${title} ${excerpt}`;
  const art = "(?<![\\p{L}])(?:all[’']|nell[’']|dell[’']|sull[’']|l[’']|agli |degli |negli |ai |dei |nei |gli |il |i )";
  const mond = new RegExp(`(^|[^\\p{L}])Mondial[ei]($|[^\\p{L}])|${art}mondial[ei]($|[^\\p{L}])|World Cup|Coppa del Mondo`, 'u').test(text);
  const euro = new RegExp(`(^|[^\\p{L}])Europe[oi]($|[^\\p{L}])|${art}europe[oi]($|[^\\p{L}])|Campion[ei] d[’']Europa`, 'u').test(text);
  if (mond && euro) return /Mondial/.test(title) ? 'mondiali' : 'europei';
  if (mond) return 'mondiali';
  if (euro) return 'europei';
  return null;
}

function decideArt(a) {
  if (a.category === 'taccuino') return { type: 'lavagna', formation: pickSeeded(formationNames, a.slug) };
  const tk = trophyKind(a);
  if (tk) return { type: 'coppa', kind: tk };
  const inTitle = clubsInTitle(a.title);
  const playerClubs = [...new Set(a.players.map((p) => baseClub(CLUB_OF.get(p))).filter(Boolean))];
  if (a.category === 'mercato') {
    const c = inTitle.filter((k) => k !== 'Italia')[0] ? pickSeeded(inTitle.filter((k) => k !== 'Italia'), a.slug) : playerClubs[0];
    return c ? { type: 'stadio', club: c } : null;
  }
  if (a.players.length === 1) {
    const c = playerClubs[0] ?? inTitle[0];
    return c && c !== 'Italia' ? { type: 'ibrida', club: c } : (c ? { type: 'maglia', club: c } : null);
  }
  // Più giocatori: vince il club della MAGGIORANZA dei giocatori (es. 2 del Milan + 1 in prestito al Catanzaro → Milan).
  // A parità, si preferiscono i club citati nel titolo; poi si sceglie in modo fisso per articolo.
  const counts = new Map();
  for (const pl of a.players) { const c = baseClub(CLUB_OF.get(pl)); if (c) counts.set(c, (counts.get(c) ?? 0) + 1); }
  if (counts.size) {
    const max = Math.max(...counts.values());
    const top = [...counts].filter(([, n]) => n === max).map(([k]) => k);
    const inT = top.filter((k) => inTitle.includes(k));
    return { type: 'maglia', club: pickSeeded(inT.length ? inT : top, a.slug) };
  }
  const pool = [...new Set(inTitle)];
  return pool.length ? { type: 'maglia', club: pickSeeded(pool, a.slug) } : null;
}

function svgArt({ title, category }, art) {
  const club = CLUBS[art.club] ?? CLUBS.Italia;
  let lines = wrap(title, 27, 4), fs = 54, lh = 70;
  if (lines.length > 3) { lines = wrap(title, 34, 4); fs = 44; lh = 56; }   // titoli lunghi: carattere più piccolo, resta spazio per l'illustrazione
  const t = lines.map((l, i) => `<text x="80" y="${390 + i * lh}" font-family="DejaVu Sans, sans-serif" font-size="${fs}" font-weight="bold" fill="#eef5fc">${esc(l)}</text>`).join('');
  const stadiumLabel = club.stadium ? `<text x="540" y="1012" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="26" fill="#fff" opacity=".85" letter-spacing="3">${esc(club.stadium.toUpperCase())}</text>` : '';
  let tint = club.c1, body = '';
  if (art.type === 'stadio') body = stadiumSvg(club, { y: 690, h: 340 }) + stadiumLabel;
  else if (art.type === 'ibrida') body = stadiumSvg(club, { y: 710, h: 320 }) + figureSvg(club, { scale: 0.76, x: 500, y: 590, pose: 'kick' });
  else if (art.type === 'maglia') body = `<circle cx="760" cy="800" r="250" fill="#fff" opacity=".08"/>` + jerseySvg(club, { scale: 1.1, x: 520, y: 600, rot: 8 });
  else if (art.type === 'lavagna') { tint = '#1f7a4a'; body = tacticsBoardSvg(art.formation, { x: 90, y: 600, w: 900, h: 400 }); }
  else if (art.type === 'coppa') {
    tint = art.kind === 'mondiali' ? '#d9a21f' : '#9fb4cc';
    body = `<circle cx="790" cy="810" r="230" fill="${tint}" opacity=".16"/>` + trophySvg(art.kind, { scale: 0.88, x: 650, y: 600 });
  }
  return `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d2c50"/><stop offset=".6" stop-color="#12437a"/><stop offset="1" stop-color="#1a5da5"/></linearGradient></defs>
<rect width="1080" height="1080" fill="url(#bg)"/><rect width="1080" height="1080" fill="${tint}" opacity=".18"/>
<g transform="translate(80,100)"><rect width="26" height="56" fill="#009246"/><rect x="26" width="26" height="56" fill="#f4f6fa"/><rect x="52" width="26" height="56" fill="#ce2b37"/><text x="100" y="42" font-family="DejaVu Sans, sans-serif" font-size="42" font-weight="bold" fill="#eef5fc">ITALIAN <tspan fill="#f0c94a">NEXT GEN</tspan></text></g>
<rect x="80" y="228" width="${(CAT[category]?.length ?? 4) * 24 + 50}" height="60" rx="6" fill="#f0c94a"/><text x="105" y="270" font-family="DejaVu Sans, sans-serif" font-size="32" font-weight="bold" fill="#0b2440">${CAT[category] ?? 'NEWS'}</text>
${category === 'taccuino' ? '' : t}${category === 'taccuino' ? `<text x="80" y="420" font-family="DejaVu Sans, sans-serif" font-size="64" font-weight="bold" fill="#eef5fc">${esc(lines.join(' ').replace(/^Taccuino del giorno · /, ''))}</text><text x="80" y="490" font-family="DejaVu Sans, sans-serif" font-size="34" fill="#9fc2e0">Le notizie minori della giornata, in breve</text>` : ''}${body}</svg>`;
}

// --rigenera=ORE : rifà le card degli articoli pubblicati nelle ultime ORE ore e non ancora postati su Instagram
const regenArg = process.argv.find((a) => a.startsWith('--rigenera='));
const REGEN_HOURS = regenArg ? Number(regenArg.split('=')[1]) : 0;
let igPosted = {};
try { igPosted = JSON.parse(await readFile(path.join(ROOT, 'data', 'instagram-state.json'), 'utf8')).posted ?? {}; } catch {}

const files = (await readdir(NEWS)).filter((f) => f.endsWith('.md'));
await mkdir(OUT, { recursive: true });
let made = 0, skipped = 0;

for (const f of files) {
  const slug = f.replace(/\.md$/, '');
  const dest = path.join(OUT, `${slug}.jpg`);
  const t = await readFile(path.join(NEWS, f), 'utf8');
  const pubRaw = t.match(/^publishedAt:\s*(\S+)/m)?.[1];
  const recent = REGEN_HOURS > 0 && pubRaw && (Date.now() - new Date(pubRaw)) / 36e5 <= REGEN_HOURS && !igPosted[slug];
  let exists = true; try { await access(dest); } catch { exists = false; }
  if (exists && !recent) { skipped++; continue; }

  const fm = t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  let title = (fm.match(/^title:\s*"(.*)"/m)?.[1] ?? slug).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  // Togli il nome della testata in coda ("... - Gazzetta", "... | MSN")
  title = title.replace(/\s*[-–|]\s*[A-Z][\w.' ]{2,25}$/, '').trim();
  const category = fm.match(/^category:\s*["']?(\w+)/m)?.[1] ?? 'news';
  const players = [...(fm.match(/^players:\s*\[(.*)\]/m)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  const excerpt = fm.match(/^excerpt:\s*"(.*)"/m)?.[1] ?? '';
  const competitions = [...(fm.match(/^competitions:\s*\[(.*)\]/m)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const art = decideArt({ slug, title, excerpt, category, players, competitions });
  const svg = art ? svgArt({ title, category }, art) : svgClassic({ title, category, players });
  if (process.env.SOCIAL_DEBUG) console.log(`${art ? art.type + (art.club ? ':' + art.club : '') : 'classica'}  ←  ${title.slice(0, 70)}`);
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(dest);
  made++;
}

console.log(`🖼  Immagini social: create ${made}, già esistenti ${skipped} (in public/social/).`);
