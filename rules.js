// Game rules for Ends of the Earth. Pure functions, no DOM, no storage access.
// Section numbers (§) point at 00-original-spec.md.

// §4 tiers. Order is low to high. km is the round score.
export const TIERS = [
  { id: 'miss', name: 'Miss', km: 0 },
  { id: 'home-ward', name: 'Home ward', km: 40 },
  { id: 'stake', name: 'Stake', km: 55 },
  { id: 'mission', name: 'Mission', km: 70 },
  { id: 'isles', name: 'Isles of the sea', km: 85 },
  { id: 'ends', name: 'Ends of the earth', km: 100 },
];

const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t]));

// Bank commonness 5 (most named) to 1 (least named).
const TIER_BY_COMMONNESS = { 5: 'home-ward', 4: 'stake', 3: 'mission', 2: 'isles', 1: 'ends' };

export function tierById(id) {
  const t = TIER_BY_ID[id];
  if (!t) throw new Error(`unknown tier: ${id}`);
  return t;
}

// A gem is always the top tier. No answer (wrong country, sea, no pin) is a miss.
export function tierFor(commonness, isGem = false) {
  if (commonness == null) return 'miss';
  if (isGem) return 'ends';
  const id = TIER_BY_COMMONNESS[commonness];
  if (!id) throw new Error(`bad commonness: ${commonness}`);
  return id;
}

// §4 the pinned country counts if listed, or if it is a territory whose sovereign is listed.
// A pin may carry `id` or `code` (hit.js); a territory's kind is `dependency` in our data, `part` in the spec.
const SOVEREIGN_KINDS = new Set(['country', 'part', 'dependency']);

export function answerCodeFor(pin, answerCodes) {
  if (!pin) return null;
  const id = pin.id ?? pin.code;
  const codes = new Set(answerCodes);
  if (id && codes.has(id)) return id;
  if (SOVEREIGN_KINDS.has(pin.kind) && pin.sovereign && codes.has(pin.sovereign)) {
    return pin.sovereign;
  }
  return null;
}

export const EDGE_KM = 500;

// D7 (owner, 2026-10-26): a correct pin in a round played with names off scores 10% more,
// rounded half up to a whole km: Math.round(base * 1.1). 40 to 44, 55 to 61, 70 to 77,
// 85 to 94, 100 to 110. A miss stays 0. The day total is still capped at EDGE_KM.
export const NO_NAMES_BONUS = 0.1;

export function roundKm(tierId, noNames = false) {
  const base = tierById(tierId).km;
  return noNames ? Math.round(base * (1 + NO_NAMES_BONUS)) : base;
}

export function dayKm(tierIds) {
  const sum = tierIds.reduce((acc, id) => acc + roundKm(id), 0);
  return Math.min(EDGE_KM, sum);
}

// Day total from log rows. pts already holds any D7 bonus; rows without pts fall back to the tier.
export function rowsKm(rows) {
  const sum = rows.reduce((acc, r) => acc + (r.pts ?? roundKm(r.t)), 0);
  return Math.min(EDGE_KM, sum);
}

// §4 land bands, by total km. A total sits in the highest band it has reached.
export const BANDS = [
  { id: 'nauvoo', name: 'Nauvoo', min: 0 },
  { id: 'winter-quarters', name: 'Winter Quarters', min: 100 },
  { id: 'chimney-rock', name: 'Chimney Rock', min: 250 },
  { id: 'south-pass', name: 'South Pass', min: 350 },
  { id: 'salt-lake-valley', name: 'Salt Lake Valley', min: 500 },
];

export function bandFor(km) {
  let band = BANDS[0];
  for (const b of BANDS) if (km >= b.min) band = b;
  return band;
}

// §2 dates. A date string is the player's local calendar day, "YYYY-MM-DD".
export function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function addDays(dateStr, n) {
  const ms = (dayIndex(dateStr) + n) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

// A real calendar date in YYYY-MM-DD form. 2026-13-45 and 2026-02-30 are not.
export function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d) && addDays(d, 0) === d;
}

