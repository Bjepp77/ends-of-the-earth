// The trail map: a small drawn map of the pioneer trail, Nauvoo in the east to the Salt Lake
// Valley in the west. A wagon stands at the day's distance and walks to the new distance after
// each reveal. Each band stop sits on the path at min / EDGE_KM, so the wagon reaches a stop
// exactly when the total reaches that band. Look (owner, 2026-10-27): speckled paper, framed
// border, spaced mono labels and a faint field of landmark icons, in the Furrow palette.
import * as R from './rules.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 132;
const ROUTE = 'M284 90 C 262 98, 254 76, 228 80 S 186 108, 160 92 S 132 48, 104 54 S 62 92, 38 66';
const WALK_MS = 1100;
let made = 0; // each map gets its own pattern id; two maps share the page (round and camp)

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

// Faint field icons by country: woods by the rivers, grass on the plains, peaks in the Rockies.
const ICONS = {
  tree: 'M0 -7 l 4 6 h -8 z M0 -1 v 3',
  pine: 'M0 -8 l 3 4 h -2 l 3 4 h -8 l 3 -4 h -2 z',
  grass: 'M-3 0 l 1 -3 M0 0 v -4 M3 0 l -1 -3',
  dot: 'M0 0 h 0.1',
  peak: 'M-6 0 l 6 -9 l 6 9',
  hill: 'M-6 0 q 6 -7, 12 0',
};
function iconFor(x, r) {
  if (x > 236) return r < 0.6 ? 'tree' : 'dot';
  if (x > 132) return r < 0.55 ? 'grass' : r < 0.8 ? 'dot' : 'hill';
  return r < 0.65 ? 'peak' : 'pine';
}

// Landmarks drawn next to each stop, in coordinates relative to the stop.
const MARKS = {
  nauvoo: (g) => {
    el('path', { d: 'M12 -86 c -5 14, 5 26, -2 40 s 5 28, 0 44 s -4 20, 2 34', class: 'tm-water' }, g);
    el('path', { d: 'M-6 -10 l 5 -6 l 5 6 v 7 h -10 z M-1 -16 v -5', class: 'tm-ink' }, g);
  },
  'winter-quarters': (g) => {
    el('path', { d: 'M14 -60 c -6 12, 6 18, 0 30 s -6 18, 2 32 s 4 16, -2 30', class: 'tm-water' }, g);
    el('path', { d: 'M-12 -7 l 4 -5 l 4 5 z M-4 -7 l 4 -5 l 4 5 z', class: 'tm-ink' }, g);
  },
  'chimney-rock': (g) => {
    el('path', { d: 'M-12 -5 q 4 -7, 9 -8 l 2 -13 h 2 l 2 13 q 5 1, 9 8 z', class: 'tm-ink' }, g);
  },
  'south-pass': (g) => {
    el('path', { d: 'M-24 -6 l 10 -16 l 10 16 M6 -6 l 9 -15 l 10 15', class: 'tm-ink' }, g);
  },
  'salt-lake-valley': (g) => {
    el('ellipse', { cx: -12, cy: -18, rx: 11, ry: 5, class: 'tm-lake' }, g);
    el('path', { d: 'M4 -8 l 7 -11 l 7 11', class: 'tm-ink' }, g);
  },
};

// Label placement per stop, chosen so no name crosses the trail, a landmark or another name.
const LABEL = {
  nauvoo: { dx: 0, dy: 16, anchor: 'middle' },
  'winter-quarters': { dx: 0, dy: -24, anchor: 'middle' },
  'chimney-rock': { dx: 14, dy: 16, anchor: 'middle' },
  'south-pass': { dx: 0, dy: -28, anchor: 'middle' },
  'salt-lake-valley': { dx: -28, dy: 32, anchor: 'start' },
};
const CHAR_W = 6.2; // label advance per character at the label size, for keeping icons clear

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
  el('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${speckId})` }, svg);
  el('rect', { x: 5, y: 5, width: W - 10, height: H - 10, class: 'tm-frame' }, svg);

  const field = el('g', {}, svg);
  const marks = el('g', {}, svg);
  el('path', { d: ROUTE, class: 'tm-route' }, svg);
  const walked = el('path', { d: ROUTE, class: 'tm-walked' }, svg);
  const len = walked.getTotalLength();
  walked.setAttribute('stroke-dasharray', `0 ${len}`);

  // Keep-clear zones: the trail, each stop's landmark and each label.
  const clear = [];
  for (let i = 0; i <= 80; i++) {
    const p = walked.getPointAtLength((len * i) / 80);
    clear.push({ x0: p.x - 9, x1: p.x + 9, y0: p.y - 11, y1: p.y + 8 });
  }

  const dots = new Map();
  for (const b of R.BANDS) {
    const p = walked.getPointAtLength(len * trailShare(b.min));
    const g = el('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` }, marks);
    MARKS[b.id]?.(g);
    clear.push({ x0: p.x - 30, x1: p.x + 30, y0: p.y - 30, y1: p.y + 32 });
    dots.set(b.id, el('circle', { cx: p.x, cy: p.y, r: 3.2, class: 'tm-stop' }, svg));
    const l = LABEL[b.id];
    const x = p.x + l.dx;
    const y = p.y + l.dy;
    el('text', { x, y, class: 'tm-name', 'text-anchor': l.anchor }, svg).textContent = b.name;
    const w = b.name.length * CHAR_W;
    const x0 = l.anchor === 'start' ? x : l.anchor === 'end' ? x - w : x - w / 2;
    clear.push({ x0: x0 - 4, x1: x0 + w + 4, y0: y - 10, y1: y + 4 });
  }
  el('text', { x: W - 12, y: 17, class: 'tm-edge', 'text-anchor': 'end' }, svg).textContent = 'EAST';
  el('text', { x: 12, y: 17, class: 'tm-edge' }, svg).textContent = 'WEST';
  clear.push({ x0: 0, x1: 50, y0: 0, y1: 22 }, { x0: W - 50, x1: W, y0: 0, y1: 22 });

  const fr = rng(7);
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < 70; tries++) {
    const x = 14 + fr() * (W - 28);
    const y = 18 + fr() * (H - 30);
    if (clear.some((c) => x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1)) continue;
    el('path', { d: ICONS[iconFor(x, fr())], transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, class: 'tm-faint' }, field);
    clear.push({ x0: x - 9, x1: x + 9, y0: y - 10, y1: y + 6 });
    placed++;
  }

  // The wagon faces west: cover, bed, tongue, two wheels.
  const wagon = el('g', { class: 'tm-wagon' }, svg);
  el('path', { d: 'M-8 -4 q 0 -10, 8 -10 q 8 0, 8 10 z', class: 'tm-cover' }, wagon);
  el('rect', { x: -10, y: -4, width: 20, height: 5, rx: 1, class: 'tm-bed' }, wagon);
  el('path', { d: 'M-10 -2 h -5', class: 'tm-ink' }, wagon);
  for (const cx of [-6, 6]) el('circle', { cx, cy: 3, r: 3, class: 'tm-wheel' }, wagon);

  let at = 0;
  let frame = 0;
  const draw = (share) => {
    const p = walked.getPointAtLength(len * share);
    wagon.setAttribute('transform', `translate(${p.x.toFixed(1)} ${(p.y - 4).toFixed(1)})`);
    walked.setAttribute('stroke-dasharray', `${(len * share).toFixed(1)} ${len}`);
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
