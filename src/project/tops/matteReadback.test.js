import { describe, expect, it } from 'vitest'
import { createMatteReadback } from './matteReadback.js'

// A fake WebGL2 context that records calls; `signal` is what clientWaitSync answers.
const fakeGl = () => {
    const calls = []
    const gl = {
        PIXEL_PACK_BUFFER: 35051, STREAM_READ: 35041, RGBA: 6408, UNSIGNED_BYTE: 5121,
        SYNC_GPU_COMMANDS_COMPLETE: 37143, ALREADY_SIGNALED: 37146, TIMEOUT_EXPIRED: 37147, CONDITION_SATISFIED: 37148, WAIT_FAILED: 37149,
        signal: 37147, lost: false, noFence: false, throwOnRead: false,
        calls,
        createBuffer: () => { calls.push('createBuffer'); return { buf: 1 } },
        bindBuffer: (target, b) => calls.push(`bindBuffer:${b ? 'buf' : 'null'}`),
        bufferData: (t, size) => calls.push(`bufferData:${size}`),
        readPixels: (...a) => { if (gl.throwOnRead) throw new Error('lost'); calls.push(`readPixels:${a[6]}`) },
        fenceSync: () => { calls.push('fenceSync'); return gl.noFence ? null : { sync: calls.length } },
        flush: () => calls.push('flush'),
        clientWaitSync: (s, flags, timeout) => { calls.push(`clientWaitSync:${flags}:${timeout}`); return gl.signal },
        deleteSync: () => calls.push('deleteSync'),
        getBufferSubData: (t, off, dst, dOff, len) => { calls.push(`getBufferSubData:${dst.length}`); dst.fill(7) },
        deleteBuffer: () => calls.push('deleteBuffer'),
        isContextLost: () => gl.lost
    }
    return gl
}

describe('matteReadback: a read that never waits', () => {
    it('is not available on a WebGL1 context (no fenceSync): the engine keeps its blocking read', () => {
        expect(createMatteReadback({ readPixels() {} }, 4, 4)).toBeNull()
        expect(createMatteReadback(null, 4, 4)).toBeNull()
    })

    it('start puts a fence behind a read into the pack buffer and does not copy anything yet', () => {
        const gl = fakeGl()
        const r = createMatteReadback(gl, 4, 2)
        expect(r.start()).toBe(true)
        expect(r.pending()).toBe(true)
        expect(gl.calls).toContain('readPixels:0')
        expect(gl.calls).toContain('bufferData:32')
        expect(gl.calls).toContain('fenceSync')
        expect(gl.calls).not.toContain('getBufferSubData:32')
        expect(gl.calls.at(-1)).toBe('flush')
    })

    it('poll asks with timeout 0 and flags 0 and returns false while the fence is not signalled', () => {
        const gl = fakeGl()
        const r = createMatteReadback(gl, 4, 2)
        r.start()
        const dst = new Uint8Array(32)
        expect(r.poll(dst)).toBe(false)
        expect(gl.calls).toContain('clientWaitSync:0:0')
        expect(dst[0]).toBe(0)
        expect(r.pending()).toBe(true)
    })

    it('poll copies the bytes out once the fence is signalled, then nothing is pending', () => {
        const gl = fakeGl()
        const r = createMatteReadback(gl, 4, 2)
        r.start()
        gl.signal = gl.ALREADY_SIGNALED
        const dst = new Uint8Array(32)
        expect(r.poll(dst)).toBe(true)
        expect(dst[31]).toBe(7)
        expect(gl.calls).toContain('deleteSync')
        expect(r.pending()).toBe(false)
        expect(gl.calls.at(-1)).toBe('bindBuffer:null')
        // the next read reuses the buffer
        expect(r.start()).toBe(true)
        expect(gl.calls.filter((c) => c === 'createBuffer')).toHaveLength(1)
    })

    it('a second start while one is pending does nothing', () => {
        const gl = fakeGl()
        const r = createMatteReadback(gl, 4, 2)
        expect(r.start()).toBe(true)
        expect(r.start()).toBe(false)
        expect(gl.calls.filter((c) => c === 'fenceSync')).toHaveLength(1)
    })

    it('cancel drops a pending read cleanly: the fence is deleted and the bytes are never copied', () => {
        const gl = fakeGl()
        const r = createMatteReadback(gl, 4, 2)
        r.start()
        r.cancel()
        expect(gl.calls).toContain('deleteSync')
        expect(r.pending()).toBe(false)
        gl.signal = gl.ALREADY_SIGNALED
        expect(r.poll(new Uint8Array(32))).toBe(false)
        expect(gl.calls.some((c) => c.startsWith('getBufferSubData'))).toBe(false)
    })

    it('a failed wait (lost context) marks it failed so the engine falls back, and never throws', () => {
        const gl = fakeGl()
        const r = createMatteReadback(gl, 4, 2)
        r.start()
        gl.signal = gl.WAIT_FAILED
        expect(r.poll(new Uint8Array(32))).toBe(false)
        expect(r.failed()).toBe(true)
        expect(r.start()).toBe(false)
    })

    it('a lost context, a null fence or a throwing read all end as failed, not as an exception', () => {
        const lost = fakeGl(); lost.lost = true
        expect(createMatteReadback(lost, 4, 2).start()).toBe(false)
        const nofence = fakeGl(); nofence.noFence = true
        const a = createMatteReadback(nofence, 4, 2)
        expect(a.start()).toBe(false)
        expect(a.failed()).toBe(true)
        const bad = fakeGl(); bad.throwOnRead = true
        const b = createMatteReadback(bad, 4, 2)
        expect(b.start()).toBe(false)
        expect(b.failed()).toBe(true)
        expect(b.pending()).toBe(false)
    })

    it('dispose deletes the buffer and any pending fence', () => {
        const gl = fakeGl()
        const r = createMatteReadback(gl, 4, 2)
        r.start()
        r.dispose()
        expect(gl.calls).toContain('deleteSync')
        expect(gl.calls).toContain('deleteBuffer')
    })
})
