# Inbox — parked ideas

Owned by the Producer role (`docs/ai/roles/producer.md`). Mid-task user impulses land
here verbatim + translated, instead of mixing into the running work. Reviewed at
session end; picked items become normal scoped tasks. Newest on top.

---

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
