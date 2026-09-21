#!/usr/bin/env node
/**
 * colab-job.mjs — step 2 of the place pipeline: the reconstruction.
 *
 * The frames go up to a rented GPU, Meshroom turns them into a mesh, and the
 * mesh comes straight back down. Scanning is bought, not built — today that
 * shop is Google Colab; tomorrow it can be a phone.
 *
 * UNVERIFIED ON A BOX. `colab` is not signed in on this machine, so the
 * Meshroom invocation in reconstruct.py has never run against a real GPU.
 * Everything up to the sign-in — the checks, the tar, the command text — is
 * real and `--dry-run` prints exactly what would be run.
 *
 * Usage:
 *   node scripts/place/colab-job.mjs --work <folder> [options]
 *
 *   --work <dir>        the pipeline's working folder (needs <work>/images)
 *   --session <name>    Colab session name (default place-<foldername>)
 *   --gpu <kind>        L4 (default) · T4 · A100 · H100
 *   --poll <seconds>    how often to ask how it is going (default 60)
 *   --timeout <minutes> give up after this long (default 180)
 *   --keep              leave the Colab session running when done
 *   --local-obj <path>  skip Colab entirely and use a mesh already on disk
 *   --dry-run           print the exact commands, run none of them
 *
 * Writes <work>/mesh/  (the OBJ and its textures) and <work>/reconstruct.json
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { PLACE_DIR, parseArgs, num, say, warn, die, ensureDir, writeJson, run, fmtBytes } from './common.mjs'

const args = parseArgs()

const COLAB = process.env.PLACE_COLAB || 'colab'
const SIGN_IN_LINE = 'colab sessions        # then follow the link it prints and paste the code'

// `colab sessions` is read-only. Signed out, it prints an accounts.google.com
// consent link and waits at a prompt — with stdin closed it simply prints and
// gives up, which is exactly the signal we want and costs nothing.
export const readsAsSignedOut = (output = '') => /accounts\.google\.com\/o\/oauth2|Enter the authorization code|application-default login|\b40[13]\b/i.test(output)

export const checkSignIn = () => {
    const probe = spawnSync(COLAB, ['sessions'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000
    })
    if (probe.error) {
        return { ok: false, reason: 'missing', detail: probe.error.message }
    }
    const output = `${probe.stdout || ''}${probe.stderr || ''}`
    if (readsAsSignedOut(output)) return { ok: false, reason: 'signed-out', detail: output.trim() }
    return { ok: true, detail: output.trim() }
}

const colab = (colabArgs, options = {}) => {
    const result = spawnSync(COLAB, colabArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout || 20 * 60_000
    })
    const out = `${result.stdout || ''}${result.stderr || ''}`
    if (options.quiet !== true) process.stdout.write(out)
    return { status: result.status, out }
}

// Every PLACE_STATUS line reconstruct.py printed, newest last.
export const parseStatusLines = (output = '') => output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('PLACE_STATUS '))
    .map((line) => {
        try {
            return JSON.parse(line.slice('PLACE_STATUS '.length))
        } catch {
            return null
        }
    })
    .filter(Boolean)

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

// A poll is one question and one line back, so it gets minutes, not the
// twenty an upload is allowed. Colab's kernel websocket wedges: a poll was
// seen hanging for twelve minutes while the reconstruction itself carried on
// perfectly well beside it (2026-09-21). With the default timeout a single
// wedged socket eats a fifth of the whole job's budget; with this it costs
// one poll and the next one reconnects.
export const POLL_TIMEOUT_MS = 4 * 60_000

// Colab prunes a runtime and the CLI then loses the name with it: the session
// shows up in `colab sessions` as an orphan `[?]` with no local record, and
// `colab stop -s <name>` can no longer reach it. A driver that reads a lost
// session as "no answer, ask again" polls an empty sky until its own deadline
// and then cannot even release the machine (2026-09-21).
export const readsAsLostSession = (output = '') => /Session .*not found|no such session|prune/i.test(output)

// A wedged websocket is worth retrying; six in a row is not a wedge.
export const SILENT_POLLS_BEFORE_GIVING_UP = 6

// The frames go up in pieces.
//
// `colab upload` posts through Jupyter's contents API, which carries the file
// base64'd inside a JSON body. A hall's worth of phone photos is ~100 MB and
// the far end answers 500 and keeps nothing (seen, 2026-09-21). Split at the
// door, send the pieces, and let reconstruct.py put them back together.
export const CHUNK_BYTES = 16 * 1024 * 1024

export const planChunks = (tarBytes, chunkBytes = CHUNK_BYTES) =>
    Math.max(1, Math.ceil(tarBytes / chunkBytes))

const uploadInPieces = (colabRun, session, tar, work, chunkBytes = CHUNK_BYTES) => {
    // The folder has to exist on the box first: the contents API will not
    // make a missing parent and answers 500 instead of saying so.
    const ready = colabRun(['exec', '-s', session, '-f', path.join(PLACE_DIR, 'prepare.py')], { quiet: true })
    if (!parseStatusLines(ready.out).some((line) => line.state === 'ready')) {
        warn(ready.out.slice(0, 300))
        return { ok: false, sent: 0 }
    }
    const parts = ensureDir(path.join(work, 'parts'))
    for (const stale of fs.readdirSync(parts)) fs.rmSync(path.join(parts, stale), { force: true })
    run('split', ['-b', String(chunkBytes), '-d', '-a', '3', tar, path.join(parts, 'images.tar.')])
    const names = fs.readdirSync(parts).sort()
    say(`  ${fmtBytes(fs.statSync(tar).size)} in ${names.length} piece${names.length === 1 ? '' : 's'}`)
    for (const [index, name] of names.entries()) {
        const sent = colabRun(['upload', '-s', session, path.join(parts, name), `/content/parts/${name}`], { quiet: true })
        if (sent.status !== 0) {
            warn(sent.out.slice(0, 400))
            return { ok: false, sent: index }
        }
        say(`    ${index + 1}/${names.length}`)
    }
    return { ok: true, sent: names.length }
}

// ── the bypass: a mesh already on this disk ───────────────────────────────────
const useLocalObj = (work, objPath) => {
    const source = path.resolve(objPath)
    if (!fs.existsSync(source)) die(`No mesh at ${source}`)
    const meshDir = ensureDir(path.join(work, 'mesh'))
    const sourceDir = path.dirname(source)
    const stem = path.parse(source).name
    // An OBJ is never alone: its .mtl and every texture beside it come too.
    const carried = []
    for (const name of fs.readdirSync(sourceDir)) {
        const full = path.join(sourceDir, name)
        if (!fs.statSync(full).isFile()) continue
        const ext = path.extname(name).toLowerCase()
        const isCompanion = name === path.basename(source)
            || path.parse(name).name === stem
            || ['.mtl', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.exr'].includes(ext)
        if (!isCompanion) continue
        fs.copyFileSync(full, path.join(meshDir, name))
        carried.push(name)
    }
    const mesh = path.join(meshDir, path.basename(source))
    writeJson(path.join(work, 'reconstruct.json'), {
        tool: 'scripts/place/colab-job.mjs',
        createdAt: new Date().toISOString(),
        mode: 'local-obj',
        source,
        mesh,
        files: carried
    })
    say(`Mesh taken from disk, no GPU rented: ${mesh}`)
    say(`  carried alongside it: ${carried.join(', ')}`)
    return mesh
}

// ── the real thing ────────────────────────────────────────────────────────────
const plan = (work, session, gpu) => {
    const imagesDir = path.join(work, 'images')
    const tar = path.join(work, 'images.tar')
    return {
        imagesDir,
        tar,
        steps: [
            ['tar', ['-cf', tar, '-C', imagesDir, '.']],
            [COLAB, ['new', '-s', session, '--gpu', gpu]],
            [COLAB, ['exec', '-s', session, '-f', path.join(PLACE_DIR, 'prepare.py')]],
            ['split', ['-b', String(CHUNK_BYTES), '-d', '-a', '3', tar, `${path.join(work, 'parts')}/images.tar.`]],
            [COLAB, ['upload', '-s', session, `${path.join(work, 'parts')}/images.tar.000`, '/content/parts/images.tar.000']],
            ['(…one call per piece…)', []],
            [COLAB, ['exec', '-s', session, '-f', path.join(PLACE_DIR, 'reconstruct.py')]],
            ['(then, every --poll seconds)', [COLAB, 'exec', '-s', session, '-f', path.join(PLACE_DIR, 'reconstruct.py')].slice(1)],
            [COLAB, ['download', '-s', session, '/content/place/out/…', path.join(work, 'mesh')]],
            [COLAB, ['stop', '-s', session]]
        ]
    }
}

const main = async () => {
    const work = args.work ? path.resolve(String(args.work)) : null
    if (!work) die('colab-job.mjs needs --work <working folder>.')
    ensureDir(work)

    if (args['local-obj']) {
        useLocalObj(work, String(args['local-obj']))
        return
    }

    const session = String(args.session || `place-${path.basename(work)}`).slice(0, 40)
    const gpu = String(args.gpu || 'L4')
    const pollSeconds = num(args.poll, 60)
    const timeoutMinutes = num(args.timeout, 180)
    const { imagesDir, tar, steps } = plan(work, session, gpu)

    if (args['dry-run']) {
        say('[dry run] the reconstruction, command for command:')
        steps.forEach(([command, commandArgs]) => say(`  ${command} ${commandArgs.join(' ')}`))
        say('')
        say(`Then: the mesh lands in ${path.join(work, 'mesh')} and the session is stopped.`)
        return
    }

    if (!fs.existsSync(imagesDir)) {
        die(`No frames at ${imagesDir}.`, 'Run scripts/place/frames.mjs first.')
    }

    const signIn = checkSignIn()
    if (!signIn.ok) {
        warn('')
        warn(signIn.reason === 'missing'
            ? 'The `colab` command is not on this machine.'
            : 'Colab is not signed in on this machine, and signing in is yours to do (it needs a browser).')
        warn('')
        warn('Run this once, in your own terminal:')
        warn('')
        warn(`    ${SIGN_IN_LINE}`)
        warn('')
        warn('Then run this same command again. Nothing has been uploaded and no GPU has been rented.')
        process.exitCode = 3
        return
    }

    say(`Packing ${fs.readdirSync(imagesDir).length} frames …`)
    run('tar', ['-cf', tar, '-C', imagesDir, '.'])

    say(`Renting a ${gpu} as "${session}" …`)
    let made = colab(['new', '-s', session, '--gpu', gpu])
    if (made.status !== 0 && gpu !== 'T4') {
        warn(`No ${gpu} available on this account — falling back to a T4.`)
        made = colab(['new', '-s', session, '--gpu', 'T4'])
    }
    if (made.status !== 0) die('Could not get a Colab session. Nothing was uploaded.')

    // Inside this block a failure must RELEASE the GPU, so nothing here calls
    // die(): process.exit() skips the finally and leaves a rented machine
    // burning the owner's compute units (it did exactly that once, 2026-09-21).
    const stop = () => {
        if (args.keep) {
            warn(`Session "${session}" left running — it burns compute until you run: colab stop -s ${session}`)
            return
        }
        say(`Letting the ${gpu} go.`)
        colab(['stop', '-s', session], { quiet: true })
    }
    // Ctrl-C is the other way a rented machine gets orphaned.
    const onSignal = () => { stop(); process.exit(130) }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)

    let downloaded = null
    try {
        say('Sending the frames up …')
        const sending = uploadInPieces(colab, session, tar, work)
        if (!sending.ok) {
            throw new Error(`The frames did not reach the box (${sending.sent} pieces made it).`)
        }

        say('Starting Meshroom …')
        const started = colab(['exec', '-s', session, '-f', path.join(PLACE_DIR, 'reconstruct.py')])
        const first = parseStatusLines(started.out).pop()
        if (!first || first.state === 'error') {
            throw new Error(`Meshroom would not start: ${first?.error || 'no status came back'}`)
        }
        say(`  ${first.images || '?'} frames in, working. This takes the better part of an hour.`)

        const deadline = Date.now() + timeoutMinutes * 60_000
        let result = null
        let silent = 0
        while (Date.now() < deadline) {
            await sleep(pollSeconds * 1000)
            const poll = colab(['exec', '-s', session, '-f', path.join(PLACE_DIR, 'reconstruct.py')], {
                quiet: true,
                timeout: POLL_TIMEOUT_MS
            })
            if (readsAsLostSession(poll.out)) {
                throw new Error(
                    `Colab lost the session "${session}" while the job was running.`
                    + '\nIt may still be assigned: check `colab sessions` and stop it from the Colab UI if it lingers.'
                )
            }
            const latest = parseStatusLines(poll.out).pop()
            if (!latest) {
                // A wedged websocket, not a dead job: the reconstruction runs
                // detached and does not care that we lost the line to it.
                silent += 1
                if (silent >= SILENT_POLLS_BEFORE_GIVING_UP) {
                    throw new Error(`The box stopped answering (${silent} polls in a row).`)
                }
                warn(`  (no answer from the box — asking again, ${silent}/${SILENT_POLLS_BEFORE_GIVING_UP})`)
                continue
            }
            silent = 0
            if (latest.state === 'done') { result = latest; break }
            if (latest.state === 'failed' || latest.state === 'error') {
                warn('Meshroom stopped without a mesh. The end of its log:')
                ;(latest.log || []).forEach((line) => warn(`    ${line}`))
                throw new Error('No mesh came out of that footage.')
            }
            const minutes = Math.round((latest.elapsed || 0) / 60)
            say(`  ${minutes} min in …`)
        }
        if (!result) throw new Error(`Still nothing after ${timeoutMinutes} minutes.`)

        // Down the moment it exists: a Colab runtime can go away without warning.
        say('Mesh is ready — pulling it down now.')
        const meshDir = ensureDir(path.join(work, 'mesh'))
        const wanted = [result.result, ...(result.files || [])]
        for (const remote of wanted) {
            colab(['download', '-s', session, remote, path.join(meshDir, path.basename(remote))], { quiet: true })
        }
        downloaded = path.join(meshDir, path.basename(result.result))
        if (!fs.existsSync(downloaded)) throw new Error('The download did not land.')

        writeJson(path.join(work, 'reconstruct.json'), {
            tool: 'scripts/place/colab-job.mjs',
            createdAt: new Date().toISOString(),
            mode: 'colab',
            session,
            gpu,
            elapsedSeconds: result.elapsed || null,
            mesh: downloaded,
            files: wanted.map((file) => path.basename(file))
        })
        say(`Mesh: ${downloaded}`)
    } catch (error) {
        warn('')
        warn(error.message)
        process.exitCode = 1
    } finally {
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
        stop()
    }
}

if (process.argv[1] && process.argv[1].endsWith('colab-job.mjs')) await main()
