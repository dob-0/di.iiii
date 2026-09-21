// @vitest-environment node

// The name rule is the security boundary of this lane: a client sends a STRING, and the
// only thing it can ever select is an entry the NDI finder itself discovered. Same rule
// as `matchStreamDevice` in src/map/MapSourceView.jsx — if that one changes, change both.
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { matchSourceName } = require('./names.js')

const SOURCES = [
  { name: 'AYLMO (td_out_windows)', address: '10.10.10.2:5961' },
  { name: 'WIN (OBS)', address: '10.10.10.3:5961' },
  { name: 'td', address: '10.10.10.4:5961' }
]

describe('matching a source by name', () => {
  it('prefers an exact case-insensitive name over any partial one', () => {
    // "td" is contained in "AYLMO (td_out_windows)" too — the exact source must win.
    expect(matchSourceName(SOURCES, 'td').address).toBe('10.10.10.4:5961')
    expect(matchSourceName(SOURCES, 'TD').address).toBe('10.10.10.4:5961')
    expect(matchSourceName(SOURCES, '  td  ').address).toBe('10.10.10.4:5961')
  })

  it('then falls back to "contains", so a fragment is enough', () => {
    expect(matchSourceName(SOURCES, 'td_out').name).toBe('AYLMO (td_out_windows)')
    expect(matchSourceName(SOURCES, 'obs').name).toBe('WIN (OBS)')
    expect(matchSourceName(SOURCES, 'aylmo').name).toBe('AYLMO (td_out_windows)')
  })

  it('returns null rather than guessing', () => {
    expect(matchSourceName(SOURCES, 'resolume')).toBeNull()
    expect(matchSourceName(SOURCES, '')).toBeNull()
    expect(matchSourceName(SOURCES, '   ')).toBeNull()
    expect(matchSourceName([], 'td')).toBeNull()
    expect(matchSourceName(undefined, 'td')).toBeNull()
  })

  it('can never invent an address: an IP a client names matches nothing', () => {
    // The one thing this must not do is let "10.10.10.9:5961" become a connection.
    expect(matchSourceName(SOURCES, '10.10.10.9:5961')).toBeNull()
    // Even an address that IS in the list selects nothing — only names are matched.
    expect(matchSourceName(SOURCES, '10.10.10.2:5961')).toBeNull()
  })
})
