// PULIZIA FONTI — applica data/sources.json a ciò che è già nel repository.
//   • articoli pubblicati con fonte BLOCCATA → pipeline/removed-sources/ (recuperabili) + immagine social
//   • candidate in coda con fonte bloccata   → pipeline/rejected/
// Uso: node pipeline/pulisci-fonti.mjs [--dry]   (--dry = solo elenco, non sposta nulla)
// Gira anche nei workflow "Redazione del mattino" e "Pubblica", quindi resta pulito da solo.
import { readdir, readFile, rename, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceClass } from './sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'src', 'content', 'news');
const SOCIAL = path.join(ROOT, 'public', 'social');
const CANDS = path.join(ROOT, 'pipeline', 'candidates');
const REJECTED = path.join(ROOT, 'pipeline', 'rejected');
const REMOVED = path.join(ROOT, 'pipeline', 'removed-sources');
const DRY = process.argv.includes('--dry');

const exists = (p) => access(p).then(() => true, () => false);
async function move(src, destDir) {
  const dest = path.join(destDir, path.basename(src));
  if (DRY || !(await exists(src)) || (await exists(dest))) return false;
  await mkdir(destDir, { recursive: true });
  await rename(src, dest);
  return true;
}

let arts = 0, cands = 0;
const bySource = {};
for (const f of (await readdir(NEWS).catch(() => [])).filter((x) => x.endsWith('.md'))) {
  const fm = (await readFile(path.join(NEWS, f), 'utf8')).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const src = fm.match(/^source:\s*"?(.*?)"?\s*$/m)?.[1]?.trim();
  if (!src || sourceClass(src) !== 'blocked') continue;
  bySource[src] = (bySource[src] ?? 0) + 1;
  if (DRY) { arts++; continue; }
  if (await move(path.join(NEWS, f), REMOVED)) {
    arts++;
    await move(path.join(SOCIAL, f.replace(/\.md$/, '.jpg')), path.join(REMOVED, 'social'));
  }
}
for (const f of (await readdir(CANDS).catch(() => [])).filter((x) => x.endsWith('.json'))) {
  try {
    const c = JSON.parse(await readFile(path.join(CANDS, f), 'utf8'));
    if (c.isDigest || sourceClass(c.source) !== 'blocked') continue;
    if (DRY || (await move(path.join(CANDS, f), REJECTED))) cands++;
  } catch {}
}
console.log(`${DRY ? '[anteprima] ' : ''}Pulizia fonti: ${arts} articoli${DRY ? ' da spostare' : ' spostati in pipeline/removed-sources/'}, ${cands} candidate ${DRY ? 'da scartare' : 'scartate'}.`);
for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) console.log(`   ${n} × ${s}`);
