import test from 'node:test';
import assert from 'node:assert/strict';
import { sameClub, sameName, buildEntry, mergeEntry } from '../apifootball.mjs';

test('club: alias e nomi API', () => {
  assert.ok(sameClub('Milan', 'AC Milan'));
  assert.ok(sameClub('Roma', 'AS Roma'));
  assert.ok(sameClub('Inter', 'Inter'));
  assert.ok(!sameClub('Inter', 'Inter U23') || false);
  assert.ok(sameClub('Inter U23', 'Inter U23'));
  assert.ok(sameClub('Bayern Monaco', 'Bayern Munich'));
  assert.ok(sameClub('Stoccarda', 'VfB Stuttgart'));
  assert.ok(sameClub('Südtirol', 'FC Sudtirol'));
  assert.ok(sameClub('Crystal Palace (prestito Chelsea)', 'Crystal Palace'));
  assert.ok(!sameClub('Milan', 'Inter'));
  assert.ok(!sameClub('Roma', 'Lazio'));
});

test('giocatore: iniziale, cognome, nomi composti', () => {
  assert.ok(sameName('Daniele Ghilardi', 'D. Ghilardi'));
  assert.ok(sameName('Daniele Ghilardi', 'Daniele Ghilardi'));
  assert.ok(sameName('Francesco Pio Esposito', 'F. Esposito'));
  assert.ok(sameName('Francesco Pio Esposito', 'Pio Esposito'));
  assert.ok(sameName('Alphadjo Cissè', 'A. Cisse'));
  assert.ok(!sameName('Sebastiano Esposito', 'F. Esposito'));
  assert.ok(!sameName('Daniele Ghilardi', 'L. Ghilardi'));
  assert.ok(!sameName('Daniele Ghilardi', 'D. Rossi'));
});

const fx = { fixture: { date: '2026-10-31T18:00:00+01:00' }, league: { name: 'Serie A' }, teams: { home: { name: 'Udinese' }, away: { name: 'AS Roma' } }, goals: { home: 2, away: 5 } };

test('voce: titolare con gol', () => {
  const e = buildEntry(fx, 'away', { name: 'Daniele Ghilardi', club: 'Roma' }, { games: { minutes: 90, rating: '7.8', substitute: false }, goals: { total: 1, assists: null }, cards: { red: 0 } });
  assert.equal(e.date, '2026-10-31');
  assert.equal(e.result, '5-2');
  assert.equal(e.club, 'Roma'); assert.equal(e.opponent, 'Udinese');
  assert.equal(e.goals, 1); assert.equal(e.rating, 7.8); assert.equal(e.minutes, 90);
  assert.match(e.note, /^90' in campo, 1 gol\.$/);
  assert.equal(e.assists, undefined);
});

test('risultato dal punto di vista del club del giocatore', () => {
  const st = { games: { minutes: 90, substitute: false } };
  assert.equal(buildEntry(fx, 'away', { name: 'A' }, st).result, '5-2'); // Roma in trasferta vince 5-2
  assert.equal(buildEntry(fx, 'home', { name: 'B' }, st).result, '2-5'); // Udinese in casa perde 2-5
});

test('voce: in panchina senza entrare = nessuna prestazione', () => {
  assert.equal(buildEntry(fx, 'away', { name: 'X' }, { games: { minutes: null, substitute: true } }), null);
});

test('voce: subentrato con assist', () => {
  const e = buildEntry(fx, 'home', { name: 'X' }, { games: { minutes: 12, substitute: true }, goals: { total: 0, assists: 1 } });
  assert.match(e.note, /^12' in campo, 1 assist\.$/);
  assert.equal(e.goals, undefined);
});

test('unione: la voce API sostituisce quella da articolo della stessa partita', () => {
  const old = [{ date: '2026-11-02', player: 'Daniele Ghilardi', opponent: 'Udinese', result: '2-5', note: 'da articolo' }, { date: '2026-10-20', player: 'Daniele Ghilardi', opponent: 'Genoa', result: '2-0' }];
  const e = buildEntry(fx, 'away', { name: 'Daniele Ghilardi' }, { games: { minutes: 90, substitute: false }, goals: { total: 1 } });
  const m = mergeEntry(old, e);
  assert.equal(m.list.length, 2);
  assert.equal(m.replaced, 1);
  assert.ok(m.list.some((p) => p.fromApi));
  assert.ok(m.list.some((p) => p.opponent === 'Genoa'));
});
