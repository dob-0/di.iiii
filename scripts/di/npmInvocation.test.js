// @vitest-environment node
//
// `di update` on a machine where di downloaded its own node: no npm on PATH,
// no node on PATH. Found on asuz (Debian 13) 2026-09-13 — the first install
// worked and the first update died with `spawn npm ENOENT`.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { npmInvocation, shellSafeSpawnArgs } from './install.mjs'
import { isWindows } from './paths.mjs'

const dirs = []
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })

describe('npmInvocation', () => {
    it('runs the npm beside the node, with that node first on PATH', () => {
        const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'di-node-'))
        dirs.push(bin)
        const npmName = isWindows ? 'npm.cmd' : 'npm'
        fs.writeFileSync(path.join(bin, npmName), '')
        const { command, env } = npmInvocation({ execPath: path.join(bin, 'node'), env: { PATH: '/usr/bin' } })
        expect(command).toBe(path.join(bin, npmName))
        expect(env.PATH.split(path.delimiter)[0]).toBe(bin)
        expect(env.PATH).toContain('/usr/bin')
    })

    it('falls back to npm on PATH when the node has no sibling', () => {
        const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'di-node-'))
        dirs.push(bin)
        const { command } = npmInvocation({ execPath: path.join(bin, 'node'), env: {} })
        expect(command).toBe(isWindows ? 'npm.cmd' : 'npm')
    })
})

// Node's shell:true spawn joins command+args with plain, unquoted spaces
// (see lib/child_process.js `normalizeSpawnArguments`), so an unquoted path
// with a space — the default `C:\Program Files\nodejs\npm.cmd` — gets split
// at the space and cmd.exe tries to run `C:\Program`. bootstrap failed at
// "installing dependencies" on exactly this machine shape: Windows 11, Node
// under Program Files. `shellSafeSpawnArgs` is the one helper both run()
// implementations (install.mjs, bootstrap.mjs) call before spawning, so the
// quoting cannot drift between them.
describe('shellSafeSpawnArgs', () => {
    it('quotes a command path with a space for the Windows shell case', () => {
        const { command } = shellSafeSpawnArgs('C:\\Program Files\\nodejs\\npm.cmd', ['ci'], { shell: true })
        expect(command).toBe('"C:\\Program Files\\nodejs\\npm.cmd"')
    })

    it('quotes an argument that contains a space, under shell', () => {
        const { args } = shellSafeSpawnArgs('npm.cmd', ['--prefix', 'C:\\a b\\c'], { shell: true })
        expect(args).toEqual(['--prefix', '"C:\\a b\\c"'])
    })

    it('does not double-quote a path that is already quoted', () => {
        const { command } = shellSafeSpawnArgs('"C:\\Program Files\\nodejs\\npm.cmd"', ['ci'], { shell: true })
        expect(command).toBe('"C:\\Program Files\\nodejs\\npm.cmd"')
    })

    it('leaves the POSIX (no-shell) case untouched', () => {
        const command = '/usr/local/bin/npm'
        const args = ['ci', '--omit=dev']
        const result = shellSafeSpawnArgs(command, args, { shell: false })
        expect(result).toEqual({ command, args })
    })

    it('leaves a plain (no options) call untouched', () => {
        const command = '/usr/local/bin/npm'
        const args = ['ci']
        const result = shellSafeSpawnArgs(command, args)
        expect(result).toEqual({ command, args })
    })
})
