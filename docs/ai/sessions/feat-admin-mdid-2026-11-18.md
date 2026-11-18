## 2026-11-18 — admin regrouped, Spaces world (List | 2D | 3D), click-walk fixes

Owner ask: make /admin easy to read, interactive and realtime (MdiD: 2D + 3D UI to control and monitor).

Done, one commit per step: (1) nav regrouped Watch / People and spaces / Outreach / Operate (staff), keys and hashes unchanged, Monitor still gated by the server answer; (2) Spaces world in Spaces and users: List | 2D | 3D over the Monitor map engine, people on ring 3 with a line per granted space, selection shared with the list, full screen card with Open details, 10 s poll plus Refresh now (no new endpoint: listServerSpaces, getServerConfig, listUsers); (3) click walk at 1440, 700, 390: input box-sizing, Monitor 7th tile, switch cells, six scene counters in one row, header titled by section, phone title not drawn twice, Spaces and users header cards dropped (counts are in the page).

Not done: no websocket push for the world (poll only); Open call / Visitors / Agents inner layouts not redesigned; "Apps that visit" is the Visitors section (no separate section exists); phone 2D/3D shown but not touch-tested on a real phone.

## Later the same day: Mixed view, better 3D and 2D (PR #1309)

Owner: "i want to better 3d and 2d and where is the MdiD view where it is mixed all?". Three commits: (1) Mixed tab first and default (3D left, 2D top right, live list below, detail strip under; stacked 3D, 2D, list under 1100 px; one selection and one poll owned by `AdminManageSection`); (2) 3D: kind shapes and token colours, label culling, selection highlight, fly-to, legend; (3) 2D: people clustered around their space, no overlaps, glyphs, selection ring, legend, plus compact layout so a small pane stays readable.

Seen at 1440, 700 and 390 on the dev copy (admin-mdid.diiii.localhost, scratch DB: 6 spaces, 5 people); the box-escape check was run on the same widths (result in the PR body).

Not done: 3D labels hide far names until you select or come closer (a rule, not a setting); 2D text in the small Mixed pane is about 10 px at 1440, use Full screen in the 2D tab for more; no touch test on a real phone; the Mixed pane sizes are fixed ratios, not draggable.

