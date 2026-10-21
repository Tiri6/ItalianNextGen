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
const OFFTOPIC_KW = /galleria|mostra|museo|pittore|artist|cantante|musica|concerto|film|cinema|attore|attrice|moda|fashion|ricetta|cucina|meteo|oroscopo|politica|elezion|processo|tribunale|matrimonio|fidanzat|gossip|reality|tv show|architett|ingegner|convegno|\bsindac/i;

// ALTRI SPORT: SOLO calcio. Questi termini fanno scartare la notizia a prescindere,
// anche se contiene "azzurri" o "nazionale" (che valgono per pallavolo, basket, ecc.).
const OTHER_SPORTS_KW = /volley|pallavolo|basket|pallacanestro|nba|tennis|atp|wta|rugby|nuoto|pallanuoto|atletica|ciclismo|ciclista|giro d'italia|motogp|moto ?gp|formula ?1|\bf1\b|gran premio|scherma|ginnastic|pugilato|\bboxe\b|golf|\bvela\b|canottaggio|\bsci\b|snowboard|hockey|softball|baseball|cricket|padel|beach volley|waterpolo|maratona|kick ?boxing|karate|judo|taekwondo|arti marziali|\bmma\b|\blotta\b|pesistica|sollevamento pesi|triathlon|equitazione|biliardo|bocce|tiro a volo|tiro con l'arco|canoa|pattinaggio|curling|bowling|e-?sport|futsal|calcio a 5|calcio a cinque|beach soccer|enduro|mountain ?bike|\bmtb\b|short[- ]?track|speed ?skating|pattinaggio di velocit|sci alpino|sci di fondo|biathlon|slittino|skeleton|salto con gli sci|federazione ciclistica|federazione (italiana )?(sci|sport invernali|atletica|nuoto|ginnastica|scherma|tiro|motociclismo|canottaggio|pesi)|mondiali di (sci|ciclismo|atletica|nuoto|canottaggio|enduro|motociclismo)|motocross|supercross|rally\b|\bwrc\b/i;

// CALCIO: una notizia senza giocatori della watchlist deve contenere almeno un segnale
// esplicitamente calcistico. Senza, sono sport non calcistici o pezzi generici.
const CALCIO_SIGNAL = /calcio|calciator|calcistic|serie [abc]\b|under ?\d{2}|\bu\d{2}\b|primavera|figc|nazionale di calcio|portier|difensor|centrocampist|attaccant|trequartist|terzin|allenator|\bmister\b|coppa italia|champions|europa league|conference league|euro ?20\d\d|scudetto|\bgol\b|\bgoal\b|rigore|derby|campionato|stadio|club|squadra|\bazzurrin|next ?gen|serie a\b|\bbomber\b|\bcapocannoniere\b|segna|tripletta|doppietta|dilaga|pareggi|amichevol|convoca|esordi|sorteggi|qualificazion|mondiali? u\d{2}|europeo|\bitalia\b|figc|\bct\b|mancini|maldini|\bpareggio\b|\bvittoria\b|\bsconfitta\b/i;
const CLUB_SIGNAL = /\b(napoli|inter|milan|juventus|juve|roma|lazio|atalanta|fiorentina|torino|bologna|genoa|sampdoria|frosinone|parma|como|cagliari|lecce|udinese|verona|hellas|empoli|monza|sassuolo|venezia|pisa|cremonese|palermo|bari|spezia|salernitana|catanzaro|cesena|modena|reggiana|sudtirol|südtirol|carrarese|mantova|padova|avellino|benevento|pescara|virtus entella|juve stabia|arezzo|salisburgo|benfica|psg|barcellona|real madrid|manchester|liverpool|chelsea|arsenal|bayern|borussia)\b/i;
// Vero se il titolo ha un segnale di calcio (parole o club di Serie A/B/C e top europee).
export const isOtherSport = (t) => OTHER_SPORTS_KW.test(t);
export const isCalcioText = (t) => CALCIO_SIGNAL.test(t) || CLUB_SIGNAL.test(t);

// NAZIONALI ITALIANE (maggiore + giovanili): riconosce che la notizia parla di
// una selezione azzurra, anche se non cita un giocatore della watchlist.
const NAZIONALE_CTX = /\bnazionale\b|\bazzurr|italia\s*(under|u)\s?\d{1,2}|\bitalia\s+u\d{1,2}|italian(a|e)?\s*(under|u\d{1,2})|ct azzurr|commissario tecnico|italia\s+(femminile|maggiore)/i;

// FATTO CONCRETO: una vera notizia ha un evento (risultato, convocazione, esordio,
// titolo, gol, sorteggio, amichevole…). Serve a scartare i "pezzi vuoti" senza
// contenuto reale, tipo "I talenti Under-21 del progetto azzurro verso il 2030".
// Il sito copre SOLO il calcio maschile (regola di Marco, 6 ott 2026)
const WOMEN_KW = /femminil|calciatric|\bwomen|\bdonne\b|\bragazze\b|\bazzurre\b|\bgirls?\b/i;

