import * as THREE from 'three'
import { createRandom } from './random.js'
import { ASSET_LIBRARY } from './assetLibrary.js'

// The video player pool — the decoders every footage sequence shares.
//
// ---- WHY THERE IS A POOL AT ALL --------------------------------------------
//
// A browser will not decode a hundred videos. Each <video> is a real decoder,
// and on a standalone headset the practical budget is single digits before the
// frame rate collapses. The failure is not graceful either: dropped frames in a
// headset are nausea, not an aesthetic problem.
//
// So a sequence gets PLAYER_COUNT decoders and shares each one across many
// panels. The same reel is therefore on screen a dozen times at once.
//
// That repetition is not a compromise being tolerated — it is the truest thing
// in the footage sequences. A feed IS the same clip arriving again from twelve
// accounts. Hiding it would be both more expensive and less honest.
//
// ---- WHY IT LIVES OUTSIDE THE COMPONENTS -----------------------------------
//
// Built once for the life of the page, not per mount. The piece loops, so a
// footage sequence mounts and unmounts every time round, and creating nine
// <video> elements on each pass would re-buffer the whole set at the same moment
// every loop — a visible stall at exactly the point the scene arrives. The
// elements survive; the sequences pause and resume them.
//
// Same contract as hazeTexture() and glyphAtlas(): one lazily-built shared
// resource, reused by everything that needs it.

// EVERY clip in the folder gets its own decoder, on direction: "use all reels in
// folder" — as far as the device allows.
//
// This is the expensive decision in the whole piece and it should be made
// knowingly. A browser decoding thirty-one videos at once is doing thirty-one
// times the work. On a desktop that is usually fine. On a standalone headset it
// is the thing most likely to drop the frame rate, and dropped frames in a
// headset are nausea rather than an aesthetic problem.
//
// A decoder that cannot be allocated does not fail loudly: the element simply
// never produces a frame, so its VideoTexture stays at its initial black and
// every cell showing that clip is a black rectangle scattered over the shell.
// Turning your head sweeps past patches of black and it reads as a hole in the
// globe rather than as a decoding limit — which is why the pool has both a
// ceiling below and a repair above.
//
// ---- THE CEILING IS DERIVED, NOT PICKED ------------------------------------
//
// It used to be one number for headsets (nine), chosen when these were
// full-resolution phone captures. The sources are not that any more: since
// 2026-08-08 they are transcoded to 360x640 (scripts/compress-reels.mjs
// --replace — keep running it over anything new dropped in the folder), which
// took the pool from 25.9 to 7.1 megapixels per frame. A hardcoded nine would
// now be throwing away two thirds of the folder to pay for a cost that is no
// longer there, and would go stale again the next time the source resolution
// moves.
//
// So the headset ceiling is a DECODE BUDGET divided by what a frame actually
// costs. The budget is the load that was known to work: nine full-resolution
// (1080x1920) captures, which is what the pool ran at before the compression.
// At 360x640 that arithmetic returns more than the folder holds, so a headset
// gets every clip — which is the direction, finally affordable.
//
// A desktop keeps a flat cap: there is no budget question there, only the
// folder's own size and a sane upper bound.
export const DESKTOP_MAX_PLAYERS = 32

// Nine 1080x1920 frames. Named as the measurement it is, not as a magic number.
export const HEADSET_PIXEL_BUDGET = 9 * 1080 * 1920

// What to use when the probe cannot answer (no metadata, a source that will not
// load, a browser that refuses). The old fixed ceiling, kept as the floor: being
// wrong here should cost repetition, never black.
export const HEADSET_FALLBACK_PLAYERS = 9

/**
 * How many decoders this device should be asked for, given what one frame of
 * the source actually costs.
 *
 * `pixelsPerFrame` comes from a real <video>'s metadata (see probeReelPixels),
 * so re-encoding the folder changes this on its own with nothing to edit here.
 */
export const headsetCeiling = (pixelsPerFrame) => {
    if (!Number.isFinite(pixelsPerFrame) || pixelsPerFrame <= 0) return HEADSET_FALLBACK_PLAYERS
    const affordable = Math.floor(HEADSET_PIXEL_BUDGET / pixelsPerFrame)
    return Math.max(1, Math.min(DESKTOP_MAX_PLAYERS, affordable))
}

/**
 * Ask ONE reel how big it is, without decoding it.
 *
 * `preload='metadata'` is a few kilobytes of container header, and the element
 * is thrown away immediately — it never becomes a decoder and never counts
 * against the budget it is being used to compute. Resolves null if the source
 * will not answer, and the caller falls back rather than guessing.
 */
