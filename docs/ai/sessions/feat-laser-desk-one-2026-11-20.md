## 2026-11-20 — the laser desk, one version: dev's Grid desk plus the bar desk (PR #1218)

- PR #1218's work (64 shapes, layers, an LFO on every slider, Send to per laser, audio and tempo controls, mapping, brightness) merged into today's dev with 35 conflict hunks resolved by hand; dev's Grid layout stays the default and the bar's Classic layout stays as a mode.
- Stream pacing follows dev's lead time; the bar's cushion name is kept as an alias with its stream record. The sign-off switch that fails closed was carried over from the laser-arm branch.
- Not done: the Grid styling for the new Preview pane, Layers, Beam and Send to panels; pictures at real screen sizes; the laser tests were started on work-laptop but the result was not read. This branch is a draft until those are done.

## Update 2026-11-20 (UI pass)
- 5 desk-UI tests fixed at the cause (Brightness slider in the placement helper; Layers/Beam order; Emilya's 3-column Classic base; stored sets keep fields and gain engine defaults). Details: agent-reports-2026-11-20/laser-ui.md.
- Grid CSS for Preview (rail row 5), Layers, Beam, LFO "~", music controls; Classic untouched. Headless pictures at 1536x800/864, 1280x700/770, 864x1536, 390x844; fit 0 issues.
- laser-gaps b2b947640/b554c8523 not ported: scene texts elided 0 at three sizes on the new layout.
- Tests on work-laptop: eslint 0 errors (1 old warning), vitest serverXR/src/laser + laserShutdownContracts 26 files / 532 tests pass.
