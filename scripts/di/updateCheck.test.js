import { afterEach, describe, expect, it, vi } from 'vitest'

import { latestRelease } from './install.mjs'
// ?raw hands us the file's text without executing it — the ordering below is a
// property of the source, and vitest serves this module over an http-scheme URL
// so import.meta.url cannot be given to fs.
import cliText from './cli.mjs?raw'

const cliSource = () => cliText

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
})

// `di up` prints the app's URL and then, at most once a day, mentions a newer
// version. Both halves of that were broken for a machine with no network:
//
//   1. the fetch had no timeout, so a captive portal — the normal state of venue
//      wifi — held the terminal for the OS TCP timeout AFTER the app was already
//      running and printed
//   2. lastUpdateCheck was written only on success, so the machine that cannot
//      reach the network is exactly the machine that retries on every start,
//      which is the opposite of what the function's own comment promises
//
// The ordering half is asserted in cliUpdateCheck below by reading the source,
// because noticeNewVersion is module-private and the alternative is exporting a
// private for a test's convenience.
describe('latestRelease timeout', () => {
    it('passes no signal when unbounded, so an explicit install can take its time', async () => {
        let seenInit = null
        globalThis.fetch = vi.fn(async (_url, init) => {
            seenInit = init
            return { ok: true, json: async () => ({ tag_name: 'v1.0.0', assets: [
                { name: 'di-runtime-1.0.0.tar.gz', browser_download_url: 'https://x/y' },
                { name: 'checksums.txt', browser_download_url: 'https://x/c' }
            ] }) }
        })
        await latestRelease()
        expect(seenInit.signal).toBeUndefined()
    })

    it('aborts when the release feed never answers', async () => {
        globalThis.fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
            // a captive portal: the socket opens and nothing ever comes back
            init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }))
        const started = Date.now()
        await expect(latestRelease({ timeoutMs: 40 })).rejects.toThrow()
        expect(Date.now() - started).toBeLessThan(2000)
    })
})

describe('the once-a-day update notice', () => {
    // Reading the source is deliberate: the ordering IS the fix, it is not
    // observable from outside the module, and a test that mocks its way around
    // that would pass against the broken version.
    it('records that it looked BEFORE asking, so a failed check still counts', async () => {
        const source = cliSource()
        const write = source.indexOf('writeState(home, { lastUpdateCheck')
        const ask = source.indexOf('latestRelease({ timeoutMs')
        expect(write).toBeGreaterThan(-1)
        expect(ask).toBeGreaterThan(-1)
        expect(write).toBeLessThan(ask)
    })

    // Scoped to noticeNewVersion deliberately: `di update` calls latestRelease
    // unbounded and SHOULD — that request is the thing the artist just asked
    // for. It is only the automatic one, on a path that must work offline, that
    // may never hang.
    it('bounds the request on the start path, while leaving `di update` alone', () => {
        const source = cliSource()
        const start = source.indexOf('const noticeNewVersion')
        const end = source.indexOf('const cmdDown')
        expect(start).toBeGreaterThan(-1)
        expect(end).toBeGreaterThan(start)
        const body = source.slice(start, end)
        expect(body).toContain('latestRelease({ timeoutMs: UPDATE_CHECK_TIMEOUT_MS })')
        expect(body).not.toMatch(/await latestRelease\(\)/)
        // and the explicit command keeps its unbounded call
        expect(source.slice(end)).toMatch(/await latestRelease\(\)/)
    })
})
