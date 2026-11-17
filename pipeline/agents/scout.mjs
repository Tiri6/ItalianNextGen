// AGENTE SCOUT
// Cerca notizie sul web per una singola query usando Google News RSS
// (nessuna API key richiesta). Ogni query è di fatto un "subagente" di ricerca.

const RSS_BASE = 'https://news.google.com/rss/search';

// Esito della raccolta (letto da pipeline/run.mjs): query riuscite e query FALLITE dopo i tentativi.
// Prima le query fallite (429/503 di Google News, frequenti dai server di GitHub) restituivano [] in silenzio:
// il 15 nov tutte le 180 query hanno dato 503 e nessuno se n'è accorto.
export const scoutStats = { ok: 0, failed: [] };
const RETRY_WAITS_MS = (process.env.SCOUT_RETRY_WAITS ?? '12000,40000,90000').split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

function extract(tag, xml) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

/**
 * @param {string} query - es. "Camarda Milan"
 * @param {{lang?: string, maxAgeHours?: number}} opts
 * @returns {Promise<Array<{title, link, source, pubDate, query}>>}
 */
export async function scout(query, opts = {}) {
  const { lang = 'it', maxAgeHours = 48, days = Math.ceil(maxAgeHours / 24) } = opts;
  const params = new URLSearchParams({
    q: `${query} when:${days}d`,
    hl: lang === 'it' ? 'it' : 'en-GB',
    gl: lang === 'it' ? 'IT' : 'GB',
    ceid: lang === 'it' ? 'IT:it' : 'GB:en',
  });
  const url = `${RSS_BASE}?${params}`;

  let xml;
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_WAITS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'ItalianNextGen/1.0 (news pipeline)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      xml = await res.text();
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_WAITS_MS.length) await sleep(RETRY_WAITS_MS[attempt] * (0.8 + Math.random() * 0.4)); // 429/503: aspetta e riprova
    }
  }
  if (lastErr) {
    console.error(`  [scout] "${query}" fallita: ${lastErr.message}`);
    if (!scoutStats.failed.includes(query)) scoutStats.failed.push(query);
    return [];
  }
  scoutStats.ok++;
  scoutStats.failed = scoutStats.failed.filter((q) => q !== query);

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;

  return items
    .map((item) => ({
      title: extract('title', item),
      link: extract('link', item),
      source: extract('source', item),
      pubDate: extract('pubDate', item),
      query,
    }))
    .filter((it) => it.title && it.link)
    .filter((it) => {
      const t = Date.parse(it.pubDate);
      return Number.isNaN(t) || t >= cutoff;
    });
}