export const probeReelPixels = (timeoutMs = 4000) => new Promise((resolve) => {
    const asset = ASSET_LIBRARY.find((entry) => entry.kind === 'video')
    if (!asset || typeof document === 'undefined') return resolve(null)

    const probe = document.createElement('video')
    let settled = false
    const finish = (value) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        probe.removeAttribute('src')
        probe.load?.()
        resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)

    probe.preload = 'metadata'
    probe.muted = true
    probe.playsInline = true
    probe.addEventListener('loadedmetadata', () => {
        const pixels = probe.videoWidth * probe.videoHeight
        finish(pixels > 0 ? pixels : null)
    }, { once: true })
    probe.addEventListener('error', () => finish(null), { once: true })
    probe.src = asset.src
})

export const playerCount = (maxPlayers = DESKTOP_MAX_PLAYERS) => Math.min(
    maxPlayers,
    ASSET_LIBRARY.filter((asset) => asset.kind === 'video').length
)

const PLAYER_SEED = 20260730

let sharedPlayers = null

const createPlayers = (maxPlayers) => {
    const videos = ASSET_LIBRARY.filter((asset) => asset.kind === 'video')
    if (videos.length === 0) return []

    const random = createRandom(PLAYER_SEED)

    // Every clip, in library order, up to whatever this device can decode. No
    // stride and no selection — under the desktop ceiling the pool IS the
    // folder, so nothing has to be chosen and nothing is left out.
    return Array.from({ length: playerCount(maxPlayers) }, (_, index) => {
        const asset = videos[index % videos.length]

        const video = document.createElement('video')
        video.src = asset.src
        video.loop = true
        // `muted` is not a style choice: an unmuted video cannot autoplay without
        // a user gesture, and this piece has no interface to gesture with. The
        // reels are silent by construction, which suits a work about scrolling in
        // public anyway.
        video.muted = true
        video.defaultMuted = true
        video.playsInline = true
        video.preload = 'auto'
        video.setAttribute('playsinline', '')

        const texture = new THREE.VideoTexture(video)
        texture.colorSpace = THREE.SRGBColorSpace
        // Linear filtering only. A mip chain on a texture that changes every
        // frame is regenerated every frame, which is the single most expensive
        // mistake available here.
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = false

        const player = { asset, video, texture, aspect: 9 / 16, everDecoded: false }

        // First frame ever decoded — the only thing that separates a working
        // player from one whose decoder the device refused. See hasPicture.
        video.addEventListener('loadeddata', () => { player.everDecoded = true }, { once: true })

        video.addEventListener('loadedmetadata', () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                player.aspect = video.videoWidth / video.videoHeight
            }
            // Start each clip somewhere else in its own timeline. Nine reels all
            // beginning at frame zero together is a cut, and none of these scenes
            // is supposed to have one.
            try {
                video.currentTime = random() * Math.max(0, video.duration || 0)
            } catch { /* seeking before it is ready is not fatal */ }
        }, { once: true })

        return player
    })
}

/**
 * The pool, built on first use and shared for the life of the page.
 *
 * `maxPlayers` is honoured by the FIRST caller only, which is the warm-up in
 * AlgoVrithmExperience — by the time the footage beat mounts and calls this
 * with no argument, the pool exists and the ceiling has already been chosen.
 * That ordering is the point: the device question is answered once, early,
 * rather than being re-asked by whoever happens to be on screen.
 */
export const reelPlayers = (maxPlayers = DESKTOP_MAX_PLAYERS) => {
    if (!sharedPlayers) {
        sharedPlayers = createPlayers(maxPlayers)
        // THE POOL CAN BE BUILT AFTER THE GESTURE THAT UNLOCKED AUDIO, and then
        // nothing would ever unmute it. unlock() below unmutes the players that
        // EXIST when it fires, and the warm-up is deliberately deferred to idle
        // (up to 2.5s after mount — see AlgoVrithmExperience). A headset loses
        // that race almost every time: the page finishes loading, the visitor
        // taps Enter VR straight away, and that tap arrives while sharedPlayers
        // is still undefined. The synth score is unaffected — it only needs the
        // context resumed — so the symptom is a scored piece with silent reels,
        // which is exactly what it looked like.
        //
        // Unmuting here is safe precisely because audioUnlocked means a real
        // gesture has already happened, so autoplay-with-sound is permitted.
        if (audioUnlocked) applyUnlockedAudio(sharedPlayers)
        // The pool is invisible from outside: nothing on screen says how many
        // decoders a device actually gave you, and the failure this file guards
        // against is a silent one. Same DEV-only hook idea as
        // window.__diiWalkerRef — and the seam the repair is exercised through
        // in a real browser, by marking a player frameless and watching its
        // cells fill with a live clip instead of black.
        if (import.meta.env?.DEV && typeof window !== 'undefined') {
            window.__diiReelPool = sharedPlayers
        }
    }
    return sharedPlayers
}

