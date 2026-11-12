// eote-2a oracle: C2 Part A import. Copy to tests/import.test.js in the source folder.
// Run: node --test tests/
// Design: docs/drafts/eote-2a/DESIGN.md (public repo branch agent-dep-1738f332).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, validateDump, GAME_NAME } from '../store.js';
import { recordPrefix, OWNER_KEY } from '../rules.js';
import { takeImportHash, encodeHandoff, decodeHandoff, countsText, HandoffError } from '../handoff.js';

const SLOT = 'main';
const P = recordPrefix(SLOT);
const AT = '2026-11-09T12:00:00.000Z';

// A Map-backed Storage, the same contract store.js expects from localStorage.
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    snapshot: () => Object.fromEntries(m),
    read: (k) => (m.has(k) ? JSON.parse(m.get(k)) : undefined),
  };
}

const dumpOf = (records) => ({ game: GAME_NAME, exportedAt: AT, savedOn: 'this device only', records });
const row = (t = 'stake') => ({ p: 'x', a: 'GHA', i: 'GHA', t, pts: 55, x: false, s: null, m: 0 });
const doneRun = (v = 6) => ({ kind: 'first-play', id: 'r', rounds: [1, 2, 3, 4, 5].map(() => row()), open: null, done: true, v });
const partialRun = (n, v = n) => ({ kind: 'first-play', id: 'r', rounds: Array.from({ length: n }, () => row()), open: null, v });
const log5 = () => [1, 2, 3, 4, 5].map(() => row());

const fullOldSite = () => ({
  [OWNER_KEY]: { owner: 'guest', generation: 'old', storage: 1, slot: SLOT },
  [`${P}run:2026-11-01`]: doneRun(),
  [`${P}log:2026-11-01`]: log5(),
  [`${P}run:2026-11-02`]: doneRun(),
  [`${P}log:2026-11-02`]: log5(),
  [`${P}passport`]: { GHA: { day: '2026-11-01', tier: 'stake' } },
  [`${P}stamps`]: { version: 1, stamps: { 'GHA:stake': { code: 'GHA', day: '2026-11-01', tier: 'stake', promptId: 'x' } } },
  [`${P}settings`]: { search: true, sound: false, names: true, borders: true, clock: 'standard' },
  [`${P}tour`]: true,
  [`${P}souvenirs-shown`]: ['a'],
  [`${P}bonus:2026-11-01`]: { ok: true },
});

test('round trip: export from the old device, import into an empty one', () => {
  const oldStore = createStore(fakeStorage(fullOldSite()), SLOT);
  const dump = JSON.parse(JSON.stringify(oldStore.exportAll(AT)));
  const fresh = fakeStorage({ [OWNER_KEY]: { owner: 'guest', generation: 'new', storage: 1, slot: SLOT } });
  const r = createStore(fresh, SLOT).importAll(dump, 'write', { at: AT, from: 'file' });
  assert.equal(r.ok, true);
  assert.equal(r.days, 2);
  assert.equal(r.stamps, 1);
  for (const [k, v] of Object.entries(fullOldSite())) {
    if (k === OWNER_KEY) continue;
    assert.deepEqual(fresh.read(k), v, k);
  }
  assert.equal(fresh.read(OWNER_KEY).generation, 'new', 'owner is never imported');
  assert.deepEqual(fresh.read(`${P}imported`), { at: AT, from: 'file', records: r.records });
  assert.ok(r.records > 0);
});

test('preview counts but writes nothing', () => {
  const s = fakeStorage();
  const r = createStore(s, SLOT).importAll(dumpOf(fullOldSite()), 'preview');
  assert.equal(r.ok, true);
  assert.equal(r.days, 2);
  assert.equal(s.length, 0);
});

test('re-import of the same dump is a no-op', () => {
  const s = fakeStorage();
  const store = createStore(s, SLOT);
  store.importAll(dumpOf(fullOldSite()), 'write', { at: AT });
  const before = s.snapshot();
  const r = store.importAll(dumpOf(fullOldSite()), 'write', { at: '2027-01-01T00:00:00.000Z' });
  assert.deepEqual(r, { ok: true, days: 0, stamps: 0, records: 0 });
  assert.deepEqual(s.snapshot(), before);
});

