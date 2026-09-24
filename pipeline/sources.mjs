// REGOLE SULLE FONTI — legge data/sources.json e classifica una testata.
//   approved → ok · confirm → cronaca ok, voci di mercato NON auto-pubblicate · blocked → mai
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sources.json');
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^www\./, '').replace(/[^a-z0-9]+/g, '');

let cfg = { defaultPolicy: 'confirm', approved: [], confirm: [], blocked: [] };
try { cfg = { ...cfg, ...JSON.parse(readFileSync(FILE, 'utf8')) }; } catch { /* file assente: tutto 'confirm' */ }
const sets = { approved: new Set(cfg.approved.map(norm)), confirm: new Set(cfg.confirm.map(norm)), blocked: new Set(cfg.blocked.map(norm)) };

/** @returns {'approved'|'confirm'|'blocked'} */
export function sourceClass(name) {
  const n = norm(name);
  if (!n) return cfg.defaultPolicy;
  if (/^taccuino/.test(String(name).toLowerCase())) return 'approved'; // i Taccuini sono sintesi interne
  if (sets.blocked.has(n)) return 'blocked';
  if (sets.approved.has(n)) return 'approved';
  if (sets.confirm.has(n)) return 'confirm';
  return cfg.defaultPolicy;
}
export const isBlocked = (name) => sourceClass(name) === 'blocked';
