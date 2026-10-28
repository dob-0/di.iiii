## 2026-10-28 — design: di on phones and headsets, no install or their own copy, by case

- `docs/ai/di-on-phones-and-headsets.md` answers ledger N1420: no install (the host's place address) and an own copy on the device, chosen per case.
- Recommends: no install stays the default for guests, headsets in a hall and visitors; an own copy in the browser (local-first, follows a host) for phone-only crews and artists; a pocket hub for teams offline together.
- A real install inside a phone app is not recommended: nodejs-mobile's latest release runs Node 18.20.4, but the install needs Node 22.5 or later for `node:sqlite`, and iOS guidelines 2.5.2 and 2.5.4 apply.
- Design only, nothing built. The build plan is PRs C1 to C5 plus D1; five questions are left for the owner.
