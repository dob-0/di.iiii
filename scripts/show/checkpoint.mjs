// `di show checkpoint --venue <id> "<why>"`: snapshot the running show state before any show change
// (owner's rule 2026-10-17, memory feedback_checkpoint_before_every_show_change; method: a tested
// rollback point, Google SRE book ch. 8 "Release Engineering"). Ported from di-atlas a0ffd48
// (checkpoint.sh, used for test copies 6-8 and the night of 31 Oct); the machine, paths and pack
// folder now come from the venue profile, the exit code means something and stderr is kept.
// Exit 0 = whole · 3 = partial · 1 = failed · 2 = refused (the machine is marked for another venue).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { expandHome } from './lib/profile.mjs'
import { assignments, tail } from './lib/transport.mjs'

const BODY = fs.readFileSync(new URL('./lib/checkpoint.sh', import.meta.url), 'utf8')
export const REMOTE_CACHE = '~/.cache/di-show/checkpoints'

export const stamp = (d = new Date()) => {
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const portOf = (api) => { try { return new URL(api).port || '' } catch { return '' } }

export function checkpointScript(profile, ts) {
    return `${assignments({
        TS: ts,
        DIH: profile.diHome,
        API: profile.api || '',
        DATA: profile.checkpoint.data.join(' '),
        STATES: profile.checkpoint.states.join(' '),
        PORT: profile.api ? portOf(profile.api) : '',
        CACHE: REMOTE_CACHE,
        MARKER: profile.markerPath,
        VENUE: profile.venue
    })}\n${BODY}`
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

function restoreText({ profile, ts, why, session, version, overlays, marker, unreadable }) {
    const pack = profile.packsDir ? `${profile.packsDir}/di-runtime-${version}.tar.gz` : null
    return `# ${profile.venue} checkpoint ${ts}
Why: ${why}. Taken by ${session || 'an unnamed session'}. Running version: ${version}. Overlays (PATCHES lines): ${overlays}.
Machine marker: ${marker || 'none (mark it: di show mark ' + profile.venue + ')'}. Unreadable live states: ${unreadable.length ? unreadable.join(', ') : 'none'}.
Same copy on the machine: ${REMOTE_CACHE}/${ts}/ . Lock files (.token) are never copied.
Holds: data.tgz (${profile.checkpoint.data.join(', ')} from ${profile.diHome}/data), the live states (*.json), version.txt,
release.json and PATCHES when the pack has them, server.txt, network.txt, ip.txt; manifest.json lists every file with its sha256.

## Undo the change: one command on the machine (disarm the laser first)
${pack ? `di update --from ${pack}` : `The pack of ${version} is not named by this profile (packsDir). S10's restore command reads manifest.json (owed).`}

## Only if the saved desk data went wrong
Stop di on the machine, then: tar xzf ${REMOTE_CACHE}/${ts}/data.tgz -C ${profile.diHome}/data ; then start di.

## CHECK (the measure that proves it is back)
di show go --venue ${profile.venue} --look : the bank count and every cube's state match laser-desk-api-state.json and laser-api-state.json here.
`
}

/** Runs the snapshot through `transport`; returns { code, folder, stderrTail, version }. */
export async function runCheckpoint({ profile, why, session, transport, now = () => new Date(), home }) {
    const ts = stamp(now())
    const res = await transport.run(checkpointScript(profile, ts))
    if (res.code === 2) return { code: 2, folder: null, stderrTail: tail(res.stderr, 2) }
    const folder = path.join(expandHome(profile.backupsDir, home), `${profile.venue}-checkpoint-${ts}`)
    fs.mkdirSync(folder, { recursive: true })
    const result = { code: res.code, folder, stderrTail: tail(res.stderr, 4), version: null }
    if (res.stdout.length) {
        const x = spawnSync('tar', ['xzf', '-', '-C', folder, '--strip-components=1'], { input: res.stdout })
        if (x.status !== 0) { result.code = 1; result.stderrTail = `the copy did not unpack here: ${tail(String(x.stderr))}` }
    }
    if (result.code !== 0 && result.code !== 3) {
        fs.writeFileSync(path.join(folder, 'FAILED.txt'), `exit ${result.code}\n${res.stderr}\n${result.stderrTail}\n`)
        return result
    }
    const read = (f) => { try { return fs.readFileSync(path.join(folder, f), 'utf8').trim() } catch { return '' } }
    const current = read('version.txt')
    result.version = current.split('/').filter(Boolean).at(-1) || '?'
    const unreadable = [...String(res.stderr).matchAll(/^state (\S+) unreadable/gm)].map((m) => m[1])
    const overlays = read('PATCHES') ? read('PATCHES').split('\n').length : 0
    fs.writeFileSync(path.join(folder, 'RESTORE.md'), restoreText({ profile, ts, why, session, version: result.version, overlays, marker: read('marker.txt'), unreadable }))
    const files = fs.readdirSync(folder).filter((f) => f !== 'manifest.json').sort()
        .map((f) => ({ file: f, bytes: fs.statSync(path.join(folder, f)).size, sha256: sha256(path.join(folder, f)) }))
    fs.writeFileSync(path.join(folder, 'manifest.json'), `${JSON.stringify({
        venue: profile.venue, ts, why, session: session || null, where: transport.where, current, version: result.version,
        overlays, unreadable, exit: result.code, files, profile: { file: profile.file, provenance: profile.provenance }
    }, null, 2)}\n`)
    return result
}
