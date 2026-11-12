#!/usr/bin/env node
/**
 * desk-load.mjs: put ONE project's show on the light desk of a di (the installed one by default), in the project's own space,
 * so the room and the deck's LIGHT window follow that project (owner N3898: the live room was dark, the desk held another
 * space's show).
 *
 *   node scripts/rigbuild/desk-load.mjs --project <id> --space <space> [--api <api>] [--backup-dir <dir>] [--apply]
 *   node scripts/rigbuild/desk-load.mjs --back <space> --apply          (the way back: open that space's show again)
 *
 * With --apply, in this order, stopping at the first thing that is not as expected:
 *   1. the show the desk holds now is copied into --backup-dir (the desk also saves it and keeps its own before-switch copy);
 *   2. the desk opens <space>'s show (`live: true`: the output is on, the lamps in the room change);
 *   3. patch.mjs --exact through the desk's space address (the desk refuses it if it holds another show);
 *   4. the desk step of epic-build (each look WITH its DMX, the cue list, GO on the first cue).
 * Never touched: any other space's show file. Without --apply it only says what it would do.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken, DEFAULT_API } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { deskStep } from './epic-build.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** What the load would do, from the desk's show and the document. Pure. */
export const planLoad = ({ show, space, document }) => {
    const lamps = (document?.entities || []).filter((e) => Number.isInteger(e.components?.dmx?.address) || Number.isInteger(e.components?.beam?.dmx?.address)).length
    const cues = (document?.mappingState?.cues || []).length
    return { from: show?.space ?? null, to: space, switch: (show?.space ?? null) !== space, live: show?.live === true, lamps, cues }
}

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || DEFAULT_API).replace(/\/+$/, '')
    const light = api.replace(/\/serverXR$/, '') + '/light'
    const desk = makeClient(light, null)
    const showNow = async () => { const r = await desk.get('/api/show'); if (!r.ok) die(`no desk at ${light} (${r.status})`); return r.body }
    const open = async (space) => {
        const r = await desk.post('/api/show/open', { space, live: true })
        if (!r.ok) die(`the desk did not open ${space}: ${r.status} ${String(r.text || '').slice(0, 200)}`)
        const now = await showNow()
        if (now.space !== space) die(`the desk holds ${now.space}, not ${space}: stopped, nothing patched`)
        return now
    }
    if (args.back) {
        const before = await showNow()
        if (!args.apply) return say(`dry run: would open ${args.back}'s show again (the desk holds ${before.space} now)`)
        const now = await open(String(args.back))
        return say(`BACK OK: the desk holds ${now.space} (${now.file})`)
    }
    const project = String(args.project || die('needs --project'))
    const space = String(args.space || die('needs --space'))
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`${project}: ${got.status}`)
    const document = got.body.document
    const before = await showNow()
    const plan = planLoad({ show: before, space, document })
    say(`desk now: ${before.space} (output ${before.live ? 'ON' : 'off'}); would ${plan.switch ? `open ${space}'s show` : 'stay'}, patch ${project} exactly and load ${plan.cues} cues`)
    if (!args.apply) return say('dry run: nothing written (--apply writes)')
    const dir = path.resolve(String(args['backup-dir'] || die('--apply needs --backup-dir')))
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    let kept = 'no file yet'
    if (before.file && fs.existsSync(before.file)) {
        kept = path.join(dir, `desk-${before.space || 'machine'}-show-${stamp}.json`)
        fs.copyFileSync(before.file, kept)
    }
    say(`kept: ${kept}`)
    await open(space)
    const patch = spawnSync(process.execPath, [path.join(HERE, 'patch.mjs'), '--project', project, '--api', api, '--desk', `${light}/space/${space}/`, '--exact'], { encoding: 'utf8' })
    say(String(patch.stdout || '').trim().split('\n').slice(-6).join('\n'))
    if (patch.status !== 0) die(`patch.mjs --exact failed (${patch.status}): ${String(patch.stderr || '').trim().slice(-400)}\nway back: --back ${before.space} --apply`)
    if ((await showNow()).space !== space) die(`the desk left ${space} during the patch: stopped before the looks`)
    const fresh = await client.get(`/api/projects/${project}/document`)
    const doc = fresh.body.document
    const out = await deskStep({ api, project, document: doc, cues: doc.mappingState?.cues || [], loop: doc.mappingState?.loop === true })
    const after = await showNow()
    say(`LOAD OK: the desk holds ${after.space} (output ${after.live ? 'ON' : 'off'}), ${out.fixtures} fixtures, ${out.looks} looks; way back: node scripts/rigbuild/desk-load.mjs --back ${before.space} --apply`)
}

if (isMainModule(import.meta.url)) {
    main().catch((e) => die(e.message))
}
