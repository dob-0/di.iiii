import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

/*
 * The process documentation as a repulsion field instead of a masonry grid.
 *
 * Same interaction grammar as the rest of the landing: the photos drift on the
 * chaotic sine curves the ambient dots use, the cursor shoves them aside the way
 * it shoves .wcc-circle, and the grayscale -> colour flip is still the payoff
 * gesture the CSS gallery had. Clicking keeps the original meaning (the whole set
 * wakes up in colour) and adds one: the photo you clicked comes to you.
 *
 * ACCESSIBILITY. A canvas is a single opaque node — without help it is a dead
 * zone for anyone not holding a mouse. So the real controls are a hidden button
 * per photo and the canvas is the presentation of them: focusing a button lights
 * its plane, activating it enlarges, Escape closes. Screen readers get a labelled
 * list of thirty photos; keyboard users get a tab order; the 3D just follows.
 *
 * Mobile and prefers-reduced-motion never reach this file — AboutProject renders
 * the CSS masonry instead — so there is no motion path to opt out of here.
 */

/* Matches the CSS the masonry uses: grayscale(1) contrast(1.16) brightness(0.72). */
const GRAY_CONTRAST = 1.16
const GRAY_BRIGHTNESS = 0.72

/* Cursor shove. The landing's circles use a threshold of 0.85x the element size
   and a force of 90px; these are the same numbers re-expressed in world units,
   where a plane is ~2.4 wide instead of ~200px.

   The force is deliberately under a plane's half-width. The circles on the hero
   have nothing to click, so they can flee hard; these are targets, and a shove
   bigger than half a plane clears the cursor's own position — you would be
   chasing photos around rather than opening them. */
const REPEL_THRESHOLD = 2.6
const REPEL_FORCE = 1.15

const DRIFT_AMPLITUDE = 0.34
const SELECTED_Z = 5.4
const CAMERA_Z = 12

/* How much of the canvas an enlarged photo fills. */
const SELECTED_FILL = 0.9

/* Every photo gets the same AREA, not the same width and not a contain box.
   Fixed width made portraits 2.2x taller than landscapes; a contain box swung it
   the other way and gave them under half the area. Equal area is what makes a
   contact sheet of mixed orientations read as evenly weighted. */
const PLANE_AREA = 4

/* Scatter grid. SEAT_GRID_ASPECT is a nominal canvas aspect — it only decides how
   many columns the virtual grid gets, so an approximation is fine even though the
   real aspect moves with the viewport. Jitter is a fraction of a cell: at 1.0 a
   photo could sit exactly on a cell boundary against its neighbour. The spans stop
   short of the canvas edge by about half a plane. */
const SEAT_GRID_ASPECT = 2.4
const SEAT_JITTER = 0.78
const SEAT_SPAN_X = 0.89
const SEAT_SPAN_Y = 0.72

/* Deterministic scatter. Math.random() here would re-roll the whole field on
   every React re-render (language toggle, colour reveal) and the photos would
   teleport. */
