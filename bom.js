import { logRow } from './rules.js';

// Book of Mormon round: pure rules. Coordinates are SVG units of web/data/bom-map.svg.

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Even-odd point in polygon.
function inPoly(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function hitTarget(target, x, y) {
  if (!target || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  switch (target.shape) {
    case 'circle': return Math.hypot(x - target.cx, y - target.cy) <= target.r;
    case 'poly': return target.points.length > 2 && inPoly(target.points, x, y);
    case 'line': {
      const p = target.points;
      for (let i = 1; i < p.length; i++) if (distToSegment(x, y, p[i - 1], p[i]) <= target.tol) return true;
      return false;
    }
    default: return false;
  }
}

// The 6th round deals one approved question a day, cycling by expedition number.
export function bomFor(n, bom) {
  const qs = bom?.questions ?? [];
  return qs.length && n >= 1 ? qs[(n - 1) % qs.length] : null;
}

// Level 1 easy, 2 medium, 3 hard, on the country tiers' km.
const LEVEL_TIER = { 1: 'home-ward', 2: 'mission', 3: 'ends' };
export function bomTier(level) {
  return LEVEL_TIER[level] ?? 'miss';
}

// Rounds in a day. Runs saved before the 6th round have no size and stay 5.
export function runSize(run, base = 5) {
  return run?.size ?? base;
}

// Decide a day's size once, before its first round opens. A finished, started or already sized run
// is left alone, so a day saved part-played before the 6th round existed stays 5.
export function sizeRun(run, q, base = 5) {
  if (!run || run.done || run.size != null || run.open || run.rounds?.length) return run;
  if (q) {
    run.size = base + 1;
    run.bom = q;
  }
  return run;
}

// The question as a prompt for the round screen.
export function bomPrompt(q) {
  return { ...q, display_text: q.question };
}

const round1 = (v) => Math.round(v * 10) / 10;

// Judge a pin in SVG units: pin = { lng: x, lat: y } or null (timeout with no pin).
export function judgeBom(q, pin, { timedOut = false, mask = 0, late = false, noNames = false } = {}) {
  const x = pin?.lng, y = pin?.lat;
  const hit = !!pin && hitTarget(q.target, x, y);
  const row = logRow({
    promptId: q.id, answer: hit ? q.id : null, countryCode: null, tierId: hit ? bomTier(q.level) : 'miss',
    lon: pin ? round1(x) : null, lat: pin ? round1(y) : null,
    name: hit ? q.answer : pin ? 'Not there' : null, timedOut, mask, late, noNames,
  });
  row.bom = true;
  return { row };
}
