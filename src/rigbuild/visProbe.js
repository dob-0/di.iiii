// The visualiser's measuring hooks — window.__diVis. RIG_BUILD.md §19.6.
//
// Only installed when a page asks (the visualiser page, or any room with ?probe=1), so a
// room nobody is measuring pays one property read per frame. The harness
// (scripts/rigbuild/vis-latency.mjs) drives a browser and calls, in the page:
//   __diVis.expect(lampId, (dmx) => dmx.pan > 100)  → Promise<{ at, epochAt, frame }>
// resolved on the first DRAWN frame whose entity for lampId carries desk values
// (components.rigDmx, dmxPose.js) that satisfy the test; `at` is performance.now(),
// `epochAt` the same instant on the epoch clock (performance.timeOrigin + at) so a
// sender in another process on the same machine can subtract its own Date.now().
// __diVis.fps() → frames drawn per second over the last second.

const install = () => {
    const pending = []
    const stamps = []
    let frames = 0
    let latest = []
    const probe = {
        frame(entities) {
            frames += 1
            latest = entities || []
            const now = performance.now()
            stamps.push(now)
            while (stamps.length && now - stamps[0] > 1000) stamps.shift()
            if (!pending.length) return
            const byId = new Map()
            for (const e of entities || []) if (e?.components?.rigDmx) byId.set(e.id, e.components.rigDmx)
            for (let i = pending.length - 1; i >= 0; i--) {
                const p = pending[i]
                const dmx = byId.get(p.id)
                let hit = false
                try { hit = Boolean(dmx && p.test(dmx)) } catch { hit = false }
                if (hit) {
                    pending.splice(i, 1)
                    try { performance.mark(`di-vis:${p.label || p.id}`) } catch { /* old browser */ }
                    p.resolve({ at: now, epochAt: performance.timeOrigin + now, frame: frames, dmx })
                } else if (now > p.deadline) {
                    pending.splice(i, 1)
                    p.reject(new Error(`lamp ${p.id}: not seen within ${p.timeoutMs} ms`))
                }
            }
        },
        expect(id, test, { timeoutMs = 5000, label = null } = {}) {
            return new Promise((resolve, reject) => {
                pending.push({ id, test, resolve, reject, label, timeoutMs, deadline: performance.now() + timeoutMs })
            })
        },
        // The desk values each driven lamp is drawn with, on the last drawn frame.
        driven() {
            return latest.filter((e) => e?.components?.rigDmx).map((e) => ({ id: e.id, index: e.components.fixture?.index ?? null, type: e.components.fixture?.type || null, ...e.components.rigDmx }))
        },
        fps: () => stamps.length,
        frames: () => frames
    }
    return probe
}

export const installVisProbe = (force = false) => {
    if (typeof window === 'undefined') return null
    const asked = force || window.__diVisWanted === true || /(?:^|[?&])probe=1\b/.test(window.location?.search || '')
    if (!asked) return null
    if (!window.__diVis) window.__diVis = install()
    return window.__diVis
}

export const visProbe = () => (typeof window !== 'undefined' ? window.__diVis || null : null)
