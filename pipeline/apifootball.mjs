// DATI PARTITA da API-Football (v3.football.api-sports.io): prestazioni VERIFICATE dei giocatori in watchlist.
//
// Per ogni partita finita (ieri/oggi, tutti i campionati) in cui gioca un club della watchlist legge il tabellino
// (/fixtures/players): titolare/subentrato, minuti, gol, assist, voto. Scrive in data/performances.json voci con
// fonte "Dati partita" e SOLO numeri forniti dall'API (nessuna stima). Una voce API sostituisce quella ricavata
// da un articolo per la stessa partita.
//
// Uso:  node pipeline/apifootball.mjs [--giorni=2] [--date=2026-11-01,2026-11-02] [--max=70] [--dry]
// Serve il segreto APIFOOTBALL_KEY (piano gratuito: 100 richieste al giorno). Senza chiave esce senza errori.
// Budget richieste: 1 per ogni giorno cercato + 1 per ogni partita con giocatori della watchlist (già fatte = saltate).

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://v3.football.api-sports.io';
const STATE = path.join(ROOT, 'data', 'apifootball-state.json');
const PERF = path.join(ROOT, 'data', 'performances.json');
const FINISHED = new Set(['FT', 'AET', 'PEN']);

// ---------- normalizzazione nomi ----------
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ø/g, 'o').replace(/ß/g, 'ss');
const GENERIC = new Set(['ac', 'as', 'fc', 'us', 'ss', 'ssc', 'acf', 'afc', 'cf', 'sc', 'sv', 'vfb', 'vfl', 'calcio', 'fk', '1', '1907', '1909', '1913', '1899']);
export const clubKey = (s) => fold(s).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !GENERIC.has(w)).join(' ');

// Nomi con cui l'API chiama i club che da noi hanno un altro nome
const CLUB_ALIASES = {
  'bayern monaco': ['bayern munich', 'bayern munchen', 'bayern'],
  'borussia monchengladbach': ['borussia monchengladbach', 'monchengladbach', 'gladbach'],
  'norimberga': ['nurnberg', 'nuremberg', 'nurnberg 1'],
  'stoccarda': ['stuttgart', 'vfb stuttgart'],
  'psg': ['paris saint germain', 'paris sg'],
  'paris saint germain': ['paris saint germain', 'paris sg', 'psg'],
  'hellas verona': ['verona', 'hellas verona'],
  'sudtirol': ['sudtirol', 'fc sudtirol', 'sud tirol'],
  'grasshopper': ['grasshoppers', 'grasshopper zurich', 'grasshopper'],
  'sporting cp': ['sporting cp', 'sporting lisbon', 'sporting'],
  'inter u23': ['inter u23', 'inter ii', 'inter milan u23'],
  'atalanta u23': ['atalanta u23', 'atalanta bc u23', 'atalanta ii'],
  'inter': ['inter', 'inter milan', 'internazionale'],
  'milan': ['milan', 'ac milan'],
};
export function clubNames(club) {
  const base = clubKey(club);
  return new Set([base, ...(CLUB_ALIASES[base] ?? []).map(clubKey)]);
}
export function sameClub(watchlistClub, apiTeamName) {
  return clubNames(watchlistClub).has(clubKey(apiTeamName));
}

// "D. Ghilardi" / "Daniele Ghilardi" / "Pio Esposito" ↔ "Francesco Pio Esposito"
export function sameName(watchlistName, apiName) {
  const wl = fold(watchlistName).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  const api = fold(apiName).replace(/[^a-z .]/g, ' ').split(/\s+/).filter(Boolean);
  if (!wl.length || !api.length) return false;
  const initials = api.filter((t) => /^[a-z]\.?$/.test(t)).map((t) => t[0]);
  const words = api.filter((t) => !/^[a-z]\.?$/.test(t)).map((t) => t.replace(/\./g, ''));
  if (!words.length) return false;
  if (!words.every((w) => wl.includes(w))) return false;
  if (words[words.length - 1] !== wl[wl.length - 1] && !wl.includes(words[words.length - 1])) return false;
  return initials.every((i) => wl.some((t) => t[0] === i));
}

