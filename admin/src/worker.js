// Cockpit editoriale di Marco — Worker Cloudflare.
//
// Cosa fa:
//   • serve l'app (cartella public/) e un piccolo set di API sotto /api/*
//   • parla con GitHub usando un token tenuto SEGRETO sul server (il telefono non lo vede mai)
//   • accetta solo richieste che hanno passato il login di Cloudflare Access (verifica del JWT firmato)
//
// API:
//   GET  /api/state      → coda di revisione + decisioni di oggi (+ ultima pubblicazione)
//   PUT  /api/decisions  → salva le scelte (commit su data/editorial-decisions.json)
//   POST /api/publish    → lancia il workflow "📣 Pubblica articoli"
//   GET  /api/runs       → stato dell'ultima pubblicazione

const QUEUE_PATH = 'data/review-queue.json';
const DECISIONS_PATH = 'data/editorial-decisions.json';
const PUBLISH_WORKFLOW = 'publish.yml';
const ID_RE = /^[A-Za-z0-9_-]{3,60}$/;
const MAX_ITEMS = 300;

// ---------------------------------------------------------------- utilità
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

const romeDay = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d);

const b64urlToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64urlToText = (s) => new TextDecoder().decode(b64urlToBytes(s));
const utf8ToB64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

// ---------------------------------------------------------------- login (Cloudflare Access)
let certsCache = { at: 0, domain: '', jwks: null };

async function getCerts(teamDomain, force = false) {
  if (!force && certsCache.jwks && certsCache.domain === teamDomain && Date.now() - certsCache.at < 3600_000) return certsCache.jwks;
  const r = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certificati Access non raggiungibili (${r.status})`);
  certsCache = { at: Date.now(), domain: teamDomain, jwks: await r.json() };
  return certsCache.jwks;
}

/** Ritorna l'email dell'utente autenticato oppure null. Fallisce SEMPRE chiuso (config mancante = nessun accesso). */
export async function verifyAccess(request, env) {
  try {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    const team = String(env.TEAM_DOMAIN ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!token || !team || !env.POLICY_AUD || !env.ALLOWED_EMAIL) return null;
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return null;
    const header = JSON.parse(b64urlToText(h));
    if (header.alg !== 'RS256') return null;

    let jwks = await getCerts(team);
    let jwk = jwks.keys?.find((k) => k.kid === header.kid);
    if (!jwk) { jwks = await getCerts(team, true); jwk = jwks.keys?.find((k) => k.kid === header.kid); }
    if (!jwk) return null;

    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;

    const c = JSON.parse(b64urlToText(p));
    const now = Math.floor(Date.now() / 1000);
    if (typeof c.exp !== 'number' || c.exp < now) return null;
    if (typeof c.nbf === 'number' && c.nbf > now + 30) return null;
    if (c.iss !== `https://${team}`) return null;
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(env.POLICY_AUD)) return null;
    const email = String(c.email ?? '').toLowerCase();
    if (!email || email !== String(env.ALLOWED_EMAIL).toLowerCase()) return null;
    return email;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- GitHub
function ghFetch(env, path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'italian-next-gen-cockpit',
      ...(init.headers ?? {}),
    },
  });
}
const repoOf = (env) => String(env.GITHUB_REPO || 'Tiri6/ItalianNextGen');
const branchOf = (env) => String(env.GITHUB_BRANCH || 'main');

/** Legge un file di testo dal repo. Ritorna {text, sha} oppure null se non esiste. */
async function getFile(env, path) {
  const r = await ghFetch(env, `/repos/${repoOf(env)}/contents/${path}?ref=${encodeURIComponent(branchOf(env))}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} leggendo ${path}`);
  const j = await r.json();
  if (j.encoding === 'base64' && typeof j.content === 'string' && j.content.length) return { text: b64ToUtf8(j.content), sha: j.sha };
  // file grande (>1 MB): si rilegge in formato raw
  const raw = await ghFetch(env, `/repos/${repoOf(env)}/contents/${path}?ref=${encodeURIComponent(branchOf(env))}`, { headers: { accept: 'application/vnd.github.raw+json' } });
  if (!raw.ok) throw new Error(`GitHub ${raw.status} leggendo ${path} (raw)`);
  return { text: await raw.text(), sha: j.sha };
}

