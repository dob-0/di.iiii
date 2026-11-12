// nocam-check — a camera clip whose camera gives no picture shows NOTHING on the output.
//
//   DI_TEST_LANE=2 di-test-browser run scripts/show/nocam-check.mjs
//   env: NOCAM_BASE (default http://127.0.0.1:5328)  NOCAM_API (default http://127.0.0.1:4317/serverXR)
//        NOCAM_TAG  (base|fix, names the saved pictures)  NOCAM_OUT (pictures folder)
//        NOCAM_VIDEO (a small mp4; default: made with ffmpeg smptebars)
//
// It builds five throwaway projects in a SCRATCH stack (never the owner's data), each with a
// VJ deck and a Map surface that names the deck, opens `/main/map/<id>/out` (the live output),
// and prints one line per rule:
//   RULE2  cases i, iii, iv: mean abs difference per channel vs the same scene without the
//          camera clip is at most 2 of 255
//   RULE3  case ii (only a camera clip): every pixel of a 32 x 18 grid is at most 4 of 255
//   RULE4  the mapping editor still shows its test pattern for a surface without a source:
//          its picture differs by at most 2 of 255 from the one saved by the other tag
// The browser has no camera granted, so every camera clip is a camera clip without a camera.
// Exit code 1 when a rule fails.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import sharp from 'sharp'

const BASE = process.env.NOCAM_BASE || 'http://127.0.0.1:5328'
const API = process.env.NOCAM_API || 'http://127.0.0.1:4317/serverXR'
const TAG = process.env.NOCAM_TAG || 'run'
const OUT = process.env.NOCAM_OUT || '/home/dob/work/platina/ui-2026-11-11/nocam'
process.argv.push('--base', BASE, '--api', API)
const { person } = await import('../../.claude/skills/run-di-iiii/driver.mjs')
// The scratch stack runs with auth off ("Auth Disabled"): no account, no login.
fs.mkdirSync(OUT, { recursive: true })

