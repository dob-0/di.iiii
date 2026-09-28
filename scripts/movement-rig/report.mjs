#!/usr/bin/env node
/**
 * report.mjs — results.json → report.md, and evidence frames → contact sheets.
 *
 *   node scripts/movement-rig/report.mjs <before/results.json> <after/results.json> [--out compare.md]
 * prints a before/after table of every headline number.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o)

// [label, path under rooms.<room>, unit, what "good" looks like for walking a venue]
export const HEADLINES = [
    ['look: deg per count', 'desktop.look.gain.degPerCount', '°', 'reference only'],
    ['look: cm/360 @ 800 DPI', 'desktop.look.gain.cmPer360', 'cm', 'CS2 1.0 = 52 cm; most players 25–60'],
    ['look: CS2/Apex sens equivalent', 'desktop.look.gain.sourceSens', '', 'most players 0.8–2.5 @800'],
    ['look: trusted CDP path deg/count', 'desktop.look.trusted.degPerCount', '°', '= DOM path'],
    ['look: linearity 200 counts in 1 event', 'desktop.look.linearity.1x200.ratio', '×', '1.000'],
    ['look: linearity 200 counts as 40×5', 'desktop.look.linearity.40x5.ratio', '×', '1.000'],
    ['look: linearity 200 counts as 100×2', 'desktop.look.linearity.100x2.ratio', '×', '1.000'],
    ['look: dead after click-to-look', 'desktop.look.lookDeadAfterEngageMs', 'ms', '0'],
    ['look: turn lost of 600 counts sent right after the click', 'desktop.look.lookLostAfterEngageDeg', '°', '0'],
    ['look: slow sweep (2 counts/frame) turned', 'desktop.look.slowSweep.fractionTurned', '×', '1.000'],
    ['look: pointer lock survives slow sweep', 'desktop.look.slowSweep.lockedAfter', '', 'true'],
    ['look: frames to settle after one move', 'desktop.look.settleFrames', 'frames', '1 = no smoothing'],
    ['look: input → frame p50', 'desktop.look.trusted.latencyP50ms', 'ms', '≤ 1 frame'],
    ['look: pitch limit up / down', null, '°', '±85–89'],
    ['look: drag-look deg per px', 'desktop.look.dragLookDegPerPx', '°', ''],
    ['look: wheel turn deg per px', 'desktop.look.wheelTurnDegPerPx', '°', ''],
    ['look: wheel dolly m per px', 'desktop.look.wheelDollyMPerPx', 'm', ''],
    ['move: walk top speed', 'desktop.move.forward.vmax', 'm/s', 'brisk walk 1.4–2, jog 3–4'],
    ['move: time to 90% speed', 'desktop.move.forward.t90ms', 'ms', ''],
    ['move: ramp shape t50/t90', 'desktop.move.forward.rampShape', '', 'linear 0.56, eased 0.30'],
    ['move: stop time', 'desktop.move.forward.stopMs', 'ms', ''],
    ['move: stop distance', 'desktop.move.forward.stopDistM', 'm', ''],
    ['move: drift after rest', 'desktop.move.forward.driftAfterRestM', 'm', '0'],
    ['move: head bob peak-to-peak', 'desktop.move.forward.bobP2pCm', 'cm', ''],
    ['move: head bob rate', 'desktop.move.forward.bobHz', 'Hz', 'step rate ≈ 1.8–2'],
    ['move: strafe top speed', 'desktop.move.strafe.vmax', 'm/s', ''],
    ['move: strafe per-frame step CV (judder)', 'desktop.move.strafe.stepCvPct', '%', ''],
    ['move: diagonal / straight speed', 'desktop.move.diagonalOverStraight', '×', '1.000'],
    ['move: back top speed', 'desktop.move.back.vmax', 'm/s', ''],
    ['move: walked through a solid (m past its face)', 'desktop.move.solid.passedThroughM', 'm', '0 (stops at it)'],
    ['move: arrow-key turn rate', 'desktop.move.arrowTurn.degPerSec', '°/s', ''],
    ['move: key → first moved frame p50', 'desktop.move.keyLatency.p50ms', 'ms', '≤ 1 frame'],
    ['move: 90° turn while walking, min speed', 'desktop.move.turnWhileWalking.minSpeedDuringTurn', 'm/s', ''],
    ['move: 90° turn, heading vs travel max', 'desktop.move.turnWhileWalking.maxHeadingVsTravelDeg', '°', ''],
    ['fly: climb rate', 'desktop.fly.up.vmax', 'm/s', ''],
    ['fly: climb t90', 'desktop.fly.up.t90ms', 'ms', ''],
    ['fly: vertical stop time', 'desktop.fly.up.stopMs', 'ms', ''],
    ['fly: descend rate', 'desktop.fly.down.vmax', 'm/s', ''],
    ['fly: lowest camera after 3 s of "down"', 'desktop.fly.lowestCameraM', 'm', '≥ 0 (floor)'],
    ['fly: horizontal speed', 'desktop.fly.flyForward.vmax', 'm/s', ''],
    ['fly: leave fly in the air → back to eye height', 'desktop.fly.leaveFlyInAir.backToEyeMs', 'ms', ''],
    ['fly: leave fly in the air → max descent', 'desktop.fly.leaveFlyInAir.maxDescentMps', 'm/s', ''],
    ['frames: idle fps', 'desktop.pacing.idle.fps', 'fps', ''],
    ['frames: moving p50 / p99', null, 'ms', ''],
    ['frames: moving hitches (>1.5× p50)', 'desktop.pacing.moving.hitchPct', '%', '0'],
    ['fps-independence: top speed native / 30fps / CPU×4', null, 'm/s', 'equal'],
    ['fps-independence: stop distance native / 30fps / CPU×4', null, 'm', 'equal'],
    ['fps-independence: 3 s travel native / 30fps / CPU×4', null, 'm', 'equal'],
    ['phone: joystick top speed', 'phone.joystickForward.vmax', 'm/s', ''],
    ['phone: joystick t90 / stop', null, 'ms', ''],
    ['phone: touch look deg per screen width', 'phone.touchLookDegPerScreenWidth', '°', ''],
    ['phone: joystick sideways turns at', 'phone.joystickSidewaysDegPerSec', '°/s', ''],
    ['phone: Ascend climb rate', 'phone.ascendButton.climbMps', 'm/s', '']
]

const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'number' ? String(v) : String(v))

export function headlineValue(room, [label, p]) {
    if (p) return fmt(get(room, p))
    if (label.startsWith('look: pitch')) return `${fmt(get(room, 'desktop.look.pitchLimitDeg.up'))} / ${fmt(get(room, 'desktop.look.pitchLimitDeg.down'))}`
    if (label.startsWith('frames: moving p50')) return `${fmt(get(room, 'desktop.pacing.moving.p50'))} / ${fmt(get(room, 'desktop.pacing.moving.p99'))}`
    if (label.startsWith('phone: joystick t90')) return `${fmt(get(room, 'phone.joystickForward.t90ms'))} / ${fmt(get(room, 'phone.joystickForward.stopMs'))}`
    const f = get(room, 'desktop.pacing.frameRateIndependence')
    const key = label.includes('top speed') ? 'vmax' : label.includes('stop distance') ? 'stopDistM' : 'holdTravelM'
    if (!f) return '—'
    return `${fmt(f.native?.[key])} / ${fmt(f.spin25ms?.[key])} (${fmt(f.spin25ms?.fps)} fps) / ${fmt(f.cpuX4?.[key])}`
}

export function writeReport(results, file) {
    const roomNames = Object.keys(results.rooms)
    const lines = []
    lines.push(`# Movement rig — ${results.target.label}`, '')
    lines.push(`- target: \`${results.target.worktree}\` (${results.target.branch}@${results.target.commit})`)
    lines.push(`- when: ${results.when}; rig ${results.rig.rigCommit}; ${results.browser?.version || ''}`)
    for (const r of roomNames) {
        const e = results.rooms[r].env
        if (e) lines.push(`- ${r} desktop: ${e.w}×${e.h} CSS px @ DPR ${e.dpr} — ${e.renderer}`)
        const p = results.rooms[r].phoneEnv
        if (p) lines.push(`- ${r} phone: ${p.w}×${p.h} CSS px @ DPR ${p.dpr} (touch=${p.coarse})`)
    }
    const mline = (label, m) => `- ${label}: load ${m.loadavg?.join(' / ')} on ${m.cpus} threads, CPU package ${m.packageC ?? '?'} °C${m.busy ? ' — **BUSY: frame times are not an idle machine\'s**' : ''}`
    const M = results.machine || {}
    if (M.atStart) lines.push(mline('machine at start', M.atStart))
    for (const s of M.sessions || []) lines.push(mline(`browser session ${s.name} (waited ${Math.round(s.waitedForHeatMs / 1000)} s for heat) — before`, s.before), mline(`browser session ${s.name} — after`, s.after))
    if (results.moxirBundle) lines.push(`- MOXIR bundle sha256 \`${results.moxirBundle.sha256.slice(0, 16)}…\` (${(results.moxirBundle.bytes / 1e6).toFixed(1)} MB)`)
    lines.push('', `| measure | ${roomNames.join(' | ')} | unit | reference |`, `|---|${roomNames.map(() => '---').join('|')}|---|---|`)
    for (const h of HEADLINES) lines.push(`| ${h[0]} | ${roomNames.map((r) => headlineValue(results.rooms[r], h)).join(' | ')} | ${h[2]} | ${h[3]} |`)
    for (const r of roomNames) {
        const errs = [...new Set(results.rooms[r].errors || [])]
        if (errs.length) lines.push('', `**${r}: page errors** (${errs.length}):`, ...errs.slice(0, 8).map((e) => `- \`${e.slice(0, 200)}\``))
    }
    fs.writeFileSync(file, lines.join('\n') + '\n')
}

export function compare(a, b) {
    const rooms = [...new Set([...Object.keys(a.rooms), ...Object.keys(b.rooms)])]
    const lines = [`# Movement rig — ${a.target.label} → ${b.target.label}`, '']
    for (const r of rooms) {
        lines.push(`## ${r}`, '', `| measure | ${a.target.label} | ${b.target.label} | unit |`, '|---|---|---|---|')
        for (const h of HEADLINES) lines.push(`| ${h[0]} | ${a.rooms[r] ? headlineValue(a.rooms[r], h) : '—'} | ${b.rooms[r] ? headlineValue(b.rooms[r], h) : '—'} | ${h[2]} |`)
        lines.push('')
    }
    if (a.moxirBundle && b.moxirBundle && a.moxirBundle.sha256 !== b.moxirBundle.sha256) lines.push('**Warning:** the two runs walked DIFFERENT MOXIR bundles — pass --moxir-bundle to pin one.')
    return lines.join('\n') + '\n'
}

/** For every recorded clip: a 4×3 contact sheet and an mp4 with the real frame timing. */
export function contactSheets(eyeRoot, say = console.log) {
    if (!fs.existsSync(eyeRoot)) return
    for (const room of fs.readdirSync(eyeRoot)) {
        for (const clip of fs.readdirSync(path.join(eyeRoot, room))) {
            const dir = path.join(eyeRoot, room, clip)
            const meta = path.join(dir, 'frames.json')
            if (!fs.existsSync(meta)) continue
            const frames = JSON.parse(fs.readFileSync(meta, 'utf8'))
            if (frames.length < 2) continue
            const pick = Array.from({ length: 12 }, (_, i) => frames[Math.round((i * (frames.length - 1)) / 11)])
            const list = path.join(dir, 'sheet.txt')
            fs.writeFileSync(list, pick.map((f) => `file '${f.file}'\nduration 1`).join('\n') + `\nfile '${pick[pick.length - 1].file}'\n`)
            try {
                execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=480:-2,tile=4x3:padding=4', '-frames:v', '1', path.join(dir, 'sheet.jpg')])
                const t0 = frames[0].ts
                const cat = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, ((frames[i + 1]?.ts ?? f.ts + 1 / 60) - f.ts)).toFixed(4)}`).join('\n')
                fs.writeFileSync(path.join(dir, 'clip.txt'), cat + `\nfile '${frames[frames.length - 1].file}'\n`)
                execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'clip.txt'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-fps_mode', 'vfr', '-pix_fmt', 'yuv420p', path.join(dir, 'clip.mp4')])
                say(`  [sheet] ${room}/${clip}: ${frames.length} frames over ${(frames[frames.length - 1].ts - t0).toFixed(2)} s`)
            } catch (e) { say(`  [sheet] ${room}/${clip}: ffmpeg failed — ${e.message.split('\n')[0]}`) }
        }
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
    const outIdx = process.argv.indexOf('--out')
    if (files.length === 1) {
        const r = JSON.parse(fs.readFileSync(files[0], 'utf8'))
        const out = outIdx > -1 ? process.argv[outIdx + 1] : path.join(path.dirname(files[0]), 'report.md')
        writeReport(r, out); console.log(out)
    } else if (files.length === 2) {
        const md = compare(JSON.parse(fs.readFileSync(files[0], 'utf8')), JSON.parse(fs.readFileSync(files[1], 'utf8')))
        if (outIdx > -1) fs.writeFileSync(process.argv[outIdx + 1], md)
        process.stdout.write(md)
    } else {
        console.error('usage: report.mjs <results.json> | <before/results.json> <after/results.json> [--out file.md]')
        process.exit(1)
    }
}
