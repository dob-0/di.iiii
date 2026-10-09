// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  COOLDOWN_MS, showCuesOf, whoIs, chooserLabel, cleanName, chooseBlock, decideChoose, liveOf, sanitizeControl, colourWord, favouritesOf, checkFavourites
} = require('./showRemote')
const { hasRequiredAuthRole, canAccessSpace } = require('../authAccess')

// MOXIR v1.0's shape (spaces/moxir/projects/moxir-v1-0, 2026-10-08): the looks on the
// rig-show entity, the cues in mappingState naming them as rig-<look>.
const EMBER = '#ff3a12'
const ASH = '#e8e4dc'
const lasers = (on) => Object.fromEntries(['1a', '6a'].map((b) => [`named-v1-laser-${b}/ext-lc-ultra-mk2`, on.includes(b) ? 1 : 0]))
const moxir = () => ({
  entities: [{
    id: 'rig-show',
    components: {
      rigLooks: {
        looks: [
          { id: 'black', title: 'The black', intent: 'Nothing lit; the smoke stays. 3-5 s before every laser moment and before the roof.', aims: {}, colours: { 'p1/up-pl5403': ASH }, levels: { 'p1/up-pl5403': 0, ...lasers([]) } },
          { id: 'still-smoking', title: 'Still smoking', intent: '', aims: {}, colours: { 'p1/up-pl5403': EMBER, 'p2/up-pl5403': EMBER, 'p3/up-pl5403': '#a3200c' }, levels: { 'p1/up-pl5403': 1, 'p2/up-pl5403': 0.5, 'p3/up-pl5403': 1, ...lasers([]) } },
          { id: 'one-line', title: 'One line', intent: '', aims: {}, colours: {}, levels: { ...lasers(['6a']) } },
          { id: 'ash-falling', title: 'Ash falling (the breakdown)', intent: '', aims: {}, colours: { 'p1/up-pl5403': ASH }, levels: { 'p1/up-pl5403': 1, ...lasers([]) } }
        ]
      }
    }
  }],
  mappingState: {
    loop: true,
    showEpoch: 1790000000000,
    cues: [
      { id: 'v1-01-still-smoking', name: 'Act 1 · still smoking', fade: 6, hold: 20, lightLook: 'rig-still-smoking' },
      { id: 'v1-02-one-line', name: 'Act 1 · one line', fade: 4, hold: 20, lightLook: 'rig-one-line' },
      { id: 'v1-05-black', name: 'the black', fade: 0, hold: 4, lightLook: 'rig-black' },
      { id: 'v1-12-ash-falling', name: 'Act 3 · ash falling', fade: 1, hold: 16, lightLook: 'rig-ash-falling' },
      { id: 'v1-99-gone', name: 'Act 4 · a look nobody wrote', fade: 0, hold: 10, lightLook: 'rig-not-in-the-document' },
      { id: 'map-only', name: 'a wall cue with no light', fade: 0, hold: 3 }
    ]
  }
})

describe('the cue list as the show page shows it', () => {
  const cues = showCuesOf(moxir())

  it('keeps only cues that fire a look, in order, with the act their own name gives', () => {
    expect(cues.map((c) => c.id)).toEqual(['v1-01-still-smoking', 'v1-02-one-line', 'v1-05-black', 'v1-12-ash-falling', 'v1-99-gone'])
    expect(cues.map((c) => c.act)).toEqual(['1', '1', null, '3', '4'])
    expect(cues[0].title).toBe('still smoking')
  })

  it('marks the laser moments — a lit laser, and a look the server cannot read', () => {
    expect(cues.map((c) => c.laser)).toEqual([null, 'lit', null, null, 'unread'])
  })

  it('draws the swatch from the colours the look lights, most used first, and names them', () => {
    expect(cues[0].swatch).toEqual([{ hex: EMBER, word: 'ember' }, { hex: '#a3200c', word: 'ember' }])
    expect(cues[2].swatch).toEqual([]) // the black lights nothing
    expect(cues[3].swatch).toEqual([{ hex: ASH, word: 'ash' }])
    expect(colourWord('#9c978d')).toBe('ash')
    expect(colourWord('#2040ff')).toBe(null)
  })

  it('writes one line from the data only: the intent, else the aside in the title, then the hold', () => {
    expect(cues[2].line).toBe('Nothing lit; the smoke stays. · holds 4 s')
    expect(cues[3].line).toBe('the breakdown · holds 16 s')
    expect(cues[0].line).toBe('holds 20 s')
  })
})

