// Round loop and camp logic. Pure functions over rules.js, no DOM, no storage access.
import {
  TIERS, tierById, tierFor, answerCodeFor, rowsKm, roundKm, bandFor, BANDS, logRow,
  expeditionNumber, isExpired, addDays,
} from './rules.js?v=9d356c3147';

export const DECK_SIZE = 5;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// "2026-10-27" to "27 October 2026".
export function longDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// §2 header: "EXPEDITION #22 · 26 OCTOBER 2026".
export function headerLine(n, dateStr) {
  return `EXPEDITION #${n} · ${longDate(dateStr).toUpperCase()}`;
}

// §17 "Should something else count?": a note the player fills in and copies. Nothing is sent (D3, D8).
export function disputeNote({ n, dateStr, index, prompt, row }) {
  const pin = row.n ? `${row.n} (${tierById(row.t).name})` : row.x ? 'Out of time' : 'No pin';
  return [
    `Ends of the Earth · Expedition #${n} · ${longDate(dateStr)}`,
    `Prompt ${index + 1} of ${DECK_SIZE}: ${promptText(prompt)}`,
    `My pin: ${pin}`,
    'Should also count: ',
    'Source: ',
  ].join('\n');
}

// Which deck a date gets. Before day 1 and after the last deck there is nothing to play (D5).
export function dealFor(dateStr, day1, deckCount) {
  const n = expeditionNumber(dateStr, day1);
  if (n < 1) return { status: 'before', n, opens: day1 };
  if (n > deckCount) return { status: 'after', n, last: deckCount };
  return { status: 'ok', n };
}

export function closedMessage(deal) {
  if (deal.status === 'before') return `Expedition #1 opens on ${longDate(deal.opens)}.`;
  if (deal.status === 'after') return `Expedition #${deal.last} was the last one dealt.`;
  return null;
}

// The manifest names the practice deck relative to data/, like the day decks.
export function practicePath(manifest) {
  return `data/${manifest.practice}`;
}

export function deckPath(n) {
  return `data/decks/day-${String(n).padStart(3, '0')}.json`;
}

// display_text is filled by the content stage; until then the bank text is shown.
export function promptText(prompt) {
  return prompt.display_text || prompt.text_original;
}

// §4 judge one pin. pin = { lng, lat, hit } or null (timeout with no pin).
export function judge(prompt, pin, { timedOut = false, bySearch = false, mask = 0, late = false, noNames = false } = {}) {
  const hit = pin?.hit ?? null;
  const code = answerCodeFor(hit, prompt.answers.map((a) => a.code));
  const answer = code ? prompt.answers.find((a) => a.code === code) : null;
  const tierId = answer ? tierFor(answer.commonness, answer.gem) : 'miss';
  const row = logRow({
    promptId: prompt.id, answer: code, countryCode: hit?.code ?? null, tierId,
    lon: pin ? round3(pin.lng) : null, lat: pin ? round3(pin.lat) : null,
    name: hit?.name ?? null, timedOut, mask, bySearch, late, noNames,
  });
  return { row, answer };
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// §16, §30 the one line under the result. Wording is ours.
export const MISS_LINES = {
  noPin: 'Out of time. The wagons rolled on without you.',
  timedOut: 'Out of time, and not on the list.',
  wrongCountry: 'Not on the list.',
  wrongPlace: 'That place is not on the list.',
};

export function revealLine(row, prompt) {
  if (row.a) {
    const answer = prompt.answers.find((a) => a.code === row.a);
    return answer?.fact || tierById(row.t).name;
  }
  if (row.x && !row.i) return MISS_LINES.noPin;
  if (row.x) return MISS_LINES.timedOut;
  return prompt.accepts === 'country_or_territory' ? MISS_LINES.wrongPlace : MISS_LINES.wrongCountry;
}

// §17 every accepted answer grouped by tier, top tier first, with each group's km.
export function answersByTier(prompt) {
  const groups = [...TIERS].reverse().filter((t) => t.id !== 'miss')
    .map((t) => ({ tier: t.id, name: t.name, km: t.km, answers: [] }));
  const byId = Object.fromEntries(groups.map((g) => [g.tier, g]));
  for (const a of prompt.answers) {
    byId[tierFor(a.commonness, a.gem)].answers.push({ code: a.code, name: a.name, fact: a.fact });
  }
  for (const g of groups) g.answers.sort((x, y) => x.name.localeCompare(y.name));
  return groups.filter((g) => g.answers.length);
}

// Manager ruling on S1: band 0 reads "Still in Nauvoo", any other "Reached <band>".
export function resultLine(km) {
  const band = bandFor(km);
  return band.id === BANDS[0].id ? `Still in ${band.name}` : `Reached ${band.name}`;
}

// N5 stamps are written only once the run is kept: a round the game reports as "not saved"
// leaves no stamp. When a later save succeeds it persists every round, so every earlier
// round that earned an answer is stamped then (store.stamp is idempotent). Returns true when
// the last round's country is new to the passport.
export function stampIfSaved(store, saved, rounds, day, playedOn) {
  if (!saved) return false;
  let isNew = false;
  rounds.forEach((r, i) => {
    if (!r.a) return;
    const n = store.stamp(r.a, r.t, day, r.p, playedOn);
    if (i === rounds.length - 1) isNew = n;
  });
  return isNew;
}

export function runKm(run) {
  return rowsKm(run?.rounds ?? []);
}

// D7 reveal note, our words: "+7 km, no names". Empty when there is no bonus.
export function bonusNote(row) {
  const extra = row.u ? row.pts - roundKm(row.t) : 0;
  return extra > 0 ? `+${extra} km, no names` : '';
}

// Where a saved run stands. n is the 1-based prompt number that is open or next.
export function runPhase(run, now) {
  if (!run) return { phase: 'new', n: 1 };
  if (run.done) return { phase: 'done', n: DECK_SIZE };
  if (run.open) {
    return { phase: isExpired(run.open, now) ? 'expired' : 'open', n: run.open.n };
  }
  return { phase: run.rounds.length ? 'between' : 'new', n: run.rounds.length + 1 };
}

// §2 home note for a past-week day. A day already finished on its own date was not late,
// so viewing it again from the past week must not say it was.
export function lateNote(late, run, phase) {
  if (!late) return '';
  if (phase === 'done' && !run?.late) return '';
  return 'Played late, this day logs but does not count toward your streak.';
}

// §17 footer: time to the next local midnight.
export function opensIn(now) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.ceil((next - now) / 60000));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

