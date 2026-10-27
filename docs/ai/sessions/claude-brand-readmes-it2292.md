## 2026-10-21 — front pages say the names and words the way the rules do

- Six headings no longer append a word to `di.iiii` (NAMING.md spec v2 §1): `serverXR/README.md` "Control Server", `docs/deck/README.md` "Deck Context", `docs/ECOSYSTEM.md` "Ecosystem Map", `docs/ai/roles/README.md` "AI Engineering Collective", `sdk/README.md` "SDK", `docs/ai/roles/ui-ux-engineer.md` "Visual Identity — Complete Spec".
- `serverXR/README.md` no longer lists the deleted Beta editor (3 lines): it names Studio, the node editor (`src/raw/`) and V1 (compatibility). `docs/deck/README.md` drops "lane"; `ONBOARDING.md` says Nodes, not Raw.
- `sdk/README.md`'s table imported from `'di.iiii/sdk'`, which does not exist; it now shows `./sdk/index.js`, the import its own example uses.
- Guard: `scripts/brandReadmes.test.js`, 10 cases; 10/10 fail on the old text, 10/10 pass now (with `retiredStudioNames` and `sdk/`: 6 files, 96 tests).
- Left as asked: README.md (open PRs #1088, #1075), `serverXR/.env.example`, `public-README.md`, `package.json:2`.
- Still owed to the lead (a cloud session cannot push `.github/workflows`): release v0.4.3 has an empty body (`gh release edit v0.4.3 --notes-file`, after the release workflow writes one from the commit list); the GitHub homepage field → diiii.xyz after #1075 merges (`gh repo edit --homepage`).
