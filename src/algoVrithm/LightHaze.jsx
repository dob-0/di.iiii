import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ATMOSPHERE_COLORS, isCoolPole } from './palette.js'
import { createRandom } from './random.js'

// The atmosphere. Large, very soft, additive clouds of colour hanging at
// different depths — the thing that makes light read as a VOLUME rather than a
// coloured background.
//
// WHY NOT REAL BLOOM: screen-space bloom needs an EffectComposer, extra render
// targets and several blur passes every frame. This piece has to survive a
// standalone headset at 72-90Hz, and it is also stereo — every one of those
// passes is paid for twice. Adding @react-three/postprocessing would mean a new
// dependency, a vite three-vendor chunk entry, and the frame budget of the
// whole work spent on a glow.
//
// In-scene glow gets there for almost nothing, and for THIS look it is
// arguably more correct: screen-space bloom is a filter applied on top of a
// finished image, whereas these sprites genuinely sit in the scene at real
// depths. They occlude each other, they parallax when you turn your head, and
// the fog acts on them. That is what "light occupies space" actually means,
// and a post-process cannot do it.
//
// The soft-edged texture is the other half. Additive blending means overlaps
// SUM, so where two clouds cross, their colours add and neither has a boundary
// — the bleed is a property of the maths, not something drawn.

// Every one of these is an ADDITIVE layer, so they do not average — they sum.
// Ten clouds at a given opacity are roughly ten times the lift of one, and the
// first tuning of this (14 clouds at 0.05-0.12) summed to a flat grey wash
// that lifted the dark sequences ABOVE their own content: the Assembly
// rectangle rendered as a dark shape on a light field, exactly inverted. The
// numbers here are quiet to the point of looking wrong in isolation. That is
// correct — the effect is the accumulation, never the individual cloud.
const CLOUD_COUNT = 16

// Large relative to the tunnel (radius 3.2). A cloud smaller than the space
// reads as an object floating in the room; one larger than the space reads as
// the room being full of light.
const MIN_SIZE = 12
const MAX_SIZE = 26

// Per-cloud alpha. Raised now that the backdrops are neutral and these clouds
// carry all the colour — at veil strength against a near-black surround there
// was simply nothing to see. Still modest per cloud: the bleed comes from
// several overlapping, and where a blue one crosses a red one their sum is the
// violet the reference shows. THIS IS THE KNOB. Too washed out, halve
// MAX_ALPHA; too dim, raise it.
const MIN_ALPHA = 0.05
const MAX_ALPHA = 0.14

// Fixed so the composition is identical on every load — what gets approved is
// what an audience sees.
const HAZE_SEED = 20260726

/**
 * A radial falloff with a very long tail. The exact profile is the whole
 * effect: a linear gradient still has a visible edge where it reaches zero, and
 * a plain smoothstep is too tight. Squaring the smoothstep pushes most of the
 * falloff out into the tail, which is what frosted acrylic does to a point
 * source — bright core, enormous soft surround, no perceptible boundary.
 */
const createHazeTexture = () => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')
    const image = context.createImageData(size, size)
    const centre = (size - 1) / 2

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x - centre) / centre
            const dy = (y - centre) / centre
            const distance = Math.min(1, Math.sqrt(dx * dx + dy * dy))

            const t = 1 - distance
            const smooth = t * t * (3 - 2 * t)
            const alpha = smooth * smooth

            const index = (y * size + x) * 4
            image.data[index] = 255
            image.data[index + 1] = 255
            image.data[index + 2] = 255
            image.data[index + 3] = Math.round(alpha * 255)
        }
    }

    context.putImageData(image, 0, 0)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    // Clamped: the default wrap makes the tail meet its own opposite edge and
    // produces a faint square seam around each cloud.
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    return texture
}

let sharedTexture = null

/**
 * The falloff, shared by everything in the piece that draws a volume of light.
 *
 * Exported and cached because the authorable `glow` lights (SceneLights.jsx)
 * need exactly this profile — a second, slightly different soft dot would be
 * visible as two kinds of glow in one room, and each copy is its own 128×128
 * canvas rasterised pixel by pixel on the main thread. One texture, uploaded
 * to the GPU once, for the whole work.
 */
export const hazeTexture = () => {
    if (!sharedTexture) sharedTexture = createHazeTexture()
    return sharedTexture
}

/**
 * @param intensity  0..1 master fade. The piece drives this so the atmosphere
 *                   can breathe with the edit instead of sitting at one level.
 */
