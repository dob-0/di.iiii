// A preview iframe is a FULL app instance. Several booting at the same moment
// do not merely jank — on the mapper's output, five project surfaces asked to
// boot together all stalled on "Loading live experience" and the wall stayed
// black for as long as anyone waited. One at a time, they come up in seconds.
//
// Lifted out of SpaceHub.jsx (where the space cards hit this first) so the
// mapper does not carry a second copy that can drift from it.
export const PREVIEW_BOOT_SLOTS = 2

export const createPreviewBootQueue = (slots = PREVIEW_BOOT_SLOTS) => {
    const queue = { active: 0, waiting: [] }

    const grantNext = () => {
        while (queue.active < slots && queue.waiting.length) {
            const next = queue.waiting.shift()
            next.granted = true
            queue.active += 1
            next.start()
        }
    }

    // Returns the release function. A caller MUST release — on the iframe's
    // load, on unmount, or on a timeout — or the slot is held forever and
    // everything behind it waits on a boot that already finished or failed.
    return function requestBoot(start) {
        const entry = { start, granted: false, released: false }
        entry.release = () => {
            if (entry.released) return
            entry.released = true
            if (entry.granted) {
                queue.active -= 1
            } else {
                const index = queue.waiting.indexOf(entry)
                if (index !== -1) queue.waiting.splice(index, 1)
            }
            grantNext()
        }
        queue.waiting.push(entry)
        grantNext()
        return entry.release
    }
}
