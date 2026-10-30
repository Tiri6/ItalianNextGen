// PUBBLICAZIONE AUTOMATICA
// Uso: npm run publish                 (pubblica fino a 100 bozze DI QUALITÀ)
//      npm run publish -- --max=50
//      npm run publish -- --all        (include anche le bozze dal solo titolo — sconsigliato)
//
// Pubblica in automatico le candidate che hanno una bozza scritta DALLA FONTE
// (filtro qualità: niente articoli basati sul solo titolo, salvo --all).
// Gli articoli senza testo non vengono MAI pubblicati.
//
// COCKPIT EDITORIALE (app di Marco):
//   --proposta   non pubblica nulla: scrive data/review-queue.json con le candidate nell'ordine proposto
//                (con avvisi tipo "possibile doppione") e le scelte suggerite per sito e Instagram.
//   Se esiste data/editorial-decisions.json con "date" = oggi e "enabled" ≠ false, la pubblicazione è
//   "GATE": esce SOLO ciò che Marco ha messo live:true, nell'ordine scelto, senza i filtri "morbidi"
//   (doppioni, un articolo al giorno per giocatore, pre-partita). I filtri "duri" restano
//   (testo vero, fonti bloccate, altri sport, calcio femminile, notizia più vecchia di 2 giorni).
//   Senza decisioni di oggi tutto funziona come prima (automatico).

import { readFile, writeFile, readdir, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceClass } from './sources.mjs';
import { editorialReject } from './agents/validator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = path.join(ROOT, 'pipeline', 'candidates');
const APPROVED = path.join(ROOT, 'pipeline', 'approved');
const NEWS = path.join(ROOT, 'src', 'content', 'news');

const maxArg = process.argv.find((a) => a.startsWith('--max='));
const MAX = Math.max(1, Number(maxArg?.split('=')[1]) || 100);
const ALL = process.argv.includes('--all');
const PROPOSTA = process.argv.includes('--proposta');

// --- FRESCHEZZA: si pubblicano solo notizie uscite OGGI o IERI (ora italiana) ---
// Uso: npm run publish -- --giorni=2   per allargare la finestra (default 1 = oggi+ieri)
const giorniArg = process.argv.find((a) => a.startsWith('--giorni='));
const MAX_AGE_DAYS = Math.max(0, Number(giorniArg?.split('=')[1] ?? 1));
const romeDay = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d); // YYYY-MM-DD
const OLDEST_OK = romeDay(new Date(Date.now() - MAX_AGE_DAYS * 86400000));
// Data della notizia alla fonte (giorno italiano). Il taccuino nasce oggi: sempre fresco.
function newsDay(c) {
  if (c.isDigest) return romeDay(new Date());
  const raw = c.pubDate || c.isoDate || c.date;
  const d = raw ? new Date(raw) : null;
  return d && !isNaN(d) ? romeDay(d) : null;
}
const isFresh = (c) => { const g = newsDay(c); return !!g && g >= OLDEST_OK; };

// NOTIZIE PRE-PARTITA (convocati del club, probabili formazioni, vigilia…): valgono solo
// fino al fischio d'inizio. Si pubblicano SOLO se uscite alla fonte OGGI; quelle di ieri
// riguardano una partita ormai giocata. (Le convocazioni in NAZIONALE restano valide.)
const PREMATCH_RE = /\b(i|tra i|nei|lista dei) convocati\b|convocati (di|del|della|per|contro)\b|probabil[ie] formazion|formazion[ei] ufficial|\bvigilia\b|pre-?partita|prepartita|\bdomani\b|\bstasera\b|in vista (di|del|della|dello)\b|tornano disponibili|recuperat[oi] per\b|squad (list|news)|line-?ups?\b|\bahead of\b|\bclash\b/i;
const todayRome = romeDay(new Date());

