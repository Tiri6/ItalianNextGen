#!/usr/bin/env node

/**
 * scheduler.mjs — Assegna orari di pubblicazione scaglionati agli articoli appena pubblicati.
 *
 * REGOLE:
 * - Slot ogni 20 minuti dalle 9:00 alle 21:00 (ora italiana, Europe/Rome)
 * - Il Taccuino prende il PRIMO slot del giorno + featured: true (in evidenza tutto il giorno)
 * - Vengono schedulati solo articoli RECENTI (ultimi 3 giorni) senza publishedAt:
 *   gli articoli storici non vengono toccati (restano visibili)
 * - Solo slot FUTURI: se lanci alle 14:30, il primo articolo esce alle 14:40
 * - Se non ci sono più slot oggi (dopo le 21:00), si passa a domani dalle 9:00
 *
 * USO:
 *   npm run schedule                  → schedula per oggi (slot futuri)
 *   npm run schedule -- --date=2026-07-18  → schedula per una data specifica
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const newsDir = path.join(__dir, '../src/content/news');

const START_HOUR = 9;
const END_HOUR = 21;       // ultimo slot: 21:00
const INTERVAL_MIN = 20;
const TZ = 'Europe/Rome';
const MAX_AGE_DAYS = 3;    // schedula solo articoli con date negli ultimi N giorni

// --- helpers fuso orario ---------------------------------------------------

/** 'YYYY-MM-DD' di oggi in ora italiana */
function todayRome() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** offset dell'Italia per una certa data: '+02:00' (estate) o '+01:00' (inverno) */
function romeOffset(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).format(d);
  const m = s.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+01:00';
}

/** 'YYYY-MM-DD' del giorno dopo */
function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// --- slot -------------------------------------------------------------------

/** Genera gli slot del giorno come Date (9:00, 9:20, ... 21:00 ora italiana) */
function generateSlots(dateStr) {
  const off = romeOffset(dateStr);
  const slots = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    for (const m of [0, 20, 40]) {
      if (h === END_HOUR && m > 0) break; // ultimo slot: 21:00 esatte
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      slots.push({ iso: `${dateStr}T${hh}:${mm}:00${off}`, time: new Date(`${dateStr}T${hh}:${mm}:00${off}`) });
    }
  }
  return slots;
}

// --- articoli ---------------------------------------------------------------

function parseArticles() {
  const out = [];
  for (const file of fs.readdirSync(newsDir)) {
    if (!file.endsWith('.md')) continue;
    const filePath = path.join(newsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    if (/^publishedAt:/m.test(fm)) continue; // già schedulato

    const dateMatch = fm.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m);
    const catMatch = fm.match(/^category:\s*["']?(\w+)/m);
    out.push({
      file,
      filePath,
      content,
      date: dateMatch ? dateMatch[1] : null,
      category: catMatch ? catMatch[1] : 'news',
    });
  }
  return out;
}

const catRank = (c) => { const i = ['performance', 'news', 'mercato'].indexOf(c); return i < 0 ? 3 : i; };

function isRecent(dateStr, refDateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  const ref = new Date(refDateStr + 'T00:00:00Z');
  const diffDays = (ref - d) / 86400000;
  return diffDays >= -1 && diffDays <= MAX_AGE_DAYS;
}

/** Inserisce publishedAt (e opzionalmente featured) nel frontmatter, dopo la riga date: */
function stampArticle(article, iso, { featured = false } = {}) {
  let extra = `publishedAt: ${iso}`;
  if (featured) extra += `\nfeatured: true`;
  let newContent;
  if (/^date:.*$/m.test(article.content)) {
    newContent = article.content.replace(/^(date:.*)$/m, `$1\n${extra}`);
  } else {
    newContent = article.content.replace(/^---\n/, `---\n${extra}\n`);
  }
  fs.writeFileSync(article.filePath, newContent);
}

// --- main --------------------------------------------------------------------

function main() {
  const dateArg = process.argv.find((a) => a.startsWith('--date='));
  let targetDate = dateArg ? dateArg.split('=')[1] : todayRome();
  const now = new Date();

  // Slot futuri del giorno target (margine 2 minuti)
  let slots = generateSlots(targetDate).filter((s) => s.time.getTime() > now.getTime() + 2 * 60000);

  // Se oggi non ci sono più slot, passa a domani
  if (slots.length === 0) {
    targetDate = nextDay(targetDate);
    slots = generateSlots(targetDate);
    console.log(`⏭  Nessuno slot rimasto oggi: schedulo per domani (${targetDate})`);
  }

  const articles = parseArticles().filter((a) => isRecent(a.date, todayRome()));
  if (articles.length === 0) {
    console.log('✅ Niente da schedulare (nessun articolo recente senza orario).');
    return;
  }

  // Taccuino per primo (sticky), poi gli altri per data (recenti prima)
  const taccuini = articles.filter((a) => a.category === 'taccuino');
  const others = articles
    .filter((a) => a.category !== 'taccuino')
    // Prima le prestazioni (partite di ieri), poi news, poi mercato e il resto; a parità, le più recenti
    .sort((a, b) => catRank(a.category) - catRank(b.category) || (b.date || '').localeCompare(a.date || ''));
  const queue = [...taccuini, ...others];

  console.log(`📅 Scheduler → ${targetDate} (${TZ})`);
  console.log(`📍 Slot disponibili: ${slots.length} · Articoli da schedulare: ${queue.length}`);

  // Un articolo ogni 20 minuti, slot consecutivi a partire dal primo disponibile.
  const n = Math.min(queue.length, slots.length);
  let scheduled = 0;
  for (let i = 0; i < n; i++) {
    const article = queue[i];
    const slot = slots[i];
    const featured = article.category === 'taccuino';
    stampArticle(article, slot.iso, { featured });
    const hhmm = slot.iso.slice(11, 16);
    console.log(`  ${hhmm} → ${article.file}${featured ? '  📋 (taccuino, in evidenza)' : ''}`);
    scheduled++;
  }

  const leftover = queue.length - scheduled;
  console.log(`\n✅ Schedulati ${scheduled} articoli.`);
  if (leftover > 0) {
    console.log(`⚠️  ${leftover} articoli restano senza orario (slot esauriti): rilancia domani.`);
  }
}

main();
