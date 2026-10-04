#!/usr/bin/env node
/**
 * desk-plan.mjs — put ONE chosen version of a show on its space's desk, as a NEW show file,
 * planned OFFLINE first. docs/architecture/RIG_BUILD.md §19.5 (the owed rule of §19.4: "only
 * the space's chosen version patches onto its desk"); audit docs/ai/audits/moxir-2026-10-05 B1, B2.
 *
 *   # 1. DRY RUN (the default): reads the live show and the project, writes nothing live
 *   node scripts/rigbuild/desk-plan.mjs --space moxir --project moxir-hall-known-full \
 *        --out ~/Downloads/moxir-desk-plan-2026-10-05 [--show <show.json>] [--document <doc.json>] \
 *        [--gate scripts/place/rigs/moxir-2026-10-17-known-full.patch.json]
 *   # 2. APPLY (the owner). The desk is stopped FIRST and the plan made from the stopped show:
 *   #    a running desk saves its show at every cue, so a plan made while it runs is stale at once.
 *   #    With di down the local API is down too: read the document from dev (the hub), which
 *   #    every install follows (--api https://dev.diiii.xyz/serverXR).
 *   di down
 *   node scripts/rigbuild/desk-plan.mjs --space moxir --project moxir-hall-known-full --api https://dev.diiii.xyz/serverXR \
 *        --out ~/Downloads/moxir-desk-plan-2026-10-05 --gate scripts/place/rigs/moxir-2026-10-17-known-full.patch.json
 *   node scripts/rigbuild/desk-plan.mjs --space moxir --apply ~/Downloads/moxir-desk-plan-2026-10-05
 *   di up
 *   # 3. UNDO, from the backup the apply wrote (also with the desk stopped)
 *   node scripts/rigbuild/desk-plan.mjs --space moxir --undo ~/di-backups/moxir-desk-plan-<stamp>
 *
 * The plan is made by the desk's OWN code (serverXR/src/lighting/desk.js, offline: it binds no
 * port and transmits nothing) on a throwaway copy of the show, through the same routes the
 * Studio and patch.mjs / show-loop.mjs use:
 *   1. every OTHER project's rig fixtures come off the desk — on EVERY universe, not only the
 *      chosen version's: the desk runs one patch per space (§19.2), a lamp left on U3–U5 would
 *      still be sent its old looks' DMX, and the 4-port node has U3/U4 to plug into. A fixture
 *      the operator added by hand (no rigKey) is kept; if it sits where a lamp must go, the
 *      plan FAILS.
 *   2. the chosen project's lamps go on at EXACTLY the document's universe, address and
 *      fixture number. Nothing is moved to a free slot: a clash, a duplicate address in the
 *      document, a lamp with no address, an index taken, a profile clash — each is named and
 *      the run exits 1, writing no show.
 *   3. its designed looks go on with their DMX values (deskLookValues.js), other projects' rig
 *      looks come off, the cue list is the DOCUMENT's (mappingState.cues), loaded with
 *      loop OFF and NOT started (no GO): the loop and the start are the owner's call.
 *   4. OUTPUT is never touched: a space's show file carries no `output` (desk.js withoutRig);
 *      the plan refuses to write one that does, and --apply refuses while the machine's
 *      OUTPUT is on.
 * Writes into --out: show.planned.json, plan-meta.json (sources, sha256, counts per universe),
 * assumed-modes.csv (every fixture whose desk list is ASSUMED or only TESTED, audit B5) and,
 * with --gate <plan>, the crew's patch sheet from patch-sheet.mjs checked against a desk
 * serving the PLANNED show (exit 1 on any foreign fixture or any drift).
 *
 *   --data   the installed di's data dir (default ~/.di/data); the live show is
 *            <data>/spaces/<space>/lighting/show.json
 *   --api    where the project document is read (GET only; default https://local.thedi.studio/serverXR)
 *   --backups where --apply keeps the show it replaces (default ~/di-backups)
 *   --desk   a live desk address that must NOT answer during --apply/--undo (default http://127.0.0.1:4000/light/;
 *            the install's own port from <data>/../di.env and https://local.thedi.studio/light/ are always checked too)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say, warn, REPO_ROOT } from '../place/common.mjs'
import { patchRequest } from '../../src/rigbuild/autoPatch.js'
import { rigLooksOf, staleDeskLooks } from '../../src/rigbuild/looks.js'
import { deskLooksWithValues } from '../../src/rigbuild/deskLookValues.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { modeOf, typeById } from '../../src/rigbuild/fixtureTypes.js'
import { loadLibrary } from './library.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const require = createRequire(import.meta.url)
const pad3 = (n) => String(n).padStart(3, '0')
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex')
const projectOfKey = (key) => String(key || '').split(':')[0]
const at = (u, a) => `U${u}.${pad3(a)}`

// ---- pure: the "exact or fail" rule -------------------------------------------------------

/**
 * What stops a lamp going EXACTLY where the document says, before the desk is asked:
 * no address, past 512, two lamps of the document on one channel, or a fixture that stays
 * on the desk (an operator's own) on its channels. Pure.
 * @param {object[]} lamps  patchRequest(...).lamps (1-based universes)
 * @param {object[]} staying  desk fixtures that stay ({ name, universe (1-based), address, footprint, index })
 */
