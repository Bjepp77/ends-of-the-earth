// Menu drawer and its panels (§22). Numbers come from panels.js and rules.js; this file only draws.
import * as R from './rules.js?v=95fbcb2922';
import * as P from './panels.js?v=95fbcb2922';
import { TIER_COLORS, longDate, promptText } from './game.js?v=95fbcb2922';

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// Band colours for the log calendar, low to high. Church palette: Green 20, Neutral 30, Yellow 20, Blue 10, Yellow 5.
export const BAND_COLORS = {
  nauvoo: '#6DB344',
  'winter-quarters': '#C6BFAD',
  'chimney-rock': '#F68D2E',
  'south-pass': '#7DE3F4',
  'salt-lake-valley': '#FFD61A',
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

function shortDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${DAYS[wd]} ${d} ${SHORT_MONTHS[m - 1]}`;
}

function tierTag(tierId) {
  const t = R.tierById(tierId);
  const el = h('span', { class: 'tier-stamp tier-stamp--sm' }, t.name.toUpperCase());
  if (tierId !== 'miss') {
    const img = h('img', { src: `img/tier-${tierId}-32.webp`, alt: '', width: 14, height: 14 });
    img.addEventListener('error', () => img.remove());
    el.prepend(img);
  }
  el.style.setProperty('--tier-ink', TIER_COLORS[tierId].ink);
  el.style.setProperty('--tier-fill', TIER_COLORS[tierId].fill);
  return el;
}

const newTag = (n) => (n > 0 ? h('span', { class: 'new-tag' }, `${n} NEW`) : null);

export function createMenu(ctx) {
  const { store, config, manifest, countries, souvenirs } = ctx;
  const info = P.countryInfoFrom(countries.features);
  const root = document.getElementById('menu');
  const body = document.getElementById('menu-body');
  const back = document.getElementById('menu-back');
  const backTo = document.getElementById('menu-back-to');
  const shade = document.getElementById('menu-shade');
  let current = null;

  const data = () => {
    const logs = store.logsFull();
    const today = ctx.today();
    const facts = P.souvenirFacts(logs, info);
    const earned = P.earnedIds(souvenirs.souvenirs, facts);
    const shown = new Set(store.souvenirsShown());
    const passport = P.passportPages(countries.features, store.passport(), store.stamps());
    const week = P.pastWeekRows(today, config.day1, manifest.decks, logs);
    return { logs, today, facts, earned, unseen: earned.filter((id) => !shown.has(id)), passport, week };
  };

  // F-U08 the burger says whether the drawer is open; closing hands focus back to it.
  const burger = document.getElementById('menu-btn');

  function open(panel = 'menu') {
    root.hidden = false;
    shade.hidden = false;
    burger?.setAttribute('aria-expanded', 'true');
    show(panel);
  }

  function close() {
    const hadFocus = root.contains(document.activeElement) || document.activeElement === document.body;
    root.hidden = true;
    shade.hidden = true;
    current = null;
    burger?.setAttribute('aria-expanded', 'false');
    if (hadFocus) burger?.focus();
    ctx.onClose?.();
  }

  function show(panel) {
    current = panel;
    body.textContent = '';
    backTo.textContent = panel === 'menu' ? ctx.screenName() : 'Menu';
    body.append(PANELS[panel]());
    body.scrollTop = 0;
    root.scrollTop = 0;
    back.focus();
  }

  back.onclick = () => (current === 'menu' ? close() : show('menu'));
  shade.onclick = close;
  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') return close();
    // F-U08 Tab stays inside the open drawer.
    if (e.key !== 'Tab') return;
    const items = [...root.querySelectorAll('button, a[href], input, select, summary, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.getClientRects().length);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  const item = (panel, label, sub, tag) => h('button', { type: 'button', class: 'menu-item', onclick: () => show(panel) },
    h('span', { class: 'mi-label' }, label, tag), h('span', { class: 'mi-sub' }, sub));

  const PANELS = {
    menu() {
      const d = data();
      const st = P.logbookStats(d.logs, d.today);
      const openDays = d.week.filter((w) => !w.rows).length;
      return h('div', { class: 'menu-list' },
        h('p', { class: 'panel-title' }, 'MENU'),
        item('logbook', 'LOGBOOK', `${st.streak}-day streak`),
        item('passport', 'PASSPORT', `${d.passport.stamped} of ${d.passport.total} countries`),
        item('souvenirs', 'SOUVENIRS', `${d.earned.length} of ${souvenirs.souvenirs.length} brought back`, newTag(d.unseen.length)),
        item('pastweek', 'PAST WEEK', `${openDays} still open to play`, openDays ? h('span', { class: 'new-tag' }, `${openDays} OPEN`) : null),
        item('difficulty', 'DIFFICULTY', P.difficultyLabel(store.settings())),
        item('howto', 'HOW TO PLAY', 'with a practice round'),
        item('account', 'ACCOUNT', 'saved on this device only'),
        h('p', { class: 'fine' }, 'Map data: Natural Earth. Saved on this device only.'),
        h('nav', { class: 'page-links', 'aria-label': 'Pages' },
          [['how-to-play', 'GUIDE'], ['about', 'ABOUT'], ['blog', 'BLOG'], ['rulings', 'RULINGS'], ['changelog', 'CHANGELOG']]
            .map(([slug, label]) => h('a', { href: `${slug}/` }, label))));
    },

    logbook() {
      const d = data();
      const st = P.logbookStats(d.logs, d.today);
      const cells = [['PLAYED', st.played], ['STREAK', st.streak], ['LONGEST', st.longest],
        ['TRAVELED', `${R.formatKm(st.traveled)} km`], ['AVERAGE', `${R.formatKm(st.average)} km`], ['BEST', `${R.formatKm(st.best)} km`]];
      const detail = h('div', { class: 'card day-detail', id: 'day-detail' }, h('p', { class: 'fine' }, 'Tap a played day and its pins show here.'));
      const cal = h('div', { class: 'cal', role: 'grid' }, ...DAYS.map((x) => h('span', { class: 'cal-head' }, x[0])));
      for (const week of P.calendarWeeks(d.today)) {
        for (const date of week) {
          const state = P.cellState(date, d.today, config.day1, manifest.decks, d.logs);
          const dayNum = Number(date.slice(8));
          if (state === 'played') {
            const km = R.rowsKm(d.logs[date]);
            const band = R.bandFor(km);
            cal.append(h('button', {
              type: 'button', class: 'cal-cell cal-played', style: `--band:${BAND_COLORS[band.id]}`,
              'aria-label': `${longDate(date)}, ${km} km, ${band.name}`, onclick: () => showDay(detail, date, d),
            }, h('span', {}, String(dayNum)), h('small', {}, String(km))));
          } else if (state === 'open') {
            cal.append(h('button', { type: 'button', class: 'cal-cell cal-open', 'aria-label': `${longDate(date)}, open to play`, onclick: () => playLate(date) },
              h('span', {}, String(dayNum)), h('small', { class: 'play-tag' }, 'PLAY')));
          } else {
            cal.append(h('span', { class: `cal-cell cal-${state}`, 'aria-label': longDate(date) }, h('span', {}, String(dayNum))));
          }
        }
      }
      const bands = P.bandCounts(d.logs);
      const tiers = P.tierCounts(d.logs);
      return h('div', {},
        h('p', { class: 'panel-title' }, 'LOGBOOK'),
        h('div', { class: 'stats' }, cells.map(([k, v]) => h('div', { class: 'stat' }, h('b', {}, String(v)), h('span', {}, k)))),
        h('p', { class: 'eyebrow' }, 'THE LOG'),
        cal,
        h('div', { class: 'key' }, R.BANDS.map((b) => h('span', {}, h('i', { style: `background:${BAND_COLORS[b.id]}` }), b.name))),
        detail,
        h('p', { class: 'eyebrow' }, 'WHERE THEY ENDED'),
        h('ul', { class: 'counts' }, [...R.BANDS].reverse().map((b) => h('li', {}, h('span', {}, h('i', { style: `background:${BAND_COLORS[b.id]}` }), b.name), h('b', {}, String(bands[b.id]))))),
        h('p', { class: 'eyebrow' }, 'YOUR PINS'),
        h('ul', { class: 'counts' }, [...R.TIERS].reverse().map((t) => h('li', {}, tierTag(t.id), h('b', {}, String(tiers[t.id]))))),
        h('p', { class: 'fine' }, 'A day logs when its last pin lands. Practice rounds are not logged. Saved on this device only.'));
    },

    passport() {
      const d = data();
      const wrap = h('div', {});
      let page = 0;
      let filter = 'all';
      const draw = () => {
        const p = d.passport.pages[page];
        const rows = P.filterRows(p.rows, filter);
        const newCount = P.newStampsOn(store.passport(), d.today);
        wrap.textContent = '';
        wrap.append(
          h('p', { class: 'panel-title' }, 'PASSPORT'),
          h('p', { class: 'big-count' }, `${d.passport.stamped} OF ${d.passport.total} STAMPED `, newTag(newCount)),
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Show' }, ['all', 'found', 'missing'].map((f) =>
            h('button', { type: 'button', 'aria-pressed': String(f === filter), onclick: () => { filter = f; draw(); } }, f.toUpperCase()))),
          h('div', { class: 'pager' },
            h('button', { type: 'button', class: 'sq', 'aria-label': 'Previous continent', onclick: () => { page = (page + d.passport.pages.length - 1) % d.passport.pages.length; draw(); } }, '‹'),
            h('span', {}, `${p.continent.toUpperCase()} · ${page + 1} OF ${d.passport.pages.length}`, h('small', {}, ` ${p.rows.filter((r) => r.tier && !r.territory).length}/${p.rows.filter((r) => !r.territory).length}`)),
            h('button', { type: 'button', class: 'sq', 'aria-label': 'Next continent', onclick: () => { page = (page + 1) % d.passport.pages.length; draw(); } }, '›')),
          h('div', { class: 'key' }, R.TIERS.filter((t) => t.id !== 'miss').map((t) => h('span', {}, h('i', { style: `background:${TIER_COLORS[t.id].fill}` }), t.name))),
          h('ul', { class: 'pp-list' }, rows.length ? rows.map((r) => h('li', { class: r.tier ? 'pp-found' : '' },
            h('span', {}, r.territory ? `${r.name} (territory)` : r.name), r.tier ? tierTag(r.tier) : h('span', { class: 'fine' }, 'not yet'))) : h('li', { class: 'fine' }, 'Nothing here yet.')),
          h('p', { class: 'fine' }, 'A country is stamped the first time you pin it as a correct answer. A stamped territory is listed too, but only countries count toward the total.'));
      };
      draw();
      return wrap;
    },

    souvenirs() {
      const d = data();
      const unseen = new Set(d.unseen);
      store.markSouvenirsShown(d.earned);
      const near = P.nearlyThere(souvenirs.souvenirs, d.facts);
      return h('div', {},
        h('p', { class: 'panel-title' }, 'SOUVENIRS'),
        h('p', { class: 'big-count' }, `${d.earned.length} OF ${souvenirs.souvenirs.length} BROUGHT BACK `, newTag(unseen.size)),
        near.length ? h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'NEARLY THERE'),
          h('ul', { class: 'counts' }, near.map((n) => h('li', {}, h('span', {}, `${n.def.name}: ${n.def.note}`), h('b', {}, `${R.formatKm(n.value)}/${R.formatKm(n.goal)}`))))) : null,
        souvenirs.groups.map((g) => h('section', { class: 'sv-group' },
          h('p', { class: 'eyebrow' }, `${g.name.toUpperCase()} · ${souvenirs.souvenirs.filter((s) => s.group === g.id && d.earned.includes(s.id)).length}/${souvenirs.souvenirs.filter((s) => s.group === g.id).length}`),
          h('ul', { class: 'sv-list' }, souvenirs.souvenirs.filter((s) => s.group === g.id).map((s) => {
            const pr = P.progress(s, d.facts);
            const art = s.id === 'walking-stick'
              ? h('img', { src: 'img/souvenir-walking-stick-64.webp', alt: '', width: 28, height: 28 }) : null;
            art?.addEventListener('error', () => art.remove());
            return h('li', { class: pr.done ? 'sv-done' : '' },
              h('span', { class: 'sv-name' }, art, pr.done ? '✓ ' : '', s.name, unseen.has(s.id) ? h('span', { class: 'new-tag' }, 'NEW') : null),
              h('span', { class: 'fine' }, pr.done ? s.note : `${s.note} ${R.formatKm(pr.value)}/${R.formatKm(pr.goal)}`));
          })))),
        h('p', { class: 'fine' }, 'These souvenirs and their conditions are our own.'));
    },

    pastweek() {
      const d = data();
      return h('div', {},
        h('p', { class: 'panel-title' }, 'PAST WEEK'),
        d.week.length ? h('ul', { class: 'pw-list' }, d.week.map((w) => {
          const { label, open } = P.pastWeekStatus(w, store.run(w.date));
          return h('li', {},
            h('span', { class: 'pw-name' }, `Expedition #${w.n}, ${shortDay(w.date)}`, h('small', {}, open ? `OPEN UNTIL ${shortDay(w.until)}` : 'PLAYED')),
            h('span', { class: 'pips' }, Array.from({ length: 5 }, (_, i) => {
              const t = w.rows?.[i]?.t;
              return h('i', { style: t ? `background:${TIER_COLORS[t].fill}` : null, title: t ? R.tierById(t).name : null });
            })),
            h('button', { type: 'button', class: 'textlink', onclick: () => playLate(w.date) }, label));
        })) : h('p', {}, 'No past days yet. Days you miss stay open here for a week.'),
        h('p', { class: 'fine' }, 'Each day plays once, on its own clock. A late day logs and stamps, but it does not mend a streak.'));
    },

    difficulty() {
      const wrap = h('div', {});
      const draw = () => {
        const s = store.settings();
        const choice = (label, key, a, b, note) => h('div', { class: 'choice' },
          h('p', { class: 'eyebrow' }, label),
          h('div', { class: 'seg' }, [a, b].map((opt) => h('button', {
            type: 'button', 'aria-pressed': String(s[key] === opt.value),
            onclick: () => { ctx.onSettings(store.saveSettings({ [key]: opt.value })); draw(); },
          }, opt.label))),
          h('p', { class: 'fine' }, note));
        wrap.textContent = '';
        wrap.append(
          h('p', { class: 'eyebrow' }, 'BEFORE YOU BEGIN'),
          h('p', { class: 'panel-title' }, 'DIFFICULTY'),
          choice('NAMES', 'names', { label: 'ON', value: true }, { label: 'OFF *', value: false }, 'Off: no names on the map, and your pin reads as coordinates.'),
          choice('BORDERS', 'borders', { label: 'ON', value: true }, { label: 'OFF *', value: false }, 'Off: coastlines only.'),
          choice('CLOCK', 'clock', { label: '60 S', value: 'relaxed' }, { label: '30 S *', value: 'standard' }, 'The new clock starts with your next prompt.'),
          choice('FIND BY NAME', 'search', { label: 'OFF', value: false }, { label: 'ON ⌕', value: true }, 'On: a list of countries you can pick from. Your share line shows ⌕.'),
          h('p', { class: 'fine' }, 'Each choice marked * adds a star after your km when you share. Saved on this device only.'));
      };
      draw();
      return wrap;
    },

    howto() {
      const s = store.settings();
      const ex = [...R.TIERS].reverse();
      const facts = [['PROMPTS', '5 a day'], ['CLOCK', `${R.CLOCKS[s.clock]} s each`], ['PINS', '1 drop per prompt'],
        ['CONTROLS', 'tap to pin, tap again to move, + and - or scroll to zoom, Space or Enter to drop'],
        ['MAP', `names ${s.names ? 'on' : 'off'}, borders ${s.borders ? 'on' : 'off'}`],
        ['WHAT COUNTS', 'a listed country, or a territory whose country is listed'],
        ['SCORING', 'rarer answers travel further; 500 km reaches the Salt Lake Valley']];
      return h('div', {},
        h('p', { class: 'eyebrow' }, 'FIELD NOTES'),
        h('p', { class: 'panel-title' }, 'HOW TO PLAY'),
        h('ol', { class: 'steps' },
          h('li', {}, 'Each day brings five prompts about the Church and its history.'),
          h('li', {}, 'Pin one country that fits before the clock runs out.'),
          h('li', {}, 'Answers fewer people think of carry you further along the trail.')),
        h('div', { class: 'card' },
          h('p', { class: 'eyebrow' }, 'HOW FAR EACH ANSWER TAKES YOU'),
          h('ul', { class: 'counts' }, ex.map((t) => h('li', {}, tierTag(t.id), h('b', {}, `${t.km} km`)))),
          h('p', { class: 'fine' }, 'The rarest answers on each prompt count as Ends of the earth. A wrong country, a pin at sea or no pin is a Miss.')),
        h('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
        h('button', { type: 'button', class: 'cta', id: 'practice-go', onclick: (e) => { if (blocked(e.currentTarget)) return; close(); ctx.onPractice(); } }, 'PRACTICE ROUND'),
        h('p', { class: 'fine center' }, 'One prompt, no clock, nothing kept. It does not use up today.'),
        h('button', { type: 'button', class: 'textlink', id: 'tour-go', onclick: (e) => { if (blocked(e.currentTarget)) return; close(); ctx.onTour(); } }, 'TAKE THE TOUR'),
        h('p', { class: 'fine center' }, h('a', { href: 'how-to-play/' }, 'Read the full guide')));
    },

    account() {
      const msg = h('p', { class: 'fine', 'aria-live': 'polite' });
      const confirmBox = h('div', { class: 'card confirm', hidden: true },
        h('p', {}, 'Delete every expedition, stamp, souvenir and setting saved on this device? This cannot be undone.'),
        h('div', { class: 'seg' },
          h('button', { type: 'button', class: 'danger', id: 'delete-yes', onclick: () => {
            store.deleteAll();
            confirmBox.hidden = true;
            msg.textContent = 'Deleted. Nothing you played is kept on this device now.';
            ctx.onDeleted();
          } }, 'YES, DELETE'),
          h('button', { type: 'button', onclick: () => { confirmBox.hidden = true; } }, 'KEEP MY DATA')));
      return h('div', {},
        h('p', { class: 'panel-title' }, 'ACCOUNT'),
        h('p', { class: 'big-count' }, 'GUEST'),
        h('p', {}, 'Saved on this device only. There is no sign in. The game sends only anonymous counts of visits and finished games: no names, no cookies, nothing that identifies you.'),
        h('button', { type: 'button', class: 'menu-item', id: 'download-data', onclick: () => {
          const dump = store.exportAll(new Date().toISOString());
          const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = h('a', { href: url, download: `ends-of-the-earth-data-${ctx.today()}.json` });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          msg.textContent = `Saved ${Object.keys(dump.records).length} records to one file.`;
        } }, h('span', { class: 'mi-label' }, 'DOWNLOAD YOUR DATA'), h('span', { class: 'mi-sub' }, 'one JSON file')),
        h('button', { type: 'button', class: 'menu-item', id: 'delete-data', onclick: () => { confirmBox.hidden = false; confirmBox.querySelector('button').focus(); } },
          h('span', { class: 'mi-label' }, 'DELETE YOUR DATA'), h('span', { class: 'mi-sub' }, 'this device')),
        confirmBox, msg);
    },
  };

  // F-U05 a daily prompt's clock keeps running, so practice and late play wait for it.
  const BLOCKED_TEXT = 'Finish the open prompt first. Its clock is still running.';
  function blocked(after, exceptDate) {
    if (!ctx.roundOpen?.(exceptDate)) return false;
    const note = body.querySelector('.blocked-note') ?? h('p', { class: 'fine blocked-note', role: 'status' });
    if (after) after.after(note);
    else {
      body.prepend(note);
      body.scrollTop = 0;
    }
    note.textContent = BLOCKED_TEXT;
    return true;
  }

  function playLate(date) {
    if (blocked(undefined, date)) return;
    close();
    location.hash = `#play=${date}`;
  }

  async function showDay(el, date, d) {
    const rows = d.logs[date];
    const n = R.expeditionNumber(date, config.day1);
    const km = R.rowsKm(rows);
    el.textContent = '';
    el.append(h('p', { class: 'eyebrow' }, `EXPEDITION #${n} · ${longDate(date).toUpperCase()}`),
      h('p', {}, `${R.formatKm(km)} km · ${R.bandFor(km).name}${rows.some((r) => r.l) ? ' · played late' : ''}`));
    const deck = await ctx.loadDeck(n).catch(() => null);
    const list = h('ol', { class: 'dd-pins' }, rows.map((r, i) => {
      const prompt = deck?.prompts.find((p) => p.id === r.p);
      return h('li', {}, tierTag(r.t), ` ${r.n ?? (r.x ? 'Out of time' : 'No pin')} · ${r.pts} km`,
        prompt ? h('span', { class: 'fine' }, promptText(prompt)) : null);
    }));
    const playedAt = Object.fromEntries(Object.keys(d.logs).map((k) => [k, store.run(k)?.completedAt]).filter(([, t]) => t));
    const gained = P.broughtBackByDay(souvenirs.souvenirs, d.logs, info, playedAt)[date] ?? [];
    const names = gained.map((id) => souvenirs.souvenirs.find((s) => s.id === id)?.name).filter(Boolean);
    const answers = h('details', { class: 'answers' }, h('summary', {}, "SHOW THIS DAY'S ANSWERS"));
    if (deck) {
      rows.forEach((r) => {
        const prompt = deck.prompts.find((p) => p.id === r.p);
        if (prompt) { const box = h('div', {}); ctx.fillAnswers(box, prompt, r); answers.append(box); }
      });
    }
    el.append(list, h('p', { class: 'fine' }, names.length ? `Brought back: ${names.join(', ')}.` : 'No souvenirs that day.'), deck ? answers : null);
  }

  // §17 camp tiles: Logbook, Passport, Souvenirs with NEW tags for this expedition.
  function renderCampTiles(el, date) {
    const d = data();
    const st = P.logbookStats(d.logs, d.today);
    const stampedNew = P.newStampsOn(store.passport(), d.today, date);
    el.textContent = '';
    const tile = (panel, label, sub, tag) => h('button', { type: 'button', class: 'tile', onclick: () => open(panel) },
      h('span', { class: 'mi-label' }, label), h('span', { class: 'mi-sub' }, sub), tag);
    el.append(
      tile('logbook', 'LOGBOOK', `${st.streak}-day streak`),
      tile('passport', 'PASSPORT', `${d.passport.stamped} of ${d.passport.total}`, newTag(stampedNew)),
      tile('souvenirs', 'SOUVENIRS', `${d.earned.length} of ${souvenirs.souvenirs.length}`, newTag(d.unseen.length)));
  }

  return { open, close, show, renderCampTiles, get isOpen() { return !root.hidden; } };
}
