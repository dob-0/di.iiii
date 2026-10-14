#!/usr/bin/env node
/**
 * verify-raw-preview.mjs: with real pointer input, is the 3D scene visible while a
 * scene object (the Box) is selected on the Raw canvas?  1568x882, DPR 1.25.
 *   node scripts/verify-raw-preview.mjs --base http://127.0.0.1:5319 --api http://127.0.0.1:4311/serverXR --db ~/.cache/di-dev/rawprev-now/data/di.db --tag now
 */
import { seedAndOpen, arg } from './raw-preview-seed.mjs'
const BASE = arg('base'), API = arg('api'), DB = arg('db'), TAG = arg('tag', 'x')
const SHOTS = arg('shots', '/tmp/claude-1000/rawprev')
const { browser, page, projectId } = await seedAndOpen({ base: BASE, api: API, db: DB })
const results = []
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' - ' + d : ''}`) }
await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
await page.locator('[data-card-id="n-night"]').waitFor({ timeout: 30000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${SHOTS}/${TAG}-1-open.png` })
const box = await page.locator('.raw-graph-object-card').filter({ hasText: 'Box' }).first().boundingBox().catch(() => null)
console.log('  info  box card', JSON.stringify(box))
if (box) { await page.mouse.move(box.x + box.width / 2, box.y + 14); await page.mouse.down(); await page.mouse.up() }
await page.waitForTimeout(1200)
await page.screenshot({ path: `${SHOTS}/${TAG}-2-box-selected.png` })
const canvases = async () => page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), cls: c.className, parent: c.parentElement?.className?.slice(0, 40) } }).filter((c) => c.w > 60 && c.h > 60))
const after = await canvases()
console.log('  info  canvases after select', JSON.stringify(after))
const col = await page.locator('[data-testid="raw-settings-column"]').boundingBox().catch(() => null)
const inCol = after.filter((c) => col && c.x >= col.x - 2 && c.x + c.w <= col.x + col.width + 2)
check('A. selecting the Box shows a 3D scene inside the settings column', inCol.length === 1 && inCol[0].h >= 200, JSON.stringify(inCol))
const cardStill = await page.locator('[data-card-id="n-night"]').boundingBox()
check('B. the graph is still visible beside it (first card not under the column)', col && cardStill && cardStill.x + cardStill.width <= col.x, JSON.stringify(cardStill))
check('D. the Box object card draws a picture of the box', (await page.locator('.raw-graph-object-card canvas.raw-card-preview').count()) === 2)
check('D2. the card calls it an object in the scene, not a thing in the room', /an object in the scene/.test((await page.locator('.raw-graph-object-card').first().getAttribute('title')) || ''))
{
    const ball = await page.locator('.raw-graph-object-card').filter({ hasText: 'Ball' }).first().boundingBox()
    await page.mouse.click(ball.x + ball.width / 2, ball.y + 14)
    await page.waitForTimeout(800)
    const px = await page.locator('[data-testid="raw-settings-column"] input').first().inputValue()
    check('F. Position X shows -2.1 for a stored -2.0999999999999', px === '-2.1', `shows ${px}`)
}
const sceneBtn = page.getByRole('button', { name: /^Scene/ }).first()
const sb = await sceneBtn.boundingBox()
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down(); await page.mouse.up()
await page.waitForTimeout(2500)
await page.screenshot({ path: `${SHOTS}/${TAG}-3-scene-button.png` })
check('C. the Scene button still opens the fullscreen room', (await canvases()).some((c) => c.w >= 1500))
console.log('  info  canvases after Scene button', JSON.stringify(await canvases()))
// D: a thing's card draws what it is; E: one real click on a selected Text card's words opens the box
{
    await page.goto(`${BASE}/main/raw/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-card-id="n-pricing"]').waitFor({ timeout: 30000 })
    await page.waitForTimeout(2500)
    const c = await page.locator('[data-card-id="n-pricing"]').boundingBox()
    await page.mouse.click(c.x + 40, c.y + 14)
    await page.waitForTimeout(600)
    const l = await page.locator('[data-card-id="n-pricing"] .raw-graph-node-content-line').first().boundingBox()
    await page.mouse.click(l.x + 20, l.y + 6)
    await page.waitForTimeout(600)
    check('E. a real click on a selected Text card\'s words opens the box in the card', (await page.locator('textarea.raw-graph-node-edit').count()) === 1)
    await page.keyboard.press('Escape')
    // Position X shows no float noise, stored value exact
}

await browser.close()
console.log(results.every(Boolean) ? '\nALL PASS' : '\nFAILED')
process.exit(results.every(Boolean) ? 0 : 1)
