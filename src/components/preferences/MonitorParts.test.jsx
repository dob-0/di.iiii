import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MonitorParts, { partTone, shortHash } from './MonitorParts.jsx'

const H = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const parts = {
    packedAt: '2026-11-17T10:00:00Z',
    rows: [
        { id: 'light', name: 'Light desk', state: 'ok', detail: 'running', commit: H, date: '2026-11-12' },
        { id: 'studio', name: '3D Studio', state: 'unprobed', detail: 'no live probe', commit: null, date: null },
        { id: 'osc', name: 'OSC', state: 'off', detail: 'not read', commit: H, date: '2026-10-28' }
    ]
}

describe('MonitorParts', () => {
    it('one row per part with state, version, change date and pack date', () => {
        const { container } = render(<MonitorParts parts={parts} />)
        expect(container.querySelectorAll('[data-part]').length).toBe(3)
        expect(container.querySelector('[data-part="light"]').textContent).toContain('a1b2c3d4e')
        expect(container.querySelector('[data-part="light"]').textContent).toContain('changed 2026-11-12 · packed 2026-11-17')
    })
    it('a part with no probe or no stamp says so and is never drawn healthy', () => {
        const { container } = render(<MonitorParts parts={parts} />)
        const studio = container.querySelector('[data-part="studio"]')
        expect(studio.textContent).toContain('no live probe')
        expect(studio.textContent).toContain('version unknown (not stamped)')
        expect(studio.className).not.toContain('tone-success')
        expect(container.querySelector('[data-part="osc"]').className).toContain('tone-warning')
    })
    it('an older server with no parts block shows a note, not an empty grid', () => {
        const { container } = render(<MonitorParts parts={undefined} />)
        expect(container.querySelector('[data-parts-empty]')).toBeTruthy()
        expect(container.querySelector('[data-monitor-parts]')).toBeNull()
    })
    it('helpers', () => {
        expect(partTone('weird')).toBe('muted')
        expect(shortHash('not a hash')).toBeNull()
    })
})
