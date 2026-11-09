# eote-2a: import on the new site (C2 Part A), implementation design

Status: design only. No code has been written or run. The test file next to this doc
(`import.test.js`) is the acceptance oracle. Copy it to `tests/import.test.js` in the source
folder and make it pass. Base: public repo 3a88bedd. The patch does not touch rules.js or
share.js, so it ports to the private source as is.

Approved by the PA 2026-11-09: local settings and the tour flag win when they exist, and imported
values fill a fresh device. Unknown keys and the souvenirs-shown list are kept and merged.

## Files

| File | Change | Est. lines |
|---|---|---|
| `handoff.js` (new) | hash take, encode, decode, counts text | ~60 |
| `store.js` | `GAME_NAME`, `validateDump`, `planImport`, `importAll` | ~130 added |
| `menu.js` | Account panel: LOAD SAVED DATA, confirm card | ~45 added |
| `app.js` | take hash first, `offerHandoff`, shared `reloadFromStore` | ~45 added |
| `tests/import.test.js` (new) | oracle, copied from this folder | ~230 |

No change to index.html, styles.css, rules.js or share.js. Existing classes `card confirm`, `seg`,
`menu-item`, `mi-label`, `mi-sub`, `fine` and `danger` cover the UI.

## handoff.js (new module)

```js
export const IMPORT_HASH_PREFIX = '#import=';
export const HANDOFF_VERSION = 'v1';
export class HandoffError extends Error {}

// Reads #import=<value> and clears it at once with replaceState (path and query kept).
// Any other hash (#play=...) is left alone and null is returned.
export function takeImportHash(loc, hist) -> string | null

// dump -> 'v1.' + base64url(deflate-raw(UTF-8 JSON)). Uses CompressionStream (browsers, node 18+).
export async function encodeHandoff(dump) -> string

// Inverse. Throws HandoffError on a wrong version, bad base64url, bad deflate or bad JSON.
export async function decodeHandoff(value) -> object

// "3 days and 1 stamp". Shared by the menu and the boot card, so the wording lives in one place.
export function countsText({ days, stamps }) -> string
```

base64url: standard base64 with `+`->`-`, `/`->`_`, padding removed. Decode re-adds padding.
`encodeHandoff` ships now only so the round-trip test can run. Part B will call it later.

## store.js

`export const GAME_NAME = 'Ends of the Earth';`, and `exportAll` uses it, so the name is decided in one place.

### validateDump(dump, slot) -> { ok: true } | { ok: false, reason }

- `not-ends`: dump is not an object, `dump.game !== GAME_NAME`, or `dump.records` is not a plain object.
- `foreign-key`: any record key does not start with `PREFIX` (`ends:`).
- `bad-value`: any value is not plain JSON. Plain JSON means null, boolean, finite number, string,
  array, or an object whose prototype is Object.prototype or null. Depth is capped at 20. An object
  key `__proto__`, `constructor` or `prototype` at any depth is also `bad-value`, because the
  passport and stamps merge copy keys by name.
- `bad-value`: shape checks on this slot's keys. `run:<d>` must be an object with a `rounds` array.
  `log:<d>` must be an array. `passport` must be an object. `stamps` must be an object with a
  `stamps` object. `souvenirs-shown` must be an array. `<d>` must pass `isValidDate` (imported from
  rules.js, unchanged).

### planImport(storage-read, records, slot) -> { writes, removes, days, stamps }

Pure, with no writes. Only `OWNER_KEY` and keys under `recordPrefix(slot)` are considered. Other
`ends:` keys (another slot) are skipped, not refused. The key suffix after the prefix picks the rule:

| Suffix | Rule |
|---|---|
| (owner key) | never imported |
| `imported`, `asked`, `corrected` | never imported (ours, or reserved) |
| `run:<d>` and `log:<d>` | decided together per date, see below |
| `bonus:<d>` | take incoming only if local is absent |
| `passport` | per country code: take incoming if local lacks it or incoming `day` < local `day` (string compare on YYYY-MM-DD); tie keeps local |
| `stamps` | per stamp key: same earliest-day rule; `version` keeps local, else incoming |
| `souvenirs-shown` | union: local order first, then new ids |
| `settings`, `tour`, `thanks` | take incoming only if local is absent |
| anything else | take incoming only if local is absent |

The date rule, for each date in the union of `run:` and `log:` dates:

```
takeIncoming(localRun, inRun):
  no inRun                      -> false
  no localRun                   -> true
  localRun.done                 -> false   (local finished: keep, even if incoming also finished)
  inRun.done                    -> true    (done beats partial)
  otherwise                     -> inRun.rounds.length > localRun.rounds.length (tie keeps local)
```

- When the incoming run is taken: write it with `v = max(local.v ?? 0, in.v ?? 0) + 1` when a local
  run existed (another open tab then sees a newer version and stops; see `runFresh` in app.js).
  Write the incoming log if there is one. Otherwise remove the local log, so a run and its log never
  disagree (the F2 invariant).
- When neither side has a run: take the incoming log only if the local log is absent.
- `days` counts the dates where anything incoming is written.
- `stamps` counts stamp keys that are new to this device. Earlier-day replacements are not counted.
- A value equal to local (deep JSON-string compare) is not a write. That is what makes re-import a no-op.

