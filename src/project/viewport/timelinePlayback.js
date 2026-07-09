// Keyframe timeline evaluation shared by the editor preview (StudioViewport)
// and the published viewer (LiveProjectScene) so authored motion plays identically.
// A key's `easing` shapes the segment arriving at that key.

const ease = (u) => u * u * (3 - 2 * u)

export function timelineTime(timeline, elapsed) {
    const duration = timeline?.duration > 0 ? timeline.duration : 0
    if (!duration) return 0
    if (timeline.loop === false) return Math.min(Math.max(elapsed, 0), duration)
    return ((elapsed % duration) + duration) % duration
}

const sampleTrack = (track, t) => {
    const keys = track?.keys
    if (!keys?.length) return null
    if (t <= keys[0].t) return keys[0].value
    const last = keys[keys.length - 1]
    if (t >= last.t) return last.value
    for (let i = 1; i < keys.length; i += 1) {
        const to = keys[i]
        if (t > to.t) continue
        const from = keys[i - 1]
        const span = to.t - from.t
        let u = span > 0 ? (t - from.t) / span : 1
        if (to.easing !== 'linear') u = ease(u)
        if (Array.isArray(from.value) && Array.isArray(to.value)) {
            return [0, 1, 2].map((axis) => from.value[axis] + (to.value[axis] - from.value[axis]) * u)
        }
        return from.value + (to.value - from.value) * u
    }
    return last.value
}

// → { position?, rotation?, scale?, opacity? } for the (looped) time, or null.
export function sampleTimeline(timeline, elapsed) {
    if (!hasTimelineTracks(timeline)) return null
    const t = timelineTime(timeline, elapsed)
    const pose = {}
    timeline.tracks.forEach((track) => {
        const value = sampleTrack(track, t)
        if (value !== null) pose[track.property] = value
    })
    return pose
}

export function hasTimelineTracks(timeline) {
    return Boolean(timeline?.tracks?.some((track) => track.keys?.length))
}

// Mutate a three.js group to a sampled pose; unkeyed channels fall back to the
// authored base so a position-only timeline never disturbs rotation/scale.
export function applyTimelinePose(group, pose, base) {
    if (!pose) return
    const p = pose.position || base.position
    const r = pose.rotation || base.rotation
    const s = pose.scale || base.scale
    group.position.set(p[0], p[1], p[2])
    group.rotation.set(r[0], r[1], r[2])
    group.scale.set(s[0], s[1], s[2])
    if (pose.opacity !== undefined) {
        group.traverse((object) => {
            const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
            materials.forEach((material) => {
                material.opacity = pose.opacity
                material.transparent = material.transparent || pose.opacity < 1
            })
        })
    }
}
