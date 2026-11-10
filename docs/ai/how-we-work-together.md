# How we work together — your copy, dev as the hub, prod as the public

Design, 2026-10-28 (ledger N1432). This is about **work** — spaces and projects — moving between people's
installs. The code side (branches, PRs, deploys) is [local-workflow.md](local-workflow.md); this doc only touches
it where code and work meet. Every **exists** line points at the code on branch `dev` as read on 2026-10-28
(file:line). Every **owed** line is something searched for and not found. Words: [vocabulary.md](vocabulary.md).

## 1. Your words, and the question

> "i want to know what is the best workflow so we have there dev and main and me and emilya and others work so
> i dont want to my flood so also the project sharing part … sometimes i start to do and share it with others or
> others do something and share it with di. so need smart workflow where it will not mess and we can easy share
> and work"

The question: **where does a piece of work live while it is made, how does it reach the others, how does it
reach the public, and how do we keep every copy from filling up with tests and leftovers?**

## 2. The model in one picture

```text
   your install (aylmo)        Emilya's install        anyone's install
   diiii.localhost             diiii.localhost         diiii.localhost
   new spaces: private         new spaces: private     new spaces: private
          │  follow                   │  follow               │  follow
          └──────────────┬────────────┴───────────┬───────────┘
                         ▼                        ▼
              dev.diiii.xyz — THE HUB (rehearsal; branch dev)
              every shared space lives here; every install follows it
                         │
                         │  promotion, only when you say (copy, one way)
                         ▼
              diiii.xyz — THE PUBLIC (live; branch main)

   CODE travels separately:  GitHub PR → dev → main.  Code never carries work.
```

Four rules make the picture:

1. **A space starts private, on the install where it was made.** Nothing leaves your machine until you share it.
2. **Sharing = following dev.** A shared space lives on dev; each install that needs it follows it there. Installs
   never follow each other (star, not mesh).
3. **The public is promoted, never followed.** A production reaches diiii.xyz only by an explicit copy you ask for.
4. **Code and work never ride together.** A deploy changes the program; it never moves a space (`local-workflow.md`
   "The four channels").

| Part | Exists (code) |
| --- | --- |
| A new space is private | `serverXR/src/routes/spaceRoutes.js:360` builds the new space without `isPublic`; `serverXR/src/spaceStore.js:216` stores `Boolean(undefined)` = private. `di new` posts only `label, permanent` (`scripts/di/cli.mjs:574`). |
| Follow, both ways, op by op | `serverXR/src/follow/follower.js`; contract `docs/architecture/SPEC_follow.md:12-27` (only the host must be reachable, so a follower behind a home router syncs both ways). |
| Star only | `SPEC_follow.md:269` "One remote per space, star only … two followers do not talk to each other." |
| dev deploys from `dev`, prod from `main` | `.github/workflows/deploy-vps-dev.yml:12`, `.github/workflows/deploy-vps.yml:14`. |
| Work promoted dev → prod by a copy | `scripts/promote-space-projects.mjs:2-7` (`npm run space:promote`, `package.json:67`): "there is no promotion path between environments other than this script". |

## 3. By case

### (a) You start something alone

| | |
| --- | --- |
| Exists | `di new "my show"` (`scripts/di/cli.mjs:559`) makes a private space on your install; the Studio's own "new space" uses the same route (`spaceRoutes.js:316`). `di spaces` lists the spaces on this install (`cli.mjs:658`). `di save` / `di backup` keep a copy (`cli.mjs:1688`, `:733`). |
| Owed | Nothing for the start itself. |
| You type | `di new "my show"` — or press New space in the Studio. |

### (b) You share it with Emilya

| | |
| --- | --- |
| Exists, today | The space must live on dev first (made there, or carried there — see owed). On dev's side `di invite <space>` mints a key (`cli.mjs:1146`, `ui.invited` `:1159`; `--manage` for a key that may also trash, hide and move, `SPEC_follow.md:234-262`). Emilya runs `di follow <space> --from https://dev.diiii.xyz --key …` (`cli.mjs:1251`). `di follows` shows every follow and what is not carried (`cli.mjs:1263`); `di unfollow` stops (`:1281`); `di invite --revoke` takes a key back (`SPEC_follow.md:343`). Projects, their files, trash, rename, move and "private wins" all cross (`SPEC_follow.md:155-213`, `:97`). |
| Owed | (1) **Carrying a space that so far exists only on your install UP to dev** in one step: `di follow` makes the LOCAL copy from the host (`scripts/di/follow.mjs:22` `createLocalSpace`); the reverse — "publish my private space to the hub" — was not found as a command. (2) **Follow by name**, no URL, no key paste, and a Share button: `docs/ai/team-sync-by-network-name.md` §14 PRs 3–4 (PR 2 `di name` is built, `ea975bc96`). (3) Same-field conflicts: the host's value wins (`SPEC_follow.md:266-267`). |
| You type | today: you `di invite <space>` against dev; she `di follow <space> --from https://dev.diiii.xyz --key <key>`. Soon: press Share. |

