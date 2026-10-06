// PULIZIA DUPLICATI
// Uso: node pipeline/dedupe.mjs            (anteprima: mostra cosa rimuoverebbe)
//      node pipeline/dedupe.mjs --apply    (rimuove davvero)
//
// Trova gli articoli pubblicati che raccontano la stessa notizia (stessa storia
// ripresa da testate diverse) e tiene solo il primo, spostando gli altri in
// pipeline/removed-duplicates/ (recuperabili). Due articoli sono considerati
// duplicati se: pubblicati a max 3 giorni di distanza, stessa categoria o
// stessi giocatori, e titoli molto simili (60%+ di parole significative in comune).
// In più: due articoli con lo STESSO link alla fonte sono sempre doppioni,
// a qualunque distanza di giorni (resta il primo uscito).

import { readFile, readdir, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'src', 'content', 'news');
const TRASH = path.join(ROOT, 'pipeline', 'removed-duplicates');
const APPLY = process.argv.includes('--apply');

const STOP = new Set(['il','lo','la','i','gli','le','un','uno','una','di','a','da','in','con','su','per','tra','fra','del','della','dei','delle','dello','al','alla','ai','alle','allo','e','ed','che','non','si','è','sono','ha','hanno','più','dopo','tra','ecco','cosa','come','anche','ma','nel','nella','sul','sulla','the','of','and','to','in','for','a','an']);

function words(title) {
  return new Set(
    title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function similarity(a, b) {
  const inter = [...a].filter((w) => b.has(w)).length;
  const min = Math.min(a.size, b.size) || 1;
  return inter / min;
}

const files = (await readdir(NEWS)).filter((f) => f.endsWith('.md'));
const arts = [];
for (const f of files) {
  const t = await readFile(path.join(NEWS, f), 'utf8');
  const fm = t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const title = fm.match(/^title:\s*"(.*)"/m)?.[1] ?? f;
  const date = fm.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1] ?? '2000-01-01';
  const cat = fm.match(/^category:\s*["']?(\w+)/m)?.[1] ?? 'news';
  const players = [...fm.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const src = fm.match(/^sourceUrl:\s*"(.*)"/m)?.[1] ?? '';
  arts.push({ f, title, date, cat, src, w: words(title), players: new Set(players) });
}

// Ordina per data: in un gruppo di duplicati sopravvive il più vecchio (il primo uscito)
arts.sort((a, b) => a.date.localeCompare(b.date) || a.f.localeCompare(b.f));

const toRemove = [];
for (let i = 0; i < arts.length; i++) {
  if (toRemove.some((r) => r.f === arts[i].f)) continue;
  for (let j = i + 1; j < arts.length; j++) {
    const A = arts[i], B = arts[j];
    if (toRemove.some((r) => r.f === B.f)) continue;
    if (A.cat === 'taccuino' || B.cat === 'taccuino') continue; // i taccuini non si toccano
    if (A.src && A.src === B.src) { // stessa fonte = stessa notizia, a qualunque distanza
      toRemove.push({ f: B.f, dupOf: A.f, sim: 'stessa fonte', title: B.title });
      continue;
    }
    const daysDiff = Math.abs((new Date(A.date) - new Date(B.date)) / 86400000);
    if (daysDiff > 3) continue;
    const sim = similarity(A.w, B.w);
    const samePlayers = [...A.players].some((p) => B.players.has(p));
    if (sim >= 0.6 && (A.cat === B.cat || samePlayers)) {
      toRemove.push({ f: B.f, dupOf: A.f, sim: sim.toFixed(2), title: B.title });
    }
  }
}

if (!toRemove.length) {
  console.log('✅ Nessun duplicato trovato tra i', arts.length, 'articoli pubblicati.');
  process.exit(0);
}

console.log(`🧹 Duplicati individuati: ${toRemove.length} (su ${arts.length} articoli)\n`);
for (const r of toRemove) {
  console.log(`  ✗ ${r.f}`);
  console.log(`      doppione di: ${r.dupOf} (somiglianza ${r.sim})`);
}

if (!APPLY) {
  console.log('\n👉 Anteprima. Per rimuoverli davvero: node pipeline/dedupe.mjs --apply');
} else {
  await mkdir(TRASH, { recursive: true });
  for (const r of toRemove) {
    await rename(path.join(NEWS, r.f), path.join(TRASH, r.f));
  }
  console.log(`\n✅ Rimossi ${toRemove.length} duplicati (recuperabili in pipeline/removed-duplicates/).`);
}
