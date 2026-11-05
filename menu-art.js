// Menu art (Design 3 and 4): small objects drawn by hand as inline SVG, no images. Static strings only.
// Colours come from CSS classes in styles.css (.ma-*), so the art follows the theme.

const svg = (box, body) => `<svg viewBox="${box}" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">${body}</svg>`;

// Design 3: one object per menu item, drawn on a 40 by 40 grid.
const OBJECTS = {
  // a clothbound logbook with a ribbon
  logbook: svg('0 0 40 40', `
    <rect class="ma-cloth" x="8" y="5" width="25" height="30" rx="2.5"/>
    <rect class="ma-paper" x="11" y="8" width="19" height="24" rx="1"/>
    <path class="ma-line" d="M14 14h13M14 18h13M14 22h9"/>
    <path class="ma-acc" d="M26 5v13l3-2.5 3 2.5V5z"/>
    <path class="ma-edge" d="M8 5v30"/>`),
  // a passport booklet with a round stamp
  passport: svg('0 0 40 40', `
    <rect class="ma-cloth" x="9" y="4" width="22" height="31" rx="2.5"/>
    <circle class="ma-ring" cx="20" cy="15" r="6.5"/>
    <path class="ma-ring" d="M13.5 15h13M20 8.5c-3 3-3 10 0 13M20 8.5c3 3 3 10 0 13"/>
    <path class="ma-paper-line" d="M14 27h12M16 31h8"/>
    <g class="ma-stamp-g"><circle class="ma-stamp" cx="29" cy="30" r="6.5"/><path class="ma-stamp-tick" d="M26 30l2.2 2.2L32.5 27.5"/></g>`),
  // a wrapped parcel tied with string
  souvenirs: svg('0 0 40 40', `
    <path class="ma-box" d="M6 15l14-6 14 6v17l-14 5-14-5z"/>
    <path class="ma-box-top" d="M6 15l14 5 14-5"/>
    <path class="ma-edge" d="M20 20v17"/>
    <path class="ma-string" d="M13 12.5l14 5.5M27 12.5L13 18"/>
    <path class="ma-string" d="M20 9c-1-4-5-4-5-1.5s3 2.5 5 1.5zM20 9c1-4 5-4 5-1.5s-3 2.5-5 1.5z"/>`),
  // a ticket stub with a perforation
  pastweek: svg('0 0 40 40', `
    <path class="ma-ticket" d="M4 11h32v6.5a2.5 2.5 0 0 0 0 5V29H4v-6.5a2.5 2.5 0 0 0 0-5z"/>
    <path class="ma-perf" d="M26 12v16"/>
    <path class="ma-line" d="M9 17h12M9 22h8"/>
    <path class="ma-acc-line" d="M29.5 16h3M29.5 20h3M29.5 24h3"/>`),
  // a dial with a needle
  difficulty: svg('0 0 40 40', `
    <path class="ma-dial" d="M5 29a15 15 0 1 1 30 0z"/>
    <path class="ma-ticks" d="M9 26l2.5-1.2M12 17.5l2.2 1.6M20 12v2.6M28 17.5l-2.2 1.6M31 26l-2.5-1.2"/>
    <path class="ma-needle" d="M20 29l7-9"/>
    <circle class="ma-hub" cx="20" cy="29" r="2.6"/>
    <path class="ma-edge" d="M5 32.5h30"/>`),
  // a field note with a folded corner and a pencil
  howto: svg('0 0 40 40', `
    <path class="ma-paper-card" d="M8 5h17l7 7v23H8z"/>
    <path class="ma-fold" d="M25 5v7h7"/>
    <path class="ma-line" d="M12 17h16M12 22h16M12 27h9"/>
    <path class="ma-pencil" d="M26 36l-1.5-5 9-9 3.5 3.5-9 9z"/>
    <path class="ma-acc-line" d="M32 22.5l3.5 3.5"/>`),
  // a luggage tag on a string
  account: svg('0 0 40 40', `
    <path class="ma-string" d="M12 11c-4-6 4-9 8-5"/>
    <path class="ma-tag" d="M10 11h20l4 6v18H6V17z"/>
    <circle class="ma-hole" cx="20" cy="17" r="2.4"/>
    <path class="ma-line" d="M12 25h16M12 30h10"/>`),
};

