#!/usr/bin/env node
/**
 * fetch-equipment-media.mjs — the makers' photos and documents behind the item cards,
 * re-fetched from their recorded URLs, checked against their recorded sha256, and kept on the
 * studio's LOCAL install only. docs/architecture/RIG_BUILD.md §13.8.
 *
 *   node scripts/rigbuild/fetch-equipment-media.mjs                 # verify: fetch every file, compare sha256
 *   node scripts/rigbuild/fetch-equipment-media.mjs --record        # first fetch: write sha256/bytes/mime/fetched
 *                                                                   # where none is recorded (never overwrites one)
 *   node scripts/rigbuild/fetch-equipment-media.mjs --upload        # also store each checked file in the local
 *                                                                   # install's space (media.json store.space) and
 *                                                                   # record its asset id there
 *        [--api https://local.thedi.studio/serverXR] [--token-file <env>] [--only <item id>]
 *        [--cache ~/.local/share/di.iiii/equipment-media] [--dry-run]
 *
 * THE LAW. The files are the makers' copyright. Only a file the maker OFFERS for download
 * (`offer: 'download'`) is kept, as internal reference; a photo on a shop page or anything with
 * unclear terms is `offer: 'link'` — checked that it still answers, dated, never copied. So:
 *   - the bytes never enter the repository: the cache must be outside it (refused otherwise),
 *     and media.json holds only url, sha256, size, date and the local asset id;
 *   - they are uploaded ONLY to a local install (localhost, *.localhost, local.thedi.studio) —
 *     a hosted tier is refused by host name;
 *   - a file whose bytes no longer match the recorded sha256 is NOT stored and the run exits 1:
 *     the maker changed it, and a person decides whether the new one is the same document.
 *
 * Exit codes: 0 all checked (and stored), 1 a mismatch or a failed fetch/upload, 2 usage.
 * The token is read (DI_API_TOKEN, --token-file, ~/.di/di.env), handed to fetch, never printed.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { isLocalApi, mediaProblems } from '../../src/rigbuild/items/mediaRules.js'
import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const MEDIA_FILE = path.join(ROOT, 'src/rigbuild/items/media.json')
export const DEFAULT_CACHE = path.join(os.homedir(), '.local/share/di.iiii/equipment-media')
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const today = () => new Date().toISOString().slice(0, 10)

export const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' }

/** What the bytes are, by their first bytes — a server's Content-Type is not trusted. */
export const sniff = (buf) => {
    if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf'
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
    if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
    if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'image/gif'
    return null
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/** Is `dir` inside the repository? The makers' bytes must never land there. */
export const insideRepo = (dir, root = ROOT) => {
    const rel = path.relative(path.resolve(root), path.resolve(dir))
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * The verdict for one file against its record. Pure.
 * @returns {{state: 'ok'|'recorded'|'mismatch'|'bad-type', record?: object, message: string}}
 */
export const judge = (entry, buf, { record = false, date = today() } = {}) => {
    const mime = sniff(buf)
    const kindOk = entry.kind === 'photo' ? /^image\//.test(mime || '') : mime === 'application/pdf'
    if (!kindOk) return { state: 'bad-type', message: `expected ${entry.kind === 'photo' ? 'an image' : 'a PDF'}, got ${mime || 'unknown bytes'} (${buf.length} B)` }
    const hash = sha256(buf)
    if (entry.sha256) {
        if (entry.sha256 === hash) return { state: 'ok', message: `sha256 ok ${hash.slice(0, 12)}` }
        return { state: 'mismatch', message: `sha256 changed: recorded ${entry.sha256.slice(0, 12)}, now ${hash.slice(0, 12)} — not stored; a person decides` }
    }
    if (!record) return { state: 'mismatch', message: 'no sha256 recorded — run with --record for a first fetch' }
    return { state: 'recorded', record: { sha256: hash, bytes: buf.length, mime, fetched: date }, message: `recorded ${hash.slice(0, 12)} (${buf.length} B)` }
}

const fetchBytes = async (entry) => {
    const headers = { 'User-Agent': UA, Accept: entry.kind === 'photo' ? 'image/*,*/*;q=0.8' : 'application/pdf,*/*;q=0.8' }
    if (entry.page) headers.Referer = entry.page
    let last = null
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(entry.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(180000) })
            if (!res.ok) { last = `HTTP ${res.status}`; if (res.status < 500) break; continue }
            return { buf: Buffer.from(await res.arrayBuffer()) }
        } catch (e) {
            last = e?.cause?.code || e?.message || String(e)
        }
    }
    return { error: last }
}

