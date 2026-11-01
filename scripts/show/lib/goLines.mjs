// GO / NO-GO lines, grouped under the four phases ILDA asks a per-show checklist to cover: setup,
// alignment, testing, performance (RESEARCH-show-safety 3, source S14). Which line sits in which phase
// is our mapping. Each line asks a failure-mode question and answers it from a reading (the Google SRE
// launch checklist style), never "the service is up". A missing reading is a NO-GO naming what is
// missing and who owes it; nothing here falls back to a value that looks healthy.
// Pure: no I/O. `go.mjs` gathers the samples; tests feed fixtures.
import { checkMarker, getPath } from './profile.mjs'

export const PHASES = ['setup', 'alignment', 'testing', 'performance']
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const short = (v, n = 80) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > n ? `${s.slice(0, n - 1)}…` : String(s) }

const lightOut = (d) => {
    const o = isObj(d?.output) ? d.output : {}
    const enabled = o.enabled ?? o.on
    const connected = o.enttec?.connected ?? o.connected ?? d?.connected
    return { enabled, connected }
}

/**
 * samples: [{ ok, code, stderr, reading }] in time order (the first is the look before the checkpoint).
 * checkpoint: { code, folder, stderrTail } | null. soak: { plannedS, actualS } | null. mode: 'go' | 'look'.
 * Returns { verdict: 'GO' | 'NO-GO' | 'LOOK', nogo, lines: [{ phase, id, mark, text }] }.
 */
