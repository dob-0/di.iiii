# Inbox — parked ideas

Owned by the Producer role (`docs/ai/roles/producer.md`). Mid-task user impulses land
here verbatim + translated, instead of mixing into the running work. Reviewed at
session end; picked items become normal scoped tasks. Newest on top.

---

## 2026-09-28 · first-run-owner-and-send-work
**raw:** "yes and also what i tought we need to admin or 1st usage pswd where when you
install it will create psd if you work local and want to keep files and workflow and after
if needed push it to yours or new so think about that"
**translation:** A fresh install should have an owner from its first minute, and local
work should be able to leave the machine later. Three parts, in this order:
(1) **first-run owner setup**: on first start with no owner, the server makes the first
account the admin. It is claimed only from the machine itself (loopback) or with a
one-time setup code printed in the server log, the pattern Jenkins, Grafana and Home
Assistant use, so nobody on the same wifi can claim it first. It replaces today's
`DI_LOCAL=1` "owner at the machine" shortcut (`serverXR/src/localOwner.js`) for any install
reachable over a network. (2) **connect an identity later**: the owner links Google or
GitHub through the sign-in hub (`docs/architecture/AUTH_HUB.md`) when online; the local
password keeps working offline. (3) **send this space to…**: push a local space (files,
workflow, history) to diiii.xyz, dev, or another di.iiii the owner has an account on,
built on the existing bundle and tier-sync tools, not a new format.
**route:** BAE (owner setup, account linking) → SEC review (setup code, loopback check) →
BAE + SPE (send-to, op-log upstream) · **size:** M (1) / S (2) / L (3)
**status:** parked. Start after the hub's dev rehearsal (#636), unless the owner says sooner.

## 2026-07-19 · sound-in-spaces
**raw:** "i have idea: add sound to spaces"
**translation:** Spaces are currently silent; give creators audio as a first-class
scene material. Most plausible shape, in ascending ambition: (1) per-space ambient/
background track (upload an audio asset, loops, volume control, plays on entry after
a user gesture — browser autoplay policy requires one); (2) positional audio attached
to scene objects (Three.js PositionalAudio — sound gets nearer/farther as you walk,
huge for presence in XR and for the rite/exhibition spaces); (3) later: audio in the
node graph as a node type. Asset pipeline already handles uploads, so (1) rides
existing rails. Testable outcome: a visitor entering a published space hears its
sound, and it respects mute/volume.
**route:** XRC defines the what/why (entry moment, comfort, per-space defaults) →
VPE implements (Three.js audio, autoplay-gesture gating) · BAE only if a new asset
type needs server work · **size:** M (phase 1) / L (with positional)
**status:** shape (2) DELIVERED 2026-08-07 for video, on the user asking for it
directly while arranging the WCC exhibition ("theres videos i want sound also play
when your going close"). A video's own audio track now routes through a
PositionalAudio at the video's position (`media.spatial`/`distance`/`maxDistance`,
opt-in per video, default off so no existing space changes). Audio *entities* already
had positional sound; video was the gap. Measured in-browser: gain 1.0 at 3.9m,
0.24 at 13m. Note for whoever picks up the rest: past `maxDistance` the inverse
distance model FLOORS at ~10% rather than reaching silence, so a room with many
videos accumulates a murmur — a selectable `linear` falloff would fix it and is not
done. Shapes (1) per-space ambient track and (3) audio-as-node-type remain parked.

## 2026-07-19 · lane-naming-simplify
**raw:** "we have the 4 names dev main staging prod lets merge them and take simple way"
**translation:** Reduce the branch/environment vocabulary confusion. Resolved same
session the lightweight way: one canonical two-line lane map added to README /
CURRENT.md / AGENTS.md (`7753699c`) instead of renaming branches.
**route:** DOC · **size:** S
**status:** picked → 2026-07-19 (shipped as docs IA fix)
