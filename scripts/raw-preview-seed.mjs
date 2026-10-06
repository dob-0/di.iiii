// Seeds the MOCT-like project on a scratch stack and returns a signed-in page
// at 1568x882, DPR 1.25. Shared by verify-raw-preview.mjs and measure-raw-lag.mjs.
import { chromium } from 'playwright'

export const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i === -1 ? fallback : process.argv[i + 1]
}

const pricing = Array.from({ length: 18 }, (_, i) => `Tier ${i + 1}: door ${10 + i} thousand AMD, bar minimum ${5 + i}, guest list closes at ${20 + (i % 4)}:00 sharp`).join('\n')
const list = (id, label, x, y, groups, items) => ({ type: 'createNode', payload: { node: { id, typeId: 'view.list', label, graphX: x, graphY: y, values: { groups, items } } } })
const text = (id, label, x, y, content) => ({ type: 'createNode', payload: { node: { id, typeId: 'view.text', label, graphX: x, graphY: y, values: { content } } } })
const thing = (id, type, name, position) => ({ type: 'createEntity', payload: { entity: { id, type, name, components: { transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, primitive: { size: [1, 1, 1] } } } } })

export const seedAndOpen = async ({ base, api, db }) => {
    // A scratch stack runs with auth disabled ("You are signed in as Auth Disabled"),
    // so there is no account to make; the project is written as that local person.
    const browser = await chromium.launch()
    const context = await browser.newContext({ viewport: { width: 1568, height: 882 }, deviceScaleFactor: 1.25 })
    const page = await context.newPage()
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
    const projectId = `moct-${Date.now().toString(36)}`
    await page.evaluate(async ({ projectId, pricing }) => {
        const send = (url, body) => fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        await send('/serverXR/api/spaces/main/projects', { title: projectId, slug: projectId })
        const doc = await (await fetch(`/serverXR/api/projects/${projectId}/document`, { credentials: 'include' })).json()
        return doc
    }, { projectId, pricing })
    const doc = await page.evaluate(async (projectId) => (await fetch(`/serverXR/api/projects/${projectId}/document`, { credentials: 'include' })).json(), projectId)
    const ops = [
        text('n-night', 'The night', 40, 40, 'Doors at 22:00. Two rooms, one bar, a late set on the roof.'),
        list('n-bar', 'Bar', 300, 40, ['Drinks', 'Staff'], [{ text: 'gin', group: 'Drinks' }, { text: 'tonic', group: 'Drinks' }, { text: 'ice', group: 'Drinks' }, { text: 'Ani', group: 'Staff' }, { text: 'Davit', group: 'Staff' }]),
        list('n-studio', 'Studio', 560, 40, ['Gear'], [{ text: 'projector', group: 'Gear' }, { text: 'laptop', group: 'Gear' }, { text: 'DMX lead', group: 'Gear' }]),
        list('n-across', 'Across the night', 40, 360, ['22:00', '00:00', '02:00'], [{ text: 'doors', group: '22:00' }, { text: 'first set', group: '00:00' }, { text: 'roof', group: '02:00' }]),
        list('n-todo', 'To do', 300, 360, ['Open'], [{ text: 'print flyers', group: 'Open' }, { text: 'confirm DJ', group: 'Open' }, { text: 'insurance', group: 'Open' }, { text: 'wristbands', group: 'Open' }]),
        text('n-pricing', 'Pricing', 560, 360, pricing),
        { type: 'createNode', payload: { node: { id: 'n-cube', typeId: 'geom.cube', label: 'Box', graphX: 40, graphY: 680, values: {} } } },
        { type: 'createNode', payload: { node: { id: 'n-sphere', typeId: 'geom.sphere', label: 'Ball', graphX: 300, graphY: 680, values: {} } } },
        thing('e-box', 'box', 'Box', [0, 0.5, 0]),
        thing('e-ball', 'sphere', 'Ball', [-2.0999999999999, 0.5, 0])
    ]
    const res = await page.evaluate(async ({ projectId, ops, v }) => {
        const r = await fetch(`/serverXR/api/projects/${projectId}/ops`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseVersion: v, ops }) })
        return { status: r.status, body: (await r.text()).slice(0, 300) }
    }, { projectId, ops, v: Number(doc.version) || 0 })
    if (res.status >= 300) throw new Error(`ops ${res.status} ${res.body}`)
    return { browser, context, page, projectId }
}
