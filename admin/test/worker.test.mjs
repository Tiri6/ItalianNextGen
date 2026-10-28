// Prove del Worker con GitHub e Cloudflare Access SIMULATI (nessuna rete). Esegui: node --test admin/test
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { sanitizeDecisions } from '../src/worker.js';

const TEAM = 'esempio.cloudflareaccess.com';
const AUD = 'aud-di-prova';
const EMAIL = 'marco@example.com';
const romeDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

async function makeJwt(over = {}, signKey = kp.privateKey) {
  const header = { alg: 'RS256', kid: 'k1', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: `https://${TEAM}`, aud: [AUD], email: EMAIL, exp: now + 600, nbf: now - 5, ...over };
  const h = b64u(JSON.stringify(header)), p = b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

// --- GitHub finto: un piccolo "repo" in memoria ---
function makeRepo(files) {
  const calls = [];
  let n = 1;
  const sha = () => `sha${n++}`;
  const store = new Map(Object.entries(files).map(([k, v]) => [k, { text: v, sha: sha() }]));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body });
    if (url === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
    const m = url.match(/^https:\/\/api\.github\.com\/repos\/Tiri6\/ItalianNextGen\/contents\/([^?]+)/);
    if (m) {
      const f = store.get(m[1]);
      if (method === 'GET') {
        if (!f) return new Response('{}', { status: 404 });
        return Response.json({ encoding: 'base64', content: Buffer.from(f.text).toString('base64'), sha: f.sha });
      }
      if (method === 'PUT') {
        const b = JSON.parse(init.body);
        if (f && b.sha !== f.sha) return new Response('{}', { status: 409 });
        if (!f && b.sha) return new Response('{}', { status: 422 });
        store.set(m[1], { text: Buffer.from(b.content, 'base64').toString('utf8'), sha: sha() });
        return Response.json({ ok: true }, { status: f ? 200 : 201 });
      }
    }
    if (url.includes('/actions/workflows/publish.yml/dispatches')) return new Response(null, { status: 204 });
    if (url.includes('/actions/workflows/publish.yml/runs')) return Response.json({ workflow_runs: [{ status: 'completed', conclusion: 'success', created_at: '2026-10-28T09:00:00Z', html_url: 'https://github.com/x' }] });
    return new Response('{}', { status: 404 });
  };
  return { calls, store, restore: () => { globalThis.fetch = realFetch; } };
}

const QUEUE = JSON.stringify({ day: romeDay(), items: [{ id: 'abc-1', title: 'A', proposed: { live: true, instagram: true }, flags: [] }, { id: 'abc-2', title: 'B', proposed: { live: false, instagram: false }, flags: [] }] });
const env = { TEAM_DOMAIN: TEAM, POLICY_AUD: AUD, ALLOWED_EMAIL: EMAIL, GITHUB_TOKEN: 'ghp_test', GITHUB_REPO: 'Tiri6/ItalianNextGen', GITHUB_BRANCH: 'main' };

