// Trova il risultato di una partita (es. "2-0") nei titoli già raccolti (candidate + articoli del sito),
// cercando un titolo che nomini entrambe le squadre accanto a un punteggio ("Genoa-Juve 2-0").
// Il punteggio è letto nell'ordine del titolo: se la squadra del giocatore compare prima, resta così, altrimenti si inverte.
// Restituisce null se non c'è una corrispondenza chiara: meglio nessun risultato che un risultato sbagliato.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ALIAS = {
  juventus: ['juventus', 'juve'], inter: ['inter', 'internazionale'], 'ac milan': ['milan'], milan: ['milan'],
  napoli: ['napoli'], 'as roma': ['roma'], roma: ['roma'], lazio: ['lazio'], atalanta: ['atalanta'], fiorentina: ['fiorentina', 'viola'],
};
function names(team) {
  const t = norm(team).replace(/\b(fc|ac|as|ssc|us|calcio|1907|u23|primavera|under \d+)\b/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  return ALIAS[t] ?? [t];
}
const posOf = (text, team) => {
  const ps = names(team).map((n) => text.search(new RegExp(`(^|[^a-z])${n}($|[^a-z])`))).filter((i) => i >= 0);
  return ps.length ? Math.min(...ps) : -1;
};

export async function loadTitles(root) {
  const out = [];
  for (const dir of ['pipeline/candidates', 'pipeline/approved']) {
    try {
      for (const f of (await readdir(path.join(root, dir))).filter((x) => x.endsWith('.json'))) {
        try { out.push(String(JSON.parse(await readFile(path.join(root, dir, f), 'utf8')).title ?? '')); } catch {}
      }
    } catch {}
  }
  try {
    for (const f of (await readdir(path.join(root, 'src/content/news'))).filter((x) => x.endsWith('.md'))) {
      const t = await readFile(path.join(root, 'src/content/news', f), 'utf8');
      const fm = t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
      out.push((fm.match(/^title:\s*"(.*)"/m)?.[1] ?? '') + ' ' + (fm.match(/^excerpt:\s*"(.*)"/m)?.[1] ?? ''));
    }
  } catch {}
  return out;
}

export function findResult(titles, club, opponent) {
  if (!club || !opponent) return null;
  const found = new Map();
  for (const raw of titles) {
    const text = norm(raw);
    const pc = posOf(text, club), po = posOf(text, opponent);
    if (pc < 0 || po < 0) continue;
    const m = [...text.matchAll(/(?<![\d:]|\d[.,])(\d{1,2})\s*[-–]\s*(\d{1,2})(?![\d:]|[.,]\d)/g)].map((x) => [Number(x[1]), Number(x[2])]).filter(([a, b]) => a <= 12 && b <= 12);
    if (!m.length) continue;
    const [a, b] = m[0];
    const res = pc < po ? `${a}-${b}` : `${b}-${a}`;
    found.set(res, (found.get(res) ?? 0) + 1);
  }
  if (found.size !== 1) return null; // nessun titolo, o titoli in disaccordo → non si indovina
  return [...found.keys()][0];
}
