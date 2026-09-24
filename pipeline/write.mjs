// REDAZIONE AUTOMATICA DELLE BOZZE
// Uso: npm run write
//
// Per ogni candidata in pipeline/candidates/ senza bozza, l'agente redattore
// legge la fonte e scrive testi IT+EN. Poi apri `npm run review`: troverai i
// campi già compilati — leggi, correggi se serve, e approva.
//
// Prerequisito: file .env nella cartella del progetto con dentro
//   ANTHROPIC_API_KEY=sk-ant-XXXX
// (crea la chiave su https://console.anthropic.com → API Keys)

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDraft } from './agents/writer.mjs';
import { isBlocked } from './sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = path.join(ROOT, 'pipeline', 'candidates');

// Leggi la chiave da .env o dall'ambiente
let apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  try {
    const env = await readFile(path.join(ROOT, '.env'), 'utf8');
    apiKey = env.match(/ANTHROPIC_API_KEY\s*=\s*(\S+)/)?.[1];
  } catch {}
}
if (!apiKey) {
  console.error('❌ Manca la chiave API. Crea il file .env nella cartella del progetto con:');
  console.error('   ANTHROPIC_API_KEY=sk-ant-XXXX');
  console.error('   (la crei su https://console.anthropic.com → API Keys)');
  process.exit(1);
}

// Limite di sicurezza: --max=N bozze per esecuzione (default 40).
// Con code enormi, prima seleziona: npm run prune
const maxArg = process.argv.find((a) => a.startsWith('--max='));
const MAX = Math.max(1, Number(maxArg?.split('=')[1]) || 40);

// Riserva per il Taccuino: lascia sempre almeno N notizie senza bozza,
// così il digest ha materia prima ogni giorno (--reserve=0 per disattivare).
const resArg = process.argv.find((a) => a.startsWith('--reserve='));
const RESERVE = Math.max(0, Number(resArg?.split('=')[1] ?? 5));

let files = [];
try { files = (await readdir(CANDIDATES)).filter((f) => f.endsWith('.json')); } catch {}
if (!files.length) {
  console.log('Nessuna candidata in coda. Lancia prima: npm run collect');
  process.exit(0);
}

// Carica e ordina per punteggio: si scrivono prima le notizie più rilevanti
const queue = [];
for (const f of files) {
  try { queue.push({ f, c: JSON.parse(await readFile(path.join(CANDIDATES, f), 'utf8')) }); } catch {}
}
// Mai scrivere bozze da fonti bloccate (data/sources.json)
for (let i = queue.length - 1; i >= 0; i--) if (isBlocked(queue[i].c.source)) queue.splice(i, 1);
queue.sort((a, b) => b.c.score - a.c.score);

const pending = queue.filter((q) => !q.c.draft).length;
// Non scrivere mai le ultime RESERVE candidate: sono la dispensa del Taccuino
const budget = Math.min(MAX, Math.max(0, pending - RESERVE));
console.log(`🖋  Agente redattore — ${pending} candidate senza bozza (ne scrivo ${budget}; riservo ${Math.min(RESERVE, pending)} al Taccuino)`);
if (pending > 100) {
  console.log(`   ⚠️  Coda molto lunga: valuta prima "npm run prune" per tenere solo le migliori.\n`);
} else {
  console.log('');
}
let done = 0, skipped = 0, failed = 0;

for (const { f, c } of queue) {
  if (done >= budget) break;
  const file = path.join(CANDIDATES, f);
  if (c.draft) { skipped++; continue; }

  process.stdout.write(`  ✍️  ${c.title.slice(0, 70)}... `);
  try {
    const draft = await writeDraft(c, apiKey);
    if (draft) {
      c.draft = draft;
      await writeFile(file, JSON.stringify(c, null, 2));
      console.log(draft._fromSource ? 'ok (dalla fonte)' : 'ok (solo titolo — verifica!)');
      done++;
    } else {
      console.log('bozza non valida, salto');
      failed++;
    }
  } catch (err) {
    console.log(`errore: ${err.message.slice(0, 80)}`);
    failed++;
  }
}

console.log(`\n✅ Bozze scritte: ${done} · già pronte: ${skipped} · fallite: ${failed}`);
console.log('   Ora: npm run review → leggi, correggi e approva.');
