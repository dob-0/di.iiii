import { describe, expect, it, vi } from 'vitest'
import {
    createCodePageReadBridge,
    createReadLimiter,
    isAllowedReadPath,
    stripQuery
} from './codePageReadBridge.js'

function setup({ fetchImpl, timeoutMs } = {}) {
    const frame = { postMessage: vi.fn() }
    const fetchMock = fetchImpl || vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ live: 1 }) }))
    const handle = createCodePageReadBridge({ getFrameWindow: () => frame, fetchImpl: fetchMock, timeoutMs })
    const send = (data, source = frame) => handle({ source, data })
    return { frame, fetchMock, send }
}
const read = (path, id = 'a') => ({ type: 'di-code-page-read', id, path })

describe('codePageReadBridge', () => {
    it('strips query strings and allows only the two status paths', () => {
        expect(stripQuery('/light/api/summary?x=1#h')).toBe('/light/api/summary')
        expect(isAllowedReadPath('/light/api/summary?x=1')).toBe(true)
        expect(isAllowedReadPath('/light/api/state')).toBe(true)
        expect(isAllowedReadPath('/light/api/summary/')).toBe(false)
        expect(isAllowedReadPath('/light/api/state/../x')).toBe(false)
        expect(isAllowedReadPath('//evil.test/light/api/state')).toBe(false)
        expect(isAllowedReadPath(undefined)).toBe(false)
    })

    it('fetches an allowed path same-origin with GET and posts the parsed body', async () => {
        const { frame, fetchMock, send } = setup()
        await send(read('/light/api/summary?a=1'))
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('/light/api/summary?a=1')
        expect(init.method).toBe('GET')
        expect(init.credentials).toBe('same-origin')
        expect(frame.postMessage).toHaveBeenCalledWith(
            { type: 'di-code-page-read-result', id: 'a', ok: true, status: 200, body: { live: 1 } },
            '*'
        )
    })

    it('rejects other paths with 403 without fetching', async () => {
        const { frame, fetchMock, send } = setup()
        await send(read('/light/api/secret'))
        expect(fetchMock).not.toHaveBeenCalled()
        expect(frame.postMessage.mock.calls[0][0]).toMatchObject({ id: 'a', ok: false, status: 403, error: 'not allowed' })
    })

    it('only ever issues GET', async () => {
        const { fetchMock, send } = setup()
        await send({ ...read('/light/api/state'), method: 'POST' })
        expect(fetchMock.mock.calls[0][1].method).toBe('GET')
    })

    it('ignores messages from another source and other message types', async () => {
        const { frame, fetchMock, send } = setup()
        await send(read('/light/api/state'), { postMessage: vi.fn() })
        await send({ type: 'other', path: '/light/api/state' })
        expect(fetchMock).not.toHaveBeenCalled()
        expect(frame.postMessage).not.toHaveBeenCalled()
    })

    it('drops reads past 4 per second with 429', async () => {
        const { frame, fetchMock, send } = setup()
        for (let i = 0; i < 6; i++) await send(read('/light/api/state', `r${i}`))
        expect(fetchMock).toHaveBeenCalledTimes(4)
        const last = frame.postMessage.mock.calls.map((c) => c[0]).filter((m) => m.status === 429)
        expect(last.map((m) => m.id)).toEqual(['r4', 'r5'])
    })

    it('limiter frees slots after the window', () => {
        let t = 0
        const allow = createReadLimiter({ now: () => t })
        expect([1, 2, 3, 4, 5].map(() => allow())).toEqual([true, true, true, true, false])
        t = 1001
        expect(allow()).toBe(true)
    })

    it('answers ok:false when the fetch times out', async () => {
        const hang = vi.fn((url, { signal }) => new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }))
        const { frame, send } = setup({ fetchImpl: hang, timeoutMs: 20 })
        await send(read('/light/api/state'))
        expect(frame.postMessage.mock.calls[0][0]).toMatchObject({ ok: false, body: null, error: 'timeout' })
    })

    it('gives body null for a non-JSON response', async () => {
        const { frame, send } = setup({
            fetchImpl: vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('x') } }))
        })
        await send(read('/light/api/state'))
        expect(frame.postMessage.mock.calls[0][0]).toMatchObject({ ok: false, status: 502, body: null })
    })
})
