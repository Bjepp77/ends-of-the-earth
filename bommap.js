// Book of Mormon round: the illustrative map as an inline SVG with the same view members app.js
// uses on the world map. Pins and targets are in SVG units: pin.lng is x, pin.lat is y.

const NS = 'http://www.w3.org/2000/svg';
const START = [30, 150, 880, 1130]; // the map body; legend and footer panels sit outside it
const MIN_W = 140;
const MAX_W = 1300;
const DRAG_PX = 6;

export function createBomMap({ container, onPin }) {
  let svg = null;
  let layer = null;
  let pin = null;
  let locked = false;
  let names = true;
  let hide = [];
  let shown = null; // revealed target, or null
  let vb = [...START];
  let loading = null;

  function load() {
    loading ??= fetch('data/bom-map.svg').then((r) => r.text()).then((text) => {
      // The SVG is our own tracked file (copied by tools/bom_sync.py), not user content.
      container.innerHTML = text;
      svg = container.querySelector('svg');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      layer = document.createElementNS(NS, 'g');
      layer.setAttribute('class', 'bom-layer');
      svg.appendChild(layer);
      wire();
      draw();
    });
    return loading;
  }

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  }

  function targetShape(t) {
    if (t.shape === 'circle') return el('circle', { cx: t.cx, cy: t.cy, r: t.r, class: 'bom-target' });
    const pts = t.points.map((p) => p.join(',')).join(' ');
    if (t.shape === 'poly') return el('polygon', { points: pts, class: 'bom-target' });
    return el('polyline', { points: pts, class: 'bom-target bom-target--line', 'stroke-width': t.tol * 2 });
  }

  function draw() {
    if (!svg) return;
    svg.setAttribute('viewBox', vb.join(' '));
    for (const t of svg.querySelectorAll('text')) {
      const s = t.textContent.trim();
      t.style.display = shown || (names && !hide.some((h) => s.startsWith(h))) ? '' : 'none';
    }
    layer.textContent = '';
    // Mask the legend and footer panels beside and below the map body; they list place names.
    layer.appendChild(el('rect', { x: 915, y: -4000, width: 8000, height: 9000, fill: '#e6d2a3' }));
    layer.appendChild(el('rect', { x: -4000, y: 1285, width: 9000, height: 5000, fill: '#e6d2a3' }));
    if (shown) layer.appendChild(targetShape(shown));
    if (pin) layer.appendChild(el('circle', { cx: pin.lng, cy: pin.lat, r: 7 * (vb[2] / START[2]), class: 'bom-pin' }));
  }

  function toSvg(clientX, clientY) {
    const m = svg.getScreenCTM().inverse();
    const p = new DOMPoint(clientX, clientY).matrixTransform(m);
    return { lng: p.x, lat: p.y };
  }

  // Zoom by factor k (below 1 zooms in) about an SVG point.
  function zoomAt(k, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) {
    const w = Math.max(MIN_W, Math.min(MAX_W, vb[2] * k));
    const f = w / vb[2];
    vb = [cx - (cx - vb[0]) * f, cy - (cy - vb[1]) * f, w, vb[3] * f];
    draw();
  }

  function pan(dx, dy) {
    vb = [vb[0] + dx, vb[1] + dy, vb[2], vb[3]];
    draw();
  }

  function place({ lng, lat }) {
    pin = { lng, lat, hit: { name: 'PIN PLACED' }, refusal: null, bom: true };
    draw();
    onPin(pin);
    return pin;
  }

  // Tap without drag places the pin; one finger or the mouse pans; two fingers pinch.
  function wire() {
    const pts = new Map();
    let moved = false;
    let pinch = null;
    const scale = () => vb[2] / svg.getBoundingClientRect().width;
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      if (pts.size === 1) moved = false;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2 && pinch) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0) {
          const mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
          zoomAt(pinch / d, mid.lng, mid.lat);
          pinch = d;
        }
        return;
      }
      if (!moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < DRAG_PX) return;
      moved = true;
      const s = scale();
      pan(-(e.clientX - p.x) * s, -(e.clientY - p.y) * s);
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => {
      const was = pts.has(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (was && e.type === 'pointerup' && !moved && pts.size === 0 && !locked) place(toSvg(e.clientX, e.clientY));
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const at = toSvg(e.clientX, e.clientY);
      zoomAt(e.deltaY > 0 ? 1.2 : 1 / 1.2, at.lng, at.lat);
    }, { passive: false });
    container.addEventListener('keydown', (e) => {
      const step = vb[2] / 8;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      pan(...d);
    });
  }

  return {
    get ready() { return load(); },
    get pin() { return pin; },
    place,
    placeFeature() { return null; },
    setFlags() {},
    setBorders() {},
    lock(v) { locked = v; },
    clearPin() { pin = null; draw(); onPin(null); },
    zoomIn() { zoomAt(0.7); },
    zoomOut() { zoomAt(1 / 0.7); },
    resetView() { vb = [...START]; draw(); },
    setNames(on) { names = on !== false; draw(); },
    map: {
      getZoom: () => Math.round(Math.log2(START[2] / vb[2]) * 10) / 10,
      getCenter: () => ({ lng: vb[0] + vb[2] / 2, lat: vb[1] + vb[3] / 2 }),
    },
    // Open the round for question q: answer labels hidden, no target drawn.
    show(q, namesOn) {
      hide = q.hide ?? [];
      names = namesOn !== false;
      shown = null;
      container.hidden = false;
      return load().then(draw);
    },
    hide() { container.hidden = true; },
    // Reveal: every label back, the target drawn, the view framed on the target and the pin.
    revealTarget(q) {
      shown = q.target;
      const t = q.target;
      const xs = t.shape === 'circle' ? [t.cx - t.r, t.cx + t.r] : t.points.map((p) => p[0]);
      const ys = t.shape === 'circle' ? [t.cy - t.r, t.cy + t.r] : t.points.map((p) => p[1]);
      if (pin) { xs.push(pin.lng); ys.push(pin.lat); }
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const w = Math.max(320, (x1 - x0) * 1.6, (y1 - y0) * 1.6 * (START[2] / START[3]));
      const h = w * (START[3] / START[2]);
      vb = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
      draw();
    },
  };
}