### (c) Emilya, or a stranger, makes something and shares it with di

| | |
| --- | --- |
| Exists | **Trusted people** on a space apply directly, with their name on every op and undo (`serverXR/src/authAccess.js:119-137`; the list is per space, owner-managed, `catalogue/entries/spaces.js:109`). **Everyone else proposes**: `POST /api/spaces/:id/proposals` applies at once if trusted, otherwise queues it for the owner (`catalogue/entries/spaces.js:397-402`; "every op carries the proposer as author … History → Restore undoes it", `serverXR/src/contentProposals.js:23-24`). A proposal never applies itself (`serverXR/src/approvalGate.js:82-84`). **Strangers**: a guest gets a sandbox that the sweep trashes after 7 days idle (`serverXR/src/config.js:341`; signed-in account sandboxes 180 days, `:344`); signing in carries the guest's sandbox into the account (`serverXR/src/routes/authRoutes.js:141`). Visitor inscriptions on a public space only when the owner turns `openInscriptions` on (`catalogue/entries/spaces.js:106`, `:256`). |
| Owed | (1) A follow carries edits made under a **sync key**, and a sync key is never trusted or owner (`authAccess.js:123-124`), so Emilya editing through her follow is an "editor" on dev, not a proposer: there is no review step between her copy and the hub. (2) A queue page where you see proposals and press approve was not found in `src/` (only the route and the approvals decision route `catalogue/entries/platform.js:55`). (3) A guest sandbox becoming a real shared space ("Emilya, take this") as one move. |
| You do | Add Emilya to the space's trusted list (space settings). A stranger's work arrives as a proposal you approve. |

### (d) A production goes public

| | |
| --- | --- |
| Exists | `npm run space:promote -- --space <id> [--project <id>]` copies project documents and their files dev → prod (`scripts/promote-space-projects.mjs:2-16`). Public is a separate switch, refused to anyone but the owner/admin (`catalogue/entries/spaces.js:113`). |
| Owed | (1) Promotion is a script, not a button in the Studio and not a `di` command. (2) It copies; nothing records "prod holds dev's version N of this project", so a later edit on dev is not flagged as unpromoted. (3) It needs a token in a developer's shell. |
| You do | Say "promote <space>"; an agent runs it with the proof (a link on dev before, the link on diiii.xyz after). |

### (e) A test by an agent

| | |
| --- | --- |
| Exists | Tests run in scratch stacks only: `di-dev up <tree>` (with `--api scratch` for a throwaway serverXR), never your installed di (`docs/ai/local-workflow.md:18`; `AGENTS.md` "Local Run"). Each tree has its own data folder, so a test space never lands in your copy. |
| Owed | Nothing stops a test that points at `diiii.localhost` or dev by mistake: the rule is written, not enforced by a guard. |
| You do | Nothing. A test space in your copy is a bug to report. |

### (f) Cleaning up

| | |
| --- | --- |
| Exists | **Space trash**: delete moves a space and its projects to the trash for 30 days (`catalogue/entries/spaces.js:42-46`); `GET /api/trash/spaces` lists it (`:57`), restore brings it back with its projects (`:65-70`), purge is the one hard delete (`:73-78`). **Restore points**: every change through a write route takes one first (`follower.js:909`); restore to one (`spaces.js:405-418`, which itself takes a fresh one first). **The idle sweep** moves abandoned spaces to the trash, and keeps anything published, listed, linked, named or holding a project with content (`serverXR/src/spaceStore.js:515-535`, run `:590-605`); what it will do in the next 14 days is at `GET /api/admin/sweep` (`catalogue/entries/platform.js:42-48`). |
| Why your copy still has the empty test spaces | A follow carries a space's **projects**, but **a space trashed on the host is not carried** (`SPEC_follow.md:269-271`, "Not carried: … a space trashed"), and a space no install follows does not sync at all. So spaces cleaned on dev stay on aylmo until they are trashed on aylmo too. (The count "9 empty test spaces" and the dev clean-up date 10-05 are from the brief — unchecked here, no network in this job.) |
| Owed | (1) A space trashed on the hub reaching its followers (with the same guards as project trash: a trash row, never an absence; never empty a copy). (2) The sweep's report as a page for you (today admin JSON). |
| You do | Trash in the Studio; the trash keeps it 30 days. |

