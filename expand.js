// Expand and shrink (owner, 2026-10-28): every panel has a corner button. Press it and the panel
// pops out as a larger box in the middle of the screen over a grayed backdrop, like "bring to
// front". Press it again, press Escape or click the backdrop, and the panel goes back to its spot
// with all its info. A placeholder holds the spot so the page does not jump. One panel out at a time.

const GLYPH = { pop: '–', '': '⤢' }; // en dash = shrink, ⤢ = expand

export function createExpand(panels, { onChange } = {}) {
  const items = [];
  let open = null; // { item, spot, shade }
  // If the game hides a popped panel (next prompt, a new screen, home), it goes back quietly.
  const watch = new MutationObserver(() => { if (open && !open.item.el.getClientRects().length) close({ focus: false }); });

  for (const { selector, label } of panels) {
    const el = document.querySelector(selector);
    if (!el) continue;
    el.dataset.label = label;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'size-btn';
    // A list keeps valid children: the button rides in its own item.
    const holder = /^(OL|UL)$/.test(el.tagName) ? document.createElement('li') : btn;
    if (holder !== btn) { holder.className = 'size-li'; holder.setAttribute('role', 'none'); holder.append(btn); }
    const item = { el, btn, holder, label };
    btn.addEventListener('click', (e) => { e.stopPropagation(); open?.item === item ? close() : pop(item); });
    items.push(item);
    attach(item);
    // Panels that rebuild their contents (the camp rows) would drop the button; put it back.
    new MutationObserver(() => { if (!el.contains(holder)) attach(item); }).observe(el, { childList: true });
  }

  function attach(item) {
    item.el.prepend(item.holder);
    label(item);
  }

  function label(item) {
    const out = item.el.dataset.size === 'pop';
    item.btn.textContent = GLYPH[out ? 'pop' : ''];
    item.btn.setAttribute('aria-label', `${out ? 'Shrink' : 'Expand'} ${item.label.toLowerCase()}`);
    item.btn.setAttribute('aria-expanded', String(out));
  }

  function pop(item) {
    // A control inside the panel that opened it ("See more…") gets focus back on close.
    const from = document.activeElement;
    close({ quiet: true });
    const { el } = item;
    const back = from !== item.btn && el.contains(from) ? from : item.btn;
    // The placeholder takes the panel's measured box and its place in the flex or grid layout.
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const spot = document.createElement(el.tagName === 'LI' ? 'li' : 'div');
    spot.className = 'size-spot';
    spot.setAttribute('aria-hidden', 'true');
    Object.assign(spot.style, {
      width: `${r.width}px`, height: `${r.height}px`, margin: cs.margin,
      gridArea: cs.gridArea, order: cs.order, alignSelf: cs.alignSelf,
    });
    // The backdrop sits right before the panel so both share one stacking context.
    const shade = document.createElement('div');
    shade.className = 'size-shade';
    shade.addEventListener('click', () => close());
    el.before(spot, shade);
    el.dataset.size = 'pop';
    open = { item, spot, shade, back };
    watch.observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    label(item);
    item.btn.focus({ preventScroll: true });
    onChange?.();
  }

  function close({ quiet = false, focus = true } = {}) {
    if (!open) return;
    const { item, spot, shade, back } = open;
    open = null;
    watch.disconnect();
    spot.remove();
    shade.remove();
    delete item.el.dataset.size;
    label(item);
    if (quiet) return;
    if (focus) (back.getClientRects().length ? back : item.btn).focus({ preventScroll: true });
    onChange?.();
  }

  return {
    get isOpen() { return !!open; },
    close: () => close(),
    reset() {
      close({ quiet: true });
      onChange?.();
    },
  };
}
