// §23 sound. Our own Web Audio synth: short oscillator tones and noise bursts. One recorded file,
// the lost sheep's bleat (sheep.js), loads after the unlock and plays through the same switch.
// Audio unlocks on the first pointer or key event and suspends while the tab is hidden.
// Every play call is a no-op while sound is off or before the unlock.

export function createSound({ enabled = true } = {}) {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let on = enabled;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loadBaa();
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  }
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  const ready = () => on && ctx && ctx.state === 'running';

  // The bleat: "Sheep bleating" by earthcalling, public domain, Wikimedia Commons, cut to 1 s.
  // Callback decodeAudioData for older Safari. A failed load leaves it silent.
  let baaBuf = null;
  function loadBaa() {
    fetch('audio/lost-sheep-baa.m4a')
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => new Promise((done, fail) => ctx.decodeAudioData(b, done, fail)))
      .then((buf) => { baaBuf = buf; })
      .catch(() => {});
  }

  // One tone: type, start and end frequency, length, peak gain, delay, optional low-pass.
  function tone({ type = 'sine', f = 440, to = null, len = 0.08, gain = 0.3, at = 0, lp = null }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    let tail = o;
    if (lp) {
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      o.connect(filt);
      tail = filt;
    }
    tail.connect(g).connect(master);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  function noise({ len = 0.05, gain = 0.2, at = 0, lp = 2400 }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filt).connect(g).connect(master);
    src.start(t);
    src.stop(t + len + 0.02);
  }

  // Rising notes for the closing chord, by how far the pin carried you (0 = miss).
  const CHORDS = {
    0: [196, 233],
    40: [262, 330, 392], 55: [294, 370, 440], 70: [330, 415, 494],
    85: [349, 440, 523], 100: [392, 494, 587, 784],
  };

  const sounds = {
    // A new prompt opens: a soft wagon rumble, then three rising tones.
    roundStart() {
      noise({ len: 0.25, gain: 0.12, lp: 600 });
      [392, 494, 587].forEach((f, i) => tone({ type: 'triangle', f, len: 0.12, gain: 0.18, at: 0.08 + i * 0.07 }));
    },
    // One letter of the prompt typing in.
    type() {
      tone({ type: 'triangle', f: 1200 + Math.random() * 300, len: 0.025, gain: 0.04 });
    },
    // Placing or moving the pin: one click and two short sine tones.
    pin() {
      noise({ len: 0.03, gain: 0.25, lp: 3500 });
      tone({ f: 660, len: 0.06, gain: 0.18, at: 0.02 });
      tone({ f: 990, len: 0.07, gain: 0.14, at: 0.07 });
    },
    // A refused drop: one low buzz.
    refuse() {
      tone({ type: 'triangle', f: 160, to: 120, len: 0.16, gain: 0.2, lp: 900 });
    },
    // Drop and reveal: a ticking count-up, then a chord. km is the round's base km.
    reveal(km) {
      const ticks = km ? 8 : 3;
      for (let i = 0; i < ticks; i++) {
        const at = i * 0.06;
        if (i % 2) tone({ type: 'triangle', f: 700 + i * 60, len: 0.03, gain: 0.08, at });
        else noise({ len: 0.025, gain: 0.12, at, lp: 3000 });
      }
      const notes = CHORDS[km] ?? CHORDS[0];
      const at = ticks * 0.06 + 0.04;
      notes.forEach((f) => tone({ type: km ? 'sine' : 'triangle', f, len: km ? 0.6 : 0.4, gain: 0.12, at, lp: km ? null : 1200 }));
    },
    // Camp: a short fanfare.
    camp() {
      [262, 330, 392, 523].forEach((f, i) => tone({ type: 'triangle', f, len: 0.2, gain: 0.15, at: i * 0.1 }));
    },
    // Named UI sounds: a soft click for buttons like share.
    click() {
      tone({ f: 880, len: 0.04, gain: 0.1 });
    },
  };

  const api = {
    get on() { return on; },
    set(next) { on = !!next; },
    // Returns a stop function when the bleat started (so the lamb's mouth can follow it), else null.
    baa() {
      if (!ready() || !baaBuf) return null;
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = baaBuf;
      g.gain.value = 0.6;
      src.connect(g).connect(master);
      src.start();
      return () => src.stop();
    },
  };
  for (const [name, fn] of Object.entries(sounds)) {
    api[name] = (...args) => { if (ready()) fn(...args); };
  }
  return api;
}
