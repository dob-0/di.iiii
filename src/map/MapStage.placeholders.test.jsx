import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import MapStage from './MapStage.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

// Owner, 2026-11-11 (N3689): an empty surface on the wall showed its name card
// ("Surface 1") mid-show — "just black or nothing better than the surface 1".
// The desk keeps the card; the output draws nothing.
const mapping = {
    background: '#000000',
    surfaces: [
        normalizeMappingSurface({
            id: 's1',
            name: 'Surface 1',
            resolution: [640, 360],
            source: { kind: 'network', ref: '' }
        })
    ]
}

describe('MapStage placeholders', () => {
    it('shows the name card on the desk by default', () => {
        const { container } = render(<MapStage mapping={mapping} width={640} height={360} />)
        expect(container.querySelector('.map-source-placeholder')).not.toBeNull()
        expect(container.textContent).toContain('Surface 1')
    })

    it('draws nothing for an empty surface on the output', () => {
        const { container } = render(
            <MapStage mapping={mapping} width={640} height={360} placeholders={false} />
        )
        expect(container.querySelector('.map-source-placeholder')).toBeNull()
        expect(container.textContent).not.toContain('Surface 1')
        expect(container.querySelector('.map-stage').style.background).toMatch(
            /#000000|rgb\(0, 0, 0\)/
        )
    })
})