// ---------- costruzione della voce ----------
const plural = (n, one, many) => (n === 1 ? `${n} ${one}` : `${n} ${many}`);
export function buildEntry({ fixture, league, teams, goals }, teamSide, player, stat) {
  const g = stat.games ?? {};
  const minutes = Number(g.minutes) || 0;
  if (!minutes) return null; // in panchina senza entrare: non è una prestazione
  const own = teamSide === 'home' ? teams.home.name : teams.away.name;
  const opp = teamSide === 'home' ? teams.away.name : teams.home.name;
  const date = String(fixture.date).slice(0, 10);
  const gl = stat.goals?.total ?? 0;
  const as = stat.goals?.assists ?? 0;
  const rating = g.rating ? Math.round(Number(g.rating) * 10) / 10 : null;
  const starter = g.substitute === false;
  const itB = [starter ? 'Titolare' : 'Subentrato', `${minutes}' in campo`];
  const enB = [starter ? 'Starter' : 'Substitute', `${minutes} minutes played`];
  if (gl) { itB.push(plural(gl, 'gol', 'gol')); enB.push(plural(gl, 'goal', 'goals')); }
  if (as) { itB.push(plural(as, 'assist', 'assist')); enB.push(plural(as, 'assist', 'assists')); }
  if (stat.cards?.red) { itB.push('espulso'); enB.push('sent off'); }
  return {
    date,
    player: player.name,
    club: String(player.club ?? own).replace(/\s*\(.*?\)\s*/g, '').trim() || own,
    opponent: opp,
    competition: league.name ?? '',
    // Risultato SEMPRE dal punto di vista del club del giocatore (la scheda mostra "club — avversario · risultato")
    result: teamSide === 'home' ? `${goals.home ?? 0}-${goals.away ?? 0}` : `${goals.away ?? 0}-${goals.home ?? 0}`,
    minutes,
    ...(gl ? { goals: gl } : {}),
    ...(as ? { assists: as } : {}),
    ...(rating ? { rating } : {}),
    note: `${itB.join(', ')}.`,
    noteEn: `${enB.join(', ')}.`,
    source: 'Dati partita',
    fromApi: true,
  };
}

// Sostituisce nel database le voci della stessa partita (stesso giocatore, ±4 giorni, stesso avversario o risultato)
export function mergeEntry(list, entry) {
  const day = (d) => Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
  const oppKey = clubKey(entry.opponent);
  const same = (p) => {
    if (p.player !== entry.player) return false;
    if (Math.abs(day(p.date) - day(entry.date)) > 4 * 86400000) return false;
    const o = clubKey(p.opponent);
    if (o && oppKey && (o === oppKey || o.includes(oppKey) || oppKey.includes(o))) return true;
    const norm = (r) => String(r ?? '').replace(/\s/g, '');
    return !!p.result && norm(p.result) === norm(entry.result);
  };
  const kept = list.filter((p) => !same(p));
  return { list: [...kept, entry], replaced: list.length - kept.length };
}

// ---------- API ----------
let remaining = null;
let lastCall = 0;
// Piano gratuito: massimo 10 richieste al minuto → una ogni 7 secondi (ritardo configurabile con APIFOOTBALL_DELAY_MS)
const DELAY_MS = Number(process.env.APIFOOTBALL_DELAY_MS ?? 7000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(pathAndQuery, key, retry = true) {
  const wait = lastCall + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(`${API}${pathAndQuery}`, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(30000) });
  const r = res.headers.get('x-ratelimit-requests-remaining');
  if (r != null) remaining = Number(r);
  if (res.status === 429 && retry) { await sleep(65000); return api(pathAndQuery, key, false); } // troppe richieste al minuto: attende e riprova una volta
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  if (errs && errs.length) throw new Error(`API: ${errs.map(String).join('; ').slice(0, 200)}`);
  return j.response ?? [];
}

const STATUS = path.join(ROOT, 'data', 'apifootball-status.json');
async function status(msg, extra = {}) {
  console.log(msg);
  try { await writeFile(STATUS, JSON.stringify({ at: new Date().toISOString(), msg, ...extra }, null, 2) + '\n'); } catch {}
}
const romeDay = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d);

