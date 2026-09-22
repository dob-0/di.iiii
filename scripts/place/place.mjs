#!/usr/bin/env node
/**
 * place.mjs — one command. A folder of footage of a hall goes in, a space you
 * can walk comes out.
 *
 *   node scripts/place/place.mjs --from /mnt/data/footage/moxir-2026-10-17 \
 *        --name moxir --scale-edge 24
 *
 * What happens, in order:
 *   1  frames    photos copied, videos pulled apart, the blurry and the
 *                repeated thrown out
 *   2  build     the frames go to a rented GPU and come back a mesh
 *                (or --local-obj skips that with a mesh you already have)
 *   3  crush     millions of triangles down to a few hundred thousand
 *   4  fit       floor flat, a metre made a metre, the room stood up
 *   5  import    a space on di.iiii, the hall in it, the footage beside it
 *
 * Options:
 *   --from <dir>        the footage (required, unless --from-space)
 *   --from-space <name> pull the footage a phone already collected into that
 *                       space's `sources` room instead of reading a folder. The
 *                       footage is then ALREADY in the space, so the importer is
 *                       told not to hang a second copy of it.
 *   --name <space>      what the space is called (required)
 *   --work <dir>        where the working files go (default <from>/../place-<name>)
 *   --scale-edge <m>    the room's longest wall, measured with a tape
 *   --edge <which>      which edge that number is: width · depth · height
 *   --door-guess        no tape: call the tallest doorway 2.1 m and GUESS
 *   --local-obj <file>  a mesh you already have; no GPU is rented
 *   --gpu <kind>        L4 (default) · T4 · A100 · H100 · local (this machine, ~/tools/meshroom)
 *   --api <base>        which di.iiii (default the local one)
 *   --forward <deg>     which way the visitor faces on arrival
 *   --flip              the floor it found was the ceiling
 *   --from-step <n>     start at step n, using what is already in <work>
 *   --no-sources        do not carry the footage into the space (it is there)
 *   --dry-run           say what would happen, change nothing
 *
 * Each step leaves its work in <work> and can be run again on its own — see
 * scripts/place/README.md. Nothing here writes to the footage folder.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

import { PLACE_DIR, parseArgs, num, say, warn, die, ensureDir } from './common.mjs'

const args = parseArgs()

const step = (name, script, scriptArgs) => ({ name, script, args: scriptArgs })

export const buildSteps = (options) => {
    const { work, from, name } = options
    const steps = []
    // Either a folder on this disk, or a space whose `sources` room a phone
    // already filled. Never both — the caller chose one.
    steps.push(step('frames', 'frames.mjs', options.fromSpace
        ? ['--from-space', options.fromSpace, '--work', work, ...(options.api ? ['--api', options.api] : [])]
        : ['--from', from, '--work', work]))
    steps.push(step('build', 'colab-job.mjs', options.localObj
        ? ['--work', work, '--local-obj', options.localObj]
        : ['--work', work, '--gpu', options.gpu || 'L4']))
    steps.push(step('crush', 'crush.mjs', ['--work', work]))

    const fitArgs = ['--work', work]
    if (Number.isFinite(options.scaleEdge)) {
        fitArgs.push('--scale-edge', String(options.scaleEdge))
        if (options.edge) fitArgs.push('--edge', options.edge)
    } else if (options.doorGuess) {
        fitArgs.push('--door-guess')
    }
    if (options.forward !== null && options.forward !== undefined) fitArgs.push('--forward', String(options.forward))
    if (options.flip) fitArgs.push('--flip')
    steps.push(step('fit', 'fit.mjs', fitArgs))

    // The footage is carried into the space at the end — UNLESS it came out of
    // that space in the first place. A walk a phone hung on the sources wall as
    // it happened must not arrive a second time beside itself, so --from-space
    // implies --no-sources and the flag is there to be said by hand as well.
    const importArgs = ['--work', work, '--name', name]
    if (options.noSources || options.fromSpace) importArgs.push('--no-sources')
    else importArgs.push('--sources', from)
    if (options.api) importArgs.push('--api', options.api)
    if (options.label) importArgs.push('--label', options.label)
    steps.push(step('import', 'import.mjs', importArgs))
    return steps
}

const main = () => {
    const from = args.from ? path.resolve(String(args.from)) : null
    const fromSpace = args['from-space'] ? String(args['from-space']).trim() : null
    const name = args.name ? String(args.name).trim() : null
    if ((!from && !fromSpace) || !name) {
        die(
            'place.mjs needs --name <space>, and either --from <folder of footage> or --from-space <space>.',
            '',
            'For example:',
            '    node scripts/place/place.mjs --from /mnt/data/footage/moxir-2026-10-17 --name moxir --scale-edge 24',
            '    node scripts/place/place.mjs --from-space moxir --name moxir --scale-edge 24',
            '',
            'The second one is for a walk a phone already collected at /moxir/scan.'
        )
    }
    if (from && !fs.existsSync(from)) die(`No such folder: ${from}`)

    // Never inside the footage folder: the drop folder is somebody else's, and
    // read-only as far as this pipeline is concerned.
    const work = args.work
        ? path.resolve(String(args.work))
        : (from
            ? path.join(path.dirname(from), `place-${name}`)
            // Nothing local was named, so there is no drop folder to sit beside.
            : path.join(os.tmpdir(), `place-${name}`))
    ensureDir(work)

    const scaleEdge = args['scale-edge'] === undefined ? null : num(args['scale-edge'], null)
    if (!Number.isFinite(scaleEdge) && !args['door-guess']) {
        warn('')
        warn('Nothing says how big this room is.')
        warn('Measure one wall and pass --scale-edge <metres>, or accept a guess with --door-guess.')
        warn('A room with no size still walks — at whatever size the reconstruction happened to be.')
        warn('')
    }

    const steps = buildSteps({
        work,
        from,
        fromSpace,
        noSources: Boolean(args['no-sources']),
        name,
        gpu: args.gpu ? String(args.gpu) : 'L4',
        localObj: args['local-obj'] ? path.resolve(String(args['local-obj'])) : null,
        scaleEdge,
        edge: args.edge ? String(args.edge) : null,
        doorGuess: Boolean(args['door-guess']),
        forward: args.forward === undefined ? null : num(args.forward, null),
        flip: Boolean(args.flip),
        api: args.api ? String(args.api) : null,
        label: args.label ? String(args.label) : null
    })

    const first = Math.max(1, num(args['from-step'], 1))
    say(`A place called "${name}"`)
    say(`  footage  ${from || `the ${fromSpace} space's own footage room`}`)
    say(`  working  ${work}`)
    say('')

    for (const [index, current] of steps.entries()) {
        const number = index + 1
        if (number < first) {
            say(`— ${number}/${steps.length} ${current.name} (skipped, --from-step ${first})`)
            continue
        }
        say(`— ${number}/${steps.length} ${current.name}`)
        const run = [path.join(PLACE_DIR, current.script), ...current.args]
        if (args['dry-run']) run.push('--dry-run')
        const result = spawnSync(process.execPath, run, { stdio: 'inherit' })
        if (result.status !== 0) {
            warn('')
            warn(`Stopped at step ${number} (${current.name}).`)
            warn(`Fix what it said, then carry on with:  --from-step ${number}`)
            process.exit(result.status || 1)
        }
        say('')
    }
    say(`Done. The room is on di.iiii and the working files are in ${work}.`)
}

if (process.argv[1] && process.argv[1].endsWith('place.mjs')) main()
