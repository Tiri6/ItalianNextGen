// TACCUINO DEL GIORNO
// Uso: npm run digest              (usa le candidate senza bozza, max 15)
//      npm run digest -- --max=20
//
// Invece di un articolo per ogni notizia minore, il taccuino le raccoglie in
// UN SOLO pezzo quotidiano a pillole: "Camarda: ... · Leoni: ... · U19: ...".
// Ogni pillola chiude con il link alla fonte. Il taccuino diventa una candidata
// con bozza precompilata: la approvi dalla dashboard come tutto il resto.
//
// Consiglio di flusso: npm run write (le storie grosse) → npm run digest (il resto).

import { readFile, writeFile, readdir, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBlocked } from './sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = path.join(ROOT, 'pipeline', 'candidates');
const DIGESTED = path.join(ROOT, 'pipeline', 'digested');
const MODEL = 'claude-haiku-4-5-20251001';

const maxArg = process.argv.find((a) => a.startsWith('--max='));
const MAX = Math.max(3, Number(maxArg?.split('=')[1]) || 5);

// Chiave API da .env o ambiente
let apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  try {
    apiKey = (await readFile(path.join(ROOT, '.env'), 'utf8')).match(/ANTHROPIC_API_KEY\s*=\s*(\S+)/)?.[1];
  } catch {}
}
if (!apiKey) {
  console.error('❌ Manca ANTHROPIC_API_KEY nel file .env');
  process.exit(1);
}

// Prendi le candidate SENZA bozza (le storie grosse le gestisce npm run write)
let files = [];
try { files = (await readdir(CANDIDATES)).filter((f) => f.endsWith('.json')); } catch {}
const pool = [];
for (const f of files) {
  try {
    const c = JSON.parse(await readFile(path.join(CANDIDATES, f), 'utf8'));
    if (!c.draft && !c.isDigest && !isBlocked(c.source)) pool.push({ f, c });
  } catch {}
}
if (pool.length < 2) {
  console.log(`Servono almeno 2 candidate senza bozza (trovate: ${pool.length}): oggi niente Taccuino.`);
  process.exit(0);
}

pool.sort((a, b) => b.c.score - a.c.score);
const batch = pool.slice(0, MAX);
console.log(`📓 Taccuino del giorno — impacchetto ${batch.length} notizie in un solo articolo...\n`);

const list = batch
  .map(({ c }, i) => `${i + 1}. [${(c.players ?? []).join(', ') || c.query}] ${c.title} — fonte: ${c.source} — link: ${c.link}`)
  .join('\n');

const today = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

const prompt = `Sei il redattore di "Italian Next Gen" (news sui giovani calciatori italiani, obiettivo Mondiali 2030). Scrivi il "Taccuino del giorno" del ${today}: un articolo a PILLOLE che raccoglie queste notizie minori.

NOTIZIE (una pillola ciascuna, nell'ordine che ritieni più interessante):
${list}

REGOLE FERREE:
- Ogni pillola: 1-2 frasi CON PAROLE TUE basate SOLO sul titolo. VIETATO inventare dettagli (niente minuti, punteggi o nomi non presenti nei titoli).
- Inizia ogni pillola con il nome in grassetto: **Nome Cognome** (o **il tema**, es. **Under 19**).
- Chiudi ogni pillola con il link markdown alla fonte: [fonte](link).
- Pillole separate da riga vuota. Apertura di 1 frase che introduce la giornata e chiusura di 1 frase, SENZA riferimenti ai "Mondiali 2030" o proiezioni al futuro (sarebbe ripetitivo): resta sui fatti del giorno.
- Poi la versione inglese completa con le stesse regole.

Rispondi SOLO con JSON valido:
{"title":"Taccuino del giorno · ...","titleEn":"Daily Notebook · ...","excerpt":"1-2 frasi","excerptEn":"1-2 sentences","bodyIt":"...","bodyEn":"..."}`;

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
  signal: AbortSignal.timeout(120000),
});
if (!res.ok) { console.error(`Errore API ${res.status}: ${(await res.text()).slice(0, 200)}`); process.exit(1); }

const data = await res.json();
if (data.stop_reason === 'max_tokens') {
  console.error('⚠️  Risposta troncata: riprova con meno notizie, es. npm run digest -- --max=8');
  process.exit(1);
}
const raw = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '');
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) { console.error('Bozza non valida (nessun JSON nella risposta), riprova.'); process.exit(1); }
let draft;
try {
  draft = JSON.parse(jsonMatch[0]);
} catch (e) {
  console.error(`Bozza non valida (JSON malformato: ${e.message}). Riprova, magari con --max=8.`);
  process.exit(1);
}

// Crea la candidata-taccuino
const allPlayers = [...new Set(batch.flatMap(({ c }) => c.players ?? []))];
const allComps = [...new Set(batch.flatMap(({ c }) => c.competitions ?? []))];
const id = `taccuino-${new Date().toISOString().slice(0, 10)}`;
const candidate = {
  id,
  isDigest: true,
  collectedAt: new Date().toISOString(),
  title: draft.title,
  link: '',
  source: `Taccuino da ${batch.length} fonti`,
  players: allPlayers,
  competitions: allComps,
  category: 'taccuino',
  score: 10,
  status: 'pending',
  draft: { ...draft, _fromSource: true },
};
await writeFile(path.join(CANDIDATES, `${id}.json`), JSON.stringify(candidate, null, 2));

// Sposta le notizie usate in pipeline/digested/ (recuperabili)
await mkdir(DIGESTED, { recursive: true });
for (const { f } of batch) {
  await rename(path.join(CANDIDATES, f), path.join(DIGESTED, f));
}

console.log(`✅ Taccuino creato: ${draft.title}`);
console.log(`   ${batch.length} notizie impacchettate (originali in pipeline/digested/).`);
console.log('   Ora: npm run review → leggi e approva.');
