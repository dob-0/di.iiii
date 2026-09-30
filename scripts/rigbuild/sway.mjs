#!/usr/bin/env node
/**
 * sway.mjs — the SWAY RULE for moving heads on a chain-hung line (the cut, RIG_BUILD.md §15.8).
 *
 *   node scripts/rigbuild/sway.mjs --rig scripts/place/rigs/moxir-2026-10-17-minimal-cut-movers.json \
 *       --show scripts/place/rigs/moxir-2026-10-17-minimal-cut-movers.show.json
 *
 * Owner, 2026-09-29: moving heads may make the chain-hung truss swing. The rig file's
 * `truss.motion` (derived by versions.mjs from the hang: T = 2π√(L/g) per pick) says:
 *   - a cue that MOVES a head standing on or hung under the line must fade in `min_move_s`
 *     or more (a head's move is its fade on the desk) — the loop wraps, so the first cue
 *     is checked against the last;
 *   - no look may carry a periodic pan/tilt effect (none of ours do: a look is a held
 *     state) — a desk FX on pan/tilt with a period inside `avoid_periodic_s` is refused on
 *     the console by hand; this script names the band so the crew sheet can print it.
 * Exit 1 with every breach named; pure `swayBreaches` for the tests.
 */
import path from 'node:path'

import { parseArgs, die, say, readJson } from '../place/common.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { fileURLToPath } from 'node:url'

const ON_LINE = new Set(['truss-top', 'truss-header'])

/** The groups whose heads move and sit on the line (a class with pan/tilt). */
export const headsOnLine = (rig, types) => rig.groups.filter((g) => ON_LINE.has(g.mount) && types.find((t) => t.code === rig.classes[g.class].code)?.pan_tilt_deg)

/** Every cue that moves a head on the line faster than the rule allows. Pure. */
export const swayBreaches = ({ rig, show, types }) => {
    const motion = rig.truss?.motion
    if (!motion) return []
    const heads = headsOnLine(rig, types)
    const out = []
    const cues = show.cues
    cues.forEach((cue, i) => {
        const prev = cues[(i - 1 + cues.length) % cues.length]
        if (i === 0 && show.loop === false) return
        for (const g of heads) {
            const a = JSON.stringify(rig.looks[prev.look]?.aims?.[g.id] ?? null)
            const b = JSON.stringify(rig.looks[cue.look]?.aims?.[g.id] ?? null)
            // `solo` changes who is lit, not where anyone points
            const bare = (s) => s.replace(/,?"solo":\d+/, '')
            if (bare(a) !== bare(b) && cue.fade < motion.min_move_s) {
                out.push(`${cue.name} (${cue.look}): moves ${g.id} (${bare(a)} → ${bare(b)}) in a ${cue.fade} s fade — the line's heads move in ${motion.min_move_s} s or more`)
            }
        }
    })
    return out
}

const main = () => {
    const args = parseArgs()
    const rig = readJson(path.resolve(String(args.rig || die('needs --rig <rig file>'))))
    const show = readJson(path.resolve(String(args.show || die('needs --show <show file>'))))
    const types = readJson(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/rigbuild/types/moxir.json')).types
    const m = rig.truss?.motion
    if (!m) { say(`${rig.rig}: not a chain-hung line with motion limits — nothing to check`); return }
    const heads = headsOnLine(rig, types)
    say(`${rig.rig}: natural periods ${m.periods_s.join('–')} s; heads on the line: ${heads.map((g) => `${g.id} ×${g.count}`).join(', ') || 'none'}; moves ≥ ${m.min_move_s} s; no periodic pan/tilt between ${m.avoid_periodic_s.join(' and ')} s`)
    const bad = swayBreaches({ rig, show, types })
    for (const b of bad) say(`  BREACH ${b}`)
    if (bad.length) process.exit(1)
    say('  every cue keeps the rule')
}

if (isMainModule(import.meta.url)) main()
