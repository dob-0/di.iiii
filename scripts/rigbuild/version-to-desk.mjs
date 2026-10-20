#!/usr/bin/env node
/**
 * version-to-desk.mjs — put ONE version (project) of a space onto the lighting desk, in one command.
 *
 *   node scripts/rigbuild/version-to-desk.mjs --project <id> --api <base>/serverXR --token-file <f> \
 *       --plan <plan.patch.json> [--desk <base>] [--dry-run] [--keep-others] [--no-start]
 *
 * In order, each step by the existing tool (child process, its output is yours), stopping at the first failure:
 *   1. patch-plan.mjs  --keep-circuits   the plan into the document
 *   2. patch.mjs --unpatch               every OTHER project of the desk comes off (skipped by --keep-others)
 *   3. patch.mjs --exact                 this project onto the desk at the document's own addresses
 *   4. show-loop.mjs                     the document's own cues onto the desk, runner started (--no-start: not started)
 *   5. check                             desk per project, U1/U2 counts, the runner; exit 1 if anything is off
 * --dry-run passes each tool's own dry-run: nothing is written, the check is only printed.
 * The desk base is the api without /serverXR, plus /light (as show-loop.mjs does). RIG_BUILD.md §19.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseArgs, die, say } from '../place/common.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** The desk's base (…/light) from the api base (…/serverXR). Pure. */
export const deskBaseOf = (api) => `${String(api).replace(/\/+$/, '').replace(/\/serverXR$/, '')}/light`

/** The projects on the desk other than `project`, sorted. Fixture keys are `<project>:<entityId>`. Pure. */
export const otherProjectsOnDesk = (fixtures, project) =>
    [...new Set((fixtures || []).map((f) => String(f.key).split(':')[0]).filter((p) => p && p !== project))].sort()

/** What the desk carries now: fixtures per project, this project's U1/U2 lamps, the runner. Pure. */
export const summaryOf = (rigFixtures, cues, project) => {
    const fixtures = rigFixtures || []
    const perProject = {}
    for (const f of fixtures) {
        const p = String(f.key).split(':')[0]
        perProject[p] = (perProject[p] || 0) + 1
    }
    const mine = fixtures.filter((f) => String(f.key).startsWith(`${project}:`))
    const c = cues?.cues || cues || {}
    return {
        perProject,
        u1: mine.filter((f) => f.universe === 1).length,
        u2: mine.filter((f) => f.universe === 2).length,
        runner: { n: c.n ?? null, index: c.index ?? null, name: c.name ?? null, running: c.running ?? null }
    }
}

const getJson = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    return res.json()
}

const tool = (script, argv) => {
    say(`$ node scripts/rigbuild/${script} ${argv.join(' ')}`)
    return spawnSync(process.execPath, [path.join(here, script), ...argv], { stdio: 'inherit' }).status === 0
}

const main = async () => {
    const args = parseArgs()
    const project = String(args.project || die('needs --project <id>'))
    const api = String(args.api || die('needs --api <base>/serverXR — no default on purpose')).replace(/\/+$/, '')
    const tokenFile = String(args['token-file'] || die('needs --token-file <f>'))
    const plan = String(args.plan || die('needs --plan <plan.patch.json>'))
    const desk = args.desk ? String(args.desk).replace(/\/+$/, '') : deskBaseOf(api)
    const dry = Boolean(args['dry-run'])
    const dryFlag = dry ? ['--dry-run'] : []
    const fail = (step) => { say(`FAILED at ${step} — stopped; nothing after it ran`); process.exit(1) }

    if (!tool('patch-plan.mjs', ['--plan', plan, '--project', project, '--api', api, '--token-file', tokenFile, '--keep-circuits', ...dryFlag])) fail('1/5 the plan into the document')

    if (!args['keep-others']) {
        let rig
        try { rig = await getJson(`${desk}/api/rig`) } catch (e) { say(`2/5 cannot read the desk: ${e.message}`); fail('2/5 the other projects off the desk') }
        const others = otherProjectsOnDesk(rig.fixtures, project)
        say(`2/5 other projects on the desk: ${others.join(', ') || 'none'}`)
        for (const other of others) {
            if (!tool('patch.mjs', ['--project', other, '--api', api, '--token-file', tokenFile, '--unpatch', ...dryFlag])) fail(`2/5 ${other} off the desk`)
        }
    } else say('2/5 skipped (--keep-others)')

    if (!tool('patch.mjs', ['--project', project, '--api', api, '--token-file', tokenFile, '--exact', ...dryFlag])) fail('3/5 onto the desk, exactly')
    if (!tool('show-loop.mjs', ['--project', project, '--api', api, '--token-file', tokenFile, ...dryFlag, ...(args['no-start'] ? ['--no-start'] : [])])) fail('4/5 the cues onto the desk')

    let rig, cues
    try { [rig, cues] = [await getJson(`${desk}/api/rig`), await getJson(`${desk}/api/cues`)] } catch (e) { say(`5/5 cannot read the desk: ${e.message}`); fail('5/5 check') }
    const s = summaryOf(rig.fixtures, cues, project)
    const others = otherProjectsOnDesk(rig.fixtures, project)
    say('== 5/5 the desk now' + (dry ? ' (dry run: nothing was written, this is how it stands)' : ''))
    say(`desk per project: ${JSON.stringify(s.perProject)}`)
    say(`${project}: U1 ${s.u1}, U2 ${s.u2}`)
    say(`runner: ${s.runner.n} cues, at ${s.runner.index === null ? '?' : s.runner.index + 1} ${s.runner.name ?? ''}, running ${s.runner.running}`)
    if (!dry && !args['keep-others'] && others.length) { say(`another project is still on the desk: ${others.join(', ')}`); process.exit(1) }
    if (!dry && s.u1 + s.u2 === 0) { say(`${project} has no lamp on the desk`); process.exit(1) }
    say(dry ? 'dry run done' : 'done')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => die(e.message))
