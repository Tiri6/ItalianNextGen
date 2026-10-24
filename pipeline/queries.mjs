// QUERY DI RICERCA SEMPRE ALLINEATE AL CLUB ATTUALE
//
// Le query scout in data/players.json contenevano il club scritto a mano ("Koleosho Burnley"):
// dopo un trasferimento restavano vecchie e la ricerca non trovava più nulla. Ora la raccolta
// (pipeline/run.mjs) passa da qui ogni giorno:
//   1. scarta le query che citano un club diverso dal club attuale del giocatore (campo "club");
//   2. in quel caso aggiunge la ricerca con il nome completo ("Luca Koleosho") e con nome completo + club attuale ("Luca Koleosho Paris FC").
//   Le query che non citano club o citano il club giusto restano com'erano.
// Così basta aggiornare "club" quando un giocatore cambia squadra: le ricerche seguono da sole.
//
// Uso a mano:  node pipeline/queries.mjs           → elenca le correzioni
//              node pipeline/queries.mjs --fix     → riscrive le query in data/players.json

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const baseClub = (club) => String(club ?? '').replace(/\(.*?\)/g, '').trim();

/** Nomi di club noti (da data/clubs.json e dai club di tutta la watchlist), esclusa la Nazionale. */
export function knownClubs(players, clubsJson = {}) {
  const set = new Set();
  for (const [k, v] of Object.entries(clubsJson)) {
    if (k.startsWith('_') || k === 'Italia') continue;
    set.add(k); (v.alias ?? []).forEach((a) => set.add(a));
  }
  for (const p of players) { const b = baseClub(p.club); if (b) set.add(b); set.add(b.replace(/\b(U\d\d|Futuro|Primavera)\b/gi, '').trim()); }
  ['Burnley', 'Spezia', 'Chelsea', 'Atalanta'].forEach((c) => set.add(c));
  return [...set].filter((c) => c.length > 2);
}

const hasWord = (haystack, word) => ` ${norm(haystack)} `.includes(` ${norm(word)} `);

export function queriesFor(p, clubList) {
  const current = baseClub(p.club);
  const orig = p.queries?.length ? p.queries : [p.name];
  const kept = [], dropped = [];
  for (const q of orig) {
    const mentioned = clubList.filter((c) => hasWord(q, c));
    // una query "Atalanta U23" cita sia "Atalanta" sia "Atalanta U23": conta solo se NESSUN nome citato è il club attuale
    const ok = mentioned.length === 0 || mentioned.some((c) => hasWord(current, c) || hasWord(c, current));
    (ok ? kept : dropped).push(q);
  }
  // Si interviene SOLO se c'era una query con un club vecchio: le altre restano come sono.
  const out = [...kept];
  if (dropped.length) {
    if (!out.some((q) => hasWord(q, p.name))) out.push(p.name);
    if (current && !out.some((q) => hasWord(q, current))) out.push(`${p.name} ${current}`);
  }
  const seen = new Set();
  const uniq = out.filter((q) => { const k = norm(q); if (seen.has(k)) return false; seen.add(k); return true; });
  return { queries: uniq, dropped };
}

export async function buildQueries(players) {
  let clubs = {};
  try { clubs = JSON.parse(await readFile(path.join(ROOT, 'data', 'clubs.json'), 'utf8')); } catch {}
  const list = knownClubs(players, clubs);
  const all = [], changes = [];
  for (const p of players) {
    const { queries, dropped } = queriesFor(p, list);
    all.push(...queries);
    if (dropped.length || JSON.stringify(queries) !== JSON.stringify(p.queries)) changes.push({ name: p.name, club: p.club, before: p.queries, after: queries, dropped });
  }
  return { queries: all, changes };
}

// --- uso da riga di comando ---
if (process.argv[1] && process.argv[1].endsWith('queries.mjs')) {
  const file = path.join(ROOT, 'data', 'players.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  const { changes } = await buildQueries(data.players);
  if (!changes.length) console.log('Tutte le query sono allineate al club attuale. ✅');
  for (const c of changes) console.log(`• ${c.name} [${c.club}]\n    prima: ${JSON.stringify(c.before)}\n    dopo:  ${JSON.stringify(c.after)}${c.dropped.length ? `\n    scartate (club vecchio): ${JSON.stringify(c.dropped)}` : ''}`);
  if (process.argv.includes('--fix') && changes.length) {
    for (const c of changes) data.players.find((p) => p.name === c.name).queries = c.after;
    await writeFile(file, JSON.stringify(data, null, 2) + '\n');
    console.log(`\n✍️  data/players.json aggiornato (${changes.length} giocatori).`);
  }
}
