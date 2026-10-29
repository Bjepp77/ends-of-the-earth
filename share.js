// §7 share button. The text itself comes from rules.js shareText (2 lines plus a link to a premade share card, D2; the text goes only to the clipboard or share sheet, and the click handler in app.js counts one anonymous share event).
// Coarse pointer with a share sheet: native share, text only. Otherwise copy to the clipboard,
// falling back to a hidden textarea and execCommand. The label reads COPIED for 1.6 s.

export const COPIED_MS = 1600;

// Pure: which path a device takes.
export function shareMode({ coarse, canShare }) {
  return coarse && canShare ? 'sheet' : 'copy';
}

function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

async function copy(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API refused (no focus, no permission): use the fallback.
  }
  return copyFallback(text);
}

const resetTimers = new WeakMap();

// label is what the button reads again after COPIED (the camp note button reuses this path).
export async function shareOrCopy(button, text, label = 'SHARE') {
  if (!text) return;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (shareMode({ coarse, canShare: typeof navigator.share === 'function' }) === 'sheet') {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // The player closed the sheet.
    }
  }
  const ok = await copy(text);
  button.textContent = ok ? 'COPIED' : 'COPY FAILED';
  clearTimeout(resetTimers.get(button));
  resetTimers.set(button, setTimeout(() => { button.textContent = label; }, COPIED_MS));
}