// --- Decisioni di Marco (data/editorial-decisions.json) ---
const DECISIONS_FILE = path.join(ROOT, 'data', 'editorial-decisions.json');
let decisions = null;
try {
  const d = JSON.parse(await readFile(DECISIONS_FILE, 'utf8'));
  if (d && d.enabled !== false && d.date === todayRome && d.items && typeof d.items === 'object') decisions = d;
} catch {}
const GATE = !!decisions && !PROPOSTA;
const decisionOf = (c) => decisions?.items?.[c.id];
function isStalePrematch(c) {
  if (c.isDigest) return false;
  const d = c.draft ?? {};
  const text = [c.title, d.title, d.excerpt, d.titleEn, d.excerptEn].filter(Boolean).join(' ');
  if (!PREMATCH_RE.test(text)) return false;
  if (/(?<![\d:])\d{1,2}\s*[-–]\s*\d{1,2}(?![\d:])/.test(c.title)) return false; // il titolo ha un punteggio: è un resoconto, non una pre-partita
  if (/\bnazional|\bitalia\b|\bunder ?\d{2}\b|\bu\d{2}\b/i.test(c.title) && /convoca/i.test(c.title)) return false; // chiamata in nazionale
  const g = newsDay(c);
  return !g || g < todayRome;
}

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function y(s) { return `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }

// --- Anti-duplicati: confronta le "parole significative" di titolo+sommario ---
const STOP = new Set(['il','lo','la','i','gli','le','un','uno','una','di','a','da','in','con','su','per','tra','fra','del','della','dei','delle','dello','al','alla','ai','alle','allo','e','ed','che','non','si','ha','hanno','più','dopo','ecco','cosa','come','anche','ma','nel','nella','sul','sulla','the','of','and','to','for','an','is','are']);
function sigWords(s) {
  return new Set(
    String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}
function overlap(a, b) {
  const inter = [...a].filter((w) => b.has(w)).length;
  return inter / (Math.min(a.size, b.size) || 1);
}
const SIM_THRESHOLD = 0.62; // sopra questa soglia = notizia praticamente uguale

// Analisi degli articoli PUBBLICATI di recente:
//  - recentPrints: impronte testuali ultimi 4 giorni (anti-ripubblicazione)
//  - usedToday: giocatori di cui si è già parlato OGGI (max 1 articolo/giorno per giocatore)
//  - weekCount: quante volte ogni giocatore è apparso negli ultimi 7 giorni (per la rotazione)
const recentPrints = [];
const usedToday = new Set();
const weekCount = {};
const today = new Date().toISOString().slice(0, 10);
const publishedUrls = new Set(); // link alla fonte già usati da un articolo pubblicato
try {
  const now = Date.now();
  for (const nf of (await readdir(NEWS)).filter((x) => x.endsWith('.md'))) {
    const t = await readFile(path.join(NEWS, nf), 'utf8');
    const fm = t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const dstr = fm.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1];
    const ageDays = dstr ? (now - new Date(dstr)) / 86400000 : 999;
    const title = fm.match(/^title:\s*"(.*)"/m)?.[1] ?? '';
    const exc = fm.match(/^excerpt:\s*"(.*)"/m)?.[1] ?? '';
    const cat = fm.match(/^category:\s*["']?(\w+)/m)?.[1] ?? 'news';
    const su = fm.match(/^sourceUrl:\s*"(.*)"/m)?.[1];
    if (su) publishedUrls.add(su);
    const pls = [...(fm.match(/^players:\s*\[(.*)\]/m)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (ageDays <= 4) recentPrints.push({ w: sigWords(title + ' ' + exc), cat, players: new Set(pls) });
    if (cat !== 'taccuino' && ageDays <= 7) for (const p of pls) weekCount[p] = (weekCount[p] ?? 0) + 1;
    if (cat !== 'taccuino' && dstr === today) for (const p of pls) usedToday.add(p);
  }
} catch {}

// "Peso rotazione" di una candidata = quanto sono già coperti i suoi giocatori nella settimana.
// Più basso = giocatori poco raccontati di recente → priorità in pubblicazione.
function rotationWeight(c) {
  const pls = c.players ?? [];
  if (!pls.length) return 3; // notizie generiche: priorità media
  return Math.min(...pls.map((p) => weekCount[p] ?? 0));
}

let files = [];
try { files = (await readdir(CANDIDATES)).filter((f) => f.endsWith('.json')); } catch {}

const queue = [];
for (const f of files) {
  try { queue.push({ f, c: JSON.parse(await readFile(path.join(CANDIDATES, f), 'utf8')) }); } catch {}
}

// Le candidate più vecchie di ieri escono dalla coda (in pipeline/rejected/, recuperabili dalla storia git)
const REJECTED = path.join(ROOT, 'pipeline', 'rejected');
let expired = 0;
await mkdir(REJECTED, { recursive: true });
for (const { f, c } of queue) {
  if (!isFresh(c) && newsDay(c)) {
    if (!PROPOSTA) await rename(path.join(CANDIDATES, f), path.join(REJECTED, f));
    expired++;
  }
}
if (expired) console.log(`  ⌛ ${expired} candidate più vecchie di ${MAX_AGE_DAYS ? 'ieri' : 'oggi'} tolte dalla coda`);

let eligible = queue
  .filter(({ c }) => {
    if (!isFresh(c)) return false; // solo notizie di oggi o di ieri
    // Data dichiarata dalla pagina della fonte: se più vecchia di 2 giorni, è una notizia riciclata
    // (es. partita di due settimane fa ripubblicata dal feed). Se la data non si legge, decide il filtro sopra.
    // ATTENZIONE: alcuni siti (es. TUTTOmercatoWEB) dichiarano nella pagina una data fissa del 2005: se la data della
    // pagina è più vecchia di 90 giorni rispetto alla data del feed NON è affidabile e decide solo il filtro oggi/ieri.
    const pageMs = c.draft?._sourceDate ? Date.parse(c.draft._sourceDate) : NaN;
    const feedMs = Date.parse(c.pubDate);
    const pageDateReliable = !Number.isNaN(pageMs) && !(Number.isFinite(feedMs) && feedMs - pageMs > 90 * 86400000);
    if (!c.isDigest && pageDateReliable) {
      const ageDays = (Date.now() - pageMs) / 86400000;
      if (ageDays > 2) { console.log(`  ⤫ fonte di ${Math.round(ageDays)} giorni fa: ${String(c.title).slice(0, 60)}`); return false; }
    }
    if (isStalePrematch(c)) { console.log(`  ⤫ pre-partita di ieri (partita già giocata): ${String(c.title).slice(0, 60)}`); return false; }
    const d = c.draft;
    if (!d || !d.bodyIt || d.bodyIt.trim().length < 40) return false; // mai senza testo
    // Regole fonti (data/sources.json): bloccate = mai; 'confirm' = niente voci di mercato in automatico
    const cls = c.isDigest ? 'approved' : sourceClass(c.source);
    if (cls === 'blocked') return false;
    if (cls === 'confirm' && c.category === 'mercato') return false;
    // Regole editoriali (solo calcio maschile, niente club spacciati per nazionale…)
    if (!c.isDigest) {
      const why = editorialReject(c.title, (c.players ?? []).length > 0);
      if (why) { console.log(`  ⤫ fuori linea (${why}): ${String(c.title).slice(0, 60)}`); return false; }
    }
    return ALL || d._fromSource || c.isDigest;
  })
  // Ordina per ROTAZIONE (giocatori meno coperti nella settimana prima),
  // poi per punteggio di rilevanza. Così a rotazione tutti i talenti appaiono.
  .sort((a, b) => rotationWeight(a.c) - rotationWeight(b.c) || b.c.score - a.c.score);

if (GATE) {
  // Candidate che Marco ha scartato esplicitamente: fuori dalla coda (recuperabili dalla storia git)
  await mkdir(REJECTED, { recursive: true });
  let scartate = 0;
  for (const { f, c } of queue) {
    if (decisionOf(c)?.live === false) { await rename(path.join(CANDIDATES, f), path.join(REJECTED, f)); scartate++; }
  }
  if (scartate) console.log(`  🗑  ${scartate} candidate scartate da Marco: spostate in pipeline/rejected/`);
  const ord = new Map((decisions.order ?? []).map((id, i) => [id, i]));
  eligible = eligible
    .filter(({ c }) => decisionOf(c)?.live === true)
    .sort((a, b) => (ord.get(a.c.id) ?? 1e6) - (ord.get(b.c.id) ?? 1e6));
  const dimenticate = Object.entries(decisions.items).filter(([id, v]) => v.live === true && !eligible.some(({ c }) => c.id === id));
  for (const [id] of dimenticate) console.log(`  ⚠️ approvata ma non più pubblicabile (filtri duri o già uscita): ${id}`);
  console.log(`🎛  Modalità decisioni di Marco: ${eligible.length} articoli approvati, ordine scelto da lui.`);
} else if (!PROPOSTA) {
  eligible = eligible.slice(0, MAX);
}

if (!eligible.length && !PROPOSTA) {
  console.log(`Nessuna bozza pubblicabile in coda (solo notizie dal ${OLDEST_OK} in poi).`);
  console.log('Flusso: npm run collect → npm run write → npm run publish');
  console.log('(il filtro qualità pubblica solo bozze scritte dalla fonte; --all per forzare)');
  process.exit(0);
}

await mkdir(NEWS, { recursive: true });
await mkdir(APPROVED, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
let done = 0, skippedDup = 0, skippedSameDay = 0;

// Impronte pubblicate in QUESTO giro (evita due doppioni di fila nello stesso batch)
const publishedNow = [];

// Per --proposta: elenco delle candidate (con avvisi) e, in GATE, ordine degli slug pubblicati
const proposalItems = [];
const publishedSlugs = [];
const preview = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 420);
function makeItem(c, f, proposedLive, flags) {
  const d = c.draft ?? {};
  return {
    id: c.id, file: f,
    title: (d.title && d.title.trim().length > 5) ? d.title.trim() : c.title,
    excerpt: d.excerpt ?? '',
    category: c.category || 'news',
    source: c.source || '', link: c.link || '',
    players: c.players ?? [],
    sourceDate: c.pubDate && !isNaN(new Date(c.pubDate)) ? new Date(c.pubDate).toISOString() : null,
    isDigest: !!c.isDigest,
    score: c.score ?? 0,
    rotation: rotationWeight(c),
    bodyPreview: preview(d.bodyIt),
    proposed: { live: proposedLive },
    flags,
  };
}

for (const { f, c } of eligible) {
  const d = c.draft;
  // Titolo pulito scritto dal redattore; il titolo grezzo della fonte è solo un ripiego
  const cleanTitle = (d.title && d.title.trim().length > 5) ? d.title.trim() : c.title;

  // --- REGOLA 0: stesso link alla fonte già pubblicato = doppione certo ---
  if (c.link && publishedUrls.has(c.link)) {
    if (!PROPOSTA) await rename(path.join(CANDIDATES, f), path.join(APPROVED, f));
    skippedDup++;
    console.log(`  ⤫ fonte già pubblicata: ${cleanTitle.slice(0, 55)}`);
    continue;
  }

  if (c.category !== 'taccuino' && !GATE) {
    const w = sigWords(cleanTitle + ' ' + (d.excerpt ?? ''));
    const pls = c.players ?? [];
    const plsSet = new Set(pls);

    // --- REGOLA 1: max un articolo al giorno per giocatore ---
    // La candidata esce solo se ha ALMENO un giocatore di cui non si è ancora
    // parlato oggi. Se tutti i suoi giocatori sono già "usati", si salta:
    // così due pezzi sullo stesso rinnovo Camarda-Comotto non escono di fila.
    if (pls.length > 0 && pls.every((p) => usedToday.has(p))) {
      if (PROPOSTA) {
        // Spiega DOVE: o c'è un articolo già pubblicato oggi, o un'altra candidata di questa lista ha già preso il giocatore
        const altra = proposalItems.find((it) => it.proposed.live && it.players.some((p) => pls.includes(p)));
        const label = altra
          ? `Stesso giocatore (${pls.join(', ')}) di un'altra notizia in questa lista: «${altra.title.slice(0, 70)}». Ne esce una sola al giorno.`
          : `Di ${pls.join(', ')} è già uscito un articolo sul sito oggi. Ne esce uno solo al giorno.`;
        proposalItems.push(makeItem(c, f, false, [{ type: 'stesso-giocatore', label }])); continue;
      }
      await rename(path.join(CANDIDATES, f), path.join(APPROVED, f));
      skippedSameDay++;
      console.log(`  ⤫ già trattato oggi: ${cleanTitle.slice(0, 55)} [${pls.join(', ')}]`);
      continue;
    }

    // --- REGOLA 2: salta se quasi identica a una già uscita o appena pubblicata ---
    const samePlayer = (o) => [...plsSet].some((p) => o.players.has(p));
    const isDup = [...recentPrints, ...publishedNow].some(
      (o) => o.cat !== 'taccuino' && overlap(w, o.w) >= SIM_THRESHOLD && (o.cat === c.category || samePlayer(o) || plsSet.size === 0)
    );
    if (isDup) {
      if (PROPOSTA) { proposalItems.push(makeItem(c, f, false, [{ type: 'doppione', label: 'Notizia molto simile a una già uscita o già in lista' }])); continue; }
      await rename(path.join(CANDIDATES, f), path.join(APPROVED, f));
      skippedDup++;
      console.log(`  ⤫ doppione saltato: ${cleanTitle.slice(0, 60)}`);
      continue;
    }

    // Pubblicata: segna i suoi giocatori come già trattati oggi
    pls.forEach((p) => usedToday.add(p));
    publishedNow.push({ w, cat: c.category, players: plsSet });
  }

  if (PROPOSTA) { proposalItems.push(makeItem(c, f, true, [])); continue; }

  const slug = slugify(cleanTitle);
  // GATE: la scelta di Marco per Instagram viaggia nel frontmatter (social:false = escluso, socialPick = scelto da lui)
  const igPick = GATE ? decisionOf(c)?.instagram === true : false;
  const igOff = GATE && !igPick;
  const md = `---
title: ${y(cleanTitle)}
titleEn: ${y(d.titleEn || cleanTitle)}
excerpt: ${y(d.excerpt)}
excerptEn: ${y(d.excerptEn || d.excerpt)}
date: ${date}
category: ${c.category || 'news'}
players: [${(c.players ?? []).map(y).join(', ')}]
competitions: [${(c.competitions ?? []).map(y).join(', ')}]
source: ${y(c.source || '')}
sourceUrl: ${y(c.link || '')}
${c.pubDate && !isNaN(new Date(c.pubDate)) ? `sourceDate: "${new Date(c.pubDate).toISOString()}"\n` : ''}${igOff ? 'social: false\n' : ''}${igPick ? 'socialPick: true\n' : ''}---

${d.bodyIt.trim()}

<!--EN-->

${(d.bodyEn || d.bodyIt).trim()}
`;
  await writeFile(path.join(NEWS, `${slug}.md`), md);
  if (c.link) publishedUrls.add(c.link);
  await rename(path.join(CANDIDATES, f), path.join(APPROVED, f));
  publishedSlugs.push(slug);
  done++;
}

