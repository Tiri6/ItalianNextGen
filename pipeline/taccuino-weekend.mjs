// TACCUINO DEL LUNEDÌ: il weekend dei giovani della watchlist
// Di lunedì il Taccuino non raccoglie le notizie minori: racconta le PRESTAZIONI di venerdì, sabato e domenica
// (data/performances.json), una pillola per partita, senza limite di numero. Testo scritto SOLO da dati certi
// (club, avversario, competizione, risultato, minuti, gol, assist): niente cronaca né giudizi inventati.
// Crea la candidata `taccuino-<data>` (la stessa che creerebbe digest.mjs, che di lunedì la trova già e salta).
// Uso: node pipeline/taccuino-weekend.mjs [--giorni=3] [--force] [--dry]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupePerformances, publishablePerformances } from './perf-dedupe.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const giorni = Number(arg('giorni', 3));
const now = new Date();
const today = now.toISOString().slice(0, 10);
const since = new Date(now.getTime() - giorni * 86400000).toISOString().slice(0, 10);

// Solo di lunedì (o con --force): negli altri giorni resta il Taccuino delle notizie
if (now.getUTCDay() !== 1 && !FORCE) { console.log('Non è lunedì: nessun Taccuino del weekend.'); process.exit(0); }

const id = `taccuino-${today}`;
const file = path.join(ROOT, 'pipeline', 'candidates', `${id}.json`);
try {
  const ex = JSON.parse(await readFile(file, 'utf8'));
  if (ex._weekend && !FORCE) { console.log('Taccuino del weekend già creato.'); process.exit(0); }
} catch {}

const all = JSON.parse(await readFile(path.join(ROOT, 'data', 'performances.json'), 'utf8')).performances;
const perfs = publishablePerformances(dedupePerformances(all), now.getTime())
  .filter((p) => String(p.date) >= since && String(p.date) < today);
if (!perfs.length) { console.log('Nessuna prestazione nel weekend: niente Taccuino.'); process.exit(0); }

const PART = new Set(['di', 'de', 'da', 'del', 'della', 'dal', 'dei', 'van', 'von', 'le', 'la', 'lo', 'el', 'dos', 'ten']);
const surname = (n) => { const w = n.split(' '); let i = w.length - 1; while (i > 1 && PART.has(w[i - 1].toLowerCase())) i--; return w.slice(i).join(' '); };
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const flip = (r) => r.split(/\s*[-–]\s*/).reverse().join('-');
const norm = (r) => r.replace(/\s/g, '').replace('–', '-');

// Nazionali: il "club" delle voci è quello del giocatore, ma la partita è dell'Italia (U17, U21...)
const isNational = (p) => /mondiale|europe|qualificazion|amichevole|azzurrini|nazionale|elite league|\bunder\s?\d|\bu\d{2}\b/i.test(p.competition ?? '') && !/serie|primavera|liga|bundesliga|ligue|super league/i.test(p.competition ?? '');
const teamOf = (p) => (isNational(p) ? `Italia${(p.competition ?? '').match(/(?:under\s?|u)(\d{2})/i) ? ` U${(p.competition ?? '').match(/(?:under\s?|u)(\d{2})/i)[1]}` : ''}` : p.club);
// nome squadra "canonico" per riconoscere la stessa partita (AC Milan = Milan, AS Roma = Roma, Südtirol = Sudtirol)
const canon = (s) => fold(String(s ?? '').replace(/\b(ac|as|fc|ssc|us|ss|sc|afc|calcio|football|club)\b/gi, ''));
const sortedScore = (r) => norm(r).split('-').sort().join('-');

// una pillola per partita: stessa data, stesso punteggio e almeno una squadra in comune
const list = perfs.map((p) => ({ ...p, result: norm(p.result), t1: canon(teamOf(p)), t2: canon(p.opponent) }));
const parent = list.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
  const a = list[i], b = list[j];
  if (a.date !== b.date || sortedScore(a.result) !== sortedScore(b.result)) continue;
  if ([a.t1, a.t2].some((x) => x && (x === b.t1 || x === b.t2))) parent[find(j)] = find(i);
}
const groups = new Map();
list.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
const matches = new Map();
for (const [k, ps] of groups) {
  ps.sort((a, b) => ((b.goals || 0) * 3 + (b.assists || 0) * 2) - ((a.goals || 0) * 3 + (a.assists || 0) * 2) || (b.minutes || 0) - (a.minutes || 0));
  const h = ps[0];
  matches.set(k, {
    date: h.date, home: teamOf(h), away: h.opponent, result: h.result, competition: h.competition,
    players: ps.map((p) => ({ ...p, sameSide: p.t1 === h.t1 })),
  });
}

