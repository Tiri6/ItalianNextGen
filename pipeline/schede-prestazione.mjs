// SCHEDE-PRESTAZIONE DAI DATI PARTITA
// Per ogni giocatore della watchlist con gol/assist (o una gara solida) nelle partite recenti, crea una CANDIDATA
// con testo scritto SOLO da dati certi (data/performances.json, voci `fromApi`): club, avversario, competizione,
// risultato, minuti, gol, assist. Niente cronaca, niente minuti dei gol, niente giudizi inventati.
// Marco decide nel cockpit se pubblicarle. Salta chi ha già un articolo uscito dopo la partita o una candidata.
// Uso: node pipeline/schede-prestazione.mjs [--giorni=2] [--dry]
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDS = path.join(ROOT, 'pipeline', 'candidates');
const NEWS = path.join(ROOT, 'src', 'content', 'news');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const DRY = process.argv.includes('--dry');
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const isMonday = new Date().getUTCDay() === 1;
const giorni = Number(arg('giorni', isMonday ? 3 : 2));
const since = new Date(Date.now() - giorni * 86400000).toISOString().slice(0, 10);

const perfs = JSON.parse(await readFile(path.join(ROOT, 'data', 'performances.json'), 'utf8')).performances
  .filter((p) => p.fromApi && String(p.date) >= since && /\d+\s*-\s*\d+/.test(p.result ?? ''));

