// ORCHESTRATORE DELLA PIPELINE
// Uso: npm run collect
//
// Flusso:  watchlist → [agenti scout in parallelo] → agente validatore → candidate
// Le candidate finiscono in pipeline/candidates/ e attendono l'approvazione
// del proprietario tramite la dashboard (npm run review).

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scout } from './agents/scout.mjs';
import { validate } from './agents/validator.mjs';
import { buildQueries } from './queries.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES_DIR = path.join(ROOT, 'pipeline', 'candidates');
const STATE_FILE = path.join(ROOT, 'pipeline', 'state', 'seen.json');

async function loadJSON(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  // --days=N allarga la finestra di ricerca (default 2 giorni).
  // Utile al primo avvio o dopo una pausa: npm run collect -- --days=30
  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const days = Math.max(1, Number(daysArg?.split('=')[1]) || 2);

  console.log(`🇮🇹 Italian Next Gen — pipeline di raccolta notizie (ultimi ${days} giorni)\n`);

  const { players, extraQueries } = await loadJSON(path.join(ROOT, 'data', 'players.json'), { players: [], extraQueries: [] });
  const seenArr = await loadJSON(STATE_FILE, []);
  const seen = new Set(seenArr);

  // Costruisci le query: una per giocatore + query generali
  // Le query dei giocatori sono sempre allineate al club attuale (vedi pipeline/queries.mjs)
  const built = await buildQueries(players);
  if (built.changes.length) console.log(`🔎 Query corrette automaticamente per ${built.changes.length} giocatori: ${built.changes.map((c) => c.name).join(', ')}`);
  const queries = [
    ...built.queries,
    ...(extraQueries ?? []),
  ];
  console.log(`Agenti scout da lanciare: ${queries.length}`);

  // Lancia gli scout in batch da 5 per non martellare le fonti
  const rawItems = [];
  for (let i = 0; i < queries.length; i += 5) {
    const batch = queries.slice(i, i + 5);
    const results = await Promise.all(batch.map((q) => scout(q, { days, maxAgeHours: days * 24 })));
    for (const [j, items] of results.entries()) {
      console.log(`  ✓ scout "${batch[j]}" → ${items.length} item`);
      rawItems.push(...items);
    }
  }
  console.log(`\nItem grezzi raccolti: ${rawItems.length}`);

  // Validazione
  const candidates = validate(rawItems, players, seen);
  console.log(`Candidate valide dopo il validatore: ${candidates.length}`);

  // Salva le candidate e aggiorna il registro dei "visti"
  await mkdir(CANDIDATES_DIR, { recursive: true });
  await mkdir(path.dirname(STATE_FILE), { recursive: true });

  for (const c of candidates) {
    await writeFile(
      path.join(CANDIDATES_DIR, `${c.id}.json`),
      JSON.stringify(c, null, 2)
    );
    seen.add(c.link);
  }
  // Registra anche i link scartati per non rivalutarli domani
  for (const item of rawItems) seen.add(item.link);
  await writeFile(STATE_FILE, JSON.stringify([...seen].slice(-5000), null, 2));

  const pending = (await readdir(CANDIDATES_DIR)).filter((f) => f.endsWith('.json')).length;
  console.log(`\n✅ Fatto. Candidate in attesa di review: ${pending}`);
  console.log('   Lancia `npm run review` per approvarle o rifiutarle.');
}

main().catch((err) => {
  console.error('Errore pipeline:', err);
  process.exit(1);
});
