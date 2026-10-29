// The trail map: a small drawn map of the pioneer trail, Nauvoo in the east to the Salt Lake
// Valley in the west. A wagon stands at the day's distance and walks to the new distance after
// each reveal. Each band stop sits on the path at min / EDGE_KM, so the wagon reaches a stop
// exactly when the total reaches that band. Look (owner, 2026-10-27): speckled paper, framed
// border, spaced mono labels and a faint field of landmark icons, in the Furrow palette.
import * as R from './rules.js?v=7eff5a1bb0';

const NS = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 132;
// The joins are the five stops, spread east to west across the panorama: river, plains, spire,
// mountain gap, lake. Each stop's picture stands right above its dot.
const SEGMENTS = [
  'M286 84 C270 90 248 88 228 86',
  'M228 86 C205 98 182 98 160 92',
  'M160 92 C140 86 120 80 100 80',
  'M100 80 C80 80 60 78 40 72',
];
const ROUTE = SEGMENTS.join(' ');
const SHARES = [0, .2, .5, .7, 1];
const WALK_MS = 1100;
let made = 0; // each map gets its own pattern id; two maps share the page (round and camp)

// Sections light up (owner, 2026-10-28, "wagon's spot"): a section turns orange once the wagon
// itself is on it, so share past the section's start stop, and every section behind stays lit.
// At 0 km nothing is lit; exactly on a stop the next section is not lit yet.
export function litSections(share) {
  return SHARES.slice(0, -1).map((start) => share > start);
}

// Share of the route walked at a day total, 0 to 1.
export function trailShare(km) {
  return Math.max(0, Math.min(1, km / R.EDGE_KM));
}

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
}

// Seeded so the scatter is the same drawing on every load and every device. The map's paper uses it too.
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Labels (owner, 2026-10-28: smaller, less clutter; picked "C"): names alternate along the top and
// bottom of the frame, east to west, each with a thin leader line to its stop. The end stops anchor
// to the frame so the name never runs off it; the leader still lands inside the text.
const TOP = 29;
const BOTTOM = 122;
function label(p, i, name, svg) {
  const edge = p.x < 60 ? { x: 12, anchor: 'start' } : p.x > 260 ? { x: W - 12, anchor: 'end' } : { x: p.x, anchor: 'middle' };
  const below = i % 2 === 1;
  const y = below ? BOTTOM : TOP;
  el('path', { d: below ? `M${p.x} ${p.y + 4} V${y - 6}` : `M${p.x} ${p.y - 32} V${y + 2}`, class: 'tm-leader' }, svg);
  el('text', { x: edge.x, y, class: 'tm-name', 'text-anchor': edge.anchor }, svg).textContent = name;
}

export function createTrail(svg) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.textContent = '';

  // Paper, speckle and frame.
  const defs = el('defs', {}, svg);
  const speckId = `tm-speck-${++made}`;
  const speck = el('pattern', { id: speckId, width: 23, height: 19, patternUnits: 'userSpaceOnUse' }, defs);
  const sr = rng(11);
  for (let i = 0; i < 9; i++) {
    el('circle', { cx: (sr() * 23).toFixed(1), cy: (sr() * 19).toFixed(1), r: (0.3 + sr() * 0.45).toFixed(2), class: 'tm-speck' }, speck);
  }
  el('rect', { x: 0, y: 0, width: W, height: H, class: 'tm-paper' }, svg);
  const art = el('image', { x: 0, y: 0, width: W, height: H, opacity: .65,
    href: 'img/trail-map-640.webp', preserveAspectRatio: 'xMidYMid slice' }, svg);
  art.setAttribute('aria-hidden', 'true');
  el('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${speckId})` }, svg);
  el('rect', { x: 5, y: 5, width: W - 10, height: H - 10, class: 'tm-frame' }, svg);

  const marks = el('g', {}, svg);
  el('path', { d: ROUTE, class: 'tm-route' }, svg);
  // One path per section, shown orange once lit. (One dashed path for the whole route lit all of it on iOS.)
  const sections = SEGMENTS.map((d) => el('path', { d, class: 'tm-walked' }, svg));
  const ends = [0];
  for (const s of sections) ends.push(ends.at(-1) + s.getTotalLength());
  const lengthAt = (share) => {
    const i = Math.min(SEGMENTS.length - 1, SHARES.findIndex((s, j) => j && share <= s) - 1);
    const t = (share - SHARES[i]) / (SHARES[i + 1] - SHARES[i]);
    return ends[i] + (ends[i + 1] - ends[i]) * t;
  };
  const pointAt = (share) => {
    const at = lengthAt(share);
    const i = Math.max(0, ends.findIndex((e, j) => j && at <= e) - 1);
    return sections[i].getPointAtLength(at - ends[i]);
  };

  const dots = new Map();
  for (const [i, b] of R.BANDS.entries()) {
    const p = pointAt(trailShare(b.min));
    const g = el('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` }, marks);
    const icon = el('image', { x: -13, y: -31, width: 26, height: 26,
      href: `img/trail-${b.id}-96.webp`, class: 'tm-art', 'aria-hidden': 'true' }, g);
    icon.addEventListener('error', () => icon.remove());
    dots.set(b.id, el('circle', { cx: p.x, cy: p.y, r: 3.2, class: 'tm-stop' }, svg));
    label(p, i, b.name, svg);
  }
  el('text', { x: W - 12, y: 17, class: 'tm-edge', 'text-anchor': 'end' }, svg).textContent = 'EAST';
  el('text', { x: 12, y: 17, class: 'tm-edge' }, svg).textContent = 'WEST';

  // The wagon faces west: the wagon picture, or the drawn cover, bed, tongue and wheels if it fails.
  const wagon = el('g', { class: 'tm-wagon' }, svg);
  const drawn = () => {
    el('path', { d: 'M-8 -4 q 0 -10, 8 -10 q 8 0, 8 10 z', class: 'tm-cover' }, wagon);
    el('rect', { x: -10, y: -4, width: 20, height: 5, rx: 1, class: 'tm-bed' }, wagon);
    el('path', { d: 'M-10 -2 h -5', class: 'tm-ink' }, wagon);
    for (const cx of [-6, 6]) el('circle', { cx, cy: 3, r: 3, class: 'tm-wheel' }, wagon);
  };
  const pic = el('image', { x: -18, y: -18, width: 36, height: 24, href: 'img/trail-wagon-80.webp', 'aria-hidden': 'true' }, wagon);
  pic.addEventListener('error', () => { pic.remove(); drawn(); });

  let at = 0;
  let frame = 0;
  const draw = (share) => {
    const p = pointAt(share);
    wagon.setAttribute('transform', `translate(${p.x.toFixed(1)} ${(p.y - 4).toFixed(1)})`);
    litSections(share).forEach((lit, i) => { sections[i].classList.toggle('tm-walked--lit', lit); });
  };
  draw(0);

  return {
    // Moves the wagon to a day total; walks there unless asked to jump or motion is reduced.
    set(km, { jump = false } = {}) {
      const to = trailShare(km);
      for (const b of R.BANDS) dots.get(b.id).classList.toggle('tm-stop--reached', km >= b.min);
      cancelAnimationFrame(frame);
      const still = jump || to === at || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (still) { at = to; draw(at); return; }
      const from = at;
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / WALK_MS);
        at = from + (to - from) * (1 - (1 - t) ** 3);
        draw(at);
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    },
  };
}
