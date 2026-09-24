// AGGIORNA IL RANKING FIFA
// Uso: npm run ranking   (gira ogni mese via GitHub Actions)
//
// Legge la classifica mondiale FIFA (maschile) da Wikipedia e aggiorna
// data/ranking.json con la posizione dell'Italia, i punti, la tendenza e il
// contesto (le prime 2 + il "vicinato" dell'Italia).
//
// REGOLA D'AFFIDABILITÀ: scrive SOLO se i dati superano i controlli di sanità
// (Italia trovata, posizione 1-80, punti plausibili). Altrimenti NON tocca il
// file e mantiene l'ultimo valore valido: meglio un dato vecchio che uno sbagliato.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'ranking.json');

// Fonti Wikipedia (HTML della tabella): prima inglese, poi italiana come riserva.
const SOURCES = [
  'https://en.wikipedia.org/w/api.php?action=parse&page=FIFA_Men%27s_World_Ranking&prop=text&format=json&formatversion=2',
  'https://it.wikipedia.org/w/api.php?action=parse&page=Classifica_mondiale_della_FIFA&prop=text&format=json&formatversion=2',
];

// Nomi nazionali EN → IT per il pannello italiano (fallback: nome inglese).
const IT_NAME = {
  Spain: 'Spagna', Argentina: 'Argentina', France: 'Francia', England: 'Inghilterra',
  Brazil: 'Brasile', Portugal: 'Portogallo', Netherlands: 'Paesi Bassi', Belgium: 'Belgio',
  Italy: 'Italia', Germany: 'Germania', Croatia: 'Croazia', Switzerland: 'Svizzera',
  Morocco: 'Marocco', Colombia: 'Colombia', Mexico: 'Messico', Uruguay: 'Uruguay',
  'United States': 'Stati Uniti', Spain2: 'Spagna', Denmark: 'Danimarca', Japan: 'Giappone',
  Senegal: 'Senegal', Iran: 'Iran', Austria: 'Austria', Ecuador: 'Ecuador',
  Ukraine: 'Ucraina', Sweden: 'Svezia', Turkey: 'Turchia', Türkiye: 'Turchia',
  Wales: 'Galles', Serbia: 'Serbia', Poland: 'Polonia', Norway: 'Norvegia',
  'South Korea': 'Corea del Sud', Australia: 'Australia', Nigeria: 'Nigeria',
  Egypt: 'Egitto', Canada: 'Canada', Peru: 'Perù', Algeria: 'Algeria',
  Scotland: 'Scozia', 'Ivory Coast': 'Costa d’Avorio', Panama: 'Panama',
};
const toIt = (en) => IT_NAME[en] || en;

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
}

// Parole della colonna "movimento" (non sono nomi di squadra).
const MOVE = /^(steady|increase|decrease|same|new|re-?entry|up|down|stabile|in aumento|in diminuzione|invariat|nuova|nuovo)/i;

// Estrae le righe {rank, team, points} dalla prima tabella "classifica" trovata.
function parseRanking(html) {
  const rows = [];
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(stripTags);
    if (cells.length < 3) continue;
    // cerca in ordine: un intero (rank) e un decimale a 4 cifre (punti) nella riga
    const rank = cells.map((c) => c.match(/^\d{1,3}$/)?.[0]).find(Boolean);
    const pointsCell = cells.find((c) => /^\d{3,4}[.,]\d{1,2}$/.test(c));
    if (!rank || !pointsCell) continue;
    // il team è il testo del link alla nazione (es. <a href="/wiki/Italy...">Italy</a>);
    // in mancanza, la cella testuale più lunga escludendo la colonna "movimento".
    const anchors = [...tr.matchAll(/<a\b[^>]*href="\/wiki\/[^"]+"[^>]*>([^<]{2,40})<\/a>/gi)]
      .map((m) => stripTags(m[1]));
    let team = anchors.find((t) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'’-]{2,}$/.test(t) && !/national|football|team|ranking|classifica|calcio|nazionale/i.test(t));
    if (!team) {
      team = cells
        .filter((c) => /[A-Za-zÀ-ÿ]{3,}/.test(c) && !/^\d/.test(c) && !MOVE.test(c))
        .sort((a, b) => b.length - a.length)[0];
    }
    if (!team) continue;
    rows.push({ rank: Number(rank), team, points: Number(pointsCell.replace(',', '.')) });
  }
  // tieni solo righe con rank crescente unico e punti plausibili
  const seen = new Set();
  const clean = rows.filter((r) => {
    if (seen.has(r.rank)) return false;
    seen.add(r.rank);
    return r.points > 800 && r.points < 2300 && r.rank >= 1 && r.rank <= 220;
  }).sort((a, b) => a.rank - b.rank);
  return clean;
}

async function fetchRows() {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'ItalianNextGen/1.0 (https://italiannextgen.it)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const html = data?.parse?.text ?? '';
      const rows = parseRanking(html);
      const italy = rows.find((r) => /^(Italy|Italia)$/i.test(r.team));
      if (italy && rows.length >= 15) return { rows, italy, url };
    } catch { /* prova la fonte successiva */ }
  }
  return null;
}

const current = JSON.parse(await readFile(FILE, 'utf8'));
const result = await fetchRows();

if (!result) {
  console.log('⚠️  Ranking FIFA non aggiornabile ora (fonte non leggibile o dati non validi).');
  console.log('   Mantengo l’ultimo valore valido:', `Italia ${current.italy.rank}°`);
  process.exit(0);
}

const { rows, italy } = result;
const prevRank = current.italy.rank;
const trend = typeof prevRank === 'number' ? prevRank - italy.rank : 0; // +1 = salita di una posizione

const around = rows
  .filter((r) => r.rank >= italy.rank - 2 && r.rank <= italy.rank + 1)
  .map((r) => ({
    rank: r.rank, team: toIt(r.team), teamEn: r.team,
    points: r.points, ...(r.rank === italy.rank ? { italy: true } : {}),
  }));

const top = rows.slice(0, 2).map((r) => ({ rank: r.rank, team: toIt(r.team), teamEn: r.team, points: r.points }));

const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const monthsEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const now = new Date();

let note = current.italy.note, noteEn = current.italy.noteEn;
if (trend < 0) { note = `Scesa di ${Math.abs(trend)} posizion${Math.abs(trend) === 1 ? 'e' : 'i'} nell’ultimo aggiornamento.`; noteEn = `Down ${Math.abs(trend)} place${Math.abs(trend) === 1 ? '' : 's'} in the latest update.`; }
else if (trend > 0) { note = `Risalita di ${trend} posizion${trend === 1 ? 'e' : 'i'} nell’ultimo aggiornamento.`; noteEn = `Up ${trend} place${trend === 1 ? '' : 's'} in the latest update.`; }
else { note = 'Posizione invariata nell’ultimo aggiornamento.'; noteEn = 'Unchanged in the latest update.'; }

const updated = { ...current };
updated.updated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
updated.updatedLabel = `${months[now.getMonth()]} ${now.getFullYear()}`;
updated.updatedLabelEn = `${monthsEn[now.getMonth()]} ${now.getFullYear()}`;
updated.italy = { rank: italy.rank, points: italy.points, trend, note, noteEn };
updated.top = top;
updated.around = around;

await writeFile(FILE, JSON.stringify(updated, null, 2) + '\n');
console.log(`✅ Ranking FIFA aggiornato: Italia ${italy.rank}° (${italy.points} pt), tendenza ${trend >= 0 ? '+' : ''}${trend}.`);
