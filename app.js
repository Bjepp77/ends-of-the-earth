// Home, round loop and camp. Numbers come from rules.js, logic from game.js.
import { loadCountries, createMap } from './map.js';
import { REFUSAL_TEXT } from './hit.js';
import * as R from './rules.js';
import * as G from './game.js';
import { createStore } from './store.js';
import { createMenu } from './menu.js';
import { createSound } from './sound.js';
import { shareOrCopy } from './share.js';
import { createTrail } from './trail.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const REVEAL_LOCK_MS = 900;
const TYPE_MS = 18;
const RED_SECS = 10;
// F-U08 the dial is hidden from screen readers, so time left is spoken at these marks.
const CLOCK_CUES = [30, 10];

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } };
  }
}

const [config, manifest, countries, souvenirs] = await Promise.all([
  fetchJSON('config.json'), fetchJSON('data/manifest.json'), loadCountries(), fetchJSON('data/souvenirs.json'),
]);
const store = createStore(safeStorage(), config.slot);
store.ensureOwner(uuid());

const S = {
  mode: 'home', practice: false, date: null, late: false, deal: null,
  deck: null, run: null, prompt: null, settings: store.settings(),
  open: null, timer: 0, typer: 0, revealReadyAt: 0, refusals: 0,
  // F2 true when the last write of this run was refused by storage.
  unsaved: false,
};

// ?date=YYYY-MM-DD&debug is a local test hook: it stands in for today's date.
// Without &debug, or with an impossible date, it is ignored.
function today() {
  const d = params.get('date');
  return DEBUG && R.isValidDate(d) ? d : R.localDateString(new Date());
}