async function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
  const DRY = process.argv.includes('--dry');
  const key = process.env.APIFOOTBALL_KEY;
  if (!key) { await status('ℹ️  APIFOOTBALL_KEY non impostata: dati partita saltati.'); return; }

  const MAX = Number(arg('max') ?? 70);
  const days = arg('date')
    ? arg('date').split(',')
    : Array.from({ length: Math.max(1, Number(arg('giorni') ?? 2)) }, (_, i) => romeDay(new Date(Date.now() - i * 86400000)));

  const players = JSON.parse(await readFile(path.join(ROOT, 'data', 'players.json'), 'utf8')).players;
  const db = JSON.parse(await readFile(PERF, 'utf8'));
  let state = { processed: {} };
  try { state = JSON.parse(await readFile(STATE, 'utf8')); } catch {}
  state.processed ??= {};

  let calls = 0;
  const errors = [];
  const todo = [];
  for (const day of days) {
    let fixtures;
    try { fixtures = await api(`/fixtures?date=${day}&timezone=Europe/Rome`, key); calls++; }
    catch (e) {
      // Piano gratuito: solo ieri, oggi e domani. Una data fuori finestra si salta, le altre proseguono.
      console.log(`⚠️  fixtures ${day}: ${e.message}`);
      errors.push(`${day}: ${e.message}`);
      continue;
    }
    const done = fixtures.filter((f) => FINISHED.has(f.fixture?.status?.short));
    for (const f of done) {
      if (state.processed[f.fixture.id]) continue;
      const home = players.filter((p) => sameClub(p.club, f.teams.home.name));
      const away = players.filter((p) => sameClub(p.club, f.teams.away.name));
      if (home.length || away.length) todo.push({ f, home, away });
    }
    console.log(`📅 ${day}: ${fixtures.length} partite, ${done.length} finite`);
  }
  console.log(`🎯 Partite con giocatori della watchlist da leggere: ${todo.length}`);

  let added = 0, replaced = 0;
  for (const { f, home, away } of todo) {
    if (calls >= MAX || (remaining != null && remaining <= 3)) { console.log('⏸  Budget richieste esaurito: le altre partite al prossimo giro.'); break; }
    let teamsStats;
    try { teamsStats = await api(`/fixtures/players?fixture=${f.fixture.id}`, key); calls++; }
    catch (e) { console.log(`  ⚠️  ${f.teams.home.name}-${f.teams.away.name}: ${e.message}`); continue; }
    for (const t of teamsStats) {
      const side = t.team?.id === f.teams.home.id ? 'home' : 'away';
      const wl = side === 'home' ? home : away;
      for (const pl of t.players ?? []) {
        const hits = wl.filter((w) => sameName(w.name, pl.player?.name));
        if (hits.length !== 1) { if (hits.length > 1) console.log(`  ? nome ambiguo: ${pl.player?.name}`); continue; }
        const entry = buildEntry(f, side, hits[0], pl.statistics?.[0] ?? {});
        if (!entry) continue;
        const m = mergeEntry(db.performances, entry);
        db.performances = m.list; replaced += m.replaced ? 1 : 0; added++;
        console.log(`  ✓ ${entry.player} — ${entry.club} ${entry.result} ${entry.opponent}: ${entry.note}`);
      }
    }
    state.processed[f.fixture.id] = days[0];
  }

  // Tiene solo gli ultimi ~600 id partita nello stato
  const ids = Object.keys(state.processed);
  if (ids.length > 600) for (const id of ids.slice(0, ids.length - 600)) delete state.processed[id];

  await status(`${errors.length && !calls ? '❌' : '✅'} ${days.join(', ')}: partite da leggere ${todo.length}, prestazioni ${added}, richieste ${calls}`, { remaining, ...(errors.length ? { errors } : {}) });
  console.log(`\n✅ Prestazioni da dati partita: ${added} (di cui ${replaced} sostituiscono voci da articoli) · richieste usate: ${calls}${remaining != null ? ` · rimaste oggi: ${remaining}` : ''}`);
  if (DRY) { console.log('(prova: niente scritto)'); return; }
  await writeFile(PERF, JSON.stringify(db, null, 2) + '\n');
  await writeFile(STATE, JSON.stringify(state, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (e) => { await status(`💥 Errore dati partita: ${String(e?.stack ?? e).slice(0, 400)}`); process.exit(0); }); // mai bloccare la redazione
}