// Whole days from day 1 to the given date, plus 1. Before day 1 gives 0 or less.
export function expeditionNumber(localDate, day1Date) {
  return dayIndex(localDate) - dayIndex(day1Date) + 1;
}

// §2 past week: the 7 days before today, newest first, never before day 1.
export function pastWeekDates(today, day1Date) {
  const out = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    if (dayIndex(d) >= dayIndex(day1Date)) out.push(d);
  }
  return out;
}

// §2 a day played after its own date is late and never counts toward the streak.
export function isLate(dayDate, playedOnDate) {
  return dayIndex(playedOnDate) > dayIndex(dayDate);
}

// §5 clock. open = { n, at, secs, clock } with at in epoch ms, saved when the round starts.
export const CLOCKS = { relaxed: 60, standard: 30 };
export const GRACE_MS = 3000;

// D7 noNames is read once, when the round opens, like the clock. Turning names on during the
// round clears it for good (namesTurnedOn), so a mid-round toggle can never earn the bonus.
// m (owner call 3, 2026-10-27): the assist bits are fixed when the round opens. A bit turned
// off later never counts; a bit switched back on before the drop is cleared (assistsTurnedOn).
export function openRound(n, at, clock = 'relaxed', namesOn = true, bordersOn = true) {
  const secs = CLOCKS[clock];
  if (!secs) throw new Error(`unknown clock: ${clock}`);
  return { n, at, secs, clock, noNames: namesOn === false, m: assistMask({ names: namesOn, borders: bordersOn, clock }) };
}

export function namesTurnedOn(open, namesOn) {
  return open && open.noNames && namesOn !== false ? { ...open, noNames: false } : open;
}

// Settings changed during a round: any assist switched back on clears its bit for the round.
export function assistsTurnedOn(open, settingsNow) {
  if (!open) return open;
  const next = namesTurnedOn(open, settingsNow.names);
  if (next.m == null) return next;
  const m = next.m & assistMask({ ...settingsNow, clock: next.clock });
  return m === next.m ? next : { ...next, m };
}

// A round's bits: those fixed at open and still set when it is judged. Rounds saved before m
// existed fall back to the settings now.
export function roundMask(open, settingsNow) {
  const now = assistMask({ ...settingsNow, clock: open.clock });
  return (open.m ?? now) & now;
}

// The bits every row of a day shares: a day is "hard" for a bit only if all 5 rounds were.
export function dayMask(rows) {
  return rows.reduce((m, r) => m & (r.m ?? 0), 0b111);
}

// The bonus needs names off when the round opened and still off when it is judged.
// A pick from the search box shows names, so it never earns the bonus (owner call 1).
// Ruling 22: any search pick in the round (open.searched) voids it, even if the final pin is a tap.
export function earnsNoNamesBonus(open, settingsNow, bySearch = false) {
  return !bySearch && !open?.searched && !!open?.noNames && settingsNow?.names === false;
}

export function isExpired(open, now) {
  return now >= open.at + open.secs * 1000;
}

export function secondsLeft(open, now) {
  const elapsed = (now - open.at) / 1000;
  return Math.max(0, Math.ceil(open.secs - elapsed));
}

// A drop sent up to 3 s after the clock runs out still counts as a drop.
export function dropAccepted(open, dropAt) {
  return dropAt <= open.at + open.secs * 1000 + GRACE_MS;
}

// §16, §30 at timeout a held pin is judged as if dropped; with no pin it is a miss.
// Either way the round is marked timed out.
export function timeoutOutcome(heldPin) {
  return { pin: heldPin ?? null, timedOut: true };
}

