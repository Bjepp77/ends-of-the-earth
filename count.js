// Anonymous player count (owner, 2026-10-28): GoatCounter, by image request, so no third-party
// script runs here. Sent: the page path, an event name and the referrer's origin only (no path, no query). No cookies, no ids,
// nothing stored on the device. Off when config.goatcounter is empty and under ?debug.
export function createCounter(code, on) {
  if (!on || !/^[a-z0-9-]+$/.test(code ?? '')) return () => {};
  return (path, event = false) => {
    const q = new URLSearchParams({ p: path, rnd: Math.random().toString(36).slice(2) });
    if (event) q.set('e', 'true');
    else if (document.referrer && !document.referrer.startsWith(location.origin)) {
      try { const o = new URL(document.referrer).origin; if (o !== 'null') q.set('r', o); } catch { /* a malformed referrer is dropped */ }
    }
    new Image().src = `https://${code}.goatcounter.com/count?${q}`;
  };
}