// #play=<date> opens a past-week day (late play). Anything else is today.
function target() {
  const t = today();
  const m = location.hash.match(/^#play=(\d{4}-\d\d-\d\d)$/);
  if (m && R.pastWeekDates(t, config.day1).includes(m[1])) return { date: m[1], late: true };
  return { date: t, late: false };
}

const sound = createSound({ enabled: S.settings.sound });
renderSpeaker();

const view = createMap({ container: $('map'), data: countries, onPin });
await view.ready;
$('loading').hidden = true;
if (DEBUG) {
  $('debug').hidden = false;
  window.ends = { view, S, store };
}

function showScreen(id) {
  for (const s of ['home', 'round', 'camp']) $(s).hidden = s !== id;
  $('title-card').hidden = id !== 'home';
  $('below').hidden = id !== 'home';
  $('hud-dist').hidden = id !== 'round';
  $('hud-line').hidden = id === 'round';
}

function stopTimers() {
  clearInterval(S.timer);
  clearInterval(S.typer);
  S.timer = S.typer = 0;
}

// F-U01 two tabs on one day: each write checks that storage still holds the version this tab
// read. If another tab moved the run on, this tab stops and goes home instead of overwriting.
function runFresh() {
  return (store.run(S.date)?.v ?? 0) === (S.run?.v ?? 0);
}

function saveRun() {
  if (S.practice) return true;
  if (!runFresh()) {
    conflict();
    return false;
  }
  S.run.v = (S.run.v ?? 0) + 1;
  // R2-L02 a failed write leaves storage on the old version, so the next check would blame
  // another tab. Roll the version back: play goes on, nothing is kept (store.js).
  // F2 the failure is kept in S.unsaved so the player is told the result was not saved.
  S.unsaved = !store.saveRun(S.date, S.run);
  if (S.unsaved) S.run.v -= 1;
  return true;
}

function conflict() {
  stopTimers();
  goHome();
  $('home-msg').textContent = 'This expedition moved on in another tab.';
}

function tierStamp(el, tierId) {
  const t = R.tierById(tierId);
  el.textContent = t.name.toUpperCase();
  el.style.setProperty('--tier-ink', G.TIER_COLORS[tierId].ink);
  el.style.setProperty('--tier-fill', G.TIER_COLORS[tierId].fill);
}

function kmText(pts) {
  return pts ? `+${R.formatKm(pts)} km` : '0 km';
}

// ---------- home ----------

function goHome() {
  stopTimers();
  S.mode = 'home';
  S.practice = false;
  view.lock(true);
  view.clearPin();
  view.setFlags([]);
  view.resetView();
  view.setNames(S.settings.names);
  view.setBorders(S.settings.borders);
  $('dial').hidden = true;
  $('noclock').hidden = true;
  $('stamp-card').hidden = true;

  const { date, late } = target();
  S.date = date;
  S.late = late;
  S.homeToday = today();
  S.deal = G.dealFor(date, config.day1, manifest.decks);
  showScreen('home');

  const play = $('play');
  const wait = $('home-wait');
  const streakLine = $('home-streak');
  play.hidden = wait.hidden = streakLine.hidden = true;
  $('title-sub').textContent = 'THE DAILY EXPEDITION';
  $('home-msg').textContent = '';

  if (S.deal.status !== 'ok') {
    $('hud-line').textContent = G.longDate(date).toUpperCase();
    $('home-msg').textContent = G.closedMessage(S.deal);
    return;
  }
  $('hud-line').textContent = G.headerLine(S.deal.n, date);
  const run = store.run(date);
  const phase = G.runPhase(run, Date.now());
  $('home-msg').textContent = G.lateNote(late, run, phase.phase);
  play.hidden = false;
  if (phase.phase === 'done') {
    const km = G.runKm(run);
    $('title-sub').textContent = `${late ? 'THAT DAY' : 'TODAY'}: ${R.formatKm(km)} KM · ${R.bandFor(km).name.toUpperCase()}`;
    play.textContent = late ? 'VIEW RESULTS' : "VIEW TODAY'S RESULTS";
    renderHomeStreak();
    streakLine.hidden = false;
  } else if (phase.phase === 'new') {
    play.textContent = late ? `PLAY EXPEDITION #${S.deal.n}` : 'PLAY DAILY EXPEDITION';
  } else {
    play.textContent = 'RESUME EXPEDITION';
    wait.textContent = `PROMPT ${phase.n} OF ${G.DECK_SIZE} IS WAITING`;
    wait.hidden = false;
  }
}

function renderHomeStreak() {
  const { h, m } = G.opensIn(new Date());
  const st = R.stats(store.logs(), today()).streak;
  $('home-streak').textContent = `${st}-DAY STREAK · NEXT IN ${h} H ${m} M`;
}

// §2 a new expedition opens at local midnight. The date is checked again on a timer, when the
// tab comes back into view, and at the moment UTC+14 reaches a new date, so a page left open
// overnight moves on and its countdowns keep running.
const RECHECK_MS = 30_000;

function checkDate() {
  if (S.mode === 'home') {
    if (today() !== S.homeToday) goHome();
    else if (!$('home-streak').hidden) renderHomeStreak();
  } else if (S.mode === 'camp') {
    // R2-L03 camp left open past midnight goes home, so today's new expedition shows.
    // J-01 a #play= late day would keep home on that day, so the hash is cleared first.
    if (today() !== S.campToday) {
      if (location.hash.startsWith('#play=')) history.replaceState(null, '', location.pathname + location.search);
      goHome();
    }
    else renderCampNext();
  }
}

// Spec §2: the first time zone (UTC+14) reaches a new date at 10:00 UTC. Capped at 24 h,
// plus 1 s and a little jitter.
function scheduleUtc14Recheck() {
  const now = Date.now();
  const next = Math.ceil((now - 10 * 3600_000 + 1) / 86400_000) * 86400_000 + 10 * 3600_000;
  const wait = Math.min(next - now, 86400_000) + 1000 + Math.floor(Math.random() * 5000);
  setTimeout(() => { checkDate(); scheduleUtc14Recheck(); }, wait);
}

// Late is decided when a day is played, not when home was drawn: a round that opens after
// the day's own date makes the day late.
function lateNow() {
  return S.late || R.isLate(S.date, today());
}

// ---------- round ----------

async function startDay() {
  // A home screen drawn before midnight must not start yesterday's deck as today's.
  if (target().date !== S.date) return goHome();
  S.practice = false;
  S.deck = await fetchJSON(G.deckPath(S.deal.n));
  S.settings = store.settings();
  S.run = store.run(S.date) ?? R.newRun(uuid(), Date.now());
  S.unsaved = false;
  // A finished day keeps the late flag it was played with; viewing it later is not late play.
  if (S.run.done) return showCamp();
  if (S.late) S.run.late = true;
  const phase = G.runPhase(S.run, Date.now());
  if (phase.phase === 'open' || phase.phase === 'expired') return enterRound();
  openNext();
}

// §2 the day turns late once today passes its date: the session flag and the run both carry it.
function markLate() {
  if (!S.late && lateNow()) {
    S.late = true;
    S.run.late = true;
  }
}

function openNext() {
  markLate();
  S.run.open = R.openRound(S.run.rounds.length + 1, Date.now(), S.settings.clock, S.settings.names, S.settings.borders);
  S.run.held = null;
  if (!saveRun()) return;
  enterRound();
}

// F-U05 a daily prompt is open: on screen, or saved with its clock still running.
// R2-L04 every stored run is checked, so a late round left open on another day counts too.
// R3-L01 RESUME on a late day passes that day as exceptDate, so its own open run does not block it.
function roundOpen(exceptDate) {
  if (S.mode === 'round' && !S.practice) return true;
  const now = Date.now();
  return store.runs().some(([date, run]) => date !== exceptDate && G.runPhase(run, now).phase === 'open');
}

async function startPractice() {
  if (roundOpen()) return;
  const deck = await fetchJSON(G.practicePath(manifest));
  S.practice = true;
  S.settings = store.settings();
  S.deck = deck;
  S.run = { rounds: [], open: { n: 1, at: Date.now(), secs: Infinity, clock: 'none', noNames: S.settings.names === false } };
  enterRound();
}

function enterRound() {
  stopTimers();
  // §19 read the held pin first: clearPin below fires the pin handler, which clears run.held.
  const held = S.run.held;
  S.mode = 'round';
  S.open = S.run.open;
  S.prompt = S.deck.prompts[S.open.n - 1];
  showScreen('round');
  view.setNames(S.settings.names);
  view.setBorders(S.settings.borders);
  view.setFlags([]);
  view.clearPin();
  view.resetView();
  view.lock(false);
  $('stamp-card').hidden = true;
  $('result').hidden = true;
  $('trail').hidden = false;
  $('hint').hidden = false;
  $('summary').textContent = '';
  $('clock-say').textContent = '';
  S.clockSaid = Infinity;
  $('prompt-n').textContent = S.practice ? 'PRACTICE ROUND' : `PROMPT ${S.open.n} OF ${G.DECK_SIZE}`;
  renderSearch();
  renderHud(G.runKm(S.run));

  // §19 a held pin survives a reload.
  if (held?.code) view.placeFeature(held.code);
  else if (held) view.place({ lng: held.lng, lat: held.lat });
  renderDrop();

  sound.roundStart();
  typePrompt(G.promptText(S.prompt));
  $('dial').hidden = S.practice;
  $('noclock').hidden = !S.practice;
  if (!S.practice) {
    tick();
    S.timer = setInterval(tick, 200);
  }
}

// §15 the prompt types itself in.
function typePrompt(text) {
  const el = $('prompt-text');
  el.textContent = '';
  el.setAttribute('aria-label', text);
  // F-U08 the typed node changes every few ms, so the full prompt is announced once from its own node.
  $('prompt-say').textContent = text;
  let i = 0;
  S.typer = setInterval(() => {
    i += 1;
    el.textContent = text.slice(0, i);
    if (i % 3 === 0) sound.type();
    if (i >= text.length) clearInterval(S.typer);
  }, TYPE_MS);
}

function renderSearch() {
  const wrap = $('search-wrap');
  wrap.hidden = !S.settings.search;
  if (!S.settings.search) return;
  const sel = $('search');
  if (sel.options.length < 2) {
    for (const g of G.pickerGroups(countries.features)) {
      const og = document.createElement('optgroup');
      og.label = g.continent;
      for (const it of g.items) og.appendChild(new Option(it.name, it.code));
      sel.appendChild(og);
    }
  }
  sel.value = '';
  sel.disabled = false;
}

function tick() {
  const now = Date.now();
  const secs = R.secondsLeft(S.open, now);
  const dial = $('dial');
  $('dial-secs').textContent = String(secs);
  dial.style.setProperty('--left', String(Math.max(0, 1 - (now - S.open.at) / (S.open.secs * 1000))));
  dial.classList.toggle('dial--red', secs <= RED_SECS);
  for (const c of CLOCK_CUES) {
    if (secs <= c && c < S.open.secs && S.clockSaid > c) { S.clockSaid = c; $('clock-say').textContent = `${c} seconds left`; }
  }
  // The dial reads 0 at expiry; the round stays open for the 3 s drop grace (F-L06).
  if (!R.dropAccepted(S.open, now)) timeout();
}

let trail = null;
let campTrail = null;

function renderHud(km) {
  $('hud-km').textContent = R.formatKm(km);
  $('hud-meter').style.width = `${(km / R.EDGE_KM) * 100}%`;
  $('hud-band').textContent = R.bandFor(km).name.toUpperCase();
  // The wagon walks only after a reveal; any other redraw (new round, reload, new day) jumps.
  trail ??= createTrail($('trail-map'));
  trail.set(km, { jump: S.mode !== 'reveal' });
  const list = $('trail-list');
  list.textContent = '';
  for (const b of [...R.BANDS].reverse()) {
    const li = document.createElement('li');
    li.textContent = b.name;
    if (km >= b.min) li.className = 'reached';
    if (R.bandFor(km).id === b.id) li.classList.add('here');
    list.appendChild(li);
  }
}

function coords(pin) {
  const lng = ((((pin.lng + 180) % 360) + 360) % 360) - 180;
  return `${Math.abs(pin.lat).toFixed(2)}°${pin.lat >= 0 ? 'N' : 'S'} ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`;
}

function renderDrop(message) {
  const pin = view.pin;
  const drop = $('drop');
  const out = $('readout');
  if (S.mode !== 'round') return;
  drop.textContent = 'DROP PIN';
  drop.className = 'drop';
  drop.classList.toggle('drop--ready', !!pin && !pin.refusal);
  drop.classList.toggle('drop--refused', !!pin && !!pin.refusal);
  drop.setAttribute('aria-disabled', String(!pin || !!pin.refusal));
  out.classList.toggle('readout--warn', !!message || !!pin?.refusal);
  if (message) out.textContent = message;
  else if (!pin) out.textContent = 'tap to pin';
  else if (pin.refusal) out.textContent = REFUSAL_TEXT[pin.refusal];
  else out.textContent = `PIN ${S.settings.names ? pin.hit.name : coords(pin)}`;
}

function onPin(pin) {
  if (DEBUG) {
    $('hit-json').textContent = pin
      ? JSON.stringify({ ...pin.hit, refusal: pin.refusal, lng: +pin.lng.toFixed(4), lat: +pin.lat.toFixed(4) }, null, 1)
      : 'no pin';
  }
  if (S.mode !== 'round') return;
  // Ruling 22: a search pick marks the whole round, and the mark is saved with the open round.
  if (pin?.bySearch && S.run.open) S.run.open.searched = true;
  if (!S.practice) {
    S.run.held = pin ? (pin.bySearch ? { code: pin.hit.code } : { lng: pin.lng, lat: pin.lat }) : null;
    if (!saveRun()) return;
  }
  if (pin) sound.pin();
  renderDrop();
}

function refuse(message) {
  S.refusals += 1;
  sound.refuse();
  if (!S.practice) {
    S.run.refused = (S.run.refused ?? 0) + 1;
    if (!saveRun()) return;
  }
  renderDrop(message);
}

function tryDrop() {
  if (S.mode !== 'round') return;
  const pin = view.pin;
  if (!pin) return refuse(REFUSAL_TEXT.none);
  if (pin.refusal) return refuse();
  if (!S.practice && !R.dropAccepted(S.open, Date.now())) return timeout();
  finish(pin, false);
}

// §16, §30 at timeout a held pin on a country is judged; a refused pin counts as no pin.
function timeout() {
  if (S.mode !== 'round') return;
  const pin = view.pin && !view.pin.refusal ? view.pin : null;
  finish(pin, true);
}

function finish(pin, timedOut) {
  stopTimers();
  if (!S.practice && !runFresh()) return conflict();
  // F1 a round opened before midnight and finished after it is judged late.
  if (!S.practice) markLate();
  $('prompt-text').textContent = G.promptText(S.prompt);
  const mask = R.roundMask(S.open, S.settings);
  const bySearch = !!pin?.bySearch || !!S.open.searched;
  const noNames = R.earnsNoNamesBonus(S.open, S.settings, bySearch);
  const { row } = G.judge(S.prompt, pin, { timedOut, bySearch, mask, late: S.late && !S.practice, noNames });
  let isNew = false;
  if (!S.practice) {
    if (row.a) {
      isNew = store.stamp(row.a, row.t, S.date, S.prompt.id, today());
      row.s = R.stampKey(row.a, row.t);
    }
    const z = Math.round(view.map.getZoom() * 10) / 10;
    S.run.rounds.push({ ...row, c: row.i, z, k: S.open.clock });
    S.run.open = null;
    S.run.held = null;
    if (S.run.rounds.length === G.DECK_SIZE) {
      S.run.done = true;
      S.run.completedAt = Date.now();
      S.run.playedOn = today();
      // §22 a day logs when its last pin lands. F2 the log and the finished run are kept
      // together or not at all: a refused log skips the run write, a refused run drops the log.
      if (store.saveLog(S.date, S.run.rounds.map(({ c, z: _z, k, ...r }) => r))) {
        if (!saveRun()) return;
        if (S.unsaved) store.removeLog(S.date);
      } else {
        S.unsaved = true;
      }
    } else if (!saveRun()) return;
  }
  showReveal(row, isNew);
}

// ---------- reveal ----------

function showReveal(row, isNew) {
  S.mode = 'reveal';
  S.revealReadyAt = Date.now() + REVEAL_LOCK_MS;
  view.lock(true);
  $('dial').hidden = true;
  $('clock-say').textContent = '';
  $('noclock').hidden = true;
  $('search-wrap').hidden = true;
  $('hint').hidden = true;

  const tier = R.tierById(row.t);
  const place = row.n ?? 'No pin';
  $('sc-n').textContent = S.practice ? 'PRACTICE PIN' : `PIN ${S.open.n} OF ${G.DECK_SIZE}`;
  $('sc-name').textContent = place.toUpperCase();
  tierStamp($('sc-tier'), row.t);
  $('sc-km').textContent = kmText(row.pts);
  $('sc-new').hidden = !isNew;
  $('stamp-card').hidden = false;

  tierStamp($('r-tier'), row.t);
  const bonus = G.bonusNote(row);
  $('r-km').textContent = bonus ? `${kmText(row.pts)} (${bonus})` : kmText(row.pts);
  sound.reveal(R.roundKm(row.t));
  $('r-name').textContent = row.n ? `“${row.n}”` : 'No pin';
  $('r-line').textContent = G.revealLine(row, S.prompt);
  setOptional('r-stamp', S.prompt.stamp ? `Facts ${S.prompt.stamp}.` : '');
  setOptional('r-note', S.prompt.note ?? '');
  setOptional('r-summary', S.prompt.summary ?? '');
  setCite(S.prompt.citation);
  fillAnswers($('r-answers').querySelector('div'), S.prompt);
  $('r-answers').open = false;
  $('result').hidden = false;
  // Frame the country above the stamp card, once the reveal layout is in (the map is shorter then at 390),
  // so the fill and a miss sign are not hidden under the card.
  if (row.i) view.reveal(row.i, G.revealPaint(row.t), $('stamp-card').getBoundingClientRect().top);
  $('summary').textContent = `${place}: ${tier.name}, ${kmText(row.pts)}.${isNew ? ' New Location' : ''}`;

  const last = S.practice || S.open.n === G.DECK_SIZE;
  const drop = $('drop');
  drop.className = 'drop drop--next';
  drop.setAttribute('aria-disabled', 'false');
  drop.textContent = S.practice ? 'RETURN HOME' : last ? 'ON TO CAMP ↑' : 'NEXT PROMPT ↑';
  $('readout').textContent = '';
  $('readout').classList.remove('readout--warn');
  if (!S.practice && S.unsaved) {
    $('readout').textContent = 'Not saved. This device would not store this result.';
    $('readout').classList.add('readout--warn');
  }
  // §30 the HUD distance updates after the reveal.
  setTimeout(() => { if (S.mode === 'reveal') renderHud(G.runKm(S.run)); }, REVEAL_LOCK_MS);
}

// Saints sources get the APA in-text cite plus the full reference, with the titles in <i>.
// Returns the parts of each line, or null; the reveal and the camp dropdowns both use it.
function citeParts(citation) {
  if (!citation) return null;
  const saints = G.saintsCite(citation);
  if (!saints) return { cite: [`Source: ${citation}`], ref: null };
  const italic = (text) => {
    const i = document.createElement('i');
    i.textContent = text;
    return i;
  };
  return {
    cite: ['Source: ', italic('Saints'), saints.inText.slice('Saints'.length)],
    ref: [`${saints.author} (${saints.year}). `, italic(saints.title), '.'],
  };
}

function setCite(citation) {
  const parts = citeParts(citation);
  $('r-cite').replaceChildren(...(parts?.cite ?? []));
  $('r-cite').hidden = !parts;
  $('r-ref').replaceChildren(...(parts?.ref ?? []));
  $('r-ref').hidden = !parts?.ref;
}

function setOptional(id, text) {
  $(id).textContent = text;
  $(id).hidden = !text;
}

function fillAnswers(el, prompt, row) {
  el.textContent = '';
  if (row) {
    const p = document.createElement('p');
    p.className = 'fine';
    p.textContent = G.promptText(prompt);
    el.appendChild(p);
  }
  for (const g of G.answersByTier(prompt)) {
    const h = document.createElement('p');
    h.className = 'ans-tier';
    h.textContent = `${g.name.toUpperCase()} · ${g.km} km`;
    h.style.color = G.TIER_COLORS[g.tier].ink;
    el.appendChild(h);
    const ul = document.createElement('ul');
    for (const a of g.answers) {
      const li = document.createElement('li');
      li.textContent = a.name;
      if (a.fact) li.title = a.fact;
      if (row?.a === a.code) li.className = 'mine';
      ul.appendChild(li);
    }
    el.appendChild(ul);
  }
  if (prompt.note) {
    const n = document.createElement('p');
    n.className = 'fine';
    n.textContent = prompt.note;
    el.appendChild(n);
  }
  // Camp only: the reveal shows the summary in #r-summary instead.
  if (row && prompt.summary) {
    const s = document.createElement('p');
    s.className = 'fact-summary';
    s.textContent = prompt.summary;
    el.appendChild(s);
  }
  // Camp only: the reveal shows the source in #r-cite and #r-ref.
  const parts = row && citeParts(prompt.citation);
  if (parts) {
    for (const [cls, nodes] of [['fine cite', parts.cite], ['fine cite-ref', parts.ref]]) {
      if (!nodes) continue;
      const c = document.createElement('p');
      c.className = cls;
      c.replaceChildren(...nodes);
      el.appendChild(c);
    }
  }
}

function advance() {
  if (S.mode !== 'reveal' || Date.now() < S.revealReadyAt) return;
  if (S.practice) return goHome();
  if (S.run.done) {
    sound.camp();
    return showCamp();
  }
  openNext();
}

// ---------- camp ----------

function showCamp() {
  stopTimers();
  S.mode = 'camp';
  S.campToday = today();
  showScreen('camp');
  view.lock(true);
  view.clearPin();
  view.resetView();
  $('dial').hidden = true;
  $('stamp-card').hidden = true;

  const rounds = S.run.rounds;
  const km = G.runKm(S.run);
  $('hud-line').textContent = `EXPEDITION #${S.deal.n} · COMPLETE`;
  view.setFlags(rounds.map((r, i) => ({ r, i })).filter(({ r }) => r.lon != null).map(({ r, i }) => ({
    lng: r.lon, lat: r.lat, n: i + 1,
    cls: i === rounds.length - 1 ? 'flag--last' : r.a ? 'flag--hit' : 'flag--miss',
  })));

  const rows = $('camp-rows');
  rows.textContent = '';
  rounds.forEach((r, i) => {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.textContent = String(i + 1);
    const st = document.createElement('span');
    st.className = 'tier-stamp';
    tierStamp(st, r.t);
    li.append(num, st);
    rows.appendChild(li);
  });
  $('poster-km').textContent = R.formatKm(km);
  $('poster-band').textContent = G.resultLine(km);
  campTrail ??= createTrail($('camp-trail-map'));
  campTrail.set(km, { jump: true });

  const mask = R.dayMask(rounds);
  // §7 a late past-week day is our replay: it shares as unranked.
  const text = S.run.late
    ? R.replayShareText({ n: S.deal.n, km, mask })
    : R.shareText({ n: S.deal.n, tierIds: rounds.map((r) => r.t), km, mask, usedSearch: rounds.some((r) => r.b) });
  $('share').dataset.shareText = text;
  $('share').textContent = 'SHARE';

  if (S.run.late) {
    const playedOn = S.run.playedOn ?? (S.run.completedAt ? R.localDateString(new Date(S.run.completedAt)) : today());
    $('camp-line').textContent = `Played ${G.daysLateText(S.date, playedOn)} late, ${S.unsaved ? 'not logged' : 'logged'}, with no streak.`;
  } else {
    $('camp-line').textContent = `${R.stats(store.logs(), today()).streak}-DAY STREAK`;
  }

  $('camp-saved').textContent = S.unsaved
    ? 'Not saved. This device would not store this expedition.'
    : 'Saved on this device only.';
  menu.renderCampTiles($('camp-tiles'), S.date);

  const list = $('camp-answers');
  list.textContent = '';
  rounds.forEach((r, i) => {
    const prompt = S.deck.prompts[i];
    const item = document.createElement('details');
    item.className = 'answers camp-answer';
    const sum = document.createElement('summary');
    const st = document.createElement('span');
    st.className = 'tier-stamp';
    tierStamp(st, r.t);
    const where = r.n ?? (r.x ? 'Out of time' : 'No pin');
    sum.append(`${i + 1} `, st, ` ${where} · ${kmText(r.pts)}`);
    item.appendChild(sum);
    const body = document.createElement('div');
    fillAnswers(body, prompt, r);
    body.appendChild(disputeBox(i, prompt, r));
    item.appendChild(body);
    list.appendChild(item);
  });

  renderCampNext();
}

// §17 "SHOULD SOMETHING ELSE COUNT?": opens a note the player can fill in and copy.
// Nothing leaves the device: no mail link, no request (D3, D8).
function disputeBox(i, prompt, row) {
  const wrap = document.createElement('div');
  wrap.className = 'dispute';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'textlink dispute-btn';
  btn.textContent = 'SHOULD SOMETHING ELSE COUNT?';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', `dispute-${i}`);
  const box = document.createElement('div');
  box.className = 'dispute-box';
  box.id = `dispute-${i}`;
  box.hidden = true;
  const help = document.createElement('p');
  help.className = 'fine';
  help.textContent = 'Add the country and a source, then copy the note and pass it to whoever keeps this game. Nothing is sent from here. Decisions go on the Rulings page.';
  const note = document.createElement('textarea');
  note.className = 'dispute-note';
  note.rows = 7;
  note.setAttribute('aria-label', `Note about prompt ${i + 1}`);
  note.value = G.disputeNote({ n: S.deal.n, dateStr: S.date, index: i, prompt, row });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'dispute-copy';
  copy.textContent = 'COPY NOTE';
  copy.onclick = () => shareOrCopy(copy, note.value, 'COPY NOTE');
  btn.onclick = () => {
    box.hidden = !box.hidden;
    btn.setAttribute('aria-expanded', String(!box.hidden));
  };
  box.append(help, note, copy);
  wrap.append(btn, box);
  return wrap;
}

function renderCampNext() {
  const next = G.dealFor(R.addDays(today(), 1), config.day1, manifest.decks);
  if (next.status === 'ok') {
    const { h, m } = G.opensIn(new Date());
    $('camp-next').textContent = `EXPEDITION #${next.n} OPENS IN ${h} H ${m} M`;
  } else {
    $('camp-next').textContent = G.closedMessage(next);
  }
}

// ---------- wiring ----------

// F-U06 a mouse click on a map control drops focus, so Space and Enter go back to dropping the pin.
// A keyboard press (detail 0) keeps focus on the control.
const mapCtl = (fn) => (e) => { fn(); if (e.detail) e.currentTarget.blur(); };
$('zoom-in').onclick = mapCtl(() => view.zoomIn());
$('zoom-out').onclick = mapCtl(() => view.zoomOut());
$('reset').onclick = mapCtl(() => view.resetView());
$('play').onclick = () => startDay();
$('practice').onclick = () => menu.open('howto');
$('menu-btn').onclick = () => (menu.isOpen ? menu.close() : menu.open());
$('home-btn').onclick = () => { if (location.hash) history.replaceState(null, '', location.pathname + location.search); goHome(); };
// §11 FAQ accordion and the footer's way back up.
for (const q of document.querySelectorAll('.faq-q')) {
  q.onclick = () => {
    const open = q.getAttribute('aria-expanded') !== 'true';
    q.setAttribute('aria-expanded', String(open));
    $(q.getAttribute('aria-controls')).hidden = !open;
  };
}
$('back-top').onclick = () => {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  goHome();
  window.scrollTo({ top: 0 });
  if (!$('play').hidden) $('play').focus({ preventScroll: true });
};
$('drop').onclick = () => (S.mode === 'reveal' ? advance() : tryDrop());
// F-U06 after a name pick, focus moves to DROP PIN so Enter or Space drops it.
$('search').onchange = (e) => {
  if (!e.target.value) return;
  view.placeFeature(e.target.value);
  if (S.mode === 'round') $('drop').focus();
};
$('share').onclick = () => {
  sound.click();
  shareOrCopy($('share'), $('share').dataset.shareText);
};
$('sound-btn').onclick = () => {
  S.settings = store.saveSettings({ sound: !store.settings().sound });
  sound.set(S.settings.sound);
  renderSpeaker();
};

// §23 header speaker: aria label says what a press will do.
function renderSpeaker() {
  const btn = $('sound-btn');
  btn.setAttribute('aria-label', S.settings.sound ? 'Mute' : 'Unmute');
  btn.setAttribute('aria-pressed', String(!S.settings.sound));
  btn.classList.toggle('speaker--off', !S.settings.sound);
}
window.addEventListener('hashchange', goHome);
// F-U01 another tab wrote a run: home redraws; a live round or reveal of the same day stops.
window.addEventListener('storage', (e) => {
  const prefix = R.keys.run(config.slot, '');
  if (e.key !== null && !e.key.startsWith(prefix)) return;
  if (S.mode === 'home') return goHome();
  if ((S.mode === 'round' || S.mode === 'reveal') && !S.practice && (e.key === null || e.key === prefix + S.date) && !runFresh()) conflict();
});
document.addEventListener('keydown', (e) => {
  if (menu.isOpen) return;
  if (['INPUT', 'SELECT', 'BUTTON', 'SUMMARY', 'TEXTAREA'].includes(e.target.tagName)) return;
  // F-U06 keyboard pinning: arrow keys pan the map; P pins the map centre, and so does
  // Space or Enter on the focused map while no pin is held.
  const onMap = !!e.target.closest?.('#map');
  if (S.mode === 'round' && (e.key === 'p' || e.key === 'P' || (onMap && !view.pin && (e.key === ' ' || e.key === 'Enter')))) {
    e.preventDefault();
    view.place(view.map.getCenter());
    return;
  }
  if (e.key !== ' ' && e.key !== 'Enter') return;
  if (S.mode === 'round') { e.preventDefault(); tryDrop(); }
  else if (S.mode === 'reveal' && e.key === 'Enter') { e.preventDefault(); advance(); }
});

const menu = createMenu({
  store, config, manifest, countries, souvenirs,
  today,
  screenName: () => ({ home: 'Home', camp: 'Camp', round: 'Expedition', reveal: 'Expedition' })[S.mode] ?? 'Home',
  loadDeck: (n) => fetchJSON(G.deckPath(n)),
  fillAnswers: (el, prompt, row) => fillAnswers(el, prompt, row),
  onPractice: () => startPractice(),
  roundOpen,
  // §6 assists apply at once to the map; a new clock waits for the next prompt.
  onSettings: (next) => {
    S.settings = next;
    // D7 names turned on during a round end that round's no-names bonus; any assist switched
    // back on clears its bit for the round (owner call 3).
    if (S.mode === 'round' && S.run?.open) {
      S.run.open = S.open = R.assistsTurnedOn(S.run.open, next);
      if (!saveRun()) return;
    }
    if (S.mode !== 'round') { view.setNames(next.names); view.setBorders(next.borders); }
    if (S.mode === 'round') {
      view.setNames(next.names);
      view.setBorders(next.borders);
      renderSearch();
      renderDrop();
    }
  },
  onDeleted: () => {
    store.ensureOwner(uuid());
    S.settings = store.settings();
    // Deleted settings fall back to defaults, so the speaker must follow them.
    sound.set(S.settings.sound);
    renderSpeaker();
    goHome();
  },
  onClose: () => { if (S.mode === 'camp') menu.renderCampTiles($('camp-tiles'), S.date); },
});

goHome();
setInterval(checkDate, RECHECK_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDate(); });
window.addEventListener('focus', checkDate);
scheduleUtc14Recheck();
