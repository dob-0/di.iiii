#!/usr/bin/env node
/**
 * scripts/rig/conformance.mjs — usage:
 *
 *   node scripts/rig/conformance.mjs --base http://127.0.0.1:PORT/serverXR [--key K] [--json]
 *
 * Black-box conformance suite for ONE running rig member, against
 * docs/architecture/rig/PROTOCOL-1.md §2–§6. Talks HTTP only — no import of
 * serverXR/src/rig/* (lane A's files, built in parallel and not on this
 * branch). Prints a PASS/FAIL/SKIP table (or, with --json, a single JSON
 * summary for another tool to parse — compat-grid.mjs uses this) and exits 1
 * if anything FAILed. `--key` signs every POST with x-di-rig-sig and also
 * turns on the two room-key checks (unsigned → 403, signed → ok); omitted,
 * those two checks are skipped, since a black box can't discover a key it
 * wasn't given.
 *
 * Self-test: `node scripts/rig/mock-member.mjs --port 0` in one process, this
 * script with --base pointed at it in another — see scripts/rig/compat-grid.mjs
 * --mock for a scripted version of that.
 */

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { LOCAL_FEATURES, agree, request, signedHeaders, createChecklist, printTable, jsonSize } from './lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
// Lane A's fixtures directory. Resolved against THIS checkout (the one this
// script is running from), not the member's own checkout — a black-box tool
// tests whatever the fixtures on disk here say a "future" body looks like.
const FIXTURES_DIR = path.join(REPO_ROOT, 'serverXR', 'src', 'rig', 'fixtures', 'protocol-1')

const { values: args } = parseArgs({
    options: {
        base: { type: 'string' },
        key: { type: 'string' },
        json: { type: 'boolean', default: false }
    }
})

if (!args.base) {
    process.stderr.write('usage: node scripts/rig/conformance.mjs --base http://127.0.0.1:PORT/serverXR [--key K] [--json]\n')
    process.exit(2)
}

const BASE = String(args.base).replace(/\/+$/, '')
const KEY = args.key || null
const url = (p) => `${BASE}${p}`

const postSigned = (p, bodyObj) => {
    const raw = JSON.stringify(bodyObj)
    return request(url(p), { method: 'POST', body: raw, headers: signedHeaders(KEY, raw) })
}

const rand = (label) => `conformance-${label}-${randomUUID().slice(0, 8)}`