export const exactProblems = (lamps, staying = []) => {
    const problems = []
    const spans = []
    for (const l of lamps) {
        const w = Number(l.footprint)
        if (!(Number.isInteger(w) && w >= 1)) { problems.push(`${l.key}: no DMX mode is known, so it has no footprint`); continue }
        if (!(Number.isInteger(l.universe) && l.universe >= 1 && Number.isInteger(l.address) && l.address >= 1)) { problems.push(`${l.key}: the document gives it no address`); continue }
        if (l.address + w - 1 > 512) { problems.push(`${l.key}: ${w} ch from ${at(l.universe, l.address)} run past 512`); continue }
        spans.push({ who: l.key, u: l.universe, from: l.address, to: l.address + w - 1, index: l.index })
    }
    for (let i = 0; i < spans.length; i++) {
        for (let j = i + 1; j < spans.length; j++) {
            const a = spans[i], b = spans[j]
            if (a.u === b.u && a.from <= b.to && b.from <= a.to) problems.push(`${b.who} (${at(b.u, b.from)}) overlaps ${a.who} (${at(a.u, a.from)}) in the document`)
        }
        for (const f of staying) {
            const a = spans[i]
            const fTo = f.address + f.footprint - 1
            if (f.universe === a.u && a.from <= fTo && f.address <= a.to) problems.push(`${a.who} (${at(a.u, a.from)}) overlaps ${f.name} at ${at(f.universe, f.address)}, which stays on the desk`)
            if (a.index != null && f.index === a.index) problems.push(`${a.who}: fixture number ${a.index} is taken by ${f.name}, which stays on the desk`)
        }
    }
    return problems
}

/**
 * The desk's answer checked against what was asked: every lamp patched, none flagged, none
 * moved (universe, address or fixture number), none placed as a "copy". Pure.
 */
export const exactVerdict = (lamps, result) => {
    const problems = []
    const flags = result?.flags || []
    for (const f of flags) problems.push(`${f.key}: the desk flagged ${f.code} — ${f.message}`)
    const byKey = new Map((result?.assignments || []).map((a) => [a.key, a]))
    for (const l of lamps) {
        const a = byKey.get(l.key)
        if (!a) { if (!flags.some((f) => f.key === l.key)) problems.push(`${l.key}: not patched`); continue }
        if (a.how === 'copy') problems.push(`${l.key}: placed as a copy at ${at(a.universe, a.address)} (the document gives two lamps one address)`)
        if (a.universe !== l.universe || a.address !== l.address) problems.push(`${l.key}: the desk put it at ${at(a.universe, a.address)}, the document says ${at(l.universe, l.address)}`)
        if (l.index != null && a.index !== l.index) problems.push(`${l.key}: the desk gave it #${a.index}, the document says #${l.index}`)
        if (Number(a.footprint) !== Number(l.footprint)) problems.push(`${l.key}: ${a.footprint} ch on the desk, ${l.footprint} in the document`)
    }
    return problems
}

