// The ring buffer of a fake LaserCube (shared by fake-cube-rehearsal.mjs and fake-cube-two-outs.mjs).
// It is played at the cube's DAC rate; it counts an UNDERRUN each time the buffer runs dry while the
// output is on and points have been fed (one event per run-dry, not per tick), the points that were
// missing, and an overflow when more arrives than the size holds. Ledger N1501.6 / N1501.18.
export const createRingBuffer = ({ rate = 30000, size = 6000, now = () => Number(process.hrtime.bigint()) / 1e6 } = {}) => {
    const b = { buffered: 0, playedAt: now(), fed: false, dry: false, underruns: 0, missing: 0, overflow: 0, outputOn: () => true }
    b.play = () => {
        const t = now()
        const played = ((t - b.playedAt) * rate) / 1000
        b.playedAt = t
        if (b.fed && b.outputOn() && played > b.buffered) {
            b.missing += played - b.buffered
            if (!b.dry) { b.dry = true; b.underruns += 1 }
        }
        b.buffered = Math.max(0, b.buffered - played)
    }
    b.free = () => { b.play(); return Math.max(0, Math.floor(size - b.buffered)) }
    b.feed = (n) => {
        b.play()
        b.fed = true
        b.dry = false
        b.buffered += n
        if (b.buffered > size) { b.overflow += b.buffered - size; b.buffered = size }
    }
    b.clear = () => { b.play(); const dropped = Math.round(b.buffered); b.buffered = 0; b.fed = false; b.dry = false; return dropped }
    b.snapshot = () => ({ underruns: b.underruns, missing: Math.round(b.missing), overflow: Math.round(b.overflow) })
    return b
}
