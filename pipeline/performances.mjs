// AGENTE PRESTAZIONI
// Uso: npm run perf
//
// Legge gli articoli di categoria "performance" pubblicati negli ultimi giorni
// ed estrae i dati strutturati della prestazione (giocatore, avversario,
// risultato, minuti, gol, assist, voto) SOLO se presenti nel testo. Aggiorna
// data/performances.json tenendo le 12 più recenti. Ogni voce ha la fonte.
//
// Regola d'affidabilità: nessun dato inventato. Se un campo non c'è nel testo,
// viene omesso. Richiede ANTHROPIC_API_KEY (come write/digest).

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupePerformances, hasResult } from './perf-dedupe.mjs';
import { loadTitles, findResult } from './perf-result.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'src', 'content', 'news');
const PERF = path.join(ROOT, 'data', 'performances.json');
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_AGE_DAYS = 10;

let apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  try { apiKey = (await readFile(path.join(ROOT, '.env'), 'utf8')).match(/ANTHROPIC_API_KEY\s*=\s*(\S+)/)?.[1]; } catch {}
}
if (!apiKey) { console.error('❌ Manca ANTHROPIC_API_KEY.'); process.exit(1); }

const players = JSON.parse(await readFile(path.join(ROOT, 'data', 'players.json'), 'utf8')).players.map((p) => p.name);
const db = JSON.parse(await readFile(PERF, 'utf8'));
const existing = new Set(db.performances.map((p) => `${p.player}|${p.date}`));

const today = new Date();
const titles = await loadTitles(ROOT);
const files = (await readdir(NEWS)).filter((f) => f.endsWith('.md'));
const candidates = [];

for (const f of files) {
  const t = await readFile(path.join(NEWS, f), 'utf8');
  const fm = t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  if (!/^category:\s*["']?performance/m.test(fm)) continue;
  const date = fm.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1];
  if (!date) continue;
  if ((today - new Date(date)) / 86400000 > MAX_AGE_DAYS) continue;
  const pls = [...(fm.match(/^players:\s*\[(.*)\]/m)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!pls.length) continue;
  const src = fm.match(/^sourceUrl:\s*"(.*)"/m)?.[1] ?? '';
  const srcName = fm.match(/^source:\s*"(.*)"/m)?.[1] ?? '';
  const bodyIt = (t.split(/\n---\n/)[1] ?? '').split('<!--EN-->')[0].trim().slice(0, 1500);
  candidates.push({ f, date, players: pls, src, srcName, body: bodyIt });
}

if (!candidates.length) {
  console.log('Nessun match report recente da cui estrarre prestazioni.');
  process.exit(0);
}

console.log(`⚽ Agente prestazioni — esamino ${candidates.length} match report...\n`);
let added = 0;

for (const c of candidates) {
  const known = c.players.filter((p) => players.includes(p) && !existing.has(`${p}|${c.date}`));
  if (!known.length) continue;

  const prompt = `Sei un analista. Dal testo qui sotto estrai i dati della PRESTAZIONE per ognuno di questi giocatori italiani: ${known.join(', ')}.
Estrai SOLO ciò che è ESPLICITAMENTE scritto nel testo. Se un campo non c'è, ometti la chiave (NON inventare voti, minuti o gol).

TESTO:
${c.body}

Per ogni giocatore per cui il testo descrive una partita giocata, produci un oggetto con:
- player (nome esatto tra quelli indicati)
- club (la sua squadra, se citata)
- opponent (avversario, se citato)
- competition (competizione/categoria, se citata)
- result (risultato tipo "2-1", se citato)
- minutes (numero, solo se citato)
- goals (numero, solo se citato)
- assists (numero, solo se citato)
- rating (voto 1-10, solo se citato)
- note (mezza frase in italiano sul contributo, dai fatti del testo)
- noteEn (traduzione inglese della nota)
Se il testo NON descrive una partita giocata da un giocatore (es. solo mercato o voci), NON includerlo.

Rispondi SOLO con JSON valido: {"performances":[...]}. Se nessuno ha giocato, {"performances":[]}.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { console.log(`  ⚠️  ${c.f}: API ${res.status}`); continue; }
    const data = await res.json();
    const j = (data.content?.[0]?.text ?? '').match(/\{[\s\S]*\}/);
    if (!j) continue;
    const parsed = JSON.parse(j[0]);
    for (const perf of parsed.performances ?? []) {
      if (!perf.player || !players.includes(perf.player)) continue;
      if (existing.has(`${perf.player}|${c.date}`)) continue;
      // richiede almeno avversario o risultato: senza, non è una prestazione utile
      if (!perf.opponent && !perf.result) continue;
      // scarta le estrazioni sballate in cui l'"avversario" è la squadra stessa
      // (capita con articoli vaghi: "gol nella sfida del Como" → opponent=Como)
      const opp = (perf.opponent ?? '').trim().toLowerCase();
      const own = (perf.club ?? '').trim().toLowerCase();
      if (opp && own && (opp === own || opp.includes(own) || own.includes(opp))) {
        if (!perf.result) continue; // senza un risultato reale non è affidabile
        perf.opponent = ''; // teniamo la prestazione ma senza avversario errato
      }
      // REGOLA: niente prestazione senza risultato. Se l'articolo non lo dice, lo si cerca nei titoli già raccolti
      // (squadra del giocatore + avversario + punteggio, tutti concordi); se non si trova, la prestazione non entra.
      if (!hasResult(perf)) {
        const r = findResult(titles, perf.club, perf.opponent);
        if (r) perf.result = r;
      }
      if (!hasResult(perf)) { console.log(`  ⤫ ${perf.player} — ${perf.opponent || ''}: risultato non trovato, non aggiunta`); continue; }
      db.performances.push({
        date: c.date,
        player: perf.player,
        club: perf.club ?? '',
        opponent: perf.opponent ?? '',
        competition: perf.competition ?? '',
        result: perf.result ?? '',
        ...(perf.minutes != null ? { minutes: Number(perf.minutes) } : {}),
        ...(perf.goals != null ? { goals: Number(perf.goals) } : {}),
        ...(perf.assists != null ? { assists: Number(perf.assists) } : {}),
        ...(perf.rating != null ? { rating: Number(perf.rating) } : {}),
        note: perf.note ?? '',
        noteEn: perf.noteEn ?? perf.note ?? '',
        source: c.srcName,
        sourceUrl: c.src,
      });
      existing.add(`${perf.player}|${c.date}`);
      added++;
      console.log(`  ✓ ${perf.player} — ${perf.opponent || ''} ${perf.result || ''} (${c.date})`);
    }
  } catch (err) {
    console.log(`  ⚠️  ${c.f}: ${err.message.slice(0, 60)}`);
  }
}

// Tieni le più recenti (max 20 in archivio, la home ne mostra 8)
db.performances = dedupePerformances(db.performances); // una partita = una voce per giocatore
db.performances = db.performances.slice(0, 20);
await writeFile(PERF, JSON.stringify(db, null, 2));

console.log(`\n✅ Prestazioni aggiunte: ${added}. Totale in archivio: ${db.performances.length}.`);
