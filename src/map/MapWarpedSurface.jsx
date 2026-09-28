import { useEffect, useRef } from 'react'
import MapSourceView from './MapSourceView.jsx'
import { buildWarpMesh } from './warpMesh.js'

// A SURFACE WITH POINTS, drawn through a mesh.
//
// The plain corner pin is a CSS matrix3d on a div, which is why this mapper
// can put a live web page on a wall at all — a page is DOM, and DOM is the
// only thing that will draw a cross-origin page. But a matrix3d has four
// corners and no more; it cannot bend. So a surface with points takes the
// other road: its source is rendered exactly as before, unseen, and every
// frame is copied into a texture and drawn through the warp mesh
// (warpMesh.js) on a canvas the size of the stage. Video, camera, stream,
// NDI®, picture networks, images, colours and test patterns all take this
// road; a page or a project cannot (pointEditing.js, isWarpable), and stays
// a corner pin.
//
// The source stays in the DOM at full opacity ZERO, not display:none, for
// the same reason .map-source-hidden-video exists: a video that is not
// displayed stops decoding, and a stopped video is a black wall.

const VERTEX = `
attribute vec2 a_pos;
attribute vec2 a_uv;
uniform vec2 u_size;
varying vec2 v_uv;
void main() {
    vec2 clip = (a_pos / u_size) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_uv = a_uv;
}`

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() {
    gl_FragColor = texture2D(u_tex, v_uv);
}`

// How finely the picture is bent. 32 across is invisible on a 1080p wall
// and 2,000 triangles is nothing to a GPU.
const SUBDIVISIONS = 32

const compile = (gl, type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return shader
}

const createRenderer = (canvas) => {
    // preserveDrawingBuffer: the picture stays readable after the frame is
    // shown, so a screenshot, a verification harness or a thumbnail sees
    // what the wall sees. One extra copy per frame, nothing on a GPU.
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true })
    if (!gl) return null
    const program = gl.createProgram()
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    gl.useProgram(program)
    const aPos = gl.getAttribLocation(program, 'a_pos')
    const aUv = gl.getAttribLocation(program, 'a_uv')
    const uSize = gl.getUniformLocation(program, 'u_size')
    const posBuffer = gl.createBuffer()
    const uvBuffer = gl.createBuffer()
    const indexBuffer = gl.createBuffer()
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    // No mipmaps and clamped edges: a video is rarely a power of two, and a
    // repeat at the edge would smear the far side of the picture into the
    // near one.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    return { gl, program, aPos, aUv, uSize, posBuffer, uvBuffer, indexBuffer, texture, indexCount: 0, hasTexture: false }
}

const uploadMesh = (renderer, mesh) => {
    const { gl } = renderer
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.uvBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, renderer.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
    renderer.indexCount = mesh.indices.length
}

// Is there a frame to take from this element yet? A video before its first
// frame, or an image still loading, would upload as black — and black on the
// wall is exactly what a surface must never flash.
const ready = (element) => {
    if (!element) return false
    if (element.tagName === 'VIDEO') return element.readyState >= 2 && element.videoWidth > 0
    if (element.tagName === 'IMG') return element.complete && element.naturalWidth > 0
    if (element.tagName === 'CANVAS') return element.width > 0 && element.height > 0
    return false
}

const draw = (renderer, width, height) => {
    const { gl } = renderer
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!renderer.hasTexture || !renderer.indexCount) return
    gl.useProgram(renderer.program)
    gl.uniform2f(renderer.uSize, width, height)
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.posBuffer)
    gl.enableVertexAttribArray(renderer.aPos)
    gl.vertexAttribPointer(renderer.aPos, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.uvBuffer)
    gl.enableVertexAttribArray(renderer.aUv)
    gl.vertexAttribPointer(renderer.aUv, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, renderer.indexBuffer)
    gl.bindTexture(gl.TEXTURE_2D, renderer.texture)
    gl.drawElements(gl.TRIANGLES, renderer.indexCount, gl.UNSIGNED_SHORT, 0)
}

// A test pattern is an SVG, and a colour is a div — neither can be handed to
// texImage2D. Both are still pictures, so they are rasterised once into an
// image when they change, and that image is the texture.
const rasterise = (element, width, height) => new Promise((resolve) => {
    if (element.tagName === 'svg') {
        const clone = element.cloneNode(true)
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        clone.setAttribute('width', String(width))
        clone.setAttribute('height', String(height))
        const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const image = new Image()
        image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
        image.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
        image.src = url
        return
    }
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const context = canvas.getContext('2d')
    context.fillStyle = getComputedStyle(element).backgroundColor || '#000'
    context.fillRect(0, 0, 2, 2)
    resolve(canvas)
})

export default function MapWarpedSurface({ surface, width, height, spaceId = '', live = true, network = null, label = '', style }) {
    const canvasRef = useRef(null)
    const sourceRef = useRef(null)
    const rendererRef = useRef(null)
    const stillRef = useRef({ key: '', image: null, pending: false })
    const [sourceWidth, sourceHeight] = surface.resolution

    // The mesh, rebuilt when the shape or the stage changes. Cheap: a few
    // thousand numbers.
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return undefined
        if (!rendererRef.current) rendererRef.current = createRenderer(canvas)
        const renderer = rendererRef.current
        if (!renderer) return undefined
        const mesh = buildWarpMesh(surface.corners, surface.points, width, height, SUBDIVISIONS)
        uploadMesh(renderer, mesh.degenerate ? { positions: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint16Array(0) } : mesh)
        return undefined
    }, [surface.corners, surface.points, width, height])

    // Every frame: take the source's current picture into the texture and
    // draw the mesh. A still (image, pattern, colour) is uploaded once and
    // then only drawn; a video is uploaded every frame.
    useEffect(() => {
        let frame = 0
        let failed = false
        const tick = () => {
            frame = requestAnimationFrame(tick)
            const renderer = rendererRef.current
            const box = sourceRef.current
            if (!renderer || !box || failed) return
            const { gl } = renderer
            const live = box.querySelector('video, canvas, img')
            try {
                if (live) {
                    if (ready(live)) {
                        gl.bindTexture(gl.TEXTURE_2D, renderer.texture)
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, live)
                        renderer.hasTexture = true
                    }
                } else {
                    const still = box.querySelector('svg, .map-source-fill')
                    if (still) {
                        const key = still.tagName === 'svg' ? `${still.outerHTML.length}:${surface.source?.ref}:${sourceWidth}x${sourceHeight}` : `fill:${still.style.background}`
                        const state = stillRef.current
                        if (state.key !== key && !state.pending) {
                            state.pending = true
                            rasterise(still, sourceWidth, sourceHeight).then((image) => {
                                state.pending = false
                                // Tried, whichever way it went: a picture
                                // that will not rasterise is not asked
                                // again sixty times a second.
                                state.key = key
                                if (!image) return
                                state.image = image
                                gl.bindTexture(gl.TEXTURE_2D, renderer.texture)
                                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
                                renderer.hasTexture = true
                            })
                        }
                    }
                }
            } catch {
                // A cross-origin picture taints the texture and the browser
                // throws. Nothing to do but stop asking; the surface draws
                // whatever it last had.
                failed = true
            }
            draw(renderer, width, height)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [width, height, sourceWidth, sourceHeight, surface.source?.ref])

    // No lose-context on unmount, on purpose. React's development double
    // mount runs the cleanup once with the canvas still in place, and a
    // canvas whose context was lost never gives another — the surface came
    // up white. The canvas leaves the DOM with the component and the browser
    // reclaims the context on its own.

    return (
        <div className="map-stage-warp" data-surface-id={surface.id} style={style}>
            <div ref={sourceRef} className="map-warp-source" style={{ width: sourceWidth, height: sourceHeight }} aria-hidden="true">
                <MapSourceView surface={surface} spaceId={spaceId} live={live} network={network} label={label} />
            </div>
            <canvas ref={canvasRef} className="map-warp-canvas" width={width} height={height} />
        </div>
    )
}
