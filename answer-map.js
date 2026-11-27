// Answer reveal (owner, 2026-11-23): on a country reveal every answer country lights up in the colour of
// the scoring tier it would earn (R.tierFor), with an outline that thickens as answers get rarer, and a
// legend names the tiers. Colours and alphas come from G.TIER_COLORS / G.TIER_ALPHA; none are added here.
import * as R from './rules.js?v=6a4545d269';
import * as G from './game.js?v=6a4545d269';

// Outline width per tier, px: rarer answers get a heavier line, so the tier reads without colour.
export const ANSWER_LINE_WIDTH = { 'home-ward': 0.8, stake: 1.2, mission: 1.6, isles: 2, ends: 2.4 };
// The answer tiers, low to high (a miss is never an answer).
const ANSWER_TIERS = R.TIERS.filter((t) => t.id !== 'miss');
// A country whose own bbox spans more than this many degrees of longitude wraps the antimeridian; frame its label instead.
const WRAP_SPAN = 300;
// Half-size in degrees of the box framed around such a country's label point.
const LABEL_BOX = 10;
// A union wider than this many degrees of longitude is framed by the label points alone (a world view).
const WIDE_SPAN = 240;
// Closest the camera zooms in on the answers, as reveal() does for one country.
const MAX_ZOOM = 5;
// Gap in px kept between the framed answers and the top of the covering card, as in reveal().
const COVER_GAP = 8;
const EMPTY = { type: 'FeatureCollection', features: [] };

// Match a paint value on the feature's tier.
function byTier(values, fallback) {
  return ['match', ['get', 'tier'], ...ANSWER_TIERS.flatMap((t) => [t.id, values(t.id)]), fallback];
}

// Wire the answers source and layers onto a map; byCode maps a country code to its countries.json feature.
export function createAnswerMap(map, byCode, container) {
  // Add the source and its two layers just below focus-fill, so the pinned country stays on top.
  function ensure() {
    if (map.getSource('answers')) return;
    map.addSource('answers', { type: 'geojson', data: EMPTY, tolerance: 0 });
    map.addLayer({
      id: 'answers-fill', type: 'fill', source: 'answers',
      paint: { 'fill-color': byTier((id) => G.TIER_COLORS[id].fill, G.TIER_COLORS.miss.fill), 'fill-opacity': byTier((id) => G.TIER_ALPHA[id], 0), 'fill-antialias': false },
    }, 'focus-fill');
    map.addLayer({
      id: 'answers-line', type: 'line', source: 'answers',
      paint: { 'line-color': byTier((id) => G.TIER_COLORS[id].ink, G.TIER_COLORS.miss.ink), 'line-width': byTier((id) => ANSWER_LINE_WIDTH[id], 0) },
    }, 'focus-fill');
  }
  if (map.loaded()) ensure(); else map.once('load', ensure);

  // Light every answer ({ code, tier }) and frame them with the pinned country above coverTop.
  function revealAnswers(list, pinCode = null, coverTop = Infinity) {
    ensure();
    const found = list.filter((a) => byCode.has(a.code));
    map.getSource('answers').setData({
      type: 'FeatureCollection',
      features: found.map((a) => ({ type: 'Feature', properties: { code: a.code, tier: a.tier }, geometry: { type: 'MultiPolygon', coordinates: byCode.get(a.code).polygons } })),
    });
    const framed = found.map((a) => byCode.get(a.code));
    const pin = pinCode ? byCode.get(pinCode) : null;
    if (pin) framed.push(pin);
    if (!framed.length) return;
    map.resize(); // the reveal layout may have just changed the map's size
    const box = container.getBoundingClientRect();
    const edge = Math.min(80, Math.round(box.height / 8));
    const padding = { top: edge, left: edge, right: edge, bottom: Math.max(edge, Math.round(box.bottom - coverTop) + COVER_GAP) };
    let bounds = framedBox(framed);
    // A short phone map (375 x 667) cannot hold every answer above the card even at minZoom, so the
    // pinned country is framed alone: it must stay on the map and above the card first.
    if (pin && !fits(bounds, padding)) bounds = framedBox([pin]);
    const [w, s, e, n] = bounds;
    map.fitBounds([[w, s], [e, n]], { padding, maxZoom: MAX_ZOOM, duration: 800 });
  }

  // True when bounds [w, s, e, n] fit inside the padded map at or above the map's minZoom.
  function fits([w, s, e, n], padding) {
    const cam = map.cameraForBounds([[w, s], [e, n]], { padding, maxZoom: MAX_ZOOM });
    return !!cam && cam.zoom >= map.getMinZoom();
  }

  // Remove every lit answer.
  function clearAnswers() {
    map.getSource('answers')?.setData(EMPTY);
  }

  return { revealAnswers, clearAnswers };
}