describe('who is asking', () => {
  const base = { spaceId: 'moxir', requireAuth: true, canAccessSpace, hasRequiredAuthRole, isOwnerOrAdmin: (s, meta) => s.type === 'session' && meta.ownerUserId === s.subject }
  const meta = { id: 'moxir', ownerUserId: 'u-owner', isPublic: false }

  it('the owner, an admin and the person at the machine are the operator', () => {
    expect(whoIs({ ...base, meta, state: { authenticated: true, type: 'session', role: 'editor', subject: 'u-owner', spaces: ['moxir'] } })).toBe('operator')
    expect(whoIs({ ...base, meta, state: { authenticated: true, type: 'token', role: 'admin', subject: 'admin' } })).toBe('operator')
    expect(whoIs({ ...base, meta, state: { authenticated: true, type: 'session', role: 'admin', subject: 'local-owner', isUnrestricted: true } })).toBe('operator')
  })

  it('an editor in the space\'s scope is a member; out of scope sees only a public space', () => {
    expect(whoIs({ ...base, meta, state: { authenticated: true, type: 'session', role: 'editor', subject: 'u-2', spaces: ['moxir'] } })).toBe('member')
    expect(whoIs({ ...base, meta, state: { authenticated: true, type: 'session', role: 'editor', subject: 'u-3', spaces: ['other'] } })).toBe(null)
    expect(whoIs({ ...base, meta: { ...meta, isPublic: true }, state: { authenticated: true, type: 'session', role: 'editor', subject: 'u-3', spaces: ['other'] } })).toBe('visitor')
    expect(whoIs({ ...base, meta: { ...meta, isPublic: true }, state: { authenticated: false } })).toBe('visitor')
    expect(whoIs({ ...base, meta, state: { authenticated: false } })).toBe(null)
  })

  it('a viewer in scope sees and is not a member', () => {
    expect(whoIs({ ...base, meta, state: { authenticated: true, type: 'token', role: 'viewer', subject: 'v', spaces: ['moxir'] } })).toBe('visitor')
  })

  it('with sign-in off everyone is the operator — what auth off has always meant here', () => {
    expect(whoIs({ ...base, requireAuth: false, meta, state: { authenticated: true, type: 'disabled', role: 'admin' } })).toBe('operator')
  })
})

describe('the label everyone sees for who chose', () => {
  it('never shows an email', () => {
    expect(chooserLabel({ who: 'member', state: { authenticated: true, type: 'session', subject: 'u-2', label: 'ani@example.com' } })).toBe('ani')
  })
  it('a guest\'s typed name in any script, cleaned; with none, a plain word', () => {
    expect(cleanName('  Անի <script> ')).toBe('Անի script')
    expect(chooserLabel({ who: 'visitor', state: { authenticated: true, type: 'session', subject: 'guest:abc' }, typedName: 'Անի' })).toBe('Անի')
    expect(chooserLabel({ who: 'visitor', state: {} })).toBe('someone here')
    expect(chooserLabel({ who: 'operator', state: { authenticated: true, type: 'session', subject: 'local-owner', label: 'This machine' } })).toBe('the operator')
  })
})