/** Channels used and fixtures per (1-based) universe, from a show file. Pure. */
export const universeUse = (show) => {
    const width = new Map((show.customProfiles || []).map((p) => [p.name, p.channels.length]))
    const out = {}
    for (const f of show.fixtures || []) {
        const u = f.universe + 1
        out[u] = out[u] || { fixtures: 0, channels: 0, byProject: {} }
        out[u].fixtures += 1
        out[u].channels += width.get(f.profile) ?? 0
        const p = f.rigKey ? projectOfKey(f.rigKey) : '(operator, no rigKey)'
        out[u].byProject[p] = (out[u].byProject[p] || 0) + 1
    }
    return out
}

/** The planned show checked on its own, after the desk wrote it. Pure. */
export const planProblems = ({ planned, project, lamps }) => {
    const problems = []
    if ('output' in planned) problems.push('the planned show carries `output` — a space show never does (desk.js withoutRig)')
    const foreign = (planned.fixtures || []).filter((f) => f.rigKey && projectOfKey(f.rigKey) !== project)
    if (foreign.length) problems.push(`${foreign.length} fixture(s) of other projects are still on the desk`)
    const byKey = new Map((planned.fixtures || []).filter((f) => f.rigKey).map((f) => [f.rigKey, f]))
    for (const l of lamps) {
        const f = byKey.get(l.key)
        if (!f) { problems.push(`${l.key}: not in the planned show`); continue }
        if (f.universe + 1 !== l.universe || f.address !== l.address || (l.index != null && f.index !== l.index)) problems.push(`${l.key}: #${f.index} ${at(f.universe + 1, f.address)} in the planned show, the document says #${l.index} ${at(l.universe, l.address)}`)
    }
    const c = planned.cues || {}
    if (c.project !== project) problems.push(`the cue list is ${c.project || 'nobody'}'s, not ${project}'s`)
    if (c.loop !== false) problems.push('the cue list loops (it must stay OFF until the owner says)')
    if (c.running !== false) problems.push('the cue list is running (nothing may be started by the plan)')
    const lookIds = new Set((planned.looks || []).map((l) => l.id))
    for (const cue of c.list || []) if (!lookIds.has(cue.lookId)) problems.push(`cue "${cue.name}" names ${cue.lookId}, not on the desk`)
    for (const layer of planned.layers || []) if (layer.lookId && !lookIds.has(layer.lookId)) problems.push(`layer ${layer.id} holds ${layer.lookId}, not on the desk`)
    return problems
}

// ---- the desk's own code, offline, on a throwaway copy -------------------------------------

/** An offline desk (desk.js) holding `show` as space `space`'s show, on 127.0.0.1. */
export async function offlineDesk(show, space) {
    const { createDesk } = require('../../serverXR/src/lighting/desk.js')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-plan-'))
    const data = path.join(root, 'data')
    const spaceDir = path.join(root, 'spaces', space)
    fs.mkdirSync(data, { recursive: true })
    fs.mkdirSync(spaceDir, { recursive: true })
    fs.writeFileSync(path.join(spaceDir, 'show.json'), JSON.stringify(show))
    fs.writeFileSync(path.join(data, 'desk.json'), JSON.stringify({ space, label: space }))
    const logs = []
    const desk = createDesk({
        dataDir: data, offline: true, outputEnabledDefault: false, log: (line) => logs.push(line),
        spaces: { dir: (id) => path.join(root, 'spaces', id), find: (id) => (id === space ? { label: space } : null) }
    })
    const server = http.createServer((q, r) => desk.handle(q, r))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const call = async (method, route, body) => {
        const r = await fetch(base + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
        const text = await r.text()
        let json = null
        try { json = JSON.parse(text) } catch { /* not json */ }
        return { ok: r.ok, status: r.status, body: json, text }
    }
    const showPath = path.join(spaceDir, 'show.json')
    return {
        base, call, logs, desk,
        /** Close the desk (it saves), read back what it wrote, remove the throwaway folder. */
        finish: async () => {
            desk.close()
            await new Promise((resolve) => server.close(resolve))
            const text = fs.readFileSync(showPath, 'utf8')
            fs.rmSync(root, { recursive: true, force: true })
            return text
        },
        stop: async () => { desk.close(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }) }
    }
}

