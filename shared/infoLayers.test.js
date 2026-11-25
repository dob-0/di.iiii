import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const L = createRequire(import.meta.url)('./infoLayers.cjs')

describe('info layers', () => {
  it('has the three layers, personal first', () => {
    expect(L.LAYERS).toEqual(['personal', 'private', 'di.iiii'])
  })
  it('puts chats and credits in personal and the other ten panels in private', () => {
    expect(['chats', 'credits'].map(L.panelLayer)).toEqual(['personal', 'personal'])
    const privates = ['machines', 'network', 'agents', 'presence', 'connected', 'services', 'spaces', 'pullRequests', 'tasks', 'shows']
    for (const name of privates) expect(L.panelLayer(name)).toBe('private')
    expect(Object.keys(L.PANEL_LAYER)).toHaveLength(12)
  })
  it('treats an unknown or inherited name as personal', () => {
    expect(L.panelLayer('brandNewPanel')).toBe('personal')
    expect(L.panelLayer('constructor')).toBe('personal')
    expect(L.panelLayer(undefined)).toBe('personal')
  })
  it('puts a phone or tablet row in personal and a studio machine in private', () => {
    for (const os of ['android', 'iOS', 'iPadOS']) expect(L.machineRowLayer({ os })).toBe('personal')
    for (const os of ['linux', 'macOS', 'windows', '', undefined]) expect(L.machineRowLayer({ os })).toBe('private')
  })
  it('tags every panel and machine row without changing the input', () => {
    const input = { machines: { ok: true, rows: [{ id: 'a', os: 'linux' }, { id: 'b', os: 'android' }] }, chats: { ok: true, rows: [] }, fresh: { ok: true } }
    const frozen = JSON.stringify(input)
    const out = L.tagPanels(input)
    expect(JSON.stringify(input)).toBe(frozen)
    expect(out.machines.layer).toBe('private')
    expect(out.machines.rows.map((r) => r.layer)).toEqual(['private', 'personal'])
    expect(out.chats.layer).toBe('personal')
    expect(out.fresh.layer).toBe('personal')
  })
})
