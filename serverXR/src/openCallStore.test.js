// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('./db.js')
const {
  APPLICATION_STATUSES,
  createApplication,
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
  payload: { why: 'City and Time', experience: ['3D մոդելավորում'] },
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
})
