// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('./db.js')
const {
  APPLICATION_STATUSES,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication
} = require('./openCallStore.js')

const validInput = (overrides = {}) => ({
  callId: 'beyond_form',
  name: 'Test Applicant',
  email: 'test@example.am',
  phone: '+374 00 000000',
  city: 'Gyumri',
  payload: { why: 'City and Time', experience: ['3D modeling'] },
  ...overrides
})

describe('openCallStore', () => {
  beforeEach(() => { initDb(':memory:') })
  afterEach(() => { closeDb() })

  it('creates an application with status new and returns the public shape', () => {
    const app = createApplication(validInput())
    expect(app.id).toBeTruthy()
    expect(app.callId).toBe('beyond_form')
    expect(app.status).toBe('new')
    expect(app.notes).toBe('')
    expect(app.payload.why).toBe('City and Time')
    expect(getApplication(app.id)).toEqual(app)
  })

  it('rejects missing name, invalid email, and bad call ids', () => {
    expect(() => createApplication(validInput({ name: '  ' }))).toThrow(/name/)
    expect(() => createApplication(validInput({ email: 'not-an-email' }))).toThrow(/email/)
    expect(() => createApplication(validInput({ callId: 'bad id!' }))).toThrow(/call id/)
  })

  it('rejects oversized payloads with status 413', () => {
    let error = null
    try {
      createApplication(validInput({ payload: { about: 'x'.repeat(30000) } }))
    } catch (e) { error = e }
    expect(error?.status).toBe(413)
  })

  it('lists per call, newest first, with optional status filter', () => {
    const a = createApplication(validInput({ name: 'A' }))
    createApplication(validInput({ name: 'B', callId: 'other_call' }))
    const c = createApplication(validInput({ name: 'C' }))
    updateApplication(c.id, { status: 'shortlist' })

    const all = listApplications({ callId: 'beyond_form' })
    expect(all.map((x) => x.name)).toEqual(['C', 'A'])
    expect(listApplications({ callId: 'beyond_form', status: 'shortlist' }).map((x) => x.id)).toEqual([c.id])
    expect(listApplications({ callId: 'other_call' })).toHaveLength(1)
    expect(all.find((x) => x.id === a.id)).toBeTruthy()
  })

  it('updates status and notes, rejecting unknown statuses', () => {
    const app = createApplication(validInput())
    const updated = updateApplication(app.id, { status: 'accepted', notes: 'strong portfolio' })
    expect(updated.status).toBe('accepted')
    expect(updated.notes).toBe('strong portfolio')
    expect(() => updateApplication(app.id, { status: 'maybe' })).toThrow(/status must be one of/)
    expect(APPLICATION_STATUSES).toContain('accepted')
    expect(updateApplication('missing-id', { status: 'accepted' })).toBeNull()
  })

  it('deletes an application and returns null for unknown ids', () => {
    const app = createApplication(validInput())
    const deleted = deleteApplication(app.id)
    expect(deleted.id).toBe(app.id)
    expect(getApplication(app.id)).toBeNull()
    expect(listApplications({ callId: 'beyond_form' })).toHaveLength(0)
    expect(deleteApplication(app.id)).toBeNull()
  })

  // Regression test for audit finding #15: identity fields had no
  // control-character sanitization at all (contrast with
  // inscriptionRoutes.js's cleanLine), unlike every other public write path.
  // Built from String.fromCharCode so the exact control bytes under test
  // are explicit rather than typed as literal characters.
  it('strips control characters and collapses whitespace in single-line identity fields', () => {
    const TAB = String.fromCharCode(9)
    const NEWLINE = String.fromCharCode(10)
    const app = createApplication(validInput({
      name: ['Jane', TAB, NEWLINE, 'Doe'].join(''),
      phone: '+374 00 000000',
      city: 'Gyumri'
    }))
    expect(app.name).toBe('Jane Doe')
    expect(app.phone).toBe('+374 00 000000')
    expect(app.city).toBe('Gyumri')
  })

  // Payload values are genuinely multi-line (a "why participate" essay) -
  // only NUL/other non-printable control chars are stripped; \n and \t
  // (real, legitimate whitespace) survive.
  it('sanitizes payload values without destroying legitimate multi-line text', () => {
    const NUL = String.fromCharCode(0)
    const TAB = String.fromCharCode(9)
    const NEWLINE = String.fromCharCode(10)
    const app = createApplication(validInput({
      payload: {
        why: ['Line one', NEWLINE, 'Line two', TAB, 'tabbed', NUL, 'nulled'].join(''),
        nested: { about: ['Also', NUL, 'here'].join('') },
        list: [['ok', NUL, 'one'].join(''), ['ok', NUL, 'two'].join('')]
      }
    }))
    expect(app.payload.why).toBe(['Line one', NEWLINE, 'Line two', TAB, 'tabbednulled'].join(''))
    expect(app.payload.nested.about).toBe('Alsohere')
    expect(app.payload.list).toEqual(['okone', 'oktwo'])
  })
})
