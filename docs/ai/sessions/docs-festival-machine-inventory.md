## The festival machine, inventoried; the local model gets its own name

Eleven testers walked every surface of aylmo's `di` install with the internet refused,
every blocker was reproduced twice, a critic tested the gaps. The inventory lives at
`docs/testing/FESTIVAL_MACHINE_2026-09-06.md` — the one-line answer: the tools work
offline, the room does not (loopback-only bind, no phone, no headset; CDN-loading pages
go dark).

One code change: the model on the box was handed Claude's system prompt and introduced
itself as Claude. `localModelSystemPrompt(model)` in `aiChatRoutes.js` names the model
instead; test in `aiChatRoutes.test.js`.

Owner decisions surfaced: `di up --lan`; the light show into `di backup`/`di save`;
re-cut the CDN-loading pages; the Dilijan camp assets are missing from the local tier.
