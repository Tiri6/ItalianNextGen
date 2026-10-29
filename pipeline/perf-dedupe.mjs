// Una partita = una sola prestazione per giocatore.
// Lo stesso incontro può arrivare da più articoli (e con date diverse: quella del feed, non della partita):
// si unisce tutto in UNA voce. Regola: stesso giocatore, date a meno di 4 giorni di distanza e
// stesso avversario (o stesso risultato). Usata da pipeline/performances.mjs (scrittura) e dalle pagine (lettura).

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const dayMs = (d) => Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
const richness = (p) =>
  (p.result ? 3 : 0) + (p.goals != null ? 2 : 0) + (p.assists != null ? 1 : 0) + (p.minutes != null ? 1 : 0) +
  (p.rating != null ? 1 : 0) + (p.opponent ? 1 : 0) + (/redazione/i.test(p.source ?? '') ? 2 : 0);

function sameMatch(a, b) {
  if (a.player !== b.player) return false;
  if (Math.abs(dayMs(a.date) - dayMs(b.date)) > 4 * 86400000) return false;
  const oa = norm(a.opponent), ob = norm(b.opponent);
  if (oa && ob && (oa === ob || oa.includes(ob) || ob.includes(oa))) return true;
  const ra = norm(a.result), rb = norm(b.result);
  return !!ra && ra === rb;
}

export function dedupePerformances(list) {
  const out = [];
  const sorted = [...list].sort((a, b) => richness(b) - richness(a)); // la voce più completa fa da base
  for (const p of sorted) {
    const hit = out.find((q) => sameMatch(q, p));
    if (!hit) { out.push({ ...p }); continue; }
    for (const k of ['club', 'opponent', 'competition', 'result', 'note', 'noteEn', 'source', 'sourceUrl']) if (!hit[k] && p[k]) hit[k] = p[k];
    for (const k of ['minutes', 'rating']) if (hit[k] == null && p[k] != null) hit[k] = p[k];
    for (const k of ['goals', 'assists']) if (p[k] != null) hit[k] = Math.max(hit[k] ?? 0, p[k]);
    if (p.date < hit.date) hit.date = p.date; // la data più vicina alla partita
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// Una prestazione senza risultato non si mostra: "Pisilli contro il Cagliari" senza punteggio non dice niente.
export const hasResult = (p) => /\d+\s*[-–:]\s*\d+/.test(String(p.result ?? ''));

// Livello della partita: Serie A / campionati top = 0, Serie B = 1, il resto (C, Primavera, U23, giovanili…) = 2.
function tier(p) {
  const t = norm(`${p.competition} ${p.club}`);
  if (/primavera|u23|u21|u20|u19|u18|u17|u16|u15|youth|campionato$/.test(t)) return 2;
  if (/serieb|seriec|lega ?pro/.test(t)) return /serieb/.test(t) ? 1 : 2;
  return 0;
}

// Elenco da mostrare: una voce per partita, solo con risultato; a parità di freschezza vengono prima i livelli alti
// (rank = giorni dalla partita + 1 per la B + 2 per C/Primavera/giovanili, così un gol in Serie A di ieri batte un 3-0 di Primavera di oggi).
export function publishablePerformances(list, now = Date.now()) {
  const rank = (p) => Math.max(0, (now - dayMs(p.date)) / 86400000 - 0.5) + tier(p);
  return dedupePerformances(list.filter(hasResult)).sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date));
}
