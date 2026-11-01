// One read-only look at the show machine. `probeScript` writes the bash that runs there (it only
// reads: sysfs, the kernel log, the di server's own state routes, files under di's home);
// `parseProbe` turns its output into a plain reading that `goLines.mjs` judges.
// Output format: sections that start with a line `@@<name>[ <arg>]`, the body below it.
import fs from 'node:fs'
import { assignments, shq } from './transport.mjs'

const BODY = fs.readFileSync(new URL('./probe.sh', import.meta.url), 'utf8')

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The API routes a profile reads, as name=path pairs. */
export function apiReads(profile) {
    const reads = []
    if (isObj(profile.laser)) reads.push(['laser', 'laser/api/state'], ['desk', 'laser/desk/api/state'])
    if (isObj(profile.light)) reads.push(['light', 'light/api/state'])
    if (isObj(profile.midi) && profile.midi.statePath) reads.push(['midi', profile.midi.statePath])
    return reads
}

export function probeScript(profile) {
    const vars = {
        MARKER: profile.markerPath,
        DIH: profile.diHome,
        API: profile.api || '',
        PAGES: (profile.pages || []).join(' '),
        APIS: apiReads(profile).map(([n, p]) => `${n}=${p}`).join(' '),
        KWIN: String(profile.thresholds?.kernelWindowS ?? 600),
        IFACES: (profile.links || []).map((l) => l.iface).filter(Boolean).join(' '),
        WUNIT: (isObj(profile.watch) && profile.watch.unit) || '',
        WCSV: (isObj(profile.watch) && profile.watch.csv) || ''
    }
    return `${assignments(vars)}\n${BODY}`
}

const kv = (lines) => Object.fromEntries(lines.map((l) => l.split('=')).filter((p) => p.length >= 2 && p[0]).map(([k, ...v]) => [k.trim(), v.join('=').trim()]))
const num = (s) => (s === undefined || s === null || String(s).trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))

/** Probe output text → a reading. Unreadable parts are null, never a default that looks healthy. */
export function parseProbe(text) {
    const sections = []
    let cur = null
    for (const line of String(text).split('\n')) {
        const m = /^@@([a-z]+)(?: (.*))?$/.exec(line)
        if (m) { cur = { name: m[1], arg: m[2] ?? '', lines: [] }; sections.push(cur); continue }
        if (cur) cur.lines.push(line)
    }
    const one = (name) => sections.find((s) => s.name === name)
    const body = (name) => (one(name)?.lines ?? []).join('\n').trim()
    const r = { now: num(body('now')), marker: body('marker') || null, current: body('current') || null }
    r.version = r.current ? r.current.split('/').filter(Boolean).at(-1) : null
    const rel = body('release')
    if (!rel) r.release = null
    else { try { r.release = JSON.parse(rel) } catch { r.release = { unparseable: true } } }
    r.patches = body('patches') ? body('patches').split('\n') : []
    r.pages = Object.fromEntries(sections.filter((s) => s.name === 'page').map((s) => [s.arg, num(s.lines.join('').trim())]))
    r.api = {}
    for (const s of sections.filter((x) => x.name === 'api')) {
        const [name, code] = s.arg.split(' ')
        const raw = s.lines.join('\n').trim()
        let json
        try { json = raw ? JSON.parse(raw) : null } catch { json = null }
        r.api[name] = { code: num(code), json }
    }
    const temps = (one('temp')?.lines ?? []).map(num).filter((t) => t !== null).map((t) => t / 1000)
    r.tempMaxC = temps.length ? Math.max(...temps) : null
    const th = kv(one('throttle')?.lines ?? [])
    r.throttle = { core: num(th.core), package: num(th.package) }
    const po = kv(one('posture')?.lines ?? [])
    r.posture = {
        governors: po.governors ? po.governors.split(',').filter(Boolean) : [],
        driver: po.driver || null,
        noTurbo: num(po.no_turbo),
        epb: num(po.epb),
        minKhz: num(po.min_khz),
        maxKhz: num(po.max_khz),
        curKhz: num(po.cur_khz),
        acOnline: num(po.ac)
    }
    r.usb = (one('usb')?.lines ?? []).filter((l) => l.includes('\t')).map((l) => {
        const [p, vidpid, speed, drivers, product] = l.split('\t')
        return { path: p, vidpid, speedMbps: num(speed), drivers: drivers ? drivers.split(',') : [], product: (product || '').trim() }
    })
    const kl = one('kernel')?.lines ?? []
    r.kernel = { readable: kl.includes('readable=1'), errors: {} }
    for (const l of kl) { const m = /^err (\S+) (\d+)$/.exec(l.trim()); if (m) r.kernel.errors[m[1]] = Number(m[2]) }
    r.links = {}
    for (const s of sections.filter((x) => x.name === 'link')) {
        const v = kv(s.lines)
        r.links[s.arg] = v.missing ? { missing: true } : { carrier: num(v.carrier), changes: num(v.changes), rxErrors: num(v.rx_errors), operstate: v.operstate || null }
    }
    r.journal = { persistent: body('journal').includes('persistent=1') }
    if (one('watch')) { const w = kv(one('watch').lines); r.watch = { active: w.active || null, csvAgeS: w.csv_age_s === 'none' ? null : num(w.csv_age_s), csvMissing: w.csv_age_s === 'none' } } else r.watch = null
    r.midiNodes = num(body('midinodes'))
    r.load = body('load') || null
    return r
}

export { shq }
