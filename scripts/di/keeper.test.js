// @vitest-environment node
//
// The keeper is 859 MiB of somebody else's disk, fetched over somebody else's
// wifi, and pointed at by one line of env. The three things that must never
// drift are: where it lands (update, backup and uninstall all have opinions
// about that), that a wrong-looking download is refused rather than loaded,
// and that removing it cannot take somebody ELSE's model configuration with it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { paths } from './paths.mjs'
import { readEnv, writeEnv } from './state.mjs'
import {
    LLAMA_BUILD,
    MODEL,
    KEEPER_PORT,
    getKeeper,
    keeperPaths,
    keeperStatus,
    removeKeeper,
    startKeeper,
    stopKeeper
} from './keeper.mjs'

const homes = []
afterEach(() => {
    while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true })
    vi.unstubAllGlobals()
})

const home = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-keeper-'))
    homes.push(dir)
    return dir
}

describe('where the weights live', () => {
    it('is outside the artist’s work and outside the versions an update replaces', () => {
        const dir = home()
        const p = paths(dir)
        const k = keeperPaths(dir)
        expect(k.model.startsWith(p.data)).toBe(false)
        expect(k.model.startsWith(p.versions)).toBe(false)
        expect(k.model.startsWith(p.home)).toBe(true)
    })

    it('keeps its pid beside the server’s, so `di down` can end both', () => {
        const dir = home()
        expect(path.dirname(keeperPaths(dir).pidFile)).toBe(paths(dir).run)
    })
})

describe('what status reports', () => {
    it('says nothing is here when nothing is', async () => {
        const status = await keeperStatus(home())
        expect(status.installed).toBe(false)
        expect(status.running).toBe(false)
    })

    it('calls a half-finished download incomplete rather than installed-and-broken', async () => {
        const dir = home()
        const k = keeperPaths(dir)
        fs.mkdirSync(k.models, { recursive: true })
        fs.mkdirSync(k.bin, { recursive: true })
        fs.writeFileSync(k.model, 'not all of it')
        fs.writeFileSync(k.server, '#!/bin/sh\n')
        const status = await keeperStatus(dir)
        expect(status.installed).toBe(true)
        expect(status.modelComplete).toBe(false)
    })

    it('notices when di.iiii is pointed at some other model', async () => {
        const dir = home()
        await writeEnv(dir, { LLM_BASE_URL: 'http://127.0.0.1:8090' })
        expect((await keeperStatus(dir)).wired).toBe(false)
        await writeEnv(dir, { LLM_BASE_URL: `http://127.0.0.1:${KEEPER_PORT}` })
        expect((await keeperStatus(dir)).wired).toBe(true)
    })
})

describe('a download that does not match its checksum', () => {
    it('is refused, and leaves nothing behind to be loaded later', async () => {
        const dir = home()
        const k = keeperPaths(dir)
        // The runner is already there, so the run reaches the weights.
        fs.mkdirSync(k.bin, { recursive: true })
        fs.writeFileSync(k.server, '#!/bin/sh\n')

        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (String(url).includes('/raw/main/')) {
                return {
                    ok: true,
                    text: async () => `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize ${MODEL.bytes}\n`
                }
            }
            // The bytes, and they are not the bytes the index promised.
            return {
                ok: true,
                headers: { get: () => '9' },
                body: new ReadableStream({
                    start(controller) { controller.enqueue(new TextEncoder().encode('not-them')); controller.close() }
                })
            }
        }))

        await expect(getKeeper(dir)).rejects.toThrow(/checksum/i)
        expect(fs.existsSync(k.model)).toBe(false)
        expect(fs.existsSync(`${k.model}.partial`)).toBe(false)
        // And nothing was wired: a refused model must not leave di.iiii
        // pointed at a port with nothing behind it.
        expect(readEnv(dir).LLM_BASE_URL).toBeUndefined()
    })
})

describe('removing it', () => {
    it('takes the files and the line that points at them', async () => {
        const dir = home()
        const k = keeperPaths(dir)
        fs.mkdirSync(k.models, { recursive: true })
        fs.writeFileSync(k.model, 'weights')
        await writeEnv(dir, { LLM_BASE_URL: `http://127.0.0.1:${KEEPER_PORT}`, LLM_MODEL: MODEL.name, PORT: '4000' })

        await removeKeeper(dir)

        expect(fs.existsSync(k.root)).toBe(false)
        expect(readEnv(dir).LLM_BASE_URL).toBeUndefined()
        // Everything else in di.env survives — this file holds the session
        // secret and the admin token.
        expect(readEnv(dir).PORT).toBe('4000')
    })

    it('leaves a model somebody else configured alone', async () => {
        const dir = home()
        await writeEnv(dir, { LLM_BASE_URL: 'http://127.0.0.1:8090', LLM_MODEL: 'their-own' })
        await removeKeeper(dir)
        expect(readEnv(dir).LLM_BASE_URL).toBe('http://127.0.0.1:8090')
        expect(readEnv(dir).LLM_MODEL).toBe('their-own')
    })
})

describe('the pinned build', () => {
    it('is a real llama.cpp build tag, not "latest"', () => {
        expect(LLAMA_BUILD).toMatch(/^b\d+$/)
    })
})

// The pid lifecycle, against a stand-in that just stays alive: the real binary
// is 17 MB and the real weights are 901, and neither is needed to prove that a
// started keeper is recorded, found again, and endable — which is the part
// `di down` depends on.
describe('starting and stopping it', () => {
    const withFakeServer = (dir) => {
        const k = keeperPaths(dir)
        fs.mkdirSync(k.bin, { recursive: true })
        fs.mkdirSync(k.models, { recursive: true })
        fs.writeFileSync(k.model, Buffer.alloc(8))
        fs.writeFileSync(k.server, '#!/bin/sh\nsleep 30\n')
        fs.chmodSync(k.server, 0o755)
        return k
    }

    it('records a pid, reports itself running, and stops', async () => {
        const dir = home()
        withFakeServer(dir)

        const started = await startKeeper(dir)
        expect(started.running).toBe(true)
        expect(started.pid).toBeGreaterThan(0)
        expect(fs.existsSync(keeperPaths(dir).pidFile)).toBe(true)

        // Found again from nothing but the pid file — this is what `di status`
        // and the next `di up` actually do.
        expect((await keeperStatus(dir)).running).toBe(true)

        expect(await stopKeeper(dir)).toBe(true)
        expect(fs.existsSync(keeperPaths(dir).pidFile)).toBe(false)
        expect((await keeperStatus(dir)).running).toBe(false)
    })

    it('does not start a second one when it is already up', async () => {
        const dir = home()
        withFakeServer(dir)
        const first = await startKeeper(dir)
        const second = await startKeeper(dir)
        expect(second.pid).toBe(first.pid)
        await stopKeeper(dir)
    })

    it('starts nothing when nothing has been fetched', async () => {
        expect(await startKeeper(home())).toBe(null)
    })
})
