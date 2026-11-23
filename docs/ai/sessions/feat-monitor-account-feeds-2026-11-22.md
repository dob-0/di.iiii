## 2026-11-22 — Monitor: tasks and shows belong to the account, shown on every machine

- The owner asked for one Monitor per account: studio-mac listed 3 tasks and 0 shows while aylmo listed 8 and 2, though both ran the same build. Credits, agents and pull requests were already lent across machines; tasks and shows were not.
- `feedFor` in `serverXR/src/monitorHub.js` now lends the task and show rows other machines read, from the shared picture dev already builds. This machine's own rows win (same id is not lent), its own rows are never lent back under another spelling, and stale, failing or malformed rows are skipped; at most 40. The page names each lent row "from <machine>" and the box subtitle says whose feeds it holds.
- Checked: 5 new hub cases (9 of 9 rule mutations caught), a page subtitle test, a test copy that showed aylmo's 5 tasks and 2 shows on studio-mac, and headless pictures at 1280x800, 1278x766 and 390x844 with nothing past the box edge.
- Still per machine by design: network links and services.
