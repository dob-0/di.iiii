# Contributing — two lines: code and spaces

di.iiii has two lines of work, and they live in different places:

| Line | Lives in | Copies |
| --- | --- | --- |
| **Code** | git (this repo) | your clone/fork, `dev`, `main` |
| **Space content** | each tier's own database (scenes, projects, documents) | local, **dev.diiii.xyz**, **diiii.xyz** — three separate databases, nothing keeps them in sync automatically |

Almost every real task touches both at once: you change some code AND some content
while testing it. Treat them as two things you sync separately, not one.

**The addresses today:** `dev.diiii.xyz` is the rehearsal tier, and its only address —
the old name `staging.di-studio.xyz` was switched off on 2026-09-16, and the scripts say
`dev` (`--tier dev`). `diiii.xyz` is the only host for anything you write down as a new link;
`di-studio.xyz` is the old production name and still answers the same way.

## The start check

Before you start any task, and before you push:

```bash
npm run start-check
```

It fetches, then tells you ONE thing: **LATEST** or **NOT LATEST — do this first**,
covering both lines:

- **Code** — is your branch caught up with `origin/dev`? If you're on a fork, is your
  fork's `dev` caught up with upstream?
- **Spaces** — for the spaces this box holds (or `--space <id>` for just one), does the
  dev tier hold newer work than what's on this box?

It is read-only and safe to run any time. `--strict` exits 1 when the answer is NOT
LATEST — useful in a script; the default (exit 0) is for a human glancing at output.
If a network step can't complete in about ten seconds, that step reports "not
checked" — it never claims LATEST when it doesn't actually know. A `SessionStart`
hook already runs this for you in Claude Code; `pre-push-gate.sh` warns (never blocks)
when your branch is behind before a push.

A space is "behind" only when its normalized content differs (versions and asset addresses
drift by themselves); projects this box put in its trash are never offered as a pull, and
pairs it couldn't read in time are one "not confirmed: N" line.
If `tier-sync.mjs --changed` refuses everything, rebuild its baseline:
`node scripts/tier-sync.mjs --rebuild-baseline --dry-run` (then without `--dry-run`).

If it tells you a space is behind, it names the exact pull command. If it can't reach
a tier (no token configured, or the tier is unreachable), that space is reported as
"not checked" — not as "in sync". Don't read silence as safety.

## Writing to a tier refuses when it's stale

The write-side tools (`space-push.mjs`, `space-sync.mjs`, `tier-sync.mjs`,
`space-bundle.mjs import`) all refuse to overwrite a destination that changed since
you last knew about it, instead of silently clobbering someone else's work. Each
refusal prints the exact command to pull the newer copy down, or the explicit flag
(`--force`, and where that still isn't enough, `--force-stale`) to override it on
purpose. If you hit a refusal, read it before reaching for the override — it exists
because something real changed.

This is the first piece of the safety net, not the whole thing: it stops a routine
sync from being the thing that erases someone's afternoon. The rest — an author on
every change, automatic restore points, a way to see recent history and undo it — is
**coming in later PRs**. Nothing about their shape is promised here; when they land,
this file gets updated in the same PR.

## The five doors

Every door writes through the same APIs, so the rule is the same everywhere: **run
the start check first**, and if a write is refused as stale, pull before you retry.

### Studio, by hand

Sign in, edit. Studio always reads and writes the tier you're signed into — it can't
accidentally reach across tiers. There's nothing else to do beyond the ordinary
"pull before you start a session" habit.

### A script

Anything in `scripts/` that writes to a tier (`space-push.mjs`, `space-sync.mjs`,
`tier-sync.mjs`, `space-bundle.mjs import`, `project-pull.mjs`, …) reads its target
tier from `--to`/`--tier`/env — always name the tier out loud, never rely on a
default, and read `docs/ai/local-workflow.md`'s "two live footguns" section once
before your first push. `--dry-run` first is always free.

### An LLM or agent — any tool, not just Claude

Claude Code, another assistant, a custom agent — same rule. Run `npm run start-check`
before starting, don't skip a refusal by reaching straight for `--force`, and read
`AGENTS.md` (step 0 points here) before improvising a workflow this repo already has
one for. `docs/ai/parallel-agents.md` covers running more than one agent at a time
without them clobbering each other's *code*; this file is the space-content half of
the same problem.

### Telegram

The bot writes through the same content APIs as everything else — a change made
through Telegram is a change made by an authenticated actor, subject to the same
per-tier separation as any other door. There is no separate Telegram-only path that
bypasses the tier a space actually lives on.

### A fork, on Windows

Onboard with `ONBOARDING.md`; its [§9 Known Windows gotchas](ONBOARDING.md#9-known-windows-gotchas-already-handled)
covers the platform-specific setup traps. Once you're running, the two-line rule
above still applies exactly as written — a fork just means your **code** line has an
extra hop (fork → PR → `dev`) before it's caught up; your **space** line (local tier)
is unaffected by which fork you're on.

## Carrying a whole space to another tier

A space has **one home tier** while it is being worked on — edit it there, and only
there. It moves up (collaborator's install → `dev` → `diiii.xyz`) as one file, in this
order, with a look between every step:

1. **Export** on the home tier: `node scripts/space-bundle.mjs export <space> --out <space>.diiii`
   (a collaborator on a fork publishes the file as a **release** on the fork — Telegram
   cannot carry it).
2. **Dev first.** On the dev server: `space-bundle.mjs import <file> --force --tier dev`.
   On a hosted tier the tool refuses a replace unless `--tier` is given **and is the tier
   it is actually running on** — the 2026-09-17 accident was a file meant for dev landing
   on prod because nothing said where it was. Address the container by **name**
   (`dii-dev-server-1`, `dii-server-1`), never by `cd` + `docker compose`.
3. **Look at dev** — desktop and phone, the space's own links — before anything else.
4. **Prod on the owner's word**, same command with `--tier prod`.

What a replace does and does not do: it keeps the projects the file does not carry
(`--prune` deletes them, and says which), keeps the space's label and owner, carries each
project's draft/archived/trash state, and writes a before-copy to
`<data-root>/_backups/space-replace/` first. It still refuses a target that changed after
the file was exported unless `--force-stale` — read that refusal as "somebody else worked
here", not as an obstacle.

## Golden rule

See `docs/ai/golden_rules.md` for the one-line version of this file's rule, kept
alongside every other hard-won behavior rule in the repo.
