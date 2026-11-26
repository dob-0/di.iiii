## 2026-11-26 — show-scenes-job gets "mood palette first" and "looks are rules, mirrored" (Reika lesson N6945)

- The Reika looks v3 and v8 were pushed to mint, jade, orchid and tinted whites by a "0.10 OKLab from stock colours" rule; the owner said the scenes were too colourful (N6938). Trap 10 in `docs/ai/skills/show-scenes-job.md` (and rule 8 in the rules file) now start a palette from the mood words as one colour family with explicit values, and limit a distance rule to the reference looks.
- Trap 11 / rule 9 (owner N6949): one logic line per look, mirrored about the rig axis, poses from one room-terms preset file.
- Before/after: 9 hue families over 27 looks in the v3 suite versus 1 in the v4 brief, counted by the new `scripts/place/count_hue_families.py`.