// ---- WHEN A DECODER DIES ANYWAY --------------------------------------------
//
// The ceiling above is a prediction, and a prediction about hardware nobody in
// this repo can run every variant of. A device can still refuse a decoder: it
// can be older than the budget assumes, it can already be decoding something
// else, or the browser can simply have a lower simultaneous-stream limit than
// the pixel arithmetic implies.
//
// What must not happen is the failure staying INVISIBLE. An element that never
// produces a frame leaves its VideoTexture black, and black cells read as holes
// torn in the globe. A repeat does not: repetition is what a feed looks like,
// and the mix is built on it already.
//
// So the globe asks, while it is on screen, which players actually have a
// frame, and shows a live one in place of each dead one. The cost of guessing
// too high is therefore the same cost as setting the ceiling too low — the same
// clip twice — instead of a hole.

// "Has this player EVER produced a frame", which is not the same question as
// "is it ready right now" — and the difference was measured rather than
// reasoned about. Polling readyState alone reported three of thirty-one dead
// mid-beat on a desktop that had every clip decoding fine: each player seeks to
// a random point in its own timeline (see createPlayers), and readyState drops
// back to HAVE_METADATA for the length of a seek. A VideoTexture keeps showing
// its last decoded frame throughout, so those cells were never black — and
// swapping them for a substitute would have introduced a flicker of the wrong
// clip to fix a problem that did not exist.
//
// A decoder that was refused at allocation, by contrast, never reaches
// HAVE_CURRENT_DATA even once. So the flag latches on first sight of a frame
// and never clears.
export const hasPicture = (player) => {
    if (!player) return false
    if (player.everDecoded) return true
    const video = player.video
    const live = Boolean(video)
        && video.readyState >= 2
        && video.videoWidth > 0
        && video.videoHeight > 0
    // Latch here as well as on the event: a player can reach its first frame
    // before anything is listening, and the poll is what notices.
    if (live) player.everDecoded = true
    return live
}

/**
 * One texture per player, with every dead player replaced by a live one.
 *
 * Live players are dealt round-robin so the substitutes are spread across the
 * folder rather than every dead cell in the globe falling back to the same
 * clip. Returns each player's own texture when they are all alive (the normal
 * case, and no work downstream), and also when they are all dead — there is
 * nothing better to show, and a pool that has not loaded YET must not be
 * rewritten into a single frozen clip.
 */
export const displayTextures = (players = []) => {
    const own = players.map((player) => player.texture)
    const live = []
    const dead = []
    players.forEach((player, index) => {
        (hasPicture(player) ? live : dead).push(index)
    })
    if (dead.length === 0 || live.length === 0) return own
    dead.forEach((index, nth) => { own[index] = players[live[nth % live.length]].texture })
    return own
}

/** A cheap value that changes only when the set of dead players changes. */
export const healthSignature = (players = []) => players
    .map((player) => (hasPicture(player) ? '1' : '0'))
    .join('')

// ---- SOUND -----------------------------------------------------------------
//
// On direction: every reel's audio, all on at once, positioned in space.
//
// THE ONE THING THAT CANNOT BE DONE IS AUTOPLAY WITH SOUND. Every browser
// blocks audible playback until the page has had a real user gesture — a click,
// a key, a touch. It is not a setting and there is no way around it from inside
// the page. That is why the reels were silent to begin with: this piece has no
// interface, so there was no gesture to unlock anything with.
//
// What makes it possible now is that there are, in practice, always gestures
// available before the footage beat arrives twenty-eight seconds in: the visitor
// clicks Full screen, or presses Enter VR (entering an XR session is itself a
// gesture), or simply drags to look around. So the unlock is armed on the first
// of ANY of those and the sound comes up from then on. If nobody ever touches
// anything, the piece plays silent — which is the correct failure, and the same
// one it had before.
//
// For an unattended exhibition kiosk the honest fix is outside the page: launch
// Chrome with --autoplay-policy=no-user-gesture-required and the unlock below
// simply never has to wait for anything.

let audioUnlocked = false
let unlockArmed = false
const unlockWaiters = new Set()

/**
 * Turn the sound on for a set of players. Called from the gesture handler for
 * whatever exists then, and again from reelPlayers() for a pool built later.
 *
 * The re-play is guarded on `paused` on purpose: at unlock time NONE of these
 * are playing, and calling play() on all of them would start thirty-one
 * decoders twenty seconds before the beat that needs them — the exact budget
 * this pool exists to protect. It only matters for a player already on screen
 * when the gesture lands, where some mobile builds want the element poked
 * before they will emit audio it started muted without.
 */
const applyUnlockedAudio = (players) => {
    players?.forEach((player) => {
        player.video.muted = false
        player.video.defaultMuted = false
        // play() returns undefined rather than a promise in some environments
        // (jsdom among them), so the result is not assumed to be thenable.
        if (!player.video.paused) player.video.play?.()?.catch?.(() => {})
    })
}

