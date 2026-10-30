// Lost sheep (owner, 2026-10-29, Luke 15): on the first miss of the day a lamb on a paper card
// bounces in over the trail strip and bleats. Its mouth is open from bleat onset to bleat end: 0.01 s to
// 0.94 s of audio/lost-sheep-baa.m4a, which is 0.60 s to 1.60 s of the Wikimedia recording.
// Sound off (or the bleat not loaded): one short open. Reduced motion: no bounce, and the open
// frame holds for the clip length. It is not a dialog: it never takes focus and sits over the
// trail strip (owner, 2026-10-29: the map stays clear), clear of NEXT PROMPT, and shrinks to fit
// a short strip (375x667). A tap on it or Escape closes it and stops the bleat; so does leaving the
// reveal any way at all (stopTimers in app.js).

const DELAY_MS = 600; // lets the reveal chord finish first
const BOUNCE_MS = 250;
const MOUTH_MS = [10, 940];
const MUTED_MOUTH_MS = [0, 300];

export function createSheep({ host, baa }) {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'sheep';
  root.id = 'sheep';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('aria-label', 'Lost sheep: a lamb bleats. Tap to close.');
  const frame = (name) => `<img class="sheep-img sheep-img--${name}" alt="" width="160" height="160" decoding="async"
    src="img/lost-sheep-${name}-160.webp" srcset="img/lost-sheep-${name}-160.webp 1x, img/lost-sheep-${name}-320.webp 2x">`;
  root.innerHTML = frame('closed') + frame('open');
  host.appendChild(root);

  let timers = [];
  let stopBaa = null;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const mouth = (open) => root.classList.toggle('sheep--open', open);

  function close() {
    timers.forEach(clearTimeout);
    timers = [];
    stopBaa?.();
    stopBaa = null;
    root.hidden = true;
    root.classList.remove('sheep--in');
    mouth(false);
  }
  root.addEventListener('pointerdown', (e) => e.preventDefault()); // a click never takes focus
  root.addEventListener('click', close);

  return {
    get isOpen() { return !root.hidden; },
    open() {
      close();
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      later(() => {
        root.hidden = false;
        if (!still) root.classList.add('sheep--in');
        later(() => {
          stopBaa = baa();
          const [from, to] = stopBaa || still ? MOUTH_MS : MUTED_MOUTH_MS;
          later(() => mouth(true), from);
          later(() => mouth(false), to);
        }, still ? 0 : BOUNCE_MS);
      }, DELAY_MS);
    },
    close,
  };
}