const mulberry32 = (seed) => {
    let a = seed
    return () => {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const PHOTO_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const PHOTO_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uGray;
uniform float uOpacity;
varying vec2 vUv;

void main() {
    vec4 texel = texture2D(uMap, vUv);
    float luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 gray = vec3(luma);
    gray = (gray - 0.5) * ${GRAY_CONTRAST.toFixed(2)} + 0.5;
    gray *= ${GRAY_BRIGHTNESS.toFixed(2)};
    vec3 color = mix(texel.rgb, gray, uGray);
    gl_FragColor = vec4(color, texel.a * uOpacity);
    #include <colorspace_fragment>
}
`

const damp = (current, target, lambda, delta) => (
    THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta))
)

function Photo({ url, seat, rotated, revealed, selected, focused, dimmed, onSelect, onHoverChange }) {
    const meshRef = useRef(null)
    const materialRef = useRef(null)
    const [hovered, setHovered] = useState(false)

    const texture = useTexture(url)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4

    const uniforms = useMemo(() => ({
        uMap: { value: texture },
        uGray: { value: 1 },
        uOpacity: { value: 1 }
    }), [texture])

    /* The plane keeps the photo's aspect at a fixed area. The four portraits the
       masonry rotates with CSS get the same -90deg here, so what the viewer sees is
       the swapped aspect — size against that, then swap back for the geometry,
       which is authored in local space before the rotation applies. */
    const [planeW, planeH, screenH] = useMemo(() => {
        const image = texture.image
        const imageAspect = image && image.height ? image.width / image.height : 1.5
        const aspect = rotated ? 1 / imageAspect : imageAspect
        const width = Math.sqrt(PLANE_AREA * aspect)
        const height = Math.sqrt(PLANE_AREA / aspect)
        return rotated ? [height, width, height] : [width, height, height]
    }, [texture, rotated])

    const { pointer, viewport } = useThree()

    /* Focus reads as hover so a keyboard user sees exactly what a mouse user sees,
       plus the ring below, which is the actual focus indicator. */
    const lit = hovered || focused

    useFrame((state, delta) => {
        const mesh = meshRef.current
        const material = materialRef.current
        if (!mesh || !material) return

        const dt = Math.min(delta, 0.1)
        const time = state.clock.elapsedTime

        if (selected) {
            mesh.position.x = damp(mesh.position.x, 0, 5, dt)
            mesh.position.y = damp(mesh.position.y, 0, 5, dt)
            mesh.position.z = damp(mesh.position.z, SELECTED_Z, 5, dt)
            /* Fit to the canvas rather than a magic multiplier: the plane sits
               closer to the camera when selected, so the frustum it has to fit
               inside is narrower than viewport.* (which is measured at z = 0). */
            const visibleH = viewport.height * ((CAMERA_Z - SELECTED_Z) / CAMERA_Z)
            const target = (visibleH * SELECTED_FILL) / screenH
            mesh.scale.x = damp(mesh.scale.x, target, 5, dt)
            mesh.scale.y = damp(mesh.scale.y, target, 5, dt)
            material.uniforms.uGray.value = damp(material.uniforms.uGray.value, 0, 6, dt)
            material.uniforms.uOpacity.value = damp(material.uniforms.uOpacity.value, 1, 6, dt)
            return
        }

        /* Idle drift, then the cursor shove on top of it. */
        const driftX = Math.sin(time * seat.speedX + seat.phase) * DRIFT_AMPLITUDE
        const driftY = Math.cos(time * seat.speedY + seat.phase) * DRIFT_AMPLITUDE
        let targetX = seat.x * viewport.width * 0.5 + driftX
        let targetY = seat.y * viewport.height * 0.5 + driftY

        /* A lit plane is exempt from the shove. Otherwise the field actively
           dodges the thing you are aiming at: the push is larger than a plane's
           half-width, so the photo under the cursor evacuates and the click lands
           in the hole it just left. Touch one and it holds still to be clicked;
           its neighbours keep clearing out around it. */
        if (!lit) {
            const pointerX = pointer.x * viewport.width * 0.5
            const pointerY = pointer.y * viewport.height * 0.5
            const dx = pointerX - targetX
            const dy = pointerY - targetY
            const dist = Math.hypot(dx, dy)
            if (dist < REPEL_THRESHOLD && dist > 0.001) {
                const force = (1 - dist / REPEL_THRESHOLD) * REPEL_FORCE
                targetX -= (dx / dist) * force
                targetY -= (dy / dist) * force
            }
        }

        mesh.position.x = damp(mesh.position.x, targetX, 4, dt)
        mesh.position.y = damp(mesh.position.y, targetY, 4, dt)
        /* A lit plane comes forward of its neighbours so nothing overlaps it. */
        const restZ = dimmed ? seat.z - 3.4 : seat.z
        mesh.position.z = damp(mesh.position.z, lit ? restZ + 1.6 : restZ, 4, dt)

        const scale = lit ? 1.28 : 1
        mesh.scale.x = damp(mesh.scale.x, scale, 6, dt)
        mesh.scale.y = damp(mesh.scale.y, scale, 6, dt)

        const gray = lit || revealed ? 0 : 1
        material.uniforms.uGray.value = damp(material.uniforms.uGray.value, gray, 6, dt)
        material.uniforms.uOpacity.value = damp(material.uniforms.uOpacity.value, dimmed ? 0.22 : 1, 6, dt)
    })

    const setHover = (next) => {
        setHovered(next)
        onHoverChange(next)
    }

    return (
        <mesh
            ref={meshRef}
            position={[seat.x * 8, seat.y * 4, seat.z]}
            /* +PI/2, not the masonry's -90deg. CSS Y points down so rotate(-90deg)
               turns counter-clockwise on screen; three.js Y points up, so the same
               visual turn is +PI/2. Using -PI/2 lands these four photos upside down. */
            rotation={[0, 0, rotated ? Math.PI / 2 : 0]}
            onPointerOver={(event) => {
                event.stopPropagation()
                setHover(true)
            }}
            onPointerOut={() => setHover(false)}
            onClick={(event) => {
                event.stopPropagation()
                onSelect()
            }}
        >
            <planeGeometry args={[planeW, planeH]} />
            <shaderMaterial
                ref={materialRef}
                uniforms={uniforms}
                vertexShader={PHOTO_VERTEX}
                fragmentShader={PHOTO_FRAGMENT}
                transparent
                depthWrite={false}
            />
            {/* Focus indicator. A child of the plane so it inherits the drift, the
                scale and the portrait rotation for free, and sits far enough behind
                to survive the depth sort. Suppressed while selected: inheriting the
                parent scale turns a tidy 12% border into a thick red slab once the
                photo is filling the canvas, and a photo at full size needs no ring
                to say where focus is. */}
            {focused && !selected && (
                <mesh position={[0, 0, -0.05]}>
                    <planeGeometry args={[planeW * 1.12, planeH * 1.12]} />
                    <meshBasicMaterial color="#d90000" depthWrite={false} />
                </mesh>
            )}
        </mesh>
    )
}

function Field({ images, seats, revealed, selected, focused, onSelect }) {
    const { gl } = useThree()
    const hoverCount = useRef(0)

    /* The canvas is one element, so the cursor has to be driven by what the
       raycaster is over rather than by CSS :hover. Counted, not boolean — planes
       overlap, and the pointer can enter the next one before leaving the last. */
    const handleHoverChange = useCallback((entering) => {
        hoverCount.current = Math.max(0, hoverCount.current + (entering ? 1 : -1))
        gl.domElement.style.cursor = hoverCount.current > 0 ? 'pointer' : 'crosshair'
    }, [gl])

    return (
        <group>
            {images.map((image, index) => (
                <Photo
                    key={image.src}
                    url={image.src}
                    seat={seats[index]}
                    rotated={image.rotatePortrait}
                    revealed={revealed}
                    selected={selected === index}
                    focused={focused === index}
                    dimmed={selected !== null && selected !== index}
                    onSelect={() => onSelect(index)}
                    onHoverChange={handleHoverChange}
                />
            ))}
        </group>
    )
}

export default function ProcessField({ images }) {
    const [revealed, setRevealed] = useState(false)
    const [selected, setSelected] = useState(null)
    const [focused, setFocused] = useState(null)

    /* Stratified scatter: one photo per cell of a virtual grid, jittered inside its
       cell. Rejection sampling was the obvious choice and it was wrong here — with
       only 30 samples a single unlucky seed clumps half the field into one corner
       and leaves the other half bare, and no amount of retries fixes the seed. A
       jittered grid cannot clump, and the jitter is large enough that it never
       reads as a grid.

       Lives here rather than in Field so it is computed once, outside the Canvas. */
    const seats = useMemo(() => {
        const random = mulberry32(0x5eed)
        const cols = Math.ceil(Math.sqrt(images.length * SEAT_GRID_ASPECT))
        const rows = Math.ceil(images.length / cols)

        /* Shuffle the cells before handing them out. Filling in raster order puts
           every leftover cell in one contiguous run — 30 photos on a 9x4 grid left
           a six-cell hole in one corner, which read as the scatter being broken.
           Shuffled, the spare cells land as scattered breathing room. */
        const cells = Array.from({ length: rows * cols }, (_, cell) => cell)
        for (let i = cells.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1))
            ;[cells[i], cells[j]] = [cells[j], cells[i]]
        }

        return images.map((_, index) => {
            const cell = cells[index]
            const col = cell % cols
            const row = Math.floor(cell / cols)
            const u = (col + 0.5 + (random() - 0.5) * SEAT_JITTER) / cols
            const v = (row + 0.5 + (random() - 0.5) * SEAT_JITTER) / rows
            return {
                x: (u * 2 - 1) * SEAT_SPAN_X,
                y: (v * 2 - 1) * SEAT_SPAN_Y,
                z: random() * 4.6 - 2.3,
                phase: random() * Math.PI * 2,
                speedX: 0.16 + random() * 0.22,
                speedY: 0.13 + random() * 0.2
            }
        })
    }, [images])

    const handleSelect = useCallback((index) => {
        setRevealed(true)
        setSelected((current) => (current === index ? null : index))
    }, [])

    const handleDeselect = useCallback(() => setSelected(null), [])

    /* Step to the next/previous photo without closing. Wraps, so the enlarged view
       is a loop through all thirty rather than a dead end at either end — there is
       no ordering in a scatter for an edge to mean anything against. */
    const handleStep = useCallback(
        (delta) =>
            setSelected((current) =>
                current === null ? null : (current + delta + images.length) % images.length
            ),
        [images.length]
    )

    /* Escape closes the enlarged photo, arrows walk it. On window, not on the
       wrapper: clicking a photo leaves focus on the body, so a wrapper handler
       would only ever fire for someone who arrived by keyboard — that is, not for
       the people most likely to reach for Escape after clicking something open. */
    useEffect(() => {
        if (selected === null) return undefined
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setSelected(null)
            else if (event.key === 'ArrowLeft') handleStep(-1)
            else if (event.key === 'ArrowRight') handleStep(1)
            else return
            event.preventDefault()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [selected, handleStep])

    return (
        <div className="wcc-process-field">
            <Canvas
                dpr={[1, 1.6]}
                gl={{ antialias: true, alpha: true }}
                camera={{ fov: 45, position: [0, 0, CAMERA_Z] }}
                /* On the Canvas, NOT on the group inside it. A group is never a
                   raycast target, so a group-level onPointerMissed fires on every
                   click — including the ones that hit a photo — and the deselect
                   raced the select. The Canvas prop fires only when the click hit
                   nothing at all. */
                onPointerMissed={handleDeselect}
            >
                <Suspense fallback={null}>
                    <Field
                        images={images}
                        seats={seats}
                        revealed={revealed}
                        selected={selected}
                        focused={focused}
                        onSelect={handleSelect}
                    />
                </Suspense>
            </Canvas>

            {/* The pager, only while a photo is open. Visible and clickable, unlike
                the list below — once you are looking at one photo full-frame the
                scatter is behind it and there is nothing left to aim at, so
                stepping needs a real target. Sits outside the Canvas, so clicking
                it is a DOM click and never reaches onPointerMissed. */}
            {selected !== null && (
                <div className="wcc-process-field__pager">
                    <button type="button" onClick={() => handleStep(-1)} aria-label="Previous photo">
                        &#8592;
                    </button>
                    <span aria-live="polite">
                        {selected + 1} / {images.length}
                    </span>
                    <button type="button" onClick={() => handleStep(1)} aria-label="Next photo">
                        &#8594;
                    </button>
                    <button
                        type="button"
                        className="wcc-process-field__pager-close"
                        onClick={handleDeselect}
                        aria-label="Close enlarged view"
                    >
                        Close
                    </button>
                </div>
            )}

            {/* The real controls. Visually hidden but focusable and readable — the
                canvas above is their presentation, not a substitute for them. */}
            <ul className="wcc-process-field__controls">
                {images.map((image, index) => (
                    <li key={image.src}>
                        <button
                            type="button"
                            aria-pressed={selected === index}
                            onFocus={() => setFocused(index)}
                            onBlur={() => setFocused((current) => (current === index ? null : current))}
                            onClick={() => handleSelect(index)}
                        >
                            {selected === index ? `Close enlarged view: ${image.alt}` : `Enlarge: ${image.alt}`}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}
