# Decision 2026-10-05 — release channels: every install runs the build the hub runs

Owner, 2026-10-05: *"it would be better to have all places the same way, synced"* and, earlier, *"main is always
older than dev, people start with the old version — fix that gap"*. Standing rule (global CLAUDE.md, "Dev and local
stay one", 2026-10-04): the installed di runs the same commit as dev.diiii.xyz; until a job does it with no hands, it
is owed. This is that job.

Code: `scripts/di/channels.mjs` (channel pick, pure), `scripts/di/autoupdate.mjs` (timer, heat guard, log),
`scripts/di/cli.mjs` (`di update --channel`, `di channel`, `di autoupdate`, `di status`),
`.github/workflows/deploy-vps-dev.yml` (job `publish-dev-channel`), `scripts/pack-runtime.mjs` (release.json now
records `gitCommit`). Tests: `channels.test.js`, `autoupdate.test.js`, `devChannelWorkflow.test.js`.

## The problem, measured on 2026-10-05

| where | runs | how it got there |
|---|---|---|
| aylmo (installed di) | 0.4.16-dev.b3d7f76b | packed by hand, `di update --from <tar>` |
| dev.diiii.xyz | 7a751cf3 | deploy workflow, the Mac pulls |
| prod diiii.xyz | 3be86786 (09-30) | main deploy |
| GitHub Releases "latest" | v0.4.3 (2026-09-07) | what a plain `di update` installs |

Origin/main is 697 commits behind origin/dev. Nothing publishes an artifact per dev commit, so a new install starts
at v0.4.3 and every other install is moved by someone remembering a command.

## The established method

Release channels with one immutable artifact per build, one channel per client, and an updater that moves only
along its channel:

- **Chrome** release channels (Canary, Dev, Beta, Stable): the same product on several channels; a client is on one.
  https://www.chromium.org/getting-involved/dev-channel/
- **VS Code** Stable and Insiders builds, side by side, Insiders built every day from main.
  https://code.visualstudio.com/docs/supporting/faq#_what-is-the-difference-between-stable-and-insiders
- **Debian** suites (unstable, testing, stable) and apt pinning: a machine follows one suite and promotion between
  suites is a deliberate, regular step. https://wiki.debian.org/DebianReleases
- **Unattended updates**: Debian `unattended-upgrades` runs from a systemd timer and logs what it did. The timer
  facts used here are from systemd.timer(5) (`OnCalendar=`, `Persistent=`, `RandomizedDelaySec=`) and
  systemd.service(5) (`Type=oneshot`, `Nice=`). https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html
- **Integrity**: a sha256 list beside the artifact, verified before anything is unpacked (the same shape as Debian's
  `SHA256SUMS` and GitHub's own release assets). `di update` already did this for stable; the dev channel makes it
  mandatory.

What is ours and not borrowed: the dev channel is **gated on the hub**. Chrome's Dev channel means "newest"; here it
means "the build dev.diiii.xyz is serving", read from `/serverXR/api/health` (`release.gitCommit`), because the rule is
that no install runs ahead of or behind the hub. This is a design of ours, marked unvalidated beyond the tests below.

## What was built

1. **CI, one dev prerelease per green dev commit.** Job `publish-dev-channel` in the dev deploy workflow, after `test`
   passes on a push to dev. It packs the runtime exactly as `npm run di:pack` does (local profile) as
   `<next patch after the newest v tag>-dev.<sha8>`, checks the sha256 file, and publishes a GitHub prerelease
   `dev-<sha8>` with `di-runtime-*.tar.gz` and `checksums.txt`. `--latest=false`: stable's "latest" is never moved.
   It keeps the newest 20 `dev-<8 hex>` prereleases and deletes older ones (and their tags). It deletes nothing else.
   It does not depend on the deploy: the artifact is a property of the commit; installs gate on the hub's health.
2. **`di update --channel dev|stable`.** `stable` is the old behaviour (`releases/latest`, newer-only). `dev` reads the
   hub's commit and installs the prerelease built from it, read from the public download URL
   `releases/download/dev-<sha8>/checksums.txt` (which names the tarball). **No GitHub account, token or `gh` on an
   install**: the repository is public and the people who install di have no account and want none (owner, 2026-10-05).
   **Rate limit:** the unauthenticated API allows 60 requests/hour/IP; the dev channel uses no API call at all, and when
   the install already runs the hub's commit a check costs one request to the hub and none to GitHub. (Stable still asks
   `releases/latest`, one API request per check, 4/hour on the 15-minute timer; an ETag conditional request is owed if
   many installs share one IP.) If CI has not published that commit yet, it says so and
   exits 0 ("pending"; the next run picks it up). Dev compares by commit, not by version order, so when the hub moves
   back the install follows. It goes through the same stage, rehearse, snapshot, flip and rollback path as before
   (`updateSafety.test.js` unchanged and green); the checksum is verified before unpacking and a mismatch refuses.
   `di channel dev|stable` remembers the channel in `state.json`; `di channel` shows it. Hub address: `DI_HUB`
   environment or `hub` in state, default https://dev.diiii.xyz.
