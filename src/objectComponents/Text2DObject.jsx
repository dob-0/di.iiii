import React, { useMemo, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { typewriterState, TEXT_REVEAL_DEFAULTS } from '../project/viewport/textReveal.js'

const PADDING = 20
const BASE_FONT_SIZE = 64

function createTextTexture({ text, color, fontFamily, fontWeight, fontStyle, align = 'left' }) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return null

    const fontSpec = `${fontWeight} ${fontStyle} ${BASE_FONT_SIZE}px ${fontFamily}`
    context.font = fontSpec
    const lines = (text || '').split(/\r?\n/)
    const lineHeight = BASE_FONT_SIZE * 1.2

    let maxWidth = 1
    lines.forEach(line => {
        const metrics = context.measureText(line || '')
        maxWidth = Math.max(maxWidth, metrics.width)
    })
    const textWidth = maxWidth
    const textHeight = lineHeight * lines.length || lineHeight

    canvas.width = Math.ceil(textWidth + PADDING * 2)
    canvas.height = Math.ceil(textHeight + PADDING * 2)

    const ratio = window.devicePixelRatio || 1
    canvas.width *= ratio
    canvas.height *= ratio
    context.scale(ratio, ratio)

    context.fillStyle = 'rgba(255,255,255,0)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.font = fontSpec
    context.textBaseline = 'top'
    context.fillStyle = color
    lines.forEach((line, index) => {
        const lineWidth = context.measureText(line || '').width
        const x = align === 'center' ? PADDING + (textWidth - lineWidth) / 2
            : align === 'right' ? PADDING + (textWidth - lineWidth)
            : PADDING
        context.fillText(line, x, PADDING + index * lineHeight)
    })

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    return {
        texture,
        width: canvas.width / ratio,
        height: canvas.height / ratio
    }
}

const WORLD_UNITS_PER_PIXEL = 0.02

// One canvas per line, sized to the *block* width so every line shares the
// plane width and stays aligned. Redrawing a single line costs a fraction of
// redrawing the whole block, which matters because the line currently being
// typed is re-uploaded to the GPU on every new character.
function createLineCanvases({ text, color, fontFamily, fontWeight, fontStyle, align = 'left' }) {
    const probe = document.createElement('canvas').getContext('2d')
    if (!probe) return null

    const fontSpec = `${fontWeight} ${fontStyle} ${BASE_FONT_SIZE}px ${fontFamily}`
    probe.font = fontSpec
    const lines = (text || '').split(/\r?\n/)
    const lineHeight = BASE_FONT_SIZE * 1.2

    let maxWidth = 1
    lines.forEach(line => {
        maxWidth = Math.max(maxWidth, probe.measureText(line || '').width)
    })

    // Match the single-texture path exactly so switching the reveal on or off
    // never moves or resizes the text.
    const blockWidth = Math.ceil(maxWidth + PADDING * 2)
    const blockHeight = Math.ceil((lineHeight * lines.length || lineHeight) + PADDING * 2)
    const ratio = window.devicePixelRatio || 1

    const entries = lines.map((line, index) => {
        const canvas = document.createElement('canvas')
        canvas.width = blockWidth * ratio
        canvas.height = Math.ceil(lineHeight) * ratio
        const context = canvas.getContext('2d')
        context.scale(ratio, ratio)

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter

        const lineWidth = probe.measureText(line || '').width
        const x = align === 'center' ? PADDING + (maxWidth - lineWidth) / 2
            : align === 'right' ? PADDING + (maxWidth - lineWidth)
            : PADDING

        // Centre of this line's band, measured from the centre of the block —
        // the plane's own origin — so the group lines up with the static path.
        const bandCentreFromTop = PADDING + index * lineHeight + lineHeight / 2
        const offsetY = (blockHeight / 2 - bandCentreFromTop) * WORLD_UNITS_PER_PIXEL

        return {
            text: line || '',
            length: (line || '').length,
            canvas,
            context,
            texture,
            x,
            offsetY,
            drawnChars: -1,
        }
    })

    return {
        entries,
        fontSpec,
        color,
        lineHeight,
        width: blockWidth,
        height: blockHeight,
    }
}

function TypewriterText({ block, reveal, opacity }) {
    const startRef = useRef(null)
    const groupRef = useRef(null)

    const lineLengths = useMemo(() => block.entries.map((entry) => entry.length), [block])

    // Draw a line's first `chars` characters. Skipped entirely when the count
    // has not changed, so a finished line is never re-uploaded.
    const drawLine = (entry, chars) => {
        if (entry.drawnChars === chars) return
        entry.drawnChars = chars
        const { context, canvas } = entry
        const ratio = window.devicePixelRatio || 1
        context.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio)
        if (chars > 0) {
            context.font = block.fontSpec
            context.textBaseline = 'top'
            context.fillStyle = block.color
            context.fillText(entry.text.slice(0, chars), entry.x, 0)
        }
        entry.texture.needsUpdate = true
    }

    useFrame((state) => {
        if (startRef.current === null) startRef.current = state.clock.elapsedTime
        const elapsed = state.clock.elapsedTime - startRef.current
        const { line, chars } = typewriterState(elapsed, lineLengths, reveal)

        block.entries.forEach((entry, index) => {
            if (index < line) drawLine(entry, entry.length)
            else if (index === line) drawLine(entry, chars)
            else drawLine(entry, 0)
        })
    })

    useEffect(() => {
        return () => {
            block.entries.forEach((entry) => entry.texture.dispose())
        }
    }, [block])

    const lineHeightWorld = block.lineHeight * WORLD_UNITS_PER_PIXEL
    const widthWorld = block.width * WORLD_UNITS_PER_PIXEL

    return (
        <group ref={groupRef} position-y={0.01} rotation-x={-Math.PI / 2}>
            {block.entries.map((entry, index) => (
                <mesh key={index} position={[0, entry.offsetY, 0]}>
                    <planeGeometry args={[widthWorld, lineHeightWorld]} />
                    <meshBasicMaterial
                        map={entry.texture}
                        transparent={true}
                        toneMapped={false}
                        opacity={opacity}
                        depthWrite={false}
                    />
                </mesh>
            ))}
        </group>
    )
}

export default function Text2DObject({ data, color, fontFamily, fontWeight, fontStyle, align, reveal, opacity = 1 }) {
    const text = (data || '').replace(/\\n/g, '\n')
    const isTypewriter = reveal?.mode === 'typewriter'

    const textTexture = useMemo(() => {
        if (isTypewriter) return null
        return createTextTexture({ text, color, fontFamily, fontWeight, fontStyle, align })
    }, [isTypewriter, text, color, fontFamily, fontWeight, fontStyle, align])

    const block = useMemo(() => {
        if (!isTypewriter) return null
        return createLineCanvases({ text, color, fontFamily, fontWeight, fontStyle, align })
    }, [isTypewriter, text, color, fontFamily, fontWeight, fontStyle, align])

    useEffect(() => {
        return () => {
            textTexture?.texture?.dispose()
        }
    }, [textTexture])

    if (isTypewriter) {
        if (!block) return null
        return (
            <TypewriterText
                key={`${text}-${color}-${align}`}
                block={block}
                reveal={{ ...TEXT_REVEAL_DEFAULTS, ...reveal }}
                opacity={opacity}
            />
        )
    }

    if (!textTexture) {
        return null
    }

    const scale = WORLD_UNITS_PER_PIXEL
    const width = textTexture.width * scale
    const height = textTexture.height * scale

    return (
        <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
                map={textTexture.texture}
                transparent={true}
                toneMapped={false}
                opacity={opacity}
            />
        </mesh>
    )
}