// §8 stats from logs. logs = { "<date>": { km, late } } for finished days.
export function streak(logs, today) {
  const onTime = (d) => logs[d] && !logs[d].late;
  let day = onTime(today) ? today : addDays(today, -1);
  let n = 0;
  while (onTime(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function stats(logs, today) {
  const days = Object.keys(logs);
  const kms = days.map((d) => logs[d].km);
  return {
    played: days.length,
    streak: streak(logs, today),
    best: kms.length ? Math.max(...kms) : 0,
    average: kms.length ? Math.round(kms.reduce((a, b) => a + b, 0) / kms.length) : 0,
  };
}

// §6 assists. Each one turned off adds a bit and one asterisk.
export const ASSIST_BITS = { namesOff: 1, bordersOff: 2, shortClock: 4 };

export function assistMask(settings) {
  let m = 0;
  if (settings.names === false) m |= ASSIST_BITS.namesOff;
  if (settings.borders === false) m |= ASSIST_BITS.bordersOff;
  if (settings.clock === 'standard') m |= ASSIST_BITS.shortClock;
  return m;
}

export function asterisks(mask) {
  let s = '';
  for (const bit of Object.values(ASSIST_BITS)) if (mask & bit) s += '*';
  return s;
}

// §7 share text: 2 lines, then the link to this result's card (owner, 2026-10-28, ends D2's no-link rule
// now the game is hosted). Messages turn the link into a preview card: tools/build_share_cards.py draws one
// page and picture per pattern, named by each round's index in TIERS.
export const GAME_NAME = 'Ends of the Earth';
export const SITE_URL = 'https://bjepp77.github.io/ends-of-the-earth/';

export function shareCode(tierIds) {
  return tierIds.map((id) => TIERS.indexOf(tierById(id))).join('');
}

export function formatKm(n) {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// km is the day total from the log rows (it can include the D7 bonus); without it the tiers decide.
export function shareText({ n, tierIds, km = dayKm(tierIds), mask = 0, usedSearch = false }) {
  const line1 = `${GAME_NAME} #${n} · ${formatKm(km)}/${formatKm(EDGE_KM)} km${asterisks(mask)}${usedSearch ? ' · ⌕' : ''}`;
  const line2 = tierIds.map((id) => tierById(id).name).join(' · ');
  return `${line1}\n${line2}\n${SITE_URL}s/${shareCode(tierIds)}.html`;
}

// §7 replay share. Our replay is a late past-week day: unranked, km and asterisks only, two lines (D2).
export function replayShareText({ n, km, mask = 0 }) {
  return `${GAME_NAME} · Expedition #${n} replay · unranked\n${formatKm(km)} km${asterisks(mask)}`;
}

// §8, §20 storage keys and shapes.
export const PREFIX = 'ends:';
export const OWNER_KEY = `${PREFIX}owner`;

export function recordPrefix(slot) {
  return `${PREFIX}record:v1:${slot}:`;
}

export const keys = {
  owner: () => OWNER_KEY,
  asked: (slot) => `${recordPrefix(slot)}asked`,
  imported: (slot) => `${recordPrefix(slot)}imported`,
  corrected: (slot) => `${recordPrefix(slot)}corrected`,
  passport: (slot) => `${recordPrefix(slot)}passport`,
  stamps: (slot) => `${recordPrefix(slot)}stamps`,
  settings: (slot) => `${recordPrefix(slot)}settings`,
  run: (slot, date) => `${recordPrefix(slot)}run:${date}`,
  log: (slot, date) => `${recordPrefix(slot)}log:${date}`,
  souvenirsShown: (slot) => `${recordPrefix(slot)}souvenirs-shown`,
};

export function newOwner(slot, generation) {
  return { owner: 'guest', generation, storage: 1, slot };
}

export function defaultSettings() {
  return { search: false, sound: true, names: true, borders: true, clock: 'relaxed' };
}

export function newRun(id, admittedAt) {
  return { kind: 'first-play', id, admittedAt, rounds: [], open: null };
}

// One log row per prompt (spec §20 field letters).
// u (ours, D7): the bonus was earned (names off from start to judgement, not a miss); pts includes it.
export function logRow({ promptId, answer, countryCode, tierId, lon, lat, name, timedOut, stamp = null, mask = 0, bySearch = false, late = false, noNames = false }) {
  const row = {
    p: promptId, a: answer ?? null, i: countryCode ?? null, t: tierId, pts: roundKm(tierId, noNames),
    lon, lat, n: name, x: !!timedOut, s: stamp, m: mask,
  };
  if (noNames && row.pts > 0) row.u = true;
  if (bySearch) row.b = true;
  if (late) row.l = true;
  return row;
}

export function stampKey(code, tierId) {
  return `${code}:${tierId}`;
}
