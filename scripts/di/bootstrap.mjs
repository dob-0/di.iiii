/**
 * bootstrap.mjs — finishes a first install.
 *
 * install.sh / install.ps1 only get far enough to have a Node and an unpacked
 * artifact; everything with a decision in it happens here, where it can be read
 * and changed without touching the two shell scripts a pasted URL points at.
 *
 *   node <staged>/cli/bootstrap.mjs --staged <dir> --version <v>
 *
 * Does, in order: install serverXR's production dependencies, move the tree
 * into ~/.di/versions/<v>, point `current` at it, write state, put a shim on
 * PATH, and say what to type next. Never touches ~/.di/data.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { decideCommandName, decideMode } from './detect.mjs'
import { isWindows, paths, versionLayout } from './paths.mjs'
import { probeAll, probeForeignDi } from './probe.mjs'
import { writeState } from './state.mjs'
import { fail, say, style, ui, warn } from './ui.mjs'

const arg = (name, fallback = null) => {
    const index = process.argv.indexOf(`--${name}`)
    return index === -1 ? fallback : process.argv[index + 1]
}

const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { stdio: 'inherit', ...options })
    if (result.error) throw new Error(`could not run ${command}: ${result.error.message}`)
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`)
}

/**
 * npm lives next to the node running this file, which on a machine where di
 * downloaded its own node is NOT on PATH — that machine may have no npm at all.
 * Resolving it as a sibling is the difference between installing and dying with
 * a spawn ENOENT that names nothing useful.
 */
const npmCommand = () => {
    const dir = path.dirname(process.execPath)
    const sibling = path.join(dir, isWindows ? 'npm.cmd' : 'npm')
    return fs.existsSync(sibling) ? sibling : (isWindows ? 'npm.cmd' : 'npm')
}

/**
 * Put the shim somewhere already on PATH if we can, and only edit a shell rc
 * as a last resort. Never sudo, never a system directory — an installer that
 * asks for a password is one most people are right to refuse.
 */
const installShim = async ({ home, names, versionDir }) => {
    const p = paths(home)
    await fsp.mkdir(p.bin, { recursive: true })

    // From the installed version, not from this file's own directory: by the
    // time this runs, the directory this module was loaded from has been
    // renamed out from under it.
    const source = path.join(versionDir, 'cli', 'shim', isWindows ? 'di.cmd' : 'di')
    const written = []
    for (const name of names) {
        const target = path.join(p.bin, isWindows ? `${name}.cmd` : name)
        await fsp.copyFile(source, target)
        if (!isWindows) await fsp.chmod(target, 0o755)
        written.push(target)
    }

    if (isWindows) {
        // User PATH, not machine PATH: no admin rights involved.
        spawnSync('powershell', ['-NoProfile', '-Command',
            `$p=[Environment]::GetEnvironmentVariable('Path','User'); if ($p -notlike '*${p.bin}*') { [Environment]::SetEnvironmentVariable('Path', "${p.bin};$p", 'User') }`
        ], { stdio: 'ignore' })
        return { written, hint: ui.pathHintWindows() }
    }

    const pathEntries = String(process.env.PATH || '').split(':')
    const localBin = path.join(os.homedir(), '.local', 'bin')
    if (fs.existsSync(localBin) && pathEntries.includes(localBin)) {
        for (const name of names) {
            const link = path.join(localBin, name)
            await fsp.rm(link, { force: true })
            await fsp.symlink(path.join(p.bin, name), link)
        }
        return { written, hint: null }
    }

    const rc = ['.zshrc', '.bashrc', '.bash_profile', '.profile']
        .map(file => path.join(os.homedir(), file))
        .find(file => fs.existsSync(file)) || path.join(os.homedir(), '.profile')

    const block = [
        '',
        '# >>> di.iiii >>>',
        `export PATH="${p.bin}:$PATH"`,
        '# <<< di.iiii <<<',
        ''
    ].join('\n')

    const existing = fs.existsSync(rc) ? await fsp.readFile(rc, 'utf8') : ''
    if (!existing.includes('# >>> di.iiii >>>')) await fsp.appendFile(rc, block)

    return { written, hint: ui.pathHint(p.bin) }
}

const main = async () => {
    const home = paths().home
    const staged = arg('staged')
    const version = arg('version')
    if (!staged || !version) throw new Error('bootstrap needs --staged <dir> --version <v>')

    const p = paths(home)
    const layout = versionLayout(staged)

    // serverXR only, production only. dist/ arrived built — the artist never
    // needs Vite or the root dependency tree.
    say(style.dim('installing dependencies…'))
    run(npmCommand(), ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
        cwd: layout.server,
        shell: isWindows,
        stdio: process.env.DI_VERBOSE ? 'inherit' : 'ignore',
        // npm is a node script: it needs the node it belongs to on PATH.
        env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}` }
    })

    // staged is <versions>/<v>.partial — same filesystem, so this rename is
    // atomic and cannot half-succeed the way a cross-device copy can.
    const finalDir = p.versionDir(version)
    await fsp.mkdir(p.versions, { recursive: true })
    await fsp.rm(finalDir, { recursive: true, force: true })
    await fsp.rename(staged, finalDir)

    await fsp.rm(p.current, { recursive: false, force: true })
    await fsp.symlink(finalDir, p.current, isWindows ? 'junction' : 'dir')
    await fsp.mkdir(p.data, { recursive: true })

    const probes = await probeAll({ home })
    const decision = decideMode(probes)
    const mode = decision.mode === 'docker' ? 'docker' : 'node'

    await writeState(home, {
        version,
        mode,
        nodeOrigin: probes.vendoredNode ? 'di' : 'system',
        installedAt: new Date().toISOString()
    })

    const foreign = probeForeignDi(home)
    const naming = decideCommandName({ foreignDiOnPath: foreign.found && foreign.foreign })
    if (naming.shadowed) warn(ui.nameTaken(foreign.path))

    const names = [naming.primary, naming.alias].filter(Boolean)
    const { hint } = await installShim({ home, names, versionDir: finalDir })

    say('')
    say(`di.iiii ${version} is installed.`)
    say(style.dim(`  ${mode} mode · ${home}`))
    say('')
    say(`  ${style.cyan(`${naming.primary} up`)}   start it, and open it`)
    say(style.dim(`  ${naming.primary} help  everything else`))
    if (hint) { say(''); say(hint) }
}

main().catch((error) => {
    fail(String(error?.message || error))
    fail('nothing was installed. full report:  di doctor')
    process.exitCode = 1
})
