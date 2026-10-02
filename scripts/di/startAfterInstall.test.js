// @vitest-environment node
//
// The one-line install ends with di.iiii running and open in the browser: the
// terminal is the door, the page is where the work happens (owner, 2026-10-02:
// "you install the di., it opens in browser and everything you do from
// there"). Before this, bootstrap printed "di up — start it, and open it" and
// left the person to type it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { shouldStartAfterInstall } from './install.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

describe('starting di.iiii at the end of the install', () => {
    it('starts it for a person at a terminal', () => {
        expect(shouldStartAfterInstall({ env: {}, isTTY: true })).toBe(true)
    })

    it('does not when asked not to, in CI, or with no terminal (a script piping the installer)', () => {
        expect(shouldStartAfterInstall({ env: { DI_NO_START: '1' }, isTTY: true })).toBe(false)
        expect(shouldStartAfterInstall({ env: { CI: 'true' }, isTTY: true })).toBe(false)
        expect(shouldStartAfterInstall({ env: {}, isTTY: false })).toBe(false)
    })

    it('bootstrap runs `up` from the installed version, and a failed start is not a failed install', () => {
        const bootstrap = fs.readFileSync(path.join(HERE, 'bootstrap.mjs'), 'utf8')
        const decide = bootstrap.indexOf('if (shouldStartAfterInstall())')
        const start = bootstrap.indexOf("run(process.execPath, [versionLayout(finalDir).cli, 'up']")
        const fallback = bootstrap.indexOf("warn(`installed, but it did not start:")
        expect(decide).toBeGreaterThan(-1)
        expect(start).toBeGreaterThan(decide)
        expect(fallback).toBeGreaterThan(start)
        // the start comes after the version is in place and named, never before
        expect(start).toBeGreaterThan(bootstrap.indexOf('await installShim('))
    })
})