// A country's framing box [w, s, e, n]: its bbox, or a box round its label when the bbox wraps the world.
function boxOf(f) {
  const [w, s, e, n] = f.bbox;
  if (e - w <= WRAP_SPAN) return [w, s, e, n];
  const [x, y] = f.label;
  return [x - LABEL_BOX, y - LABEL_BOX, x + LABEL_BOX, y + LABEL_BOX];
}

// The box [w, s, e, n] framed for these countries: their boxes' union, or their label points when that spans a world view.
function framedBox(framed) {
  const bounds = extent(framed.map(boxOf));
  return bounds[2] - bounds[0] > WIDE_SPAN ? extent(framed.map((f) => [f.label[0], f.label[1], f.label[0], f.label[1]])) : bounds;
}

// The union of boxes [w, s, e, n].
function extent(boxes) {
  return boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
}

// Fill the legend element with one row per answer tier: a swatch in the map's two cues, then name and km.
export function fillLegend(el) {
  el.replaceChildren(...ANSWER_TIERS.map((t) => {
    const row = document.createElement('div');
    row.className = 'r-legend__row';
    const sw = document.createElement('span');
    sw.className = 'r-legend__swatch';
    sw.setAttribute('aria-hidden', 'true');
    sw.style.setProperty('--sw-fill', G.TIER_COLORS[t.id].fill);
    sw.style.setProperty('--sw-alpha', `${G.TIER_ALPHA[t.id] * 100}%`);
    sw.style.setProperty('--sw-ink', G.TIER_COLORS[t.id].ink);
    sw.style.setProperty('--sw-width', `${ANSWER_LINE_WIDTH[t.id]}px`);
    row.append(sw, `${t.name}, ${t.km} km`);
    return row;
  }));
}

// Phone dock (owner, 2026-11-24): at <=767px the stamp card covers most of the short map, so after this many ms
// (before REVEAL_LOCK_MS, 900, ends) a country reveal docks it to a slim bar and re-frames the answers above it.
export const STAMP_DOCK_MS = 600;
const PHONE = '(max-width: 767px)';
let dockTimer = 0;

// Dock the stamp card on a phone, STAMP_DOCK_MS after startedAt (at once under reduced motion), then reframe(docked top).
// startedAt is when the reveal began, not now: the reveal's own work (lighting many answers) can take
// hundreds of ms, and a timer counted from its end would dock after the reveal lock ends, leaving the
// camera framed above the full card, which on a 375 x 667 map leaves almost no map at all.
export function dockStampCard(card, reframe, startedAt = Date.now()) {
  undockStampCard(card);
  if (!matchMedia(PHONE).matches) return;
  const dock = () => {
    if (card.hidden) return;
    card.classList.add('stamp-card--docked');
    reframe(card.getBoundingClientRect().top);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) dock();
  else dockTimer = setTimeout(dock, Math.max(0, startedAt + STAMP_DOCK_MS - Date.now()));
}

// Undo the dock and cancel a pending one, so the next reveal slams the full card again.
export function undockStampCard(card) {
  clearTimeout(dockTimer);
  card.classList.remove('stamp-card--docked');
}
