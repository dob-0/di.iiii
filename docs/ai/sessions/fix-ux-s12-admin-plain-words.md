## 2026-10-29 — Admin console in plain words, with real switches; agent board checked on the server

UX fix round 3, slice S12 (plan `agent-reports-2026-10-28/ux-fix/plan.json`; audit F045, F046, F108, F109, F110, F150).
Two commits, meant as the plan's two PRs (a can land alone):

a. Server gate. `serverXR/src/routes/agentBoardRoutes.js`: the agent transcripts board now checks the role once the caller is local: below admin → 403. The estate map (`requireAdminAlways`) and recent events (admin or empty) were already gated by role. Test `agentBoardRoutes.test.js` (6; 3 fail on the old code). Live on a scratch stack with auth on: `/serverXR/api/agent-board` not signed in 403, admin token 200.

b. Plain words and switches (`PreferencesPage.jsx`, `PreferencesShared.jsx`, `usePreferencesData.js`, `preferences.css`, wiki).
- Title by job: "Spaces and who can see them" (people side) / "Operator tools" (staff side); eyebrow "Admin"; chip "Space: main".
- Nav: no glyphs; groups "Spaces and people" and "Operator tools (staff)"; Manage → Spaces and users, Agents → Agent sessions, Visitors → Apps that visit, Inspect → This scene, System → Log and settings, Estate → Machines. Group labels 12 px, full muted colour; phone: two even columns, 44 px rows; touch: 44 px.
- "Socket" → "Live link" (Connected / Offline); "Roster" → "People here".
- On/off settings are `role="switch"` with `aria-checked`, an On/Off word and a line on what they touch. Publish is "Publish to the server now".
- "Back to Editor" → "Back to the space" (it goes to /<space>; the Editor/Studio word is the owner's call, F121).
- Refresh remounts the open section (lists fetch again); no page reload.
Test `PreferencesPageWords.test.jsx` (4; all 4 fail on the old code). Pictures: `agent-reports-2026-10-28/ux-fix/round3/S12/before-after.png`.

Not done: a separate door (own route) for the operator tools (F046 asks for it; here it is a named staff group in the same page). Publish still has no confirm. The Agents tab still shows transcript tails to admins on a local machine (now admin-checked on the server).
