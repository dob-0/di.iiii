#!/usr/bin/env node
// Overlap check for the 3D Monitor map: projects every card/label for the camera presets and counts overlaps
// (labels, tools, hint). Usage: node scripts/monitor/map-overlap.mjs [--nodes 65] [--width 1100] [--height 600] [--json]
// Exit 1 when the planned labels overlap anything. Pure maths, no browser.
import { layoutMap } from '../../src/components/preferences/monitorMapLayout.js'
import { demoMap } from '../../src/components/preferences/monitorMapDemo.js'
import { measurePreset } from '../../src/components/preferences/monitorMapOverlap.js'
import { PRESET_NAMES } from '../../src/components/preferences/monitorMapCamera.js'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d }
const size = { width: arg('width', 1100), height: arg('height', 600) }
const layout = layoutMap(demoMap(arg('nodes', 65)))
const rows = ['fit', ...PRESET_NAMES].map((p) => measurePreset(layout, p, size))
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2))
else {
  console.log(`map overlap check: ${layout.nodes.length} nodes, stage ${size.width}x${size.height}`)
  console.log('preset  | old rule at fit: named/overlaps | old rule close: named/overlaps | new: shown/hidden/overlaps')
  for (const r of rows) console.log(`${r.preset.padEnd(7)} | ${String(r.before.named_at_fit).padStart(3)} / ${String(r.before.overlaps_at_fit).padStart(3)} | ${String(r.before.named_close).padStart(3)} / ${String(r.before.overlaps_close).padStart(4)} | ${String(r.after.shown).padStart(3)} / ${String(r.after.hidden).padStart(3)} / ${r.after.overlaps}`)
}
process.exit(rows.some((r) => r.after.overlaps > 0) ? 1 : 0)
