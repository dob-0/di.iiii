// `di show go --venue <id>`: the safe point before doors (owner 2026-11-01 00:2x: "make the safe point
// where the show starts; you check that moment that it can happen"). Gap G07: a GO that means GO.
// Order: one look → refuse a machine marked for another venue → checkpoint → soak (default 60 s,
// ours and unvalidated: no source gives a soak time) with a read every interval → judge every line
// (lib/goLines.mjs, ILDA's four phases). Run it at load-in, at doors minus 60 min and after every change.
// Exit 0 = GO · 1 = NO-GO · 2 = refused · 3 = LOOK (`--look`: one quick read, never a GO).
import fs from 'node:fs'
import path from 'node:path'
import { checkMarker } from './lib/profile.mjs'
import { evaluate, formatResult } from './lib/goLines.mjs'
import { parseProbe, probeScript } from './lib/probe.mjs'
import { tail } from './lib/transport.mjs'
import { runCheckpoint } from './checkpoint.mjs'

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runGo({
    profile, transport, mode = 'go', why = 'show go', session,
    now = Date.now, sleep = realSleep, print = (s) => process.stdout.write(`${s}\n`), checkpointFn = runCheckpoint
}) {
    const script = probeScript(profile)
    const look = async () => {
        const r = await transport.run(script)
        if (r.code !== 0) return { ok: false, code: r.code, stderr: tail(r.stderr) || `exit ${r.code}` }
        return { ok: true, code: 0, stderr: tail(r.stderr), reading: parseProbe(r.stdout.toString('utf8')) }
    }
    const samples = [await look()]
    if (samples[0].ok) {
        const marker = checkMarker(profile, samples[0].reading.marker, transport.where)
        if (marker.mismatch) { print(`!! REFUSED: ${marker.reason}`); return { code: 2, result: null } }
    }
    let checkpoint = null
    let soak = null
    if (mode === 'go' && samples[0].ok) {
        checkpoint = await checkpointFn({ profile, why, session, transport })
        if (checkpoint.code === 2) { print(`!! REFUSED: ${checkpoint.stderrTail}`); return { code: 2, result: null } }
        print(`.. checkpoint exit ${checkpoint.code}: ${checkpoint.folder}`)
        const plannedMs = Math.max(0, profile.thresholds.soakS) * 1000
        const everyMs = Math.max(1, profile.thresholds.soakIntervalS) * 1000
        const hands = profile.midi && typeof profile.midi === 'object' ? 'move one fader on the MIDI controller now' : 'hands off the rig'
        print(`.. soak ${profile.thresholds.soakS} s (ours, unvalidated), a read every ${profile.thresholds.soakIntervalS} s: ${hands}`)
        const start = now()
        while (now() - start < plannedMs) {
            await sleep(Math.min(everyMs, plannedMs - (now() - start)))
            samples.push(await look())
        }
        soak = { plannedS: profile.thresholds.soakS, actualS: (now() - start) / 1000 }
    }
    const result = evaluate({ profile, samples, checkpoint, soak, mode, where: transport.where })
    print(formatResult(result))
    if (checkpoint?.folder && fs.existsSync(checkpoint.folder)) {
        fs.writeFileSync(path.join(checkpoint.folder, 'go.json'), `${JSON.stringify({ ...result, soak, at: new Date().toISOString() }, null, 2)}\n`)
    }
    return { code: result.verdict === 'GO' ? 0 : result.verdict === 'LOOK' ? 3 : 1, result }
}