/**
 * The plan: `show` (a space show file, parsed) with only `project` on it, exactly patched.
 * Throws with every problem named when anything is not exact. Returns the new show text + counts.
 */
export async function planDesk({ show, space, project, entities, cues: docCues = [], library }) {
    // The runner is parked on the throwaway copy: a show saved as running resumes on load and
    // fires its cue (and its timer) while the plan is being made.
    const input = { ...show, cues: { ...(show.cues || {}), running: false } }
    const d = await offlineDesk(input, space)
    try {
        const where = await d.call('GET', '/api/show')
        if (where.body?.space !== space) throw new Error(`the offline desk did not load ${space}'s show (${where.text.slice(0, 200)})`)
        const before = (await d.call('GET', '/api/rig')).body.fixtures
        const others = [...new Set(before.map((f) => projectOfKey(f.key)).filter((p) => p !== project))].sort()
        const removed = {}
        for (const p of [...others, project]) {
            const r = await d.call('POST', '/api/rig/patch', { project: p, lamps: [], prune: true })
            if (!r.ok) throw new Error(`the desk refused to take ${p} off: ${r.status} ${r.text.slice(0, 200)}`)
            removed[p] = (r.body.removed || []).length
        }
        const state = d.desk.state
        const widthOf = (f) => (state.customProfiles.find((p) => p.name === f.profile)?.channels.length) ?? null
        const staying = state.fixtures.map((f) => ({ name: `${f.index}.${f.name}`, universe: f.universe + 1, address: f.address, footprint: widthOf(f) ?? 1, index: f.index }))
        const body = patchRequest({ projectId: project, entities, library, prune: true })
        const before1 = exactProblems(body.lamps, staying)
        if (before1.length) throw Object.assign(new Error('not exact'), { problems: before1 })
        const r = await d.call('POST', '/api/rig/patch', body)
        if (!r.ok) throw new Error(`the desk refused the patch: ${r.status} ${r.text.slice(0, 300)}`)
        const verdict = exactVerdict(body.lamps, r.body)
        if (verdict.length) throw Object.assign(new Error('not exact'), { problems: verdict })

        const looks = rigLooksOf(entities)
        if (!looks) throw new Error(`${project} has no designed looks (components.rigLooks)`)
        const rig = (await d.call('GET', `/api/rig?project=${encodeURIComponent(project)}`)).body.fixtures
        const deskSet = deskLooksWithValues(looks, rig, { entities, library })
        for (const look of deskSet) {
            const put = await d.call('POST', '/api/looks/add', { look })
            if (!put.ok) throw new Error(`the desk did not take look ${look.id}: ${put.status} ${put.text.slice(0, 200)}`)
        }
        const onDesk = (await d.call('GET', '/api/looks')).body.looks
        const stale = staleDeskLooks(onDesk, deskSet.map((l) => l.id))
        for (const id of stale) {
            const gone = await d.call('POST', '/api/looks/remove', { id })
            if (!gone.ok) throw new Error(`the desk did not remove look ${id}: ${gone.status}`)
        }
        // The document's own cue list (the truth), loaded with the loop OFF and not started.
        const list = docCues.map((c) => ({ id: c.id, name: c.name, lookId: c.lightLook, hold: c.hold, fade: c.fade }))
        if (!list.length) throw new Error(`${project}'s document has no cue list (mappingState.cues)`)
        const loaded = await d.call('POST', '/api/cues/load', { project, list, loop: false })
        if (!loaded.ok) throw new Error(`the desk did not load the cue list: ${loaded.status} ${loaded.text.slice(0, 200)}`)
        const cues = (await d.call('GET', '/api/cues')).body.cues
        const text = await d.finish()
        const planned = JSON.parse(text)
        const after = planProblems({ planned, project, lamps: body.lamps })
        if (after.length) throw Object.assign(new Error('the planned show is not right'), { problems: after })
        return {
            text, planned, removed, others, lamps: body.lamps, assignments: r.body.assignments,
            looks: { added: deskSet.map((l) => l.id), removed: stale, valued: deskSet.filter((l) => l.valuesFrom).length },
            cues: { n: list.length, loop: cues.loop, running: cues.running, loopSeconds: list.reduce((s, c) => s + c.hold, 0), missing: cues.missing || [] },
            operatorFixtures: staying.length
        }
    } catch (e) {
        await d.stop().catch(() => {})
        throw e
    }
}

