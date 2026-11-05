// Map screen: MapLibre with no tiles, glyphs or sprites. Everything drawn from countries.json.
import { buildIndex, hitTest, refusalFor, nearbyEdges, squareSizeAtZoomZero } from './hit.js?v=2ec183197a';
import { rng } from './trail.js?v=2ec183197a';

const maplibregl = window.maplibregl;

// Weathered map in the Church palette (GVSG v1.1, see RESKIN.md): grey water with wave dashes and a
// pale coastal ripple, speckled neutral land, black worn coast ink, brown borders, dotted graticule.
export const MAP_COLORS = {
  sea: '#BDC0C0', // Gray 15
  seaLight: '#E0E2E2', // Gray 5
  wave: '#878A8C', // Gray 30
  land: '#E9E3D9', // Neutral 15
  landDim: '#C8C0AB', // Neutral 25, disputed
  landLit: '#FFD61A', // Yellow 5, picked country
  speck: '#674730', // Yellow 40
  fleck: '#EFEFE7', // Neutral 5, light grain
  coast: '#000000', // Black
  border: '#674730', // Yellow 40
  grid: '#53575B', // Gray 40
  focus: '#D45311', // Yellow 30
  river: '#878A8C', // Gray 30, physical layer rivers and lake shores
  desert: '#B3A18D', // Neutral 40, physical layer desert stipple
};

const MINOR_ZOOM = 3.5; // 5 degree graticule lines and ticks from here in; 15 degree lines always

export const WORLD_BOUNDS = [[-170, -58], [190, 78]];

export async function loadCountries(url = 'data/countries.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`countries.json: HTTP ${res.status}`);
  return res.json();
}

export function toGeoJSON(data) {
  return {
    type: 'FeatureCollection',
    features: data.features.map((f) => ({
      type: 'Feature',
      properties: { code: f.code, kind: f.kind },
      geometry: { type: 'MultiPolygon', coordinates: f.polygons },
    })),
  };
}

// Dotted lat/long lines: meridians every 5 degrees, parallels every 5 degrees to 75 N and S.
// Parallels carry a point every 10 degrees so tile clipping keeps them straight.
export function graticuleLines() {
  const features = [];
  const line = (coordinates, deg) => features.push({
    type: 'Feature', properties: { major: deg % 15 === 0 }, geometry: { type: 'LineString', coordinates },
  });
  for (let lng = -180; lng < 180; lng += 5) line([[lng, -85], [lng, 85]], lng);
  for (let lat = -75; lat <= 75; lat += 5) {
    const coords = [];
    for (let lng = -180; lng <= 180; lng += 10) coords.push([lng, lat]);
    line(coords, lat);
  }
  return { type: 'FeatureCollection', features };
}