async function putFile(env, path, text, message, sha) {
  const body = {
    message,
    content: utf8ToB64(text),
    branch: branchOf(env),
    committer: { name: 'Marco (cockpit)', email: 'redazione@italiannextgen' },
  };
  if (sha) body.sha = sha;
  return ghFetch(env, `/repos/${repoOf(env)}/contents/${path}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

// ---------------------------------------------------------------- validazione scelte
/** Pulisce e valida il corpo di PUT /api/decisions. Ritorna {ok, value|error}. */
export function sanitizeDecisions(body, knownIds) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corpo non valido' };
  const itemsIn = body.items;
  const orderIn = body.order;
  if (!itemsIn || typeof itemsIn !== 'object' || Array.isArray(itemsIn)) return { ok: false, error: 'items mancante' };
  if (!Array.isArray(orderIn)) return { ok: false, error: 'order mancante' };
  const ids = Object.keys(itemsIn);
  if (ids.length > MAX_ITEMS || orderIn.length > MAX_ITEMS) return { ok: false, error: 'Troppe voci' };

  const items = {};
  for (const id of ids) {
    if (!ID_RE.test(id)) return { ok: false, error: `ID non valido: ${id.slice(0, 20)}` };
    if (knownIds && !knownIds.has(id)) return { ok: false, error: `ID sconosciuto (non è in coda): ${id}` };
    const v = itemsIn[id];
    if (!v || typeof v.live !== 'boolean' || typeof v.instagram !== 'boolean') return { ok: false, error: `Scelta non valida per ${id}` };
    items[id] = { live: v.live, instagram: v.live ? v.instagram : false }; // niente Instagram per ciò che non esce sul sito
  }
  const seen = new Set();
  const order = [];
  for (const id of orderIn) {
    if (typeof id !== 'string' || !items[id] || seen.has(id)) continue;
    seen.add(id); order.push(id);
  }
  for (const id of ids) if (!seen.has(id)) order.push(id); // eventuali mancanti in coda
  return { ok: true, value: { enabled: body.enabled !== false, order, items } };
}

// ---------------------------------------------------------------- endpoint
async function handleState(env) {
  const [q, d] = await Promise.all([getFile(env, QUEUE_PATH), getFile(env, DECISIONS_PATH)]);
  const today = romeDay();
  let queue = { items: [], day: null, generatedAt: null };
  try { if (q) queue = JSON.parse(q.text); } catch {}
  let decisions = null;
  try { if (d) { const x = JSON.parse(d.text); if (x.date === today) decisions = x; } } catch {}
  return json({ today, queue, decisions });
}

async function handleSaveDecisions(request, env, email) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON non valido' }, 400); }
  const q = await getFile(env, QUEUE_PATH);
  let known = null;
  try { if (q) known = new Set(JSON.parse(q.text).items.map((i) => i.id)); } catch {}
  const res = sanitizeDecisions(body, known);
  if (!res.ok) return json({ error: res.error }, 400);

  const out = { version: 1, date: romeDay(), updatedAt: new Date().toISOString(), updatedBy: email, ...res.value };
  const text = JSON.stringify(out, null, 2) + '\n';
  const live = Object.values(out.items).filter((i) => i.live).length;
  const ig = Object.values(out.items).filter((i) => i.instagram).length;
  const message = `Decisioni editoriali (app): ${live} live, ${ig} su Instagram`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await getFile(env, DECISIONS_PATH);
    const r = await putFile(env, DECISIONS_PATH, text, message, cur?.sha);
    if (r.ok) return json({ ok: true, saved: out });
    if (r.status !== 409 && r.status !== 422) return json({ error: `GitHub ${r.status} salvando` }, 502);
  }
  return json({ error: 'Conflitto su GitHub: riprova tra qualche secondo' }, 409);
}

async function handlePublish(env) {
  const d = await getFile(env, DECISIONS_PATH);
  let ok = false;
  try { const x = JSON.parse(d?.text ?? 'null'); ok = !!x && x.date === romeDay() && x.enabled !== false; } catch {}
  if (!ok) return json({ error: 'Salva prima le decisioni di oggi' }, 409);
  const r = await ghFetch(env, `/repos/${repoOf(env)}/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: branchOf(env), inputs: { quanti: '100' } }),
    headers: { 'content-type': 'application/json' },
  });
  if (r.status !== 204) return json({ error: `GitHub ${r.status} avviando la pubblicazione` }, 502);
  return json({ ok: true, startedAt: new Date().toISOString() });
}

async function handleRuns(env) {
  const r = await ghFetch(env, `/repos/${repoOf(env)}/actions/workflows/${PUBLISH_WORKFLOW}/runs?per_page=1&branch=${encodeURIComponent(branchOf(env))}`);
  if (!r.ok) return json({ error: `GitHub ${r.status}` }, 502);
  const j = await r.json();
  const run = j.workflow_runs?.[0];
  return json({ run: run ? { status: run.status, conclusion: run.conclusion, createdAt: run.created_at, url: run.html_url } : null });
}

// ---------------------------------------------------------------- ingresso
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      // File statici dell'app: l'accesso è già protetto da Cloudflare Access davanti al Worker
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    const email = await verifyAccess(request, env);
    if (!email) return json({ error: 'Non autorizzato' }, 401);
    if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN non configurato sul Worker' }, 500);

    // Difesa in più contro richieste da altri siti: le scritture devono arrivare dalla nostra stessa origine
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin');
      if (!origin || origin !== url.origin) return json({ error: 'Origine non valida' }, 403);
    }

    try {
      if (url.pathname === '/api/state' && request.method === 'GET') return await handleState(env);
      if (url.pathname === '/api/decisions' && request.method === 'PUT') return await handleSaveDecisions(request, env, email);
      if (url.pathname === '/api/publish' && request.method === 'POST') return await handlePublish(env);
      if (url.pathname === '/api/runs' && request.method === 'GET') return await handleRuns(env);
      return json({ error: 'Non trovato' }, 404);
    } catch (e) {
      return json({ error: String(e?.message ?? e).slice(0, 200) }, 502);
    }
  },
};
