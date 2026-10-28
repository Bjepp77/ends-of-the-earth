// Expand and shrink (owner, 2026-10-28): every panel has a corner button. Press it and the panel
// fills the screen; press again and it shrinks to a one-line bar with its name; press the bar's
// button and it fills the screen again. One panel fills the screen at a time, and the button
// stays on top, so nothing is ever left out of reach. Escape shrinks the full panel.

const GLYPH = { full: '–', compact: '⤢', '': '⤢' }; // en dash = shrink, ⤢ = expand

export function createExpand(panels, { onChange } = {}) {
  const items = [];

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
    btn.addEventListener('click', (e) => { e.stopPropagation(); press(item); });
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
    const size = item.el.dataset.size ?? '';
    item.btn.textContent = GLYPH[size];
    const verb = size === 'full' ? 'Shrink' : 'Expand';
    item.btn.setAttribute('aria-label', `${verb} ${item.label.toLowerCase()}`);
    item.btn.setAttribute('aria-expanded', String(size === 'full'));
  }

  function set(item, size) {
    if (size) item.el.dataset.size = size;
    else delete item.el.dataset.size;
    label(item);
  }

  function press(item) {
    const size = item.el.dataset.size ?? '';
    if (size === 'full') set(item, 'compact');
    else {
      for (const other of items) if (other !== item && other.el.dataset.size === 'full') set(other, '');
      set(item, 'full');
    }
    document.body.classList.toggle('has-full', items.some((i) => i.el.dataset.size === 'full'));
    item.btn.focus();
    onChange?.();
  }

  return {
    get fullOpen() { return items.some((i) => i.el.dataset.size === 'full'); },
    shrinkFull() {
      const item = items.find((i) => i.el.dataset.size === 'full');
      if (item) press(item);
    },
    reset() {
      for (const item of items) set(item, '');
      document.body.classList.remove('has-full');
      onChange?.();
    },
  };
}
