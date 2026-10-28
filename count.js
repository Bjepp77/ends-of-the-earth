// Anonymous player count (owner, 2026-10-28): GoatCounter, by image request, so no third-party
// script runs here. Sent: the page path, an event name and the referrer. No cookies, no ids,
// nothing stored on the device. Off when config.goatcounter is empty and under ?debug.
export function createCounter(code, on) {
  if (!on || !/^[a-z0-9-]+$/.test(code ?? '')) return () => {};
  return (path, event = false) => {
    const q = new URLSearchParams({ p: path, rnd: Math.random().toString(36).slice(2) });
    if (event) q.set('e', 'true');
    else if (document.referrer && !document.referrer.startsWith(location.origin)) q.set('r', document.referrer);
    new Image().src = `https://${code}.goatcounter.com/count?${q}`;
  };
}
