// A baked beat analysis, read at a time in the track. Pure: the same analysis
// and the same seconds give the same answer, so a piece built on it can be
// seeked (a live AnalyserNode cannot). The format and the bake method are
// written down in docs/ai/decisions/2026-10-21-beat-bake-method.md:
//
//   { beats: [s, …] rising seconds,
//     bands: { rate: frames per second, low: [0..1, …], mid: […], high: […] },
//     beatsPerBar: 4, downbeat: index of the first bar's first beat,
//     strong: [beat index, …] }
//
// Only `beats` is required. Without `strong`, the strong beats are the bar
// downbeats; without `bands`, Low/Mid/High read 0.

export const DEFAULT_BEATS_PER_BAR = 4
const BANDS = ['low', 'mid', 'high']

const finiteList = (list) => (Array.isArray(list) ? list.filter((v) => Number.isFinite(v)) : [])

// Text (JSON) or an object to a clean analysis, or null. Parsed text is kept
// per string so a pass does not parse the same analysis once per port.
const parsed = new Map()
const PARSED_LIMIT = 8
export const readAnalysis = (raw) => {
    let value = raw
    if (typeof raw === 'string') {
        if (!raw.trim()) return null
        if (parsed.has(raw)) return parsed.get(raw)
        try { value = JSON.parse(raw) } catch { value = null }
        const clean = cleanAnalysis(value)
        if (parsed.size >= PARSED_LIMIT) parsed.delete(parsed.keys().next().value)
        parsed.set(raw, clean)
        return clean
    }
    return cleanAnalysis(value)
}

const cleanAnalysis = (value) => {
    if (!value || typeof value !== 'object') return null
    const beats = finiteList(value.beats)
    // Beats must rise; an analysis that does not is refused, not sorted, so a
    // broken bake shows as "no analysis" instead of a grid that looks right.
    for (let i = 1; i < beats.length; i += 1) if (!(beats[i] > beats[i - 1])) return null
    if (!beats.length) return null
    const perBar = Math.round(Number(value.beatsPerBar))
    const beatsPerBar = perBar >= 1 && perBar <= 32 ? perBar : DEFAULT_BEATS_PER_BAR
    const down = Math.round(Number(value.downbeat))
    const downbeat = Number.isFinite(down) && down >= 0 ? down : 0
    const rate = Number(value.bands?.rate)
    const bands = rate > 0
        ? Object.fromEntries(BANDS.map((band) => [band, finiteList(value.bands?.[band])]))
        : null
    const strong = Array.isArray(value.strong) ? new Set(finiteList(value.strong).map(Math.round)) : null
    return { beats, beatsPerBar, downbeat, bands: bands && { rate, ...bands }, strong }
}

// Index of the last beat at or before `t`, or -1 before the first.
export const beatIndexAt = (beats, t) => {
    let lo = 0
    let hi = beats.length - 1
    if (!(t >= beats[0])) return -1
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (beats[mid] <= t) lo = mid
        else hi = mid - 1
    }
    return lo
}

export const isStrongBeat = (analysis, index) => {
    if (index < 0) return false
    if (analysis.strong) return analysis.strong.has(index)
    const inBar = index - analysis.downbeat
    return inBar >= 0 && inBar % analysis.beatsPerBar === 0
}

// One band at `t`, linear between frames, held at the ends; 0 when absent.
export const bandAt = (analysis, band, t) => {
    const frames = analysis?.bands?.[band]
    if (!frames?.length) return 0
    const at = Math.max(0, t * analysis.bands.rate)
    const i = Math.floor(at)
    if (i >= frames.length - 1) return frames[frames.length - 1]
    const f = at - i
    return frames[i] + (frames[i + 1] - frames[i]) * f
}

// Everything the node answers at `t` seconds. Before the first beat the
// counts are 0 and Phase climbs toward that first beat; after the last beat
// there is no next one, so Phase holds 0 and Age keeps counting.
export const readGridAt = (analysis, t) => {
    const { beats, beatsPerBar, downbeat } = analysis
    const index = beatIndexAt(beats, t)
    const prev = index >= 0 ? beats[index] : 0
    const next = beats[index + 1]
    const gap = next !== undefined ? next - prev : null
    const phase = gap ? Math.min(1, Math.max(0, (t - prev) / gap)) : 0
    // Local tempo from the gap around `t`, the last gap past the end.
    const last = beats.length - 1
    const tempoGap = index >= 0 && gap ? gap
        : last < 1 ? 0
        : index < 0 ? beats[1] - beats[0]
        : beats[last] - beats[last - 1]
    const inBar = index - downbeat
    return {
        index,
        count: index + 1,
        phase,
        age: index >= 0 ? t - prev : 0,
        beat: index >= 0 ? (((inBar % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1 : 0,
        bar: index >= 0 ? Math.floor(inBar / beatsPerBar) : 0,
        strong: isStrongBeat(analysis, index),
        bpm: tempoGap > 0 ? 60 / tempoGap : 0
    }
}
