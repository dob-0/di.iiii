---
name: moxir-quick-change
description: Make a small change to a light rig in a scene, such as moving, re-aiming, recolouring, adding or removing a light, or changing a look, in minutes and a few tool calls instead of a build. Use when the owner asks to move or change a light, beam, laser, wash or look in moxir (or any place built with scripts/place). Do NOT use for new features, new fixture types, physics or render work. Those are code and go the normal route.
---

# Quick change: a light is data, not code

**Why this skill exists (measured 2026-10-09, session logs in `~/.claude/projects`):** the
moxir sessions of 10-07 to 10-09 used 240–650 M tokens each. The biggest one ran 1,537 turns at
**~425 k tokens of context per turn**, with 24 sub-agents. A request like "move this light" grew
into branches, renders, physics and layouts. Moving a light is one edit to one JSON file plus one
re-run of `rig.mjs`. That should take about 10 tool calls in a short session.

## Budget: stop when it runs out

- **At most 12 tool calls and no sub-agents.** If the change needs more, stop and tell the owner
  in one line what it really is (a code change). Then it goes the normal route.
- **Use a fresh session on Sonnet** (`/clear`, then `/model sonnet`). Carrying a 400 k-token
  context into a one-line change multiplies its cost by about 10.
- Read only the files named here. Don't read CURRENT.md, PROGRESS.md, the ledger history,
  golden rules or "just in case" files. Add one ledger row with `ledger-add`, and nothing more.
- No tests, no Colab, no physics, no layouts, no `rig-look` sweeps over 8 views.
  Take **one** picture of the change.

## The decision (one look)

Where do the lamps live in the target project?

```bash
# ids starting rig- mean the rig file drives them; anything else is a hand-placed object
curl -s http://diiii.localhost/serverXR/api/projects/<project>/document | \
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const e=JSON.parse(d).document.entities||[];console.log(e.filter(x=>String(x.id).startsWith("rig-")).length,"rig-",e.length,"total")})'
```
(Checked 2026-10-09 on the local di: `moxir-hall` → 23 rig- of 24. A project that shows 0 total here
is empty on this machine, so read it on the copy the owner looks at.)

- **`rig-` lamps → edit the rig file** (A). Never move a `rig-` lamp by hand or through the API.
  The next `rig.mjs` run deletes every `rig-` object and writes it again from the file, so a hand
  move is lost without a word.
- **Other lamps → edit that one object** (B), through the Studio (the owner can drag it himself,
  at no cost) or the `di` MCP server (`.mcp.json`, `di_find "ops"`).

## A. Rig file (most moxir lights)

1. Open the rig the project was built from, `scripts/place/rigs/moxir-*.json`. Find the **group**
   (`groups[].id`). A group's place is `mount` + offsets (`half_width_m`, `back_inset_m`, …) and
   its aim is `aim`. Looks are in `looks.<name>`. Change only those fields.
2. Dry run. It prints the summary and sends nothing:
   ```bash
   node scripts/place/rig.mjs --rig <rig.json> --hall scripts/place/rigs/moxir-hall-2026-09-28.hall.json \
     --project <project> --api http://diiii.localhost/serverXR --dry-run
   ```
   (Measured 2026-10-09: 0.28 s, "would replace the rig-* entities in moxir-hall … with 102".
   Run it from a checkout that has `node_modules`.)
3. Write it to the **test copy** first (`<space>-test.diiii.localhost`), never straight to dev.
   Use the same command without `--dry-run`. Add `--wash-only` when only the wash aim changed,
   because it is faster.
4. One picture: `rig-look.mjs --views <the one that shows it> --gpu …` on the agent screen, or
   `di-test-browser shot`. Open the picture yourself before you say it worked.
5. Put it in front of the owner with `di-show <url>`. Then commit the rig file on a branch. The
   change is a data diff of a few lines.

Undo: `git checkout <rig.json>` and run step 3 again. Hand edits are kept in `~/.di/picture-undo/`.

## B. One hand-placed object

`di_find "project ops"` → `di_describe` → one `di_call` that sets the object's
`position`/`rotation`/light fields. Read the object back (`pick` only those fields), then one
picture. If the `di` server isn't connected in this session, say so in one line and use the Studio.

Tested 2026-10-09: `di mcp --port 5335` → `di_find "project ops entity"` returns
`post_projects_ops` ("apply a batch of edits to a project"). Plain `di mcp` says `fetch failed`,
because it looks on port 4000 and the install on aylmo serves on 5335. `.mcp.json` names 5335. That
is a workaround: the owed fix is for `di mcp` to find its own install's port.

## When it is not a quick change

A new fixture class, a beam shape the renderer can't draw, haze or physics, a new place, or
anything under `src/`: those are code. Say so in one line with a size estimate, then use the normal
route (branch, tests, review).
