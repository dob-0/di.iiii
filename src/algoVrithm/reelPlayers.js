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
// knowingly. A browser decoding thirty-one full-resolution phone captures at
// once is doing thirty-one times the work. On a desktop that is usually fine.
// On a standalone headset it is the thing most likely to drop the frame rate,
// and dropped frames in a headset are nausea rather than an aesthetic problem.
//
// TWO CEILINGS, because "every clip in the folder" is a direction a desktop can
// keep and a standalone headset cannot.
//
// A decoder that cannot be allocated does not fail loudly — the element simply
// never produces a frame, so its VideoTexture stays at its initial black and the
// cells showing that clip are black rectangles scattered over the shell. On a
// desktop a few go; in a headset, where the budget is single digits, most of
// them do, and turning your head sweeps past patches of black. That is the
// symptom this cap exists to prevent, and it reads as a hole in the globe rather
// than as a decoding limit, which is what makes it worth a comment this long.
//
// The direction is kept wherever the device can honour it: the full folder on a
// desktop, and in a headset the largest number that reliably decodes. Lower it
// and the globe simply repeats clips more often — which is what a feed is —
// and nothing else in the piece changes.
//
// NINE is not a new guess: it is the number the pool was originally built at,
// chosen for these being full-resolution phone captures. Compressing the source
// to ~540p (see the assets README) is what would let the headset have the whole
// folder — the reels are drawn about 1.4m wide on a 7m shell, so full resolution
// is being decoded and thrown away.
export const DESKTOP_MAX_PLAYERS = 32
export const HEADSET_MAX_PLAYERS = 9

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

        const player = { asset, video, texture, aspect: 9 / 16 }

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
    }
    return sharedPlayers
}

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
