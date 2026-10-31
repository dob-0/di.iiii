// The laser desk's ears (2026-10-31, the owner: "add audio analyze fully bpm sync as well"). The tempo half is Emily's
// Jam VJ listener (~/dev/jam-vj/listen.js), unchanged in what it decides:
//
// Every 512 samples the worklet (beat-worklet.js) sends bass and full-band energy. Rises in that energy (onsets, mostly
// kicks) make a 10 s strength curve. Twice a second:
//   tempo — the beat period whose echoes (1 to 4 beats apart) line up best, leaning towards 120 BPM so it doesn't jump
//           to half or double;
//   phase — where a grid at that period catches the most onsets, recent ones first;
//   lock  — the last 3 tempos agree within 1.5%.
// Added here: the bass and the whole signal as 0…1 against their own recent loudest (so a quiet room and a loud club
// both reach 1), and Low / Mid / High from an analyser for the meters. The microphone's own processing (echo cancelling,
// noise suppression, auto gain) is switched off: it treats steady music as noise to remove.
window.DeskListen = (() => {
    const KEEP_S = 10
    const RANGE_DB = 24 // 0…1 spans this far under the loudest of the last seconds
    const FALL_DB_PER_S = 3 // how fast that loudest lets go
    let ctx = null
    let stream = null
    let worklet = null
    let analyser = null
    let freq = null
    let hop = 512 / 48000
    let clock = 0
    let hops = 0
    let lastKick = 0
    let sB = null
    let sF = null
    let pB = 0
    let pF = 0
    let peakB = -120
    let peakF = -120
    let onsetB = []
    let onset = []
    let times = []
    let history = []
    let cb = {}

    const keep = () => Math.round(KEEP_S / hop)
    const push = (list, v) => { list.push(v); if (list.length > keep()) list.shift() }
    const clamp01 = (v) => Math.min(1, Math.max(0, v))

    const syncClock = () => {
        const ts = ctx.getOutputTimestamp?.()
        if (ts && ts.performanceTime > 0) clock = performance.timeOrigin + ts.performanceTime - ts.contextTime * 1000
        else clock = Date.now() - ctx.currentTime * 1000
    }

    // Low / Mid / High for the meters, from the analyser (the bands the light desk uses: under 150 Hz, to 2 kHz, above).
    const bands = () => {
        if (!analyser) return { mid: 0, high: 0 }
        analyser.getByteFrequencyData(freq)
        const hz = ctx.sampleRate / 2 / freq.length
        let mid = 0
        let high = 0
        let nm = 0
        let nh = 0
        for (let i = 0; i < freq.length; i += 1) {
            const f = (i + 0.5) * hz
            if (f < 150) continue
            if (f <= 2000) { mid += freq[i] / 255; nm += 1 } else { high += freq[i] / 255; nh += 1 }
        }
        return { mid: nm ? mid / nm : 0, high: nh ? high / nh : 0 }
    }

    const onHop = ({ t, bass, full }) => {
        const eB = 10 * Math.log10(bass + 1e-12)
        const eF = 10 * Math.log10(full + 1e-12)
        sB = sB === null ? eB : (sB + eB) / 2
        sF = sF === null ? eF : (sF + eF) / 2
        const fB = Math.max(0, sB - pB)
        const fF = Math.max(0, sF - pF)
        pB = sB
        pF = sF
        push(onsetB, fB)
        push(onset, fB + 0.4 * fF)
        push(times, t * 1000 + clock)
        peakB = Math.max(sB, peakB - FALL_DB_PER_S * hop)
        peakF = Math.max(sF, peakF - FALL_DB_PER_S * hop)
        cb.onLevels?.({ low: clamp01((sB - peakB + RANGE_DB) / RANGE_DB), level: clamp01((sF - peakF + RANGE_DB) / RANGE_DB), ...bandsEvery() })
        kick()
        if (++hops >= Math.round(0.5 / hop)) { hops = 0; estimate() }
    }
    // The analyser is read at most 20 times a second; between reads the meters keep the last bands.
    let bandsAt = 0
    let lastBands = { mid: 0, high: 0 }
    const bandsEvery = () => {
        const now = performance.now()
        if (now - bandsAt >= 50) { bandsAt = now; lastBands = bands() }
        return lastBands
    }

    // A kick: a peak in the bass onsets, well above the last second's usual.
    const kick = () => {
        const n = onsetB.length
        if (n < Math.round(1 / hop)) return
        const a = onsetB[n - 3]
        const b = onsetB[n - 2]
        const c = onsetB[n - 1]
        if (!(b > a && b >= c)) return
        const m = Math.round(1 / hop)
        let sum = 0
        let sq = 0
        for (let i = n - m; i < n; i += 1) { sum += onsetB[i]; sq += onsetB[i] * onsetB[i] }
        const mean = sum / m
        const sd = Math.sqrt(Math.max(0, sq / m - mean * mean))
        const at = times[n - 2]
        if (b > Math.max(1.5, mean + 1.8 * sd) && at - lastKick > 150) {
            lastKick = at
            cb.onKick?.(at, b)
        }
    }

    const estimate = () => {
        syncClock()
        const n = onset.length
        const need = Math.round(5 / hop)
        if (n < need) { cb.onStatus?.({ state: 'listening', seconds: n * hop }); return }
        const x = onset.slice()
        const mean = x.reduce((s, v) => s + v, 0) / n
        for (let i = 0; i < n; i += 1) x[i] -= mean
        const maxLag = Math.ceil((4 * 60) / 70 / hop) + 2
        const r = new Float64Array(maxLag + 2)
        for (let L = 0; L <= maxLag + 1; L += 1) {
            let s = 0
            for (let i = L; i < n; i += 1) s += x[i] * x[i - L]
            r[L] = s / (n - L)
        }
        if (r[0] <= 1e-9) { cb.onStatus?.({ state: 'quiet' }); return }
        const rAt = (L) => { const i = Math.floor(L); const f = L - i; return i + 1 <= maxLag + 1 ? r[i] * (1 - f) + r[i + 1] * f : 0 }
        const score = (bpm) => {
            const L = 60 / bpm / hop
            let s = 0
            for (let m = 1; m <= 4; m += 1) s += rAt(m * L) / Math.sqrt(m)
            return s * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.6, 2))
        }
        let bpm = 70
        let best = -Infinity
        for (let b = 70; b <= 180; b += 0.5) { const s = score(b); if (s > best) { best = s; bpm = b } }
        const coarse = bpm
        for (let b = coarse - 0.5; b <= coarse + 0.5; b += 0.05) { const s = score(b); if (s > best) { best = s; bpm = b } }
        const strength = rAt(60 / bpm / hop) / r[0]
        if (strength < 0.08) { history = []; cb.onStatus?.({ state: 'no-beat', strength }); return }

        // Tempo and phase refined together: within ±1.5% of that tempo, the grid that lands on the most onsets over the
        // last 12 beats (recent ones count more). Twelve beats make it precise to a fraction of a BPM.
        const soft = onset.map((v, i) => 0.25 * (onset[i - 1] ?? v) + 0.5 * v + 0.25 * (onset[i + 1] ?? v))
        const at = (pos) => { const i = Math.floor(pos); const f = pos - i; return soft[i] * (1 - f) + (soft[i + 1] ?? soft[i]) * f }
        const comb = (b) => {
            const P = 60 / b / hop
            let top = -Infinity
            let phase = 0
            for (let p = 0; p < P; p += 0.5) {
                let s = 0
                for (let k = 0; k < 12; k += 1) {
                    const pos = n - 1 - p - k * P
                    if (pos < 0) break
                    s += at(pos) * Math.pow(0.9, k)
                }
                if (s > top) { top = s; phase = p }
            }
            return [top, phase]
        }
        let fine = bpm
        let fineScore = -Infinity
        let phi = 0
        for (let b = bpm * 0.985; b <= bpm * 1.015; b += 0.05) {
            const [s, p] = comb(b)
            if (s > fineScore) { fineScore = s; fine = b; phi = p }
        }
        bpm = fine
        const lastBeat = times[n - 1] - phi * hop * 1000

        history.push(bpm)
        if (history.length > 6) history.shift()
        const sorted = history.slice().sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        const locked = history.length >= 3 && history.slice(-3).every((b) => Math.abs(b - median) / median < 0.015)
        cb.onTempo?.({ bpm: median, lastBeat, locked, strength })
    }

    const start = async (opts = {}) => {
        stop()
        cb = opts
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
                echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1
            }
        })
        ctx = new AudioContext({ latencyHint: 'interactive' })
        await ctx.audioWorklet.addModule(new URL('beat-worklet.js', document.baseURI).href)
        hop = 512 / ctx.sampleRate
        const source = ctx.createMediaStreamSource(stream)
        worklet = new AudioWorkletNode(ctx, 'beat-listener', { numberOfInputs: 1, numberOfOutputs: 1 })
        const silent = ctx.createGain()
        silent.gain.value = 0
        source.connect(worklet).connect(silent).connect(ctx.destination) // pulled by the output, heard by nobody
        analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.5
        source.connect(analyser)
        freq = new Uint8Array(analyser.frequencyBinCount)
        worklet.port.onmessage = (e) => onHop(e.data)
        await ctx.resume()
        syncClock()
        sB = sF = null
        pB = pF = 0
        peakB = peakF = -120
        onsetB = []; onset = []; times = []; history = []; hops = 0; lastKick = 0
        return stream.getAudioTracks()[0]?.label || 'microphone'
    }

    const stop = () => {
        try { worklet?.port.close() } catch { /* already gone */ }
        stream?.getTracks().forEach((track) => track.stop())
        ctx?.close().catch(() => {})
        ctx = stream = worklet = analyser = null
    }

    // The inputs this computer has (names only once the page may use the microphone).
    const inputs = async () => {
        try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput') } catch { return [] }
    }

    return { start, stop, inputs, get on () { return Boolean(ctx) } }
})()