## 4. "No flood" — the rules that keep every copy clean

1. **New spaces start private, in your own copy** (`spaceRoutes.js:360`, `spaceStore.js:216`). Only what you share
   reaches dev; only what you promote reaches prod.
2. **Tests never in a real copy.** Agents use `di-dev` scratch trees (`local-workflow.md:18`).
3. **Strangers play in sandboxes** that the sweep clears after 7 days idle (`config.js:341`); nothing of theirs lands
   in your space except as a proposal you approve.
4. **The sweep only trashes, never deletes**, and skips anything that holds work (`spaceStore.js:515-535`).
5. **One page that shows every space on every tier** (yours, dev, prod: same / differs / only here / followed or
   not): **owed.** Pieces exist — `di spaces` (this install only, `cli.mjs:658`), `di follows` (`:1263`), `di sync`'s
   read-only audit (`:1027`, `docs/architecture/SPEC_di_sync.md`), `npm run start-check` (repo developers, `scripts/start-check.mjs`).
   `what-we-have` is a **space** on dev (`scripts/dev-stack-lib.mjs:117`), not this page.

## 5. Who may change what

| Who | May | Where |
| --- | --- | --- |
| The space's owner | everything in that space: contents, settings, public, trusted list, trash | `authAccess.js:119-129` |
| Trusted people (per space, chosen by the owner) | apply content directly; their name on every op; undo by History → Restore | `authAccess.js:131-137`, `contentProposals.js:23-24` |
| Signed-in others | propose; it waits for the owner | `catalogue/entries/spaces.js:397-402` |
| Guests | their own sandbox; may not propose | `spaces.js:402` ("guests are refused") |
| A follow (sync key) | edit; with a `manage` key also trash, hide and move; never make public | `SPEC_follow.md:234-262` |
| An admin-level write | waits for a person when the approval gate is on | `approvalGate.js`, `config.js:436` |

**Built:** owner, trusted list, author on every op, restore points, proposals with a queue.
**Phase 2 (owed):** a review page for proposals; a follow that proposes instead of editing for someone not trusted;
keeping both people's change on the same field instead of "host wins" (`SPEC_follow.md:266-267`).

## 6. The owed list as a build plan (cheapest first, each visible alone)

| # | PR | What you see after |
| --- | --- | --- |
| 1 | **Every-space page** (read-only): your install, dev and prod side by side — same / differs / only here / followed | one page answers "what do we have, where" |
| 2 | **Space trash follows** host → followers, with the project-trash guards | clean dev once, every copy cleans itself |
| 3 | **`di share <space>`**: carry a private space up to dev and follow it in one step | "I started it alone, now Emilya has it" = one command |
| 4 | **Proposals page** in the Studio: list, look, approve or refuse | a stranger's work waits for your click |
| 5 | **Promote button** (owner only) using the promote script's rules, recording which version went public | "go public" is a click with a before/after link |
| 6 | **Follow by name + Share button** — already planned, `team-sync-by-network-name.md` §14 PRs 3–4 | Emilya joins without a URL or key |
| 7 | **A follow that proposes** for people not on the trusted list | sharing with a stranger without giving them the pen |

## 7. Questions only you decide

1. Should dev be **the** place every shared space lives (your machine shares by sending it up), or may a space be
   shared straight from your machine to Emilya's while dev is not involved?
2. When Emilya edits a space you share, should her changes land at once (trusted) or wait for your yes (proposal)?
3. Who may press "promote to diiii.xyz": only you, or also Emilya for spaces she owns?
4. When you trash a space on dev, should it also go to the trash on every copy that follows it?
5. The empty test spaces on your machine: trash them now (30 days to undo), or keep them until the every-space page
   (PR 1) shows them side by side?
