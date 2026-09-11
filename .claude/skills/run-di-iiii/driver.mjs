#!/usr/bin/env node
/**
 * driver.mjs — reach into a running di.iiii and look at it as a PERSON.
 *
 * `npm run verify:surfaces` already sweeps the public surfaces of a tier and
 * reports what a careful visitor would notice. It signs in as nobody, so
 * everything behind the gate — the editor, Raw, a space's room, a private
 * conversation — is invisible to it, and so is anything that needs two people
 * in the same place at the same time.
 *
 * That is this file's whole job: a signed-in session, and a second one beside
 * it. Everything here was written while walking `iiii`'s private conversations
 * with two accounts in two browsers (2026-09-11) — every selector below is one
 * that a straightforward guess got wrong.
 *
 * THREE COMMANDS
 *   account <name> [--spaces main]   make (or reuse) an account and scope it
 *   look <path> [--as <name>]        open one page, screenshot it, say what is
 *                                    on it and whether anything threw
 *   pair <path> [--as a,b]           the same page, two people, side by side
 *
 * AND AN IMPORT PATH, for a flow with steps in it:
 *   import { person, shot, readOut } from './driver.mjs'
 *
 * Everything is relative to the repo root; run it from there.
 */
import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const REPO = process.cwd()
const PASSWORD = 'driver-passphrase-9x'

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    if (i === -1) return fallback
    const next = process.argv[i + 1]
    return next && !next.startsWith('--') ? next : true
}

const BASE = String(arg('base', 'http://localhost:5173'))
// The node-side calls go straight at serverXR. Vite proxies /serverXR too, but
// a direct call cannot be confused by a proxy that is not up yet.
const API = String(arg('api', 'http://localhost:4000/serverXR'))
const OUT = String(arg('out', '/tmp/di-iiii-shots'))

// 390x844 at DPR 3 is the phone this platform is actually opened on, and DPR 1
// hides canvas faults — see docs/ai/verification-charter.md.
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }

// ── the database, wherever this checkout keeps it ────────────────────────────
// A fresh clone writes to serverXR/data; a worktree pointed at a shared local
// tier says so in serverXR/.env.local, which overrides serverXR/.env.
const readEnv = (file) => {
    try {
        return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((acc, line) => {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) return acc
            const at = trimmed.indexOf('=')
            if (at === -1) return acc
            acc[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')
            return acc
        }, {})
    } catch { return {} }
}

export const dbPath = () => {
    const serverRoot = path.join(REPO, 'serverXR')
    const env = { ...readEnv(path.join(serverRoot, '.env')), ...readEnv(path.join(serverRoot, '.env.local')) }
    if (env.DB_PATH) return path.resolve(serverRoot, env.DB_PATH)
    return path.resolve(serverRoot, env.DATA_ROOT || './data', 'di.db')
}