// articoli già usciti (o programmati) con quel giocatore
const articles = [];
for (const f of await readdir(NEWS)) {
  const t = await readFile(path.join(NEWS, f), 'utf8');
  const fm = t.split(/\n---\n/)[0];
  const players = (fm.match(/^players:\s*\[(.*)\]/m)?.[1] ?? '').split(',').map((x) => x.replace(/["']/g, '').trim()).filter(Boolean);
  const when = (fm.match(/^sourceDate:\s*"?([\d-]+)/m) ?? fm.match(/^publishedAt:\s*"?([\d-]+)/m))?.[1] ?? '';
  const cat = fm.match(/^category:\s*(\S+)/m)?.[1] ?? '';
  if (players.length && when >= since ) articles.push({ players: players.map(fold), when });
}
const existing = new Set();
for (const f of await readdir(CANDS)) if (f.endsWith('.json')) existing.add(f.replace(/\.json$/, ''));

const PART = new Set(['di', 'de', 'da', 'del', 'della', 'dal', 'dei', 'van', 'von', 'le', 'la', 'lo', 'el', 'dos', 'ten']);
const surname = (n) => { const w = n.split(' '); let i = w.length - 1; while (i > 1 && PART.has(w[i - 1].toLowerCase())) i--; return w.slice(i).join(' '); };
const pick = (arr, seed) => arr[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % arr.length];
const plur = (n, a, b) => (n === 1 ? a : b);

function build(p) {
  const [a, b] = p.result.split('-').map(Number);
  const esito = a > b ? 'win' : a < b ? 'loss' : 'draw';
  const S = surname(p.player), g = p.goals || 0, as = p.assists || 0, opp = p.opponent, club = p.club;
  const score = `${a}-${b}`;
  const comp = p.competition ? ` (${p.competition})` : '';
  const key = p.player + p.date;
  let title, titleEn, act, actEn;
  if (g && as) { act = `ha segnato ${plur(g, 'un gol', g + ' gol')} e fornito ${plur(as, "un assist", as + ' assist')}`; actEn = `scored ${plur(g, 'a goal', g + ' goals')} and set up ${plur(as, 'a goal', as + ' goals')}`; }
  else if (g) { act = g === 1 ? 'è andato a segno' : g === 2 ? 'ha firmato una doppietta' : `ha segnato ${g} gol`; actEn = g === 1 ? 'found the net' : g === 2 ? 'scored twice' : `scored ${g} goals`; }
  else if (as) { act = `ha fornito ${plur(as, "un assist", as + ' assist')}`; actEn = `set up ${plur(as, 'a goal', as + ' goals')}`; }
  else { act = 'ha giocato una partita solida'; actEn = 'put in a solid performance'; }
  const verbIt = { win: 'vince', loss: 'perde', draw: 'pareggia' }[esito];
  const verbEn = { win: 'win', loss: 'lose', draw: 'draw' }[esito];
  if (g) {
    title = pick([`${S} segna: ${club} ${verbIt} ${score} con ${opp}`, `${S} in gol, ${club} ${verbIt} ${score} contro ${opp}`], key);
    titleEn = `${S} scores: ${club} ${verbEn} ${score} against ${opp}`;
  } else if (as) {
    title = pick([`${S} serve l'assist: ${club} ${verbIt} ${score} con ${opp}`, `Assist di ${S}, ${club} ${verbIt} ${score} contro ${opp}`], key);
    titleEn = `${S} sets up a goal: ${club} ${verbEn} ${score} against ${opp}`;
  } else {
    title = `${S} in campo ${p.minutes}': ${club} ${verbIt} ${score} con ${opp}`;
    titleEn = `${S} plays ${p.minutes} minutes: ${club} ${verbEn} ${score} against ${opp}`;
  }
  const esitoIt = { win: 'vittoria', loss: 'sconfitta', draw: 'pareggio' }[esito];
  const esitoEn = { win: 'win', loss: 'defeat', draw: 'draw' }[esito];
  const bodyIt = `${p.player} ${act} con il ${club} nella sfida contro ${opp}${comp}, chiusa sul ${score} per i suoi: ${esitoIt}. Il giovane è rimasto in campo ${p.minutes} minuti.\n\nI dati di gol, assist e minutaggio arrivano dalle statistiche ufficiali della partita.`;
  const bodyEn = `${p.player} ${actEn} for ${club} against ${opp}${p.competition ? ` (${p.competition})` : ''}, in a match that ended ${score} for his side: a ${esitoEn}. The youngster played ${p.minutes} minutes.\n\nGoals, assists and minutes come from the official match statistics.`;
  const excerpt = `${p.player} ${act} contro ${opp}: ${club} ${esitoIt === 'vittoria' ? 'ha vinto' : esitoIt === 'sconfitta' ? 'ha perso' : 'ha pareggiato'} ${score}.`;
  const excerptEn = `${p.player} ${actEn} against ${opp}: ${club} ${verbEn === 'win' ? 'won' : verbEn === 'lose' ? 'lost' : 'drew'} ${score}.`;
  return { title, titleEn, excerpt, excerptEn, bodyIt, bodyEn, _fromSource: true, _fromApi: true, _sourceDate: `${p.date}T20:00:00.000Z` };
}

let made = 0;
const wanted = perfs.filter((p) => p.goals || p.assists || (p.minutes ?? 0) >= 60);
for (const p of wanted) {
  const id = `api-${p.date}-${fold(p.player)}`;
  if (existing.has(id)) continue;
  const covered = articles.some((x) => x.players.includes(fold(p.player)) && x.when >= p.date);
  if (covered) { console.log(`  = ${p.player}: già coperto da un articolo`); continue; }
  const d = build(p);
  const cand = {
    competitions: [],
    id,
    collectedAt: new Date().toISOString(),
    title: d.title,
    link: '',
    source: 'Dati partita',
    pubDate: new Date(`${p.date}T20:00:00Z`).toUTCString(),
    query: 'dati-partita',
    players: [p.player],
    category: 'performance',
    score: (p.goals ? 7 : p.assists ? 6 : (p.rating ?? 0) >= 7 ? 5 : 3),
    status: 'pending',
    draft: { title: d.title, titleEn: d.titleEn, excerpt: d.excerpt, excerptEn: d.excerptEn, bodyIt: d.bodyIt, bodyEn: d.bodyEn, _fromSource: true, _fromApi: true, _sourceDate: d._sourceDate },
  };
  console.log(`  + ${d.title}`);
  if (!DRY) await writeFile(path.join(CANDS, `${id}.json`), JSON.stringify(cand, null, 2));
  made++;
}
console.log(`\n✅ Schede-prestazione create: ${made}${DRY ? ' (prova, nulla scritto)' : ''}.`);
