// Point-in-polygon hit testing over web/data/countries.json. No DOM, no map library.

export const SEA = Object.freeze({ code: null, kind: 'sea', sovereign: null });

export function wrapLon(lon) {
  if (lon >= -180 && lon <= 180) return lon;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function ringBox(ring) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

function inBox(b, x, y) {
  return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
}

// Even-odd over every ring of one polygon, so holes subtract.
function inPolygon(rings, x, y) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function buildIndex(data) {
  return data.features.map((f) => ({
    code: f.code,
    name: f.name,
    kind: f.kind,
    sovereign: f.sovereign ?? null,
    bbox: f.bbox,
    polygons: f.polygons.map((rings) => ({ box: ringBox(rings[0]), rings })),
  }));
}

const asHit = (f) => ({ code: f.code, name: f.name, kind: f.kind, sovereign: f.sovereign });

// Natural Earth draws the Western Sahara coastal strip inside Morocco. Manager ruling:
// Morocco south of 27.667 N is Western Sahara (disputed).
export const ESH_NORTH_LAT = 27.667;

export function hitTest(index, lon, lat) {
  const x = wrapLon(lon);
  const y = lat;
  for (const f of index) {
    if (!inBox(f.bbox, x, y)) continue;
    for (const p of f.polygons) {
      if (inBox(p.box, x, y) && inPolygon(p.rings, x, y)) {
        if (f.code === 'MAR' && y < ESH_NORTH_LAT) {
          const esh = index.find((g) => g.code === 'ESH');
          if (esh) return asHit(esh);
        }
        return asHit(f);
      }
    }
  }
  return SEA;
}

// Pin refusals (spec 3.3). Null means the pin may be dropped.
export function refusalFor(hit) {
  if (!hit || hit.kind === 'sea') return 'sea';
  if (hit.code === 'CYN') return 'unrecognized';
  if (hit.kind === 'disputed') return 'disputed';
  return null;
}

export const REFUSAL_TEXT = {
  sea: 'your pin is at sea, move it onto land',
  disputed: 'disputed ground, move it onto a country',
  unrecognized: 'not recognized by the UN, move it onto a country',
  none: 'place a pin first',
};
