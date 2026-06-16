import React, { useMemo, useEffect } from 'react'
import * as THREE from 'three'

const PADDING = 20
const BASE_FONT_SIZE = 64

function createTextTexture({ text, color, fontFamily, fontWeight, fontStyle }) {
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
        context.fillText(line, PADDING, PADDING + index * lineHeight)
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

export default function Text2DObject({ data, color, fontFamily, fontWeight, fontStyle }) {
    const textTexture = useMemo(() => {
        const result = createTextTexture({
            text: (data || '').replace(/\\n/g, '\n'),
            color,
            fontFamily,
            fontWeight,
            fontStyle
        })
        return result
    }, [data, color, fontFamily, fontWeight, fontStyle])

    useEffect(() => {
        return () => {
            textTexture?.texture?.dispose()
        }
    }, [textTexture])

    if (!textTexture) {
        return null
    }

    const scale = 0.02
    const width = textTexture.width * scale
    const height = textTexture.height * scale

    return (
        <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
                map={textTexture.texture}
                transparent={true}
                toneMapped={false}
            />
        </mesh>
    )
}
