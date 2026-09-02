## 2026-09-02 — the platform's space is `di.iiii`, and the network has a room per person

- Space `main` is labelled `di.iiii` on prod and staging (was "Works"); the repo declaration
  already said so — `npm run spaces:audit -- --space main` is green on both tiers.
- `main` now declares three of the platform's own pages as projects, pushed from this repo
  and live on BOTH tiers: `/main/suite` (the very file nginx serves at `/suite/`),
  `/main/landing` (the 2026 standing copy of the front door), `/main/brand-guide` (a copy
  of di-brand/brand-guide.html — edit there, copy here). All `publish:false`; the front
  room `main-dii-project` stays the door and stays undeclared (Studio-authored scene).
- The og card for `main` no longer reads "di.iiii — a space on di.iiii." — the platform's
  own space carries the front-door line (`ogRoutes.js`, test added).
- `spaces/network/` is in git (it was untracked in the shared checkout). The roster's team
  names match `/suite` (Gevorg Grigoryan, Syuzi Ginosyan). Eight people have a room:
  the five-person team + Mery Petrosyan, Greta Grigoryan, Shahane Harutyunyan (everyone
  with a work already standing on prod). Rooms are generated from `people.json` by
  `spaces/network/build.mjs`; ids are `network-<slug>` (ids are global; `yeva-abgaryan`
  and `mery-petrosyan` are wcc's), addresses are `/network/<slug>`. Live on staging AND
  prod, walked as a visitor (roster → room → work → back; phone too).
- Still undone: staging's `main` keeps two stale drafts the repo does not declare —
  `privacy` (July text, says studio_network, unreachable at `/main/privacy` because the
  word is a reserved app segment) and `brand-directions` (rough, no source). Removal is
  the owner's call. `/suite` static on prod still shows two people until the next
  promotion carries #304.
