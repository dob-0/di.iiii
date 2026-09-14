import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import CardValueViewer from './CardValueViewer.jsx'

const node = { id: 'n1' }
const port = (id = 'out', label = 'Result') => ({ id, label })

describe('CardValueViewer', () => {
    it('reads through readOutput(nodeId, portId) — the one prop the editor supplies', () => {
        const calls = []
        const readOutput = (nodeId, portId) => { calls.push([nodeId, portId]); return 7 }
        render(<CardValueViewer node={node} port={port('a')} kind="number" readOutput={readOutput} />)
        expect(calls).toEqual([['n1', 'a']])
    })

    it('number: shows the formatted value and a sparkline', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="number" readOutput={() => 42} />
        )
        expect(container.querySelector('.raw-card-viewer-value').textContent).toBe('42.0')
        expect(container.querySelector('.raw-card-viewer-sparkline')).toBeTruthy()
        // The sparkline is a <polyline>, never an SVG <path> — see Sparkline.jsx:
        // graphGeometry.test.jsx counts every `svg path` on the surface as a wire.
        expect(container.querySelector('.raw-card-viewer-sparkline path')).toBeNull()
    })

    it('boolean: an on/off lamp', () => {
        const on = render(<CardValueViewer node={node} port={port()} kind="boolean" readOutput={() => true} />)
        expect(on.container.querySelector('.raw-card-viewer-lamp.is-on')).toBeTruthy()
        expect(on.container.textContent).toContain('On')
        on.unmount()

        const off = render(<CardValueViewer node={node} port={port()} kind="boolean" readOutput={() => false} />)
        expect(off.container.querySelector('.raw-card-viewer-lamp.is-on')).toBeNull()
        expect(off.container.textContent).toContain('Off')
    })

    it('signal: a pulse tick plus the value', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="signal" readOutput={() => 3} />
        )
        expect(container.querySelector('.raw-card-viewer-pulse-tick')).toBeTruthy()
        expect(container.textContent).toContain('3.00')
    })

    it('color: a swatch painted with the live hex value', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="color" readOutput={() => '#ff0000'} />
        )
        const swatch = container.querySelector('.raw-card-viewer-swatch')
        expect(swatch.style.background).toBe('rgb(255, 0, 0)')
        expect(container.querySelector('.raw-card-viewer-swatch-value').textContent).toBe('#ff0000')
    })

    it('color: falls back to black rather than crash on a non-hex live value', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="color" readOutput={() => undefined} />
        )
        expect(container.querySelector('.raw-card-viewer-swatch-value').textContent).toBe('#000000')
    })

    it('vec3: three formatted numbers', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="vec3" readOutput={() => [1, 2.5, -3]} />
        )
        const spans = [...container.querySelectorAll('.raw-card-viewer-vec3 span')].map((el) => el.textContent)
        expect(spans).toEqual(['1.00', '2.50', '-3.00'])
    })

    it('string: the live text, two-line clamped by CSS', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="string" readOutput={() => 'hello there'} />
        )
        expect(container.querySelector('.raw-card-viewer-text').textContent).toBe('hello there')
    })

    it('string: an em dash rather than nothing when the value is empty', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="string" readOutput={() => ''} />
        )
        expect(container.querySelector('.raw-card-viewer-text').textContent).toBe('—')
    })

    it('device: shows a published status string as-is', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port('status', 'Status')} kind="device" readOutput={() => 'desk — ready'} />
        )
        expect(container.querySelector('.raw-card-viewer-device').textContent).toBe('desk — ready')
    })

    it('device: an empty status (the unmounted-panel convention) reads as a neutral wait, not an error', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port('status', 'Status')} kind="device" readOutput={() => ''} />
        )
        expect(container.querySelector('.raw-card-viewer-device').textContent).toBe('No report yet')
    })

    it('device: falls back to "label: value" when the only output is numeric', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port('note', 'Note')} kind="device" readOutput={() => 60} />
        )
        expect(container.querySelector('.raw-card-viewer-device').textContent).toBe('Note: 60.0')
    })

    it('is decorative to assistive tech — the card itself carries the accessible name', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="number" readOutput={() => 1} />
        )
        expect(container.querySelector('.raw-card-value-viewer').getAttribute('aria-hidden')).toBe('true')
    })

    it('renders nothing for an unknown kind rather than guessing', () => {
        const { container } = render(
            <CardValueViewer node={node} port={port()} kind="nope" readOutput={() => 1} />
        )
        expect(container.querySelector('.raw-card-value-viewer')).toBeNull()
    })
})