describe('choosing a cue', () => {
  const document = moxir()
  const cues = showCuesOf(document)
  const now = 1_800_000_000_000
  const light = (over = {}) => ({ runtime: true, showSpace: 'moxir', runner: null, hasLook: () => true, ...over })
  const ask = (over = {}) => decideChoose({ who: 'member', control: sanitizeControl(null), now, cues, index: 0, cueId: cues[0].id, document, spaceId: 'moxir', projectId: 'moxir-v1-0', light: light(), ...over })

  it('a member chooses; Light is handed this project\'s list first when it holds none', () => {
    const out = ask()
    expect(out.ok).toBe(true)
    expect(out.load.keepIndex).toBe(false)
    expect(out.load.loop).toBe(true)
    expect(out.load.list.map((c) => c.lookId)).toEqual(['rig-still-smoking', 'rig-one-line', 'rig-black', 'rig-ash-falling', 'rig-not-in-the-document'])
  })

  it('NEVER a laser moment — not for the operator, not with choosing open to everyone', () => {
    for (const who of ['operator', 'member', 'visitor']) {
      const out = ask({ who, index: 1, cueId: cues[1].id, control: sanitizeControl({ choosers: 'everyone' }) })
      expect(out).toMatchObject({ ok: false, status: 403, code: 'laser' })
      expect(out.error).toMatch(/^Laser moment — operator only/)
    }
    expect(ask({ who: 'operator', index: 4, cueId: cues[4].id })).toMatchObject({ ok: false, code: 'laser' })
  })

  it('the setting defaults to the team: a visitor sees and does not choose', () => {
    expect(sanitizeControl(null).choosers).toBe('team')
    expect(sanitizeControl({ choosers: 'nonsense' }).choosers).toBe('team')
    expect(ask({ who: 'visitor' })).toMatchObject({ ok: false, status: 403, code: 'team-only' })
    expect(ask({ who: null })).toMatchObject({ ok: false, code: 'not-allowed' })
  })

  it('everyone: a visitor chooses too', () => {
    expect(ask({ who: 'visitor', control: sanitizeControl({ choosers: 'everyone' }) }).ok).toBe(true)
  })

  it('operator only: the operator still chooses, nobody else does', () => {
    const control = sanitizeControl({ choosers: 'operator' })
    expect(ask({ who: 'member', control })).toMatchObject({ ok: false, status: 423, code: 'operator-only' })
    expect(ask({ who: 'visitor', control })).toMatchObject({ code: 'operator-only' })
    expect(ask({ who: 'operator', control }).ok).toBe(true)
  })

  it('one choice per cooldown, for everybody', () => {
    const control = sanitizeControl({ last: { index: 0, cueId: 'x', by: 'a', at: now - COOLDOWN_MS + 3000 } })
    for (const who of ['operator', 'member']) {
      const out = ask({ who, control })
      expect(out).toMatchObject({ ok: false, status: 429, code: 'cooldown' })
      expect(out.error).toMatch(/Next choice in 3 s/)
    }
    expect(ask({ control: sanitizeControl({ last: { index: 0, cueId: 'x', by: 'a', at: now - COOLDOWN_MS } }) }).ok).toBe(true)
  })

  it('refuses a stale card instead of firing a different cue', () => {
    expect(ask({ cueId: 'v1-something-else' })).toMatchObject({ ok: false, status: 409, code: 'list-changed' })
    expect(ask({ index: 99 })).toMatchObject({ ok: false, status: 404 })
  })

  it('says why Light cannot take it', () => {
    expect(ask({ light: { runtime: false } })).toMatchObject({ code: 'no-light' })
    expect(ask({ light: light({ showSpace: 'other' }) })).toMatchObject({ code: 'other-show' })
    expect(ask({ light: light({ runner: { project: 'another', running: true, list: [{}] } }) })).toMatchObject({ code: 'other-list' })
    expect(ask({ light: light({ hasLook: () => false }) })).toMatchObject({ code: 'not-on-light' })
    expect(ask({ document: { ...document, mappingState: { ...document.mappingState, showSource: 'clock' } } })).toMatchObject({ code: 'clock' })
  })

  it('this project\'s list already on Light: no reload, or a reload that keeps its place when the list changed', () => {
    const list = require('./showRemote').deskListOf(document)
    expect(ask({ light: light({ runner: { project: 'moxir-v1-0', running: true, list } }) }).load).toBe(null)
    expect(ask({ light: light({ runner: { project: 'moxir-v1-0', running: true, list: list.slice(1) } }) }).load).toMatchObject({ keepIndex: true })
  })

  it('the block the page shows is the same rule', () => {
    expect(chooseBlock({ who: 'visitor', control: sanitizeControl(null), now })).toBe('team-only')
    expect(chooseBlock({ who: 'operator', control: sanitizeControl({ choosers: 'operator' }), now })).toBe('')
  })
})

