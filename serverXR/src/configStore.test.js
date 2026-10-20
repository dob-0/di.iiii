/**
 * _server-config.json (the open-space id and the default space) is rewritten by every PATCH /api/config.
 * read() degrades an unreadable file to {}, and patch() merges into what read() returned — so a write that died
 * half-way did not just lose the new value, it made the NEXT patch save only its own keys over the wreck.
 * The write goes through jsonStore.writeJson (temp + rename), the server's one atomic writer.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const configStore = require('./configStore.js')

let dir
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-config-'))
    configStore.init(dir)
})
afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('configStore', () => {
    it('merges patches into what is stored', async () => {
        await configStore.patch({ globalSpaceId: 'open' })
        await configStore.patch({ defaultSpaceId: 'main' })
        expect(await configStore.read()).toEqual({ globalSpaceId: 'open', defaultSpaceId: 'main' })
    })

    it('a write that dies half-way leaves the stored config whole', async () => {
        await configStore.patch({ globalSpaceId: 'open', defaultSpaceId: 'main' })
        const file = path.join(dir, '_server-config.json')
        const before = fs.readFileSync(file)

        const realWriteFile = fsp.writeFile
        vi.spyOn(fsp, 'writeFile').mockImplementation(async (target, data, options) => {
            await realWriteFile(target, String(data).slice(0, Math.ceil(String(data).length / 2)), options)
            throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
        })
        await expect(configStore.patch({ globalSpaceId: 'jam' })).rejects.toThrow(/ENOSPC/)
        vi.restoreAllMocks()

        expect(fs.readFileSync(file).equals(before)).toBe(true)
        expect(await configStore.read()).toEqual({ globalSpaceId: 'open', defaultSpaceId: 'main' })
        expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([])
    })
})