// ---- the report of assumed / tested channel lists (audit B5) -------------------------------

export const channelBasisRows = ({ planned, entities, library, project }) => {
    const byId = new Map(entities.map((e) => [e.id, e]))
    return (planned.fixtures || []).map((f) => {
        const e = byId.get(String(f.rigKey || '').split(':').slice(1).join(':'))
        const fx = e?.components?.fixture || {}
        const type = typeById(library, fx.type)
        const mode = type ? modeOf(type, fx.mode) : null
        const basis = /-assumed$/.test(f.profile) || mode?.assumed ? 'ASSUMED' : (mode?.channelsSource?.basis || (mode?.channels ? 'maker' : 'OWED'))
        return { index: f.index, key: f.rigKey || '', project: projectOfKey(f.rigKey) || project, universe: f.universe + 1, address: f.address, profile: f.profile, channels: mode?.footprint ?? '', basis, source: mode?.channelsSource?.fixture || '' }
    })
}

const csv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => {
    const v = String(r[c] ?? '')
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}).join(','))].join('\n') + '\n'

// ---- the live side: apply and undo (the owner's, with the desk stopped) --------------------

const liveShowPath = (data, space) => path.join(data, 'spaces', space, 'lighting', 'show.json')

// Where the installed desk may answer: the one given, the install's own port (di.env PORT;
// 443 on aylmo, behind the gateway) over http and https, and the front door. A gateway answering
// 502/503/504 means di behind it is down. Any other answer means di runs, and its desk would save
// over the file (or load it half-way). Returns what answered, or null.
const deskCandidates = (desk, data) => {
    let port = null
    try { port = /^PORT=(\d+)$/m.exec(fs.readFileSync(path.join(path.dirname(data), 'di.env'), 'utf8'))?.[1] || null } catch { /* no env file */ }
    // The front door serves the installed di only: a --data other than the install's is a test copy.
    const installed = path.resolve(data) === path.join(os.homedir(), '.di', 'data')
    return [...new Set([desk, ...(port ? [`http://127.0.0.1:${port}/light/`, `https://127.0.0.1:${port}/light/`] : []), ...(installed ? ['https://local.thedi.studio/light/'] : [])])]
}
const deskAnswers = async (desk, data) => {
    for (const base of deskCandidates(desk, data)) {
        try {
            // api/clock, never api/show: on the installed di any other /light/ request BUILDS the desk
            // (lightingRoutes.js getDesk), which binds Art-Net and resumes a saved running cue list.
            // The clock answers without building it. Any answer at all means di is up: refuse.
            const r = await fetch(`${base}api/clock`, { signal: AbortSignal.timeout(3000) })
            if (![502, 503, 504].includes(r.status)) return `${base} HTTP ${r.status}`
        } catch (e) {
            // A TLS name mismatch on https://127.0.0.1 is still a server listening there.
            const code = e?.cause?.code || ''
            if (/CERT|TLS|SSL|ALTNAME|SELF_SIGNED/i.test(code)) return `${base} (TLS: ${code})`
        }
    }
    return null
}

const machineOutputOn = (data) => {
    try { return JSON.parse(fs.readFileSync(path.join(data, 'lighting', 'show.json'), 'utf8')).output?.enabled === true } catch { return false }
}

