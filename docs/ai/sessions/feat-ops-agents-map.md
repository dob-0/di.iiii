# feat/ops-agents-map — session notes

## 2026-08-08 — Ops Graph → Agents: a live map of the machine's Claude sessions

- New admin section `agents` in the Ops Graph, composed entirely from the
  preferences-* design system — `ArchitectureCanvas` map of live sessions linked to
  the checkout each one holds, a Directory (live first, then recent) master-detail,
  and per-session detail: subagent tree, background-job state, conversation tail.
- Backend: `serverXR/src/agentBoardStore.js` reads the operator's local `~/.claude`
  (bounded head+tail scans — ~99 sessions indexed in ~130ms without parsing 700MB of
  transcripts; `sessions/*.json` + `process.kill(pid,0)` for the live overlay; no
  subprocesses). Routes `GET /api/agent-board` + `/api/agent-board/session/:id` are
  refused with 404 unless BOTH non-production AND loopback — transcripts can contain
  secrets and must never be served off-machine. Deployed environments show a plain
  "operator mode only" card.
- Design decision on record: this is the operator/diagnostics half (Framing C) of the
  larger agents-as-nodes direction. The product half — an `agent` node type joining
  `feat/ai-connections`' per-user encrypted keys (PR #105) to `feat/raw-studio-node`'s
  runner (PR #99) with a serverXR-side Anthropic proxy — is designed but NOT built;
  the analysis lives in this branch's PR discussion and the owner's session of
  2026-08-08. Do not reinvent: reuse approvalGate (PR #102) for agent writes, SSE for
  streaming, checkpoints-not-transcripts into the op-log.
- Verified by looking: desktop 1440×900 DPR1 + phone 390×844 DPR3 via headless
  Playwright against the real local data — map, selection, inspector, subagent tree,
  conversation tail all seen rendering. Known quirks found and fixed along the way:
  long titles blow the sidebar grid column open (grid min-width:auto) → JS-truncated;
  conversation tail needs a 4MB window because one pasted screenshot line can exceed
  256KB.
- Still undone, deliberately: lifecycle actions (close/archive a session, rescue
  job tmp/ artifacts) — the #1 want per the estate session's triage experience —
  and any resume/dispatch capability. Both need a write path and a permission story.
