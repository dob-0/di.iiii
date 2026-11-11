

describe('every outline can be drawn', () => {
    it('each shape has its own path (none falls back to the cross)', async () => {
        const { SHAPES, shapePath } = await import('./plotSymbols.js')
        const paths = SHAPES.map((sh) => shapePath(sh, 0, 0, 1))
        expect(new Set(paths).size).toBe(SHAPES.length)
    })
})
