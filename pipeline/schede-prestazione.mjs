// SCHEDE-PRESTAZIONE DAI DATI PARTITA
// Per ogni giocatore della watchlist con gol/assist (o una gara solida) nelle partite recenti, crea una CANDIDATA
// con testo scritto SOLO da dati certi (data/performances.json, voci `fromApi`): club, avversario, competizione,
// risultato, minuti, gol, assist. Niente cronaca, niente minuti dei gol, niente giudizi inventati.
// Marco decide nel cockpit se pubblicarle. Salta chi ha già un articolo uscito dopo la partita o una candidata.
// Uso: node pipeline/schede-prestazione.mjs [--giorni=2] [--dry]
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
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

// Più giocatori della stessa partita = UNA scheda sola (es. Koleosho e Coppola, Paris FC-Angers 4-0).
const canon = (x) => fold(String(x ?? '').replace(/\b(ac|as|fc|ssc|us|ss|sc|afc|calcio|football|club)\b/gi, ''));
const sortedScore = (r) => r.replace(/\s/g, '').split('-').sort().join('-');
const names = (arr) => (arr.length === 1 ? arr[0] : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1]);
const namesEn = (arr) => (arr.length === 1 ? arr[0] : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1]);
const actShort = (p, en) => {
  const g = p.goals || 0, a = p.assists || 0, parts = [];
  if (g) parts.push(en ? (g === 1 ? 'scored' : g === 2 ? 'scored twice' : `scored ${g}`) : (g === 1 ? 'è andato a segno' : g === 2 ? 'ha firmato una doppietta' : `ha segnato ${g} gol`));
  if (a) parts.push(en ? (a === 1 ? 'set up a goal' : `set up ${a} goals`) : (a === 1 ? 'ha fornito un assist' : `ha fornito ${a} assist`));
  return parts.length ? parts.join(en ? ' and ' : ' e ') : (en ? 'played' : 'è sceso in campo');
};
function buildGroup(ps) {
  const h = ps[0];
  const [a, b] = h.result.split('-').map(Number);
  const esito = a > b ? 'win' : a < b ? 'loss' : 'draw';
  const verbIt = { win: 'vince', loss: 'perde', draw: 'pareggia' }[esito];
  const verbEn = { win: 'win', loss: 'lose', draw: 'draw' }[esito];
  const score = `${a}-${b}`;
  const sameClub = ps.every((p) => canon(p.club) === canon(h.club));
  const sn = ps.map((p) => surname(p.player));
  const comp = h.competition ? ` (${h.competition})` : '';
  const title = sameClub
    ? `${names(sn)}: ${h.club} ${verbIt} ${score} con ${h.opponent}`
    : `${h.club}-${h.opponent} ${score}: ${names(sn)} in campo`;
  const titleEn = sameClub
    ? `${namesEn(sn)}: ${h.club} ${verbEn} ${score} against ${h.opponent}`
    : `${h.club} ${score} ${h.opponent}: ${namesEn(sn)} in action`;
  const lineIt = (p) => `${p.player}${sameClub ? '' : ` (${p.club})`} ${actShort(p, false)}, rimanendo in campo ${p.minutes} minuti.`;
  const lineEn = (p) => `${p.player}${sameClub ? '' : ` (${p.club})`} ${actShort(p, true)}, playing ${p.minutes} minutes.`;
  const esitoIt = { win: 'vittoria', loss: 'sconfitta', draw: 'pareggio' }[esito];
  const esitoEn = { win: 'win', loss: 'defeat', draw: 'draw' }[esito];
  const bodyIt = `${h.club}-${h.opponent}${comp}: ${score} per ${h.club}, ${esitoIt}. In campo ${ps.length} giovani della nostra lista.\n\n${ps.map(lineIt).join('\n\n')}\n\nI dati di gol, assist e minutaggio arrivano dalle statistiche ufficiali della partita.`;
  const bodyEn = `${h.club} vs ${h.opponent}${h.competition ? ` (${h.competition})` : ''}: ${score} for ${h.club}, a ${esitoEn}. ${ps.length} young players from our list were on the pitch.\n\n${ps.map(lineEn).join('\n\n')}\n\nGoals, assists and minutes come from the official match statistics.`;
  const excerpt = `${h.club} ${verbIt} ${score} con ${h.opponent}: ${names(ps.map((p) => `${surname(p.player)} ${actShort(p, false)}`))}.`;
  const excerptEn = `${h.club} ${verbEn === 'win' ? 'won' : verbEn === 'lose' ? 'lost' : 'drew'} ${score} against ${h.opponent}: ${namesEn(ps.map((p) => `${surname(p.player)} ${actShort(p, true)}`))}.`;
  return { title, titleEn, excerpt, excerptEn, bodyIt, bodyEn, _fromSource: true, _fromApi: true, _sourceDate: `${h.date}T20:00:00.000Z` };
}

