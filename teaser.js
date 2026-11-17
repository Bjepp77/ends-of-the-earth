// Teaser (owner, 2026-11-16): a short upright video plays before the tour's practice prompt.
// The <video> is built on the first play() and never on page load, so nobody who skips the tour
// downloads it. play() must be called inside the click that opens the tour: that click is what
// lets the browser play sound. If the browser refuses sound, the video plays muted with a
// TAP FOR SOUND button. SKIP, Escape, the end of the video, an error, or no playback within
// START_MS all close it; the tour never waits on the video.
// play({ auto: true }) is the first visit, with no tap (owner's iPhone, 2026-11-16: Low Power Mode
// refuses every no-tap play). It never closes silently: if every no-tap play is refused, or nothing
// is playing within AUTO_START_MS, the poster stays up with a big PLAY button. Only a tap on PLAY
// can then start it, and if that tap's play fails or takes over START_MS the video closes.

const START_MS = 3000;
const AUTO_START_MS = 4000;
const POSTER = 'video/teaser-poster.jpg';

// The hosting overlay's Feedback/Annotate/Assistant buttons sit above the video. Hide them while it
// is open; returns a function that restores each one's previous inline visibility.
function hideOverlayButtons(keep) {
  const saved = [];
  for (const el of document.body.children) {
    if (el === keep) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || !(Number(cs.zIndex) > 60)) continue;
    saved.push([el, el.style.visibility]);
    el.style.visibility = 'hidden';
  }
  return () => { for (const [el, v] of saved) el.style.visibility = v; };
}

export function createTeaser({ src, startMs = START_MS, autoStartMs = AUTO_START_MS, poster = POSTER }) {
  let root = null;
  let video = null;
  let soundBtn = null;
  let playBtn = null;
  let finish = null;

  function build() {
    root = document.createElement('div');
    root.className = 'teaser';
    root.id = 'teaser';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Intro video');
    root.innerHTML = `
      <video class="teaser-video" id="teaser-video" playsinline webkit-playsinline preload="auto"></video>
      <button type="button" class="teaser-btn" id="teaser-sound" hidden>TAP FOR SOUND</button>
      <button type="button" class="teaser-btn" id="teaser-play" hidden>PLAY</button>
      <button type="button" class="teaser-btn" id="teaser-skip">SKIP</button>`;
    document.body.appendChild(root);
    video = root.querySelector('video');
    soundBtn = root.querySelector('#teaser-sound');
    playBtn = root.querySelector('#teaser-play');
    root.querySelector('#teaser-skip').addEventListener('click', () => finish?.('skipped'));
    soundBtn.addEventListener('click', () => {
      video.muted = false;
      soundBtn.hidden = true;
      root.querySelector('#teaser-skip').focus();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish?.('skipped'); }
    });
  }

  // Resolves 'ended', 'skipped' or 'failed'. Never rejects.
  function play({ auto = false } = {}) {
    if (finish) return Promise.resolve('skipped'); // already showing
    if (!root) build();
    return new Promise((resolve) => {
      let started = false;
      let offered = false;
      let timer = null;
      const restore = hideOverlayButtons(root);
      // No-tap play could not start: wait on the poster for a tap. Never closes.
      const offerPlay = () => {
        if (!finish || offered || started) return;
        offered = true;
        clearTimeout(timer);
        video.pause();
        soundBtn.hidden = true;
        playBtn.hidden = false;
        playBtn.focus();
      };
      const onPlay = () => {
        playBtn.hidden = true;
        video.muted = false;
        clearTimeout(timer);
        timer = setTimeout(() => { if (!started) finish?.('failed'); }, startMs);
        video.play().catch(() => finish?.('failed'));
      };
      timer = setTimeout(() => { if (auto) offerPlay(); else if (!started) finish('failed'); }, auto ? autoStartMs : startMs);
      const onPlaying = () => { started = true; };
      const onEnded = () => finish('ended');
      const onError = () => finish('failed');

      finish = (how) => {
        finish = null;
        clearTimeout(timer);
        restore();
        playBtn.hidden = true;
        playBtn.removeEventListener('click', onPlay);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('error', onError);
        video.pause();
        // Dropping the source stops any download still running.
        video.removeAttribute('src');
        video.load();
        root.hidden = true;
        resolve(how);
      };

      video.addEventListener('playing', onPlaying);
      video.addEventListener('ended', onEnded);
      video.addEventListener('error', onError);
      video.muted = false;
      soundBtn.hidden = true;
      playBtn.hidden = true;
      playBtn.addEventListener('click', onPlay);
      video.poster = poster;
      video.src = src;
      root.hidden = false;
      root.querySelector('#teaser-skip').focus();

      // Called in the same click task: Safari and Chrome allow sound only then.
      video.play().catch((err) => {
        if (!finish || offered) return;
        if (err?.name !== 'NotAllowedError') return finish('failed');
        video.muted = true;
        soundBtn.hidden = false;
        video.play().catch(() => { if (auto) offerPlay(); else finish?.('failed'); });
      });
    });
  }

  return {
    play,
    get isOpen() { return Boolean(finish); },
  };
}
