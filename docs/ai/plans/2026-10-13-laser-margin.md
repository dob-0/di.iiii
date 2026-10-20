# Laser margin over the dance zone — MOXIR v2.8 matrix (2026-10-13)

Planning measurement, **not a safety sign-off**. Every laser stays dark at the desk (`deskLookValues.js` `laserHeld`)
until the person named under "Who signs" signs the sheet below.

## What was run

```bash
python3 -I scripts/place/laser_margin.py          # the table below
python3 -I scripts/place/laser_margin.py --json   # the same, machine-readable
npx vitest run scripts/place/laser-margin.test.js # 3 tests: a hand-checked synthetic room + this rig vs a plain-JS re-derivation
```

- Rig: `scripts/place/rigs/moxir-v2-8-matrix-2026-10-13.json` — every fixture with a `laser` block, status `used`, every
  beam not `off`: 36 comb lines (six EXT-LC-ULTRA-MK2 on the far crane girder, y 8.81, z −42.45 → entry wall y 9.65,
  z 53.8) + 2 UP-LA40WF (y 7.0, z 53.3 → roof bottom chords y 10.3, z −14.04). **38 lines.**
- Zone: hall record `scripts/place/rigs/moxir-hall-2026-10-11-v11-show-park-far41.hall.json`, `dims.zones.dance.used`
  = x −11.0…3.5, z 8.2…28.0 (barrier to FOH riser).
- Standing surfaces: the floor (y 0), every `dims.massing` item that stands on the ground, the rig's own solids
  (crowd barrier 1.1 m, PA placeholders; outside-ground boxes excluded). Ray: straight down from samples every 0.05 m
  along each line's stretch over the zone, `occlusion_lib.Obstacles.cast` (Möller–Trumbore) on triangles built from those
  boxes. Only the pendant-lamp envelopes (hanging, y 9.5–10.6) overlap the zone in plan; nothing on the ground does.
- Tilted case: each line rotated **down** by its tube's `half_fan_deg` (rig `lasers.tubes`: 1.008° for the cubes, 0 for
  the UP-LA40WF) about its source — the line pointed as low as the controller zone + mount tolerance allow.

## Result

**All 38 lines cross the dance zone; all 38 stay ≥ 3 m above every standing surface, nominal and tilted.**

- Worst nominal: **8.11 m** (line 41/42, UP-LA40WF, over the crowd barrier at z 8.2) → **margin +5.11 m** over 3 m.
  Over the open floor the same lines are 8.24 m (at z 28, the FOH end).
- Worst tilted by the half-fan: **7.26 m** (every comb line, over the barrier at z 8.2) → **margin +4.26 m**.
- Comb lines over open floor: 9.25 m (z 8.2) rising to 9.42 m (z 28).
- Against the owner's stricter hand rule (5.4 m, `moxir_v2_7_lines.py`): all 38 pass nominal and tilted.
- No line passes through a pendant-lamp **envelope** (a box from `dims.massing`, not the lamp geometry — a flag only;
  the GLB strike check stays UNVALIDATED here, see "Assumed").