const writeAtomic = (file, text) => {
    const tmp = `${file}.desk-plan.tmp`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

async function apply({ dir, data, space, desk, backups }) {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'plan-meta.json'), 'utf8'))
    const text = fs.readFileSync(path.join(dir, 'show.planned.json'), 'utf8')
    if (sha256(text) !== meta.planned.sha256) die('show.planned.json does not match plan-meta.json (changed since it was planned) — plan again')
    if (meta.space !== space) die(`the plan is for space ${meta.space}, not ${space}`)
    if (meta.gate?.passed !== true) die(meta.gate ? 'the plan did not pass its gate (patch-sheet.mjs) — nothing applied' : 'the plan was made without --gate — plan again with --gate <plan>; nothing applied')
    const live = liveShowPath(data, space)
    const answer = await deskAnswers(desk, data)
    if (answer) die(`di is running (${answer}) — its desk would write over the new show at its next save. Run \`di down\` first, then this, then \`di up\`.`)
    if (machineOutputOn(data)) die(`this machine's desk OUTPUT is ON (${path.join(data, 'lighting', 'show.json')}) — a new show must not start transmitting on load. Switch OUTPUT off first.`)
    const current = fs.readFileSync(live, 'utf8')
    if (sha256(current) !== meta.source.sha256) die(`the live show changed since the plan was made (sha256 ${sha256(current).slice(0, 12)}…, planned from ${meta.source.sha256.slice(0, 12)}…) — plan again from the live show`)
    const backup = path.join(backups, `${space}-desk-plan-${stamp()}`)
    fs.mkdirSync(backup, { recursive: true })
    const files = {}
    for (const name of ['show.json', 'show.prev.json']) {
        const from = path.join(path.dirname(live), name)
        if (!fs.existsSync(from)) continue
        fs.copyFileSync(from, path.join(backup, name))
        files[name] = sha256(fs.readFileSync(path.join(backup, name)))
    }
    if (files['show.json'] !== meta.source.sha256) die(`the backup did not verify (${backup}) — nothing applied`)
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ space, live, takenAt: new Date().toISOString(), files, applied: { from: dir, sha256: meta.planned.sha256, project: meta.project }, undo: `node scripts/rigbuild/desk-plan.mjs --space ${space} --undo ${backup}` }, null, 2) + '\n')
    writeAtomic(live, text)
    if (sha256(fs.readFileSync(live, 'utf8')) !== meta.planned.sha256) die(`the live show does not read back as planned — undo with: node scripts/rigbuild/desk-plan.mjs --space ${space} --undo ${backup}`)
    say(`applied: ${live} is now ${meta.project}'s desk (sha256 ${meta.planned.sha256.slice(0, 12)}…). Backup: ${backup}`)
    say(`next: di up — the desk loads it with OUTPUT off, the cue list stopped, loop off.`)
    say(`undo: di down && node scripts/rigbuild/desk-plan.mjs --space ${space} --undo ${backup} && di up`)
}

async function undo({ backup, data, space, desk }) {
    const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'))
    if (manifest.space !== space) die(`the backup is of space ${manifest.space}, not ${space}`)
    const text = fs.readFileSync(path.join(backup, 'show.json'), 'utf8')
    if (sha256(text) !== manifest.files['show.json']) die(`the backup's show.json does not match its manifest — not restored`)
    const answer = await deskAnswers(desk, data)
    if (answer) die(`di is running (${answer}). Run \`di down\` first.`)
    const live = liveShowPath(data, space)
    // The show being undone is kept too, so the undo can itself be undone.
    const aside = path.join(backup, `undone-${stamp()}`)
    fs.mkdirSync(aside, { recursive: true })
    if (fs.existsSync(live)) fs.copyFileSync(live, path.join(aside, 'show.json'))
    writeAtomic(live, text)
    if (sha256(fs.readFileSync(live, 'utf8')) !== manifest.files['show.json']) die('the restored show does not read back as the backup')
    say(`restored ${live} from ${backup} (sha256 ${manifest.files['show.json'].slice(0, 12)}…); the show it replaced is kept at ${aside}. Next: di up`)
}

// ---- main -------------------------------------------------------------------------------

