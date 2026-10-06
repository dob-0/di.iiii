#!/usr/bin/env node
/**
 * space-publish.mjs — one command to put this machine's edits of one space on the dev tier,
 * restart its show on the wall clock, and prove what a visitor now sees.
 *
 *   node scripts/space-publish.mjs --space moxir [--dry-run] [--no-clock]
 *
 * The three steps, each an existing tool — this script only puts them in order and stops at
 * the first one that fails, saying which:
 *   1. tier-sync.mjs --from local --to dev --space <id> --changed
 *      Pushes what differs; refuses a project changed on BOTH sides (that is a person's call),
 *      never widens a private project (project-visibility-lib.mjs).
 *   2. rigbuild/show-clock.mjs --epoch now on the space's published project, when that project
 *      has a cue list. A pushed document replaces the one whose op log held the clock, so the
 *      show would otherwise stop on the tier. Skipped with --no-clock.
 *   3. The visitor check, with NO token: the published project answers 200; every project the
 *      dev tier holds private answers 404 on its meta and document, and is absent from the
 *      space's list. Any leak exits 1.
 *
 * Tokens: serverXR/.env.local (API_TOKEN for local, LIVE_API_TOKEN for dev), as tier-sync.
 * Production is not a target here, on purpose: prod is promoted only on the owner's word.
 * Design: docs/architecture/RIG_BUILD.md §16 ("Publishing an update to dev").
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEV_API = 'https://dev.diiii.xyz/serverXR'

export const parseArgs = (argv) => {
    const args = { space: null, dryRun: false, clock: true }
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--space') args.space = argv[++i]
        else if (argv[i] === '--dry-run') args.dryRun = true
        else if (argv[i] === '--no-clock') args.clock = false
        else throw new Error(`unknown option ${argv[i]} (known: --space <id> --dry-run --no-clock)`)
    }
    if (!args.space) throw new Error('--space <id> is required')
    return args
}

// What the visitor check must see, from the dev tier's own (token) view of the space.
export const visitorExpectations = ({ space, projects }) => ({
    published: space?.publishedProjectId || null,
    hidden: projects.filter((p) => p.visibility === 'private').map((p) => p.id)
})

// Compare what a visitor got against the expectations; returns the list of problems.
export const visitorProblems = ({ expect, listed, status }) => {
    const problems = []
    if (expect.published && status[`meta:${expect.published}`] !== 200) problems.push(`published project ${expect.published} answers ${status[`meta:${expect.published}`]} to a visitor, not 200`)
    for (const id of expect.hidden) {
        if (listed.includes(id)) problems.push(`private project ${id} is in the visitor's list`)
        for (const what of ['meta', 'document']) {
            if (status[`${what}:${id}`] !== 404) problems.push(`private project ${id} ${what} answers ${status[`${what}:${id}`]} to a visitor, not 404`)
        }
    }
    return problems
}

const readEnv = () => {
    const file = path.join(ROOT_DIR, 'serverXR', '.env.local')
    const env = fs.existsSync(file)
        ? Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
            const i = l.indexOf('=')
            return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
        }))
        : {}
    return { ...env, ...Object.fromEntries(['LIVE_API_TOKEN'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) }
}

const run = (label, script, args, extraEnv = {}) => {
    console.log(`\n── ${label}\n   node ${path.relative(ROOT_DIR, script)} ${args.join(' ')}`)
    const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT_DIR, stdio: 'inherit', env: { ...process.env, ...extraEnv } })
    return r.status === 0
}

const get = async (pathname, token) => {
    const res = await fetch(DEV_API + pathname, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30000) })
    let body = null
    try { body = await res.json() } catch { /* a 404 page may not be JSON */ }
    return { status: res.status, body }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const env = readEnv()
    if (!env.LIVE_API_TOKEN) throw new Error('LIVE_API_TOKEN missing (serverXR/.env.local or the environment)')

    const syncArgs = ['--from', 'local', '--to', 'dev', '--space', args.space, '--changed', ...(args.dryRun ? ['--dry-run'] : [])]
    if (!run('1/3 push what changed', path.join(ROOT_DIR, 'scripts', 'tier-sync.mjs'), syncArgs)) {
        throw new Error('step 1 (tier-sync) failed or refused a project — read its output above; nothing after it ran')
    }

    const space = (await get(`/api/spaces/${args.space}`, env.LIVE_API_TOKEN)).body?.space
    const projects = (await get(`/api/spaces/${args.space}/projects`, env.LIVE_API_TOKEN)).body?.projects || []
    const expect = visitorExpectations({ space, projects })

    if (args.clock && expect.published && !args.dryRun) {
        const ok = run('2/3 restart the show clock', path.join(ROOT_DIR, 'scripts', 'rigbuild', 'show-clock.mjs'),
            ['--api', DEV_API, '--project', expect.published, '--epoch', 'now'], { DI_API_TOKEN: env.LIVE_API_TOKEN })
        if (!ok) console.log('   (no clock: the published project has no cue list that fires a look — the room shows the document as saved)')
    } else {
        console.log(`\n── 2/3 show clock skipped (${args.dryRun ? 'dry run' : !args.clock ? '--no-clock' : 'no published project'})`)
    }

    console.log('\n── 3/3 what a visitor sees (no token)')
    const listed = ((await get(`/api/spaces/${args.space}/projects`)).body?.projects || []).map((p) => p.id)
    const status = {}
    for (const id of [expect.published, ...expect.hidden].filter(Boolean)) {
        status[`meta:${id}`] = (await get(`/api/projects/${id}`)).status
        status[`document:${id}`] = (await get(`/api/projects/${id}/document`)).status
    }
    const problems = visitorProblems({ expect, listed, status })
    console.log(`   space public: ${space?.isPublic ? 'yes' : 'NO'} · published: ${expect.published || '—'} · visitor sees: ${listed.join(', ') || 'nothing'}`)
    console.log(`   private, hidden from visitors: ${expect.hidden.join(', ') || 'none'}`)
    if (problems.length) {
        problems.forEach((p) => console.log(`   ✗ ${p}`))
        throw new Error(`${problems.length} visitor problem(s) — see above`)
    }
    console.log(`   ✓ visitor view as intended\n\n${args.dryRun ? 'dry run: nothing written' : `live: https://dev.diiii.xyz/${args.space}`}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`\nspace-publish: ${error.message}`)
        process.exit(1)
    })
}