| line | fixture | in zone m | lowest over floor m | at (x, y, z) | margin vs 3 m | tilted by half-fan: lowest / margin m | strike on hanging envelope |
|---|---|---:|---:|---|---:|---:|---|
| 1a | rig-lasercube-cut-01 | 19.8 | 8.15 | -9.38, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 1b | rig-lasercube-cut-01 | 19.8 | 8.15 | -8.48, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 1c | rig-lasercube-cut-01 | 19.8 | 8.15 | -7.58, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 1d | rig-lasercube-cut-01 | 19.8 | 8.15 | -6.68, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 1e | rig-lasercube-cut-01 | 19.8 | 8.15 | -5.77, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 1f | rig-lasercube-cut-01 | 19.9 | 8.15 | -4.87, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 2a | rig-lasercube-cut-02 | 19.8 | 8.15 | -8.57, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 2b | rig-lasercube-cut-02 | 19.8 | 8.15 | -7.67, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 2c | rig-lasercube-cut-02 | 19.8 | 8.15 | -6.77, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 2d | rig-lasercube-cut-02 | 19.8 | 8.15 | -5.86, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 2e | rig-lasercube-cut-02 | 19.8 | 8.15 | -4.96, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 2f | rig-lasercube-cut-02 | 19.8 | 8.15 | -4.06, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 5a | rig-lasercube-cut-03 | 19.8 | 8.15 | -6.13, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 5b | rig-lasercube-cut-03 | 19.8 | 8.15 | -5.23, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 5c | rig-lasercube-cut-03 | 19.8 | 8.15 | -4.33, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 5d | rig-lasercube-cut-03 | 19.8 | 8.15 | -3.42, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 5e | rig-lasercube-cut-03 | 19.8 | 8.15 | -2.52, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 5f | rig-lasercube-cut-03 | 19.8 | 8.15 | -1.62, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 3a | rig-lasercube-cut-04 | 19.8 | 8.15 | -7.76, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 3b | rig-lasercube-cut-04 | 19.8 | 8.15 | -6.85, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 3c | rig-lasercube-cut-04 | 19.8 | 8.15 | -5.95, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 3d | rig-lasercube-cut-04 | 19.8 | 8.15 | -5.05, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 3e | rig-lasercube-cut-04 | 19.8 | 8.15 | -4.15, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 3f | rig-lasercube-cut-04 | 19.8 | 8.15 | -3.25, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 4a | rig-lasercube-cut-05 | 19.8 | 8.15 | -6.94, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 4b | rig-lasercube-cut-05 | 19.8 | 8.15 | -6.04, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 4c | rig-lasercube-cut-05 | 19.8 | 8.15 | -5.14, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 4d | rig-lasercube-cut-05 | 19.8 | 8.15 | -4.24, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 4e | rig-lasercube-cut-05 | 19.8 | 8.15 | -3.34, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 4f | rig-lasercube-cut-05 | 19.8 | 8.15 | -2.43, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 6a | rig-lasercube-cut-06 | 19.9 | 8.15 | -5.32, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 6b | rig-lasercube-cut-06 | 19.8 | 8.15 | -4.42, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 6c | rig-lasercube-cut-06 | 19.8 | 8.15 | -3.51, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 6d | rig-lasercube-cut-06 | 19.8 | 8.15 | -2.61, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 6e | rig-lasercube-cut-06 | 19.8 | 8.15 | -1.71, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 6f | rig-lasercube-cut-06 | 19.8 | 8.15 | -0.81, 9.25, 8.20 | +5.15 | 7.26 / +4.26 (1.008 deg) |  |
| 41 | rig-laser40-1 | 19.9 | 8.11 | 0.69, 9.21, 8.20 | +5.11 | 8.11 / +5.11 (0.000 deg) |  |
| 42 | rig-laser40-2 | 20.5 | 8.11 | -7.88, 9.21, 8.20 | +5.11 | 8.11 / +5.11 (0.000 deg) |  |

## The 3 m figure — where it comes from

