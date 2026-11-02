// Question 6: an unscored Book of Mormon map question offered at camp. Nothing here touches the run,
// the log, stamps, the passport, km or the share. Coordinates are sheet units, as in data/q6.json.
import { expeditionNumber } from './rules.js?v=1e96aaa85d';

// The expedition days that have a question. tools/validate.py checks these equal the first and last day in q6.json.
export const Q6_FIRST_DAY = 8;
export const Q6_LAST_DAY = 37;

const DRAG_PX = 6;
const MAX_ZOOM = 10;
const NEAR_FACTOR = 2.5;
const BOX_GROW = 8;
const LINK_GUARD_MS = 400;
const OPEN_GUARD_MS = 400; // The second tap of a double tap on the open button lands on the overlay.
const VERDICT = { hit: 'HIT', near: 'NEAR', miss: 'MISS' };

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function targetDistance(target, x, y) {
  if (!target.line) return Math.hypot(x - target.x, y - target.y);
  let best = Infinity;
  for (let i = 0; i < target.line.length - 1; i++) {
    best = Math.min(best, segmentDistance(x, y, target.line[i], target.line[i + 1]));
  }
  return best;
}

// 'hit' within r of the point or line, or on the label; 'near' within 2.5 r; else 'miss'.
export function judge(target, x, y) {
  const d = targetDistance(target, x, y);
  const [x0, y0, x1, y1] = target.box;
  const onLabel = x >= x0 - BOX_GROW && x <= x1 + BOX_GROW && y >= y0 - BOX_GROW && y <= y1 + BOX_GROW;
  if (d <= target.r || onLabel) return 'hit';
  return d <= NEAR_FACTOR * target.r ? 'near' : 'miss';
}

// Known without the file, so a day with no question never fetches it and never shows a failure.
export function hasQuestionDay(date, day1) {
  const n = expeditionNumber(date, day1);
  return n >= Q6_FIRST_DAY && n <= Q6_LAST_DAY;
}

export function questionFor(data, date) {
  return data?.questions?.find((q) => q.date === date) ?? null;
}

// Screen pixels per sheet unit at zoom 1: the whole sheet fits the stage.
export function fitScale(sheet, stageW, stageH) {
  return Math.min(stageW / sheet[2], stageH / sheet[3]);
}

// Keeps the map on the stage: centred on an axis it does not fill, edge to edge on one it overfills.
export function clampOffset(offset, stageSize, mapSize) {
  if (mapSize <= stageSize) return (stageSize - mapSize) / 2;
  return Math.max(stageSize - mapSize, Math.min(0, offset));
}

// A point on the stage, in stage pixels, to sheet units. view = { s, tx, ty }.
export function toSheet(view, sheet, cx, cy) {
  return { x: sheet[0] + (cx - view.tx) / view.s, y: sheet[1] + (cy - view.ty) / view.s };
}

