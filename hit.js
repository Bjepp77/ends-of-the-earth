// Point-in-polygon hit testing over web/data/countries.json. No DOM, no map library.

export const SEA = Object.freeze({ code: null, kind: 'sea', sovereign: null });
export const EDGE_RADIUS_PX = 12;

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

// Test each polygon box separately so a feature spanning the date line does not hide an edge.
export function nearbyEdges(index, point, project, radius = EDGE_RADIUS_PX) {
  const near = [];
  const r2 = radius * radius;
  for (const f of index) {
    let found = false;
    for (const p of f.polygons) {
      for (const shift of [-360, 0, 360]) {
        const a = project(p.box[0] + shift, p.box[1]);
        const b = project(p.box[2] + shift, p.box[3]);
        if (point.x < Math.min(a.x, b.x) - radius || point.x > Math.max(a.x, b.x) + radius
          || point.y < Math.min(a.y, b.y) - radius || point.y > Math.max(a.y, b.y) + radius) continue;
        for (const ring of p.rings) {
          let prev = project(ring[ring.length - 1][0] + shift, ring[ring.length - 1][1]);
          for (const [lon, lat] of ring) {
            const next = project(lon + shift, lat);
            const dx = next.x - prev.x, dy = next.y - prev.y;
            const t = Math.max(0, Math.min(1, ((point.x - prev.x) * dx + (point.y - prev.y) * dy) / (dx * dx + dy * dy || 1)));
            const x = prev.x + t * dx, y = prev.y + t * dy;
            if ((point.x - x) ** 2 + (point.y - y) ** 2 <= r2) { found = true; break; }
            prev = next;
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (found) near.push(f);
  }
  return near;
}

// Area of the displayed Mercator shape at zoom zero, including islands and subtracting holes.
export function squareSizeAtZoomZero(feature) {
  let area = 0;
  for (const p of feature.polygons) {
    p.rings.forEach((ring, i) => {
      let twice = 0;
      for (let j = 0; j < ring.length; j++) {
        const [lon1, lat1] = ring[j], [lon2, lat2] = ring[(j + 1) % ring.length];
        const x1 = lon1 * 512 / 360, x2 = lon2 * 512 / 360;
        const y1 = -Math.log(Math.tan(Math.PI / 4 + lat1 * Math.PI / 360)) * 512 / (2 * Math.PI);
        const y2 = -Math.log(Math.tan(Math.PI / 4 + lat2 * Math.PI / 360)) * 512 / (2 * Math.PI);
        twice += x1 * y2 - x2 * y1;
      }
      area += (i === 0 ? 1 : -1) * Math.abs(twice) / 2;
    });
  }
  return Math.sqrt(Math.max(0, area));
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
  sea: 'At sea. Pin on land.',
  disputed: 'disputed ground, move it onto a country',
  unrecognized: 'not recognized by the UN, move it onto a country',
  none: 'place a pin first',
};
