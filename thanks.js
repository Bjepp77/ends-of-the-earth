// Thanks for playing (owner, 2026-10-28): once a day, when the player reaches camp after five
// prompts, a box pops out over a grayed backdrop with the Winter Quarters cabin (same picture every day). The close
// button, Escape or a backdrop click puts it away, and focus goes back where it was.

export function createThanks({ onClose } = {}) {
  let back = null;

  const root = document.createElement('div');
  root.className = 'thanks';
  root.id = 'thanks';
  root.hidden = true;
  root.innerHTML = `
    <div class="thanks-shade"></div>
    <div class="thanks-box card" role="dialog" aria-modal="true" aria-labelledby="thanks-title" aria-describedby="thanks-body" tabindex="-1">
      <img class="thanks-badge" id="thanks-badge" alt="Log cabins in snowy pines at Winter Quarters" width="104" height="104"
        src="img/thanks-cabin-104.webp" srcset="img/thanks-cabin-104.webp 1x, img/thanks-cabin-208.webp 2x, img/thanks-cabin-312.webp 3x">
      <p class="thanks-title" id="thanks-title">Thanks for playing!</p>
      <p class="thanks-body" id="thanks-body">Tap the answers below to learn more about your guesses, or save this app to your home screen to play again tomorrow.</p>
      <button type="button" class="cta thanks-btn" id="thanks-close">CLOSE</button>
    </div>`;
  document.body.appendChild(root);
  const box = root.querySelector('.thanks-box');
  const btn = root.querySelector('#thanks-close');

  function close() {
    if (root.hidden) return;
    root.hidden = true;
    (back?.isConnected && back.getClientRects().length ? back : document.getElementById('share'))?.focus({ preventScroll: true });
    back = null;
    onClose?.();
  }

  root.querySelector('.thanks-shade').addEventListener('click', close);
  btn.addEventListener('click', close);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    // One control in the box: Tab stays on it.
    else if (e.key === 'Tab') { e.preventDefault(); btn.focus(); }
  });

  return {
    get isOpen() { return !root.hidden; },
    open() {
      back = document.activeElement;
      root.hidden = false;
      box.focus({ preventScroll: true });
    },
    close,
  };
}