// ── an account ──────────────────────────────────────────────────────────────
// Registering needs no mail and issues a session immediately; the SPACES a
// person can reach are not settable over the API without an admin, so they go
// in the same way the server reads them.
export const account = async (username, spaces = []) => {
    const answer = await fetch(`${API}/api/auth/password/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: PASSWORD, displayName: username })
    })
    const body = await answer.json().catch(() => ({}))
    // 409 is "that name is taken" — by a previous run of this, almost always.
    if (!answer.ok && answer.status !== 409) throw new Error(`${username}: ${body.error || answer.status}`)

    const db = new DatabaseSync(dbPath())
    if (spaces.length) db.prepare('update users set spaces = ? where username = ?').run(JSON.stringify(spaces), username)
    const row = db.prepare('select id, username, spaces from users where username = ?').get(username)
    db.close()
    if (!row) throw new Error(`${username}: registered but not in ${dbPath()} — is the server using a different data root?`)
    return { id: row.id, username, password: PASSWORD, spaces: row.spaces }
}

// ── one person, in a browser ────────────────────────────────────────────────
export const person = async (browser, { as = null, phone = false } = {}) => {
    const context = await browser.newContext(phone ? PHONE : DESKTOP)
    const page = await context.newPage()
    page.problems = []
    page.on('pageerror', (e) => page.problems.push(`page error: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console: ${m.text().slice(0, 200)}`) })

    if (as) {
        await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
        // The card is lazy — the fields do not exist on the first paint.
        await page.getByLabel('Email or username').waitFor({ timeout: 20000 })
        await page.getByLabel('Email or username').fill(as)
        await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
        // There are TWO controls called "Sign in" — the form's submit and the
        // provider card's icon button. Scope to the form or Playwright refuses.
        await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
        // Assert it actually took. A refused sign-in leaves the page on a
        // GUEST session, which renders perfectly well — the first version of
        // this file walked a whole two-person flow with one side quietly signed
        // in as nobody, and the only tell was a 401 in the console.
        let signedIn = false
        for (let i = 0; i < 30 && !signedIn; i += 1) {
            await page.waitForTimeout(500)
            signedIn = await page.evaluate(async () => {
                const answer = await fetch('/serverXR/api/auth/session', { credentials: 'include' })
                const session = await answer.json()
                return Boolean(session.authenticated && session.type !== 'guest')
            })
        }
        if (!signedIn) {
            throw new Error(`could not sign in as "${as}" — does that account exist, with the password ${PASSWORD}? Make it with:\n  node .claude/skills/run-di-iiii/driver.mjs account ${as} --spaces main`)
        }
    }
    return page
}

// ── looking, and reading back ───────────────────────────────────────────────
export const shot = async (page, name) => {
    fs.mkdirSync(OUT, { recursive: true })
    const file = path.join(OUT, `${name}.png`)
    await page.screenshot({ path: file })
    return file
}

export const readOut = async (page) => (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n').trim()

export const open = async (page, where, { wait = 2500 } = {}) => {
    // NEVER `networkidle` here: socket.io holds a connection open on every
    // surface that has presence in it, so the wait never settles.
    await page.goto(where.startsWith('http') ? where : `${BASE}${where}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(Number(wait))
    return page
}

// The composer on any MUI multiline input has a SECOND, hidden textarea beside
// it (the one that measures the height). Take the visible one.
export const composer = (page) => page.locator('textarea:not([aria-hidden="true"]), input[type="text"]').first()

const report = async (page, label) => {
    const file = await shot(page, label)
    console.log(`\n── ${label} ─────────────────────────────`)
    console.log(await readOut(page))
    console.log(`\n   screenshot: ${file}`)
    if (page.problems.length) {
        console.log('   PROBLEMS:')
        for (const p of page.problems.slice(0, 12)) console.log(`     ${p}`)
    }
    return page.problems.length
}

// ── the three commands ──────────────────────────────────────────────────────
// Positionals are what is left once every --flag and the value after it is
// taken out. Written the long way because the short way (filter on `--`) eats
// the command whenever a flag's value happens to look like one.
const positionals = (() => {
    const out = []
    const argv = process.argv.slice(2)
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i].startsWith('--')) {
            if (argv[i + 1] && !argv[i + 1].startsWith('--')) i += 1
            continue
        }
        out.push(argv[i])
    }
    return out
})()
const [command, target] = positionals

const main = async () => {
    if (command === 'account') {
        const spaces = String(arg('spaces', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
        const made = await account(target, spaces)
        console.log(JSON.stringify(made, null, 2))
        return 0
    }

    if (command === 'look' || command === 'pair') {
        const phone = Boolean(arg('phone', false))
        const names = String(arg('as', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
        const browser = await chromium.launch()
        let problems = 0
        try {
            const who = command === 'pair' ? names : [names[0] || null]
            const pages = []
            for (const name of who) pages.push(await person(browser, { as: name, phone }))
            for (const [i, page] of pages.entries()) {
                await open(page, target || '/', { wait: arg('wait', 2500) })
                problems += await report(page, `${(target || 'root').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}-${who[i] || 'guest'}${phone ? '-phone' : ''}`)
            }
        } finally {
            await browser.close()
        }
        return problems ? 1 : 0
    }

    console.log(`usage:
  node .claude/skills/run-di-iiii/driver.mjs account <name> [--spaces main]
  node .claude/skills/run-di-iiii/driver.mjs look <path> [--as <name>] [--phone] [--wait ms]
  node .claude/skills/run-di-iiii/driver.mjs pair <path> --as <a>,<b> [--phone]

  --base ${BASE}   --api ${API}   --out ${OUT}`)
    return 2
}

// Imported for a flow of your own? Then do nothing on load.
if (process.argv[1] && process.argv[1].endsWith('driver.mjs')) {
    main().then((code) => process.exit(code)).catch((error) => {
        console.error(error.message)
        process.exit(1)
    })
}