// How much haze a room of a given brightness gets — STRONGEST in the dark.
//
// This is inverted from what it first was, and the reference is why. These
// clouds are not a veil over the piece; since the backdrops went neutral they
// are the piece's only source of colour, the coloured lamps behind the acrylic.
// In the reference the lamps read hardest against the near-black surround, and
// wash out where the panel is already blown white — so the dark sequences want
// full strength and the bright tunnel wants less, or additive light on an
// already-pale background just clips to white.
//
// Reading the room rather than taking a prop means this tracks Backdrop's
// cross-fades for free, including mid-handover.
export const hazeForRoom = (luminance) => 0.45 + 0.55 * (1 - Math.min(1, Math.max(0, luminance)))

export default function LightHaze({ intensity = 1 }) {
    const groupRef = useRef(null)
    const scene = useThree((state) => state.scene)

    const texture = useMemo(() => hazeTexture(), [])

    const clouds = useMemo(() => {
        const random = createRandom(HAZE_SEED)
        return Array.from({ length: CLOUD_COUNT }, (_, index) => {
            const color = ATMOSPHERE_COLORS[index % ATMOSPHERE_COLORS.length]

            // THE POLES ARE KEPT APART. Additive blue over additive red is
            // magenta — that is the physics, not a choice, and it is where the
            // violet in the reference image comes from. Since this palette has
            // no purple in it, the only way to keep both a blue and a red lamp
            // is to stop them overlapping: cold clouds live in one hemisphere,
            // hot ones in the other, and they meet across darkness. Scatter
            // them freely instead and the room fills with the one hue that was
            // explicitly ruled out.
            const half = isCoolPole(color) ? 0 : Math.PI
            const angle = half + random() * Math.PI

            // Held well away from the viewer. A cloud closer than its own size
            // effectively wraps the camera, and an additive layer covering the
            // whole frame is not atmosphere — it is a tint applied to the lens.
            const radius = 11 + random() * 15
            return {
                key: `haze-${index}`,
                color,
                position: [
                    Math.sin(angle) * radius,
                    0.4 + random() * 3.4,
                    -Math.cos(angle) * radius
                ],
                size: MIN_SIZE + random() * (MAX_SIZE - MIN_SIZE),
                // Each cloud breathes on its own period so the field never
                // pulses as one, which would read as a flashing light rather
                // than as air.
                phase: random() * Math.PI * 2,
                rate: 0.06 + random() * 0.13,
                drift: 0.3 + random() * 0.7,
                baseOpacity: MIN_ALPHA + random() * (MAX_ALPHA - MIN_ALPHA)
            }
        })
    }, [])

    useFrame(({ clock }) => {
        const group = groupRef.current
        if (!group) return
        const time = clock.getElapsedTime()

        // scene.background is the blended backdrop Backdrop.jsx maintains, in
        // the linear working space — so this is already the room's real light
        // level rather than the sRGB number the palette was authored in.
        const room = scene.background
        const luminance = room
            ? 0.2126 * room.r + 0.7152 * room.g + 0.0722 * room.b
            : 1
        const roomFactor = hazeForRoom(luminance)

        group.children.forEach((sprite, index) => {
            const cloud = clouds[index]
            if (!cloud) return

            const breathe = 0.65 + Math.sin(time * cloud.rate * Math.PI * 2 + cloud.phase) * 0.35
            sprite.material.opacity = cloud.baseOpacity * breathe * intensity * roomFactor

            // Slow vertical drift only. Lateral movement is legible as motion
            // and would draw the eye; rising and settling is not, and reads as
            // the air itself moving.
            sprite.position.y = cloud.position[1]
                + Math.sin(time * cloud.rate * 0.7 + cloud.phase) * cloud.drift
        })
    })

    return (
        <group ref={groupRef}>
            {clouds.map((cloud) => (
                <sprite key={cloud.key} position={cloud.position} scale={[cloud.size, cloud.size, 1]}>
                    <spriteMaterial
                        map={texture}
                        color={cloud.color}
                        transparent
                        opacity={0}
                        // Additive so overlaps sum into brightness and no cloud
                        // ever draws an edge over another.
                        blending={THREE.AdditiveBlending}
                        // Must not write depth: these are volumes of light, and
                        // a depth-writing sprite punches a hole in whatever is
                        // behind it, which on a transparent cloud looks like a
                        // rectangular bite out of the scene.
                        depthWrite={false}
                        // Unlit and untone-mapped — a light source, not a
                        // surface being lit.
                        toneMapped={false}
                        fog={false}
                    />
                </sprite>
            ))}
        </group>
    )
}
