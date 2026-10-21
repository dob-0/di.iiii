// Posts of the share door: draft → approved → sent | failed, with one result per
// channel. SQLite like the other stores (table share_posts in db.js).
// `media` is the list as the author gave it, already checked (see shareService):
//   { kind: 'image'|'video', url?, ref?: 'space/assetId', alt? }
// `results` is { [channel]: { ok, url?, id?, error?, at } } — kept across a
// retry, so a channel that already posted is never posted twice.

const crypto = require('node:crypto')
const { getDb } = require('../db')

const STATUSES = ['draft', 'approved', 'sent', 'failed']
const MAX_LIST = 200

const parse = (value, fallback) => {
  try { return JSON.parse(value) } catch { return fallback }
}

const toPost = (row) => !row ? null : ({
  id: row.id,
  status: row.status,
  text: row.text,
  link: row.link,
  media: parse(row.media, []),
  channels: parse(row.channels, []),
  results: parse(row.results, {}),
  createdBy: row.created_by || null,
  approvedBy: row.approved_by || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  approvedAt: row.approved_at || null,
  sentAt: row.sent_at || null
})

function createPost({ text = '', link = '', media = [], channels = [], createdBy = null }) {
  const id = crypto.randomBytes(6).toString('hex')
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO share_posts (id, status, text, link, media, channels, results, created_by, created_at, updated_at)
    VALUES (?, 'draft', ?, ?, ?, ?, '{}', ?, ?, ?)
  `).run(id, text, link, JSON.stringify(media), JSON.stringify(channels), createdBy, now, now)
  return getPost(id)
}

function getPost(id) {
  return toPost(getDb().prepare('SELECT * FROM share_posts WHERE id = ?').get(String(id || '')))
}

function listPosts({ limit = 50 } = {}) {
  const n = Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), MAX_LIST)
  return getDb().prepare('SELECT * FROM share_posts ORDER BY created_at DESC, rowid DESC LIMIT ?').all(n).map(toPost)
}

// Only a draft may be edited; once approved or sent the words are what was agreed.
function updateDraft(id, patch) {
  const post = getPost(id)
  if (!post) return null
  if (post.status !== 'draft') return { error: 'not-draft', post }
  const next = { ...post, ...patch }
  getDb().prepare('UPDATE share_posts SET text = ?, link = ?, media = ?, channels = ?, updated_at = ? WHERE id = ?')
    .run(next.text, next.link, JSON.stringify(next.media), JSON.stringify(next.channels), Date.now(), id)
  return { post: getPost(id) }
}

function approve(id, approvedBy) {
  const post = getPost(id)
  if (!post) return null
  if (post.status === 'sent') return post
  const now = Date.now()
  getDb().prepare("UPDATE share_posts SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?")
    .run(approvedBy || null, now, now, id)
  return getPost(id)
}

// Merge one send attempt's per-channel results; status follows them.
function recordResults(id, results) {
  const post = getPost(id)
  if (!post) return null
  const merged = { ...post.results, ...results }
  const allOk = post.channels.length > 0 && post.channels.every((name) => merged[name]?.ok)
  const now = Date.now()
  getDb().prepare('UPDATE share_posts SET status = ?, results = ?, sent_at = ?, updated_at = ? WHERE id = ?')
    .run(allOk ? 'sent' : 'failed', JSON.stringify(merged), allOk ? now : null, now, id)
  return getPost(id)
}

module.exports = { STATUSES, createPost, getPost, listPosts, updateDraft, approve, recordResults }
