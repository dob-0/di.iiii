// The version label of an install: the base version plus `+<id>` for every overlay line in the live release's
// PATCHES file (written append-only by scripts/release/target.py at each hot swap), e.g.
// 0.4.4-look.e3ca4567+ui.63d9dc1d+ui.7080f534. Derived from that log, never typed, so `di version` cannot claim
// a release the folder does not hold (audit 2026-11-01 G05: two hot swaps left `di version` saying the build before).
// installedVersion() stays the base version on purpose: update and rollback decisions compare base versions.
// The same rule lives in target.py (label_of); scripts/release/release.test.js checks that the two agree.
import fs from 'node:fs'
import path from 'node:path'
import { currentVersionDir, readState } from './state.mjs'

export const readPatches = (dir) => {
    let text
    try { text = fs.readFileSync(path.join(dir, 'PATCHES'), 'utf8') } catch { return [] }
    return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
        try { return JSON.parse(line) } catch { return { id: 'unreadable', raw: line } }
    })
}

export const versionLabel = (home) => {
    const dir = currentVersionDir(home)
    if (!dir) return null
    const base = readState(home).version || path.basename(dir)
    const overlays = readPatches(dir)
    return { base, overlays, label: base + overlays.map((o) => `+${o.id ?? '?'}`).join(''), dir }
}
