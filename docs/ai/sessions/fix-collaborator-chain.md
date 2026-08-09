# fix/collaborator-chain

## 2026-08-09 — chain fixes from the collaborator-onboarding discovery walk

- Eight small fixes, each one a door a new collaborator actually hit on the walk
  from "invited" to "chatting with Claude in Raw".
- `AgentChatPanelWindow.jsx`: guest sign-in buttons never rendered — the code
  tested `providers?.github?.enabled`, but `/api/auth/providers` returns plain
  booleans (AuthGate consumes them that way). Fixed to booleans; the test mock
  had encoded the wrong shape too, so it was corrected and a regression test
  added (boolean providers → both buttons appear).
- Local-operator gate (`agentBoardRoutes.js` `isLocalOperatorRequest`): the di
  CLI runner sets `NODE_ENV=production`, which closed the gate on exactly the
  machines it exists for. Now loopback AND (non-production OR `DI_LOCAL === '1'`);
  `runner-node.mjs` sets `DI_LOCAL: '1'`. Loopback stays absolute. `aiChatRoutes.js`
  shares the same helper, so the Max/Pro local-claude chat path is covered by the
  same change; gate tests extended with the DI_LOCAL path.
- `nodeRegistry.js`: `agent` entry got `keywords: ['claude', 'chat', 'ai',
  'assistant']` and `listNodeTypes` now includes keywords in the query haystack —
  palette searches for "claude"/"chat" find the node.
- `AuthGate.jsx`: the out-of-scope editor card said "Sign in to open the editor"
  with no way to do it. The OAuth buttons were extracted into one shared
  `ProviderSignInButtons` (same handlers, same styling) and rendered on that card too.
- Wiki `claude-chat-node`: one clause making "on your own machine" explicit —
  a locally run di.iiii (`di up` or dev server), not the hosted site. `updated` bumped.
- `README.md` Start Here still listed the deleted Beta lane — now `Raw`.
  Other Beta mentions further down README (Current Truth, repo map table) are
  still stale — left alone on purpose, this branch is minimal fixes only.
- Installer (`ui.mjs` + `bootstrap.mjs`): success output now always ends with a
  dim "open a new terminal" line — the shell that ran curl|sh predates the rc
  change, so the conditional-only hint missed exactly the common case.
- `AGENTS.md` fork→auto-PR: one sentence that a fresh fork must enable Actions
  once and set `UPSTREAM_PR_TOKEN` before auto-PR can run.
