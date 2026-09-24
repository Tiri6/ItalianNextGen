import { isBlocked } from '../sources.mjs';
// AGENTE VALIDATORE
// Riceve gli item grezzi dagli scout e:
//  1. scarta duplicati (stesso link o titolo quasi identico)
//  2. scarta ciò che è già stato visto in esecuzioni precedenti
//  3. abbina ogni notizia ai giocatori della watchlist
//  4. assegna un punteggio di rilevanza e una categoria
//  5. produce le "candidate" da sottoporre all'approvazione del proprietario

const MERCATO_KW = /mercato|trasferim|cessione|rinnovo|clausola|offerta|prestito|acquisto|transfer|loan|bid|signing|contract/i;

// Contesto calcistico: se un titolo contiene una di queste parole, il match sul
// solo cognome è affidabile. Altrimenti serve il nome completo.
const FOOTBALL_CTX = /calcio|calciatore|gol|goal|assist|partita|match|gara|serie [abc]|primavera|under|nazionale|azzurr|mercato|trasferim|prestito|club|allenatore|mister|panchina|esordio|convocat|derby|campionato|coppa|stadio|attaccante|difensore|centrocampista|portiere|terzino|trequartista|squadra|next ?gen|youth|academy|figc|uefa|fifa/i;

// Fuori tema palese: arte, cronaca, gossip, musica, ecc. Scarta a prescindere.
const OFFTOPIC_KW = /galleria|mostra|museo|pittore|artist|cantante|musica|concerto|film|cinema|attore|attrice|moda|fashion|ricetta|cucina|meteo|oroscopo|politica|elezion|processo|tribunale|matrimonio|fidanzat|gossip|reality|tv show/i;

// ALTRI SPORT: SOLO calcio. Questi termini fanno scartare la notizia a prescindere,
// anche se contiene "azzurri" o "nazionale" (che valgono per pallavolo, basket, ecc.).
const OTHER_SPORTS_KW = /volley|pallavolo|basket|pallacanestro|nba|tennis|atp|wta|rugby|nuoto|pallanuoto|atletica|ciclismo|ciclista|giro d'italia|motogp|moto ?gp|formula ?1|\bf1\b|gran premio|scherma|ginnastic|pugilato|\bboxe\b|golf|vela|canottaggio|\bsci\b|snowboard|hockey|softball|baseball|cricket|padel|beach volley|waterpolo|maratona/i;

// NAZIONALI ITALIANE (maggiore + giovanili): riconosce che la notizia parla di
// una selezione azzurra, anche se non cita un giocatore della watchlist.
const NAZIONALE_CTX = /\bnazionale\b|azzurr|italia\s*(under|u)\s?\d{1,2}|\bitalia\s+u\d{1,2}|italian(a|e)?\s*(under|u\d{1,2})|ct azzurr|commissario tecnico|italia\s+(femminile|maggiore)/i;

// FATTO CONCRETO: una vera notizia ha un evento (risultato, convocazione, esordio,
// titolo, gol, sorteggio, amichevole…). Serve a scartare i "pezzi vuoti" senza
// contenuto reale, tipo "I talenti Under-21 del progetto azzurro verso il 2030".
const NEWS_HOOK = /\d\s*[-–]\s*\d|convoca|esordi|debutt|campion|vittori|sconfitt|paregg|finale|semifinal|quarti|qualificazion|amichevol|gol\b|goal|doppiett|triplett|raduno|sorteggi|eliminat|trionf|\bko\b|batte|supera|cede|rimonta|titolare|espuls|infortun|conferenza|ritiro|stage|nuovo ct|panchina/i;

// Mappa parole chiave → id competizione (vedi data/competitions.json)
const COMP_MAP = [
  [/under ?21|u21/i, 'euro-u21-2027'],
  [/under ?19|u19/i, 'euro-u19-2026'],
  [/under ?17|u17/i, 'euro-u17'],
  [/under ?20|u20/i, 'mondiale-u20-2027'],
  [/under ?1[56]|u1[56]|giovanissimi/i, 'under-15-16'],
  [/mondiale|mondiali|2030/i, 'road-to-2030'],
];
const PERFORMANCE_KW = /gol|goal|assist|doppietta|tripletta|pagelle|prestazion|titolare|esordio|debutto|match|partita|vittoria|segna|decisivo|man of the match|brace|hat-?trick/i;

