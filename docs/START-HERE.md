# New machine → working on di.iiii

One page, four doors. Pick the one you need. Every step was run on a bare Raspberry Pi (Debian 13, Node 24) on 2026-11-18 unless it says "not walked".
The same page with COPY buttons and walked / not-walked marks: open `docs/start-here.html` in a browser.


## Door 1 — use di.iiii (no code, no account, about 1 minute)

```bash
curl -fsSL https://diiii.xyz/get | sh     # installs into ~/.di
# open a NEW terminal (that puts di on your PATH), then:
di --version
di up                                      # starts it and opens http://diiii.localhost/ (port 80 taken: it prints another address)
di new my-space                            # make a space
di save my-space                           # one file: my-space.diiii
```

Stop: `di down` · what runs: `di status` · what this machine can do: `di doctor` · newest version: `di update`.

**`di up` says "port 4000 is held by another program"?** Something else uses that port (it did on the Pi). Run `di up --port 4171` and add `--port 4171` to `di new`, `di save`, `di status` and `di down`. (Older di versions, 0.4.3 and before the fix, said "already running" here and then failed on `di new`.)
A machine with no screen: add `--no-open`.

## Door 2 — work on the code (about 5 minutes; the clone is ~490 MB)

You need `git` and Node 22 or 24 with npm 10+ (`package.json` engines).

```bash
git clone https://github.com/dob-0/di.iiii && cd di.iiii
npm ci                                     # the app; also switches the git hooks on (3 minutes on a Pi)
npm --prefix serverXR ci                   # the server's own packages; skip it and ~220 tests fail (Cannot find module 'dotenv')
npm run start-check                        # run before you start and before every push
git switch -c feat/<what>-<date>           # never commit on dev or main (hooks refuse it)
npm run dev                                # frontend 5173 + backend 4000 — not walked on the Pi
npm run lint && npm run test -- --run      # before you push (not walked on the Pi)
git push -u origin HEAD                    # a push opens the PR to dev by itself (needs push rights; a fork works too)
```

`npm ci` prints a warning that `esbuild`'s install script is not approved. Whether the build needs it was not checked: if `npm run build` fails on esbuild, run `npm install-scripts approve esbuild` (npm 11 and up; npm 10 has no such command).
Read next: `CURRENT.md`, then `AGENTS.md`, then `CONTRIBUTING.md`. Commands you will use: `CHEATSHEET.md`.
Not walked: macOS, Windows, `gh auth login` and a real push.

## Door 3 — let Claude (or another agent) use it

```bash
claude mcp add di -- di mcp                # hands di.iiii to Claude as tools
```

More, with a key: `docs/ai/public/setup.md`. `di login` exists only in builds newer than 0.4.3.

## Door 4 — sign in as yourself (admin) on a new machine

Do door 1 first. Once per machine; no password is typed in the terminal.

```bash
di login                                   # shows a short code and opens the browser — not walked on a new PC
di whoami                                  # names you, this machine, and when the sign-in ends
```

In the browser, sign in as yourself (GitHub, Google or Telegram), open the page it shows, and type the code.
The terminal can read and edit your spaces and projects. It cannot publish or delete a space, or change who owns or edits one: those stay in the browser.
It lasts until you end it (`di logout`, or the list at /device), or 90 days unused (a year at most). It signs in to dev.diiii.xyz by default; add `--tier prod` or `--tier local` for another.

### See all your machines in the Monitor (after door 4)

Signed in, the local Monitor (`diiii.localhost/admin`, Monitor) lists every machine of your account; not signed in, it shows this machine only. A machine joins once, from a machine that can reach it:

```bash
scripts/monitor-join.sh <ssh-host>         # signs that machine in, sends one report, starts a 30 s report timer
ssh <ssh-host> 'di monitor install-timer --remove'   # undo
```

Someone else who signs in sees only their own machines. A report timer written by a build with the timer fix (PR #1328, 2026-11-20 or later) follows the installed version (`~/.di/current`), so it keeps reporting after `di update`. A timer written before that names a version folder and stops at the second `di update`: run `di monitor install-timer` once more, from a build that has the fix.

The chats of a machine reach the Monitor only when that machine says where its chat list comes from. One command sets it: it edits `~/.di/monitor.json` for you, keeps the old file once as `monitor.json.bak-<time>`, and changes nothing when the feed is already set.

```bash
di monitor feed add chats --command "my-chat-list --json" --check   # the command prints { "chats": [ ... ] } as JSON; --check runs it once, under the Monitor's own 4 s limit, and saves nothing the Monitor would not accept
di monitor feed list                                                # what is set
di monitor feed remove chats                                        # undo
```

`--dry-run` prints the file it would write and writes nothing. `credits` works the same way for the Credits box.

## Which door has what

| You want | Door | Longer guide |
|---|---|---|
| to make a space | 1 | `docs/ai/public/join.md` |
| to change the code | 2 | `CONTRIBUTING.md`, `CHEATSHEET.md` |
| an assistant to act for you | 3 | `docs/ai/public/setup.md` |
| this terminal to act as you | 4 | `di help login` |
