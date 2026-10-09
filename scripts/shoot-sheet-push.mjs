#!/usr/bin/env node
// Write a shoot sheet onto a server: its photos, then its plan.
//
//   node scripts/shoot-sheet-push.mjs --base https://dev.diiii.xyz --dir ~/my-shoot --key-file ~/my-shoot/.shoot-key
//
// --dir holds plan.json and files/ (webp/jpg/png, names as plan.json uses them).
// The key is read from a file so it never lands in shell history. The key's
// sha256 must already be listed in serverXR/src/routes/shootRoutes.js (or the
// server's SHOOT_KEY_HASHES env var), otherwise every request answers 404.
//
// Writing the plan REPLACES the sheet, crew ticks and notes included. So once
// a sheet exists the script uploads photos only, unless --replace-plan is given.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const arg = (name) => {
    const index = args.indexOf(`--${name}`)
    return index >= 0 ? args[index + 1] : undefined
}
const flag = (name) => args.includes(`--${name}`)
const expand = (p) => (p ? p.replace(/^~(?=$|[\\/])/, process.env.USERPROFILE || process.env.HOME || '~') : p)

const base = String(arg('base') || '').replace(/\/+$/, '')
const dir = expand(arg('dir'))
const keyFile = expand(arg('key-file'))
if (!base || !dir || !keyFile) {
    console.error('usage: node scripts/shoot-sheet-push.mjs --base <https://host> --dir <folder> --key-file <file> [--replace-plan] [--files-only]')
    process.exit(2)
}

const key = fs.readFileSync(keyFile, 'utf8').trim()
const api = `${base}/serverXR/api/shoot/${encodeURIComponent(key)}`
const types = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }

const filesDir = path.join(dir, 'files')
const files = fs.existsSync(filesDir) ? fs.readdirSync(filesDir).filter((f) => types[path.extname(f).toLowerCase()]) : []
let sent = 0
for (const name of files) {
    const response = await fetch(`${api}/files/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': types[path.extname(name).toLowerCase()] },
        body: fs.readFileSync(path.join(filesDir, name))
    })
    if (response.status === 404) {
        console.error('404 — this server does not know the key. Is its hash deployed there?')
        process.exit(1)
    }
    if (!response.ok) {
        console.error(`${name}: ${response.status} ${await response.text()}`)
        process.exit(1)
    }
    sent++
}
console.log(`photos: ${sent}/${files.length} uploaded`)

if (flag('files-only')) process.exit(0)

const existing = await fetch(api)
if (existing.ok && !flag('replace-plan')) {
    console.log('plan: a sheet already exists here — left as it is (crew edits kept). Pass --replace-plan to overwrite it.')
    process.exit(0)
}
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'))
const response = await fetch(`${api}/plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan })
})
if (!response.ok) {
    console.error(`plan: ${response.status} ${await response.text()}`)
    process.exit(1)
}
const sheet = await response.json()
console.log(`plan: written, revision ${sheet.rev}`)
console.log(`open: ${base}/shoot/<key>   (the key is in ${keyFile})`)
