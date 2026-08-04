// The edit list, flattened for the landing page.
//
// It is a COPY and not an import, for one reason: `sequences/index.js` imports
// every sequence component, so importing it here would pull @react-three/fiber
// and three.js (1.6 MB) into the landing chunk for a page that draws its
// preview on a 2D canvas and never mounts the piece. That is the same trap
// documented at GridFloorBackground in LandingPage.jsx.
//
// The copy is kept honest by `beatCards.test.js`, which imports BOTH this file
// and the real edit list and asserts the ids, titles, windows and world colours
// match. Retime a clip in the director panel, paste the result back into
// sequences/index.js, and that test fails until this file follows. Drift is a
// red test, not a wrong page.
//
// `blurb` and `sketch` are landing-only and have no counterpart in the edit
// list: the sequence `note` is written for whoever is editing the piece and
// runs to eighty words, which is not what somebody deciding whether to put a
// headset on wants to read.

export const BEAT_CARDS = [
    {
        id: 's01-white-tunnel',
        title: 'White tunnel',
        blurb: 'Light, and nothing in it yet — the medium before the message. Strobe rings rush the eye out of the dark, and the corridor ends by hitting you.',
        startSec: 0,
        endSec: 5.6,
        world: '#000000',
        ink: '#FFFFFF',
        sketch: 'tunnel'
    },
    {
        id: 's01b-halo',
        title: 'Halo',
        blurb: 'The first breath. The corridor is crushed flat and its pulse survives it — one white ring per strobe swell, rippling out through the space where it stood.',
        startSec: 4.4,
        endSec: 9.4,
        world: '#000000',
        ink: '#FFFFFF',
        sketch: 'halo'
    },
    {
        id: 's02-scan',
        title: 'Scan',
        blurb: 'Code as measured material. Hairline bars quantised to three widths on four shells around you, switching on one 6 Hz machine tick while a plane reads the volume.',
        startSec: 8.2,
        endSec: 14.4,
        world: '#000000',
        ink: '#FFFFFF',
        sketch: 'scan'
    },
    {
        id: 's03-test-pattern',
        title: 'Test pattern',
        blurb: 'The measurement becomes architecture and you walk through it — black slabs on a grid running 32 m ahead and 30 m behind, sliding into moiré. The only walk in the piece.',
        startSec: 13.2,
        endSec: 19.4,
        world: '#FFFFFF',
        ink: '#000000',
        sketch: 'pattern'
    },
    {
        id: 's05-metaball-field',
        title: 'Metaball field',
        blurb: 'The material goes fluid and surrounds you: nine pairs of black blobs fusing and parting on every side, then closing in, welding into one wall, and opening a portal in it.',
        startSec: 18.2,
        endSec: 26.4,
        world: '#FFFFFF',
        ink: '#000000',
        sketch: 'metaball'
    },
    {
        id: 's06-reel-globe',
        title: 'Reel globe',
        blurb: 'The footage, arriving through that portal — 288 reels tiled edge to edge into a closed shell with you at its centre. It does not rotate: you turn, the feed does not.',
        startSec: 23.2,
        endSec: 45.4,
        world: '#04050A',
        ink: '#E9F1F5',
        sketch: 'globe'
    },
    {
        id: 's07-dispersion-sphere',
        title: 'Dispersion sphere',
        blurb: 'The epilogue. The globe recedes and settles on this sphere’s exact seat — you step out of one sphere and find another, in a colonnade strobing the piece’s own white.',
        startSec: 44.2,
        endSec: 53.0,
        world: '#0D1114',
        ink: '#FFFFFF',
        sketch: 'sphere'
    }
]

export const RUN_TIME_SEC = BEAT_CARDS.reduce((longest, beat) => Math.max(longest, beat.endSec), 0)

// Which beats are on screen at a given second, and how loud each one is.
//
// The piece cross-fades: windows overlap by ~1.2s and both sequences stay
// mounted through the seam, each on its own envelope. The preview does the same
// thing rather than cutting, because a cut would misrepresent the one editing
// decision the timeline below is trying to show.
export const beatsAtSec = (seconds, beats = BEAT_CARDS) => {
    const live = beats
        .filter((beat) => seconds >= beat.startSec && seconds < beat.endSec)
        .map((beat) => {
            const overlapIn = beats.some((other) => other !== beat && other.endSec > beat.startSec && other.startSec < beat.startSec)
            const overlapOut = beats.some((other) => other !== beat && other.startSec < beat.endSec && other.endSec > beat.endSec)
            const fadeIn = overlapIn ? Math.min(1, (seconds - beat.startSec) / 1.2) : 1
            const fadeOut = overlapOut ? Math.min(1, (beat.endSec - seconds) / 1.2) : 1
            return { beat, weight: Math.max(0, Math.min(fadeIn, fadeOut)) }
        })
        .filter((entry) => entry.weight > 0)

    if (!live.length) {
        // Past the end, or in a hole. Holding the last beat beats showing an
        // empty frame — the landing preview is a poster, not a validator.
        const last = beats[beats.length - 1]
        return last ? [{ beat: last, weight: 1 }] : []
    }
    return live
}

// The headline beat at a given second: the loudest one, and on a tie the later
// one, so a seam reads as arriving somewhere rather than clinging on.
export const leadBeatAtSec = (seconds, beats = BEAT_CARDS) => {
    const live = beatsAtSec(seconds, beats)
    return live.reduce((best, entry) => (entry.weight >= best.weight ? entry : best), live[0]).beat
}

// Rounded, not truncated: 5.6 is stored as 5.5999… in binary float, and
// flooring the tenth printed a clip's end as 05.5s against an edit list that
// says 5.6 — a page whose whole claim is that it shows the real numbers.
export const formatSec = (seconds) => {
    const tenths = Math.round(Math.max(0, seconds) * 10)
    return `${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}s`
}
