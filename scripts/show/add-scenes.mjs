#!/usr/bin/env node
// Add light scenes to a running light desk, each with the laser look that follows it (lights and laser are one
// scene), WITHOUT touching the scenes already there. Additive: an id that is already on the desk is refused.
//
//   node scripts/show/add-scenes.mjs --spec scenes.json [--base http://diiii.localhost:4000/serverXR] [--dry-run]
//   node scripts/show/add-scenes.mjs --spec scenes.json --undo        removes exactly the spec's scenes and links
//   node scripts/show/add-scenes.mjs --restore <backup.json>          puts a backup's whole library back
//
// spec: { "scenes": [ { "id", "name", "fadeMs", "fixtures": [{ "id", "on", "values": {...} }], "fx", "lfos",
//         "audioCfg", "look": "<laser look id that follows this scene>" } ] }
//
// How: the light desk has no "add one scene with these values" route (save captures the live lamps, which would
// change the room), so this reads the library, backs it up to ~/di-backups, re-reads it just before writing and
// stops if anything changed in between, writes old + new through /api/scenes/replace, then checks every old scene
// came back field for field. Nothing is recalled; the lamps and the laser do not change.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : (args[i + 1] ?? '') }
const has = (name) => args.includes(name)
const base = (opt('--base') || 'http://diiii.localhost:4000/serverXR').replace(/\/$/, '')
const LIGHT = `${base}/light/api`
const LASER = `${base}/laser/desk/api`
const fail = (msg) => { console.error(`add-scenes: FAIL ${msg}`); process.exit(1) }
// The laser desk refuses a write without Origin/Referer unless it carries the local token (as scripts/rigbuild/laser-play.mjs):
// --laser-token-file, else $DI_LASER_TOKEN_FILE, else ~/.di/data/laser/.token. Read, never printed.
const tokenFile = opt('--laser-token-file') || process.env.DI_LASER_TOKEN_FILE || path.join(os.homedir(), '.di', 'data', 'laser', '.token')
const laserToken = (() => { try { return fs.readFileSync(tokenFile, 'utf8').trim() } catch { return '' } })()

const get = async (url) => {
    const r = await fetch(url, { headers: { 'cache-control': 'no-store' } })
    if (!r.ok) fail(`GET ${url} -> ${r.status}`)
    return r.json()
}
const post = async (url, body) => {
    const headers = { 'content-type': 'application/json' }
    if (url.startsWith(LASER) && laserToken) headers['x-laser-token'] = laserToken
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }
    if (!r.ok || json?.ok === false || json?.error) fail(`POST ${url} -> ${r.status} ${text.slice(0, 200)}`)
    return json
}

// The stored fields of a scene (the state view adds live/missing counts, which are not stored).
const STORED = ['id', 'name', 'fadeMs', 'fixtures', 'raw', 'fx', 'lfos', 'audioCfg']
const stored = (s) => Object.fromEntries(STORED.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]))
const sameScene = (a, b) => JSON.stringify(stored(a)) === JSON.stringify(stored(b))
const ids = (scenes) => scenes.map((s) => s.id).join(' ')
// Key order differs between a spec and what the desk stores (it adds defaults), so compare sorted, and only what the spec names.
const canon = (v) => Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v
const specMatches = (desk, spec) => Object.entries(spec).every(([k, v]) => {
    if (k === 'look') return true
    if (k === 'fx' && v && desk.fx) return Object.entries(v).every(([fk, fv]) => JSON.stringify(canon(desk.fx[fk])) === JSON.stringify(canon(fv)))
    return JSON.stringify(canon(desk[k])) === JSON.stringify(canon(v))
})

const backup = (scenes) => {
    const dir = path.join(os.homedir(), 'di-backups')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = path.join(dir, `light-scenes-${stamp}.json`)
    fs.writeFileSync(file, JSON.stringify({ base, scenes: scenes.map(stored) }, null, 2))
    return file
}