### importAll(dump, mode = 'preview', { at, from = 'file', roundOpen = false } = {})

Returns `{ ok: true, days, stamps, records }` or `{ ok: false, reason }`.

1. `validateDump`. On failure, return its reason. Nothing is written.
2. `planImport`.
3. `mode === 'preview'`: return the counts. Nothing is written, in any case.
4. `mode === 'write'`:
   - `roundOpen` true: `{ ok: false, reason: 'round-open' }`, nothing written.
   - Empty plan: `{ ok: true, days: 0, stamps: 0, records: 0 }`, nothing written (no `imported` record either).
   - Otherwise apply the removes, then the writes. Any `set` false: `{ ok: false, reason: 'storage' }`.
     A partial write is possible here, as with any localStorage write.
   - Then write `keys.imported(slot)` = `{ at, from, records }`, where records is the count of writes plus removes.

## menu.js: Account panel

Put this after DOWNLOAD YOUR DATA:

- A hidden `<input type="file" accept=".json,application/json">`.
- A `button.menu-item#load-data` with the label **LOAD SAVED DATA** and the sub-line **a file you downloaded**.
- `importBox`: a hidden `div.card.confirm` holding a `<p>` and a `.seg` with **YES, BRING IT IN** and **NOT NOW**.

Flow:
1. Click: if `blocked(button)` (the existing helper, BLOCKED_TEXT), stop. Otherwise open the file picker.
2. A file over 2 MB, unreadable, not JSON, or `ok: false` from preview: **That file is not saved Ends of the Earth data.**
3. Preview has 0 days and 0 stamps: **Nothing new in that file. Your data is unchanged.**
4. Otherwise show importBox: **Bring in {countsText} from this file?**
5. YES: `importAll(dump, 'write', { at: new Date().toISOString(), from: 'file', roundOpen: ctx.roundOpen() })`.
   - ok: **Brought in {countsText}.** Then `ctx.onImported()`.
   - `round-open`: BLOCKED_TEXT.
   - `storage`: **Could not save. This browser is out of space for the game.**
6. NOT NOW: hide the box. No message.

All messages go to the panel's existing `msg` (aria-live polite). Clear the file input value after
each pick, so the same file can be picked twice.

## app.js

1. The first statement after the imports and `const $`:
   `const handoff = takeImportHash(location, history);`
   It runs before `loadStartup`, before `count`, and before `target()` reads the hash.
2. Extract the body of `onDeleted` into `reloadFromStore()`, without `ensureOwner`. Then:
   `onDeleted: () => { store.ensureOwner(uuid()); reloadFromStore(); }` and `onImported: reloadFromStore`.
3. At the end: `goHome(); count(location.pathname);` stays. Replace the tour line with:
   `if (handoff) offerHandoff(handoff); else if (<existing tour condition>) startTour();`
   The tour waits so a returning player is not toured before their data arrives.
4. `async function offerHandoff(value)`:
   - Decode. A `HandoffError`, or `ok: false` from preview: home-msg **That link did not carry saved data.**
   - 0 and 0: home-msg **Nothing new to bring in from the old site.**
   - Otherwise insert a `div.card.confirm` into `#home` before `.actions`: **Bring in {countsText} from the old site?**,
     with **YES, BRING IT IN** and **NOT NOW**. Focus the YES button.
   - YES: write with `from: 'link'` and `roundOpen: roundOpen()`. ok: remove the card, call `reloadFromStore()`,
     then home-msg **Brought in {countsText}. Welcome back.** `round-open`: **Finish the open prompt first. Its clock is still running.**
     `storage`: the same storage line as the menu.
   - NOT NOW: remove the card. home-msg **Nothing was brought in. The old site still has your data.**

`count(location.pathname)` never sees a hash, and the hash is already gone by then.

## Player-facing strings (all new; no em dashes)

LOAD SAVED DATA · a file you downloaded · YES, BRING IT IN · NOT NOW ·
Bring in {n} days and {m} stamps from this file? · Bring in {n} days and {m} stamps from the old site? ·
Brought in {n} days and {m} stamps. · Brought in {n} days and {m} stamps. Welcome back. ·
Nothing new in that file. Your data is unchanged. · Nothing new to bring in from the old site. ·
That file is not saved Ends of the Earth data. · That link did not carry saved data. ·
Nothing was brought in. The old site still has your data. · Could not save. This browser is out of space for the game.

`countsText`: "1 day", "2 days", "0 days"; "1 stamp", "2 stamps". When days is 0 and stamps > 0:
"{m} stamps" alone. When stamps is 0 and days > 0: "{n} days" alone.

## Manual checks after the tests pass (rung 4)

1. Serve locally. Account, DOWNLOAD YOUR DATA. Delete your data. LOAD SAVED DATA with that file: the counts match, the past-week calendar returns.
2. Load the same file again: "Nothing new in that file."
3. Open `/#import=<encodeHandoff(dump)>`: the URL bar loses the hash at once, the card shows, YES restores the data. A reload shows no card.
4. Start a daily prompt, open the menu, LOAD SAVED DATA: the blocked note shows.

## Not verified

The test file has not been run: this project's guard blocks code execution for me. One thing to
confirm on the first run: node must resolve store.js's `./rules.js?v=...` import (node ESM accepts a
query string on a file URL). If it does not, run with a loader, or test the source folder, which has no stamps.
