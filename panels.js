// Menu panel logic: logbook, passport, past week, souvenirs, difficulty. Pure functions over
// rules.js, no DOM, no storage access. logsFull = { "<date>": [5 log rows] } for finished days.
import { TIERS, BANDS, bandFor, rowsKm, addDays, pastWeekDates, expeditionNumber, streak, assistMask, asterisks, ASSIST_BITS, dayMask } from './rules.js?v=7eff5a1bb0';

const TIER_RANK = Object.fromEntries(TIERS.map((t, i) => [t.id, i]));

// { "<date>": { km, late } }, the shape rules.stats and rules.streak read.
export function summarize(logsFull) {
  const out = {};
  for (const [date, rows] of Object.entries(logsFull)) {
    out[date] = { km: rowsKm(rows), late: rows.some((r) => r.l) };
  }
  return out;
}

// Longest run of consecutive on-time days ever logged.
export function longestStreak(logs) {
  const days = Object.keys(logs).filter((d) => !logs[d].late).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// §22 stats grid: Played, Streak, Longest, Traveled, Average, Best.
export function logbookStats(logsFull, today) {
  const logs = summarize(logsFull);
  const kms = Object.values(logs).map((l) => l.km);
  const traveled = kms.reduce((a, b) => a + b, 0);
  return {
    played: kms.length,
    streak: streak(logs, today),
    longest: longestStreak(logs),
    traveled,
    average: kms.length ? Math.round(traveled / kms.length) : 0,
    best: kms.length ? Math.max(...kms) : 0,
  };
}

function weekdayMon0(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

// §22 the log: `weeks` rows of 7 dates, Monday first, the last row holding today.
export function calendarWeeks(today, weeks = 5) {
  const start = addDays(today, -weekdayMon0(today) - 7 * (weeks - 1));
  const out = [];
  for (let w = 0; w < weeks; w++) {
    out.push(Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  }
  return out;
}

// What one calendar cell shows.
export function cellState(date, today, day1, deckCount, logsFull) {
  if (logsFull[date]) return 'played';
  const n = expeditionNumber(date, day1);
  if (n < 1 || n > deckCount) return 'closed';
  if (date === today) return 'today';
  if (date > today) return 'future';
  return pastWeekDates(today, day1).includes(date) ? 'open' : 'missed';
}

// §22 where they ended: days per band, every band listed.
export function bandCounts(logsFull) {
  const out = Object.fromEntries(BANDS.map((b) => [b.id, 0]));
  for (const { km } of Object.values(summarize(logsFull))) out[bandFor(km).id] += 1;
  return out;
}

// §22 your pins: pins per tier, Miss included.
export function tierCounts(logsFull) {
  const out = Object.fromEntries(TIERS.map((t) => [t.id, 0]));
  for (const rows of Object.values(logsFull)) for (const r of rows) out[r.t] += 1;
  return out;
}

// §22 past week: the 7 days before today with their deck number and last open day.
export function pastWeekRows(today, day1, deckCount, logsFull) {
  return pastWeekDates(today, day1)
    .map((date) => ({ date, n: expeditionNumber(date, day1), until: addDays(date, 7), rows: logsFull[date] ?? null }))
    .filter((d) => d.n <= deckCount);
}

// §22 past week: a played day is no longer open, so it shows VIEW and PLAYED, not an OPEN UNTIL date.
export function pastWeekStatus(week, run) {
  if (week.rows) return { label: 'VIEW', open: false };
  return { label: run && !run.done ? 'RESUME' : 'PLAY', open: true };
}

// §22 passport: the 197 sovereign countries by continent, each with its best stamped tier or null,
// plus any territory already stamped.
export function passportPages(features, passport, stamps) {
  const best = {};
  for (const s of Object.values(stamps?.stamps ?? {})) {
    if (best[s.code] == null || TIER_RANK[s.tier] > TIER_RANK[best[s.code]]) best[s.code] = s.tier;
  }
  const pages = new Map();
  // A stamped territory (Guam, Hong Kong and the like) is listed on its continent's page so the
  // stamp shows, but only the 197 countries count toward total and stamped (F-L08, F-E04).
  for (const f of features) {
    const territory = f.kind !== 'country';
    if (territory && !passport?.[f.code]) continue;
    if (!pages.has(f.continent)) pages.set(f.continent, []);
    const found = passport?.[f.code] ? best[f.code] ?? passport[f.code].tier : null;
    pages.get(f.continent).push(territory ? { code: f.code, name: f.name, tier: found, territory } : { code: f.code, name: f.name, tier: found });
  }
  const list = [...pages.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([continent, rows]) => ({ continent, rows: rows.sort((x, y) => x.name.localeCompare(y.name)) }));
  const countries = (rows) => rows.filter((r) => !r.territory);
  const total = list.reduce((n, p) => n + countries(p.rows).length, 0);
  const stamped = list.reduce((n, p) => n + countries(p.rows).filter((r) => r.tier).length, 0);
  return { pages: list, total, stamped };
}

export function filterRows(rows, filter) {
  if (filter === 'found') return rows.filter((r) => r.tier);
  if (filter === 'missing') return rows.filter((r) => !r.tier);
  return rows;
}

// §22 difficulty subline.
export function difficultyLabel(settings) {
  const mask = assistMask(settings);
  const off = asterisks(mask).length;
  return off ? `${off} assist${off > 1 ? 's' : ''} off ${asterisks(mask)}` : 'all assists on';
}

// ---------- souvenirs (ours, ruling 12) ----------

// Everything a souvenir condition can read. countryInfo: Map of sovereign code to continent.
export function souvenirFacts(logsFull, countryInfo) {
  const logs = summarize(logsFull);
  const dates = Object.keys(logsFull).sort();
  const f = {
    played: dates.length, longestStreak: longestStreak(logs), traveled: 0, best: 0,
    hits: 0, stamped: 0, continents: 0, perfectDays: 0, lateDays: 0, timeoutHits: 0,
    tiersInDay: 0, hardBest: 0, tier: {}, bandDays: {}, assistDays: {}, continent: {},
  };
  for (const t of TIERS) f.tier[t.id] = 0;
  for (const b of BANDS) f.bandDays[b.id] = 0;
  for (const bit of [...Object.values(ASSIST_BITS), 7]) f.assistDays[bit] = 0;
  const stampedCodes = new Set();
  for (const date of dates) {
    const rows = logsFull[date];
    const km = logs[date].km;
    f.traveled += km;
    f.best = Math.max(f.best, km);
    if (logs[date].late) f.lateDays += 1;
    for (const b of BANDS) if (km >= b.min) f.bandDays[b.id] += 1;
    const tiers = new Set();
    for (const r of rows) {
      f.tier[r.t] += 1;
      if (r.a) {
        f.hits += 1;
        tiers.add(r.t);
        if (r.x) f.timeoutHits += 1;
        if (countryInfo.has(r.a)) stampedCodes.add(r.a);
      }
    }
    f.tiersInDay = Math.max(f.tiersInDay, tiers.size);
    if (rows.every((r) => r.a)) f.perfectDays += 1;
    const mask = dayMask(rows);
    for (const bit of Object.keys(f.assistDays)) if ((mask & bit) === Number(bit)) f.assistDays[bit] += 1;
    if (mask) f.hardBest = Math.max(f.hardBest, km);
  }
  f.stamped = stampedCodes.size;
  for (const code of stampedCodes) {
    const c = countryInfo.get(code);
    f.continent[c] = (f.continent[c] ?? 0) + 1;
  }
  f.continents = Object.keys(f.continent).length;
  return f;
}

// metric is "name" or "name:key", e.g. "played", "tier:ends", "bandDays:south-pass", "assistDays:4".
export function metricValue(facts, metric) {
  const [name, key] = metric.split(':');
  const v = facts[name];
  if (v === undefined) throw new Error(`unknown souvenir metric: ${metric}`);
  if (key === undefined) {
    if (typeof v !== 'number') throw new Error(`souvenir metric needs a key: ${metric}`);
    return v;
  }
  if (typeof v !== 'object') throw new Error(`souvenir metric takes no key: ${metric}`);
  return v[key] ?? 0;
}

export function progress(def, facts) {
  const value = metricValue(facts, def.metric);
  return { value: Math.min(value, def.goal), goal: def.goal, done: value >= def.goal };
}

export function earnedIds(defs, facts) {
  return defs.filter((d) => progress(d, facts).done).map((d) => d.id);
}

// §22 nearly there: unfinished souvenirs with some progress, closest first.
export function nearlyThere(defs, facts, limit = 3) {
  return defs.map((d) => ({ def: d, ...progress(d, facts) }))
    .filter((p) => !p.done && p.value > 0)
    .sort((a, b) => b.value / b.goal - a.value / a.goal || a.goal - b.goal)
    .slice(0, limit);
}

// §30 souvenirs brought back on each day: replay the log in the order the days were played
// and note what each day added. playedAt maps a date to when it was finished (ms); a day with
// no time sorts by its own date (F-L09).
export function broughtBackByDay(defs, logsFull, countryInfo, playedAt = {}) {
  const out = {};
  const sofar = {};
  let had = new Set();
  const when = (d) => playedAt[d] ?? Date.parse(`${d}T12:00:00Z`);
  const order = Object.keys(logsFull).sort().sort((a, b) => when(a) - when(b));
  for (const date of order) {
    sofar[date] = logsFull[date];
    const now = earnedIds(defs, souvenirFacts(sofar, countryInfo));
    out[date] = now.filter((id) => !had.has(id));
    had = new Set(now);
  }
  return out;
}

// NEW stamps: passport entries first stamped on the given play date. An entry stores the
// expedition date as day and, when played late, the play date as on (F-U07, F-E03).
export function newStampsOn(passport, playDate, expedition = null) {
  return Object.values(passport).filter((x) => (x.on ?? x.day) === playDate && (!expedition || x.day === expedition)).length;
}

export function countryInfoFrom(features) {
  return new Map(features.filter((f) => f.kind === 'country').map((f) => [f.code, f.continent]));
}