export function evaluate({ profile, samples, checkpoint = null, soak = null, mode = 'go', where = 'the machine' }) {
    const lines = []
    const add = (phase, id, ok, text) => lines.push({ phase, id, mark: ok === true ? '++' : ok === false ? '!!' : '..', text })
    const t = profile.thresholds || {}
    const done = () => {
        const nogo = lines.filter((l) => l.mark === '!!').length
        return { verdict: mode === 'look' ? 'LOOK' : nogo ? 'NO-GO' : 'GO', nogo, lines, venue: profile.venue }
    }

    // ── setup ──
    if (isObj(profile.confirmed)) add('setup', 'profile', true, `profile ${profile.venue}: confirmed by ${profile.confirmed.by} at ${profile.confirmed.at}`)
    else add('setup', 'profile', false, `profile ${profile.venue} is not confirmed by the owner (to confirm: ${(profile.toConfirm || ['every value']).join('; ')})`)

    const answered = samples.filter((s) => s.ok && s.reading)
    const failed = samples.filter((s) => !s.ok)
    if (!answered.length) {
        add('setup', 'answer', false, `${where} did not answer: ${failed.at(-1)?.stderr || 'no output'} (exit ${failed.at(-1)?.code ?? '?'})`)
        return done()
    }
    if (failed.length) add('testing', 'answer', false, `${failed.length} of ${samples.length} reads failed: ${failed.at(-1).stderr || `exit ${failed.at(-1).code}`}`)
    const first = answered[0].reading
    const last = answered.at(-1).reading

    const marker = checkMarker(profile, first.marker, where)
    add('setup', 'marker', marker.ok, marker.reason)

    if (profile.release?.required === false) add('setup', 'release', null, `release record not required by this profile · running ${last.version ?? '?'}`)
    else if (!last.release) add('setup', 'release', false, `no release record for the running pack ${last.version ?? '(no current link)'} at ${profile.diHome}/current/release.json (owed: S10)`)
    else if (last.release.unparseable) add('setup', 'release', false, `the release record of ${last.version} is not readable JSON`)
    else {
        const r = last.release
        const sha = getPath(r, 'subject.0.digest.sha256')
        const tests = getPath(r, 'predicate.tests.line') ?? getPath(r, 'predicate.tests')
        const review = getPath(r, 'predicate.review.verdict')
        add('setup', 'release', true, `running ${last.version} · pack ${sha ? String(sha).slice(0, 8) : '?'} · tests ${short(tests ?? '?', 40)} · review ${review ?? '?'} · overlays ${last.patches.length}`)
    }

    if (profile.journal?.persistent) add('setup', 'journal', last.journal.persistent === true, last.journal.persistent ? 'journal is persistent: a crash leaves a record' : 'journal is not persistent (/var/log/journal missing): a crash leaves no record')
    add('setup', 'kernel-log', last.kernel.readable === true, last.kernel.readable ? 'kernel log readable' : 'kernel log not readable by this user: USB errors cannot be counted (provisioning: journal group, S14)')

    const pr = last.posture
    const readPosture = `governor ${pr.governors.join(',') || '?'} · driver ${pr.driver ?? '?'} · no_turbo ${pr.noTurbo ?? '?'} · ${pr.curKhz ? Math.round(pr.curKhz / 1000) : '?'} MHz · AC ${pr.acOnline ?? '?'}`
    if (!isObj(profile.posture)) add('setup', 'posture', null, `posture not asserted by the profile; read: ${readPosture}`)
    else {
        const want = profile.posture
        const wrong = []
        if (want.governor != null) for (const s of answered) { const g = s.reading.posture.governors; if (!(g.length === 1 && g[0] === want.governor)) { wrong.push(`governor ${g.join(',') || 'unreadable'}, wants ${want.governor}`); break } }
        if (want.driver != null && pr.driver !== want.driver) wrong.push(`driver ${pr.driver ?? 'unreadable'}, wants ${want.driver}`)
        if (want.noTurbo != null && pr.noTurbo !== want.noTurbo) wrong.push(`no_turbo ${pr.noTurbo ?? 'unreadable'}, wants ${want.noTurbo}`)
        if (want.acOnline != null && pr.acOnline !== want.acOnline) wrong.push(`AC ${pr.acOnline ?? 'unreadable'}, wants ${want.acOnline}`)
        add('setup', 'posture', !wrong.length, wrong.length ? `posture drifted: ${wrong.join('; ')} (one writer per knob: the posture unit, S14)` : `posture read back: ${readPosture}`)
    }

    const ports = profile.ports || []
    if (!ports.length) add('setup', 'ports', null, `no USB port plan in the profile; plugged: ${last.usb.map((u) => `${u.vidpid}@${u.path}`).join(' ') || 'nothing'}`)
    for (const p of ports) {
        const id = `port:${p.role}`
        if (!p.path || !p.vidpid) { add('setup', id, false, `port plan: ${p.role} has no ${!p.path ? 'path' : 'vidpid'} yet (read \`lsusb -t\` on the machine and confirm)`); continue }
        const dev = last.usb.find((u) => u.vidpid === p.vidpid && u.path === p.path) || last.usb.find((u) => u.vidpid === p.vidpid)
        if (!dev) add('setup', id, false, `${p.role} (${p.vidpid}) is not plugged in`)
        else if (dev.path !== p.path) add('setup', id, false, `${p.role} (${p.vidpid}) is at ${dev.path}, the plan says ${p.path}`)
        else if (p.driver && !dev.drivers.includes(p.driver)) add('setup', id, false, `${p.role} at ${p.path} has driver ${dev.drivers.join(',') || 'none'}, the plan says ${p.driver}`)
        else if (p.speedMbps != null && dev.speedMbps !== p.speedMbps) add('setup', id, false, `${p.role} at ${p.path} runs at ${dev.speedMbps} Mbit/s, the plan says ${p.speedMbps}`)
        else add('setup', id, true, `${p.role}: ${p.vidpid} at ${p.path}, ${dev.speedMbps} Mbit/s, ${dev.drivers.join(',') || 'no driver'}`)
    }

    for (const l of profile.links || []) {
        const id = `link:${l.role}`
        if (!l.iface) { add('setup', id, false, `link ${l.role}: no interface named in the profile`); continue }
        const r = last.links[l.iface]
        if (!r || r.missing) add('setup', id, false, `link ${l.role} (${l.iface}) does not exist on the machine`)
        else if (r.carrier !== 1) add('setup', id, false, `link ${l.role} (${l.iface}) has no carrier (${r.operstate ?? '?'})`)
        else add('setup', id, true, `link ${l.role} (${l.iface}) up · carrier changes ${r.changes ?? '?'} · rx errors ${r.rxErrors ?? '?'}`)
    }

    // ── alignment: the laser's safety state (S12) and its people ──
    const laser = profile.laser
    if (laser === false) add('alignment', 'laser', null, 'laser: none at this place (profile)')
    else if (!isObj(laser)) add('alignment', 'laser', false, 'laser: unknown in the profile (confirm whether this place has one of ours)')
    else {
        add('alignment', 'lso', Boolean(laser.lso), laser.lso ? `laser safety officer ${laser.lso}${laser.operator ? ` · operator ${laser.operator}` : ''}` : 'no laser safety officer named in the profile (the owner names one: G06)')
        const st = last.api.laser
        const sf = st?.json?.safety
        if (!st?.json) add('alignment', 'safety', false, `laser state unreadable (http ${st?.code ?? 'none'})`)
        else if (!isObj(sf)) add('alignment', 'safety', false, 'the laser state has no safety block (owed: S12)')
        else {
            const bad = sf.noGo || sf.ok === false || sf.error
            add('alignment', 'safety', !bad, bad ? `laser safety says no: ${short(sf.reason || sf.error || 'not ok', 120)}` : `laser safety block present${sf.guards ? ` · guards ${short(sf.guards, 60)}` : ''}`)
            if (sf.zone == null) add('alignment', 'zone', false, 'no zone in the laser safety state')
            else if (laser.zone != null && JSON.stringify(sf.zone) !== JSON.stringify(laser.zone)) add('alignment', 'zone', false, `the laser zone ${short(sf.zone, 50)} differs from the profile ${short(laser.zone, 50)}`)
            else add('alignment', 'zone', true, `zone ${short(sf.zone, 60)}${laser.zone == null ? ' (the profile states none: the owner decides)' : ' matches the profile'}`)
            if (typeof sf.stopPathMs !== 'number') add('alignment', 'stop-path', false, 'stop path not timed (S12; the E-stop drill at load-in)')
            else if (laser.stopPathMaxMs != null) add('alignment', 'stop-path', sf.stopPathMs <= laser.stopPathMaxMs, `stop path ${sf.stopPathMs} ms (limit ${laser.stopPathMaxMs} ms)`)
            else add('alignment', 'stop-path', null, `stop path ${sf.stopPathMs} ms (no limit set: the owner decides)`)
            if (typeof sf.stopsPerHour === 'number' && laser.stopRateMaxPerHour != null) add('alignment', 'stop-rate', sf.stopsPerHour <= laser.stopRateMaxPerHour, `stops ${sf.stopsPerHour}/h (limit ${laser.stopRateMaxPerHour}/h)`)
            else add('alignment', 'stop-rate', null, `stops ${sf.stopsPerHour ?? '?'}/h (no limit set: the owner decides, G06)`)
            if (sf.worstHeadroom != null) add('alignment', 'headroom', null, `worst look headroom ${short(sf.worstHeadroom, 40)}`)
        }
    }

    // ── testing ──
    if (!profile.api) add('testing', 'api', false, 'no api in the profile: pages and states cannot be read')
    else for (const p of profile.pages || []) { const c = last.pages[p]; add('testing', `page:${p}`, c === 200, c === 200 ? `page ${p} answers` : `page ${p}: ${c ?? 'no answer'}`) }

    if (isObj(laser) && last.api.laser?.json) {
        const cubes = last.api.laser.json.cubes || []
        if (!cubes.length) add('testing', 'cubes', false, 'no laser cube in the laser state')
        cubes.forEach((c, i) => {
            const name = c.id ?? c.serial ?? `#${i + 1}`
            const seen = answered.map((s) => s.reading.api.laser?.json?.cubes?.[i]?.connected)
            const p = c.path || {}
            if (!seen.every((v) => v === true)) add('testing', `cube:${name}`, false, `cube ${name}: connected ${seen.map((v) => (v === true ? 'True' : String(v === undefined ? 'unread' : v === false ? 'False' : v))).join(',')} across the reads`)
            else if (c.armed !== true) add('testing', `cube:${name}`, false, `cube ${name}: not armed`)
            else if (c.stop) add('testing', `cube:${name}`, false, `cube ${name}: stopped (${short(c.stop.reason ?? c.stop, 60)})`)
            else add('testing', `cube:${name}`, true, `cube ${name}: connected in every read, armed, no stop · frame ${p.pointsOut ?? '?'} of ${p.budget ?? '?'}`)
        })
        add('testing', 'stop-resume', null, `stop resume: ${short(last.api.laser.json.stopResume ?? 'not stated', 60)}`)
    }

    const light = profile.light
    if (light === false) add('testing', 'light', null, 'light output: none of ours at this place (profile)')
    else if (!isObj(light)) add('testing', 'light', false, 'light: unknown in the profile (confirm)')
    else {
        const outs = answered.map((s) => lightOut(s.reading.api.light?.json))
        const okAll = answered.every((s) => s.reading.api.light?.json) && outs.every((o) => o.enabled === true && o.connected === true)
        const d = last.api.light?.json
        add('testing', 'light', okAll, okAll
            ? `light output on and connected in every read · scenes ${(d.scenes || []).length} · blackout ${d.blackout} · master ${d.master}`
            : `light output ${outs.map((o) => `on ${o.enabled}/connected ${o.connected}`).join(', ')} (http ${last.api.light?.code ?? 'none'})`)
    }

    const midi = profile.midi
    if (midi === false) add('testing', 'midi', null, 'MIDI: no controller at this place (profile)')
    else if (!isObj(midi)) add('testing', 'midi', false, 'MIDI: unknown in the profile (confirm)')
    else {
        const field = midi.field || 'midi.heardAt'
        const heard = getPath(last.api.midi?.json, field)
        const start = first.now
        if (!midi.statePath) add('testing', 'midi', false, 'MIDI heard: the profile names no desk state path (owed: S14)')
        else if (!last.api.midi?.json) add('testing', 'midi', false, `MIDI heard: ${midi.statePath} unreadable (http ${last.api.midi?.code ?? 'none'})`)
        else if (typeof heard !== 'number') add('testing', 'midi', false, `MIDI heard: the desk state has no ${field} (owed: S14)`)
        else if (mode === 'look') add('testing', 'midi', null, `MIDI last heard ${start ? Math.round((start - heard) / 1000) : '?'} s before this look`)
        else add('testing', 'midi', heard >= start, heard >= start ? `MIDI heard ${Math.round((heard - start) / 1000)} s into this run (${midi.device ?? 'controller'})` : `MIDI not heard during this run: move one fader on ${midi.device ?? 'the controller'} while GO soaks`)
        add('testing', 'midi-nodes', null, `/dev/snd MIDI nodes: ${last.midiNodes ?? '?'} (a node count is not a pass)`)
    }

    const watch = profile.watch
    if (watch === false) add('testing', 'watch', null, 'watch: none at this place (profile)')
    else if (!isObj(watch)) add('testing', 'watch', false, 'watch: unknown in the profile (confirm)')
    else if (!watch.unit) add('testing', 'watch', false, 'watch: the profile names no unit (owed: S11)')
    else {
        const states = answered.map((s) => s.reading.watch?.active ?? 'unread')
        const fresh = watch.freshS ?? t.watchFreshS ?? 15
        if (!states.every((s) => s === 'active')) add('testing', 'watch', false, `watch ${watch.unit}: ${[...new Set(states)].join(',')}`)
        else if (watch.csv && last.watch?.csvMissing) add('testing', 'watch', false, `watch ${watch.unit} runs but writes no ${watch.csv}`)
        else if (watch.csv && !(last.watch?.csvAgeS <= fresh)) add('testing', 'watch', false, `watch samples are ${last.watch?.csvAgeS ?? '?'} s old (limit ${fresh} s)`)
        else add('testing', 'watch', true, `watch ${watch.unit} active in every read${watch.csv ? ` · last sample ${last.watch.csvAgeS} s ago` : ''}`)
    }

    if (last.kernel.readable) {
        const planned = new Set(ports.map((p) => p.path).filter(Boolean))
        let worst = 0
        for (const p of ports.filter((x) => x.path)) {
            const n = last.kernel.errors[p.path] ?? 0
            if (n > (t.kernelErrorsMax ?? 0)) { worst += 1; add('testing', `usb-errors:${p.role}`, false, `${p.role} at ${p.path}: ${n} kernel USB errors in the last ${t.kernelWindowS} s`) }
        }
        if (!worst && planned.size) add('testing', 'usb-errors', true, `no kernel USB errors on the planned ports in the last ${t.kernelWindowS} s`)
        const others = Object.entries(last.kernel.errors).filter(([p]) => !planned.has(p))
        if (others.length) add('testing', 'usb-errors-other', null, `kernel USB errors off the plan: ${others.map(([p, n]) => `${p}:${n}`).join(' ')}`)
    }

    if (mode === 'go') {
        for (const l of (profile.links || []).filter((x) => x.iface)) {
            const a = first.links[l.iface]
            const b = last.links[l.iface]
            if (!a || !b || a.missing || b.missing) continue
            const flaps = (b.changes ?? 0) - (a.changes ?? 0)
            const dark = answered.some((s) => s.reading.links[l.iface]?.carrier !== 1)
            if (flaps > 0 || dark) add('testing', `link-held:${l.role}`, false, `link ${l.role} (${l.iface}) dropped during the soak: ${flaps} carrier changes`)
        }
        const planned = t.soakS ?? 60
        const actual = soak?.actualS ?? 0
        add('testing', 'soak', planned > 0 && actual >= planned, planned <= 0
            ? 'no soak: a GO needs one (use --look for a quick read)'
            : actual >= planned
            ? `soak ${Math.round(actual)} s, ${samples.length} reads (${planned} s: ours, unvalidated)`
            : `soak cut short: ${Math.round(actual)} of ${planned} s`)
        const dCore = (last.throttle.core ?? 0) - (first.throttle.core ?? 0)
        const dPkg = (last.throttle.package ?? 0) - (first.throttle.package ?? 0)
        if (dCore > 0 || dPkg > 0) add('testing', 'throttle', false, `the CPU throttled during the soak (core +${dCore}, package +${dPkg})`)
        if (first.tempMaxC != null && last.tempMaxC != null && actual > 0) {
            const slope = Math.round(((last.tempMaxC - first.tempMaxC) / (actual / 60)) * 10) / 10
            if (t.soakSlopeMaxCPerMin != null) add('testing', 'slope', slope <= t.soakSlopeMaxCPerMin, `temperature slope ${slope} C/min (limit ${t.soakSlopeMaxCPerMin})`)
            else add('testing', 'slope', null, `temperature slope ${slope} C/min (not gated until the first load-in data sets a limit)`)
        }
    }

    // ── performance ──
    if (isObj(laser)) {
        const desk = last.api.desk?.json
        if (!desk) add('performance', 'bank', false, `laser bank unreadable (http ${last.api.desk?.code ?? 'none'})`)
        else if (desk.unsaved !== false) add('performance', 'bank', false, `the bank has unsaved changes (unsaved ${desk.unsaved}): store it before the show`)
        else add('performance', 'bank', true, `bank ${(desk.looks || []).length} looks stored · live ${desk.liveId ?? 'none'} · blackout ${desk.blackout}`)
    }
    const temp = last.tempMaxC
    if (temp == null) add('performance', 'temp', false, 'temperature unreadable')
    else if (temp >= (t.tempNoGoC ?? 90)) add('performance', 'temp', false, `at ${Math.round(temp)} C (NO-GO from ${t.tempNoGoC} C): close a window or wait`)
    else if (temp >= (t.tempWarnC ?? 85)) add('performance', 'temp', null, `at ${Math.round(temp)} C (warn from ${t.tempWarnC} C)`)
    else add('performance', 'temp', true, `temperature ${Math.round(temp)} C · load ${last.load ?? '?'}`)

    if (mode === 'go') {
        if (!checkpoint) add('performance', 'checkpoint', false, 'no checkpoint taken')
        else if (checkpoint.code === 0) add('performance', 'checkpoint', true, `checkpoint ${checkpoint.folder}`)
        else add('performance', 'checkpoint', false, `checkpoint ${checkpoint.code === 3 ? 'partial' : 'failed'} (exit ${checkpoint.code}): ${checkpoint.stderrTail || 'no message'}`)
    }
    return done()
}

export function formatResult(result, now = new Date()) {
    const hhmm = now.toTimeString().slice(0, 5)
    const out = []
    for (const phase of PHASES) {
        const ls = result.lines.filter((l) => l.phase === phase)
        if (!ls.length) continue
        out.push(`-- ${phase}`)
        for (const l of ls) out.push(`${l.mark} ${l.text}`)
    }
    if (result.verdict === 'GO') out.push(`== GO ${result.venue} (${hhmm})`)
    else if (result.verdict === 'LOOK') out.push(`== LOOK ${result.venue} (${hhmm}): not a GO; ${result.nogo} line(s) would block`)
    else out.push(`== NO-GO ${result.venue} (${hhmm}): ${result.nogo} line(s) marked !! say why`)
    return out.join('\n')
}
