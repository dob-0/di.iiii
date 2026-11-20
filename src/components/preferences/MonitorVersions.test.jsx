import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MonitorVersions from './MonitorVersions.jsx'

const A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const B = 'b1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const snap = {
  tiers: { rows: [{ id: 'dev', commit: A, builtAt: '2026-11-20T10:00:00Z', status: 200, behindDev: 0 }, { id: 'local:aylmo', commit: B, status: 200, behindDev: 2 }] },
  parts: {
    packedAt: '2026-11-20T09:00:00Z',
    rows: [
      { id: 'light', name: 'Light desk', state: 'ok', works: 'working', detail: 'running', commit: A, date: '2026-11-20', proven: { commit: A, date: '2026-11-20', at: 1 },
        history: [{ commit: A, date: '2026-11-20', title: 'light: fix (#1303)', pr: 1303 }, { commit: B, date: '2026-11-12', title: 'light: older', pr: null }] },
      { id: 'map', name: 'Mapping desk', state: 'unprobed', works: 'unknown', detail: 'no live probe', commit: null, date: null, history: [], proven: null }
    ]
  }
}

describe('MonitorVersions', () => {
  it('shows machines against dev and one card per part with past versions newest first', () => {
    const { container } = render(<MonitorVersions snap={snap} />)
    expect(container.querySelectorAll('[data-machine-version]').length).toBe(2)
    expect(container.querySelector('[data-machine-version="local:aylmo"]').textContent).toContain('2 behind dev')
    const light = container.querySelector('[data-part-versions="light"]')
    expect([...light.querySelectorAll('[data-version]')].map((e) => e.getAttribute('data-version'))).toEqual(['a1b2c3d4e', 'b1b2c3d4e'])
    expect(light.textContent).toContain('running')
    expect(light.textContent).toContain('seen working')
    expect(light.querySelector('a').getAttribute('href')).toBe('https://github.com/dob-0/di.iiii/pull/1303')
    expect(light.querySelector('a').getAttribute('rel')).toContain('noopener')
  })
  it('a part with no probe and no history says unknown, never working', () => {
    const { container } = render(<MonitorVersions snap={snap} />)
    const map = container.querySelector('[data-part-versions="map"]')
    expect(map.getAttribute('data-works')).toBe('unknown')
    expect(map.textContent).toContain('latest version unknown (not stamped)')
    expect(map.textContent).toContain('never seen working')
    expect(map.textContent).toContain('No past versions recorded')
    expect(map.className).not.toContain('tone-success')
  })
  it('filters by text and says so when nothing matches; an empty snapshot says so', () => {
    const { container, rerender } = render(<MonitorVersions snap={snap} query="mapping" />)
    expect(container.querySelectorAll('[data-part-versions]').length).toBe(1)
    rerender(<MonitorVersions snap={snap} query="zzzz" />)
    expect(container.textContent).toContain('No version matches')
    rerender(<MonitorVersions snap={{}} />)
    expect(container.querySelector('[data-versions-empty]')).toBeTruthy()
  })
})