// Pattern tiles drawn once on a canvas, so the texture pans and zooms with the map at no
// per-frame cost. Seeded, so every load draws the same paper.
function paperTile(base, { size = 96, specks = 0, waves = 0, seed = 1 }) {
  const r = devicePixelRatio > 1.5 ? 2 : 1;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * r;
  const g = cv.getContext('2d');
  g.scale(r, r);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rand = rng(seed);
  // Fine grain: faint light and dark flecks across the whole tile.
  for (let i = 0; i < size * 3; i++) {
    g.globalAlpha = 0.05 + rand() * 0.06;
    g.fillStyle = rand() < 0.5 ? MAP_COLORS.fleck : MAP_COLORS.speck;
    g.fillRect(rand() * size, rand() * size, 0.6, 0.6);
  }
  // Speckle: a few darker ink dots, as in the trail map.
  g.fillStyle = MAP_COLORS.speck;
  for (let i = 0; i < specks; i++) {
    g.globalAlpha = 0.18 + rand() * 0.2;
    g.beginPath();
    g.arc(rand() * size, rand() * size, 0.3 + rand() * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  // Waves: short horizontal dashes, kept off the tile edge so the repeat never cuts one.
  g.fillStyle = MAP_COLORS.wave;
  for (let i = 0; i < waves; i++) {
    g.globalAlpha = 0.35 + rand() * 0.2;
    const w = 4 + rand() * 5;
    g.fillRect(4 + rand() * (size - w - 8), 4 + rand() * (size - 8), w, 0.9);
  }
  const { data } = g.getImageData(0, 0, cv.width, cv.height);
  return { image: { width: cv.width, height: cv.height, data }, pixelRatio: r };
}

// Transparent mark tiles for the physical layer: small ink carets for mountain ranges, a sand
// stipple for deserts. Kept faint and sparse so they read as texture, never as symbols.
function markTile(kind) {
  const r = devicePixelRatio > 1.5 ? 2 : 1;
  const size = 96;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * r;
  const g = cv.getContext('2d');
  g.scale(r, r);
  const rand = rng(kind === 'range' ? 11 : 13);
  if (kind === 'range') {
    g.strokeStyle = MAP_COLORS.speck;
    g.lineWidth = 0.9;
    // A jittered 3 x 3 grid with gaps, so the repeat does not read as wallpaper.
    for (let i = 0; i < 9; i++) {
      if (rand() < 0.3) continue;
      const x = 12 + (i % 3) * 32 + (rand() - 0.5) * 14;
      const y = 12 + Math.floor(i / 3) * 32 + (rand() - 0.5) * 14;
      const w = 3 + rand() * 2;
      g.globalAlpha = 0.55 + rand() * 0.2;
      g.beginPath();
      g.moveTo(x - w, y + w * 0.8);
      g.lineTo(x, y);
      g.lineTo(x + w, y + w * 0.8);
      g.stroke();
    }
  } else {
    g.fillStyle = MAP_COLORS.desert;
    for (let i = 0; i < 100; i++) {
      g.globalAlpha = 0.45 + rand() * 0.35;
      g.beginPath();
      g.arc(2 + rand() * (size - 4), 2 + rand() * (size - 4), 0.5 + rand() * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  const { data } = g.getImageData(0, 0, cv.width, cv.height);
  return { image: { width: cv.width, height: cv.height, data }, pixelRatio: r };
}

const TILES = {
  'range-marks': () => markTile('range'),
  'desert-marks': () => markTile('desert'),
  'sea-paper': () => paperTile(MAP_COLORS.sea, { size: 120, waves: 7, seed: 3 }),
  'land-paper': () => paperTile(MAP_COLORS.land, { specks: 14, seed: 5 }),
  'land-dim-paper': () => paperTile(MAP_COLORS.landDim, { specks: 14, seed: 5 }),
};

function style(fc) {
  const c = MAP_COLORS;
  const byZoom = (a, b) => ['interpolate', ['linear'], ['zoom'], 1, a, 6, b];
  const dotted = { 'line-color': c.grid, 'line-width': 0.8, 'line-dasharray': [1, 3] };
  return {
    version: 8,
    sources: {
      countries: { type: 'geojson', data: fc, tolerance: 0.2 },
      graticule: { type: 'geojson', data: graticuleLines() },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': c.sea, 'background-pattern': 'sea-paper' } },
      // Coastal ripple, drawn under the land so only the sea side shows: a pale band at the shore,
      // a strip of open water, then a soft pale ring further out.
      { id: 'coast-halo', type: 'line', source: 'countries', paint: { 'line-color': c.seaLight, 'line-width': byZoom(12, 22), 'line-blur': 4, 'line-opacity': 0.75 } },
      { id: 'coast-gap', type: 'line', source: 'countries', paint: { 'line-color': c.sea, 'line-width': byZoom(7, 13) } },
      { id: 'coast-ripple', type: 'line', source: 'countries', paint: { 'line-color': c.seaLight, 'line-width': byZoom(4, 8) } },
      // Coastline in ink, with a broken, half-clear second stroke so the line thickens and thins like a worn nib.
      { id: 'coast', type: 'line', source: 'countries', paint: { 'line-color': c.coast, 'line-width': 1.8 } },
      { id: 'coast-wear', type: 'line', source: 'countries', paint: { 'line-color': c.coast, 'line-width': 3.4, 'line-opacity': 0.3, 'line-dasharray': [3, 1.5, 1, 2] } },
      {
        id: 'land', type: 'fill', source: 'countries',
        paint: {
          'fill-pattern': ['case', ['==', ['get', 'kind'], 'disputed'], 'land-dim-paper', 'land-paper'],
          'fill-antialias': false,
        },
      },
      { id: 'graticule', type: 'line', source: 'graticule', filter: ['get', 'major'], paint: { ...dotted, 'line-opacity': 0.55 } },
      { id: 'graticule-minor', type: 'line', source: 'graticule', minzoom: MINOR_ZOOM, filter: ['!', ['get', 'major']], paint: { ...dotted, 'line-opacity': 0.3 } },
      {
        id: 'focus-fill', type: 'fill', source: 'countries', filter: ['==', ['get', 'code'], ''],
        paint: { 'fill-color': c.landLit, 'fill-antialias': false },
      },
      {
        id: 'borders', type: 'line', source: 'countries',
        paint: { 'line-color': c.border, 'line-width': byZoom(0.6, 1.3), 'line-blur': 0.3 },
      },
      {
        id: 'focus-line', type: 'line', source: 'countries', filter: ['==', ['get', 'code'], ''],
        paint: { 'line-color': c.focus, 'line-width': 1.6 },
      },
    ],
  };
}

// Physical layer (place pin rounds): shaded relief, mountain ranges, deserts, lakes and rivers from
// Natural Earth (public domain), built by tools/build_physical.py. No names and no text. Fetched the
// first time it is switched on, so country rounds never pay for it.
export const PHYSICAL_URL = 'data/physical/physical.json';
export const PHYSICAL_LAYERS = ['phys-relief', 'phys-desert', 'phys-range', 'phys-lake', 'phys-lake-shore', 'phys-river'];

// physical.json stores each line or ring as integer deltas in 1/q degree; this restores GeoJSON.
export function unpackPhysical(d) {
  const ring = (a) => {
    const out = [];
    let x = 0, y = 0;
    for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([x / d.q, y / d.q]); }
    return out;
  };
  const fc = (features) => ({ type: 'FeatureCollection', features });
  return {
    rivers: fc(d.rivers.map(([z, lines]) => ({
      type: 'Feature', properties: { z }, geometry: { type: 'MultiLineString', coordinates: lines.map(ring) },
    }))),
    lakes: fc(d.lakes.map(([z, polys]) => ({
      type: 'Feature', properties: { z }, geometry: { type: 'MultiPolygon', coordinates: polys.map((p) => p.map(ring)) },
    }))),
    regions: fc(d.regions.map(([k, z, polys]) => ({
      type: 'Feature', properties: { kind: k === 'r' ? 'range' : 'desert', z },
      geometry: { type: 'MultiPolygon', coordinates: polys.map((p) => p.map(ring)) },
    }))),
    relief: d.relief,
  };
}

// Layer specs, drawn above the land paper and below the graticule, borders and picked country.
// Each feature carries z, the zoom it appears from, so detail grows from zoom 3 to 9.
export function physicalLayers() {
  const c = MAP_COLORS;
  const shown = ['<=', ['get', 'z'], ['zoom']];
  return [
    { id: 'phys-relief', type: 'raster', source: 'phys-relief',
      // The relief image is about 2 km a pixel, so it fades out as the vector detail takes over.
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.7, 4.5, 0.55, 6.5, 0], 'raster-fade-duration': 0 } },
    { id: 'phys-desert', type: 'fill', source: 'phys-regions', filter: ['all', ['==', ['get', 'kind'], 'desert'], shown],
      paint: { 'fill-pattern': 'desert-marks', 'fill-antialias': false, 'fill-opacity': 0.8 } },
    { id: 'phys-range', type: 'fill', source: 'phys-regions', filter: ['all', ['==', ['get', 'kind'], 'range'], shown],
      paint: { 'fill-pattern': 'range-marks', 'fill-antialias': false, 'fill-opacity': 0.7 } },
    { id: 'phys-lake', type: 'fill', source: 'phys-lakes', filter: shown,
      paint: { 'fill-pattern': 'sea-paper', 'fill-antialias': false } },
    { id: 'phys-lake-shore', type: 'line', source: 'phys-lakes', filter: shown,
      paint: { 'line-color': c.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 9, 1.1] } },
    { id: 'phys-river', type: 'line', source: 'phys-rivers', filter: shown,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': c.river,
        'line-opacity': 0.85,
        // Big rivers (low z) draw a touch wider than late-arriving tributaries.
        'line-width': ['interpolate', ['linear'], ['zoom'],
          3, ['case', ['<', ['get', 'z'], 3], 1.1, 0.6],
          9, ['case', ['<', ['get', 'z'], 4], 2.4, ['<', ['get', 'z'], 5.5], 1.6, 1]],
      } },
  ];
}

