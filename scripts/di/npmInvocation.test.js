// @vitest-environment node
//
// `di update` on a machine where di downloaded its own node: no npm on PATH,
// no node on PATH. Found on asuz (Debian 13) 2026-09-13 — the first install
// worked and the first update died with `spawn npm ENOENT`.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { npmInvocation } from './install.mjs'
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
