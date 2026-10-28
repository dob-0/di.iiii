// Bluesky channel — AT Protocol over the PDS.
// Docs: https://docs.bsky.app/docs/api/com-atproto-server-create-session
//       https://docs.bsky.app/docs/api/com-atproto-repo-upload-blob
//       https://docs.bsky.app/docs/api/com-atproto-repo-create-record
//       link facets: https://docs.bsky.app/docs/advanced-guides/post-richtext
// Limits (lexicon app.bsky.feed.post / app.bsky.embed.images, checked 2026-10-21):
// text ≤ 300 graphemes, ≤ 4 images, each image blob ≤ 1,000,000 bytes.
// Video needs a separate upload service flow — not in this phase.
// Settings: SHARE_BLUESKY_HANDLE, SHARE_BLUESKY_APP_PASSWORD (an app password,
// never the account password), SHARE_BLUESKY_PDS (default https://bsky.social).

const { ShareError } = require('./errors')
const { requestJson } = require('./http')
const { composeText, loadAll, URL_PATTERN } = require('./channels')

// Link facets use UTF-8 byte offsets, not character offsets.
function linkFacets(text) {
  const enc = new TextEncoder()
  const facets = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const uri = match[0].replace(/[.,;:!?]+$/, '')
    const byteStart = enc.encode(text.slice(0, match.index)).length
    facets.push({
      index: { byteStart, byteEnd: byteStart + enc.encode(uri).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }]
    })
  }
  return facets
}

function createBlueskyChannel({ config, fetchImpl = (...a) => globalThis.fetch(...a), now = () => new Date() }) {
  const secrets = [config.appPassword]
  const json = (url, options) => requestJson(fetchImpl, url, options, { channel: 'bluesky', secrets })
  const xrpc = (method) => `${config.pds}/xrpc/${method}`

  const channel = {
    name: 'bluesky',
    capabilities: { text: true, image: true, video: false, link: true, maxText: 300, maxImages: 4, maxImageBytes: 1000000, maxVideoBytes: 0 },
    status() {
      const missing = [!config.handle && 'SHARE_BLUESKY_HANDLE', !config.appPassword && 'SHARE_BLUESKY_APP_PASSWORD'].filter(Boolean)
      return { name: 'bluesky', state: missing.length ? 'missing' : 'connected', detail: missing.length ? `set ${missing.join(' and ')}` : `@${config.handle} on ${config.pds}` }
    },
    async send(post, { loadMedia }) {
      if (channel.status().state !== 'connected') throw new ShareError('missing-token', channel.status().detail, { channel: 'bluesky' })
      const text = composeText(post)
      const media = await loadAll(channel, post, loadMedia)
      const { body: session } = await json(xrpc('com.atproto.server.createSession'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: config.handle, password: config.appPassword })
      })
      const auth = { authorization: `Bearer ${session.accessJwt}` }
      const images = []
      for (const m of media) {
        const { body } = await json(xrpc('com.atproto.repo.uploadBlob'), { method: 'POST', headers: { ...auth, 'content-type': m.mime }, body: m.buffer })
        images.push({ alt: m.item.alt || '', image: body.blob })
      }
      const record = { $type: 'app.bsky.feed.post', text, createdAt: now().toISOString() }
      const facets = linkFacets(text)
      if (facets.length) record.facets = facets
      if (images.length) record.embed = { $type: 'app.bsky.embed.images', images }
      const { body: created } = await json(xrpc('com.atproto.repo.createRecord'), {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record })
      })
      const rkey = String(created.uri || '').split('/').pop()
      return { id: created.uri || '', url: rkey ? `https://bsky.app/profile/${session.handle || config.handle}/post/${rkey}` : '' }
    }
  }
  return channel
}

module.exports = { createBlueskyChannel, linkFacets }
