// Walk-through (owner, 2026-10-28): a click-through tour over the practice round. Each step
// lights one part of the screen and says what it does. The player moves with NEXT and BACK,
// or leaves with SKIP; the round behind stays still until the tour closes.

export function createTour(steps, { onClose } = {}) {
  let i = 0;
  let open = false;
  let lit = null;

  const root = document.createElement('div');
  root.className = 'tour';
  root.id = 'tour';
  root.hidden = true;
  root.innerHTML = `
    <div class="tour-veil"></div>
    <div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-card card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      <p class="eyebrow" id="tour-n"></p>
      <p class="tour-title" id="tour-title"></p>
      <p class="tour-body" id="tour-body"></p>
      <div class="tour-nav">
        <button type="button" class="textlink" id="tour-skip">SKIP</button>
        <span class="tour-gap"></span>
        <button type="button" class="tour-btn" id="tour-back">BACK</button>
        <button type="button" class="cta tour-btn" id="tour-next">NEXT</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector(`#${id}`);
  const spot = root.querySelector('.tour-spot');
  const card = root.querySelector('.tour-card');

  // Only steps whose part is on screen right now; a step without a target is a centred note.
  const visible = () => steps.filter((s) => !s.target || shown(document.querySelector(s.target)));

  function shown(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  }

  function place() {
    if (!open) return;
    const list = visible();
    const step = list[i];
    const el = step.target ? document.querySelector(step.target) : null;
    if (lit !== el) {
      lit?.classList.remove('tour-lit');
      lit = el;
      el?.classList.add('tour-lit');
    }
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 6;
      Object.assign(spot.style, {
        display: 'block',
        left: `${r.left - pad}px`, top: `${r.top - pad}px`,
        width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
      });
      root.classList.remove('tour--note');
      // The card sits on the side of the screen away from the lit part.
      const mid = r.top + r.height / 2;
      card.classList.toggle('tour-card--top', mid > window.innerHeight / 2);
    } else {
      spot.style.display = 'none';
      root.classList.add('tour--note');
      card.classList.remove('tour-card--top');
    }
  }

  function render() {
    const list = visible();
    i = Math.max(0, Math.min(i, list.length - 1));
    const step = list[i];
    $('tour-n').textContent = `${i + 1} OF ${list.length}`;
    $('tour-title').textContent = step.title;
    $('tour-body').textContent = step.body;
    $('tour-back').hidden = i === 0;
    $('tour-next').textContent = i === list.length - 1 ? (step.last ?? 'DONE') : 'NEXT';
    const el = step.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView?.({ block: 'nearest' });
    place();
    $('tour-next').focus();
  }

  function close(skipped) {
    if (!open) return;
    open = false;
    root.hidden = true;
    lit?.classList.remove('tour-lit');
    lit = null;
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    onClose?.({ skipped });
  }

  $('tour-next').addEventListener('click', () => {
    if (i >= visible().length - 1) return close(false);
    i++;
    render();
  });
  $('tour-back').addEventListener('click', () => { i--; render(); });
  $('tour-skip').addEventListener('click', () => close(true));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); $('tour-next').click(); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); $('tour-back').click(); }
  });

  return {
    get isOpen() { return open; },
    start() {
      i = 0;
      open = true;
      root.hidden = false;
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      render();
    },
    close: () => close(true),
  };
}
