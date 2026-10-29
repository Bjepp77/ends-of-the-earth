// localStorage records under S1's keys. Takes any Storage-like object so node tests can use a fake.
import { keys, OWNER_KEY, newOwner, defaultSettings, recordPrefix, rowsKm, stampKey, PREFIX } from './rules.js?v=931f9542fd';

export function createStore(storage, slot) {
  const get = (key) => {
    try {
      const raw = storage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  };
  // Returns false when the write failed.
  const set = (key, value) => {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // Storage full or blocked: play goes on, nothing is kept.
      return false;
    }
  };

  const ownKeys = () => {
    const out = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX)) out.push(k);
    }
    return out;
  };

  return {
    ensureOwner(generation) {
      if (!get(OWNER_KEY)) set(OWNER_KEY, newOwner(slot, generation));
    },
    tourSeen: () => get(keys.tour(slot)) === true,
    markTourSeen: () => set(keys.tour(slot), true),
    // The thanks box shows once a day: the record holds the last date it showed.
    thanksShownOn: (date) => get(keys.thanks(slot)) === date,
    markThanksShown: (date) => set(keys.thanks(slot), date),
    settings: () => ({ ...defaultSettings(), ...(get(keys.settings(slot)) ?? {}) }),
    saveSettings(patch) {
      const next = { ...this.settings(), ...patch };
      set(keys.settings(slot), next);
      return next;
    },
    passport: () => get(keys.passport(slot)) ?? {},
    stamps: () => get(keys.stamps(slot)) ?? { version: 1, stamps: {} },
    souvenirsShown: () => get(keys.souvenirsShown(slot)) ?? [],
    markSouvenirsShown: (ids) => set(keys.souvenirsShown(slot), [...ids]),

    // { "<date>": [5 rows] } for every logged day.
    logsFull() {
      const prefix = `${recordPrefix(slot)}log:`;
      const out = {};
      for (const k of ownKeys()) {
        if (!k.startsWith(prefix)) continue;
        const rows = get(k);
        if (Array.isArray(rows)) out[k.slice(prefix.length)] = rows;
      }
      return out;
    },

    // Account: every record this game keeps on this device, as one object.
    exportAll(at) {
      const records = {};
      for (const k of ownKeys()) records[k] = get(k);
      return { game: 'Ends of the Earth', exportedAt: at, savedOn: 'this device only', records };
    },

    // Account: remove every record this game keeps on this device.
    deleteAll() {
      for (const k of ownKeys()) {
        try { storage.removeItem(k); } catch { /* blocked storage: nothing to remove */ }
      }
    },
    run: (date) => get(keys.run(slot, date)),
    // Every stored run, as [date, run] pairs.
    runs() {
      const prefix = keys.run(slot, '');
      return ownKeys().filter((k) => k.startsWith(prefix)).map((k) => [k.slice(prefix.length), get(k)]);
    },
    saveRun: (date, run) => set(keys.run(slot, date), run),
    log: (date) => get(keys.log(slot, date)),
    saveLog: (date, rows) => set(keys.log(slot, date), rows),
    // F2 drops a log whose finished run could not be saved, so the two never disagree.
    removeLog(date) {
      try { storage.removeItem(keys.log(slot, date)); } catch { /* blocked storage: nothing to remove */ }
    },

    // { "<date>": { km, late } } for rules.stats.
    logs() {
      const prefix = `${recordPrefix(slot)}log:`;
      const out = {};
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k?.startsWith(prefix)) continue;
        const rows = get(k);
        if (!Array.isArray(rows)) continue;
        out[k.slice(prefix.length)] = { km: rowsKm(rows), late: rows.some((r) => r.l) };
      }
      return out;
    },

    // §20 passport and stamps. Returns true when the country is new to the passport.
    // day is the expedition date; on is the date it was played, stored only when it differs.
    stamp(code, tierId, day, promptId, on = day) {
      const passport = get(keys.passport(slot)) ?? {};
      const isNew = !passport[code];
      if (isNew) {
        passport[code] = on === day ? { day, tier: tierId } : { day, on, tier: tierId };
        set(keys.passport(slot), passport);
      }
      const stamps = get(keys.stamps(slot)) ?? { version: 1, stamps: {} };
      const sk = stampKey(code, tierId);
      if (!stamps.stamps[sk]) {
        stamps.stamps[sk] = { code, day, tier: tierId, promptId };
        set(keys.stamps(slot), stamps);
      }
      return isNew;
    },
  };
}