const unlock = () => {
    if (audioUnlocked) return
    audioUnlocked = true
    // Unmuting is what actually turns the sound on. It has to happen INSIDE the
    // gesture handler — deferring it by even a task can lose the user-activation
    // window in some browsers.
    applyUnlockedAudio(sharedPlayers)
    unlockWaiters.forEach((waiter) => waiter())
    unlockWaiters.clear()
}

/**
 * Unlock imperatively, for a gesture the window listeners cannot see.
 *
 * ENTERING AN IMMERSIVE SESSION IS A USER ACTIVATION, but it does not have to
 * arrive as a DOM event on this window — a session can be started from an XR
 * button in an overlay, resumed by the headset, or entered without the tap ever
 * reaching `window`. The listeners in armAudioUnlock() would miss all of those
 * and the piece would play silent inside the headset while being perfectly
 * unlockable on the flat page, which is the hardest version of this bug to
 * reproduce at a desk.
 *
 * So SpatialScore calls this on `sessionstart`. Idempotent — unlock() returns
 * immediately once the page has been unlocked, so the ordinary gesture path and
 * this one cannot double up.
 */
export const unlockAudio = () => { unlock() }

/**
 * Arm the gesture unlock. Idempotent; safe to call from every sequence's mount.
 *
 * `once` on each listener, and they are all removed as soon as any one fires —
 * this must not survive as three live listeners on window for the rest of the
 * session.
 */
export const armAudioUnlock = (onUnlocked) => {
    if (audioUnlocked) {
        onUnlocked?.()
        return () => {}
    }
    if (onUnlocked) unlockWaiters.add(onUnlocked)

    if (!unlockArmed) {
        unlockArmed = true
        const events = ['pointerdown', 'keydown', 'touchstart']
        const handler = () => {
            unlock()
            events.forEach((name) => window.removeEventListener(name, handler))
        }
        events.forEach((name) => window.addEventListener(name, handler, { once: true }))
    }

    return () => { if (onUnlocked) unlockWaiters.delete(onUnlocked) }
}

export const isAudioUnlocked = () => audioUnlocked

/**
 * The WebAudio source for one player, created once and cached.
 *
 * A MediaElementAudioSourceNode can only be created ONCE per media element —
 * asking twice throws, and the element is shared between sequences and survives
 * every mount, so this has to be memoised on the player rather than built by
 * whoever happens to be on screen.
 *
 * Returns null if the audio context is not usable yet, so a caller can simply
 * try again next mount.
 */
export const reelAudioSource = (player, listener) => {
    if (!player || !listener) return null
    if (player.audioSource) return player.audioSource

    try {
        const context = listener.context
        const source = context.createMediaElementSource(player.video)
        player.audioSource = source
        return source
    } catch {
        // Already connected elsewhere, or the context is in a state that will
        // not take a new node. Silent rather than fatal: the scene still plays,
        // it just plays without sound.
        return null
    }
}

// ---- clip rotation ---------------------------------------------------------
//
// Only does anything when the folder is larger than MAX_PLAYERS. While every
// clip has its own decoder there is nothing to rotate — the pool already holds
// the whole library — so this is a no-op that starts working again by itself if
// somebody drops a thirty-third reel in the folder.
//
// When it does run it shifts the pool on as the footage beat ENDS, deliberately:
// swapping a video's src re-buffers it, and doing that as the scene arrives is
// the stall the shared pool exists to avoid. Doing it as the scene leaves gives
// the new clips the rest of the loop to load.
let rotation = 0

export const advanceReels = () => {
    const videos = ASSET_LIBRARY.filter((asset) => asset.kind === 'video')
    if (!sharedPlayers || videos.length <= sharedPlayers.length) return

    rotation = (rotation + sharedPlayers.length) % videos.length

    sharedPlayers.forEach((player, index) => {
        const asset = videos[(rotation + index) % videos.length]
        if (asset.id === player.asset.id) return
        player.asset = asset
        player.video.src = asset.src
        // The texture keeps pointing at the same element, so nothing downstream
        // has to be rebuilt — only the source behind it changed.
        player.video.load()
    })
}

/**
 * Start every player, and return the matching stop.
 *
 * Sequences call this from an effect so the decoders only run while footage is
 * on screen — decoding nine videos through the thirty-odd seconds a footage
 * scene is NOT on screen is a real cost on a standalone headset, and pausing is
 * the whole reason the pool is separate from the components.
 */
export const playReels = (pool = reelPlayers()) => {
    pool.forEach((player) => {
        const attempt = player.video.play()
        // Autoplay can still be refused; a muted video normally is not, but a
        // refusal must not take the sequence down with it.
        if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {})
    })
    return () => pool.forEach((player) => player.video.pause())
}
