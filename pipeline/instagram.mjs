// PUBBLICAZIONE SU INSTAGRAM (API Instagram con Instagram Login)
//
// Uso:  node pipeline/instagram.mjs --mode=anteprima   → mostra cosa uscirebbe (non pubblica)
//       node pipeline/instagram.mjs --mode=pubblica    → pubblica subito gli articoli selezionati
//       node pipeline/instagram.mjs --mode=auto        → come pubblica, ma rispetta fascia oraria e distanza minima
//       opzioni: --max=N (massimo post in questa esecuzione)
//
// Il testo del post è il testo dell'articolo (versione italiana). Immagine = card in /social/<slug>.jpg.
// Regole in data/instagram.json. Stato in pipeline/state/instagram.json.
// Segreti (GitHub → Settings → Secrets): IG_USER_ID, IG_ACCESS_TOKEN.

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'src', 'content', 'news');
const STATE_FILE = path.join(ROOT, 'data', 'instagram-state.json');
const CFG_FILE = path.join(ROOT, 'data', 'instagram.json');

const SITE = (process.env.SITE_BASE || 'https://italiannextgen.it').replace(/\/$/, '');
const API = (process.env.IG_API_BASE || 'https://graph.instagram.com').replace(/\/$/, '');
const API_VER = process.env.IG_API_VERSION || 'v23.0';
const CAPTION_MAX = 2150; // il limite Instagram è 2200: teniamo margine

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const MODE = arg('mode', 'anteprima'); // anteprima | pubblica | auto
const MAX_RUN = Number(arg('max', 0)) || Infinity;

const cfg = JSON.parse(await readFile(CFG_FILE, 'utf8'));
let state = { posted: {}, failures: {}, lastPostAt: null };
try { state = { ...state, ...JSON.parse(await readFile(STATE_FILE, 'utf8')) }; } catch {}
const saveState = async () => {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
};

const romeDay = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d);
const romeHour = (d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(d)) % 24;

