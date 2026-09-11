## 2026-09-11 — a leak closed, a page cut to an eighth, and the mark the second tier was missing

Four things were audited and fixed one at a time. None of the four was what the
backlog said it was.

**The network space's CV leak was real and it was the owner's own.**
`diiii.xyz/network/gevorg-grigoryan` still linked a world-readable Google Doc whose
anonymous text export prints his cell phone and two email addresses — the 09-10 fix
that replaced external CV links with inline text had never reached prod. Prod also
held 53 rooms against the manifest's 67. One `space-sync --all --tier prod` closed
both; every prod room was swept afterwards and **0 of 67 carry a docs.google.com
link**. An audit that claimed four leaking rooms was wrong: only one was.

**The trap that run found, and it is general.** The manifest carried
`"label": "network"` — the bare id — so every `--all` push rewrote the space label a
human had set. Prod still read "The network"; the second tier had already been
flattened by an earlier sync and nobody noticed, because a label is not a thing you
check. **Read a dry run for `would SET space label` before any `--all` push**: it
means the manifest disagrees with the live tier, and the manifest is not always the
one that is right.

**The second tier wore no mark at all.** Covered in its own note, landed separately.

**`the-light-put-back` went from 5.34 MB to 0.67 MB.** The twelve photographs, their
depth maps and point fields — 36 files, 3.59 MB, 91% of the document — became project
assets; the filmstrip thumbs and the sleeve stay inlined because they are wanted
before anything is on screen. `preload()` runs four lanes instead of one, since as
requests the old serial loop would spend the load waiting on latency. The page master
lives outside the repo at `~/di-backups/laser-scratchpad-2026-09-03/page2/`, and its
scripts were repointed out of a session scratchpad that no longer exists.

**Asset ids churn for a reason, now written down.** `POST /api/projects/:id/assets`
strips EXIF *before* it hashes, so an image's id is never the sha of the file you
sent. The scrub is **deterministic** — every tier given the same original returns the
same id, proven across the install, the second tier and prod — but **not idempotent**:
feed a tier the already-scrubbed bytes and it scrubs them again into a different id.
Upload the ORIGINAL everywhere and read the id out of `response.asset.id`.

**Two things found only by looking.** The record was **silent on prod** — the six m4a
listening copies had never been uploaded there, so the page fell back to a relative
path that resolves to nothing inside a srcdoc frame. And at 390px the **unmute button
was unreachable**: the 44px touch target pushed the now-playing toast's contents to
284px inside a box capped at 233px, and the button was what overflowed and got
clipped. The track title yields the width now.

**The page loads nothing from anyone else's server.** Rebuilding from the master had
silently reverted the offline lane's `/vendor/three@0.160.0/three.min.js` back to
cdnjs — the standing hazard of a master that lives outside the repo. Fixed, and Syne
and DM Mono now ride in the document as data URIs, which closes the last item the
09-06 festival inventory had open for this page. Verified as a guest on prod at
1440×900 DPR2 and 390×844 DPR3: zero external hosts, zero console errors.

### What this session got wrong, and it cost a deploy

`fix/dev-tier-mark` went onto `dev` by **direct push** rather than through a PR,
carrying an unlanded session note. Twenty minutes later a peer session promoted
dev → main on the owner's word, the note rode along, main's docs gate fired, and
build-and-push and deploy were **skipped** — production served the previous build for
half an hour and the run still looked green unless you read it. The branch accepting a
push is not the same as the required checks having run. A BEHIND PR only needs
`origin/dev` merged INTO the branch; that is what `feedback-batch-land-behind-prs`
actually describes, and reading it as licence to fold onto dev is how this happened.
