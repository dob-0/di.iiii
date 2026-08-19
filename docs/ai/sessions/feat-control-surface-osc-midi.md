# feat/control-surface-osc-midi

## 2026-07-21 — TouchOSC-style control surface: control nodes + OSC/MIDI egress

- Performable control nodes `control.fader` / `control.xy` / `control.button`
  with playable card widgets; pure clamp evaluators in `nodeGraphRuntime.js`.
- Real egress for `device.osc.out` / `device.midi.out` (were `authoringOnly`):
  `useDeviceEgress` hook diffs egress-node inputs per document change — MIDI via
  Web MIDI (browser → IAC → Ableton), OSC via socket.io `control-value` →
  serverXR `oscOutput.js` (zero-dep UDP + hand-rolled OSC encoder, gated by
  `OSC_OUTPUT_ENABLED`, private-range targets unless `OSC_ALLOW_ANY_HOST`).
- Live-verified OSC end-to-end (UDP listener got `/fader1 ,f 0.42`; public-host
  target correctly dropped). Wiki article `control-surface-osc-midi`.
- Still genuinely undone: widgets never live-clicked in a real browser;
  TouchDesigner + Ableton hookup never exercised by a human.

## 2026-08-19 — synced a month of dev; Seed→Raw port

- Committed the July work (it had sat uncommitted, the only copy local), pushed
  the branch, merged `dev` (442 commits) into it.
- Ported for the Seed→Raw rename: widgets now `src/raw/components/nodeControls/`
  (`seed-control-*` → `raw-control-*`), `CONTROL_WIDGETS` in `RawGraphSurface`
  (widget height is part of card geometry at every LOD tier; widgets render at
  full/compact and stay inert in Studio's read-only wrap), `useDeviceEgress`
  mounted in `RawEditor`, `onChangeNodeValues` threaded through.
- control.* joined `FAMILY_BY_TYPE` under `numbers`; added to the all-nodes
  example graph; palette family-count test updated (15 → 18); node-anatomy
  manifest regenerated; wiki article re-worded Seed → Raw.
- serverXR merge kept both sides: OSC egress config AND upstream's
  approval-gate + token-version socket options.
