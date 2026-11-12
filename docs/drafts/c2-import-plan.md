# C2 plan: carry player progress to the new domain

Problem: every record lives in localStorage under `ends:` on bjepp77.github.io. A new domain is a new origin, so it starts empty. Export exists (`store.exportAll`, Account panel, `menu.js:367`). Import does not. `keys.imported` (`rules.js:305`) was reserved for this and is unused.

## Why a link, not an iframe

A hidden iframe of the old site, read through postMessage, does not work. Safari and Chrome partition third-party storage, so the iframe sees an empty store. A top-level visit to the old site, carrying the data to the new site in the URL fragment, is the reliable path. The fragment (`#...`) is never sent to any server, so the data stays on the device.

## Part A: import on the new site (ship first)

1. `store.importAll(dump, mode)`: shares one validator with the file path:
   - `game === 'Ends of the Earth'`, `records` is an object, every key starts with `ends:`, every value is plain JSON. Refuse anything else.
   - Merge, never blind overwrite. Runs and logs, per date: keep the one that is done, else the one with more rounds. Passport: union, keep the earliest `day`. Stamps: union. Settings, owner, tour, thanks: keep local.
   - Write `keys.imported` = `{ at, from, records }`. Re-importing the same dump changes nothing.
   - Refuse while a round's clock is running (reuse `roundOpen`).
2. Two entry points, one function:
   - Account panel: "LOAD SAVED DATA", a file input (`accept=".json"`), beside DOWNLOAD YOUR DATA.
   - Boot: `#import=v1.<data>`, where data is deflate-raw (CompressionStream) then base64url. Show a confirm card ("Bring in 23 days and 41 stamps from the old site?"). Clear the hash with `history.replaceState` before anything else runs, so it never lands in history or a share.

## Part B: handoff on the old site (ship second)

1. On load, if `ends:` records exist and `ends:moved` is not set: build the export, encode it, set `ends:moved`, and go to `https://<new>/#import=v1.<data>`. The new site still asks before writing.
2. If `ends:moved` is set, or there is no data: plain redirect to the new domain. The `s/*.html` share pages redirect too.
3. Never delete old data. It is the fallback.
4. If the encoded data is over 64 KB, show a "Download, then load it on the new site" card instead. My rough estimate for a full 78-day season is about 20 KB once compressed.

## Part C: retire

Keep Part B live for at least 90 days. After that the old site becomes a stub that still runs Part B, so a player who comes back late is still carried over.

## Known gaps

- iOS home-screen installs keep their own storage. The handoff opens in Safari, so the data lands in Safari, not in the installed icon. Tell those players to re-add the icon from the new site after the move.
- Private browsing and cleared storage: nothing to move.
- The iOS app (step 3) has its own storage too. It can reuse Part A through a file or a universal link.

## Tests (fail before, pass after)

Export then import round-trips equal. Merge cases: done beats partial, earliest passport day wins. Foreign keys and a wrong `game` are refused. Re-import is a no-op. The hash is gone after boot. GoatCounter gets the path only, never the fragment.

## Dependency

Both parts change JS modules, which are built and stamped with `?v=` in the private repo. Hand edits to this built repo would need every `?v=` restamped. The private repo is the right place to make this change.

Order: A on the new domain, then B on github.io, then point DNS and announce.