function physicalLayer(map, url = PHYSICAL_URL) {
  let loading = null;
  let on = false;
  const show = (v) => { for (const id of PHYSICAL_LAYERS) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none'); };
  async function load() {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`physical.json: HTTP ${res.status}`);
    const d = unpackPhysical(await res.json());
    map.addSource('phys-relief', { type: 'image', url: d.relief.url, coordinates: d.relief.coordinates });
    map.addSource('phys-regions', { type: 'geojson', data: d.regions, tolerance: 0.3 });
    map.addSource('phys-lakes', { type: 'geojson', data: d.lakes, tolerance: 0.3 });
    map.addSource('phys-rivers', { type: 'geojson', data: d.rivers, tolerance: 0.3 });
    for (const spec of physicalLayers()) map.addLayer({ ...spec, layout: { ...spec.layout, visibility: 'none' } }, 'graticule');
  }
  return {
    async set(v) {
      on = !!v;
      if (!on && !loading) return;
      loading ??= load().catch((e) => { loading = null; throw e; });
      await loading;
      show(on);
    },
    get on() { return on; },
  };
}

function pinElement() {
  const el = document.createElement('div');
  el.className = 'pin';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

// Names assist as an HTML overlay, so no glyph server is needed.
function nameOverlay(map, data, container) {
  const layer = document.createElement('div');
  layer.className = 'names';
  container.appendChild(layer);
  const items = data.features.map((f) => ({ f, spans: [] }));
  let on = true;
  let queued = false;

  function draw() {
    queued = false;
    if (!on) { layer.hidden = true; return; }
    layer.hidden = false;
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const it of items) {
      const [west, , east] = it.f.bbox;
      const wide = map.project([east, it.f.label[1]]).x - map.project([west, it.f.label[1]]).x;
      const fits = wide > it.f.name.length * 6.5;
      let used = 0;
      if (fits) {
        for (const k of [-360, 0, 360]) {
          const p = map.project([it.f.label[0] + k, it.f.label[1]]);
          if (p.x < -80 || p.x > w + 80 || p.y < -20 || p.y > h + 20) continue;
          let s = it.spans[used];
          if (!s) {
            s = document.createElement('span');
            s.textContent = it.f.name;
            layer.appendChild(s);
            it.spans.push(s);
          }
          s.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
          s.hidden = false;
          used++;
        }
      }
      for (let i = used; i < it.spans.length; i++) it.spans[i].hidden = true;
    }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  map.on('move', queue);
  map.on('resize', queue);
  queue();
  return { set(v) { on = v; queue(); } };
}

// Degree labels and ticks on a ruled frame round the map edge, in the HTML overlay like the names.
// Ticks every 15 degrees (5 when zoomed in) on all four edges; boxed labels on the top and left
// edges, at the widest step that keeps them about 56 px apart.
export function degreeLabel(deg, pos, neg) {
  const d = ((deg + 540) % 360) - 180; // longitudes past the date line come round again
  if (d === 0) return '0\u00b0';
  if (Math.abs(d) === 180) return '180\u00b0';
  return `${Math.abs(d)}\u00b0${d > 0 ? pos : neg}`;
}

function gratOverlay(map, container) {
  const layer = document.createElement('div');
  layer.className = 'grat';
  layer.setAttribute('aria-hidden', 'true');
  container.appendChild(layer);
  const pool = [];
  let used = 0;
  let queued = false;

  function put(cls, x, y, text) {
    let s = pool[used];
    if (!s) { s = document.createElement('span'); layer.appendChild(s); pool.push(s); }
    used++;
    s.className = cls;
    s.textContent = text ?? '';
    s.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    s.hidden = false;
  }

  function draw() {
    queued = false;
    used = 0;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const z = map.getZoom();
    const tick = z >= MINOR_ZOOM ? 5 : 15;
    const perDeg = map.project([1, 0]).x - map.project([0, 0]).x;
    const steps = z >= MINOR_ZOOM ? [5, 10, 15, 30, 60] : [15, 30, 60];
    const step = steps.find((s) => s * perDeg >= 56) ?? 60;
    const b = map.getBounds();
    const mid = map.getCenter();
    for (let lng = Math.ceil(b.getWest() / tick) * tick; lng <= b.getEast(); lng += tick) {
      const x = map.project([lng, mid.lat]).x;
      if (x < 8 || x > w - 8) continue;
      put('grat-tick grat-tick--top', x, 0);
      put('grat-tick grat-tick--bottom', x, h);
      if (lng % step === 0 && x > 40 && x < w - 40) put('grat-tag grat-tag--top', x, 0, degreeLabel(lng, 'E', 'W'));
    }
    for (let lat = Math.ceil(Math.max(b.getSouth(), -75) / tick) * tick; lat <= Math.min(b.getNorth(), 75); lat += tick) {
      const y = map.project([mid.lng, lat]).y;
      if (y < 8 || y > h - 8) continue;
      put('grat-tick grat-tick--left', 0, y);
      put('grat-tick grat-tick--right', w, y);
      if (lat % step === 0 && y > 30 && y < h - 30) put('grat-tag grat-tag--left', 0, y, degreeLabel(lat, 'N', 'S'));
    }
    for (let i = used; i < pool.length; i++) pool[i].hidden = true;
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  map.on('move', queue);
  map.on('resize', queue);
  queue();
}

export function createMap({ container, data, onPin = () => {}, onCloseCall = () => {}, onMapTap = () => {} }) {
  const index = buildIndex(data);
  const indexByCode = new Map(index.map((f) => [f.code, f]));
  const phonePortrait = matchMedia('(max-width: 767px) and (orientation: portrait)');
  const map = new maplibregl.Map({
    container,
    style: style(toGeoJSON(data)),
    bounds: WORLD_BOUNDS,
    attributionControl: false,
    renderWorldCopies: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    minZoom: phonePortrait.matches ? -1 : 0,
    maxZoom: 9,
  });
  phonePortrait.addEventListener('change', () => map.setMinZoom(phonePortrait.matches ? -1 : 0));
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.on('styleimagemissing', ({ id }) => {
    if (!TILES[id] || map.hasImage(id)) return;
    const { image, pixelRatio } = TILES[id]();
    map.addImage(id, image, { pixelRatio });
  });

  const marker = new maplibregl.Marker({ element: pinElement(), anchor: 'center' });
  const names = nameOverlay(map, data, container);
  const physical = physicalLayer(map);
  gratOverlay(map, container);
  const byCode = new Map(data.features.map((f) => [f.code, f]));
  let pin = null;
  let locked = false;
  let flying = false;
  let exactNext = false;
  let flags = [];
  let placeMode = false; // a place round: any pin counts, at sea too, and no close-call zoom
  let placeData = null;

  function focus(code, paint = null) {
    const f = ['==', ['get', 'code'], code ?? ''];
    map.setFilter('focus-fill', f);
    map.setFilter('focus-line', f);
    map.setPaintProperty('focus-fill', 'fill-color', paint?.fill ?? MAP_COLORS.landLit);
    map.setPaintProperty('focus-fill', 'fill-opacity', paint?.fillOpacity ?? 1);
    map.setPaintProperty('focus-line', 'line-opacity', paint?.lineOpacity ?? 1);
  }

  function show(p) {
    pin = p;
    marker.setLngLat([p.lng, p.lat]).addTo(map);
    marker.getElement().classList.toggle('pin--refused', !!p.refusal);
    // A place round keeps the country outline but not the lit fill, so the relief under the pin stays visible.
    focus(p.refusal ? null : p.hit.code, placeMode ? { fillOpacity: 0 } : null);
    onPin(pin);
    return pin;
  }

  function place(lngLat) {
    const hit = hitTest(index, lngLat.lng, lngLat.lat);
    return show({ lng: lngLat.lng, lat: lngLat.lat, hit, refusal: placeMode ? null : refusalFor(hit) });
  }

  // Name search: pin the country itself at its label point (some label points sit offshore).
  function placeFeature(code) {
    const f = byCode.get(code);
    if (!f) return null;
    const hit = { code: f.code, name: f.name, kind: f.kind, sovereign: f.sovereign ?? null };
    return show({ lng: f.label[0], lat: f.label[1], hit, refusal: placeMode ? null : refusalFor(hit), bySearch: true });
  }

  // §16 reveal: fly to the pinned country and fill it in the tier colour at its §4 alpha.
  // paint null is a miss: plain highlight.
  // coverTop: the viewport y where an overlay over the map's lower part begins; the camera keeps clear of it.
  function reveal(code, paint, coverTop = Infinity) {
    const f = byCode.get(code);
    if (!f) return;
    map.resize(); // the reveal layout may have just changed the map's size
    const box = container.getBoundingClientRect();
    const edge = Math.min(80, Math.round(box.height / 8));
    const padding = { top: edge, left: edge, right: edge, bottom: Math.max(edge, Math.round(box.bottom - coverTop) + 8) };
    focus(code, paint);
    const [w, s, e, n] = f.bbox;
    if (e - w > 300) map.flyTo({ center: f.label, zoom: 2, offset: [0, (padding.top - padding.bottom) / 2], duration: 800 }); // offset, not padding: padding would persist
    else map.fitBounds([[w, s], [e, n]], { padding, maxZoom: 5, duration: 800 });
  }

  // Place reveal: a dot on the place and a line from the pin, framed like reveal(). pinLngLat null: no pin.
  // Own source and layers, added on top at first use.
  function revealPlace(pinLngLat, place, coverTop = Infinity) {
    map.resize();
    const box = container.getBoundingClientRect();
    const edge = Math.min(80, Math.round(box.height / 8));
    const padding = { top: edge, left: edge, right: edge, bottom: Math.max(edge, Math.round(box.bottom - coverTop) + 8) };
    let lng = place.lng;
    if (pinLngLat) while (lng - pinLngLat.lng > 180) lng -= 360;
    if (pinLngLat) while (pinLngLat.lng - lng > 180) lng += 360; // the short way round
    const dot = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, place.lat] } };
    const features = [dot];
    if (pinLngLat) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[pinLngLat.lng, pinLngLat.lat], [lng, place.lat]] } });
    placeData = { type: 'FeatureCollection', features };
    if (!map.getSource('place-reveal')) {
      map.addSource('place-reveal', { type: 'geojson', data: placeData });
      map.addLayer({ id: 'place-line', type: 'line', source: 'place-reveal', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': MAP_COLORS.focus, 'line-width': 2, 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'place-dot', type: 'circle', source: 'place-reveal', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': MAP_COLORS.focus, 'circle-stroke-color': MAP_COLORS.coast, 'circle-stroke-width': 1.5 } });
    } else map.getSource('place-reveal').setData(placeData);
    if (!pinLngLat) { map.flyTo({ center: [lng, place.lat], zoom: 4, offset: [0, (padding.top - padding.bottom) / 2], duration: 800 }); return; }
    const w = Math.min(pinLngLat.lng, lng), e = Math.max(pinLngLat.lng, lng);
    const s = Math.min(pinLngLat.lat, place.lat), n = Math.max(pinLngLat.lat, place.lat);
    map.fitBounds([[w, s], [e, n]], { padding, maxZoom: 6, duration: 800 });
  }

  function clearPlace() {
    placeData = null;
    map.getSource('place-reveal')?.setData({ type: 'FeatureCollection', features: [] });
  }

  // §17 camp: numbered pins.
  function setFlags(list) {
    for (const m of flags) m.remove();
    flags = list.map(({ lng, lat, n, cls }) => {
      const el = document.createElement('div');
      el.className = `flag ${cls}`;
      el.textContent = String(n);
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
    });
  }

  // A press during a flight stops the flight, so moveend clears flying before that press's click.
  // Remember whether the press began mid-flight; a touch's emulated mousedown comes after moveend.
  let pressInFlight = false;
  let flyTarget = null;
  function fly(target) {
    flyTarget = target;
    flying = true;
    map.once('moveend', () => { flying = false; });
    map.flyTo({ ...target, duration: 300 });
  }
  let touchAt = -Infinity;
  map.on('touchstart', () => { pressInFlight = flying; touchAt = performance.now(); });
  map.on('mousedown', () => { if (performance.now() - touchAt > 1000) pressInFlight = flying; });

  map.on('click', (e) => {
    if (locked) return;
    const ignore = flying || pressInFlight;
    pressInFlight = false;
    onMapTap(ignore);
    if (ignore) {
      // The press stopped the close-call flight short: finish it, or the exact tap lands at world zoom.
      if (!flying && exactNext && flyTarget) fly(flyTarget);
      return;
    }
    if (exactNext) { exactNext = false; place(e.lngLat); return; }
    const hit = hitTest(index, e.lngLat.lng, e.lngLat.lat);
    const nearby = nearbyEdges(index, e.point, (lon, lat) => map.project([lon, lat]));
    const candidates = new Map(nearby.map((f) => [f.code, f]));
    if (hit.code) candidates.set(hit.code, indexByCode.get(hit.code));
    if (!placeMode && map.getZoom() < 9 && ((!hit.code && candidates.size > 0) || (hit.code && candidates.size > 1))) {
      const smallest = Math.min(...[...candidates.values()].map(squareSizeAtZoomZero));
      const square = smallest * 2 ** map.getZoom();
      // At most 4 levels in one fly: more, and a finger's few pixels of error land off screen.
      const zoom = Math.min(9, map.getZoom() + 4, Math.max(map.getZoom() + 2, map.getZoom() + Math.log2(44 / Math.max(square, 0.01))));
      exactNext = true;
      clearPin();
      onCloseCall();
      fly({ center: e.lngLat, zoom });
      return;
    }
    place(e.lngLat);
  });

  function clearPin() { pin = null; marker.remove(); focus(null); clearPlace(); onPin(null); }

  return {
    map,
    ready: new Promise((resolve) => map.once('load', resolve)),
    place,
    placeFeature,
    reveal,
    revealPlace,
    setPlaceMode(on) { placeMode = !!on; if (placeMode) exactNext = false; },
    get placeReveal() { return placeData; },
    setFlags,
    lock(v) { locked = v; if (v) exactNext = false; },
    hit: (lng, lat) => hitTest(index, lng, lat),
    get pin() { return pin; },
    clearPin,
    zoomIn() { map.zoomIn(); },
    zoomOut() { map.zoomOut(); },
    resetView() { exactNext = false; map.resize(); map.fitBounds(WORLD_BOUNDS, { duration: 600 }); },
    setNames(on) { names.set(on); },
    // Physical cartography for place pin rounds. Resolves once the layers are added and shown.
    setPhysical(on) { return physical.set(on); },
    get physical() { return physical.on; },
    setBorders(on) { map.setLayoutProperty('borders', 'visibility', on ? 'visible' : 'none'); },
  };
}