const readDocument = async (args) => {
    if (args.document) {
        const file = path.resolve(String(args.document).replace(/^~/, os.homedir()))
        const text = fs.readFileSync(file, 'utf8')
        const raw = JSON.parse(text)
        return { document: raw.document || raw, version: raw.version ?? null, source: file, sha256: sha256(text) }
    }
    const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const read = await client.get(`/api/projects/${args.project}/document`)
    if (!read.ok) die(`reading ${args.project} from ${api} failed — HTTP ${read.status}`)
    return { document: read.body.document, version: read.body.version, source: `${api}/api/projects/${args.project}/document`, sha256: sha256(read.text) }
}

const main = async () => {
    const args = parseArgs()
    const space = String(args.space || die('needs --space <id>'))
    const data = path.resolve(String(args.data || path.join(os.homedir(), '.di', 'data')).replace(/^~/, os.homedir()))
    const desk = String(args.desk || 'http://127.0.0.1:4000/light/').replace(/\/?$/, '/')
    const backups = path.resolve(String(args.backups || path.join(os.homedir(), 'di-backups')).replace(/^~/, os.homedir()))
    if (args.apply) return apply({ dir: path.resolve(String(args.apply).replace(/^~/, os.homedir())), data, space, desk, backups })
    if (args.undo) return undo({ backup: path.resolve(String(args.undo).replace(/^~/, os.homedir())), data, space, desk })

    const project = String(args.project || die('needs --project <id>'))
    const out = path.resolve(String(args.out || die('needs --out <dir> (a dry run writes only there)')).replace(/^~/, os.homedir()))
    const showFile = path.resolve(String(args.show || liveShowPath(data, space)).replace(/^~/, os.homedir()))
    const showText = fs.readFileSync(showFile, 'utf8') // read only
    const show = JSON.parse(showText)
    const doc = await readDocument({ ...args, project })
    if (doc.document?.projectMeta?.spaceId && doc.document.projectMeta.spaceId !== space) die(`${project} lives in space ${doc.document.projectMeta.spaceId}, not ${space}`)
    const entities = doc.document.entities || []
    const library = libraryWithShow(loadLibrary(), entities)

    let plan
    try {
        plan = await planDesk({ show, space, project, entities, cues: doc.document.mappingState?.cues || [], library })
    } catch (e) {
        for (const p of e.problems || []) warn(`  ${p}`)
        die(`NOT PLANNED — ${e.message}${e.problems ? ` (${e.problems.length} problem(s)); nothing was written, nothing was moved to a free slot` : ''}`)
    }

    const beforeUse = universeUse(show)
    const afterUse = universeUse(plan.planned)
    const universes = [...new Set([...Object.keys(beforeUse), ...Object.keys(afterUse)].map(Number))].sort((a, b) => a - b).map((u) => {
        const b = beforeUse[u] || { fixtures: 0, channels: 0, byProject: {} }
        const a = afterUse[u] || { fixtures: 0, channels: 0, byProject: {} }
        const others = (use) => Object.entries(use.byProject).filter(([p]) => p !== project).reduce((s, [, n]) => s + n, 0)
        return {
            universe: u,
            before: { fixtures: b.fixtures, channels: b.channels, byProject: b.byProject },
            removedOther: others(b) - others(a),
            keptOther: others(a),
            patched: a.byProject[project] || 0,
            after: { fixtures: a.fixtures, channels: a.channels, free: 512 - a.channels }
        }
    })
    const basis = channelBasisRows({ planned: plan.planned, entities, library, project })
    const assumed = basis.filter((r) => r.basis === 'ASSUMED')
    const inputAssumed = (show.fixtures || []).filter((f) => /-assumed$/.test(f.profile))

    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'show.planned.json'), plan.text)
    fs.writeFileSync(path.join(out, 'assumed-modes.csv'), csv(basis, ['index', 'universe', 'address', 'profile', 'channels', 'basis', 'source', 'key']))
    fs.writeFileSync(path.join(out, 'input-assumed-modes.csv'), csv(inputAssumed.map((f) => ({ index: f.index, universe: f.universe + 1, address: f.address, profile: f.profile, key: f.rigKey || '' })), ['index', 'universe', 'address', 'profile', 'key']))
    const meta = {
        planner: 'scripts/rigbuild/desk-plan.mjs', madeAt: new Date().toISOString(), space, project,
        source: { show: showFile, sha256: sha256(showText), fixtures: (show.fixtures || []).length, cues: show.cues?.project || null },
        document: { from: doc.source, version: doc.version, sha256: doc.sha256 },
        planned: { sha256: sha256(plan.text), fixtures: plan.planned.fixtures.length, output: 'absent (a space show never carries it)' },
        removed: plan.removed, operatorFixturesKept: plan.operatorFixtures,
        universes, looks: plan.looks, cues: plan.cues,
        assumed: { planned: assumed.length, input: inputAssumed.length, testedOnly: basis.filter((r) => r.basis === 'TESTED').length }
    }

    say(`${project} on ${space}'s desk — planned from ${showFile} (read only)`)
    for (const u of universes) say(`  U${u.universe}: before ${u.before.fixtures} fixtures / ${u.before.channels} ch · removed ${u.removedOther} of other versions, kept ${u.keptOther} · ${project} patched ${u.patched} · after ${u.after.fixtures} fixtures / ${u.after.channels} ch, ${u.after.free} free`)
    say(`  taken off: ${Object.entries(plan.removed).map(([p, n]) => `${p} ${n}`).join(', ')}`)
    say(`  looks: ${plan.looks.added.length} put on (${plan.looks.valued} with DMX values), ${plan.looks.removed.length} of other projects taken off`)
    say(`  cues: ${plan.cues.n} (one loop ${plan.cues.loopSeconds} s), loop ${plan.cues.loop ? 'ON' : 'off'}, ${plan.cues.running ? 'RUNNING' : 'not started'}`)
    say(`  channel lists: ${assumed.length} ASSUMED, ${meta.assumed.testedOnly} TESTED on the Sevan units only (not a maker chart) — ${path.join(out, 'assumed-modes.csv')}`)

    if (args.gate) {
        const gatePlan = path.resolve(REPO_ROOT, String(args.gate))
        const served = await offlineDesk(plan.planned, space)
        let r
        try {
            const sheetOut = path.join(out, 'patch-sheet')
            const cmd = [path.join(REPO_ROOT, 'scripts/rigbuild/patch-sheet.mjs'), '--plan', gatePlan, '--project', project, '--desk', `${served.base}/`, '--out', sheetOut]
            if (args.api) cmd.push('--api', String(args.api))
            if (args['token-file']) cmd.push('--token-file', String(args['token-file']))
            // patch-sheet.mjs runs as a child while this process serves the planned desk: async spawn.
            r = await new Promise((resolve) => {
                const child = spawn(process.execPath, cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
                let stdout = '', stderr = ''
                child.stdout.on('data', (b) => { stdout += b })
                child.stderr.on('data', (b) => { stderr += b })
                child.on('close', (status) => resolve({ status, stdout, stderr }))
            })
        } finally { await served.stop() }
        meta.gate = { tool: 'scripts/rigbuild/patch-sheet.mjs', plan: path.relative(REPO_ROOT, gatePlan), exit: r.status, passed: r.status === 0, output: (r.stdout + r.stderr).trim().split('\n').slice(-30) }
        say(`  gate (patch-sheet.mjs against a desk serving the PLANNED show): ${r.status === 0 ? 'PASS' : `FAIL (exit ${r.status})`}`)
        for (const line of meta.gate.output) say(`    ${line}`)
    }
    fs.writeFileSync(path.join(out, 'plan-meta.json'), JSON.stringify(meta, null, 2) + '\n')
    say(`dry run: ${out}/show.planned.json, plan-meta.json, assumed-modes.csv — the live desk was not touched.`)
    say(`apply (owner): plan with the desk STOPPED (di down), so the live show cannot move under the plan; then`)
    say(`  node scripts/rigbuild/desk-plan.mjs --space ${space} --apply ${out} && di up`)
    if (meta.gate && !meta.gate.passed) process.exit(1)
}

if (isMainModule(import.meta.url)) main().catch((e) => die(e.stack || e.message))