test('done beats partial; the version moves past local so other tabs stop', () => {
  const s = fakeStorage({ [`${P}run:2026-11-03`]: partialRun(2, 9) });
  const r = createStore(s, SLOT).importAll(dumpOf({ [`${P}run:2026-11-03`]: doneRun(6), [`${P}log:2026-11-03`]: log5() }), 'write', { at: AT });
  assert.equal(r.days, 1);
  assert.equal(s.read(`${P}run:2026-11-03`).done, true);
  assert.equal(s.read(`${P}run:2026-11-03`).v, 10);
  assert.equal(s.read(`${P}log:2026-11-03`).length, 5);
});

test('a finished local day is kept, even against more incoming rounds', () => {
  const local = doneRun(6);
  const s = fakeStorage({ [`${P}run:2026-11-03`]: local, [`${P}log:2026-11-03`]: log5() });
  const r = createStore(s, SLOT).importAll(dumpOf({ [`${P}run:2026-11-03`]: doneRun(8), [`${P}log:2026-11-03`]: [row('ends')] }), 'write', { at: AT });
  assert.equal(r.days, 0);
  assert.deepEqual(s.read(`${P}run:2026-11-03`), local);
  assert.equal(s.read(`${P}log:2026-11-03`).length, 5);
});

test('neither done: more rounds wins, a tie keeps local', () => {
  const s = fakeStorage({ [`${P}run:2026-11-04`]: partialRun(1), [`${P}run:2026-11-05`]: partialRun(3) });
  createStore(s, SLOT).importAll(dumpOf({ [`${P}run:2026-11-04`]: partialRun(3), [`${P}run:2026-11-05`]: partialRun(3, 99) }), 'write', { at: AT });
  assert.equal(s.read(`${P}run:2026-11-04`).rounds.length, 3);
  assert.equal(s.read(`${P}run:2026-11-05`).v, 3, 'tie keeps local');
});

test('passport: union, earliest day wins; stamps: union, only new keys counted', () => {
  const s = fakeStorage({
    [`${P}passport`]: { GHA: { day: '2026-11-05', tier: 'stake' }, FJI: { day: '2026-11-02', tier: 'ends' } },
    [`${P}stamps`]: { version: 1, stamps: { 'FJI:ends': { code: 'FJI', day: '2026-11-02', tier: 'ends', promptId: 'y' } } },
  });
  const r = createStore(s, SLOT).importAll(dumpOf({
    [`${P}passport`]: { GHA: { day: '2026-11-01', tier: 'mission' }, PER: { day: '2026-11-03', tier: 'isles' }, FJI: { day: '2026-11-04', tier: 'ends' } },
    [`${P}stamps`]: { version: 1, stamps: { 'PER:isles': { code: 'PER', day: '2026-11-03', tier: 'isles', promptId: 'z' }, 'FJI:ends': { code: 'FJI', day: '2026-11-04', tier: 'ends', promptId: 'q' } } },
  }), 'write', { at: AT });
  const pp = s.read(`${P}passport`);
  assert.equal(pp.GHA.day, '2026-11-01');
  assert.equal(pp.FJI.day, '2026-11-02');
  assert.ok(pp.PER);
  const st = s.read(`${P}stamps`).stamps;
  assert.equal(st['FJI:ends'].promptId, 'y', 'local earlier stamp kept');
  assert.ok(st['PER:isles']);
  assert.equal(r.stamps, 1);
});

test('settings and tour: local wins when present, imported fills a fresh device', () => {
  const localSettings = { search: false, sound: true, names: true, borders: true, clock: 'relaxed' };
  const s = fakeStorage({ [`${P}settings`]: localSettings });
  createStore(s, SLOT).importAll(dumpOf(fullOldSite()), 'write', { at: AT });
  assert.deepEqual(s.read(`${P}settings`), localSettings);
  assert.equal(s.read(`${P}tour`), true, 'tour flag filled on a device that had none');
});

