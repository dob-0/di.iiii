// Walk the VJ deck in a real browser: Clip In → VJ Deck → Picture Out, with
// real mp4 footage, on desktop (DPR 2) and a phone (DPR 3).
//
//   node scripts/verify-vj-deck.mjs --base http://localhost:5392 --api http://localhost:4392/serverXR \
//        --clips a.mp4,b.mp4 [--out .verify-vj-deck]
//
// Needs a running dev stack (see .claude/skills/run-di-iiii/SKILL.md — put it
// on free ports, never on an installed di.iiii's). It signs in as `vjwalk`
// (made by the driver), builds a throwaway project `vj-walk-<time>` in `main`
// through the same API the editor uses, then plays the deck through its own
// window: taps a slot, picks the input or the footage, taps to play.
//
// WebGL runs on SwiftShader, in software: headless Chrome must never touch
// the machine's NVIDIA GPU (a headless run crashed it on 2026-09-14). The
// renderer string is printed so the run proves which one it used.
//
// Evidence, not only pictures: every picture canvas on the page is read back
// and its mean and spread printed. A black or frozen picture reads ~0 spread.

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { account, person } from '../.claude/skills/run-di-iiii/driver.mjs'

const arg = (name, fallback) => {
    const at = process.argv.indexOf(`--${name}`)
    return at > 0 ? process.argv[at + 1] : fallback
}
const BASE = arg('base', 'http://localhost:5173')
const OUT = path.resolve(arg('out', '.verify-vj-deck'))
const CLIPS = String(arg('clips', '')).split(',').filter(Boolean)
if (CLIPS.length < 2) throw new Error('--clips a.mp4,b.mp4 — two real video files')
fs.mkdirSync(OUT, { recursive: true })

const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-vulkan']

// ── the project, through the API the editor uses ────────────────────────────
const api = async (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
    const answer = await fetch(`/serverXR${url}`, {
        method,
        credentials: 'include',
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
    })
    return { status: answer.status, body: await answer.json().catch(() => null) }
}, { method, url, body })

const upload = async (page, projectId, file) => {
    const bytes = fs.readFileSync(file).toString('base64')
    return page.evaluate(async ({ projectId, name, bytes }) => {
        const raw = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))
        const form = new FormData()
        form.append('asset', new File([raw], name, { type: 'video/mp4' }), name)
        const answer = await fetch(`/serverXR/api/projects/${projectId}/assets`, { method: 'POST', credentials: 'include', body: form })
        return (await answer.json()).asset
    }, { projectId, name: path.basename(file), bytes })
}

const build = async (page) => {
    // A fresh data root has no `main`; 409 when it exists is the normal case.
    await api(page, 'POST', '/api/spaces', { label: 'main', slug: 'main', permanent: false })
    const title = `vj-walk-${Date.now()}`
    const made = await api(page, 'POST', '/api/spaces/main/projects', { title })
    if (made.status >= 300) throw new Error(`create project: ${made.status} ${JSON.stringify(made.body)}`)
    const projectId = made.body?.project?.id || made.body?.projectId || made.body?.id
    const assets = []
    for (const file of CLIPS) assets.push(await upload(page, projectId, file))
    const { body: current } = await api(page, 'GET', `/api/projects/${projectId}/document`)
    const node = (id, typeId, label, graphX, graphY, values = {}) => ({ type: 'createNode', payload: { node: { id, typeId, label, graphX, graphY, parentId: null, values } } })
    const edge = (id, fromNodeId, toNodeId, toPort) => ({ type: 'createEdge', payload: { edge: { id, fromNodeId, fromPort: 'out', toNodeId, toPort } } })
    const ops = [
        ...assets.map((asset) => ({ type: 'upsertAsset', payload: { asset } })),
        node('clip', 'top.clip', 'Clip In', 40, 40, { machine: '', asset: assets[0].id, trigger: 0, speed: 1, mode: '0', in: 0, out: 1, playing: true }),
        node('out', 'top.out', 'Picture Out', 760, 40, { machine: '' })
    ]
    const sent = await api(page, 'POST', `/api/projects/${projectId}/ops`, { baseVersion: current.version, ops })
    if (sent.status >= 300) throw new Error(`ops: ${sent.status} ${JSON.stringify(sent.body)}`)
    return { projectId, assets }
}

// ── reading the pictures back ───────────────────────────────────────────────
const pictures = (page) => page.evaluate(() => [...document.querySelectorAll('canvas.raw-top-picture, .vj-deck canvas')].map((canvas) => {
    const card = canvas.closest('.raw-graph-node-card')
    const where = card ? `card: ${card.textContent.replace(/[›\s]+/g, ' ').trim().split(' pictures')[0]}` : `deck: ${canvas.getAttribute('aria-label') || canvas.className}`
    try {
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
        let sum = 0; let sq = 0; const n = data.length / 4
        for (let i = 0; i < data.length; i += 4) { const l = (data[i] + data[i + 1] + data[i + 2]) / 3; sum += l; sq += l * l }
        const mean = sum / n
        return { where: where.slice(0, 60), mean: Math.round(mean), spread: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean))) }
    } catch (error) { return { where, error: String(error) } }
}))

const renderer = (page) => page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    const video = document.createElement('video')
    return {
        webgl: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : (gl ? 'webgl (renderer hidden)' : 'NO WEBGL'),
        h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"') || 'no'
    }
})

