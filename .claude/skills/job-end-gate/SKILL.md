---
name: job-end-gate
description: The end of every job — physics check (when a rig was touched), the sterile check (nothing running, open or left behind), the cost line, and what was built and where it now lives in di.iiii. Use as the last step of any job before reporting done.
---

# job-end-gate

**Needs:** the di.iiii checkout, python3, node >= 22; the sterile check works with plain `ps`/`sensors`; di-atlas tools (`di-dev`, `di-test-browser`, `ledger-add`) are used when present, with the fallback named inline.

Rule sources (owner's hard rules, dated): "Physics first" 2026-10-13, "Work sterile" 2026-10-12, "Learn once, optimize forever" 2026-10-10 (After Action Review, US Army TC 25-20; blameless postmortem, Google SRE book ch. 15; PDCA), "Nothing is left behind" 2026-10-13, "Usage" 2026-09-30. Words: `docs/ai/vocabulary.md`. A job that fails a check below is not done: say which one and what is owed.

## 1. Physics (only if the job touched a rig, a lamp or a look)
`python3 -I scripts/place/physics_check.py --api <api> --project <id> --hall <hall record>` (V: `--api --project --hall` required, `--tol` 0.5, `--fix` writes). Exit 0 = 0 leaks. A failed check blocks the change. Add a look from outside and from the floor. Change one thing and recompute what depends on it (throw, end, footprint, aims) by the tool, not by a stored number.

## 2. Sterile
Run, read the output, say it:
- test browser: every test script ended on `about:blank`, then the browser is closed (on a di-atlas machine `di-test-browser down`; elsewhere close your Playwright browser). Per lane scene URLs: `curl -s 127.0.0.1:9223/json | head` (UNVERIFIED port per lane).
- stacks: on a di-atlas machine `di-dev ls` (V) then `di-dev down <tree>` for your own trees; elsewhere stop the dev server you started by its PID (`kill <pid>`), never by name; named in the job's end line if kept and why.
- processes: `ps -eo pid,pcpu,comm --sort=-pcpu | head -8` (no stray blender, node, vite of yours); heat `sensors`.
- files: temp only in the session scratchpad, nothing new at `~`.
- Two kinds of open things: pages and apps opened FOR the owner (di-show, di-open) stay until he closes them and are named "left for you: …"; everything else the job opened is closed by the job.
No `di-sterile` tool exists yet (owed, ledger 10-12); this list is the manual form.

## 3. Cost line
Tool calls, minutes, tokens for the job, each against the last comparable job (on a di-atlas machine `python3 ~/di-health/usage/usage_week.py`, V: file exists; elsewhere your plan's own usage page). Name the account. Measured, never felt.

## 4. Built and where it lives (Nothing left behind)
A table of every tool, script, button, rule or data piece the job made, and where it now lives in di.iiii (a feature, a skill under `.claude/skills/`, `scripts/`, the space document). Anything that lives only in a script, a chat or a scratch stack is "left behind" and becomes a ledger row (or an issue on dob-0/di.iiii) with an owner. The platform never checks a production by name; a production is an example.

## 5. Review (one line each)
Meant to happen · happened · why they differ · what changes now (a durable change in one place: tool, test, guard, brief template, or skill — with its before/after number). A lesson not yet a change is an open row.

## 6. Report ends with
`sterile: yes` plus the check's output, or what stays and why; the cost line; the owner's asks and their state.