test('souvenirs-shown is merged; unknown keys fill gaps only', () => {
  const s = fakeStorage({ [`${P}souvenirs-shown`]: ['b'], [`${P}future-thing`]: 1 });
  createStore(s, SLOT).importAll(dumpOf({ [`${P}souvenirs-shown`]: ['a', 'b'], [`${P}future-thing`]: 2, [`${P}other-new`]: 3 }), 'write', { at: AT });
  assert.deepEqual(s.read(`${P}souvenirs-shown`), ['b', 'a']);
  assert.equal(s.read(`${P}future-thing`), 1);
  assert.equal(s.read(`${P}other-new`), 3);
});

test('refused dumps write nothing', () => {
  const cases = [
    [null, 'not-ends'],
    [{ ...dumpOf({}), game: 'Wordle' }, 'not-ends'],
    [{ game: GAME_NAME, records: [] }, 'not-ends'],
    [dumpOf({ 'other:key': 1 }), 'foreign-key'],
    [dumpOf({ [`${P}passport`]: JSON.parse('{"__proto__": {"day": "x"}}') }), 'bad-value'],
    [dumpOf({ [`${P}run:2026-13-45`]: doneRun() }), 'bad-value'],
    [dumpOf({ [`${P}run:2026-11-01`]: { rounds: 'no' } }), 'bad-value'],
    [dumpOf({ [`${P}log:2026-11-01`]: { not: 'an array' } }), 'bad-value'],
    [dumpOf({ [`${P}tour`]: () => true }), 'bad-value'],
  ];
  for (const [dump, reason] of cases) {
    const s = fakeStorage();
    const r = createStore(s, SLOT).importAll(dump, 'write', { at: AT });
    assert.deepEqual(r, { ok: false, reason }, JSON.stringify(dump));
    assert.equal(s.length, 0);
    assert.deepEqual(validateDump(dump, SLOT), { ok: false, reason });
  }
});

test('another slot is skipped, not refused', () => {
  const s = fakeStorage();
  const r = createStore(s, SLOT).importAll(dumpOf({ [`${recordPrefix('other')}tour`]: true }), 'write', { at: AT });
  assert.deepEqual(r, { ok: true, days: 0, stamps: 0, records: 0 });
  assert.equal(s.length, 0);
});

test('a running round clock refuses the write', () => {
  const s = fakeStorage();
  const r = createStore(s, SLOT).importAll(dumpOf(fullOldSite()), 'write', { at: AT, roundOpen: true });
  assert.deepEqual(r, { ok: false, reason: 'round-open' });
  assert.equal(s.length, 0);
});

test('handoff encode and decode round-trip', async () => {
  const dump = dumpOf(fullOldSite());
  const v = await encodeHandoff(dump);
  assert.match(v, /^v1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeHandoff(v), dump);
  await assert.rejects(decodeHandoff('v2.abc'), HandoffError);
  await assert.rejects(decodeHandoff('v1.!!!'), HandoffError);
  await assert.rejects(decodeHandoff('v1.YWJj'), HandoffError);
});

test('takeImportHash clears only #import= and keeps path and query', () => {
  const calls = [];
  const hist = { replaceState: (...a) => calls.push(a) };
  assert.equal(takeImportHash({ hash: '#import=v1.abc', pathname: '/x/', search: '?debug' }, hist), 'v1.abc');
  assert.deepEqual(calls, [[null, '', '/x/?debug']]);
  assert.equal(takeImportHash({ hash: '#play=2026-11-01', pathname: '/', search: '' }, hist), null);
  assert.equal(takeImportHash({ hash: '', pathname: '/', search: '' }, hist), null);
  assert.equal(calls.length, 1);
});

test('countsText wording', () => {
  assert.equal(countsText({ days: 1, stamps: 1 }), '1 day and 1 stamp');
  assert.equal(countsText({ days: 3, stamps: 2 }), '3 days and 2 stamps');
  assert.equal(countsText({ days: 0, stamps: 4 }), '4 stamps');
  assert.equal(countsText({ days: 2, stamps: 0 }), '2 days');
});
