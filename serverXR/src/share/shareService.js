// The share door's logic, apart from HTTP: validate a draft, resolve its media,
// send it to each chosen channel through the contract (channels.js), and record
// one result per channel. A channel that already posted is skipped on a retry.

const store = require('./postStore')
const { ShareError, redact } = require('./errors')
const { createTelegramChannel } = require('./telegram')
const { createBlueskyChannel } = require('./bluesky')
const { createMastodonChannel } = require('./mastodon')

const MAX_TEXT = 5000
const MAX_MEDIA = 10
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|#|$)/i
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4' }
const REF = /^([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9._-]{1,200})$/

const extOf = (s) => (String(s).split(/[?#]/)[0].match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || ''

// A media entry as the author gave it → { kind, url } or { kind, ref, alt }.
function normalizeMedia(entry) {
  const item = typeof entry === 'string' ? { url: entry } : { ...(entry || {}) }
  const source = String(item.url || item.ref || '').trim()
  if (!source) throw new ShareError('bad-media', 'A media entry needs a url or a space/asset reference.')
  const out = {}
  if (/^https?:\/\//i.test(source)) {
    out.url = source
  } else if (REF.test(source)) {
    out.ref = source
  } else {
    throw new ShareError('bad-media', `"${source.slice(0, 60)}" is not an absolute http(s) URL or a space/asset reference.`)
  }
  out.kind = item.kind === 'video' || item.kind === 'image' ? item.kind : (VIDEO_EXT.test(source) ? 'video' : 'image')
  if (item.alt) out.alt = String(item.alt).slice(0, 1000)
  return out
}

function createShareService({ config, fetchImpl = (...a) => globalThis.fetch(...a), readAsset, channels = null }) {
  const registry = channels || [
    createTelegramChannel({ config: config.telegram, fetchImpl }),
    createBlueskyChannel({ config: config.bluesky, fetchImpl }),
    createMastodonChannel({ config: config.mastodon, fetchImpl })
  ]
  const byName = new Map(registry.map((c) => [c.name, c]))
  const secrets = [config.telegram?.botToken, config.bluesky?.appPassword, config.mastodon?.token]
  const sending = new Set()

  async function loadMedia(item) {
    if (item.ref) {
      const [spaceId, assetId] = item.ref.split('/')
      if (!readAsset) throw new ShareError('bad-media', 'Space assets are not available here.')
      let asset
      try { asset = await readAsset(spaceId, assetId) } catch { asset = null }
      if (!asset) throw new ShareError('bad-media', `Asset ${item.ref} was not found.`)
      return { buffer: asset.buffer, mime: asset.mime || MIME_BY_EXT[extOf(assetId)] || 'application/octet-stream', name: asset.name || assetId }
    }
    let response
    try { response = await fetchImpl(item.url) } catch (error) { throw new ShareError('bad-media', `Could not download ${item.url}: ${error?.message || error}`) }
    if (!response.ok) throw new ShareError('bad-media', `Could not download ${item.url} (${response.status}).`)
    const declared = Number(response.headers?.get?.('content-length') || 0)
    if (declared > MAX_DOWNLOAD_BYTES) throw new ShareError('media-too-big', `${item.url} is ${declared} bytes; the door takes up to ${MAX_DOWNLOAD_BYTES}.`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_DOWNLOAD_BYTES) throw new ShareError('media-too-big', `${item.url} is ${buffer.length} bytes; the door takes up to ${MAX_DOWNLOAD_BYTES}.`)
    const mime = (response.headers?.get?.('content-type') || '').split(';')[0].trim() || MIME_BY_EXT[extOf(item.url)] || 'application/octet-stream'
    const name = item.url.split(/[?#]/)[0].split('/').pop() || 'media'
    return { buffer, mime, name }
  }

  function validateDraft(input) {
    const text = String(input.text || '').trim()
    const link = String(input.link || '').trim()
    if (link && !/^https?:\/\/\S+$/i.test(link)) throw new ShareError('bad-link', 'The link must be an absolute http(s) address.')
    if (text.length > MAX_TEXT) throw new ShareError('text-too-long', `The text is over ${MAX_TEXT} characters.`)
    const media = (Array.isArray(input.media) ? input.media : []).map(normalizeMedia)
    if (media.length > MAX_MEDIA) throw new ShareError('too-many-media', `A post takes up to ${MAX_MEDIA} media items.`)
    const chosen = Array.isArray(input.channels) ? input.channels.map(String) : []
    if (chosen.length === 0) throw new ShareError('no-channel', 'Name at least one channel.')
    const unknown = chosen.filter((n) => !byName.has(n))
    if (unknown.length) throw new ShareError('unknown-channel', `Unknown channel: ${unknown.join(', ')}.`)
    if (!text && !link && media.length === 0) throw new ShareError('empty', 'The post has no words, no link and no media.')
    return { text, link, media, channels: [...new Set(chosen)] }
  }

  const statusList = () => registry.map((c) => ({ ...c.status(), capabilities: c.capabilities }))

  // Approve (his word) and send every channel that has not posted yet.
  async function send(id, actor) {
    const post = store.getPost(id)
    if (!post) return null
    if (sending.has(id)) throw new ShareError('busy', 'This post is being sent right now.')
    if (post.status === 'sent') return post
    sending.add(id)
    try {
      store.approve(id, actor)
      const results = {}
      for (const name of post.channels) {
        if (post.results[name]?.ok) continue
        const channel = byName.get(name)
        const at = Date.now()
        try {
          const done = await channel.send({ id: post.id, text: post.text, link: post.link, media: post.media }, { loadMedia })
          results[name] = { ok: true, url: done.url || '', id: done.id || '', at }
        } catch (error) {
          results[name] = { ok: false, code: error.code || 'error', error: redact(error.message, secrets), at }
        }
      }
      return store.recordResults(id, results)
    } finally {
      sending.delete(id)
    }
  }

  return { channels: registry, byName, statusList, validateDraft, send, loadMedia }
}

module.exports = { createShareService, normalizeMedia }
