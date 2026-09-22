// THE WALK GOES UP AS IT HAPPENS — one piece at a time, in order, with a second try.
//
// The whole reason the recorder cuts the walk into 30-second pieces is this
// queue. A phone walking a factory hall is on the worst network it will ever be
// on: one bar, a lift shaft, a basement. If the walk were one file it would
// upload at the end, and a connection that dies at minute nine loses nine
// minutes of walking somebody did once. Cut into pieces and sent as they close,
// a dead connection loses the piece in the air — thirty seconds — and the phone
// keeps recording while it retries.
//
// Three properties, and they are the test:
//
//   ORDER. Pieces go up in the order they were recorded, one at a time, never
//   in parallel. Parallel uploads on a phone's uplink make every piece slower
//   and land them out of order, and the sources wall is read as a sequence —
//   piece 4 hanging left of piece 3 is a wall that lies about the walk.
//
//   ONE RETRY. A failed piece is tried once more, immediately. Once, because a
//   phone that has genuinely lost signal will fail the second time too and an
//   endless retry loop means the queue never reaches the piece recorded after
//   the signal came back. A piece that fails twice is KEPT, with its blob, and
//   listed as failed so a person can send it again by hand — never silently
//   dropped.
//
//   NON-BLOCKING. Adding never waits. `add()` returns at once and the walk
//   carries on; the queue drains behind it.
//
// No timers, no backoff: an immediate second try is the honest one here.
// Whatever the phone is doing, a delay would only mean the queue is further
// behind the walk when the walk ends, and the person is standing in the hall
// waiting for a progress bar either way.

export const PIECE_PENDING = 'pending'
export const PIECE_SENDING = 'sending'
export const PIECE_DONE = 'done'
export const PIECE_FAILED = 'failed'

/**
 * @param {(item: any) => Promise<any>} send what actually uploads one piece.
 * @param {(state: {items: Array, pending: number, failed: number, done: number, busy: boolean}) => void} [onChange]
 *        called after every state change, so a screen can show the backlog.
 */
export const createUploadQueue = (send, { onChange = null } = {}) => {
    if (typeof send !== 'function') throw new Error('createUploadQueue needs a send function')
    const items = []
    let nextId = 1
    let busy = false
    let draining = null

    const state = () => ({
        items: items.map((item) => ({ ...item })),
        pending: items.filter((item) => item.status === PIECE_PENDING).length,
        sending: items.filter((item) => item.status === PIECE_SENDING).length,
        done: items.filter((item) => item.status === PIECE_DONE).length,
        failed: items.filter((item) => item.status === PIECE_FAILED).length,
        busy
    })

    const announce = () => {
        if (onChange) onChange(state())
    }

    const drain = async () => {
        busy = true
        // Always the FIRST pending item, never a later one that happens to be
        // ready — that is what keeps the order.
        for (let item = items.find((entry) => entry.status === PIECE_PENDING);
            item;
            item = items.find((entry) => entry.status === PIECE_PENDING)) {
            item.status = PIECE_SENDING
            announce()
            let sent = null
            let lastError = null
            // One try, then one retry. Two attempts total and no more.
            for (let attempt = 0; attempt < 2 && sent === null; attempt += 1) {
                item.attempts = attempt + 1
                try {
                    sent = await send(item)
                    // A send that resolves undefined still SUCCEEDED; only a
                    // throw is a failure. Normalising to `true` keeps the loop
                    // condition honest for an uploader that returns nothing.
                    if (sent === undefined || sent === null) sent = true
                } catch (error) {
                    lastError = error
                }
            }
            if (sent === null) {
                item.status = PIECE_FAILED
                // The message, not the Error: this is read on a phone screen.
                item.error = String(lastError?.message || lastError || 'upload failed')
            } else {
                item.status = PIECE_DONE
                item.result = sent === true ? null : sent
                item.error = ''
            }
            announce()
        }
        busy = false
        announce()
    }

    const pump = () => {
        if (draining) return draining
        draining = drain().finally(() => {
            draining = null
            // A piece added while the last one was in flight arrives after the
            // loop has already run out of pending work, so the pump looks again
            // once it has let go of its own promise.
            if (items.some((entry) => entry.status === PIECE_PENDING)) pump()
        })
        return draining
    }

    return {
        /** Queue one piece. Returns its id and does NOT wait for the upload. */
        add: (payload = {}) => {
            const item = {
                id: nextId,
                status: PIECE_PENDING,
                attempts: 0,
                error: '',
                result: null,
                ...payload
            }
            nextId += 1
            items.push(item)
            announce()
            void pump()
            return item.id
        },
        /** Try the failed ones again — the "send it again by hand" path. */
        retryFailed: () => {
            let woken = 0
            items.forEach((item) => {
                if (item.status !== PIECE_FAILED) return
                item.status = PIECE_PENDING
                item.attempts = 0
                item.error = ''
                woken += 1
            })
            if (woken) {
                announce()
                void pump()
            }
            return woken
        },
        state,
        /** Resolves when the queue has nothing left to try. */
        idle: async () => {
            while (draining) await draining
        }
    }
}
