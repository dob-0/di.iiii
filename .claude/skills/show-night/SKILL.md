---
name: show-night
description: Run a production's show night on its place's machine from load-in to get-out — the venue profile, `di show go` at load-in, at doors minus 60 min and after every change, the freeze while the show runs, the laser and crew drills, and the get-out. Use for any show night with lights, a laser or a MIDI controller, at any place.
---

# show-night

**Needs:** the venue profile of the place (`di show profile --venue <id>`; until the owner confirms it, GO stays NO-GO by design), `di show` on the operator's machine, ssh to the show machine as its own user, the crew desk (`crew-channel`). Rule sources (owner's hard rules): "Checkpoint before every show change" 2026-10-17, "Seen on the real surface", "Lights and laser are one scene" 2026-10-31, "Nothing is left behind" 2026-10-13, "Work sterile" 2026-10-12. Method: ILDA's per-show checklist with its four phases (setup, alignment, testing, performance) and a laser safety officer; the Google SRE launch checklist (failure-mode questions answered with evidence). Every place and production is an example, never a default. Words: `docs/ai/vocabulary.md`.

## Before the day
- The profile: every `toConfirm` item answered by the owner, then `confirmed: { "by", "at" }` written through a PR.
- `di show mark <id>` run once ON the show machine (part of its provisioning, slice S14).
- The crew: onboarding the day before (`crew-channel` 4); the production's PACE line written (`crew-channel` 3).
- Show mode (gap G03) is the owner's decision: until his word for this production exists, quiet hours and the midnight window rule stand.

## Load-in
1. Rig up; cables per the port plan in the profile. `di show go --venue <id> --look` names any device on the wrong port, driver or speed.
2. Laser: the laser safety officer walks the zone; the E-stop drill (S12), its stop path recorded.
3. Thermal test: all desks open, the laser armed, `di show go --venue <id> --soak 600` (10 min). The slope it prints is the first data for a soak limit: write it into the profile by a PR.
4. `di show go --venue <id> --why "load-in"`: GO, or each `!!` line fixed and GO run again. During the soak the crew moves one fader on the MIDI controller: MIDI must be heard, a device count is not a pass.
5. The PACE drill with the crew (`crew-channel` 3).

## Doors minus 60 min
`di show go --venue <id> --why "doors-60"`. GO is the go; a NO-GO goes to the owner in one line with its `!!` lines. From here the freeze holds.

## Show: the freeze
- Changes only under the show-live rule (S10): UI-only overlays with green tests on the exact merge, a checkpoint first (`show-checkpoint`), `di show go` after. Lights and laser change together, from one palette (rule 2026-10-31).
- Every change: checkpoint, one line to the owner with its undo, his yes, the change, GO. A NO-GO after a change: restore first.
- The watch (S11) runs; its alerts and the crew's lines reach the crew desk, not the lead chat.

## Get-out
1. `di show checkpoint --venue <id> "get-out"`: the night's end state.
2. `job-end-gate`, with 2b (the night's scratch scripts kept) and 5b (every LESSON or SLIP row with proof or an owner).
3. Sterile: test browsers, stacks and lanes down; nothing of the job still running on the show machine.
4. The review: GO times, every NO-GO line and its fix, the soak slope, the cost.

## Not validated, stated
The 60 s soak and the 10 min thermal test are our numbers. `di show go` has not yet been seen on a real stage machine: the owner sees GO once there, in daylight, before it is called working.