function normalizeTitle(t) {
  return t.toLowerCase().replace(/[^a-zà-ù0-9 ]/gi, '').replace(/\s+/g, ' ').trim();
}

function lastName(fullName) {
  const parts = fullName.split(' ');
  return parts[parts.length - 1];
}

/**
 * @param {Array} items - output degli scout
 * @param {Array} players - watchlist da data/players.json
 * @param {Set<string>} seen - link/titoli già processati
 */
export function validate(items, players, seen) {
  const out = [];
  const seenTitles = new Set();

  for (const item of items) {
    const normTitle = normalizeTitle(item.title);
    if (!normTitle) continue;
    // Fonte bloccata (data/sources.json): scartata alla raccolta
    if (isBlocked(item.source)) continue;
    if (seen.has(item.link) || seen.has(normTitle)) continue;
    if (seenTitles.has(normTitle)) continue;

    // Scarta subito le notizie palesemente fuori tema (arte, cronaca, gossip, musica…)
    if (OFFTOPIC_KW.test(item.title)) continue;
    // Scarta gli altri sport: qui si parla SOLO di calcio.
    if (OTHER_SPORTS_KW.test(item.title)) continue;

    // Abbina i giocatori: il NOME COMPLETO conta di più; il solo cognome vale
    // solo se il titolo ha anche un contesto calcistico (evita omonimie tipo
    // "Leonardo Casadei" alla mostra d'arte vs Cesare Casadei calciatore).
    const hasFootballCtx = FOOTBALL_CTX.test(item.title);
    const matched = players.filter((p) => {
      if (normTitle.includes(p.name.toLowerCase())) return true; // nome+cognome: sempre valido
      const ln = lastName(p.name).toLowerCase();
      return hasFootballCtx && normTitle.includes(ln); // solo cognome: serve contesto calcio
    });

    // REGOLA CONTENUTO — la notizia deve rientrare in UNO di questi casi:
    //  (a) parla di almeno un talento seguito (watchlist), oppure
    //  (b) parla di una NAZIONALE italiana (maggiore o giovanile) E ha un fatto
    //      concreto (risultato, convocazione, titolo, esordio…).
    // Un pezzo generico senza né giocatori né un evento reale viene scartato:
    // così spariscono i "roundup" vuoti tipo "…progetto azzurro verso il 2030".
    const isNazionale = NAZIONALE_CTX.test(item.title) && hasFootballCtx;
    const hasHook = NEWS_HOOK.test(item.title);
    if (matched.length === 0 && !(isNazionale && hasHook)) continue;

    // Punteggio di rilevanza
    let score = 0;
    // Il match sul nome completo pesa di più di quello sul solo cognome
    for (const p of matched) {
      score += normTitle.includes(p.name.toLowerCase()) ? 4 : 2;
    }
    // Notizia di nazionale senza giocatori in watchlist: comunque rilevante
    if (matched.length === 0 && isNazionale) score += 4;
    if (PERFORMANCE_KW.test(item.title)) score += 2;
    if (MERCATO_KW.test(item.title)) score += 2;
    if (/under ?\d{2}|u\d{2}|nazionale|azzurr|primavera|giovanil|next ?gen|futuro|allievi|giovanissimi|youth league|academy|serie [bc]/i.test(item.title)) score += 2;
    if (/italian|italy|italia/i.test(item.title)) score += 1;

    // Sotto soglia: scarta (rumore). Alziamo la soglia a 4: un solo aggancio
    // debole (cognome senza contesto) non basta più.
    if (score < 4) continue;

    // Classificazione
    let category = 'news';
    if (MERCATO_KW.test(item.title)) category = 'mercato';
    else if (PERFORMANCE_KW.test(item.title)) category = 'performance';

    // Suggerisci le competizioni collegate
    const competitions = COMP_MAP.filter(([re]) => re.test(item.title)).map(([, id]) => id);

    seenTitles.add(normTitle);
    out.push({
      competitions,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      collectedAt: new Date().toISOString(),
      title: item.title,
      link: item.link,
      source: item.source || new URL(item.link).hostname,
      pubDate: item.pubDate,
      query: item.query,
      players: matched.map((p) => p.name),
      category,
      score,
      status: 'pending',
    });
  }

  return out.sort((a, b) => b.score - a.score);
}
