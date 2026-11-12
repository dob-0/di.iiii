# Task for the Claude on PONYO: run the Platina show here (2026-11-12, from studio-mac chat)

Owner ask: the Platina show (VJ deck + lights + phone camera) lags on studio-mac; run it on PONYO (RTX 5060) for clients.
aylmo (the show's source) is off. Studio-mac keeps playing until PONYO plays. Each step: say what you ran and what it printed.

## What runs on studio-mac now (the version to match)
- Code: branch `feat/autofly-switch`, commit 459eabb7 (= `integrate/platina-show` 7beb96d2 + Auto fly is a per-project switch, off in Platina).
- Stack: `di-dev up platina-show --api scratch --prod` (vite build + preview = the fast build; the dev server lags).
- Pages: `/platina-show/raw/projects/platina-show` (Nodes), `/platina-show/perform/platina-show?preset=vj-windows` (VJ deck),
  `/light/` (Light desk), `/platina-show/p/platina-show` (stage only, for clients).
- Light: the desk was empty ("This cue's look is not on Light yet"). Fix = open `/platina-show/cards/platina-show` and press
  **send looks to the desk** → it read "37/37 there", "37 looks on the desk, over 54 patched fixtures".
- Data: scratch copy, 1 project `platina-show` (129 objects, 52 lamps, 36 cues, 37 looks). The deck's 16 clips have no media files.

## Steps on PONYO
1. Find the Platina copy that is already here (your memory "Platina concert": `~/dev/di.iiii-platina`, stack :4460/:5460).
   Continue it, never make a second one. Note its branch, commit and how it is started (the before-state, for undo).
2. `git fetch origin feat/autofly-switch` and move that copy to 459eabb7 (keep the old commit name for undo). `npm ci` if needed.
3. Start it as a production build (`npx vite build` then preview, or the same di-dev/launcher with prod) on its existing ports
   and its existing data. If its data has no `platina-show` project, say so: the studio-mac data pack
   (platina-show-data-2026-11-12.tgz, 10014410 bytes) can come by USB stick.
4. Open the cards page, press **send looks to the desk**, check it reads N/N there.
5. Phone camera: the deck's camera clips ask for a camera labelled **Phone**. On Linux it is scrcpy into v4l2loopback
   (`scripts/show/phone-camera.sh`). On Windows find the established way (Windows 11 Phone Link "connected camera", or
   scrcpy + a virtual camera) and check how the deck matches the label (`src/project/tops/cameraPool.js`). Installs need Emily's yes.
6. Measure: frames per second on the VJ deck and the stage page, before (old copy) and after. Report the numbers.
7. Report to the owner: the address to open for clients, what works, what does not, undo (back to the old commit).

## Visuals (owner: "move all visuals")
- All visuals = the whole `platina` space with its clip media: file `platina.diiii`, 884044401 bytes (studio-mac
  `~/di-backups/carry/platina.diiii`, made on aylmo 2026-11-12 12:58). Its import on studio-mac (deck-round-5 stack) holds
  54 fixtures, 37 looks, 9 cues.
- It reaches PONYO by USB stick (dev answered 503 at 20:4x; PONYO is not a Taildrop target). On PONYO import it into the
  di that runs the show (`di open <file> --dry-run` first: it imports, see the di docs), then point the deck's clips at it.