describe('the live cue', () => {
  const cues = showCuesOf(moxir())
  const runner = { project: 'moxir-v1-0', n: 5, index: 3, name: 'Act 3 · ash falling', running: true, loop: true, nextInMs: 9000, firedAt: 5000, missing: [] }

  it('says who chose it only for the firing that choice made', () => {
    expect(liveOf({ runner, projectId: 'moxir-v1-0', control: { last: { index: 3, by: 'Անի', at: 4990 } }, cues }).by).toBe('Անի')
    expect(liveOf({ runner: { ...runner, firedAt: 25_000 }, projectId: 'moxir-v1-0', control: { last: { index: 3, by: 'Անի', at: 4990 } }, cues }).by).toBe(null)
  })

  it('what is next: only while "play in order" is on - a chosen scene holds, nothing is next', () => {
    expect(liveOf({ runner, projectId: 'moxir-v1-0', control: {}, cues }).nextIndex).toBe(-1)
    runner.autoplay = true
    expect(liveOf({ runner, projectId: 'moxir-v1-0', control: {}, cues }).nextIndex).toBe(4)
    expect(liveOf({ runner: { ...runner, index: 4 }, projectId: 'moxir-v1-0', control: {}, cues }).nextIndex).toBe(0)
    expect(liveOf({ runner: { ...runner, running: false }, projectId: 'moxir-v1-0', control: {}, cues }).nextIndex).toBe(-1)
    runner.autoplay = false
  })

  it('nothing when Light plays another project, or nothing', () => {
    expect(liveOf({ runner: { ...runner, project: 'other' }, projectId: 'moxir-v1-0', control: {}, cues })).toBe(null)
    expect(liveOf({ runner: null, projectId: 'moxir-v1-0', control: {}, cues })).toBe(null)
  })
})

describe('the favourite scenes', () => {
  const fc = (n, laser = null) => ({ lookId: `rig-l${n}`, laser })
  const list = [fc(1), fc(2, 'lit'), fc(3), fc(4), fc(5), fc(6), fc(7), { ...fc(3), index: 9 }]
  it('before anyone stars: the first five non-laser looks in list order, a look once', () => {
    expect(favouritesOf(list, null)).toEqual(['rig-l1', 'rig-l3', 'rig-l4', 'rig-l5', 'rig-l6'])
  })
  it('the operator\'s list wins, in his order; looks gone from the show or turned laser drop out', () => {
    expect(favouritesOf(list, ['rig-l7', 'rig-l1'])).toEqual(['rig-l7', 'rig-l1'])
    expect(favouritesOf(list, ['rig-gone', 'rig-l2', 'rig-l4'])).toEqual(['rig-l4'])
    expect(favouritesOf(list, [])).toEqual([])
  })
  it('checkFavourites refuses more than five, repeats, unknown ids and laser scenes', () => {
    expect(checkFavourites(['rig-l1', 'rig-l3'], list)).toEqual({ ok: true, favourites: ['rig-l1', 'rig-l3'] })
    expect(checkFavourites(['rig-l1', 'rig-l3', 'rig-l4', 'rig-l5', 'rig-l6', 'rig-l7'], list).ok).toBe(false)
    expect(checkFavourites(['rig-l1', 'rig-l1'], list).ok).toBe(false)
    expect(checkFavourites(['nope'], list).ok).toBe(false)
    expect(checkFavourites(['rig-l2'], list).ok).toBe(false)
    expect(checkFavourites('rig-l1', list).ok).toBe(false)
  })
  it('sanitizeControl keeps a stored list (<= 5, unique strings) and null as "never starred"', () => {
    expect(sanitizeControl(null).favourites).toBe(null)
    expect(sanitizeControl({ favourites: ['a', 'a', 3, 'b', 'c', 'd', 'e', 'f'] }).favourites).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