const parseArgs = (argv) => {
    const out = { flags: new Set() }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (['--record', '--upload', '--dry-run'].includes(a)) out.flags.add(a.slice(2))
        else if (['--api', '--token-file', '--only', '--cache'].includes(a)) out[a.slice(2)] = argv[++i]
        else if (a === '--help' || a === '-h') out.help = true
        else { console.error(`unknown argument ${a}`); process.exit(2) }
    }
    return out
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 30).join('\n')); return }
    const record = args.flags.has('record')
    const upload = args.flags.has('upload')
    const dry = args.flags.has('dry-run')
    const cache = path.resolve(args.cache || DEFAULT_CACHE)
    if (insideRepo(cache)) { console.error(`refused: the cache ${cache} is inside the repository — the makers' files never live there`); process.exit(2) }
    const api = String(args.api || DEFAULT_API).replace(/\/+$/, '')
    if (upload && !isLocalApi(api)) { console.error(`refused: ${api} is not a local install — the makers' files are internal reference, never on a hosted tier`); process.exit(2) }

    const data = JSON.parse(fs.readFileSync(MEDIA_FILE, 'utf8'))
    const shape = mediaProblems(data)
    if (shape.length) { console.error(`media.json has problems:\n  ${shape.join('\n  ')}`); process.exit(1) }
    const space = data.store.space
    let client = null
    if (upload) {
        const token = readToken(args['token-file'])
        if (!token) { console.error('no ADMIN_API_TOKEN (DI_API_TOKEN, --token-file, ~/.di/di.env)'); process.exit(2) }
        client = makeClient(api, token)
    }

    let failed = 0
    let changed = false
    const rows = []
    for (const [id, item] of Object.entries(data.items)) {
        if (args.only && args.only !== id) continue
        for (const entry of item.media || []) {
            // A link is never copied: only checked that it still answers, and dated.
            if (entry.offer === 'link') {
                const res = await fetch(entry.url, { method: 'GET', headers: { 'User-Agent': UA, Range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: e?.cause?.code || e?.message }))
                if (res.body?.cancel) await res.body.cancel().catch(() => {})
                if (res.ok || res.status === 206) {
                    if (record && entry.checked !== today() && !dry) { entry.checked = today(); changed = true }
                    rows.push([id, entry.kind, 'ok', `link answers (HTTP ${res.status}) — linked, not copied`, entry.url])
                } else { failed++; rows.push([id, entry.kind, 'LINK DEAD', `HTTP ${res.status}`, entry.url]) }
                continue
            }
            const got = await fetchBytes(entry)
            if (got.error) { failed++; rows.push([id, entry.kind, 'FETCH FAILED', got.error, entry.url]); continue }
            const verdict = judge(entry, got.buf, { record })
            if (verdict.state === 'bad-type' || verdict.state === 'mismatch') { failed++; rows.push([id, entry.kind, verdict.state.toUpperCase(), verdict.message, entry.url]); continue }
            if (verdict.record && !dry) { Object.assign(entry, verdict.record); changed = true }
            const hash = entry.sha256 || verdict.record?.sha256
            const ext = EXT[sniff(got.buf)] || ''
            const file = path.join(cache, id, `${hash}${ext}`)
            if (!dry) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, got.buf) }
            let note = verdict.message
            if (upload) {
                const have = entry.asset ? await client.get(`/api/spaces/${encodeURIComponent(space)}/assets/${encodeURIComponent(entry.asset)}`).catch(() => ({ ok: false })) : { ok: false }
                if (have.ok || have.status === 200) note += ` · stored ${entry.asset.slice(0, 12)}`
                else if (dry) note += ' · would store'
                else {
                    const form = new FormData()
                    const name = `${id}--${entry.kind}--${hash.slice(0, 12)}${ext}`
                    form.append('asset', new Blob([got.buf], { type: sniff(got.buf) }), name)
                    const res = await client.post(`/api/spaces/${encodeURIComponent(space)}/assets`, form)
                    if (!res.ok || !res.body?.assetId) { failed++; rows.push([id, entry.kind, 'UPLOAD FAILED', `HTTP ${res.status} ${String(res.text).slice(0, 120)}`, entry.url]); continue }
                    if (entry.asset !== res.body.assetId) { entry.asset = res.body.assetId; changed = true }
                    note += ` · stored ${res.body.assetId.slice(0, 12)}${res.body.assetId !== hash ? ' (image metadata scrubbed by the server)' : ''}`
                }
            }
            rows.push([id, entry.kind, 'ok', note, entry.url])
        }
    }
    if (changed && !dry) fs.writeFileSync(MEDIA_FILE, `${JSON.stringify(data, null, 2)}\n`)
    for (const r of rows) console.log(`${r[0].padEnd(12)} ${r[1].padEnd(9)} ${r[2].padEnd(13)} ${r[3]}${r[2] === 'ok' ? '' : `\n${' '.repeat(36)}${r[4]}`}`)
    const ok = rows.filter((r) => r[2] === 'ok').length
    console.log(`\n${ok}/${rows.length} files checked${upload ? ` and held by ${api} space ${space}` : ''}; cache ${cache}${changed ? '; media.json updated' : ''}${dry ? ' (dry run: nothing written)' : ''}`)
    if (failed) { console.error(`${failed} file(s) failed — see above`); process.exit(1) }
}

const invokedAs = () => { try { return fs.realpathSync(process.argv[1]) } catch { return null } }
if (process.argv[1] && invokedAs() === fs.realpathSync(fileURLToPath(import.meta.url))) {
    main().catch((e) => { console.error(e?.stack || e); process.exit(1) })
}
