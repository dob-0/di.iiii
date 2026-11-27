# scripts/show: the show tools, read from a venue profile

`di show go | checkpoint | profile | mark`. Built 2026-11-01 (slice S13 of the show-day fix plan, gaps G07, G10, G12, G27)
after a night whose GO was asked for after doors and could say GO with the laser not connected.
Words: a **place** is the real room (vocabulary.md); the **venue profile** binds one **production**'s run to a place's
machine and devices. "venue" is the plan's word and is not yet in `docs/ai/vocabulary.md` (a row for the owner).

## Commands

| command | does | exit |
|---|---|---|
| `di show go --venue <id>` | one look → refuses a machine marked for another venue → checkpoint → soak (default 60 s) → GO / NO-GO | 0 GO · 1 NO-GO · 2 refused |
| `di show go --venue <id> --look` | one quick read, the same lines; never says GO | 3 |
| `di show checkpoint --venue <id> "<why>"` | snapshot before any show change (folder + RESTORE.md + manifest.json) | 0 whole · 3 partial · 1 failed · 2 refused |
| `di show count [--venue <id> \| --host <h> \| --local]` | read-only count of what the project documents and the desk files hold (lamps, looks, cues, laser; what names a project; sizes); no value, no id unless `--ids`; `--json`; `--data-dir`, `--di-home`; another machine needs ssh, bash and node (di's own node is used when it is there); a flag it does not know is refused | 0 counted · 1 not all read · 2 refused |
| `di show profile --venue <id>` / `--list` | the resolved profile, with where each value came from | 0 |
| `di show mark <id>` | marks THIS machine as the venue's (`~/.config/di/venue`); undo: `rm` that file | 0 |

Run GO at load-in, at doors minus 60 min, and after every change. It runs on the operator's machine and reads the show
machine over ssh (`host`), or on the show machine itself (`"host": "local"` or `--local`).

## The venue profile

One file per venue: `scripts/show/venues/<id>.json` (reviewed seeds), overridden by `~/.di/data/show/venues/<id>.json`
on a machine, or by `--venues-dir` / `DI_VENUES_DIR`. Each value resolves **flag > DI_* env > venue file > built-in
default** (twelve-factor config; Ansible inventories; Kustomize overlays: RESEARCH-left-behind G15). Built-in defaults
hold platform values only; `lib/lintDefaults.mjs` fails the tests when a production name, an address or an id from any
venue file, a tailnet address or a Telegram group id appears in this tree outside `venues/`.

| key | meaning | default |
|---|---|---|
| `venue`, `production`, `names` | ids and names (the lint learns them) | none: `--venue` or `DI_VENUE` is required |
| `confirmed` | `false`, or `{ "by", "at" }` once the owner confirmed the values; GO is NO-GO until then | `false` |
| `host`, `user`, `api` | the show machine (`"local"` = here), its ssh user, its di `serverXR` base as seen on it | none · ssh default · none |
| `diHome`, `backupsDir`, `packsDir`, `markerPath` | di's home there, checkpoint folders here, the packs folder there, the marker file there | `~/.di` · `~/di-backups` · none · `~/.config/di/venue` |
| `ports[]` | the USB port plan: `role`, `path` (sysfs, e.g. `1-2.4`), `vidpid`, `driver`, `speedMbps` | `[]` |
| `links[]` | `role`, `iface`: carrier held through the soak | `[]` |
| `posture` | the CPU posture to read back: `governor`, `noTurbo`, `acOnline`, `driver` (null = not asserted) | not asserted |
| `laser`, `light`, `midi`, `watch` | **must be stated**: an object (present), `false` (none here) or `null` (unknown, only while unconfirmed) | none: a missing block is refused |
| `thresholds` | `tempWarnC` 85, `tempNoGoC` 90, `soakS` 60, `soakIntervalS` 10, `soakSlopeMaxCPerMin` null, `kernelWindowS` 600, `kernelErrorsMax` 0, `watchFreshS` 15 | see left; all ours, unvalidated |
| `checkpoint` | `data` folders under `<diHome>/data`, live `states` routes | `laser lighting` · the three state routes |

Flags and env: `--host` `DI_SHOW_HOST` · `--local` · `--user` `DI_SHOW_USER` · `--api` `DI_SHOW_API` · `--di-home` ·
`--backups` `DI_SHOW_BACKUPS` · `--marker` `DI_VENUE_MARKER` · `--soak` `DI_SHOW_SOAK_S` · `--interval`
`DI_SHOW_SOAK_INTERVAL_S` · `--temp-nogo` `DI_SHOW_TEMP_NOGO_C` · `--session` `DI_SESSION`.

Seeds: `projector-room` (from the night of 31 Oct; its host and user stay out of this public repo: the operator's machine
keeps them in `~/.di/data/show/venues/projector-room.json` or passes `DI_SHOW_HOST`) and `cinema-house` (7 Nov; built
from di-atlas `venues/cinema-house-2026-11-07.md`, cited; every unknown is null). Both are `confirmed: false`.

## The GO lines (lib/goLines.mjs)

Grouped under the four phases ILDA asks a per-show checklist to cover (setup, alignment, testing, performance;
RESEARCH-show-safety 3). The phase of each line is our mapping. Each line is a failure-mode question answered by a
reading (the SRE launch checklist style). A reading that is missing is NO-GO with what is missing and who owes it.

- **setup:** profile confirmed · machine marker · release record + overlays (S10) · persistent journal · kernel log
  readable · posture read back in every read · each planned USB port at its path, driver, speed (sysfs) · each link up.
- **alignment** (laser present): a laser safety officer named · the safety block in `laser/api/state` (S12) and that it
  says yes · its zone, equal to the profile's when the profile states one · the stop path timed · stops per hour.
- **testing:** pages answer 200 · every cube connected in **every** read, armed, no stop · light output on and connected
  in every read · MIDI **heard** during this run (a node count is printed, never a pass) · the watch active (S11) and its
  samples fresh · no kernel USB errors on planned ports · links held through the soak · the soak ran its full time ·
  no throttling during it · the temperature slope (printed until a limit exists).
- **performance:** the bank stored (no unsaved changes) · temperature under the NO-GO line · the checkpoint's exit code.

## What GO reads from the slices built beside it (names are this slice's; each slice may rename in one line)

| from | read | until it exists |
|---|---|---|
| S10 release record | `<diHome>/current/release.json` (in-toto shape: `subject[0].digest.sha256`, `predicate.tests.line`, `predicate.review.verdict`) and `<diHome>/current/PATCHES` | NO-GO "owed: S10" |
| S11 watch | `watch.unit` active (`systemctl --user`), `watch.csv` age | NO-GO "owed: S11" |
| S12 laser safety | `safety` in `laser/api/state`: `ok`/`noGo`/`reason`, `zone`, `stopPathMs`, `stopsPerHour`, `worstHeadroom`, `guards` | NO-GO "owed: S12" |
| S14 MIDI heard, posture | `midi.statePath` + `midi.field` (default `midi.heardAt`, epoch ms on the show machine's clock); the posture unit's values | NO-GO "owed: S14" |

## Desk tools: mirrored moving-bar pairs, tilt flip, loading looks onto a live desk

Built 2026-11-26 on a show night; the tools had lived in a report folder and are now part of di. Why, the owner's words:
N7020 "the right side truss ones need to swaped they looks no stage they look to the wall" and N7024 "look and fix the
scenes i want that light work sync , now its bad becouse in scenes left line and right line is do the same movment and one
the every time looks to the wall". Camera record (2026-11-26 22:40 +04 (record time), dob-3f's controlled hold, all 18 bars at pan 128; tilt 156 put both sides inward, tilt 100
put both on their own walls; viewed by the lead dob-39): the right bars hang turned 180 degrees, DMX tilt above 32768 lands
INWARD on both sides. The first reading of that evening (both trusses hang the same way, mirror `(65536 - pan, 65536 - tilt)`)
was measured wrong for this hall.

| tool | does |
|---|---|
| `python3 scripts/show/mirror_sync.py <presets.json> <in.json> <out.json> [--only-prefix P] [--skip-prefix P] [--copy-suffix S] [--max-grow DEG] [--left L] [--right R] [--keep-cells] [--rule-unmeasured-ok]` | every left/right pair mirrors and faces the room in every step of every look |
| `python3 scripts/show/flip_truss_tilt.py <presets.json> <in.json> <out.json> [--sides L,R] [--left L] [--right R]` | tilt of the chosen sides mirrored about straight down (for a side whose tilt sign is wrong) |
| `node scripts/show/live_load.mjs <looks.json> <cues.json> [--base URL] [--replace-prefix P] [--apply] [--go] [--looks-only]` | adds a file's looks after the desk's own looks; dry run by default |

**The rule (mirror_sync) is data, read from the presets `constants`** (the convention of the show kit's `_m()` and
`cell_mirror()`, replicated in the tool): `MIRROR_MODE_PAN` / `MIRROR_MODE_TILT` override `MIRROR_MODE`; `'negate'` means the
partner's value is `65536 - lead` on that axis (m = +1 left, -1 right), anything else means equal. Into the room is
`m_tilt(side) * FACE_SIGN * sin(tilt) * cos(pan)`. `CELL_MIRROR_LR` (falls back to `CELL_MIRROR`, default true): the partner
shows the lead's cells `<c><i>` in reversed order (false: same index). No `FACE_SIGN` or no mode for an axis: exit 2, never a guess.
Presets values: the camera rule is `MIRROR_MODE_PAN negate, MIRROR_MODE_TILT same, FACE_SIGN 1, CELL_MIRROR_LR true`
(pan R = 65536 - pan L, tilt R = tilt L, R cells = L cells reversed). The OLD rule is `MIRROR_MODE negate, FACE_SIGN -1`;
with `--keep-cells` (and, for presets with no camera record, `--rule-unmeasured-ok`) the old tool's moves come back. The output names the rule it used.
A pair is `L<n>` and `R<n>` in the presets `.units` (`--left/--right` change the two prefixes;
only numbers present on both sides are pairs; each unit's `id` is its fixture id). A look whose pair-steps all mirror (within 2
on both axes, cells too) with no bar more than 5 deg into its own wall stays as it is. In any other look the lead bar keeps
its move, folded at exactly 0 (where it points into its own wall its tilt mirrors about the centre), its partner gets the
mirror. The lead is chosen per look by the least growth of step moves (per-step, left, or right). Only `pan`, `pan_fine`,
`tilt`, `tilt_fine` of the pair bars change (plus the cell channels unless `--keep-cells`), proved by walking every value; the
tool re-audits its output (cells counted uniform / reversed / same / other). The walk proof allows pan/tilt of the bars and
the cell channels of the PARTNER bar only (never the lead's), and only when cells are mirrored. **Designed two-sided looks.** A look with `twoSided: true` (call and answer: the two sides do different things on purpose) is
written to the output exactly as it came in, never mirrored, never counted as changed (the wall check still applies: a bar into its own wall exits 1 and names the look; with `--copy-suffix` it is not copied, and the line says "not copied"); one line names it
(`kept as designed (twoSided): <ids>`). Today nothing sets the flag: no builder or merge step writes it, so set it by hand in the suite file on each call-and-answer look before a run, until a build step sets it. The run proves it: a twoSided look that is not as it came in (or is copied) exits 1, named. The desk keeps
the field only from an install that carries this change (`sanitizeLook` in `serverXR/src/lighting/looks.js` writes it only when it is exactly `true`; older desks drop it). Re-recording an existing look id with the desk's capture rebuilds the look and drops `twoSided` (it drops `motion` and `heads` the same way; the UI never sends an id), so set the flag again in the suite file.
Exit 1 when: wrong argument count (usage), no pair in the presets, "no looks selected", another value changed,
a pair is not mirrored, a cell is not as the rule says, a bar points into a wall, a bar's largest step move grew more than
`--max-grow` (default 5 deg), or a `twoSided` look is not as it came in or got copied. Exit 2 (one line, nothing written) when the rule is incomplete or unmeasured, or a constant or measured value is a boolean or not valid.
**Provenance.** Each key the rule uses (`FACE_SIGN`, the pan key, the tilt key, and, unless `--keep-cells`, the cell key) needs
`measured.<KEY>` in the presets with the same value as `constants.<KEY>` (a boolean measured value for a number constant is refused) and a confidence other than `none`; otherwise exit 2
naming the key. The rule line prints each key's confidence and the first 60 characters of its method. `--rule-unmeasured-ok`
skips the check (other rigs, fixtures); the line then says "rule NOT measured". `FACE_SIGN` may be 1, -1, 1.0 or -1.0.
Undo: the input is never changed; the output is a new file.
`--copy-suffix S` writes copies (`id+S`, `name + S`) and leaves the originals.

**Loader.** Reads the desk (`--base`, default `http://diiii.localhost/light`), checks names and cue targets, writes nothing
without `--apply`. `--apply` first saves a desk snapshot and prints the one-line undo (`curl ... /api/snapshots/restore`);
a look id already on the desk with other content is refused (exit 2) unless it starts with `--replace-prefix`;
`--looks-only` leaves the cue list; `--go` sends one plain GO (an index would turn autoplay off). Exit 0 ok, 1 a desk call
failed, 2 refused before any write. Against a live desk, take `di show checkpoint` first and say the change.

**Tests:** `npx vitest run scripts/show/desk-tools.test.mjs` (synthetic fixtures; the loader runs on a throwaway offline desk).
**Undo:** the loader's printed snapshot line; the mirror tools write a new file and never edit their input.

## Not validated, stated

- The 60 s soak, the 10 s interval, 85/90 C, 600 s kernel window: our numbers, no source (RESEARCH-show-safety 3 found
  none for a soak). Replace the soak by "until the temperature slope is below x C/min or N minutes" once load-in data sets x and N.
- Never run against the real stage machine yet: the probe and the checkpoint ran here on aylmo against a temporary di home
  and a local HTTP server (`checkpoint.test.mjs`). GO must be seen once on the real machine, in daylight, by the owner.
- `journalctl -k` as the ssh user needs read access to the kernel log; when it is missing GO says so (NO-GO), it does not count zero.

## Undo

Remove the `show` line from `COMMANDS` in `scripts/di/cli.mjs` and the `show` entry in `scripts/di/ui.mjs`, then delete
`scripts/show/`. A marker is undone by `rm ~/.config/di/venue`. Checkpoint folders are kept on purpose (they are the way back).

## Check the light page on a scratch desk (light_page_check.mjs)

`node scripts/show/light_page_check.mjs --url URL --out DIR [--sizes 1536x864,844x390,1536x864,766x830] [--expect N | --show SHOW.json]`
pictures the light page's Touch minimap in headless Chromium with `--disable-gpu` and checks each size: every light inside the box
(0 cut), the rig fills at least 50 % of the box (the larger of its width share and its height share), the exact light count is shown, and a size that comes again gives the same rig within 2 px
(the PASS line says "the return check did not run" when no size repeats). A light is cut when any edge (left, right, top, bottom) passes the box. `--expect N` or the
fixture count of `--show` (a top-level `show` key is unwrapped) is the exact light count: more or fewer fails. Exit 0 all sizes pass, 1 one failed (named), 2 usage, a refused URL, or `LIGHT_PAGE_CHECK_NO_BROWSER=1` (the tests set it: the tool stops before it loads a browser).
**Refused URLs** (exit 2, one line each, before any network call): (a) host `diiii.localhost`, or any `*.diiii.localhost` that is not a `<name>-test.diiii.localhost` test copy; (b) `127.0.0.1`, `::1` or `localhost` with no explicit port, or port 80 or 443;
(c) a loopback host on the port the installed di serves (`PORT` in `$HOME/.di/run/server.env`, read, never printed; a missing file is fine); (d) any host that is not local.
Allowed: a loopback host on any other explicit port, and `<name>-test.diiii.localhost` copies. Pictures and `run.txt` go to `--out`.
Recipe (N7279.7), with `<job>` a worktree name `~/work/di.iiii-<job>`:
1. Worktree of the INSTALLED build, with `node_modules` linked: `v=$(di version | head -1 | sed 's/.*dev\.//')`; `git -C ~/work/<any di.iiii worktree> worktree add --detach ~/work/di.iiii-<job> $v`;
   `ln -s ~/work/<a checkout with node_modules>/node_modules <wt>/node_modules`; `ln -s ~/.di/current/serverXR/node_modules <wt>/serverXR/node_modules`.
   Check: `diff -rq ~/.di/current/serverXR/src <wt>/serverXR/src | wc -l` gives 0 (test files aside). Remove both links at the end, never commit them.
2. The show copy goes in BEFORE `di-dev up` (the source is only read, nothing is written under `~/.di`): `install -d -m 700 ~/.cache/di-dev/<job>/data/lighting`, then
   `python3 -I -c "import json,os; s=json.load(open(os.path.expanduser('~/.di/data/spaces/<space>/lighting/show.json'))); s['midi']={'maps':[]}; [l.update(on=False) for l in s['layers']]; json.dump(s, open(os.path.expanduser('~/.cache/di-dev/<job>/data/lighting/show.json'),'w'))"`
   (midi maps empty and every layer off; the desk reads `DATA_ROOT/lighting/show.json`).
3. CPU fence: `systemctl --user set-property --runtime di-api@<job>.service CPUWeight=1` (same for `di-web@`), `nice -n 19 taskset -c 5-7,13-15 di-dev up <job> --api scratch --no-keep`, then `taskset -a -cp 5-7,13-15` and `renice -n 19` on every pid and thread of each unit's cgroup (`systemctl --user show -p ControlGroup --value <unit>`, then `cgroup.procs`).
4. Checks before the run: `grep -c '^ARTNET_OFFLINE=1$' ~/.config/di-dev/env/<job>.env` gives 1; `ss -uapn | grep -c "pid=<api MainPID>,"` gives 0 (no UDP socket, so no Art-Net); `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<api port>/light/` gives 200 (port from `di-dev ls`, the `api :NNNN`).
5. Run: `nice -n 19 taskset -c 5-7,13-15 node scripts/show/light_page_check.mjs --url 'http://127.0.0.1:<api port>/light/#touch' --out <dir> --show <show copy>`; open the pictures. Negative control: the same with `--expect <count + 1>` must exit 1.
6. Teardown: `di-dev down <job> --wipe`, `di-dev forget <job>`, `systemctl --user revert di-api@<job>.service di-web@<job>.service`, remove the two links, `git worktree remove` (if it was a throwaway), `rmdir ~/.cache/di-dev/<job>`; count leftovers with `pgrep` in a command of its own.
Never load the live desk's light page, never read its `/api/state`, never send Art-Net while a show is running.

## Before a look is called lost (desk_missing_looks.py)

`python3 scripts/show/desk_missing_looks.py OLD_SHOW.json NOW_SHOW.json [RECORD ...]` lists the looks of an old show copy that are not on the desk now and says
whether each has a removal record. Give it the old copy, the desk copy and EVERY record: removal archives (`.json` with a `looks` list), handovers (`.md`) and the owner's ledger.
A text line is only a candidate for a person to read, not proof: it must name the look (id, name, or name without its number; whole word, any case; names shorter than 5 letters never match) and hold the whole word removed, deleted or archived.
The tool prints the file, the line number and the line (cut to 160 characters) under "named on a text line, read it".
Exit 0 every missing look has a structured (JSON archive) record · 3 the rest are only text candidates · 1 some look has no record at all (named; ask the lead before calling it lost; 1 wins over 3) · 2 usage or a bad or unreadable input (one line, no traceback). Read-only. Lesson N7279.3: a "16 looks lost" finding went out before the record was read; all 16 had been removed on the owner's word.

## Loading looks onto a desk: mirror_sync.py first (lesson N7034.4)

Before any look is added to a desk (`live_load.mjs`), `mirror_sync.py` runs with the measured presets (the `measured.<KEY>` records of the camera hold). Its exit 2 means a pan/tilt
sign was never seen on the rig (no `FACE_SIGN`, no mode for an axis, or an unmeasured key): the load stops there. `--rule-unmeasured-ok` is for other rigs only, never for a hall whose sign was not seen.
