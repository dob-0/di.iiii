// A picture of a GLB, taken the way the browser will actually see it.
//
// Headless Chromium with SwiftShader — software rendering, no NVIDIA. Giving
// headless Chrome the real GPU on this machine is a known way to hang the box
// (docs/ai/golden_rules.md), and a thumbnail is not worth that.
//
// preserveDrawingBuffer is on because without it the canvas reads back black
// (docs/ai/testing-tools.md) — a black thumbnail is worse than none, because
// it looks like the mesh is broken.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

import { REPO_ROOT } from './common.mjs'

const MIME = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.html': 'text/html',
    '.glb': 'model/gltf-binary',
    '.json': 'application/json'
}

const VIEWER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>place preview</title>
<style>html,body{margin:0;height:100%;background:#07090c;overflow:hidden}canvas{display:block}</style>
<script type="importmap">
{"imports":{"three":"/three/three.module.js","three/addons/":"/addons/"}}
</script>
</head><body>
<script type="module">
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const params = new URLSearchParams(location.search)
const src = params.get('src')
const width = Number(params.get('w') || 960)
const height = Number(params.get('h') || 600)

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(width, height)
renderer.setPixelRatio(1)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#07090c')
scene.add(new THREE.AmbientLight(0xffffff, 1.1))
const key = new THREE.DirectionalLight(0xfff7ea, 1.8)
key.position.set(6, 9, 4)
scene.add(key)
const rim = new THREE.DirectionalLight(0x9fd8ff, 0.7)
rim.position.set(-5, 3, -6)
scene.add(rim)

const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 5000)

const done = (ok, detail) => {
    window.__placePreview = { ok, detail }
}

const loader = new GLTFLoader()
// The crushed GLB is meshopt-compressed, exactly as di.iiii's own viewer
// reads it — a preview that could not open it would be a lie.
loader.setMeshoptDecoder(MeshoptDecoder)
loader.load(src, (gltf) => {
    scene.add(gltf.scene)
    const box = new THREE.Box3().setFromObject(gltf.scene)
    if (box.isEmpty()) { done(false, 'empty bounding box'); return }
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z) || 1
    // A three-quarter view from above: the one angle that shows a room is a
    // room and not a wall.
    camera.position.set(centre.x + radius * 1.15, centre.y + radius * 0.85, centre.z + radius * 1.35)
    camera.lookAt(centre)
    camera.near = radius / 500
    camera.far = radius * 40
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
    done(true, { size: size.toArray(), centre: centre.toArray() })
}, undefined, (error) => done(false, String(error && error.message || error)))
</script>
</body></html>`

const serve = (files) => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x')
        const name = decodeURIComponent(url.pathname)
        if (name === '/' || name === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(VIEWER_HTML)
            return
        }
        let file = null
        if (name.startsWith('/three/')) {
            file = path.join(REPO_ROOT, 'node_modules', 'three', 'build', name.slice('/three/'.length))
        } else if (name.startsWith('/addons/')) {
            file = path.join(REPO_ROOT, 'node_modules', 'three', 'examples', 'jsm', name.slice('/addons/'.length))
        } else if (files[name]) {
            file = files[name]
        }
        if (!file || !fs.existsSync(file)) {
            res.writeHead(404)
            res.end('no')
            return
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
        fs.createReadStream(file).pipe(res)
    })
    // Port 0: the operating system picks a free high port. Never 4000, never
    // 443 — the owner's live di.iiii is on those and an agent has killed it
    // before by assuming a port was free.
    server.listen(0, '127.0.0.1', () => resolve(server))
})

/**
 * Take a picture of each GLB.
 * @param {Array<{glb: string, out: string, label?: string}>} shots
 */
export const renderPreviews = async (shots, options = {}) => {
    const { chromium } = await import('playwright')
    const files = {}
    shots.forEach((shot, index) => { files[`/model-${index}.glb`] = path.resolve(shot.glb) })
    const server = await serve(files)
    const port = server.address().port
    const width = options.width || 960
    const height = options.height || 600

    const browser = await chromium.launch({
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    })
    const results = []
    try {
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
        for (let index = 0; index < shots.length; index += 1) {
            const shot = shots[index]
            await page.goto(`http://127.0.0.1:${port}/?src=/model-${index}.glb&w=${width}&h=${height}`, { waitUntil: 'load' })
            await page.waitForFunction('window.__placePreview !== undefined', null, { timeout: 120_000 })
                .catch(() => {})
            const outcome = await page.evaluate('window.__placePreview || { ok: false, detail: "timed out" }')
            fs.mkdirSync(path.dirname(shot.out), { recursive: true })
            await page.screenshot({ path: shot.out })
            results.push({ ...shot, ...outcome })
        }
    } finally {
        await browser.close()
        server.close()
    }
    return results
}
