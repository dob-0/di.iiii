## 2026-10-04 — the first follow over the internet, measured (aylmo ↔ dev.diiii.xyz, space hayfilm)

Owner, 2026-10-04: "why local and dev is not the same?" → "go" (make them the same: dev code installed locally, local hayfilm follows dev).

- Installed di on aylmo: `0.4.16-dev.fc83b198`, packed from dev `fc83b198` (#744) with `npm run di:pack -- --version=0.4.16-dev.fc83b198`,
  sha256 `9d45a6fe8a8a941d06577a705b72a4495688d95cf6783ab7921aafd11f8e45d7`, installed with `di update --from` (previous `0.4.16-rigbuilder.15` kept).
  Backup before the follow: `di backup` → `~/di-backups/hayfilm-follow-2026-10-04/` (2.1 GB, SHA256SUMS beside it).
- Key: minted on dev through `POST /api/spaces/hayfilm/sync-keys` (editor, hayfilm only, one year; id `56ad4a03e055d2a8`). `di follow hayfilm --from https://dev.diiii.xyz --key - --into hayfilm`.
- Result and numbers: `docs/architecture/SPEC_follow.md` → Measured, "The internet case". Probe: added a row to MOCT's To do on aylmo, waited for it on dev,
  removed it on dev, waited on aylmo, polling the document every 100 ms; three runs; the list ended as it began on both sides.
- Found: a parked follow does not wake (~21 s per edit); empty projects do not travel. Both written under "Not yet (owed)". Not fixed here.
