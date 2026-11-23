// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

import { collectSnapshot, timerUnits } from './monitorReport.mjs'

const require = createRequire(import.meta.url)
// The real limit, read from the real store file. Requiring that file runs nothing: no credits command is started here.
const { CREDITS_COMMAND_MS } = require('../../serverXR/src/monitorStore.js')

const trees = []
afterEach(() => { while (trees.length) fs.rmSync(trees.pop(), { recursive: true, force: true }) })

// A tree whose store file only reports what it was built with: no collector runs, so no credits command (a real model call) starts.
const treeWithLimit = (limit) => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'di-snap-'))
    trees.push(base)
    fs.mkdirSync(path.join(base, 'serverXR', 'src'), { recursive: true })
    fs.writeFileSync(path.join(base, 'serverXR', 'src', 'monitorStore.js'), [
        'module.exports = {',
        `  CREDITS_COMMAND_MS: ${limit},`,
        '  createMonitorStore: (options) => ({ getMonitor: async () => ({ options }) })',
        '}'
    ].join('\n'))
    return base
}

describe('collectSnapshot', () => {
    // The credits command is slow once an hour (12 s measured 2026-11-20). The server's page shows the last list meanwhile; this one-shot
    // process has none, so it must be told to wait past the command's whole limit and the store's hard cut 0.5 s after it (the store's
    // own default wait is 3 s).
    it('gives the store more than the credits command limit and the hard cut after it to wait for', async () => {
        const base = treeWithLimit(50000) // a limit the sender cannot have written down itself: it is read from the store
        const { options } = await collectSnapshot({ root: base })
        expect(options.creditsWaitMs).toBeGreaterThan(50000 + 500)
        expect(options.repoDir).toBe(base)
    })

    it('with the real limit, the one-shot report ends before the timer unit gives up (TimeoutStartSec)', async () => {
        const { options } = await collectSnapshot({ root: treeWithLimit(CREDITS_COMMAND_MS) })
        expect(options.creditsWaitMs).toBeGreaterThan(CREDITS_COMMAND_MS + 500)
        const unit = timerUnits({ node: '/usr/bin/node', cli: '/x/cli.mjs' })['di-monitor-report.service']
        const limitMs = Number(/^TimeoutStartSec=(\d+)/m.exec(unit)?.[1]) * 1000
        expect(limitMs).toBeGreaterThan(0)
        // worst case in order: the credits panel (the store caps it at creditsWaitMs + 1 s), git 5 s, the ledger read 5 s, the send 15 s
        // (the three limits written in monitorReport.mjs: execText twice, sendOnce)
        expect(options.creditsWaitMs + 1000 + (5000 + 5000 + 15000)).toBeLessThan(limitMs)
    })
})
