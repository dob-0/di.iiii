## 2026-09-11 — the small model that comes with di.iiii, fetched by one command

The owner's 2026-09-06 ask ("the smallest model which can rule and direct", for every VJ,
working with no internet) had a recommendation attached to it since 09-06 and no code. He
said yes on 09-11 and asked for tests before taking anything, so the pick was re-benched
first and then built.

**The pick changed.** Twelve routing cases into one JSON action — two that must route to
nothing, one written in Armenian — run free-form and under a grammar, on CPU, against eight
candidates ≤2B. `granite-4.0-h-1b` got twelve out of twelve in both modes and was the only
model that filled every field unprompted. `LFM2-1.2B`, the earlier recommendation from a
two-prompt bench, got seven and collapsed half of everything onto one action. Its licence
settles it anyway: LFM Open License v1.0 is Apache's text plus a $10M revenue ceiling on
commercial use, read from the LICENSE itself — redistributable, but not something an open
platform hands to everyone who installs it. Granite is Apache-2.0 with nothing attached.
The harness and the numbers are in the owner's `~/llm/bench-2026-09-11/`.

**What shipped:** `di keeper get` fetches the weights (901 MB) and llama.cpp's own CPU build
for the platform (11–17 MB) into `~/.di/keeper/`, verifies both against a checksum published
by a different endpoint than the bytes, and writes the one line of env
(`LLM_BASE_URL=http://127.0.0.1:8099`) that the server already knew how to read. `di up`
starts it when it is present — loopback-only, even under `--lan` — `di down` stops it,
`di doctor` says whether it is answering, `di keeper remove` takes it off, and `di uninstall`
takes it with the app. Nothing downloads until the command is typed: the CLI's standing
promise is one unsolicited request a day, and 901 MB would break it.

Seen end to end, not inferred: a slim release installed into a scratch `DI_HOME`, `di up`
with `claude` removed from PATH (a VJ's laptop), `/api/ai/providers` reporting
`keyConnected: false, localClaude: false, localModel: granite-4.0-h-1b`, and the agent
endpoint streaming a real answer token by token from the machine.

**What was deliberately NOT built, and why.** The routing half of the ask — the model
*directing* things: install a bigger model, install Claude, run `di doctor` — is the part
`docs/architecture/RAW_WORKSPACE.md` refuses in writing: *"Blocked on a decision: whose
credentials, and what the agent is allowed to touch… Do not build this without answering
that."* Nothing in the codebase lets a model trigger an action today, and this change does
not become the first. The bench proves the model can route; the gate is the owner's to open.

Also true and worth saying plainly: this model knows nothing about di.iiii. Asked for help
rather than routing it will invent a menu item. The help side needs the wiki text handed to
it, and that is a separate change.