export function menuObject(name) {
  const el = document.createElement('span');
  el.className = `mi-icon mi-icon--${name}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = OBJECTS[name] ?? '';
  return el;
}

// Design 4: a 88 by 52 picture of what each setting looks like when it is on or off.
const LAND = 'M6 38c2-10 8-17 18-19 6-1 9-5 16-4 8 1 10 7 18 8 7 1 15 4 16 12-1 6-8 8-14 7-6-1-9 2-16 2-8 0-14-3-22-3-8 1-13 0-16-3z';
const DIVIDE = 'M40 15c-2 8 3 11 1 17s-1 8 0 10';
const PREVIEWS = {
  'names:true': svg('0 0 88 52', `<rect class="pv-sea" width="88" height="52" rx="4"/><path class="pv-land" d="${LAND}"/><text class="pv-text" x="22" y="32">PERU</text><text class="pv-text" x="56" y="36">BRAZIL</text><text class="pv-text pv-text--sea" x="46" y="12">ATLANTIC</text>`),
  'names:false': svg('0 0 88 52', `<rect class="pv-sea" width="88" height="52" rx="4"/><path class="pv-land" d="${LAND}"/><circle class="pv-pin" cx="48" cy="26" r="3"/><rect class="pv-readout" x="8" y="4" width="50" height="12" rx="2"/><text class="pv-mono" x="12" y="13">12.0S 77.0W</text>`),
  'borders:true': svg('0 0 88 52', `<rect class="pv-sea" width="88" height="52" rx="4"/><path class="pv-land" d="${LAND}"/><path class="pv-border" d="${DIVIDE}"/><path class="pv-border" d="M64 16c-3 7 2 10 0 17M40 15c8 1 14-2 24 1M41 32c8-1 14 2 23 1"/>`),
  'borders:false': svg('0 0 88 52', `<rect class="pv-sea" width="88" height="52" rx="4"/><path class="pv-land pv-land--bare" d="${LAND}"/>`),
  'clock:relaxed': svg('0 0 88 52', `<circle class="pv-face" cx="44" cy="27" r="19"/><path class="pv-arc" d="M44 8a19 19 0 1 1-16.5 28.5"/><path class="pv-hand" d="M44 27V14"/><text class="pv-big" x="44" y="45" text-anchor="middle">60</text>`),
  'clock:standard': svg('0 0 88 52', `<circle class="pv-face" cx="44" cy="27" r="19"/><path class="pv-arc" d="M44 8a19 19 0 0 1 0 38"/><path class="pv-hand" d="M44 27V14"/><text class="pv-big" x="44" y="45" text-anchor="middle">30</text>`),
  'search:false': svg('0 0 88 52', `<rect class="pv-sea" width="88" height="52" rx="4"/><path class="pv-land" d="${LAND}"/><circle class="pv-pin" cx="36" cy="28" r="3"/>`),
  'search:true': svg('0 0 88 52', `<rect class="pv-sea" width="88" height="52" rx="4"/><rect class="pv-list" x="8" y="6" width="46" height="40" rx="3"/><path class="pv-row" d="M13 16h30M13 24h24M13 32h28"/><circle class="pv-lens" cx="68" cy="22" r="8"/><path class="pv-handle" d="M74 28l8 8"/>`),
};
const CAPTIONS = {
  'names:true': 'labels', 'names:false': 'coordinates',
  'borders:true': 'borders', 'borders:false': 'coastlines',
  'clock:relaxed': 'relaxed', 'clock:standard': 'standard',
  'search:false': 'map only', 'search:true': 'pick from list',
};

export function previewFor(key, value, selected) {
  const id = `${key}:${value}`;
  const fig = document.createElement('figure');
  fig.className = `pv${selected ? ' pv--on' : ''}`;
  fig.setAttribute('aria-hidden', 'true');
  fig.innerHTML = PREVIEWS[id] ?? '';
  const cap = document.createElement('figcaption');
  cap.textContent = CAPTIONS[id] ?? '';
  fig.append(cap);
  return fig;
}
