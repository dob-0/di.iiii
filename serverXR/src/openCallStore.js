// Open-call applications: public submissions reviewed in the /admin console.
// Identity fields get columns; everything call-specific lives in the payload
// JSON so different open calls can ask different questions.
const crypto = require('node:crypto')
const { getDb } = require('./db')

const APPLICATION_STATUSES = Object.freeze(['new', 'shortlist', 'accepted', 'declined'])
const CALL_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i
const MAX_FIELD_LENGTH = 200
const MAX_PAYLOAD_LENGTH = 20000

const toPublic = (row) => {
  if (!row) return null
  let payload = {}
  try { payload = JSON.parse(row.payload || '{}') } catch { payload = {} }
  return {
    id: row.id,
    callId: row.call_id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    city: row.city || '',
    payload,
    status: row.status,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const cleanText = (value, max = MAX_FIELD_LENGTH) => String(value ?? '').trim().slice(0, max)

const createApplication = ({ callId, name, email, phone = '', city = '', payload = {} }) => {
  const normalizedCallId = cleanText(callId, 64)
  if (!CALL_ID_PATTERN.test(normalizedCallId)) {
    const error = new Error('Invalid call id.')
    error.status = 400
    throw error
  }
  const normalizedName = cleanText(name)
  const normalizedEmail = cleanText(email)
  if (!normalizedName) {
    const error = new Error('name is required.')
    error.status = 400
    throw error
  }
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    const error = new Error('A valid email is required.')
    error.status = 400
    throw error
  }
  const serializedPayload = JSON.stringify(payload && typeof payload === 'object' ? payload : {})
  if (serializedPayload.length > MAX_PAYLOAD_LENGTH) {
    const error = new Error('Application payload is too large.')
    error.status = 413
    throw error
  }
  const now = Date.now()
  const id = crypto.randomUUID()
  getDb().prepare(`
    INSERT INTO open_call_applications (id, call_id, name, email, phone, city, payload, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new', '', ?, ?)
  `).run(id, normalizedCallId, normalizedName, normalizedEmail, cleanText(phone), cleanText(city), serializedPayload, now, now)
  return getApplication(id)
}

const getApplication = (id) => {
  const row = getDb().prepare('SELECT * FROM open_call_applications WHERE id = ?').get(String(id))
  return toPublic(row)
}

const listApplications = ({ callId, status = '', limit = 500 } = {}) => {
  const normalizedCallId = cleanText(callId, 64)
  const capped = Math.max(1, Math.min(Number(limit) || 500, 1000))
  const normalizedStatus = cleanText(status, 20).toLowerCase()
  if (normalizedStatus && APPLICATION_STATUSES.includes(normalizedStatus)) {
    return getDb().prepare(
      'SELECT * FROM open_call_applications WHERE call_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?'
    ).all(normalizedCallId, normalizedStatus, capped).map(toPublic)
  }
  return getDb().prepare(
    'SELECT * FROM open_call_applications WHERE call_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(normalizedCallId, capped).map(toPublic)
}

const updateApplication = (id, { status, notes } = {}) => {
  const existing = getApplication(id)
  if (!existing) return null
  let nextStatus = existing.status
  if (status !== undefined) {
    const normalized = cleanText(status, 20).toLowerCase()
    if (!APPLICATION_STATUSES.includes(normalized)) {
      const error = new Error(`status must be one of: ${APPLICATION_STATUSES.join(', ')}.`)
      error.status = 400
      throw error
    }
    nextStatus = normalized
  }
  const nextNotes = notes !== undefined ? cleanText(notes, 4000) : existing.notes
  getDb().prepare('UPDATE open_call_applications SET status = ?, notes = ?, updated_at = ? WHERE id = ?')
    .run(nextStatus, nextNotes, Date.now(), String(id))
  return getApplication(id)
}

const deleteApplication = (id) => {
  const existing = getApplication(id)
  if (!existing) return null
  getDb().prepare('DELETE FROM open_call_applications WHERE id = ?').run(String(id))
  return existing
}

module.exports = {
  APPLICATION_STATUSES,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication
}
