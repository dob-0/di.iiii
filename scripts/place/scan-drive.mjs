#!/usr/bin/env node
/**
 * scan-drive.mjs — walk /{space}/scan the way a phone does, and look at it.
 *
 *   node scripts/place/scan-drive.mjs [name] [--base http://127.0.0.1:5150] [--out <dir>]
 *
 * Nothing here is a unit test. It exists because three defects in this surface
 * were found only by driving it, and none of them would fail a test:
 *
 *   - the bottom of the page was five absolutely-positioned layers, and on a
 *     390-px screen one of them ate another's taps. Playwright named the
 *     intercepting element; reading the code did not.
 *   - the 36 ring ticks turned about their own ends and radiated out of the
 *     middle like a sunburst.
 *   - the footage room was never given an arrival shot, so a wall — one thin,
 *     wide, flat thing — was auto-framed from its bounding sphere and read as a
 *     strip on the floor.
 *
 * It needs a dev stack of your own (NEVER port 4000, 443 or 80 — those are the
 * owner's live install):
 *
 *   PORT=5150 DI_LOCAL=1 CLIENT_DIR=./dist DATA_ROOT=/tmp/scan node serverXR/src/index.js
 *
 * A synthetic MediaStream from a canvas, not Chromium's fake device: the fake
 * device is a flat rolling pattern and the sharpness measure would read it as
 * one number for the whole walk. A painted canvas with edges in it exercises the
 * Laplacian for real, and the compass is driven by hand so the ring and the
 * floor hint have something to read.
 *
 * Open every screenshot it writes. A screenshot nobody looked at is not
 * verification.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const argOf = (name, fallback) => {
    const at = process.argv.indexOf(`--${name}`)
    return at > -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}
const BASE = argOf('base', 'http://127.0.0.1:5150')
const OUT = argOf('out', path.join(process.env.HOME || '.', 'Downloads', 'place-scan'))
const TOKEN = process.env.DI_API_TOKEN || 'scan-dev-token'
const SPACE = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'scan-proof'

fs.mkdirSync(OUT, { recursive: true })

const shot = async (page, name) => {
    const file = path.join(OUT, `${name}.png`)
    await page.screenshot({ path: file })
    console.log(`  shot ${file}`)
    return file
}

// Painted into the page before anything runs: getUserMedia hands back a canvas
// stream with real edges and real movement, and DeviceOrientationEvent is fired
// by hand so the ring and the floor hint have something to read.
const FAKE_CAMERA = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const context = canvas.getContext('2d')
    let frame = 0
    const paint = () => {
        frame += 1
        context.fillStyle = '#20242c'
        context.fillRect(0, 0, canvas.width, canvas.height)
        // A floor line and a row of pillars, moving — edges for the matcher and
        // for the sharpness measure.
        context.fillStyle = '#c8c2b4'
        context.fillRect(0, 470, canvas.width, 8)
        for (let pillar = 0; pillar < 9; pillar += 1) {
            const x = ((pillar * 170) + frame * 3) % (canvas.width + 200) - 100
            context.fillRect(x, 120, 44, 350)
            context.fillStyle = pillar % 2 ? '#8e8577' : '#c8c2b4'
        }
        context.fillStyle = '#ffffff'
        context.font = '28px monospace'
        context.fillText(`frame ${frame}`, 30, 60)
        window.__scanFrames = frame
    }
    window.setInterval(paint, 40)
    paint()

    const stream = canvas.captureStream(25)
    navigator.mediaDevices.getUserMedia = async () => stream
    navigator.mediaDevices.enumerateDevices = async () => ([
        { kind: 'videoinput', deviceId: 'fake-rear', label: 'fake rear camera' }
    ])
    // ImageCapture is absent here on purpose, so the canvas path (the usual one
    // on a real phone browser) is what gets exercised.
    delete window.ImageCapture

    // The compass and gravity, driven from the test.
    window.__aim = (alpha, beta, gamma) => {
        const event = new Event('deviceorientationabsolute')
        event.alpha = alpha
        event.beta = beta
        event.gamma = gamma
        window.dispatchEvent(event)
    }
}

const run = async () => {
    const browser = await chromium.launch({
        args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
    })

    const results = []

    for (const pose of [
        { name: 'portrait', viewport: { width: 390, height: 844 } },
        { name: 'landscape', viewport: { width: 844, height: 390 } }
    ]) {
        const context = await browser.newContext({
            ...pose,
            deviceScaleFactor: 3,
            isMobile: true,
            hasTouch: true,
            permissions: ['camera']
        })
        await context.addInitScript(FAKE_CAMERA)
        const page = await context.newPage()
        const problems = []
        page.on('console', (message) => {
            if (message.type() === 'error') problems.push(message.text())
        })
        page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

        console.log(`\n== ${pose.name} ${pose.viewport.width}x${pose.viewport.height} @3 ==`)
        const spaceId = `${SPACE}-${pose.name}`

        // Make the space the way the door does, then open the camera on it.
        const made = await page.request.post(`${BASE}/serverXR/api/spaces`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            data: { label: spaceId, slug: spaceId, permanent: true }
        })
        console.log(`  space ${spaceId}: HTTP ${made.status()}`)

        await page.goto(`${BASE}/${spaceId}/scan`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(2500)
        results.push(await shot(page, `proof-01-${pose.name}-arrived`))

        // Standing instructions out of the way.
        const understood = page.getByRole('button', { name: 'Understood' })
        if (await understood.count()) await understood.click()
        await page.waitForTimeout(400)

        // Turn on the spot while recording, so the ring has something in it.
        const turn = async (from, to) => {
            for (let alpha = from; alpha <= to; alpha += 8) {
                await page.evaluate((a) => window.__aim(a, 88, 0), alpha)
                await page.waitForTimeout(25)
            }
        }

        console.log('  recording two pieces …')
        await page.locator('.scan-record').click()
        await page.waitForTimeout(600)
        results.push(await shot(page, `proof-02-${pose.name}-recording`))
        // Driven at the REAL thirty seconds, not a shortened one: the piece
        // boundary is the thing being proven. Recording for ~33 s gives piece 1
        // (the automatic cut at 30 s) and piece 2 (the tail, closed by Stop).
        await turn(0, 200)
        await page.waitForTimeout(12000)
        await turn(200, 350)
        await page.waitForTimeout(21000)
        await page.locator('.scan-record').click()
        await page.waitForTimeout(6000)
        results.push(await shot(page, `proof-03-${pose.name}-walk-uploaded`))

        console.log('  three photographs …')
        for (let still = 0; still < 3; still += 1) {
            await page.getByRole('button', { name: 'Photograph' }).click()
            await page.waitForTimeout(1200)
        }
        await page.waitForTimeout(1500)
        results.push(await shot(page, `proof-04-${pose.name}-stills`))

        console.log('  measuring a wall …')
        await page.getByRole('button', { name: 'Measure a wall' }).click()
        await page.waitForTimeout(300)
        await page.locator('#scan-metres').fill('8.3')
        results.push(await shot(page, `proof-05-${pose.name}-measuring`))
        await page.getByRole('button', { name: 'Save and photograph it' }).click()
        await page.waitForTimeout(2500)
        results.push(await shot(page, `proof-06-${pose.name}-measured`))

        // What actually landed in the room.
        const document = await (await page.request.get(
            `${BASE}/serverXR/api/projects/${spaceId}-sources/document`,
            { headers: { Authorization: `Bearer ${TOKEN}` } }
        )).json()
        const entities = document.document.entities
        console.log(`  the room holds ${entities.length} objects and ${document.document.assets.length} files:`)
        entities.forEach((entity) => console.log(`    ${entity.id}  ${entity.type.padEnd(6)} ${entity.name}`))

        // …and the wall itself, seen.
        await page.goto(`${BASE}/${spaceId}/p/${spaceId}-sources`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(6000)
        results.push(await shot(page, `proof-07-${pose.name}-sources-wall`))

        // The build route, dry.
        const build = await page.request.post(`${BASE}/serverXR/api/spaces/${spaceId}/place/build`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            data: { dryRun: true }
        })
        console.log(`  build: HTTP ${build.status()} ${JSON.stringify(await build.json()).slice(0, 220)}`)

        if (problems.length) console.log(`  CONSOLE PROBLEMS:\n    ${problems.join('\n    ')}`)
        else console.log('  no console errors')

        await context.close()
    }

    await browser.close()
    console.log(`\n${results.length} screenshots in ${OUT}`)
}

run().catch((error) => {
    console.error(error)
    process.exit(1)
})
