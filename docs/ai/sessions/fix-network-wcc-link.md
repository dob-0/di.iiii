## 2026-09-28 — the network rooms link the WCC exhibition by its public address

Found while comparing local with dev one project at a time: six CVs differed by exactly one link, and neither
copy was right — dev said `di-studio.xyz/wcc` (the old name, as the repo did) and local `local.thedi.studio/wcc`
(opens on one machine only). `people.json` now says `https://diiii.xyz/wcc`; `build.mjs` rewrites only those six
rooms. New guard in `network-pages.test.js`, red on the old data. After merge the space's sync publishes the six
rooms to each tier (prod on the owner's word).
