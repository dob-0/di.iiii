# feat/monitor-prs-2026-11-17

Owner ask (N4644/N4645, 2026-11-17): see the open pull requests inside the admin Monitor, so merging needs fewer windows. Version 1 is read-only; merging stays his Enter in the merge window with proof.

- serverXR: `monitorPrs.js` (one GitHub call through the App's installation token, cached 60 s, never throws: no-app / no-permission / github-error are answers) and `GET /api/monitor/prs` behind the same gate as the Monitor (prod 404, dev owner-only, local admin). Added to the gate matrix in `monitorRoutes.test.js`.
- Page: `MonitorPrs.jsx` in Monitor › Work, own refresh every minute, each row a link.
- Not done: a Merge button (needs "Pull requests: write" on the App and a design for his Enter); checks/review state per PR; mirroring the aylmo merge queue + proof to dev. Whether the App has "Pull requests: read" is unchecked until the dev tier runs it.
- Overlap found while looking: the Board tab already has a "Pull requests" panel (and an Open PRs tile) fed by the machine's `gh` on aylmo. This one is the server-side list (GitHub App) in the Work tab, titled "Waiting to merge", so it also works when aylmo is off. Merging the two into one panel is a later step.