const cardTypeCheck = (card) => {
    const problems = []
    const isArr = (v) => Array.isArray(v)
    const isNumOrNull = (v) => v === null || typeof v === 'number'
    const isStrOrNull = (v) => v === null || typeof v === 'string'
    if (card.rig !== 1) problems.push('rig !== 1')
    if (card.kind !== 'card') problems.push('kind !== "card"')
    if (typeof card.release !== 'string') problems.push('release not a string')
    if (!card.machine || typeof card.machine.id !== 'string' || typeof card.machine.name !== 'string') {
        problems.push('machine.{id,name} not strings')
    }
    if (typeof card.part !== 'string') problems.push('part not a string')
    if (!isStrOrNull(card.partReason)) problems.push('partReason not string|null')
    if (typeof card.mode !== 'string') problems.push('mode not a string')
    if (card.caller !== null) problems.push('caller !== null')
    if (typeof card.blackout !== 'boolean') problems.push('blackout not a boolean')
    const ports = card.ports || {}
    for (const key of ['screens', 'audioOut', 'audioIn', 'cameras', 'serial', 'midi', 'net']) {
        if (!isArr(ports[key])) problems.push(`ports.${key} not an array`)
    }
    const health = card.health || {}
    for (const key of ['tempC', 'cpuPct', 'memUsedMb', 'memTotalMb', 'uptimeS']) {
        if (!isNumOrNull(health[key])) problems.push(`health.${key} not number|null`)
    }
    if (!('throttled' in health)) problems.push('health.throttled missing')
    if (!isArr(card.shows)) problems.push('shows not an array')
    if (!card.features || typeof card.features !== 'object') problems.push('features not an object')
    if (typeof card.sentAt !== 'number') problems.push('sentAt not a number')
    return problems
}

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const run = async () => {
    const list = createChecklist()
    let helloSenderId = null

    await list.check('hello-minimal', async () => {
        const id = rand('minimal')
        const res = await postSigned('/api/rig/hello', { rig: 1, kind: 'hello', machine: { id } })
        if (res.status !== 200) return { ok: false, detail: `status ${res.status}: ${res.text}` }
        if (!res.json || res.json.kind !== 'hello') return { ok: false, detail: 'response missing kind:"hello"' }
        if (!res.json.agreed || typeof res.json.agreed !== 'object') return { ok: false, detail: 'response missing agreed{}' }
        return { detail: `agreed=${JSON.stringify(res.json.agreed)}` }
    })

    await list.check('hello-future-fields', async () => {
        const id = rand('future')
        const res = await postSigned('/api/rig/hello', {
            rig: 1,
            kind: 'hello',
            machine: { id, name: 'future-sender', unknownNested: { a: 1, b: [1, 2, 3] } },
            release: '99.99.99-future',
            part: 'studio',
            room: null,
            http: { port: 9999, base: '/serverXR', extraHttpField: true },
            features: {
                ...LOCAL_FEATURES,
                futureFeature: 42,
                weirdShapeFeature: { nested: true }
            },
            sentAt: Date.now(),
            futureTopLevelBlob: { totally: 'new', arr: [1, 2, 3], nested: { deep: true } }
        })
        if (res.status !== 200) return { ok: false, detail: `status ${res.status}: ${res.text}` }
        if (!res.json || typeof res.json.agreed !== 'object') return { ok: false, detail: 'no agreed{} in response' }
        return { detail: 'unknown fields/features ignored, 200 returned' }
    })

    await list.check('hello-fixtures-replay', async () => {
        if (!existsSync(FIXTURES_DIR)) {
            return { skip: true, detail: `no fixtures at ${path.relative(REPO_ROOT, FIXTURES_DIR)} (lane A hasn't landed them yet)` }
        }
        const entries = await fs.readdir(FIXTURES_DIR)
        const files = entries.filter(f => f.endsWith('.json'))
        if (files.length === 0) return { skip: true, detail: 'fixtures dir exists but is empty' }
        const failures = []
        for (const file of files) {
            const raw = await fs.readFile(path.join(FIXTURES_DIR, file), 'utf8')
            let body
            try {
                body = JSON.parse(raw)
            } catch (err) {
                failures.push(`${file}: not valid JSON (${err.message})`)
                continue
            }
            const kind = body.kind
            const routeByKind = { hello: '/api/rig/hello', cue: '/api/rig/cue', blackout: '/api/rig/blackout', picture: '/api/rig/picture' }
            const routePath = routeByKind[kind] || '/api/rig/hello'
            const res = await postSigned(routePath, body)
            if (res.status >= 500 || res.status === 400) failures.push(`${file}: status ${res.status}`)
        }
        if (failures.length > 0) return { ok: false, detail: failures.join('; ') }
        return { detail: `replayed ${files.length} fixture(s)` }
    })

    await list.check('agreed-min-rule', async () => {
        const id = rand('agree')
        const senderFeatures = { card: 3, cue: 1, blackout: 0, members: -5, newFeature: 7, discovery: 2 }
        const expected = agree(LOCAL_FEATURES, senderFeatures)
        const res = await postSigned('/api/rig/hello', { rig: 1, kind: 'hello', machine: { id }, features: senderFeatures })
        if (res.status !== 200) return { ok: false, detail: `status ${res.status}: ${res.text}` }
        if (!deepEqual(res.json.agreed, expected)) {
            return { ok: false, detail: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(res.json.agreed)}` }
        }
        return { detail: `agreed=${JSON.stringify(expected)}` }
    })

    await list.check('other-room-409', async () => {
        const id = rand('otherroom')
        const res = await postSigned('/api/rig/hello', { rig: 1, kind: 'hello', machine: { id }, room: '__conformance_other_room__' })
        if (res.status !== 409) return { ok: false, detail: `expected 409, got ${res.status}: ${res.text}` }
        if (!res.json || res.json.error !== 'other-room') return { ok: false, detail: `expected error:"other-room", got ${JSON.stringify(res.json)}` }
        return {}
    })

    await list.check('wrong-kind-400', async () => {
        const id = rand('wrongkind')
        const res = await postSigned('/api/rig/hello', { rig: 1, kind: 'cue', machine: { id } })
        if (res.status !== 400) return { ok: false, detail: `expected 400, got ${res.status}: ${res.text}` }
        if (!res.json || res.json.error !== 'wrong-kind') return { ok: false, detail: `expected error:"wrong-kind", got ${JSON.stringify(res.json)}` }
        return {}
    })

    await list.check('body-too-large-413', async () => {
        const id = rand('big')
        const body = { rig: 1, kind: 'hello', machine: { id }, padding: 'x'.repeat(80 * 1024) }
        if (jsonSize(body) <= 64 * 1024) return { ok: false, detail: 'test payload was not actually over 64 KB' }
        // Sign it too (if a key is set) so a 413 check doesn't race a 403 one
        // over which the real route checks first — either order, this must 413.
        const res = await postSigned('/api/rig/hello', body)
        if (res.status !== 413) return { ok: false, detail: `expected 413, got ${res.status}: ${res.text.slice(0, 200)}` }
        return {}
    })

    await list.check('card-shape', async () => {
        const res = await request(url('/api/rig/card'))
        if (res.status !== 200) return { ok: false, detail: `status ${res.status}: ${res.text}` }
        const problems = cardTypeCheck(res.json || {})
        if (problems.length > 0) return { ok: false, detail: problems.join('; ') }
        return { detail: 'all §2.2 keys present with correct types' }
    })

    await list.check('cue-ping-accepted', async () => {
        const res = await postSigned('/api/rig/cue', {
            rig: 1, kind: 'cue', id: rand('ping'), name: 'ping', args: {},
            from: { id: 'conformance', name: 'conformance' }, sentAt: Date.now()
        })
        if (res.status !== 200) return { ok: false, detail: `status ${res.status}: ${res.text}` }
        if (res.json?.accepted !== true) return { ok: false, detail: `expected accepted:true, got ${JSON.stringify(res.json)}` }
        if (typeof res.json.result?.at !== 'number') return { ok: false, detail: 'result.at is not a number' }
        return {}
    })

    await list.check('cue-unknown', async () => {
        const res = await postSigned('/api/rig/cue', {
            rig: 1, kind: 'cue', id: rand('unknown'), name: 'conformance-totally-unknown-cue',
            args: {}, from: { id: 'conformance', name: 'conformance' }, sentAt: Date.now()
        })
        if (res.status !== 200) return { ok: false, detail: `expected 200, got ${res.status}: ${res.text}` }
        if (res.json?.accepted !== false || res.json?.reason !== 'unknown-cue') {
            return { ok: false, detail: `expected accepted:false reason:"unknown-cue", got ${JSON.stringify(res.json)}` }
        }
        return {}
    })

    await list.check('cue-duplicate', async () => {
        const cueId = rand('dup')
        const cueBody = {
            rig: 1, kind: 'cue', id: cueId, name: 'ping', args: {},
            from: { id: 'conformance', name: 'conformance' }, sentAt: Date.now()
        }
        const first = await postSigned('/api/rig/cue', cueBody)
        if (first.status !== 200 || first.json?.accepted !== true) {
            return { ok: false, detail: `first send unexpected: ${first.status} ${JSON.stringify(first.json)}` }
        }
        const second = await postSigned('/api/rig/cue', cueBody)
        if (second.status !== 200) return { ok: false, detail: `expected 200, got ${second.status}: ${second.text}` }
        if (second.json?.accepted !== false || second.json?.reason !== 'duplicate') {
            return { ok: false, detail: `expected accepted:false reason:"duplicate", got ${JSON.stringify(second.json)}` }
        }
        return {}
    })

    await list.check('blackout-on', async () => {
        const res = await postSigned('/api/rig/blackout', { rig: 1, kind: 'blackout', on: true, from: { id: 'conformance', name: 'conformance' }, sentAt: Date.now() })
        if (res.status !== 200 || res.json?.blackout !== true) return { ok: false, detail: `${res.status} ${JSON.stringify(res.json)}` }
        const card = await request(url('/api/rig/card'))
        if (card.json?.blackout !== true) return { ok: false, detail: `card.blackout is ${card.json?.blackout}, expected true` }
        return {}
    })

    await list.check('blackout-off', async () => {
        const res = await postSigned('/api/rig/blackout', { rig: 1, kind: 'blackout', on: false, from: { id: 'conformance', name: 'conformance' }, sentAt: Date.now() })
        if (res.status !== 200 || res.json?.blackout !== false) return { ok: false, detail: `${res.status} ${JSON.stringify(res.json)}` }
        const card = await request(url('/api/rig/card'))
        if (card.json?.blackout !== false) return { ok: false, detail: `card.blackout is ${card.json?.blackout}, expected false` }
        return {}
    })

    await list.check('picture-not-yet', async () => {
        const res = await postSigned('/api/rig/picture', {
            rig: 1, kind: 'picture', streamId: rand('stream'), codec: 'h264', transport: 'webrtc',
            from: { id: 'conformance', name: 'conformance' }, signal: {}
        })
        if (res.status !== 200) return { ok: false, detail: `expected 200, got ${res.status}: ${res.text}` }
        if (res.json?.accepted !== false || res.json?.reason !== 'not-yet') {
            return { ok: false, detail: `expected accepted:false reason:"not-yet", got ${JSON.stringify(res.json)}` }
        }
        return {}
    })

    await list.check('members-lists-hello-sender', async () => {
        helloSenderId = rand('member')
        const hello = await postSigned('/api/rig/hello', { rig: 1, kind: 'hello', machine: { id: helloSenderId, name: 'conformance-member-check' } })
        if (hello.status !== 200) return { ok: false, detail: `hello failed: ${hello.status} ${hello.text}` }
        const members = await request(url('/api/rig/members'))
        if (members.status !== 200) return { ok: false, detail: `members failed: ${members.status}` }
        const found = (members.json?.members || []).some(m => m.machine?.id === helloSenderId)
        if (!found) return { ok: false, detail: `sender ${helloSenderId} not in members list: ${JSON.stringify(members.json?.members)}` }
        return {}
    })

    if (KEY) {
        await list.check('room-key-unsigned-403', async () => {
            const id = rand('unsigned')
            const res = await request(url('/api/rig/hello'), { method: 'POST', body: { rig: 1, kind: 'hello', machine: { id } } })
            if (res.status !== 403) return { ok: false, detail: `expected 403, got ${res.status}: ${res.text}` }
            if (!res.json || res.json.error !== 'room-key') return { ok: false, detail: `expected error:"room-key", got ${JSON.stringify(res.json)}` }
            return {}
        })
        await list.check('room-key-signed-ok', async () => {
            const id = rand('signed')
            const res = await postSigned('/api/rig/hello', { rig: 1, kind: 'hello', machine: { id } })
            if (res.status !== 200) return { ok: false, detail: `expected 200, got ${res.status}: ${res.text}` }
            return {}
        })
    } else {
        list.results.push({ name: 'room-key-unsigned-403', status: 'SKIP', detail: 'no --key given' })
        list.results.push({ name: 'room-key-signed-ok', status: 'SKIP', detail: 'no --key given' })
    }

    const summary = list.summary()
    if (args.json) {
        process.stdout.write(`${JSON.stringify({ base: BASE, checks: list.results, ...summary })}\n`)
    } else {
        printTable(list.results, { title: `rig conformance — ${BASE}` })
        process.stdout.write(`\n${summary.pass} PASS, ${summary.fail} FAIL, ${summary.skip} SKIP (of ${summary.total})\n`)
    }
    process.exitCode = summary.fail > 0 ? 1 : 0
}

run().catch((err) => {
    process.stderr.write(`[conformance] fatal: ${String(err && err.stack || err)}\n`)
    process.exit(1)
})
