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
import { unlinkLink } from './install.mjs'
import { isWindows, paths, versionLayout } from './paths.mjs'
import { probeAll, probeForeignDi } from './probe.mjs'
import { writeEnv, writeState } from './state.mjs'
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
 * What the artist's next login shell will have on its PATH — asked of that shell
 * rather than inferred from this process's own environment, which belongs to a
 * curl pipe or an ssh command and says nothing about their terminal.
 */
const loginPath = () => {
    const shell = String(process.env.SHELL || '').trim()
    if (shell) {
        const result = spawnSync(shell, ['-lc', 'printf %s "$PATH"'], { encoding: 'utf8', timeout: 8000 })
        const value = String(result.stdout || '').trim()
        if (value) return value.split(':').filter(Boolean)
    }
    return String(process.env.PATH || '').split(':').filter(Boolean)
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

    // The PATH that matters is the one the artist's NEXT terminal will have, and
    // this process cannot see it — an installer runs from a curl pipe, an ssh
    // command or CI, all of which have their own reduced environment. So ask the
    // login shell directly. Getting this wrong is not cosmetic: a shim dropped in
    // a directory that is not really on PATH leaves `di: command not found` with
    // an install that reported success.
    const onPath = (dir) => loginPath().includes(dir)

    // ~/.local/bin only when it is genuinely on that login PATH. Otherwise it is
    // just a folder, and the rc block below is what actually makes `di` work.
    const localBin = path.join(os.homedir(), '.local', 'bin')
    if (fs.existsSync(localBin) && onPath(localBin)) {
        for (const name of names) {
            const link = path.join(localBin, name)
            await fsp.rm(link, { force: true })
            await fsp.symlink(path.join(p.bin, name), link)
        }
        return { written, hint: null }
    }

    // Otherwise edit an rc file — chosen by which shell this is, not by which
    // file happens to exist. zsh is where guessing bites: a LOGIN zsh reads
    // .zprofile and .zshenv and never .zshrc, so a PATH line in .zshrc leaves
    // `di` missing from exactly the shell an artist opens next.
    const shell = path.basename(String(process.env.SHELL || '')) || 'sh'
    const userHome = os.homedir()
    const targets = shell === 'zsh'
        // .zshenv is read by every zsh — login, interactive and script alike.
        ? [path.join(userHome, '.zshenv')]
        : shell === 'bash'
            ? (process.platform === 'darwin'
                // macOS Terminal starts bash as a login shell, which reads
                // .bash_profile and skips .bashrc.
                ? [path.join(userHome, '.bash_profile'), path.join(userHome, '.bashrc')]
                : [path.join(userHome, '.bashrc'), path.join(userHome, '.profile')])
            : [path.join(userHome, '.profile')]

    const block = [
        '',
        '# >>> di.iiii >>>',
        `export PATH="${p.bin}:$PATH"`,
        '# <<< di.iiii <<<',
        ''
    ].join('\n')

    for (const rc of targets) {
        const existing = fs.existsSync(rc) ? await fsp.readFile(rc, 'utf8') : ''
        if (existing.includes('# >>> di.iiii >>>')) continue
        await fsp.appendFile(rc, block)
    }

    return { written, hint: onPath(p.bin) ? null : ui.pathHint(p.bin) }
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

    // unlinkLink, never fs.rm: on Windows `current` is a junction, and removing
    // one recursively removes what it points at.
    await unlinkLink(p.current)
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

    // A whole-scene write here must state the version it replaces, or be
    // refused. Online this is off, because that route has callers nobody can
    // enumerate — scripts in the repo, sync engines vendored into other repos,
    // whatever else is pointed at it. A fresh local install has none of them,
    // so the safe mode costs nothing and the artist's history cannot be thrown
    // away by a stale write.
    await writeEnv(home, { SCENE_REPLACE_REQUIRE_PRECONDITION: 'true' })

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
