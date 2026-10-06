// AGENTE REDATTORE
// Prende una candidata (titolo + link alla fonte), legge l'articolo originale
// e scrive una BOZZA in italiano e inglese CON PAROLE PROPRIE, riportando solo
// i fatti presenti nella fonte. La bozza precompila la dashboard di review:
// l'ultima parola resta sempre al proprietario.
//
// Richiede una chiave API di Anthropic (https://console.anthropic.com):
// mettila nel file .env come ANTHROPIC_API_KEY=sk-ant-...

const MODEL = 'claude-haiku-4-5-20251001';

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchUrl(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return { finalUrl: res.url, html: await res.text() };
}

const norm = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function looksRelevant(text, candidate) {
  const t = norm(text);
  const surnames = (candidate.players ?? []).map((p) => norm(p).split(/\s+/).pop()).filter((w) => w.length > 2);
  if (surnames.length && !surnames.some((w) => t.includes(w))) return false;
  const words = [...new Set(norm(candidate.title).split(/[^a-z0-9]+/).filter((w) => w.length > 4))];
  if (!words.length) return true;
  const hit = words.filter((w) => t.includes(w)).length;
  return hit >= Math.min(3, Math.ceil(words.length / 2));
}

async function fetchSource(url, candidate = {}) {
  try {
    let page = await fetchUrl(url);
    if (!page) return null;

    // I link di Google News sono pagine di redirect: pesca l'URL dell'editore e seguilo
    if (/news\.google\./.test(page.finalUrl)) {
      const m = page.html.match(/https?:\/\/(?!news\.google|www\.google|accounts\.google|gstatic|googleusercontent)[a-z0-9.-]+\.[a-z]{2,}\/[^"'\\\s<>]{10,}/i);
      if (m) {
        page = await fetchUrl(m[0]);
        if (!page) return null;
      } else {
        return null;
      }
    }

    // Preferisci il corpo dell'articolo (<article> o i paragrafi <p>) ai menu del sito
    const art = page.html.match(/<article[\s\S]*?<\/article>/i)?.[0];
    const paras = [...page.html.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)].map((m) => m[0]).join(' ');
    const text = stripHtml(art && stripHtml(art).length > 300 ? art : (paras.length > 300 ? paras : page.html));
    if (text.length <= 300) return null;
    // Controllo di pertinenza: la pagina letta deve parlare DAVVERO della notizia,
    // altrimenti meglio "fonte non leggibile" (bozza prudente, che publish non pubblica)
    if (!looksRelevant(text, candidate)) return null;
    return text.slice(0, 6000);
  } catch {
    return null;
  }
}

/**
 * @param {object} candidate - la candidata dalla pipeline
 * @param {string} apiKey - chiave API Anthropic
 * @returns {Promise<object|null>} draft {titleEn, excerpt, excerptEn, bodyIt, bodyEn}
 */
export async function writeDraft(candidate, apiKey) {
  const sourceText = await fetchSource(candidate.link, candidate);

  const context = sourceText
    ? `TESTO DELLA FONTE (usa SOLO i fatti presenti qui):\n${sourceText}`
    : `Non è stato possibile leggere la fonte. Scrivi una bozza PRUDENTE basata solo sul titolo, senza inventare dettagli (niente minuti, punteggi o nomi non presenti nel titolo), e chiudi il testo italiano con: "(Bozza dal solo titolo: verificare i dettagli sulla fonte.)"`;

  const prompt = `Sei il redattore di "Italian Next Gen", sito di news sui giovani calciatori italiani (obiettivo: Mondiali 2030). Tono: appassionato ma sobrio, da quotidiano sportivo di qualità.

NOTIZIA: ${candidate.title}
FONTE: ${candidate.source}
GIOCATORI SEGUITI CITATI: ${(candidate.players ?? []).join(', ') || 'nessuno in watchlist'}

${context}

REGOLE FERREE:
- Scrivi un TITOLO ITALIANO nuovo, pulito e giornalistico (max 90 caratteri): NON copiare il titolo della fonte, NON includere codici, maiuscole urlate, emoji, nomi di testate o riferimenti a video/dirette. Solo il fatto sportivo.
- Riscrivi TUTTO con parole tue: mai copiare frasi dalla fonte.
- Solo fatti presenti nella fonte o nel titolo. VIETATO inventare dettagli.
- RISULTATI: chi ha vinto, il punteggio, dove si è giocato (casa/trasferta) e chi ha segnato vanno scritti SOLO se il testo della fonte lo dice in modo esplicito. NON dedurre il vincitore dall'ordine delle squadre nel titolo (i titoli spesso mettono l'Italia per prima anche in trasferta). Un giocatore citato come "protagonista" o "giallazzurro" in un titolo di nazionale è normalmente ITALIANO. Se hai il minimo dubbio sul risultato, non scriverlo.
- Allenatori, club e ruoli dei giocatori: solo se presenti nella fonte, mai a memoria.
- 2-3 paragrafi brevi per lingua, separati da riga vuota.
- NON menzionare i "Mondiali 2030", "obiettivo 2030" o simili proiezioni al futuro: sarebbe ripetitivo e stucchevole. Resta sul fatto di cronaca. (Un riferimento al 2030 è ammesso SOLO nel raro caso in cui la fonte stessa parli esplicitamente della corsa alla nazionale o al Mondiale.)
- VARIA ogni articolo: cambia l'attacco (a volte il fatto, a volte una statistica, a volte una dichiarazione), la struttura e il ritmo. Evita formule ricorrenti e frasi-cliché ("classe 20xx", "predestinato", "gioiello", "obiettivo 2030", "nel giro della nazionale"). Ogni pezzo deve leggersi diverso dagli altri.

Rispondi SOLO con JSON valido:
{"title":"titolo italiano pulito","titleEn":"titolo inglese pulito","excerpt":"sommario italiano di 1-2 frasi","excerptEn":"sommario inglese","bodyIt":"articolo italiano","bodyEn":"articolo inglese"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const draft = JSON.parse(jsonMatch[0]);
    draft._fromSource = Boolean(sourceText);
    return draft;
  } catch {
    return null;
  }
}
