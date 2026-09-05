import { describe, it, expect, vi, beforeEach } from 'vitest'

// pdfjs is imported lazily inside pdfToImageFiles; the mock stands in for the
// whole module so the test never needs a worker or a real canvas.
const destroy = vi.fn(async () => {})
const render = vi.fn(() => ({ promise: Promise.resolve() }))
vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    getDocument: vi.fn(() => ({
        destroy,
        promise: Promise.resolve({
            numPages: 2,
            // no destroy() here on purpose — the real PDFDocumentProxy has none
            getPage: async () => ({ getViewport: () => ({ width: 10, height: 20 }), render })
        })
    }))
}))

import { pdfToImageFiles } from './assetFormats.js'

describe('pdfToImageFiles', () => {
    beforeEach(() => {
        destroy.mockClear()
        HTMLCanvasElement.prototype.getContext = () => ({})
        HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new Blob(['png'], { type: 'image/png' })) }
    })

    it('returns one PNG file per page and destroys the LOADING TASK, not the document', async () => {
        const files = await pdfToImageFiles(new File(['%PDF'], 'deck.pdf', { type: 'application/pdf' }))
        expect(files.map((f) => f.name)).toEqual(['deck-p1.png', 'deck-p2.png'])
        expect(files.every((f) => f.type === 'image/png')).toBe(true)
        expect(render).toHaveBeenCalledTimes(2)
        expect(destroy).toHaveBeenCalledTimes(1)
    })

    it('still returns the pages when cleanup throws', async () => {
        destroy.mockImplementationOnce(async () => { throw new Error('worker already gone') })
        const files = await pdfToImageFiles(new File(['%PDF'], 'deck.pdf', { type: 'application/pdf' }))
        expect(files).toHaveLength(2)
    })
})
