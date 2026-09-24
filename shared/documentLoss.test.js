// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { assetRefsOf, diffDocumentLoss, combineLoss, describeLoss, parseAcceptLoss, lossGate } = require('./documentLoss.cjs')

const hex = (n) => n.toString(16).padStart(64, '0')
const image = (i) => ({ id: `slide-${i}`, type: 'image', name: `Slide ${i}`, components: { media: { assetId: hex(i + 1) } } })
const text = (i) => ({ id: `text-${i}`, type: 'text', name: `Text ${i}`, components: { text: { value: 'hello' } } })
const box = (i) => ({ id: `box-${i}`, type: 'box', name: `Box ${i}`, components: {} })

// The front room as it was on 2026-09-16: 76 slides of the portfolio deck and
// nine other things. What dev held two days later: the nine.
const incidentDocuments = () => {
    const nine = [...Array.from({ length: 5 }, (_, i) => text(i)), ...Array.from({ length: 4 }, (_, i) => box(i))]
    return {
        prod: { projectMeta: { id: 'main-dii-project' }, entities: [...Array.from({ length: 76 }, (_, i) => image(i)), ...nine] },
        dev: { projectMeta: { id: 'main-dii-project' }, entities: nine }
    }
}

describe('documentLoss — what a whole replace destroys', () => {
    it('the 2026-09-18 incident: 85 → 9 names 76 media items lost, all images', () => {
        const { prod, dev } = incidentDocuments()
        const loss = diffDocumentLoss(prod, dev)
        expect(loss.before).toBe(85)
        expect(loss.after).toBe(9)
        expect(loss.removed).toHaveLength(76)
        expect(loss.mediaLost).toBe(76)
        expect(loss.mediaByType).toEqual({ image: 76 })
        const words = describeLoss(loss, 'prod main-dii-project')
        expect(words).toContain('prod main-dii-project: this replace REMOVES 76 of 85 items — 76 image (media)')
        expect(words).toContain('"Slide 0"')
        expect(words).toContain('… and 56 more')
    })

    it('refuses without --accept-loss, refuses a wrong number, allows the exact one', () => {
        const { prod, dev } = incidentDocuments()
        const { mediaLost } = diffDocumentLoss(prod, dev)
        expect(lossGate({ mediaLost }).ok).toBe(false)
        expect(lossGate({ mediaLost }).message).toContain('--accept-loss 76')
        expect(lossGate({ mediaLost, acceptLoss: 75 }).ok).toBe(false)
        expect(lossGate({ mediaLost, acceptLoss: 75 }).message).toContain('does not match the 76')
        expect(lossGate({ mediaLost, acceptLoss: 77 }).ok).toBe(false)
        expect(lossGate({ mediaLost, acceptLoss: NaN }).ok).toBe(false)
        expect(lossGate({ mediaLost, acceptLoss: 76 }).ok).toBe(true)
    })

    it('non-media removals are shown, never blocked', () => {
        const loss = diffDocumentLoss({ entities: [text(1), box(1), image(1)] }, { entities: [image(1)] })
        expect(loss.removed).toHaveLength(2)
        expect(loss.mediaLost).toBe(0)
        expect(lossGate({ mediaLost: loss.mediaLost }).ok).toBe(true)
        expect(describeLoss(loss, 'x')).toContain('REMOVES 2 of 3 items — 1 box, 1 text')
    })

    it('an entity of any type that points at a file is media; a changed file is reported', () => {
        const textured = { id: 'wall', type: 'box', name: 'Wall', components: { appearance: { textureAssetId: hex(9) } } }
        const node = { id: 'n1', typeId: 'media.image', label: 'Poster', assetRef: hex(10) }
        const page = { id: 'p1', type: 'html', name: 'Page', components: { html: { src: `/api/projects/x/assets/${hex(11)}` } } }
        expect(assetRefsOf(textured)).toEqual([hex(9)])
        expect(assetRefsOf(page)).toEqual([hex(11)])
        const lost = diffDocumentLoss({ entities: [textured, page], nodes: [node] }, { entities: [], nodes: [] })
        expect(lost.mediaLost).toBe(3)

        const moved = diffDocumentLoss({ entities: [image(1)] }, { entities: [{ ...image(1), components: { media: { assetId: hex(99) } } }] })
        expect(moved.mediaLost).toBe(0)
        expect(moved.assetChanged).toHaveLength(1)
        expect(describeLoss(moved, 'x')).toContain('will point at a different file')
    })

    it('the same picture under a new id is not a loss', () => {
        const loss = diffDocumentLoss({ entities: [image(1), image(2)] }, { entities: [{ ...image(1), id: 'renamed' }] })
        expect(loss.reidentified).toHaveLength(1)
        expect(loss.mediaLost).toBe(1)
    })

    it('nothing there yet means nothing lost', () => {
        const { prod } = incidentDocuments()
        const loss = diffDocumentLoss(null, prod)
        expect(loss.mediaLost).toBe(0)
        expect(describeLoss(loss, 'local')).toContain('nothing is removed (0 → 85 items)')
    })

    it('adds several replaces into one number', () => {
        const { prod, dev } = incidentDocuments()
        const total = combineLoss([
            { label: 'a', loss: diffDocumentLoss(prod, dev) },
            { label: 'b', loss: diffDocumentLoss({ entities: [image(1)] }, { entities: [] }) }
        ])
        expect(total.mediaLost).toBe(77)
    })

    it('parses --accept-loss both ways; a non-number never matches', () => {
        expect(parseAcceptLoss(['x', '--accept-loss', '76'])).toBe(76)
        expect(parseAcceptLoss(['--accept-loss=3'])).toBe(3)
        expect(parseAcceptLoss(['--force'])).toBe(null)
        expect(parseAcceptLoss(['--accept-loss'])).toBeNaN()
        expect(parseAcceptLoss(['--accept-loss', 'all'])).toBeNaN()
    })
})