async function main() {
    if (has('--restore')) {
        const file = opt('--restore')
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (!Array.isArray(saved.scenes)) fail(`${file} holds no scenes`)
        const now = (await get(`${LIGHT}/state`)).scenes || []
        console.log(`backup of now: ${backup(now)}`)
        await post(`${LIGHT}/scenes/replace`, { scenes: saved.scenes })
        const after = (await get(`${LIGHT}/state`)).scenes || []
        if (ids(after) !== ids(saved.scenes)) fail(`restore: ids differ after write: ${ids(after)}`)
        console.log(`restored ${after.length} scenes from ${file}`)
        return
    }
    const specFile = opt('--spec')
    if (!specFile) fail('--spec <file> is needed (or --restore <backup>)')
    const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'))
    const adds = spec.scenes || []
    if (!adds.length) fail('the spec has no scenes')
    for (const s of adds) if (!s.id || !Array.isArray(s.fixtures)) fail(`spec scene ${JSON.stringify(s.name)} needs an id and fixtures`)

    const first = (await get(`${LIGHT}/state`)).scenes || []
    const patched = new Set(((await get(`${LIGHT}/state`)).fixtures || []).map((f) => f.id))
    const follows = has('--no-follows') ? null : await get(`${LASER}/follows`)

    if (has('--undo')) {
        const mine = adds.filter((s) => first.some((x) => x.id === s.id))
        for (const s of adds) {
            if (follows && s.look && follows.links?.[s.id]?.look === s.look) {
                await post(`${LASER}/looks/follows`, { id: s.look, scene: '' })
                console.log(`unlinked look ${s.look} from ${s.id}`)
            }
        }
        if (!mine.length) { console.log('undo: none of the spec scenes is on the desk'); return }
        console.log(`backup: ${backup(first)}`)
        for (const s of mine) { await post(`${LIGHT}/scenes/remove`, { id: s.id }); console.log(`removed scene ${s.id}`) }
        return
    }

    // A scene already on the desk exactly as the spec says is done (a rerun only sets the links); one that differs is refused.
    const onDesk = (s) => first.find((x) => x.id === s.id)
    const clash = adds.filter((s) => onDesk(s) && !specMatches(onDesk(s), s))
    if (clash.length) fail(`already on the desk with other values, nothing written: ${ids(clash)} (use --undo first to rebuild them)`)
    const done = adds.filter((s) => onDesk(s))
    if (done.length === adds.length) {
        console.log(`all ${adds.length} scenes are on the desk as the spec says; only the laser links are set`)
        if (follows) await link(adds)
        return
    }
    if (done.length) fail(`some spec scenes are on the desk and some not (${ids(done)}): use --undo, then add all`)
    const unknown = adds.flatMap((s) => s.fixtures.filter((f) => !patched.has(f.id)).map((f) => `${s.id}:${f.id}`))
    if (unknown.length) fail(`fixtures not patched on this desk: ${unknown.join(' ')}`)
    if (follows) {
        const looks = new Set(((await get(`${LASER}/state`)).looks || []).map((l) => l.id))
        const missing = adds.filter((s) => s.look && !looks.has(s.look))
        if (missing.length) fail(`laser looks not in the bank: ${missing.map((s) => s.look).join(' ')}`)
    }
    const next = [...first.map(stored), ...adds.map(({ look, ...s }) => s)]
    console.log(`desk has ${first.length} scenes; adding ${adds.length}: ${adds.map((s) => `${s.id} "${s.name}"${s.look ? ` + look ${s.look}` : ''}`).join(', ')}`)
    if (has('--dry-run')) { console.log('dry run: nothing written'); return }

    const file = backup(first)
    console.log(`backup: ${file}`)
    const again = (await get(`${LIGHT}/state`)).scenes || []
    if (ids(again) !== ids(first) || again.some((s, i) => !sameScene(s, first[i]))) fail('the library changed while reading; nothing written, run again')
    await post(`${LIGHT}/scenes/replace`, { scenes: next })

    const after = (await get(`${LIGHT}/state`)).scenes || []
    const changed = first.filter((s) => !sameScene(s, after.find((x) => x.id === s.id) || {}))
    if (ids(after) !== ids(next) || changed.length) {
        fail(`after the write the library is not old + new (changed: ${ids(changed) || 'order'}); put it back: node scripts/show/add-scenes.mjs --restore ${file}`)
    }
    console.log(`light desk: ${after.length} scenes, the ${first.length} old ones unchanged field for field`)
    const off = adds.filter((s) => !specMatches(after.find((x) => x.id === s.id) || {}, s))
    if (off.length) console.error(`add-scenes: WARN the desk stored ${ids(off)} differently from the spec (it clamps values); a rerun will refuse them`)
    if (follows) await link(adds)
    console.log(`undo: node scripts/show/add-scenes.mjs --spec ${specFile} --undo`)
}

// One scene, one look: each spec scene's look follows it on the laser desk (laserDesk.setFollows moves any other look off it).
async function link(adds) {
    if (!laserToken) fail(`no laser token at ${tokenFile} (--laser-token-file or $DI_LASER_TOKEN_FILE): the links are not set`)
    for (const s of adds) {
        if (!s.look) continue
        const r = await post(`${LASER}/looks/follows`, { id: s.look, scene: s.id })
        console.log(`look ${s.look} follows ${s.id}${r?.moved?.length ? ` (moved off: ${r.moved.join(' ')})` : ''}`)
    }
}

main().catch((e) => fail(e?.stack || String(e)))
