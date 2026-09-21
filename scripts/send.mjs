/**
 * send.mjs — one command for the content line: this machine's space, up a tier.
 *
 *   node scripts/send.mjs <space>                 # to the rehearsal tier (dev)
 *   node scripts/send.mjs <space> --dry-run       # say what would change, write nothing
 *   node scripts/send.mjs <space> --as-proposal   # ask for approval even if you may apply
 *
 * It does the two steps that were always done by hand, and nothing else:
 * exports the space from this machine's data root as one `.diiii` file, then
 * posts that file to the target tier's proposal endpoint. The SERVER decides
 * what happens to it — a person on the space's trusted list has it applied
 * (restore point first), anyone else has it held as a `content.apply` approval
 * the inner bot shows with Apply and Reject. That is why there is one command
 * and not two: who you are is not a flag you pass.
 *
 * What it deliberately does not do: reach into a hosted tier's data root (a
 * space is exported where it is edited — on the machine that holds it), decide
 * that something is ready (a person looks at the tier, always), or promote to
 * production (--allow-production exists for the owner's word, and for nothing
 * else).
 *
 * Source of truth for the two halves: scripts/space-bundle.mjs (export) and
 * scripts/space-proposal.mjs (propose). This file owns no logic of its own.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Both halves are loaded inside send(), never at module scope: space-bundle.mjs
// reaches for `node:sqlite`, which Vite's test transform cannot load, and the
// decisions above it (which tier, propose or apply, production refused) are
// worth testing without a database anywhere near them. Same reason
// space-bundle.test.js spawns its script rather than importing it.

// Mirrors SLUG_REGEX in scripts/space-bundle.mjs — kept here so the refusals
// can be read and tested without loading the export machinery. sendRefusals
// in send.test.js spawns the real script to prove the two still agree.
const SPACE_ID_RE = /^[a-z0-9-]{3,48}$/

const SITES = {
    local: null, // resolved from the environment by space-proposal.mjs
    dev: 'https://dev.diiii.xyz',
    prod: 'https://diiii.xyz'
}

const fail = (message) => { const error = new Error(message); error.userFacing = true; throw error }

export const parseSendArgs = (argv) => {
    const args = {
        space: null,
        to: 'dev',
        dataRoot: null,
        from: null,
        dryRun: false,
        asProposal: false,
        overwriteNewer: false,
        allowProduction: false,
        keepFile: false
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--to') args.to = argv[++i]
        else if (a === '--data-root') args.dataRoot = argv[++i]
        else if (a === '--from') args.from = argv[++i]
        else if (a === '--dry-run') args.dryRun = true
        else if (a === '--as-proposal') args.asProposal = true
        else if (a === '--overwrite-newer') args.overwriteNewer = true
        else if (a === '--allow-production') args.allowProduction = true
        else if (a === '--keep-file') args.keepFile = true
        else if (a && a.startsWith('--')) fail(`unknown option ${a}`)
        else if (!args.space) args.space = a
        else fail(`unexpected argument ${a}`)
    }
    return args
}

/**
 * Everything decidable without touching the disk or the network, so the
 * refusals can be tested without either. `tier` is what space-proposal.mjs is
 * told; `site` is the address a person is sent to look at.
 */
export const planSend = (args) => {
    if (!args.space) fail('which space? — node scripts/send.mjs <space>')
    if (!SPACE_ID_RE.test(args.space)) fail(`"${args.space}" is not a space id`)

    const tier = String(args.to || 'dev').toLowerCase()
    const aliases = { staging: 'dev', rehearsal: 'dev', production: 'prod', live: 'prod' }
    const resolved = aliases[tier] || tier
    if (!(resolved in SITES)) fail(`unknown tier "${args.to}" (local, dev, prod)`)

    // The same two words the bundle tool asks for, asked here too: a person
    // typing `send` must not reach production by getting a tier name wrong.
    if (resolved === 'prod' && !args.allowProduction) {
        fail('this is the public site. Send it to dev first, look at it there, and add --allow-production only when the owner has said the word.')
    }

    const proposeArgv = ['--tier', resolved]
    // `auto` means "apply it if this person is allowed to, otherwise hold it
    // for approval" — the server's call, not ours. --as-proposal gives up the
    // right to apply, which is what you want when you would rather be read.
    if (!args.asProposal) proposeArgv.push('--direct')
    if (args.from) proposeArgv.push('--from', args.from)
    if (args.dryRun) proposeArgv.push('--dry-run')
    if (args.overwriteNewer) proposeArgv.push('--overwrite-newer')
    if (args.allowProduction) proposeArgv.push('--allow-production')

    return { space: args.space, tier: resolved, site: SITES[resolved], proposeArgv }
}

/**
 * Where to go and look. The local tier has no fixed address — it is whatever
 * this machine serves on — so it is read from the environment the proposal
 * tool already uses, and only falls back to a bare path when even that is
 * unset. A person is never sent to an address they cannot open.
 */
export const lookLines = (plan, env = process.env) => {
    const site = plan.site || (plan.tier === 'local'
        ? String(env.LOCAL_API_URL || '').replace(/\/+$/, '').replace(/\/serverXR$/i, '')
        : '')
    if (!site) return [`look at it on this machine: /${plan.space}`]
    return [
        `look at it: ${site}/${plan.space}`,
        `           ${site}/${plan.space}/studio`
    ]
}

export async function send(argv) {
    const args = parseSendArgs(argv)
    const plan = planSend(args)

    const { exportSpace, resolvePaths } = await import('./space-bundle.mjs')
    const { dataRoot } = resolvePaths(args.dataRoot)
    if (!fs.existsSync(dataRoot)) fail(`no data root at ${dataRoot} — pass --data-root, or set DATA_ROOT`)

    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'di-send-'))
    const file = path.join(dir, `${plan.space}.diiii`)
    try {
        console.log(`exporting ${plan.space} from ${dataRoot}`)
        await exportSpace({ target: plan.space, dataRoot: args.dataRoot, out: file })
        const bytes = fs.statSync(file).size
        console.log(`sending ${(bytes / 1e6).toFixed(2)} MB to ${plan.tier}${args.dryRun ? ' (dry run)' : ''}`)

        const { proposeBundle } = await import('./space-proposal.mjs')
        const code = await proposeBundle([file, ...plan.proposeArgv])
        if (code === 0 && !args.dryRun) for (const line of lookLines(plan)) console.log(line)
        if (args.keepFile) console.log(`kept: ${file}`)
        return code
    } finally {
        if (!args.keepFile) await fs.promises.rm(dir, { recursive: true, force: true })
    }
}

// Resolved on both sides: an install is reached through a `current` symlink,
// and comparing the two unresolved made the same call a silent no-op once
// already (see space-bundle.mjs's note on this).
const invokedDirectly = (() => {
    try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()

if (invokedDirectly) {
    try {
        process.exitCode = await send(process.argv.slice(2))
    } catch (error) {
        console.error(error.userFacing ? error.message : (error.stack || error.message))
        process.exitCode = 1
    }
}
