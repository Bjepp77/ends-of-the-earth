// Teaser (owner, 2026-11-16): a short upright video plays before the tour's practice prompt.
// The <video> is built on the first play() and never on page load, so nobody who skips the tour
// downloads it. play() must be called inside the click that opens the tour: that click is what
// lets the browser play sound. If the browser refuses sound, the video plays muted with a
// TAP FOR SOUND button. SKIP, Escape, the end of the video, an error, or no playback within
// START_MS all close it; the tour never waits on the video.

const START_MS = 3000;

export function createTeaser({ src, startMs = START_MS }) {
  let root = null;
  let video = null;
  let soundBtn = null;
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
      <button type="button" class="teaser-btn" id="teaser-skip">SKIP</button>`;
    document.body.appendChild(root);
    video = root.querySelector('video');
    soundBtn = root.querySelector('#teaser-sound');
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
  function play() {
    if (finish) return Promise.resolve('skipped'); // already showing
    if (!root) build();
    return new Promise((resolve) => {
      let started = false;
      const timer = setTimeout(() => { if (!started) finish('failed'); }, startMs);
      const onPlaying = () => { started = true; };
      const onEnded = () => finish('ended');
      const onError = () => finish('failed');

      finish = (how) => {
        finish = null;
        clearTimeout(timer);
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
      video.src = src;
      root.hidden = false;
      root.querySelector('#teaser-skip').focus();

      // Called in the same click task: Safari and Chrome allow sound only then.
      video.play().catch((err) => {
        if (!finish || err?.name !== 'NotAllowedError') return finish?.('failed');
        video.muted = true;
        soundBtn.hidden = false;
        video.play().catch(() => finish?.('failed'));
      });
    });
  }

  return {
    play,
    get isOpen() { return Boolean(finish); },
  };
}
