## 2026-09-03 — four rules, each one paid for tonight

The owner, after a page opened as a broken link in front of him: *"write rules to
no mistake everytime."* Four went into `docs/ai/golden_rules.md`, each from a
mistake made in this session rather than a good idea about mistakes:

- **A 200 from this site is not proof a page is public.** A link audit across
  three tiers reported 47 of 47 spaces open to strangers, including five the API
  correctly refuses with 401. The client is a single-page app — the server hands
  back the same `index.html` for every path, so the page always answers 200 and
  the sign-in wall appears only after the client boots. Probe the API.
- **A blank screenshot right after a merge is a deploy, not a defect.** Staging
  came back fully white seconds after four PRs landed; health reported 58 seconds
  of uptime. Check uptime before filing a regression.
- **Measure the scene's own units before placing anything in it.** The image
  plane's height was guessed twice (as `2·(h/w)·scale`, then `2·scale`) before
  anyone read `ImageObject` and found `[aspect*3, 3]`. Each guess cost a full
  apply-and-look round. A box's position is its base, not its centre.
- **A driven browser cannot take pointer lock.** Six scripted turns to photograph
  a door produced six identical empty frames, indistinguishable from "the door
  does not render". Drag-look reads clientX/clientY and works.

A fifth rule went to the owner's own machine notes rather than here, because it
is about this desktop and not this repo: the flatpak Chromium has a private
`/tmp`, so a `file:///tmp/...` page handed to it fails with ERR_FILE_NOT_FOUND —
serve it on localhost instead.
