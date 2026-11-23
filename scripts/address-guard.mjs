#!/usr/bin/env node
// address-guard — run BEFORE and AFTER any change to our public addresses
// (DNS, Cloudflare rules, redirects, sign-in callbacks, cookie host, env).
//
// Why (2026-11-22): a page forward from di-studio.xyz to diiii.xyz went live while
// GitHub/Google sign-in still returned to di-studio.xyz. The session cookie is
// host-only, so every sign-in ended signed out on diiii.xyz and Taron's push got 401.
// The forward was a permanent 301, so his browser kept jumping even after the undo.
//
// What it checks, per name in address-guard.names.json:
//   1. the API answers:          <name>/serverXR/api/health -> 200 + ok:true
//   2. the installer answers:    <name>/get -> 200 (when the name serves it)
//   3. sign-in stays on one host: each provider's start URL sends the browser back
//      (redirect_uri) to the SAME host the page lives on after any page jump
//   4. page jumps are temporary: a cross-host 301/308 from a page is a failure unless
//      the name is marked "settled" (a permanent jump is cached by browsers for good)
//
//   5. a whole-host alias ("aliasOf", e.g. www. -> apex) only has to jump to its apex
//
// Exit 0 = all pass, 1 = a failure (printed), 2 = usage. No writes anywhere.
// Usage: node scripts/address-guard.mjs [--names file.json] [--only host] [--json]

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const here = path.dirname(fileURLToPath(import.meta.url))
const PERMANENT = new Set([301, 308])

/** Pure judge: facts measured for one name -> list of failures (strings). */
export function judgeName(entry, facts) {
    const fails = []
    const host = entry.host
    if (entry.aliasOf) {
        // A whole-host alias (www. -> apex): it must jump, and only to its apex.
        const to = facts.page?.location ? new URL(facts.page.location, `https://${host}/`).host : ''
        if (!(facts.page?.status >= 300 && facts.page?.status < 400) || to !== entry.aliasOf) {
            fails.push(`${host}: should jump to ${entry.aliasOf}, gave ${facts.page?.status ?? 'unreachable'} ${to}`.trim())
        }
        return fails
    }
    if (facts.health?.status !== 200 || facts.health?.ok !== true) {
        fails.push(`${host}: API health is ${facts.health?.status ?? 'unreachable'}, not 200 ok`)
    }
    if (entry.installer !== false && facts.get && facts.get.status !== 200) {
        fails.push(`${host}: installer /get is ${facts.get.status}, not 200`)
    }
    // Where does a visitor's page end up? (after a page jump, if any)
    let pageHost = host
    const jump = facts.page
    if (jump && jump.status >= 300 && jump.status < 400 && jump.location) {
        const toHost = new URL(jump.location, `https://${host}/`).host
        if (toHost !== host) {
            pageHost = toHost
            if (PERMANENT.has(jump.status) && !entry.settled) {
                fails.push(`${host}: pages jump to ${toHost} with a permanent ${jump.status}; browsers keep it for good — use 302/307 until the move is proven, then mark "settled"`)
            }
        }
    }
    for (const [provider, s] of Object.entries(facts.signin || {})) {
        if (!s || s.status === 404) continue // provider not on this server
        if (!s.redirectUri) {
            fails.push(`${host}: ${provider} sign-in start gave ${s.status} with no redirect_uri`)
            continue
        }
        const backHost = new URL(s.redirectUri).host
        if (backHost !== pageHost) {
            fails.push(`${host}: ${provider} sign-in returns to ${backHost} but the page lives on ${pageHost}; the cookie lands on the wrong host and the person stays signed out`)
        }
    }
    return fails
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function probe(url, tries = 3) {
    try {
        const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
        if (res.status === 429 && tries > 1) { // the server's rate limit; wait as told, then ask again
            await sleep(Math.min(30, Number(res.headers.get('retry-after')) || 5) * 1000)
            return probe(url, tries - 1)
        }
        const out = { status: res.status, location: res.headers.get('location') || '' }
        if ((res.headers.get('content-type') || '').includes('json')) {
            try { out.ok = (await res.json()).ok } catch { /* not json */ }
        }
        return out
    } catch (err) {
        return { status: null, error: String(err?.cause?.code || err?.message || err) }
    }
}

async function measure(entry) {
    const base = `https://${entry.host}`
    const api = entry.api || `${base}/serverXR`
    const [health, get, page, ...signins] = await Promise.all([
        probe(`${api}/api/health`),
        entry.installer === false ? null : probe(`${base}/get`),
        probe(`${base}${entry.pagePath || '/'}`),
        ...(entry.providers || ['github', 'google']).map((p) => probe(`${api}/api/auth/${p}`))
    ])
    const signin = {}
    ;(entry.providers || ['github', 'google']).forEach((p, i) => {
        const s = signins[i]
        let redirectUri = ''
        try { redirectUri = new URL(s.location).searchParams.get('redirect_uri') || '' } catch { /* none */ }
        signin[p] = { status: s.status, redirectUri }
    })
    return { health, get, page, signin }
}

async function main() {
    const { values } = parseArgs({
        options: { names: { type: 'string' }, only: { type: 'string' }, json: { type: 'boolean' } }
    })
    const file = values.names || path.join(here, 'address-guard.names.json')
    const names = JSON.parse(await readFile(file, 'utf8')).names.filter((n) => !values.only || n.host === values.only)
    if (!names.length) { console.error('address-guard: no names to check'); process.exit(2) }
    const results = [] // one name at a time: a burst trips the servers' rate limit (429)
    for (const n of names) results.push({ host: n.host, fails: judgeName(n, await measure(n)) })
    const fails = results.flatMap((r) => r.fails)
    if (values.json) console.log(JSON.stringify({ results, failures: fails.length }, null, 2))
    else {
        for (const r of results) console.log(`${r.fails.length ? 'FAIL' : 'ok  '} ${r.host}`)
        for (const f of fails) console.log(`  - ${f}`)
        console.log(fails.length
            ? `${fails.length} problem(s) on ${results.filter((r) => r.fails.length).length} of ${results.length} addresses — do not change more until fixed`
            : `${results.length} of ${results.length} addresses pass: API, installer, sign-in host, page jumps`)
    }
    process.exit(fails.length ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
