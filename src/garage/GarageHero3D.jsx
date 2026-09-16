import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { layoutText } from './markerFont.js'
import { HEADLINE_PALETTE } from './content.js'

// The 3D renderer for the same stroke font MarkerText draws flat. Each stroke
// becomes a swept tube, which is the closest thing geometry has to a marker
// nib: round cross-section, constant thickness, visible volume at the turns.
//
// Deliberately NOT TextGeometry. An extruded typeface reads as a corporate
// logo animation; a wobbling tube reads as someone wrote on the screen.

const RADIAL_SEGMENTS = 7

// Geometry per LETTER, not per line, so each one can take its own colour.
const buildLineGeometry = (text, radius, jitter, tilt) => {
    const { glyphs, width } = layoutText(text, { jitter, tilt })
    let sliceIndex = 0

    const letters = glyphs.map((glyph) => {
        const geometries = []
        for (const stroke of glyph.strokes) {
            // Every stroke sits on its own z-slice, so overlapping letters
            // interpenetrate the way layered marker does instead of z-fighting.
            const z = (sliceIndex % 5) * 0.012 - 0.024
            sliceIndex += 1
            const points = stroke.map(([x, y]) => new THREE.Vector3(x - width / 2, y - 0.5, z))
            if (points.length < 2) continue

            const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35)
            const tubular = Math.max(8, Math.min(160, points.length * 3))
            geometries.push(new THREE.TubeGeometry(curve, tubular, radius, RADIAL_SEGMENTS, false))
        }
        return geometries
    })

    return { letters, width }
}

function MarkerLine3D({ text, radius = 0.055, jitter = 0.04, tilt = 0.025, palette }) {
    const { letters, width } = useMemo(
        () => buildLineGeometry(text, radius, jitter, tilt),
        [text, radius, jitter, tilt]
    )

    useEffect(
        () => () => letters.forEach((geometries) => geometries.forEach((g) => g.dispose())),
        [letters]
    )

    // One material per COLOUR, not per letter — ten letters over four colours
    // is four materials and four draw-call groups instead of ten.
    const materials = useMemo(
        () => palette.map((color) => new THREE.MeshStandardMaterial({
            color,
            roughness: 0.62,
            metalness: 0.02
        })),
        [palette]
    )
    useEffect(() => () => materials.forEach((material) => material.dispose()), [materials])

    return (
        <group userData={{ width }}>
            {letters.map((geometries, letterIndex) => {
                const material = materials[letterIndex % materials.length]
                return (
                    <group key={letterIndex}>
                        {geometries.map((geometry, index) => (
                            <mesh key={index} geometry={geometry} material={material} castShadow={false} />
                        ))}
                        {/* Round caps. TubeGeometry is an open sleeve, so without
                            these the ends of every stroke are hollow rings you
                            can see straight into. */}
                        {geometries.map((geometry, index) => {
                            const position = geometry.attributes.position
                            const first = new THREE.Vector3().fromBufferAttribute(position, 0)
                            const lastRing = position.count - RADIAL_SEGMENTS - 1
                            const last = new THREE.Vector3()
                                .fromBufferAttribute(position, Math.max(0, lastRing))
                            return (
                                <group key={`caps-${index}`}>
                                    <mesh position={first} material={material}>
                                        <sphereGeometry args={[radius, 10, 8]} />
                                    </mesh>
                                    <mesh position={last} material={material}>
                                        <sphereGeometry args={[radius, 10, 8]} />
                                    </mesh>
                                </group>
                            )
                        })}
                    </group>
                )
            })}
        </group>
    )
}

/**
 * Holds the headline: fits it to the viewport width, tips it toward the
 * pointer, and breathes. All three are lerped in one frame callback rather
 * than sprung per-mesh — 20-odd tubes moving as one object is the point.
 */
function Headline({ lines, calm }) {
    const group = useRef()
    const viewport = useThree((state) => state.viewport)

    const widest = useMemo(
        () => Math.max(...lines.map((line) => layoutText(line.text).width)),
        [lines]
    )

    // 82% of the viewport, but never so large on a phone that the letters
    // leave the frame when the group tips toward the pointer.
    const scale = Math.min((viewport.width * 0.82) / widest, viewport.height * 0.34)

    useFrame((state, delta) => {
        const node = group.current
        if (!node) return

        const t = state.clock.elapsedTime
        const pointerX = calm ? 0 : state.pointer.x
        const pointerY = calm ? 0 : state.pointer.y
        const float = calm ? 0 : 1

        const targetY = pointerX * 0.42 + Math.sin(t * 0.45) * 0.07 * float
        const targetX = -pointerY * 0.3 + Math.sin(t * 0.63 + 1.2) * 0.05 * float
        const targetZ = Math.sin(t * 0.31) * 0.035 * float

        // Frame-rate independent easing: the same visual lag at 60 and 144 fps.
        const ease = 1 - Math.pow(0.001, delta)
        node.rotation.y += (targetY - node.rotation.y) * ease
        node.rotation.x += (targetX - node.rotation.x) * ease
        node.rotation.z += (targetZ - node.rotation.z) * ease
    })

    // The palette runs across the whole headline, not per line: without the
    // offset, "SALE" restarts on the same colours "GARAGE" opened with and the
    // two lines rhyme in a way handwriting never does.
    const palettes = useMemo(() => {
        let offset = 0
        return lines.map((line) => {
            const turn = offset % HEADLINE_PALETTE.length
            offset += line.text.length
            return [...HEADLINE_PALETTE.slice(turn), ...HEADLINE_PALETTE.slice(0, turn)]
        })
    }, [lines])

    return (
        <group ref={group} scale={scale}>
            {lines.map((line, index) => (
                <group key={line.text} position={[line.x || 0, line.y, index * 0.02]} rotation={[0, 0, line.rotate || 0]}>
                    <MarkerLine3D text={line.text} radius={line.radius} palette={palettes[index]} />
                </group>
            ))}
        </group>
    )
}

const LINES = [
    { text: 'GARAGE', y: 0.62, x: -0.05, rotate: 0.028, radius: 0.058 },
    { text: 'SALE', y: -0.55, x: 0.34, rotate: -0.022, radius: 0.062 }
]

export default function GarageHero3D() {
    const calm = useMemo(
        () => typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        []
    )

    return (
        <Canvas
            className="garage-hero-canvas"
            camera={{ position: [0, 0, 6], fov: 34 }}
            dpr={[1, 1.75]}
            gl={{ antialias: true, alpha: true }}
            // Nothing animates unless the pointer moves or the clock ticks the
            // float, and on a static poster that is most of the time.
            frameloop={calm ? 'demand' : 'always'}
        >
            <ambientLight intensity={1.35} />
            <directionalLight position={[-3, 4, 5]} intensity={2.1} />
            <directionalLight position={[4, -2, 3]} intensity={0.7} color="#8f8fff" />
            <Headline lines={LINES} calm={calm} />
        </Canvas>
    )
}