// "azzurri" è anche il soprannome del Napoli (e "nerazzurri", "giallazzurri"… di altri club):
// se il titolo nomina un club e non ha un segnale forte di nazionale, NON è una notizia di nazionale.
const CLUB_RE = /\b(napoli|inter|milan|juventus|juve|roma|lazio|atalanta|fiorentina|torino|bologna|genoa|sampdoria|frosinone|parma|como|cagliari|lecce|udinese|verona|hellas|empoli|monza|sassuolo|venezia|pisa|cremonese|palermo|bari|spezia|salernitana|catanzaro|cesena|modena|reggiana|sudtirol|südtirol|carrarese|mantova|padova|avellino|benevento|pescara|virtus entella|juve stabia)\b/i;
const STRONG_NAZ = /\bnazionale\b|\bitalia\b|\bunder ?\d{2}\b|\bu\d{2}\b|\bct\b|commissario tecnico|\bfigc\b/i;

/**
 * Regole editoriali sul solo titolo, condivise da raccolta (validate) e pubblicazione.
 * @returns {string|null} motivo dello scarto, oppure null se la notizia è in tema
 */
export function editorialReject(title, hasPlayers = false) {
  // Il titolo di Google News finisce con " - Testata" (es. "- road tv italia"): non fa parte della notizia
  const t = String(title ?? '').replace(/\s+[-–|]\s+[^-–|]{2,40}$/, '');
  if (WOMEN_KW.test(t)) return 'calcio femminile';
  if (OTHER_SPORTS_KW.test(t)) return 'altro sport';
  if (OFFTOPIC_KW.test(t)) return 'fuori tema';
  if (!hasPlayers && !isCalcioText(t)) return 'non calcio';
  if (!hasPlayers) {
    const naz = NAZIONALE_CTX.test(t) && FOOTBALL_CTX.test(t) && !(CLUB_RE.test(t) && !STRONG_NAZ.test(t));
    if (!(naz && NEWS_HOOK.test(t))) return 'né talenti seguiti né nazionale';
  }
  return null;
}

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

// Cognomi che sono anche parole comuni o nomi di altre persone note del calcio:
// per questi serve il NOME COMPLETO nel titolo (es. "sia" congiunzione, "Fini"/"finisce",
// "Romano" = Fabrizio Romano, "Arena" = stadi/palazzetti/testate).
const AMBIGUOUS_SURNAMES = new Set(['sia', 'romano', 'arena']);
// Omonimi famosi da escludere: se nel titolo c'è questo nome, il cognome NON è il nostro giocatore
const HOMONYMS = { motta: ['thiago motta'], esposito: ['salvatore esposito', 'sebastiano esposito'] };

// Match a PAROLA INTERA (niente "ansia" → Sia, "crociati" → Croci, "arenacalcio" → Arena)
function hasWord(text, word) {
  const w = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9à-ù])${w}($|[^a-z0-9à-ù])`, 'i').test(text);
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
    // Titolo senza la testata finale (" - TuttoFrosinone.com"): il nome del sito non è un giocatore
    // (punteggiatura → spazio, così "Inter-Kayode" o "Mascardi-day" agganciano comunque il cognome)
    const matchTitle = String(item.title).replace(/\s+[-–|]\s+[^-–|]+$/, '')
      .toLowerCase().replace(/[^a-zà-ù0-9]+/gi, ' ').trim();
    if (!normTitle) continue;
    // Fonte bloccata (data/sources.json): scartata alla raccolta
    if (isBlocked(item.source)) continue;
    if (seen.has(item.link) || seen.has(normTitle)) continue;
    if (seenTitles.has(normTitle)) continue;

    // Scarta subito le notizie palesemente fuori tema (arte, cronaca, gossip, musica…)
    if (OFFTOPIC_KW.test(item.title)) continue;
    // Scarta gli altri sport: qui si parla SOLO di calcio (maschile).
    if (OTHER_SPORTS_KW.test(item.title)) continue;
    if (WOMEN_KW.test(item.title)) continue;

    // Abbina i giocatori: il NOME COMPLETO conta di più; il solo cognome vale
    // solo se il titolo ha anche un contesto calcistico (evita omonimie tipo
    // "Leonardo Casadei" alla mostra d'arte vs Cesare Casadei calciatore).
    const hasFootballCtx = FOOTBALL_CTX.test(item.title);
    const matched = players.filter((p) => {
      if (hasWord(matchTitle, p.name.toLowerCase())) return true; // nome+cognome: sempre valido
      const ln = lastName(p.name).toLowerCase();
      if (AMBIGUOUS_SURNAMES.has(ln)) return false; // cognome ambiguo: serve il nome completo
      if ((HOMONYMS[ln] ?? []).some((h) => h !== p.name.toLowerCase() && hasWord(matchTitle, h))) return false;
      return hasFootballCtx && hasWord(matchTitle, ln); // solo cognome: serve contesto calcio
    });

    // REGOLA CONTENUTO — la notizia deve rientrare in UNO di questi casi:
    //  (a) parla di almeno un talento seguito (watchlist), oppure
    //  (b) parla di una NAZIONALE italiana (maggiore o giovanile) E ha un fatto
    //      concreto (risultato, convocazione, titolo, esordio…).
    // Un pezzo generico senza né giocatori né un evento reale viene scartato:
    // così spariscono i "roundup" vuoti tipo "…progetto azzurro verso il 2030".
    const isNazionale = NAZIONALE_CTX.test(item.title) && hasFootballCtx && !(CLUB_RE.test(item.title) && !STRONG_NAZ.test(item.title));
    const hasHook = NEWS_HOOK.test(item.title);
    if (matched.length === 0 && !(isNazionale && hasHook)) continue;

    // Punteggio di rilevanza
    let score = 0;
    // Il match sul nome completo pesa di più di quello sul solo cognome
    for (const p of matched) {
      score += hasWord(matchTitle, p.name.toLowerCase()) ? 4 : 2;
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
