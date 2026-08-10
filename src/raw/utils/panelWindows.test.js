import { describe, expect, it } from 'vitest'
import { selectHiddenPanelNodes } from './panelWindows.js'

const isPanel = (node) => node.render === 'panel-2d'

describe('selectHiddenPanelNodes', () => {
    it('finds panels whose frame is hidden', () => {
        const nodes = [
            { id: 'a', render: 'panel-2d', values: { frame: { visible: false } } },
            { id: 'b', render: 'panel-2d', values: { frame: { visible: true } } },
            { id: 'c', render: 'spatial-3d', values: { frame: { visible: false } } }
        ]
        expect(selectHiddenPanelNodes(nodes, isPanel).map((n) => n.id)).toEqual(['a'])
    })

    // The regression this exists for: it used to read a surface-filtered list,
    // and activeSurface defaults to 'world', which matches no panel type — so a
    // closed window vanished from the palette that is meant to bring it back.
    // Nothing about "which surface am I on" may enter this decision.
    it('does not care which surface is active — a hidden window is always reopenable', () => {
        const nodes = [{ id: 'a', render: 'panel-2d', values: { frame: { visible: false } } }]
        expect(selectHiddenPanelNodes(nodes, isPanel)).toHaveLength(1)
    })

    it('a panel with no frame at all is not hidden', () => {
        expect(selectHiddenPanelNodes([{ id: 'a', render: 'panel-2d' }], isPanel)).toEqual([])
        expect(selectHiddenPanelNodes([{ id: 'a', render: 'panel-2d', values: {} }], isPanel)).toEqual([])
    })

    it('tolerates junk', () => {
        expect(selectHiddenPanelNodes()).toEqual([])
        expect(selectHiddenPanelNodes([null], isPanel)).toEqual([])
    })
})