async function call(method, path, { body, jwt, headers = {} } = {}) {
  const url = `https://cockpit.example.workers.dev${path}`;
  const h = { ...headers };
  if (jwt !== null) h['Cf-Access-Jwt-Assertion'] = jwt ?? (await makeJwt());
  if (method !== 'GET') h.origin = 'https://cockpit.example.workers.dev';
  const res = await worker.fetch(new Request(url, { method, body: body ? JSON.stringify(body) : undefined, headers: h }), env);
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('senza login → 401', async () => {
  const r = makeRepo({ 'data/review-queue.json': QUEUE });
  try { assert.equal((await call('GET', '/api/state', { jwt: null })).status, 401); } finally { r.restore(); }
});

test('login di un\'altra persona, JWT scaduto, audience sbagliata o firma falsa → 401', async () => {
  const r = makeRepo({ 'data/review-queue.json': QUEUE });
  try {
    assert.equal((await call('GET', '/api/state', { jwt: await makeJwt({ email: 'altro@example.com' }) })).status, 401);
    assert.equal((await call('GET', '/api/state', { jwt: await makeJwt({ exp: Math.floor(Date.now() / 1000) - 10 }) })).status, 401);
    assert.equal((await call('GET', '/api/state', { jwt: await makeJwt({ aud: ['altra'] }) })).status, 401);
    const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    assert.equal((await call('GET', '/api/state', { jwt: await makeJwt({}, other.privateKey) })).status, 401);
  } finally { r.restore(); }
});

test('configurazione mancante → nessun accesso (fail closed)', async () => {
  const r = makeRepo({});
  try {
    const res = await worker.fetch(new Request('https://x.workers.dev/api/state', { headers: { 'Cf-Access-Jwt-Assertion': await makeJwt() } }), { GITHUB_TOKEN: 'x' });
    assert.equal(res.status, 401);
  } finally { r.restore(); }
});

test('GET /api/state: coda e nessuna decisione di oggi', async () => {
  const r = makeRepo({ 'data/review-queue.json': QUEUE, 'data/editorial-decisions.json': JSON.stringify({ date: '2020-01-01', items: {}, order: [] }) });
  try {
    const { status, data } = await call('GET', '/api/state');
    assert.equal(status, 200);
    assert.equal(data.queue.items.length, 2);
    assert.equal(data.decisions, null); // decisioni di un altro giorno = ignorate
  } finally { r.restore(); }
});

test('PUT /api/decisions: salva su GitHub, Instagram spento se il sito è spento, ordine rispettato', async () => {
  const r = makeRepo({ 'data/review-queue.json': QUEUE });
  try {
    const { status, data } = await call('PUT', '/api/decisions', { body: { order: ['abc-2', 'abc-1'], items: { 'abc-1': { live: true, instagram: true }, 'abc-2': { live: false, instagram: true } } } });
    assert.equal(status, 200);
    const saved = JSON.parse(r.store.get('data/editorial-decisions.json').text);
    assert.equal(saved.date, romeDay());
    assert.deepEqual(saved.order, ['abc-2', 'abc-1']);
    assert.deepEqual(saved.items['abc-2'], { live: false, instagram: false });
    assert.deepEqual(saved.items['abc-1'], { live: true, instagram: true });
    assert.equal(saved.updatedBy, EMAIL);
    assert.ok(data.ok);
    // secondo salvataggio: usa lo sha corrente (aggiornamento, non creazione)
    const again = await call('PUT', '/api/decisions', { body: { order: ['abc-1', 'abc-2'], items: { 'abc-1': { live: true, instagram: false }, 'abc-2': { live: false, instagram: false } } } });
    assert.equal(again.status, 200);
  } finally { r.restore(); }
});

test('PUT con ID sconosciuto, scelta malformata o senza Origin → rifiutato', async () => {
  const r = makeRepo({ 'data/review-queue.json': QUEUE });
  try {
    assert.equal((await call('PUT', '/api/decisions', { body: { order: [], items: { 'zzz-9': { live: true, instagram: false } } } })).status, 400);
    assert.equal((await call('PUT', '/api/decisions', { body: { order: [], items: { 'abc-1': { live: 'si', instagram: false } } } })).status, 400);
    assert.equal((await call('PUT', '/api/decisions', { body: { order: [] } })).status, 400);
    const res = await worker.fetch(new Request('https://cockpit.example.workers.dev/api/decisions', { method: 'PUT', body: '{}', headers: { 'Cf-Access-Jwt-Assertion': await makeJwt(), origin: 'https://evil.example' } }), env);
    assert.equal(res.status, 403);
    assert.equal(r.store.has('data/editorial-decisions.json'), false);
  } finally { r.restore(); }
});

test('POST /api/publish: serve prima il salvataggio di oggi, poi parte il workflow', async () => {
  const r = makeRepo({ 'data/review-queue.json': QUEUE });
  try {
    assert.equal((await call('POST', '/api/publish')).status, 409);
    await call('PUT', '/api/decisions', { body: { order: ['abc-1'], items: { 'abc-1': { live: true, instagram: true } } } });
    const ok = await call('POST', '/api/publish');
    assert.equal(ok.status, 200);
    assert.ok(r.calls.some((c) => c.url.includes('/dispatches') && c.method === 'POST'));
  } finally { r.restore(); }
});

test('GET /api/runs', async () => {
  const r = makeRepo({});
  try {
    const { status, data } = await call('GET', '/api/runs');
    assert.equal(status, 200);
    assert.equal(data.run.conclusion, 'success');
  } finally { r.restore(); }
});

test('sanitizeDecisions: duplicati e ordine incompleto', () => {
  const res = sanitizeDecisions({ order: ['a-1', 'a-1', 'x-x'], items: { 'a-1': { live: true, instagram: true }, 'b-2': { live: true, instagram: false } } }, null);
  assert.ok(res.ok);
  assert.deepEqual(res.value.order, ['a-1', 'b-2']);
});
