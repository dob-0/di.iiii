import { describe, expect, it, vi } from 'vitest'
import { createUploadQueue, PIECE_DONE, PIECE_FAILED } from './uploadQueue.js'

describe('createUploadQueue', () => {
    it('refuses to exist without something to send with', () => {
        expect(() => createUploadQueue()).toThrow(/send function/)
    })

    // The property the sources wall depends on: it is read as a sequence, and
    // piece 4 hanging left of piece 3 is a wall that lies about the walk.
    it('sends in the order the pieces were recorded', async () => {
        const sent = []
        const queue = createUploadQueue(async (item) => {
            sent.push(item.label)
            return { url: item.label }
        })
        queue.add({ label: 'piece-1' })
        queue.add({ label: 'piece-2' })
        queue.add({ label: 'piece-3' })
        await queue.idle()
        expect(sent).toEqual(['piece-1', 'piece-2', 'piece-3'])
        expect(queue.state().done).toBe(3)
    })

    // Parallel uploads on a phone's uplink make every piece slower and land them
    // out of order.
    it('never has two pieces in the air at once', async () => {
        let inFlight = 0
        let mostAtOnce = 0
        const queue = createUploadQueue(async () => {
            inFlight += 1
            mostAtOnce = Math.max(mostAtOnce, inFlight)
            await Promise.resolve()
            inFlight -= 1
        })
        for (let piece = 0; piece < 5; piece += 1) queue.add({ label: `piece-${piece}` })
        await queue.idle()
        expect(mostAtOnce).toBe(1)
    })

    // Recording must not stop while an upload is in the air.
    it('returns from add() without waiting for the upload', async () => {
        let resolveSend = null
        const queue = createUploadQueue(() => new Promise((resolve) => { resolveSend = resolve }))
        const id = queue.add({ label: 'piece-1' })
        expect(id).toBe(1)
        expect(queue.state().done).toBe(0)
        resolveSend({ ok: true })
        await queue.idle()
        expect(queue.state().done).toBe(1)
    })

    it('tries a failed piece exactly once more, and gets on with the next one', async () => {
        const attempts = []
        const send = vi.fn(async (item) => {
            attempts.push(item.label)
            if (item.label === 'piece-2' && item.attempts === 1) throw new Error('one bar')
            return { ok: true }
        })
        const queue = createUploadQueue(send)
        queue.add({ label: 'piece-1' })
        queue.add({ label: 'piece-2' })
        queue.add({ label: 'piece-3' })
        await queue.idle()
        expect(attempts).toEqual(['piece-1', 'piece-2', 'piece-2', 'piece-3'])
        expect(queue.state().done).toBe(3)
        expect(queue.state().failed).toBe(0)
    })

    // Twice and no more: a phone that has genuinely lost signal fails the second
    // time too, and an endless retry means the queue never reaches the piece
    // recorded after the signal came back.
    it('gives up after the second try rather than looping forever', async () => {
        const send = vi.fn(async (item) => {
            if (item.label === 'piece-1') throw new Error('lift shaft')
            return { ok: true }
        })
        const queue = createUploadQueue(send)
        queue.add({ label: 'piece-1' })
        queue.add({ label: 'piece-2' })
        await queue.idle()
        expect(send).toHaveBeenCalledTimes(3)
        const { items } = queue.state()
        expect(items[0].status).toBe(PIECE_FAILED)
        expect(items[0].attempts).toBe(2)
        expect(items[0].error).toBe('lift shaft')
        // And the walk carries on: the piece recorded after the signal came back
        // is not stuck behind the one that failed.
        expect(items[1].status).toBe(PIECE_DONE)
    })

    // A piece that failed twice is KEPT, with its blob, so a person can send it
    // again. Nothing a person walked for is ever dropped silently.
    it('keeps a failed piece and can be told to try them all again', async () => {
        let network = false
        const queue = createUploadQueue(async () => {
            if (!network) throw new Error('no signal')
            return { ok: true }
        })
        queue.add({ label: 'piece-1', blob: 'bytes' })
        await queue.idle()
        expect(queue.state().failed).toBe(1)
        expect(queue.state().items[0].blob).toBe('bytes')
        network = true
        expect(queue.retryFailed()).toBe(1)
        await queue.idle()
        expect(queue.state().failed).toBe(0)
        expect(queue.state().done).toBe(1)
    })

    it('says nothing to retry when nothing failed', async () => {
        const queue = createUploadQueue(async () => ({ ok: true }))
        queue.add({ label: 'piece-1' })
        await queue.idle()
        expect(queue.retryFailed()).toBe(0)
    })

    // A send that resolves undefined still succeeded; only a throw is a failure.
    it('treats an uploader that returns nothing as a success', async () => {
        const queue = createUploadQueue(async () => undefined)
        queue.add({ label: 'piece-1' })
        await queue.idle()
        expect(queue.state().done).toBe(1)
        expect(queue.state().items[0].result).toBeNull()
    })

    // The backlog is the only thing on the screen that says whether the walk is
    // safe yet.
    it('reports the backlog on every change', async () => {
        const seen = []
        const queue = createUploadQueue(async () => ({ ok: true }), {
            onChange: (state) => seen.push(`${state.pending}/${state.sending}/${state.done}`)
        })
        queue.add({ label: 'piece-1' })
        await queue.idle()
        expect(seen[0]).toBe('1/0/0')
        expect(seen[seen.length - 1]).toBe('0/0/1')
        expect(queue.state().busy).toBe(false)
    })

    // A piece queued while the last one was already in flight must still go up:
    // the drain loop has run out of pending work by then, so the pump has to
    // look again after letting go of its own promise.
    it('picks up a piece added while the queue was already draining', async () => {
        const sent = []
        let resolveFirst = null
        const queue = createUploadQueue((item) => {
            sent.push(item.label)
            if (item.label === 'piece-1') return new Promise((resolve) => { resolveFirst = resolve })
            return Promise.resolve({ ok: true })
        })
        queue.add({ label: 'piece-1' })
        await Promise.resolve()
        queue.add({ label: 'piece-2' })
        resolveFirst({ ok: true })
        await queue.idle()
        expect(sent).toEqual(['piece-1', 'piece-2'])
        expect(queue.state().done).toBe(2)
    })
})
