// §7 share button. The text itself comes from rules.js shareText (2 lines plus a link to a premade share card, D2; the text goes only to the clipboard or share sheet, and the click handler in app.js counts one anonymous share event).
// Coarse pointer with a share sheet: native share with the card image when the device accepts files, else text only. Otherwise copy to the clipboard,
// falling back to a hidden textarea and execCommand. The label reads COPIED for 1.6 s.

export const COPIED_MS = 1600;

// Pure: which path a device takes.
export function shareMode({ coarse, canShare }) {
  return coarse && canShare ? 'sheet' : 'copy';
}

// Pure: what the share sheet gets. canShareFiles is the answer of navigator.canShare({files}) for the
// fetched card; a missing card or a refusal falls back to text only.
export function sharePayload({ text, file, canShareFiles }) {
  return file && canShareFiles ? { text, files: [file] } : { text };
}

// Fetches the card image as a File, or null when there is no card or it will not load.
// Memoised per url, so camp can warm it and the tap does not wait on the network (share sheets want a fresh tap).
const cards = new Map();
export function preloadCard(url) {
  if (!url) return Promise.resolve(null);
  if (!cards.has(url)) cards.set(url, fetchCard(url));
  return cards.get(url);
}

async function fetchCard(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], 'ends-of-the-earth.png', { type: 'image/png' });
  } catch {
    return null;
  }
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
export async function shareOrCopy(button, text, label = 'SHARE', cardUrl = '') {
  if (!text) return;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (shareMode({ coarse, canShare: typeof navigator.share === 'function' }) === 'sheet') {
    try {
      const file = await preloadCard(cardUrl);
      const canShareFiles = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      await navigator.share(sharePayload({ text, file, canShareFiles }));
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
