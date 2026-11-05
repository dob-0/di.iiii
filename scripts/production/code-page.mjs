#!/usr/bin/env node
/**
 * code-page.mjs — put one local HTML file on di.iiii as a code page project (create it, or update it).
 *
 *   node scripts/production/code-page.mjs --space cinema-house --slug plan-v3 --title "…" --file page.html [--tier dev] [--private] [--dry-run]
 *
 * - Login: the stored session in ~/.config/di/credentials.json (`di login` once); the token is never printed.
 * - Exists (GET /api/projects/<slug>/document is 200): only index.html of the code page is replaced.
 *   Missing: POST /api/spaces/<space>/projects with the exact slug, then the page is written.
 * - Before an update, the old document is saved to ~/di-backups/code-page/<slug>-<tier>-<time>.json (undo = PUT it back).
 * - After the write it reads the page back and checks the sha1 of index.html; exit 1 on any mismatch or HTTP error.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

function args(argv) {
    const a = { tier: 'dev' }
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i]
        if (k === '--private') a.private = true
        else if (k === '--dry-run') a.dryRun = true
        else if (k.startsWith('--')) a[k.slice(2)] = argv[++i]
    }
    return a
}
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8)

async function main() {
    const a = args(process.argv.slice(2))
    if (!a.space || !a.slug || !a.file) { console.error('usage: code-page.mjs --space S --slug ID --title T --file F.html [--tier dev] [--private] [--dry-run]'); process.exit(2) }
    const html = readFileSync(a.file, 'utf8')
    const cred = JSON.parse(readFileSync(join(homedir(), '.config/di/credentials.json'), 'utf8'))[a.tier]
    if (!cred?.token) { console.error(`code-page: no stored login for ${a.tier} (run: di whoami)`); process.exit(1) }
    const base = cred.base.replace(/\/$/, '')
    const H = { Authorization: `Bearer ${cred.token}`, 'User-Agent': 'di-code-page', 'Content-Type': 'application/json' }
    const route = `/api/projects/${encodeURIComponent(a.slug)}/document`
    let got = await fetch(base + route, { headers: H })
    const exists = got.ok
    if (!exists && got.status !== 404) { console.error(`code-page: GET ${route} -> ${got.status}`); process.exit(1) }
    if (a.dryRun) { console.log(`code-page: dry run — ${exists ? 'would update' : 'would create'} ${a.space}/${a.slug} on ${a.tier}, page ${html.length} chars sha ${sha(html)}`); return }
    let doc
    if (exists) {
        doc = (await got.json()); doc = doc.document ?? doc
        if (doc.projectMeta?.spaceId && doc.projectMeta.spaceId !== a.space) { console.error(`code-page: ${a.slug} lives in space ${doc.projectMeta.spaceId}, not ${a.space}; refusing`); process.exit(1) }
        const dir = join(homedir(), 'di-backups/code-page'); mkdirSync(dir, { recursive: true })
        const bak = join(dir, `${a.slug}-${a.tier}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
        writeFileSync(bak, JSON.stringify(doc)); console.log(`code-page: backup ${bak}`)
    } else {
        const body = { title: a.title || a.slug, slug: a.slug, ...(a.private ? { visibility: 'private' } : {}) }
        const made = await fetch(`${base}/api/spaces/${encodeURIComponent(a.space)}/projects`, { method: 'POST', headers: H, body: JSON.stringify(body) })
        if (!made.ok) { console.error(`code-page: create -> ${made.status} ${(await made.text()).slice(0, 300)}`); process.exit(1) }
        const j = await made.json(); doc = j.document ?? (await (await fetch(base + route, { headers: H })).json()).document
        console.log(`code-page: created ${a.space}/${a.slug}`)
    }
    const ps = doc.presentationState || {}
    doc.presentationState = { ...ps, mode: 'code', entryView: 'code', codeSourceType: 'html', codeUrl: '', codeFiles: [{ name: 'index.html', content: html }] }
    if (a.title && doc.projectMeta) doc.projectMeta.title = a.title
    const put = await fetch(base + route, { method: 'PUT', headers: H, body: JSON.stringify(doc) })
    if (!put.ok) { console.error(`code-page: PUT -> ${put.status} ${(await put.text()).slice(0, 300)}`); process.exit(1) }
    const back = await (await fetch(base + route, { headers: H })).json()
    const page = (back.document ?? back).presentationState?.codeFiles?.find((f) => f.name === 'index.html')?.content || ''
    const ok = sha(page) === sha(html)
    console.log(`code-page: ${exists ? 'updated' : 'written'} on ${a.tier} (${put.status}); read back sha ${sha(page)} ${ok ? '= ' : '!= '}${sha(html)}`)
    console.log(`code-page: ${new URL(base).origin}/${a.space}/p/${a.slug}`)
    if (!ok) process.exit(1)
}

main().catch((e) => { console.error('code-page:', e.message); process.exit(1) })
