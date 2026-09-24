import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

const useTopNetwork = vi.fn(() => ({ error: '' }))
vi.mock('../project/tops/useTopNetwork.js', () => ({ useTopNetwork: (options) => useTopNetwork(options) }))
const { default: MapSourceView } = await import('./MapSourceView.jsx')

describe('a Pictures surface on the wall', () => {
    it("hands the network the project's own files, so a Clip In finds its video", () => {
        // Without these the clip resolved against the SPACE's assets and every
        // clip on /map/…/out answered 404: a black wall behind a working deck.
        const network = { nodes: [{ id: 'out1', type: 'top.out' }], wires: [] }
        const assets = [{ id: 'a1', name: 'dusk_01.mp4' }]
        const surface = normalizeMappingSurface({ id: 's1', resolution: [640, 360], source: { kind: 'network', ref: 'out1' } })
        render(<MapSourceView surface={surface} spaceId="lab" network={network} assets={assets} projectId="p1" live />)
        expect(useTopNetwork).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'lab', assets, projectId: 'p1' }))
    })
})