3. **No hands.** `di autoupdate on` writes a systemd user timer and service (`di-autoupdate.timer/.service`, in
   `~/.config/systemd/user`) and enables it; `off` removes both; `status` reads. The timer fires every 15 minutes
   (`OnCalendar=*:0/15`, `Persistent=true` so a reboot or sleep catches up). Each run is `di autoupdate run`: if the CPU
   package is above 85 C (`sensors`, else the `x86_pkg_temp` thermal zone) it skips and logs; otherwise it runs
   `di update --channel <remembered>`. **One log line per run** in `~/.di/logs/autoupdate.log` (outcome one of
   `skipped-heat`, `up-to-date`, `pending`, `updated`, `failed`), and the same facts in state, shown by `di status`:
   last check, last update, last error. An unreadable temperature is logged, not assumed cool.
4. **Stable and prod, design only (below).**

## Limits, stated

- **Linux only for the timer.** Windows (Task Scheduler, `schtasks /create /sc minute /mo 15`) and macOS (a LaunchAgent
  with `StartInterval 900`) are documented in `di autoupdate on`'s own output, not built. Owed.
- **A user timer runs while the user is logged in** unless lingering is on: `loginctl enable-linger $USER`. `on` prints
  that line; it is not done silently because it is a system setting.
- **An update restarts a running di.** That is the existing `di update` behaviour (stop, flip, start). A show running
  on an install on the dev channel would be restarted within 15 minutes of a dev deploy. Installs that run a show
  stay on `stable` or `autoupdate off`; the heat guard is not a show guard. Owed: a "hold" file like the stage's.
- **Storage:** a runtime tarball is about 128 MB (local profile), so 20 prereleases are about 2.5 GB of release assets.
  Not measured in CI yet; the first run reports the size.
- **Not measured yet:** the job has not run on GitHub (it runs after merge); nothing here claims it works there.
  Measured locally: the tests (counts in the session note). Not run on this machine, by rule: `di update`,
  `di autoupdate on`, any publish.
- The hub being unreachable stops the dev channel (nothing to match). An install does not fall back to "newest".

## Stable and the gap to prod (design; no workflow written)

Today: `main` deploys prod (`deploy-vps.yml`), then `tag-on-promotion.yml` tags a version and `release.yml` publishes
the stable artifact. Prod last deployed 2026-09-30 and the last stable release is v0.4.3 (2026-09-07), because
the chain starts only when someone promotes dev to main, and 697 commits have not been promoted. Channels fix the
installs now; they do not fix prod. Proposed, in the Debian testing-to-stable manner:

1. **A promotion PR dev to main on a regular cadence** (weekly, e.g. Monday, plus before any show), opened by a
   scheduled workflow with the dev-to-main diff summary, the commits not yet on prod, the CI status of the dev tip
   and the install-matrix result. It is opened, never merged, by the workflow.
2. **The owner's word merges it**, per the existing prod deploy gate. The checks that must be green: full CI on the dev
   tip, `install-matrix.yml`, and the dev-channel artifact of that tip installed once by `di update --channel dev` on
   a scratch DI_HOME (a real update, not a pack test).
3. **Prod deploys from main as today; then** `tag-on-promotion.yml` tags and `release.yml` publishes the stable
   release, which is what `--channel stable` and a fresh `curl | sh` install. The gap a new install sees is then
   at most one cadence, not 697 commits.
4. A promoted commit is by construction one that already had a `dev-<sha8>` prerelease, so the stable artifact is the
   dev artifact rebuilt with the tag's version; owed: promote that exact tarball (re-tag, do not rebuild), the
   way Debian promotes a package unchanged between suites.

Owed from this: the scheduled promotion-PR workflow; the owner's cadence; a decision on whether "latest" should move to
a dev-derived tarball. Nothing in this change deploys prod or publishes a stable release.

## What the owner has to set

No new secret: the job uses the workflow's `GITHUB_TOKEN` with `contents: write` on that one job. If the repository
setting "Workflow permissions" is read-only for new tokens, the job-level `permissions` still grants write. If dev's
branch protection or a tag ruleset blocks creating `dev-*` tags, allow the Actions app to create them.