// ---------- lettura articoli ----------
function parseArticle(slug, raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const [, fm, body] = m;
  const str = (k) => {
    const v = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim();
    if (!v) return undefined;
    if (v.startsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
    return v.replace(/^'|'$/g, '');
  };
  const players = (() => { try { return JSON.parse(fm.match(/^players:\s*(\[.*\])/m)?.[1] ?? '[]'); } catch { return []; } })();
  const pub = str('publishedAt');
  return {
    slug, title: str('title') ?? slug, category: str('category') ?? 'news', source: str('source'),
    publishedAt: pub ? new Date(pub) : null, players,
    sourceDate: str('sourceDate') ? new Date(str('sourceDate')) : null,
    html: str('html') === 'true', social: str('social') !== 'false',
    bodyIt: body.split('<!--EN-->')[0].trim(),
  };
}

// ---------- testo del post ----------
function plainText(a) {
  let t = a.bodyIt;
  if (a.html) {
    t = t.replace(/<\/(p|div|h\d|li|tr)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  return t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')              // immagini markdown
    .replace(/\s*\[fonte\]\([^)]*\)/gi, '')               // "[fonte](url)" del Taccuino: in caption non è cliccabile
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')  // altri link → solo testo
    .replace(/^#{1,6}\s*/gm, '').replace(/\*\*|__/g, '').replace(/(?<![\w*])\*(?!\s)([^*\n]+)\*(?!\w)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildCaption(a) {
  const tail = [
    a.source && !/^taccuino/i.test(a.source) ? `Fonte: ${a.source}` : null,
    cfg.footer,
    cfg.hashtags.join(' '),
  ].filter(Boolean).join('\n\n');
  const head = `${a.title.replace(/\s*[-–|]\s*[A-Z][\w.' ]{2,25}$/, '').trim()}\n\n`;
  const room = CAPTION_MAX - head.length - tail.length - 2;
  let body = plainText(a);
  if (body.length > room) {
    const cut = body.slice(0, room);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    body = (end > room * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
  }
  return `${head}${body}\n\n${tail}`;
}

// ---------- selezione ----------
async function loadCandidates(now) {
  const files = (await readdir(NEWS)).filter((f) => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    const a = parseArticle(f.replace(/\.md$/, ''), await readFile(path.join(NEWS, f), 'utf8'));
    if (!a || !a.publishedAt || a.publishedAt > now) continue;                       // non ancora visibile / storico senza orario
    if ((now - a.publishedAt) / 36e5 > cfg.maxAgeHours) continue;                    // troppo vecchio: niente post stantii
    // Freschezza vera: conta quando la fonte ha dato la notizia, non quando l'abbiamo messa online.
    a.fresh = a.sourceDate && !isNaN(a.sourceDate) ? a.sourceDate : a.publishedAt;
    if (!cfg.alwaysPostCategories.includes(a.category) && (now - a.fresh) / 36e5 > (cfg.maxSourceAgeHours ?? 24)) continue;
    if (!a.social || state.posted[a.slug] || (state.failures[a.slug] ?? 0) >= 3) continue;
    out.push(a);
  }
  return out;
}

function select(cands, now) {
  const today = romeDay(now);
  const postedToday = Object.values(state.posted).filter((p) => romeDay(new Date(p.at)) === today);
  const playersToday = new Set(postedToday.flatMap((p) => p.players ?? []));
  const normalDone = postedToday.filter((p) => !cfg.alwaysPostCategories.includes(p.category)).length;
  let normalLeft = Math.max(0, cfg.maxPerDay - normalDone);

  const always = cands.filter((a) => cfg.alwaysPostCategories.includes(a.category)).sort((x, y) => x.publishedAt - y.publishedAt);
  const prio = (c) => { const i = cfg.categoryPriority.indexOf(c); return i < 0 ? 99 : i; };
  const normal = cands.filter((a) => !cfg.alwaysPostCategories.includes(a.category))
    .sort((x, y) => prio(x.category) - prio(y.category) || y.fresh - x.fresh);

  const picked = [...always];
  for (const a of normal) {
    if (normalLeft <= 0) break;
    if (a.players.some((p) => playersToday.has(p))) continue;                         // un giocatore al giorno
    picked.push(a); a.players.forEach((p) => playersToday.add(p)); normalLeft--;
  }
  return picked;
}

// ---------- Instagram ----------
async function ig(method, url, params) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${process.env.IG_ACCESS_TOKEN}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Instagram ${res.status}: ${j.error?.message ?? JSON.stringify(j)}`);
  return j;
}

async function imageLive(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok && /jpe?g/i.test(r.headers.get('content-type') ?? '')) return true; } catch {}
    await new Promise((r) => setTimeout(r, 15000));
  }
  return false;
}

async function publish(a, caption) {
  const imageUrl = `${SITE}/social/${a.slug}.jpg`;
  if (!(await imageLive(imageUrl))) throw new Error(`immagine non ancora online: ${imageUrl}`);
  const base = `${API}/${API_VER}/${process.env.IG_USER_ID}`;
  const c = await ig('POST', `${base}/media`, { image_url: imageUrl, caption });
  for (let i = 0; i < 5; i++) {
    const s = await ig('GET', `${API}/${API_VER}/${c.id}?fields=status_code`);
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`container ${s.status_code}`);
    await new Promise((r) => setTimeout(r, 20000));
  }
  return (await ig('POST', `${base}/media_publish`, { creation_id: c.id })).id;
}

// ---------- main ----------
const now = new Date();
const picked = select(await loadCandidates(now), now);

console.log(`📸 Instagram — modalità: ${MODE} · ${picked.length} articoli selezionati\n`);
if (!picked.length) { console.log('Niente da pubblicare ora.'); process.exit(0); }

if (MODE === 'anteprima') {
  for (const a of picked) {
    const cap = buildCaption(a);
    console.log(`━━ [${a.category}] ${a.slug}\n   immagine: ${SITE}/social/${a.slug}.jpg  · caption: ${cap.length}/2200 caratteri\n${cap}\n`);
  }
  process.exit(0);
}

if (!process.env.IG_USER_ID || !process.env.IG_ACCESS_TOKEN) {
  console.error('❌ Mancano i segreti IG_USER_ID / IG_ACCESS_TOKEN (GitHub → Settings → Secrets and variables → Actions).');
  process.exit(1);
}

if (MODE === 'auto') {
  const h = romeHour(now);
  if (h < cfg.windowStartHour || h >= cfg.windowEndHour) { console.log('Fuori fascia oraria: nessun post.'); process.exit(0); }
}

let done = 0;
for (const a of picked) {
  if (done >= MAX_RUN) break;
  const always = cfg.alwaysPostCategories.includes(a.category);
  if (MODE === 'auto' && !always && state.lastPostAt && (now - new Date(state.lastPostAt)) / 6e4 < cfg.minSpacingMinutes) {
    console.log(`Distanza minima non ancora trascorsa: salto ${a.slug}`); continue;
  }
  try {
    const id = await publish(a, buildCaption(a));
    const at = new Date().toISOString();
    state.posted[a.slug] = { id, at, category: a.category, players: a.players };
    if (!always) state.lastPostAt = at;
    await saveState();
    console.log(`✅ pubblicato ${a.slug} → ${id}`);
    done++;
    if (MODE === 'auto' && !always) break; // in automatico: al massimo un post "normale" per esecuzione
  } catch (e) {
    state.failures[a.slug] = (state.failures[a.slug] ?? 0) + 1;
    await saveState();
    console.error(`⚠️ ${a.slug}: ${e.message}`);
    if (/Instagram (400|401|403)/.test(e.message)) { console.error('Errore di autenticazione/permessi: mi fermo.'); process.exitCode = 1; break; }
  }
}
