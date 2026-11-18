## 2026-11-18 — admin regrouped, Spaces world (List | 2D | 3D), click-walk fixes

Owner ask: make /admin easy to read, interactive and realtime (MdiD: 2D + 3D UI to control and monitor).

Done, one commit per step: (1) nav regrouped Watch / People and spaces / Outreach / Operate (staff), keys and hashes unchanged, Monitor still gated by the server answer; (2) Spaces world in Spaces and users: List | 2D | 3D over the Monitor map engine, people on ring 3 with a line per granted space, selection shared with the list, full screen card with Open details, 10 s poll plus Refresh now (no new endpoint: listServerSpaces, getServerConfig, listUsers); (3) click walk at 1440, 700, 390: input box-sizing, Monitor 7th tile, switch cells, six scene counters in one row, header titled by section, phone title not drawn twice, Spaces and users header cards dropped (counts are in the page).

Not done: no websocket push for the world (poll only); Open call / Visitors / Agents inner layouts not redesigned; "Apps that visit" is the Visitors section (no separate section exists); phone 2D/3D shown but not touch-tested on a real phone.