let video = process.env.NOCAM_VIDEO
if (!video) {
    video = path.join(OUT, 'smptebars.mp4')
    if (!fs.existsSync(video)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'smptebars=size=640x360:rate=25:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video])
}

const api = (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
    const answer = await fetch(`/serverXR${url}`, { method, credentials: 'include', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    return { status: answer.status, body: await answer.json().catch(() => null) }
}, { method, url, body })

const cameraClip = (label) => ({ id: `cam-${label.replace(/\W/g, '')}`, kind: 'camera', camera: label })

// The scenes. `layer2` is what sits above the file clip (null: nothing).
const SCENES = {
    ref: { file: true },
    i: { file: true, camera: 'Phone' },
    ii: { file: false, camera: 'Phone' },
    iii: { file: true, camera: 'Phone', body: true },
    iv: { file: true, camera: 'No such camera 9' }
}

const grab = async (page, file) => {
    const png = await page.screenshot({ path: file })
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
}
const meanAbsDiff = (a, b) => {
    let sum = 0
    for (let i = 0; i < a.data.length; i += 1) sum += Math.abs(a.data[i] - b.data[i])
    return sum / a.data.length
}
const gridMax = (a) => {
    let max = 0
    for (let gy = 0; gy < 18; gy += 1) {
        for (let gx = 0; gx < 32; gx += 1) {
            const x = Math.min(a.width - 1, Math.floor(((gx + 0.5) * a.width) / 32))
            const y = Math.min(a.height - 1, Math.floor(((gy + 0.5) * a.height) / 18))
            const at = (y * a.width + x) * 3
            max = Math.max(max, a.data[at], a.data[at + 1], a.data[at + 2])
        }
    }
    return max
}

const browser = await chromium.connectOverCDP(process.env.DI_TEST_CDP)
let failed = 0
const rule = (id, ok, text) => { if (!ok) failed += 1; console.log(`${id} ${ok ? 'PASS' : 'FAIL'} ${text}`) }
const pages = []
try {
    const desk = await person(browser)
    pages.push(desk)
    await desk.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await api(desk, 'POST', '/api/spaces', { label: 'main', slug: 'main', permanent: false })
    // One asset per project: upload it where it is used.
    const shots = {}
    // Two worlds: "plain" is the test browser as it is (no camera granted); "absent" makes the camera
    // API answer like a machine whose camera is not there (NotFoundError, no devices): the path that
    // used to put a message card over the whole output.
    const ABSENT = `(() => { const m = navigator.mediaDevices; if (!m) return; m.getUserMedia = () => Promise.reject(Object.assign(new Error('nocam-check: no camera'), { name: 'NotFoundError' })); m.enumerateDevices = async () => [] })()`
    let editorProject = null
    for (const [name, scene] of Object.entries(SCENES)) {
        const made = await api(desk, 'POST', '/api/spaces/main/projects', { title: `nocam-${name}-${Date.now()}` })
        const projectId = made.body?.project?.id || made.body?.projectId || made.body?.id
        const bytes = fs.readFileSync(video).toString('base64')
        const asset = await desk.evaluate(async ({ projectId, bytes }) => {
            const raw = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))
            const form = new FormData()
            form.append('asset', new File([raw], 'bars.mp4', { type: 'video/mp4' }), 'bars.mp4')
            const answer = await fetch(`/serverXR/api/projects/${projectId}/assets`, { method: 'POST', credentials: 'include', body: form })
            return (await answer.json()).asset
        }, { projectId, bytes })
        const { body: current } = await api(desk, 'GET', `/api/projects/${projectId}/document`)
        const layers = [{ id: 'layer-1', active: scene.file ? 0 : -1, trigger: 1, clips: [scene.file ? { id: 'file-1', kind: 'asset', asset: asset.id } : null, null] }]
        if (scene.camera) {
            layers.push({ id: 'layer-2', active: 0, trigger: 1, effects: scene.body ? [{ id: 'fx-body', type: 'top.matte', on: true, mix: 1, params: {} }] : [], clips: [cameraClip(scene.camera), null] })
        }
        const sent = await api(desk, 'POST', `/api/projects/${projectId}/ops`, {
            baseVersion: current.version,
            ops: [
                { type: 'upsertAsset', payload: { asset } },
                { type: 'createNode', payload: { node: { id: 'deck', typeId: 'vj.deck', label: 'Deck', graphX: 40, graphY: 40, parentId: null, values: { machine: '', deck: { columns: 2, layers } } } } },
                { type: 'createMappingSurface', payload: { surface: { id: 'srf-1', name: '', enabled: true, source: { kind: 'network', ref: 'deck' }, corners: [[0, 0], [1, 0], [1, 1], [0, 1]], resolution: [1280, 720] } } }
            ]
        })
        if (sent.status >= 300) throw new Error(`ops ${name}: ${sent.status} ${JSON.stringify(sent.body)}`)
        if (name === 'ref') editorProject = projectId
        for (const world of scene.camera ? ['plain', 'absent'] : ['plain']) {
            const page = await desk.context().newPage()
            pages.push(page)
            if (world === 'absent') await page.addInitScript(ABSENT)
            await page.setViewportSize({ width: 1280, height: 720 })
            await page.goto(`${BASE}/main/map/${projectId}/out`, { waitUntil: 'domcontentloaded' })
            await page.waitForTimeout(6500)
            const key = world === 'plain' ? name : `${name}-absent`
            shots[key] = await grab(page, path.join(OUT, `out-${key}-${TAG}.png`))
            console.log(`   ${key}: ${await page.title()} -> out-${key}-${TAG}.png  placeholder=${await page.locator('.map-source-placeholder').count()}`)
            await page.close()
        }
    }
    // the mapping editor, for a surface WITHOUT a source (rule 4)
    {
        const version = (await api(desk, 'GET', `/api/projects/${editorProject}/document`)).body.version
        const ed = await api(desk, 'POST', `/api/projects/${editorProject}/ops`, { baseVersion: version, ops: [{ type: 'setMappingSurface', payload: { surfaceId: 'srf-1', patch: { source: { kind: 'test', ref: '' } } } }] })
        if (ed.status >= 300) console.log(`   editor surface patch: ${ed.status}`)
        const editor = await desk.context().newPage()
        pages.push(editor)
        await editor.setViewportSize({ width: 1280, height: 720 })
        await editor.goto(`${BASE}/main/map/${editorProject}`, { waitUntil: 'domcontentloaded' })
        await editor.waitForTimeout(5000)
        shots.editor = await grab(editor, path.join(OUT, `editor-${TAG}.png`))
        await editor.close()
    }
    const meanDiff = (name) => meanAbsDiff(shots[name], shots.ref)
    const names = ['i', 'iii', 'iv', 'i-absent', 'iii-absent', 'iv-absent']
    const d = Object.fromEntries(names.map((n) => [n, meanDiff(n)]))
    rule('RULE2', names.every((n) => d[n] <= 2), `mean abs diff vs camera-clip-removed (of 255): ${names.map((n) => `${n}=${d[n].toFixed(2)}`).join(' ')} (limit 2)`)
    const max = Math.max(gridMax(shots.ii), gridMax(shots['ii-absent']))
    rule('RULE3', max <= 4, `case ii (plain, absent) 32x18 grid max channel value ${max} (limit 4)`)
    const other = TAG === 'base' ? 'fix' : 'base'
    const otherFile = path.join(OUT, `editor-${other}.png`)
    if (fs.existsSync(otherFile)) {
        const { data, info } = await sharp(otherFile).removeAlpha().raw().toBuffer({ resolveWithObject: true })
        const diff = meanAbsDiff(shots.editor, { data, width: info.width, height: info.height })
        rule('RULE4', diff <= 2, `mapping editor picture vs ${other}: mean abs diff ${diff.toFixed(2)} (limit 2)`)
    } else console.log(`RULE4 PENDING editor-${TAG}.png saved; run again with the other NOCAM_TAG to compare`)
} finally {
    for (const page of pages) { try { await Promise.race([page.goto('about:blank').then(() => page.close()), new Promise((r) => setTimeout(r, 5000))]) } catch { /* already closed */ } }
}
process.exit(failed ? 1 : 0)