const shot = async (page, name) => {
    const file = path.join(OUT, `${name}.png`)
    await page.screenshot({ path: file })
    console.log(`   screenshot: ${file}`)
    return file
}

// ── the walk ────────────────────────────────────────────────────────────────
await account('vjwalk', ['main'])
const browser = await chromium.launch({ args: SWIFTSHADER })
const report = { renderer: null, desktop: {}, phone: {} }
try {
    const desk = await person(browser, { as: 'vjwalk' })
    report.renderer = await renderer(desk)
    console.log('renderer', report.renderer)
    const { projectId, assets } = await build(desk)
    console.log('project', projectId, assets.map((a) => a.name))

    await desk.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
    await desk.locator('.raw-graph-node-card').nth(1).waitFor({ timeout: 30000 })
    await desk.waitForTimeout(1500)

    // The deck is made the way a person makes it: double-click the canvas
    // between the two cards, type its name. Where it lands is measured.
    const cards = await desk.locator('.raw-graph-node-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
    const gap = { x: Math.round((cards[0].right + cards[1].left) / 2), y: Math.round(cards[0].top + cards[0].height / 2) }
    await desk.mouse.dblclick(gap.x, gap.y)
    await desk.getByPlaceholder('type a node or panel name…').fill('VJ Deck')
    await desk.keyboard.press('Enter')
    const deck = desk.locator('.vj-deck').first()
    await deck.waitFor({ timeout: 30000 })
    const landed = await desk.locator('.raw-graph-node-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
    const made = landed.find((box) => !cards.some((old) => Math.abs(old.x - box.x) < 1 && Math.abs(old.y - box.y) < 1))
    report.placement = { asked: gap, cardMiddle: made ? { x: Math.round(made.x + made.width / 2), y: Math.round(made.y + made.height / 2) } : null }
    console.log('placement', report.placement)

    // Wire it: Clip In → deck In 1, deck → Picture Out.
    // The editor sends its ops on its own beat: wait until the server has the deck.
    let doc = null
    for (let i = 0; i < 40 && !doc?.document?.nodes?.some((n) => n.typeId === 'vj.deck'); i += 1) {
        await desk.waitForTimeout(500)
        doc = (await api(desk, 'GET', `/api/projects/${projectId}/document`)).body
    }
    const deckId = doc.document.nodes.find((n) => n.typeId === 'vj.deck')?.id
    if (!deckId) throw new Error('the deck made in the editor never reached the server')
    const wired = await api(desk, 'POST', `/api/projects/${projectId}/ops`, {
        baseVersion: doc.version,
        ops: [
            { type: 'createEdge', payload: { edge: { id: 'e1', fromNodeId: 'clip', fromPort: 'out', toNodeId: deckId, toPort: 'in1' } } },
            { type: 'createEdge', payload: { edge: { id: 'e2', fromNodeId: deckId, fromPort: 'out', toNodeId: 'out', toPort: 'a' } } }
        ]
    })
    if (wired.status >= 300) throw new Error(`wire: ${wired.status} ${JSON.stringify(wired.body)}`)
    await desk.waitForTimeout(2500)
    await shot(desk, 'desktop-1-patch')

    // Layer 1, slot 1: the Clip In wired into In 1. Layer 2, slot 1: footage.
    await deck.getByRole('button', { name: 'Layer 1, slot 1: add a clip' }).click()
    await deck.getByRole('button', { name: 'In 1', exact: true }).click()
    await deck.getByRole('button', { name: 'Layer 2, slot 1: add a clip' }).click()
    await deck.getByRole('button', { name: path.basename(CLIPS[1]) }).click()
    await deck.getByRole('button', { name: /^Layer 1, slot 1:/ }).click()
    await deck.getByRole('button', { name: /^Layer 2, slot 1:/ }).click()
    await deck.getByLabel('Layer 2 opacity').fill('0.5')
    await desk.waitForTimeout(4000)
    report.desktop.playing = await pictures(desk)
    await shot(desk, 'desktop-2-playing')
    await deck.getByLabel('Layer 2 blend').selectOption({ label: 'Difference' })
    await desk.waitForTimeout(2500)
    report.desktop.difference = await pictures(desk)
    await shot(desk, 'desktop-3-difference')
    await deck.screenshot({ path: path.join(OUT, 'desktop-4-deck-window.png') })
    console.log(`   screenshot: ${path.join(OUT, 'desktop-4-deck-window.png')}`)
    const errors = desk.problems.filter((p) => !/favicon|DevTools|409/.test(p))
    report.desktop.problems = errors

    const phone = await person(browser, { as: 'vjwalk', phone: true })
    await phone.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
    await phone.waitForTimeout(6000)
    await shot(phone, 'phone-1-patch')
    const phoneDeck = phone.locator('.vj-deck').first()
    if (await phoneDeck.count()) {
        await phoneDeck.scrollIntoViewIfNeeded().catch(() => {})
        await phone.waitForTimeout(1500)
        report.phone.pictures = await pictures(phone)
        await shot(phone, 'phone-2-deck')
    } else {
        report.phone.note = 'no deck window on the phone patch — see phone-1-patch.png'
    }
    report.phone.problems = phone.problems
    report.projectId = projectId
} finally {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    await browser.close()
}
