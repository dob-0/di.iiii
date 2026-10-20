// Regression guard for the EADDRINUSE flake of 2026-10-20 (followIntegration, 1 run in 10:
// "Server exited early ... listen EADDRINUSE: address already in use 0.0.0.0:42421").
//
// Cause: a test asked the OS for a free port, RELEASED it, and only then started the server on that number. vitest runs
// files in parallel, so a sibling's probe or server could take the number in between. Picking a number and
// using it later is a race by construction; the fix is to let the server's own bind be the proof
// (testSupport/spawnServer.mjs: waits for the child's own listen line, retries a lost race on a new port).
//
// This test fails on any test file that goes back to picking a port for a child server by hand.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const testFiles = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (name === 'node_modules') return []
    if (statSync(full).isDirectory()) return testFiles(full)
    return /\.test\.(js|mjs)$/.test(name) ? [full] : []
})

// A hand-rolled probe: a server listens on port 0, is closed again, and its number is handed back (`close(() => resolve(port))`).
const PROBE = /\.close\([^\n]*\bresolve\((?:port|p)\)/
// Handing a number to a child: PORT: String(<something picked earlier>).
const PORT_ENV = /\bPORT:\s*String\(/

describe('test servers do not pick a port by hand', () => {
    const own = path.join(SRC, 'testSupport', 'noPickedPort.test.js')
    const files = testFiles(SRC).filter((f) => f !== own)

    it('finds the test files it is guarding', () => {
        expect(files.length).toBeGreaterThan(50)
    })

    it('no test file probes a port, closes it, and starts a server on the number', () => {
        const offenders = files
            .filter((f) => PROBE.test(readFileSync(f, 'utf8')))
            .map((f) => path.relative(SRC, f))
        expect(offenders, 'use spawnServerUntilReady (testSupport/spawnServer.mjs); in-process servers listen on 0 and read address().port').toEqual([])
    })

    it('no test file hands a child server a PORT it chose itself', () => {
        const offenders = files
            .filter((f) => PORT_ENV.test(readFileSync(f, 'utf8')))
            .map((f) => path.relative(SRC, f))
        expect(offenders).toEqual([])
    })
})