- **Quoted (fetched 2026-10-13):** Arizona Administrative Code R9-7-1441, subsection L (Laser Light Shows and
  Demonstrations): "A registrant shall prevent laser radiation levels from exceeding the applicable Class 2 accessible
  emission limit at any point less than three meters above any surface upon which an individual in the audience is
  permitted to stand and 2.5 meters in lateral separation from any position where an individual in the audience is
  permitted, unless physical barriers are present that prevent human access to the radiation."
  (https://law.cornell.edu/regulations/arizona/Ariz-Admin-Code-SS-R9-7-1441). A US state rule: it is the quotable
  wording of the figure, **not** the rule that governs this venue.
- lasershowsafety.info's FAQ (secondary) attributes the same 3 m / 2.5 m to US federal (FDA/CDRH) laser-show variance
  conditions; the variance condition number was not quoted from a primary source — **UNVERIFIED**.
- **IEC TR 60825-3** (laser display guidance), **HSE HS(G)95** and the **ILDA** audience guidance are what the repo's earlier
  passes cite for the same 3.0 m / 2.5 m (`moxir_entry_lasers.py`, `moxir_v2_cranes.py`). No clause or page could be quoted
  in this session (the IEC text is paywalled) — **UNVERIFIED**. No clause number is given here on purpose.
- The national rule for the venue's country was not identified — **UNVERIFIED**, the signer supplies it.

## What is assumed (not measured)

1. The rig file is what will hang: fixture positions and aim points are the design's, not a survey of the rigged units.
2. The hall record's zone and massing are the room: the dance floor is flat at y 0; no stage, riser or furniture inside
   the zone other than the crowd barrier (1.1 m, treated as a standing surface — conservative).
3. The tilted case covers aim error **only** as `half_fan_deg` downward about the source; mount sag, crane girder
   deflection and a crane moving are not modelled. The far crane must be parked and locked at the rigged position.
4. Lateral 2.5 m separation is **not** checked here: these lines run over the audience, so the vertical figure governs
   over the zone. The beams' end stops (`ends_on` in the rig) are the rig's own claim, not re-checked here.
5. Lamp/crane strikes along each line: envelope boxes only. The full hall GLB (`/mnt/data/...`, not in git) was not
   available to this run — strikes stay **UNVALIDATED** as the rig's own `checks` already say.
6. People do not climb onto anything inside the zone higher than the barrier (no lifts, no shoulders above a raised hand
   — the 5.4 m hand rule covers a raised hand at 2.4 m; anyone carried higher is ASSUMED excluded by stewarding).
7. Power/MPE/NOHD: not re-derived here. Earlier passes (lasers_v2.py, moxir_v2_cranes.py) give a NOHD of hundreds of
   metres for a static beam: **separation is the control, not output power**, so a scan-fail must not drop a beam.

---

## Sign-off draft — laser audience separation, MOXIR dance zone (one page)

**Event / venue:** MOXIR hall, dance zone x −11.0…3.5 m, z 8.2…28.0 m (hall frame).
**Rig:** `moxir-v2-8-matrix-2026-10-13.json`, 38 lines (6 × EXT-LC-ULTRA-MK2 × 6 lines, 2 × UP-LA40WF).

**Measured (by `scripts/place/laser_margin.py`, from the design records):**
- [ ] Lowest line over a standing surface in the zone: 8.11 m (nominal), 7.26 m (aimed low by the 1.008° controller zone).
- [ ] Margin over the 3.0 m audience separation: +5.11 m nominal, +4.26 m worst case.
- [ ] Every line ends on a stop outside the zone (entry wall ≥ 9.0 m; roof bottom chords) — from the rig, not re-measured.

**To confirm on site, before any emission (each initialled):**
- [ ] Each projector's mounted height and position measured with a laser rangefinder; within 0.1 m of the rig file.
- [ ] Each line's height measured at the barrier (z 8.2) and at FOH (z 28) with a target card on a pole; ≥ 3.0 m
      (the plan expects 9.2–9.4 m for the comb, 8.2–9.2 m for the UP-LA40WF).
- [ ] Controller zones / masks set and locked so no line can be aimed below the measured heights; scan-fail
      (blanking on scanner failure) tested on every projector.
- [ ] Far crane parked, isolated and locked out for the show; nothing in the zone above the barrier (no lifts, stages).
- [ ] E-stop within reach of the operator, tested; a named operator at the desk for the whole emission time.
- [ ] Applicable national rule / variance identified and its clause recorded here: ______________________ (UNVERIFIED in the plan).

**Who signs:**
- Laser Safety Officer (competent person for laser display, per the national rule): name ______ signature ______ date ______
- Laser operator for the show: name ______ signature ______ date ______
- Venue / event safety manager (accepts the separation and the crane lock-out): name ______ signature ______ date ______
- Rigger responsible for the crane mounts (structural): name ______ signature ______ date ______

Until all four sign, `laserSignedOff` stays false and the desk holds every laser channel at 0. di's measurement is an
input to this sheet; it does not sign anything.


## Reconciled with dev (2026-10-20)
- The 3 m figure is read from `scripts/place/laser-distance.mjs` (`LASER_MIN_HEIGHT_M`, dev's one source, #900); the script has no second copy and fails loudly if the export moves. `--rig` and `--hall` are now required (no production file name as a default).
- First surface: a beam is measured only up to the first floor, ground solid or `dims.shell` slab it meets. A hall record with no `dims.shell` reports `shell_modelled: false` and stays UNVALIDATED (the line is then measured to its stored end, the longer and more conservative stretch). The MOXIR hall record has no `dims.shell` yet: owed, so walls and roof are not checked for it.
- A sample with nothing below it now fails the line instead of being skipped.
- Standard: none validated. IEC TR 60825-3, HSG95 and ILDA are named in repo notes with clause numbers unverified; this is a geometry check, not a safety assessment.
- `physics_check.py` checks lamps and beams of a rig against the hall GLB and does not apply to this tool's synthetic fixtures; not run.
- Safety tool: not used in a show until the owner has looked.