const act = (p, en) => {
  const g = p.goals || 0, a = p.assists || 0;
  const parts = [];
  if (g) parts.push(en ? (g === 1 ? 'scores' : g === 2 ? 'scores twice' : `scores ${g}`) : (g === 1 ? 'segna' : g === 2 ? 'firma una doppietta' : `segna ${g} gol`));
  if (a) parts.push(en ? (a === 1 ? 'sets up a goal' : `sets up ${a} goals`) : (a === 1 ? 'serve un assist' : `serve ${a} assist`));
  const mins = p.fromApi && p.minutes ? (en ? `played ${p.minutes}'` : `in campo ${p.minutes}'`) : '';
  const base = parts.join(en ? ' and ' : ' e ');
  if (base) return mins ? `${base} (${mins})` : base;
  return en ? (mins ? `plays ${p.minutes} minutes` : 'in action') : (mins ? `in campo ${p.minutes} minuti` : 'in campo');
};
const weight = (m) => m.players.reduce((s, p) => s + (p.goals || 0) * 3 + (p.assists || 0) * 2, 0);

const dayName = (d, loc) => new Date(`${d}T12:00:00Z`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const days = [...new Set([...matches.values()].map((m) => m.date))].sort();

const build = (en) => days.map((d) => {
  const ms = [...matches.values()].filter((m) => m.date === d).sort((a, b) => weight(b) - weight(a));
  const pills = ms.map((m) => {
    const res = `${m.home} ${m.result} ${m.away}`;
    const comp = m.competition ? ` (${m.competition})` : '';
    const lines = m.players
      .map((p) => `${p.player} ${act(p, en)}${m.players.some((x) => !x.sameSide) ? ` (${teamOf(p)})` : ''}`);
    return `**${res}**${comp} — ${lines.join('; ')}.`;
  });
  return `### ${cap(dayName(d, en ? 'en-GB' : 'it-IT'))}\n\n${pills.join('\n\n')}`;
}).join('\n\n');

const totPlayers = new Set(perfs.map((p) => p.player)).size;
const totGoals = perfs.reduce((s, p) => s + (p.goals || 0), 0);
const totAssists = perfs.reduce((s, p) => s + (p.assists || 0), 0);
const todayIt = now.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
const todayEn = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^(\d+)/, (x) => x);
const introIt = `Il weekend dei nostri giovani, partita per partita: ${totPlayers} giocatori della lista in campo in ${matches.size} gare, con ${totGoals} gol e ${totAssists} assist tra campionati e nazionali.`;
const introEn = `The weekend of our young players, match by match: ${totPlayers} players from our list in action across ${matches.size} games, with ${totGoals} goals and ${totAssists} assists in leagues and national teams.`;
const outroIt = `Gol, assist e minutaggio arrivano dalle statistiche ufficiali delle partite.`;
const outroEn = `Goals, assists and minutes come from the official match statistics.`;

const draft = {
  title: `Taccuino del giorno · ${todayIt}`,
  titleEn: `Daily Notebook · ${todayEn}`,
  excerpt: `Gol, assist e minuti dei giovani della lista tra venerdì e domenica: ${totPlayers} giocatori in ${matches.size} partite.`,
  excerptEn: `Goals, assists and minutes of the young players on our list from Friday to Sunday: ${totPlayers} players across ${matches.size} matches.`,
  bodyIt: `${introIt}\n\n${build(false)}\n\n${outroIt}`,
  bodyEn: `${introEn}\n\n${build(true)}\n\n${outroEn}`,
  _fromSource: true,
};
const candidate = {
  id, isDigest: true, _weekend: true,
  collectedAt: now.toISOString(),
  title: draft.title, link: '', source: 'Dati partita',
  players: [...new Set(perfs.map((p) => p.player))], competitions: [],
  category: 'taccuino', score: 10, status: 'pending', draft,
};
console.log(`📓 Taccuino del weekend: ${matches.size} partite, ${totPlayers} giocatori, ${totGoals} gol, ${totAssists} assist`);
if (DRY) { console.log(draft.bodyIt); process.exit(0); }
await writeFile(file, JSON.stringify(candidate, null, 2));
console.log(`✅ ${id} scritto.`);
