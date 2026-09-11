// @vitest-environment node
//
// What `di` does with what is typed at it, before any command runs. Three of
// these were found on the festival machine (docs/testing/FESTIVAL_MACHINE_2026-09-06.md):
// `di --version` started the server, because an unknown flag on a bare `di`
// fell through to the default action; `di mcp --help` silently started the
// MCP server on stdin; and nothing printed a usage for one command.
//
// Spawned, not imported, wherever the behaviour is "what the process does":
// the guard that keeps main() from running on import is itself under test.
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BARE_FLAGS, COMMANDS, parseArgs } from './cli.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, 'cli.mjs')

const homes = []
afterEach(() => { while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true }) })

const emptyHome = () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-routing-'))
    homes.push(home)
    return home
}

// An install as far as isInstalled() is concerned: `current` points at a
// directory. Nothing in it can start, which is the point — a routing mistake
// that reaches cmdUp shows up as a pid file and a failed start, not a hang.
const installedHome = (version = '7.7.7-test') => {
    const home = emptyHome()
    fs.mkdirSync(path.join(home, 'versions', version), { recursive: true })
    fs.symlinkSync(path.join(home, 'versions', version), path.join(home, 'current'))
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version }))
    return home
}

const di = (home, args, { entry = CLI } = {}) => {
    const result = spawnSync(process.execPath, [entry, ...args], {
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' },
        // stdin closed: a command that (wrongly) starts the stdio MCP server
        // would otherwise sit waiting on it until the timeout.
        stdio: ['ignore', 'pipe', 'pipe']
    })
    return { code: result.status, out: result.stdout, err: result.stderr, timedOut: Boolean(result.error) }
}

describe('importing the CLI runs nothing', () => {
    it('exports its table and its parser without having started anything', () => {
        expect(typeof COMMANDS.up).toBe('function')
        expect(parseArgs(['open', 'a.diiii', '--as', 'b', '--force'])).toEqual({
            _: ['open', 'a.diiii'], flags: { as: 'b', force: true }
        })
        // process.exitCode untouched: main() would have refused vitest's own
        // argv as "no such command" and marked the whole run as failed.
        expect(process.exitCode).toBeUndefined()
    })
})

describe('the version', () => {
    it('prints on --version, -v and `version`, and starts nothing', () => {
        const home = installedHome('7.7.7-test')
        for (const args of [['--version'], ['-v'], ['version']]) {
            const result = di(home, args)
            expect(result.out.trim(), args.join(' ')).toBe('7.7.7-test')
            expect(result.code, args.join(' ')).toBe(0)
        }
        expect(fs.existsSync(path.join(home, 'run', 'server.pid'))).toBe(false)
    })

    it('says "not installed" rather than failing where there is no install', () => {
        const result = di(emptyHome(), ['--version'])
        expect(result.out.trim()).toBe('not installed')
        expect(result.code).toBe(0)
    })
})

describe('a bare `di` with a flag it does not know', () => {
    it('refuses with the usage instead of starting the server', () => {
        const home = installedHome()
        const result = di(home, ['--versoin'])
        expect(result.code).toBe(1)
        expect(result.err).toContain('no such option: --versoin')
        expect(result.out).toContain('di.iiii on your own machine')
        expect(result.out).not.toContain('starting')
        expect(fs.existsSync(path.join(home, 'run', 'server.pid'))).toBe(false)
        expect(result.timedOut).toBe(false)
    })

    it('still takes the flags `di up` takes', () => {
        // The allow-list is what the refusal is measured against; if `di
        // --port 4100` ever refused, the fix above would have broken `di`.
        for (const flag of ['port', 'no-open', 'verbose']) expect(BARE_FLAGS.has(flag)).toBe(true)
        expect(BARE_FLAGS.has('version')).toBe(false)
    })
})

describe('help for one command', () => {
    it('answers `di mcp --help` with a usage and exits, rather than serving MCP on stdin', () => {
        const result = di(installedHome(), ['mcp', '--help'])
        expect(result.timedOut).toBe(false)
        expect(result.code).toBe(0)
        expect(result.out).toContain('di mcp')
        expect(result.out).toContain('DI_MCP_ALLOW_PUBLIC=1')
        expect(result.out).toContain('claude mcp add di -- di mcp')
    })

    it('says the same for `di help mcp`', () => {
        const a = di(installedHome(), ['mcp', '--help'])
        const b = di(installedHome(), ['help', 'mcp'])
        expect(b.out).toBe(a.out)
    })

    it('falls back to the general usage for a command with no page of its own', () => {
        const result = di(installedHome(), ['help', 'status'])
        expect(result.code).toBe(0)
        expect(result.out).toContain('di.iiii on your own machine')
    })

    it('names `--version` and `help mcp` in the general usage', () => {
        const result = di(emptyHome(), ['help'])
        expect(result.out).toContain('--version')
        expect(result.out).toContain('help mcp')
    })
})

// `di keeper get` downloads most of a gigabyte. The one thing routing has to
// guarantee is that it NEVER happens by accident: a bare `di keeper`, a typo
// after it, and `di keeper --help` must all be inert.
describe('the keeper command', () => {
    it('is a command', () => {
        expect(Object.keys(COMMANDS)).toContain('keeper')
    })

    it('reports rather than downloads when no sub-word is given', () => {
        const result = di(emptyHome(), ['keeper'])
        expect(result.code).toBe(0)
        expect(result.out).toContain('no keeper on this machine')
    })

    it('refuses a sub-word it does not know instead of guessing', () => {
        const result = di(emptyHome(), ['keeper', 'fetch'])
        expect(result.code).toBe(1)
        expect(`${result.out}${result.err}`).toContain('keeper get | status | remove')
    })

    it('has a page of its own, reachable both ways', () => {
        const a = di(emptyHome(), ['keeper', '--help'])
        const b = di(emptyHome(), ['help', 'keeper'])
        expect(a.out).toContain('the small model that comes with di.iiii')
        expect(b.out).toBe(a.out)
    })

    it('says the size out loud before anybody types get', () => {
        const result = di(emptyHome(), ['help', 'keeper'])
        expect(result.out).toMatch(/\d+ MB/)
    })
})

describe('reached through the shim', () => {
    it('runs when invoked through the `current` symlink, as the shim does', () => {
        // Node reports the main module by its real path; the shim names it
        // through a symlink. A guard comparing the two unresolved would make
        // every real `di` a silent no-op — the tests above would still pass.
        const home = installedHome()
        const cliDir = path.join(home, 'versions', '7.7.7-test', 'cli')
        fs.symlinkSync(HERE, cliDir)
        const result = di(home, ['--version'], { entry: path.join(home, 'current', 'cli', 'cli.mjs') })
        expect(result.out.trim()).toBe('7.7.7-test')
        expect(result.code).toBe(0)
    })
})