// di lunedì il Taccuino del weekend racconta già i minuti di tutti: qui restano solo gol e assist
const wanted = perfs.filter((p) => p.goals || p.assists || (!isMonday && (p.minutes ?? 0) >= 60));
const todo = wanted.filter((p) => {
  if (articles.some((x) => x.players.includes(fold(p.player)) && x.when >= p.date)) { console.log(`  = ${p.player}: già coperto da un articolo`); return false; }
  return true;
});
const parent = todo.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < todo.length; i++) for (let j = i + 1; j < todo.length; j++) {
  const A = todo[i], B = todo[j];
  if (A.date !== B.date || sortedScore(A.result) !== sortedScore(B.result)) continue;
  if ([canon(A.club), canon(A.opponent)].some((x) => x && (x === canon(B.club) || x === canon(B.opponent)))) parent[find(j)] = find(i);
}
const groups = new Map();
todo.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });

// di lunedì le schede «solo minuti» (nessun gol/assist) non servono più: sono già nel Taccuino del weekend
if (isMonday && !DRY) {
  for (const p of perfs.filter((x) => !x.goals && !x.assists)) {
    const old = `api-${p.date}-${fold(p.player)}`;
    if (existing.has(old)) { await unlink(path.join(CANDS, `${old}.json`)).catch(() => {}); console.log(`  − scheda solo minuti tolta (nel Taccuino): ${old}`); }
  }
}

let made = 0;
for (const ps0 of groups.values()) {
  const ps = [...ps0].sort((x, y) => ((y.goals || 0) * 3 + (y.assists || 0) * 2) - ((x.goals || 0) * 3 + (x.assists || 0) * 2) || (y.minutes || 0) - (x.minutes || 0));
  const h = ps[0];
  const id = ps.length === 1 ? `api-${h.date}-${fold(h.player)}` : `api-${h.date}-${fold(h.club)}-${fold(h.opponent)}`;
  if (existing.has(id)) continue;
  const d = ps.length === 1 ? build(h) : buildGroup(ps);
  const best = Math.max(...ps.map((p) => (p.goals ? 7 : p.assists ? 6 : (p.rating ?? 0) >= 7 ? 5 : 3)));
  const cand = {
    competitions: [],
    id,
    collectedAt: new Date().toISOString(),
    title: d.title,
    link: '',
    source: 'Dati partita',
    pubDate: new Date(`${h.date}T20:00:00Z`).toUTCString(),
    query: 'dati-partita',
    players: ps.map((p) => p.player),
    category: 'performance',
    score: best + (ps.length > 1 ? 1 : 0),
    status: 'pending',
    draft: { title: d.title, titleEn: d.titleEn, excerpt: d.excerpt, excerptEn: d.excerptEn, bodyIt: d.bodyIt, bodyEn: d.bodyEn, _fromSource: true, _fromApi: true, _sourceDate: d._sourceDate },
  };
  console.log(`  + ${d.title}${ps.length > 1 ? `  [${ps.length} giocatori]` : ''}`);
  if (!DRY) {
    await writeFile(path.join(CANDS, `${id}.json`), JSON.stringify(cand, null, 2));
    // le schede singole dello stesso gruppo create in giri precedenti vengono assorbite da quella di gruppo
    if (ps.length > 1) for (const p of ps) { const old = `api-${p.date}-${fold(p.player)}`; if (existing.has(old)) { await unlink(path.join(CANDS, `${old}.json`)).catch(() => {}); console.log(`    − assorbita ${old}`); } }
  }
  made++;
}
console.log(`\n✅ Schede-prestazione create: ${made}${DRY ? ' (prova, nulla scritto)' : ''}.`);
