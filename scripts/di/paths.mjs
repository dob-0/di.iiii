/**
 * Every path the CLI touches, in one place, so nothing else has to know the
 * layout. All of it lives under DI_HOME — nothing is written outside $HOME and
 * nothing needs admin rights on any OS.
 *
 *   ~/.di/
 *     bin/di            the shim that lands on PATH
 *     runtime/node/     a Node we downloaded, only if the system had none
 *     versions/<v>/     one immutable directory per version
 *     current -> versions/<v>       symlink (junction on Windows)
 *     previous -> versions/<v>
 *     data/             the artist's work — deliberately outside versions/
 *     di.env  state.json  logs/  run/
 */

import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export const isWindows = process.platform === 'win32'

export const diHome = () => {
    const override = String(process.env.DI_HOME || '').trim()
    if (override) return path.resolve(override)
    return path.join(os.homedir(), '.di')
}

export const paths = (home = diHome()) => ({
    home,
    bin: path.join(home, 'bin'),
    shim: path.join(home, 'bin', isWindows ? 'di.cmd' : 'di'),
    runtime: path.join(home, 'runtime'),
    nodeRuntime: path.join(home, 'runtime', 'node'),
    versions: path.join(home, 'versions'),
    current: path.join(home, 'current'),
    previous: path.join(home, 'previous'),
    // The artist's work. Never inside versions/, so update, rollback and
    // uninstall physically cannot reach it.
    data: path.join(home, 'data'),
    env: path.join(home, 'di.env'),
    state: path.join(home, 'state.json'),
    logs: path.join(home, 'logs'),
    serverLog: path.join(home, 'logs', 'server.log'),
    run: path.join(home, 'run'),
    pidFile: path.join(home, 'run', 'server.pid'),
    credentials: path.join(home, 'credentials.json'),
    versionDir: (version) => path.join(home, 'versions', version)
})

/** Inside an installed version: where the app and the server actually are. */
export const versionLayout = (versionDir) => ({
    root: versionDir,
    client: path.join(versionDir, 'dist'),
    server: path.join(versionDir, 'serverXR'),
    serverEntry: path.join(versionDir, 'serverXR', 'src', 'index.js'),
    cli: path.join(versionDir, 'cli', 'cli.mjs'),
    // Both compose files, because the override is ONLY an override: it is
    // full of `!reset`/`!override` tags and defines no volumes, so composed
    // alone the named data volume never exists and work lands in an
    // anonymous one — while `di where` points at the named volume.
    composeBase: path.join(versionDir, 'docker-compose.yml'),
    compose: path.join(versionDir, 'docker-compose.di.yml')
})
