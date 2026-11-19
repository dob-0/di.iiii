// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { collectSnapshot } from './monitorReport.mjs'

const homes = []
afterEach(() => { while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true }) })

describe('collectSnapshot', () => {
    // The credits command is slow once an hour (12 s measured 2026-11-20). The server's page shows the last list meanwhile; this one-shot
    // process has none, so it must be told to wait for the command's whole limit (the store's own default is 3 s).
    it('gives the store the whole credits command limit to wait for', async () => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'di-snap-'))
        homes.push(base)
        fs.mkdirSync(path.join(base, 'serverXR', 'src'), { recursive: true })
        fs.writeFileSync(path.join(base, 'serverXR', 'src', 'monitorStore.js'), [
            'module.exports = {',
            '  CREDITS_COMMAND_MS: 40000,',
            '  createMonitorStore: (options) => ({ getMonitor: async () => ({ options }) })',
            '}'
        ].join('\n'))
        const { options } = await collectSnapshot({ root: base })
        expect(options.creditsWaitMs).toBeGreaterThan(40000)
        expect(options.repoDir).toBe(base)
    })
})