function targetExtent(t) {
  const xs = t.line ? t.line.map((p) => p[0]) : [t.x - t.r, t.x + t.r];
  const ys = t.line ? t.line.map((p) => p[1]) : [t.y - t.r, t.y + t.r];
  return { xs: [...xs, t.box[0], t.box[2]], ys: [...ys, t.box[1], t.box[3]] };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// root is the camp block: button, failure message, Retry. getJSON fetches q6.json only when camp opens
// on a day with a question. day1 is the game's epoch, config.day1.
export function createQ6({ root, store, getJSON, day1, url = 'data/q6.json' }) {
  const open = root?.querySelector('.q6-open');
  const msg = root?.querySelector('.q6-msg');
  const retry = root?.querySelector('.q6-retry');
  // New script with a cached old page: no camp block, so question 6 does nothing and the game plays.
  if (!open || !msg || !retry) return { showCamp: () => Promise.resolve(), close() {}, state: {}, isOpen: false };
  let data = null;
  let question = null;
  let date = null;
  let call = 0;
  let overlay = null;
  let view = { s: 1, tx: 0, ty: 0 };
  let zoom = 1;
  let pin = null;
  let answered = false;
  let dom = null;
  let checkedAt = -Infinity;
  let openedAt = -Infinity;
  let pageY = 0;

  function showCamp(forDate) {
    const mine = ++call;
    date = forDate;
    question = null;
    open.hidden = true;
    msg.hidden = true;
    retry.hidden = true;
    root.hidden = true;
    if (!hasQuestionDay(forDate, day1)) return Promise.resolve();
    const ready = data ? Promise.resolve(data) : getJSON(url);
    return ready.then((d) => {
      data = d;
      if (mine !== call) return;
      question = questionFor(d, forDate);
      root.hidden = !question;
      open.hidden = !question;
    }).catch(() => {
      if (mine !== call) return;
      root.hidden = false;
      msg.textContent = 'Could not load question 6. Check your connection.';
      msg.hidden = false;
      retry.hidden = false;
    });
  }

  function stageSize() {
    return { w: dom.stage.clientWidth, h: dom.stage.clientHeight };
  }

  function apply() {
    const { w, h } = stageSize();
    const sheet = data.image.sheet;
    const s = fitScale(sheet, w, h) * zoom;
    view = {
      s,
      tx: clampOffset(view.tx, w, sheet[2] * s),
      ty: clampOffset(view.ty, h, sheet[3] * s),
    };
    // The image keeps its natural size and is scaled down, so zooming in never blurs a small raster.
    const natural = dom.img.naturalWidth / sheet[2] || 1;
    dom.layer.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${s / natural})`;
    draw();
  }

  function screen(x, y) {
    const sheet = data.image.sheet;
    return [(x - sheet[0]) * view.s + view.tx, (y - sheet[1]) * view.s + view.ty];
  }

  function draw() {
    const NS = 'http://www.w3.org/2000/svg';
    const shape = (tag, cls, attrs) => {
      const e = document.createElementNS(NS, tag);
      e.setAttribute('class', cls);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      dom.marks.appendChild(e);
    };
    dom.marks.textContent = '';
    if (answered) {
      const t = question.target;
      if (t.line) {
        const pts = t.line.map(([x, y]) => screen(x, y).join(',')).join(' ');
        shape('polyline', 'q6-band', { points: pts, 'stroke-width': Math.max(6, 2 * t.r * view.s) });
      } else {
        const [cx, cy] = screen(t.x, t.y);
        shape('circle', 'q6-ring', { cx, cy, r: Math.max(10, t.r * view.s) });
      }
    }
    if (pin) {
      const [cx, cy] = screen(pin.x, pin.y);
      shape('circle', 'q6-pin', { cx, cy, r: 7 });
    }
  }

  function zoomAt(factor, cx, cy) {
    const next = Math.max(1, Math.min(MAX_ZOOM, zoom * factor));
    const k = next / zoom;
    view = { s: view.s, tx: cx - (cx - view.tx) * k, ty: cy - (cy - view.ty) * k };
    zoom = next;
    apply();
  }

  function zoomCentre(factor) {
    const { w, h } = stageSize();
    zoomAt(factor, w / 2, h / 2);
  }

  function pan(dx, dy) {
    view = { ...view, tx: view.tx + dx, ty: view.ty + dy };
    apply();
  }

  function place(x, y) {
    if (answered) return;
    pin = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    dom.check.disabled = false;
    draw();
    // On a short screen CHECK starts below the fold.
    dom.check.scrollIntoView({ block: 'nearest' });
  }

  // Frames the answer, its label and the pin.
  function frame() {
    const { xs, ys } = targetExtent(question.target);
    if (pin) { xs.push(pin.x); ys.push(pin.y); }
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const { w, h } = stageSize();
    const sheet = data.image.sheet;
    const fit = fitScale(sheet, w, h);
    const want = Math.min(w / ((x1 - x0 || 1) * 1.5), h / ((y1 - y0 || 1) * 1.5)) / fit;
    zoom = Math.max(1, Math.min(4, want));
    const s = fit * zoom;
    view = { s, tx: w / 2 - ((x0 + x1) / 2 - sheet[0]) * s, ty: h / 2 - ((y0 + y1) / 2 - sheet[1]) * s };
    apply();
  }

  function reveal(verdict) {
    answered = true;
    dom.check.hidden = true;
    dom.hint.hidden = true;
    const q = question;
    dom.verdict.textContent = VERDICT[verdict];
    dom.answer.textContent = q.answer;
    dom.cite.textContent = `${q.ref}: “${q.quote}”`;
    dom.link.href = q.link;
    dom.result.hidden = false;
    frame();
    // CHECK just hid with the focus on it: keep the focus inside, so Esc and Tab still work here.
    dom.result.focus();
  }

  function check() {
    if (!pin || answered) return;
    const verdict = judge(question.target, pin.x, pin.y);
    store.saveBonus(date, { id: question.id, x: pin.x, y: pin.y, verdict });
    reveal(verdict);
    checkedAt = performance.now();
  }

  function wire() {
    const { stage } = dom;
    const pts = new Map();
    let moved = false;
    let pinch = null;
    const local = (e) => {
      const r = stage.getBoundingClientRect();
      return [e.clientX - r.left - stage.clientLeft, e.clientY - r.top - stage.clientTop];
    };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, early: performance.now() - openedAt < OPEN_GUARD_MS });
      if (pts.size === 1) moved = false;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
      }
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2 && pinch) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0) {
          const [cx, cy] = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
          zoomAt(d / pinch, cx, cy);
          pinch = d;
        }
        return;
      }
      if (!moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < DRAG_PX) return;
      moved = true;
      pan(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const up = (e) => {
      const early = pts.get(e.pointerId)?.early;
      const was = pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (was && e.type === 'pointerup' && !moved && pts.size === 0 && !early) {
        const [cx, cy] = local(e);
        const { x, y } = toSheet(view, data.image.sheet, cx, cy);
        const sheet = data.image.sheet;
        if (dom.img.naturalWidth && x >= sheet[0] && x <= sheet[0] + sheet[2] && y >= sheet[1] && y <= sheet[1] + sheet[3]) place(x, y);
      }
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [cx, cy] = local(e);
      zoomAt(e.deltaY > 0 ? 1 / 1.2 : 1.2, cx, cy);
    }, { passive: false });
    stage.addEventListener('keydown', (e) => {
      const step = 48;
      const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (d) { e.preventDefault(); pan(...d); return; }
      if ((e.key === 'p' || e.key === 'P') && dom.img.naturalWidth) {
        const { w, h } = stageSize();
        const { x, y } = toSheet(view, data.image.sheet, w / 2, h / 2);
        place(x, y);
      }
    });
  }

  function loadMap() {
    dom.fail.hidden = true;
    dom.img.removeAttribute('src');
    dom.img.src = data.image.src;
  }

  function build() {
    overlay = el('div', 'q6');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Question 6, bonus, does not count');
    overlay.hidden = true;
    // A click on plain text lands the focus here, so the keys below still work.
    overlay.tabIndex = -1;

    const head = el('div', 'q6-head');
    const title = el('p', 'eyebrow q6-title', 'QUESTION 6, BONUS, DOES NOT COUNT');
    const draft = el('span', 'q6-draft', 'DRAFT');
    const close = el('button', 'q6-close', 'CLOSE');
    close.type = 'button';
    // Time the press, not the release: a press inside the guard stays ignored however long it is held. Keyboard clicks have detail 0.
    let closePressedAt = Infinity;
    close.addEventListener('pointerdown', () => { closePressedAt = performance.now(); });
    close.onclick = (e) => { if ((e.detail ? closePressedAt : performance.now()) - openedAt >= OPEN_GUARD_MS) closeOverlay(); };
    head.append(title, draft, close);

    const ask = el('p', 'q6-ask');

    const stage = el('div', 'q6-stage');
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', 'Map. Arrow keys pan, P pins the centre.');
    const layer = el('div', 'q6-layer');
    const img = el('img', 'q6-img');
    img.alt = 'Map of the geography the text describes, a drawing with no location claim.';
    img.draggable = false;
    layer.appendChild(img);
    const marks = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    marks.setAttribute('class', 'q6-marks');
    marks.setAttribute('aria-hidden', 'true');
    const zoomer = el('div', 'q6-zoom');
    const plus = el('button', 'q6-zoom-btn', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Zoom in');
    plus.onclick = () => zoomCentre(1.5);
    const minus = el('button', 'q6-zoom-btn', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Zoom out');
    minus.onclick = () => zoomCentre(1 / 1.5);
    zoomer.append(plus, minus);
    const fail = el('div', 'q6-fail');
    const failText = el('p', '', 'Could not load the map. Check your connection.');
    const failRetry = el('button', 'cta q6-map-retry', 'RETRY');
    failRetry.type = 'button';
    failRetry.onclick = () => { loadMap(); dom.close.focus(); };
    fail.append(failText, failRetry);
    fail.hidden = true;
    stage.append(layer, marks, zoomer, fail);

    const caption = el('p', 'fine q6-caption');
    const hint = el('p', 'fine q6-hint', 'Tap to pin. Tap again to move. Drag to pan, pinch to zoom.');
    const checkBtn = el('button', 'share q6-check', 'CHECK');
    checkBtn.type = 'button';
    checkBtn.onclick = check;

    const result = el('div', 'q6-result');
    const verdict = el('p', 'q6-verdict');
    const answer = el('p', 'q6-answer');
    const cite = el('p', 'q6-cite');
    const link = el('a', 'q6-link', 'Read the chapter');
    link.target = '_blank';
    link.rel = 'noopener';
    // The link lands where CHECK was: the second tap of a double tap must not open it.
    let linkPressedAt = Infinity;
    link.addEventListener('pointerdown', () => { linkPressedAt = performance.now(); });
    link.onclick = (e) => { if ((e.detail ? linkPressedAt : performance.now()) - Math.max(checkedAt, openedAt) < LINK_GUARD_MS) e.preventDefault(); };
    result.append(verdict, answer, cite, link);
    result.hidden = true;
    result.tabIndex = -1;

    const body = el('div', 'q6-body');
    body.append(head, ask, stage, result, hint, checkBtn);
    overlay.append(body, caption);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); return; }
      // Tab stays inside, as in the menu drawer (F-U08).
      if (e.key !== 'Tab') return;
      const items = [...overlay.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((i) => !i.disabled && i.getClientRects().length);
      const first = items[0];
      const last = items[items.length - 1];
      const now = document.activeElement;
      if (e.shiftKey && (now === first || now === overlay)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && now === last) { e.preventDefault(); first.focus(); }
    });
    document.body.appendChild(overlay);

    img.onload = () => {
      layer.style.width = `${img.naturalWidth}px`;
      layer.style.height = `${img.naturalHeight}px`;
      if (answered) frame();
      else apply();
    };
    img.onerror = () => {
      if (img.getAttribute('src')) dom.fail.hidden = false;
    };
    dom = { stage, layer, img, marks, ask, draft, caption, hint, check: checkBtn, result, verdict, answer, cite, link, fail, close };
    wire();
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!overlay.hidden && dom.img.naturalWidth) apply(); }).observe(stage);
  }

  function openOverlay() {
    if (!question) return;
    if (!overlay) build();
    dom.ask.textContent = question.question;
    dom.draft.hidden = data.vetted !== false;
    dom.caption.textContent = data.statements.join(' ');
    dom.result.hidden = true;
    dom.hint.hidden = false;
    dom.check.hidden = false;
    dom.check.disabled = true;
    dom.marks.textContent = '';
    pin = null;
    answered = false;
    zoom = 1;
    view = { s: 1, tx: 0, ty: 0 };
    if (overlay.hidden) lockPage();
    overlay.hidden = false;
    const saved = store.bonus(date);
    const done = saved?.id === question.id;
    if (done) {
      pin = { x: saved.x, y: saved.y };
      reveal(saved.verdict);
    }
    if (dom.img.getAttribute('src') && dom.img.complete && dom.img.naturalWidth) {
      if (done) frame();
      else apply();
    } else {
      loadMap();
    }
    dom.close.focus();
    openedAt = performance.now();
  }

  // The page scrolls on the window, so a wheel or swipe on the overlay would move it. Fixed body holds it still.
  function lockPage() {
    pageY = window.scrollY;
    const { style } = document.body;
    style.position = 'fixed';
    style.top = `-${pageY}px`;
    style.width = '100%';
  }

  function unlockPage() {
    const { style } = document.body;
    style.position = style.top = style.width = '';
    if (!document.body.getAttribute('style')) document.body.removeAttribute('style');
    window.scrollTo({ top: pageY, behavior: 'instant' });
  }

  function closeOverlay() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    unlockPage();
    open.focus({ preventScroll: true });
  }

  open.onclick = openOverlay;
  retry.onclick = () => showCamp(date);

  return {
    showCamp,
    close: closeOverlay,
    // Test aid: the current view and pin.
    get state() {
      return { view, zoom, pin, answered, question };
    },
    get isOpen() {
      return !!overlay && !overlay.hidden;
    },
  };
}
