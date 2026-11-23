import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MonitorShared from './MonitorShared.jsx'

const data = {
  machines: [{ host: 'aylmo', reportedAt: new Date().toISOString(), stale: false, commit: 'abcdef1234567' }, { host: 'studio-mac', reportedAt: '2026-11-20T00:00:00Z', stale: true, commit: null }],
  pullRequests: { ok: true, from: 'aylmo', rows: [{ number: 12, title: 'Fix the lamp', draft: false }, { number: 13, title: 'Wip thing', draft: true }] },
  spaces: { ok: true, rows: [{ tier: 'dev', slug: 'alpha', visibility: 'public' }] },
  shows: [{ machine: 'aylmo', id: 's1', title: 'MUTH' }],
  asks: { ok: true, rows: [{ id: 'N1', state: 'NEW', text: 'do it' }] },
  tasks: []
}

describe('MonitorShared', () => {
  it('shows every shared box from dev with machines, versions, PRs, spaces, shows and asks', () => {
    const { container } = render(<MonitorShared shared={{ state: 'ok', at: new Date().toISOString(), data }} />)
    expect(container.querySelector('[data-shared-machine="aylmo"]').textContent).toContain('abcdef1')
    expect(container.querySelector('[data-shared-machine="studio-mac"]').textContent).toContain('quiet')
    expect(container.querySelector('[data-shared-pr="13"]').textContent).toContain('draft')
    expect(container.querySelector('[data-shared-box="prs"] h3').textContent).toContain('via aylmo')
    expect(container.querySelector('[data-shared-space="dev/alpha"]')).toBeTruthy()
    expect(container.querySelector('[data-shared-show="s1"]').textContent).toContain('MUTH')
    expect(container.querySelector('[data-shared-ask="N1"]')).toBeTruthy()
    expect(container.querySelector('[data-shared-box="tasks"]').textContent).toContain('Nothing reported')
  })

  it('dev not answering keeps the last good picture, marked old with its time', () => {
    const { container } = render(<MonitorShared shared={{ state: 'offline', lastGoodAt: new Date(Date.now() - 600000).toISOString(), data }} />)
    expect(container.querySelector('[data-shared-note="offline"]').textContent).toMatch(/Dev is not answering: showing the last good picture from 10m ago/)
    expect(container.querySelector('.monitor-shared').className).toContain('is-old')
    expect(container.querySelectorAll('[data-shared-pr]').length).toBe(2)
  })

  it('no picture yet, signed out, refused: says so and shows no boxes; a filter narrows rows', () => {
    const none = render(<MonitorShared shared={{ state: 'offline', data: null }} />)
    expect(none.container.textContent).toContain('no picture was read yet')
    expect(none.container.querySelector('[data-shared-box]')).toBeNull()
    expect(render(<MonitorShared shared={{ state: 'signed-out', data: null }} />).container.textContent).toContain('di login')
    expect(render(<MonitorShared shared={{ state: 'refused', data: null }} />).container.textContent).toContain('owner only')
    const q = render(<MonitorShared shared={{ state: 'ok', at: new Date().toISOString(), data }} query="lamp" />)
    expect(q.container.querySelectorAll('[data-shared-pr]').length).toBe(1)
  })

  it('a server without the feed (dev itself) says it has none', () => {
    expect(render(<MonitorShared shared={null} />).container.textContent).toContain('this server has none')
  })
})