// GATE: lo scheduler deve rispettare l'ordine scelto da Marco (file temporaneo, vive solo dentro il job)
if (GATE && publishedSlugs.length) {
  const STATE = path.join(ROOT, 'pipeline', 'state');
  await mkdir(STATE, { recursive: true });
  await writeFile(path.join(STATE, 'publish-order.json'), JSON.stringify({ date: todayRome, slugs: publishedSlugs }, null, 2) + '\n');
}

// --proposta: scrive la coda di revisione per l'app (ordine come lo schedulerebbe il sito)
if (PROPOSTA) {
  const catRank = (c) => { const i = ['performance', 'news', 'mercato'].indexOf(c); return i < 0 ? 3 : i; };
  proposalItems.sort((a, b) =>
    (b.isDigest - a.isDigest) || (a.category === 'taccuino' ? -1 : 0) - (b.category === 'taccuino' ? -1 : 0)
    || catRank(a.category) - catRank(b.category) || a.rotation - b.rotation || b.score - a.score);
  // Instagram suggerito: Taccuino sempre; poi per priorità, un giocatore per post, entro il tetto giornaliero
  let igCfg = {}; try { igCfg = JSON.parse(await readFile(path.join(ROOT, 'data', 'instagram.json'), 'utf8')); } catch {}
  let normalLeft = Math.max(0, (igCfg.maxPerDay ?? 5) - 1);
  const igPlayers = new Set();
  for (const it of proposalItems) {
    if (!it.proposed.live) { it.proposed.instagram = false; continue; }
    if (it.category === 'taccuino' || it.isDigest) { it.proposed.instagram = true; continue; }
    const free = normalLeft > 0 && it.category !== 'mercato' && !it.players.some((p) => igPlayers.has(p));
    it.proposed.instagram = free;
    if (free) { normalLeft--; it.players.forEach((p) => igPlayers.add(p)); }
  }
  const out = { generatedAt: new Date().toISOString(), day: todayRome, items: proposalItems.map(({ rotation, score, ...rest }) => rest) };
  await writeFile(path.join(ROOT, 'data', 'review-queue.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`🗂  Coda di revisione: ${out.items.length} candidate (${out.items.filter((i) => i.proposed.live).length} proposte live) → data/review-queue.json`);
  process.exit(0);
}

const extra = [skippedDup ? `${skippedDup} doppioni` : '', skippedSameDay ? `${skippedSameDay} già trattati oggi` : ''].filter(Boolean).join(' · ');
console.log(`✅ Pubblicati ${done} articoli${extra ? ` · ${extra} saltati` : ''} (filtro qualità: ${ALL ? 'DISATTIVATO (--all)' : 'solo bozze dalla fonte'}).`);
console.log('   Controlla il sito con npm run dev — sei sempre in tempo a cancellare un file da src/content/news/.');
