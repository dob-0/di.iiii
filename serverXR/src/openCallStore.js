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

// Built via the RegExp constructor from explicit \uXXXX escapes (never a
// literal /[...]/ character class) so no raw control byte lives in this
// source file.
// Single-line fields (name/email/phone/city, plus the call id, status,
// notes): strip control chars and collapse whitespace, like
// inscriptionRoutes.js's cleanLine — these are never legitimately multi-line.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029]', 'g')
const cleanText = (value, max = MAX_FIELD_LENGTH) => String(value ?? '')
  .replace(CONTROL_CHARS, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

// Payload values are call-specific and often genuinely multi-line (a "why
// participate" essay answer) — collapsing newlines like cleanText would
// destroy legitimate content. Only strip characters with no legitimate use
// in free text (NUL and other non-printable control chars); keep \n/\r/\t.
// eslint-disable-next-line no-control-regex
const NON_TEXT_CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]', 'g')
const cleanPayloadValue = (value) => typeof value === 'string'
  ? value.replace(NON_TEXT_CONTROL_CHARS, '')
  : value

const sanitizePayload = (value, depth = 0) => {
  if (depth > 5) return null
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [cleanPayloadValue(key), sanitizePayload(val, depth + 1)])
    )
  }
  return cleanPayloadValue(value)
}

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
  const sanitizedPayload = sanitizePayload(payload && typeof payload === 'object' ? payload : {})
  const serializedPayload = JSON.stringify(sanitizedPayload)
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