export function daysLate(dayDate, playedOn) {
  let n = 0;
  for (let d = dayDate; d < playedOn; d = addDays(d, 1)) n++;
  return n;
}

// "1 day" or "N days" late.
export function daysLateText(dayDate, playedOn) {
  const n = daysLate(dayDate, playedOn);
  return `${n} day${n === 1 ? '' : 's'}`;
}

// §3.3 picker: countries and territories grouped by continent, alphabetical. Disputed areas
// and Northern Cyprus are left out because a pin there is refused anyway.
const OPEN_OCEAN = 'Seven seas (open ocean)';

export function pickerGroups(features) {
  const groups = new Map();
  for (const f of features) {
    if (f.kind === 'disputed' || f.code === 'CYN') continue;
    if (!groups.has(f.continent)) groups.set(f.continent, []);
    groups.get(f.continent).push({ code: f.code, name: f.name });
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === OPEN_OCEAN) - (b === OPEN_OCEAN) || a.localeCompare(b))
    .map(([continent, items]) => ({
      continent: continent === OPEN_OCEAN ? 'Open ocean' : continent,
      items: items.sort((x, y) => x.name.localeCompare(y.name)),
    }));
}

// §28 tier colours, in TIERS order (the spec's spare "guidebook" colour is skipped).
// Church palette (GVSG v1.1): Gray 30/40, Neutral 40/Yellow 40, Green 25/40, Red 15/35, Blue 20/35, Yellow 10/35.
export const TIER_COLORS = {
  miss: { fill: '#878A8C', ink: '#53575B' },
  'home-ward': { fill: '#B3A18D', ink: '#674730' },
  stake: { fill: '#50A83E', ink: '#235C35' },
  mission: { fill: '#E10F5A', ink: '#7D003F' },
  isles: { fill: '#01B6D1', ink: '#005175' },
  ends: { fill: '#FFB81C', ink: '#974A07' },
};

// §4 opacity ramps, in TIERS order. The fill ramp is the tier colour's alpha on the revealed country;
// a miss has alpha 0, so the reveal keeps the plain pick highlight (§16). The second ramp is the outline.
export const TIER_ALPHA = { miss: 0, 'home-ward': 0.32, stake: 0.46, mission: 0.56, isles: 0.64, ends: 0.74 };
export const TIER_LINE_ALPHA = { miss: 1, 'home-ward': 0.85, stake: 0.8875, mission: 0.925, isles: 0.9625, ends: 1 };

// Paint for a reveal: null means the plain highlight (a miss).
export function revealPaint(tierId) {
  if (!TIER_ALPHA[tierId]) return null;
  return { fill: TIER_COLORS[tierId].fill, fillOpacity: TIER_ALPHA[tierId], lineOpacity: TIER_LINE_ALPHA[tierId] };
}

// Saints, the Church's official four-volume history, cited in APA 7 style (owner request 2026-10-27).
// Years checked against the churchofjesuschrist.org saints-v1 to v4 contributors pages.
const SAINTS_AUTHOR = 'The Church of Jesus Christ of Latter-day Saints';
const SAINTS_SERIES = 'Saints: The story of the Church of Jesus Christ in the latter days';
const SAINTS_VOLUMES = {
  1: [2018, 'The standard of truth, 1815–1846'],
  2: [2020, 'No unhallowed hand, 1846–1893'],
  3: [2022, 'Boldly, nobly, and independent, 1893–1955'],
  4: [2024, 'Sounded in every ear, 1955–2020'],
};

// "Saints vol. 4 ch. 27" to the in-text cite and the parts of the full reference; null for any other source.
export function saintsCite(citation) {
  const m = /^Saints vol\. (\d+) ch\. (\d+)$/.exec(citation ?? '');
  const vol = m && SAINTS_VOLUMES[m[1]];
  if (!vol) return null;
  const [year, name] = vol;
  return {
    inText: `Saints, vol. ${m[1]}, ch. ${m[2]} (${SAINTS_AUTHOR}, ${year})`,
    author: `${SAINTS_AUTHOR}.`,
    year,
    title: `${SAINTS_SERIES}: Vol. ${m[1]}. ${name}`,
  };
}
