## 2026-09-23 — The light show travels with its space and inside the .diiii file

- Wave 4 items 2 and 3 of `di-atlas/decisions/2026-09-23-connect-everything.md` (decisions 2 and 3:
  one show per space, carried in its `.diiii`). The owner's sentence: "what we need can easy work
  offline and then share the project from one device to other".
- **The show is keyed by space.** A space's show lives at `<spacesDir>/<id>/lighting/show.json`,
  beside its scene, so it goes where the space goes and is deleted with it. This machine's own show
  stays at `<dataDir>/lighting/show.json`. The desk runs one show at a time, the way a console loads
  one show file (grandMA3 Load Show, Eos File → Open): `serverXR/src/lighting/desk.js` swaps state,
  engine target and the fixture-type registry in place (`switchShow`), and `desk.json` brings a
  restart back to the loaded show.
- **How a page says which show.** `/light/?space=<id>` (what the bar and Projection already send)
  redirects to `/light/space/<id>/?…` (`routes/lightingRoutes.js`), so every relative `api/*` call
  the page makes names its show by plain URL resolution: all five tabs, reloads and bookmarks keep it,
  with no call site changed. This replaces the sessionStorage carry the brief suggested for the show
  key: the address itself is the carry, and it cannot leak into a bare `/light/` in the same tab.
  `from.js` (the way back) is unchanged. A `space/<id>/` request while another show is loaded answers
  `409 other-show` and writes nothing. The first open of a space's page loads its show (once per tab
  per 15 s, never while output is on) and reloads from the top.
- **Chosen differently from the brief, on purpose:** a bare `/light/` is "the desk as it is" and
  runs whatever show is loaded, not always the machine's. The phone's QR (42-byte cap) can only
  carry the bare address, and a phone remote must drive the show that is running, not swap the
  laptop's show out from under it. The machine's own show is one press away on the bare desk
  (**Load this machine's own show**), offered only while output is off. If the owner wants bare
  `/light/` to always mean the machine's show, that is `show.js`'s `note` plus one auto-open.
- **The rig stays with the machine.** `output` is never written into a space's show, never carried
  in a file and never changed by a load; a change under OUTPUT while a space's show is loaded goes
  into the machine's file (read fresh, rewritten whole). Output stays OFF by default as before; with
  output ON a load is refused unless the operator presses the button (`live: true`).
- **The file carries it.** `scripts/space-bundle.mjs` stages the newest complete copy (the desk's own
  read order) as `space/lighting/show.json` without `output`, names it in `bundle.json`
  (`lightShow: {fixtures, scenes, looks}`) and in its log line; import writes it the desk's way
  (tmp, `show.prev.json` kept, rename). A file with a show is bundle version 2 so an older di.iiii
  refuses it by name; without one it stays version 1. `--force` with a file that carries no show keeps
  the space's own show (as it keeps projects); `--prune` removes it with the directory. `di save`,
  `di open`, Save to file / Open a file and every space inside `di backup` carry it with no CLI change.
- **Migration: one copy, never a move.** A space whose show was never saved, on a machine whose own
  show has something in it, gets one sentence and one button, *Use this machine's show for <space>*
  (`POST api/show/copy-machine`). The page then says "Copied. <space> has its own show now; this
  machine's show is unchanged."
- **Undo the copy:** `rm -r ~/.di/data/spaces/<id>/lighting` (a dev stack: `<DATA_ROOT>/spaces/<id>/lighting`),
  while the desk runs another show or di.iiii is stopped — a desk still running that show would write
  it back at its next save. Opened again, the space is empty and the offer returns (tested).
- **Seen, on two throwaway stacks** (serverXR alone on 127.0.0.1:4370 and :4371, fresh data roots,
  `DI_LOCAL=1`, `ARTNET_OFFLINE=1`), Playwright at 1440×900 DPR 2 and 390×844 DPR 3, 14 screenshots
  read one by one (kept untracked in `.verify/`). On A: the machine show got 3 fixtures; `showtest`
  opened empty with the offer (phone and desktop); 2 fixtures patched and scene "Warm wash" saved
  without taking the offer; all five tabs kept `/light/space/showtest/`; the file on disk had
  2 fixtures, 1 scene, no `output`; the machine show's sha256 (fe1b478dcb2c7391…) was the same before
  and after the space work and after the copy into `copytest` (3 fixtures copied). Export: 1,479
  bytes, version 2, `lightShow {2, 1, 0}`. On B: bare `/light/` showed 0 fixtures before; after import
  `/light/?space=showtest` showed `1.rgb@1.1`, `2.rgb@1.4` and "Warm wash" on Setup, Control and the
  phone's Touch page; the bare desk then said "This desk is running showtest's show." and its button
  brought back the machine's show, 0 fixtures; B's machine show file was never written (absent
  before and after). With output ON a space page did not swap the show, said the lights would change,
  and loaded it on the press.
- **Found by looking, fixed:** on the phone the reload after the automatic load restored a 30 px
  scroll and hid the sentence under the sticky bar. The note is now the bar's own last row, and a
  show-change reload starts at the top.
- **Tests:** desk HTTP suite +11 checks (keyed load/save, no leaks between shows' fixture types, rig
  stays machine's, live refusal, unknown space, keyed write refused, the copy byte-for-byte, the undo,
  restart, `desk.state` read through), unit suite +5 (the sentences), `lightingRoutes.test.js` (the
  redirect, a space's file beside the space), `space-bundle.test.js` +7 (round trip, broken show.json
  falls back, version 1 without a show, `--force` keeps prev, keeps own show, broken show opens
  nothing, newer file refused). Seen failing against a deliberately broken build: 3 desk checks (the
  rig written into a space's file, the machine's output file, the copy turned into a move) and 4
  bundle tests (an export that drops the show); the rest were not broken on purpose.
- **Owed, not in this unit:**
  - Studio's `.zip` import refusing its own export (`src/project/import/importLegacyScene.js:121-128`,
    `src/project/transfer/studioProjectBundle.js`) — Wave 4 item 3's other half, a separate unit.
  - Not seen on the owner's surface: local.thedi.studio runs the installed package; after this lands
    it needs the pack + `di update --from` step (Wave 1 item 0), then Light from lab on his screen.
  - A cue fires on the loaded show; a cue of space A while B's show is loaded finds no such look
    (the named resolver, `LIGHTING_SHOW_PORTABILITY.md` "Still owed" 3).
  - Fixture index as identity, and rebinding a travelling show to a venue's patch (owed 1 and 2).
  - Tier sync (`space-sync`) does not carry the show; hosted tiers run no desk.
  - Seen and left: a space page's first load logs up to 12 `409` lines in the console before its
    automatic load and reload; on a phone the running show is named only when the note has something
    to say — the title that names it is hidden under 1100 px, as before.
  - `di save`'s one-line summary does not yet say "with its light show" (`--verbose` shows the
    tool's line); `di status`/`di where` unchanged.
- The main checkout's `serverXR/.env.local` was not linked into this worktree: it pins `PORT=4000`
  and the real local tier's `DATA_ROOT`, which the contract suites and a dev stack would both use.
