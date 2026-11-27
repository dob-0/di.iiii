import { describe, it, expect } from 'vitest'
import { checkSimTarget } from './tools/simGuard.mjs'

const LS = `  apc40-full2          scratch   web :5358  api :4327
  admin-header       frontend  web :5306  api -
  admin-mdid         scratch   web :5346  api :4333`

describe('the APC40 simulation refuses anything but a di-dev scratch tree', () => {
  it('allows a scratch tree web port', () => { expect(checkSimTarget('http://127.0.0.1:5358/light/', LS)).toBe(null) })
  it('refuses the installed desk and shared hosts', () => {
    expect(checkSimTarget('http://diiii.localhost/light/', LS)).toMatch(/refused/)
    expect(checkSimTarget('https://dev.diiii.xyz/light/', LS)).toMatch(/refused/)
    expect(checkSimTarget('https://local.thedi.studio/light/', LS)).toMatch(/refused/)
  })
  it('refuses a frontend-only tree (it talks to the installed database) and an unknown port', () => {
    expect(checkSimTarget('http://127.0.0.1:5306/light/', LS)).toMatch(/refused/)
    expect(checkSimTarget('http://127.0.0.1:9999/light/', LS)).toMatch(/refused/)
    expect(checkSimTarget('http://127.0.0.1/light/', LS)).toMatch(/refused/)
  })
  it('refuses a non-URL', () => { expect(checkSimTarget('nonsense', LS)).toMatch(/not a URL/) })
})
