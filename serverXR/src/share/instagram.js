// Instagram channel — one professional account, one system-user token (Meta Graph API).
// Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
//       (create a container: POST /{ig-id}/media, then POST /{ig-id}/media_publish; video/reels are processed first).
// Limits (checked 2026-11-09): caption 2200 characters; an image must be a public JPEG URL; a reel a public video URL.
// Instagram FETCHES the media itself, so the post's media must be an absolute https URL — space-asset refs are not enough
// until the space serves them publicly. This first version posts ONE image or ONE reel; carousels are owed.
// Settings: SHARE_INSTAGRAM_TOKEN (EAA… system-user token), SHARE_INSTAGRAM_ACCOUNT (the Instagram account id).
// The token is read by config.js from the environment on the always-on machine, never stored in a repo or the database.

const { ShareError } = require('./errors')
const { requestJson } = require('./http')
const { composeText, checkPost } = require('./channels')

function createInstagramChannel({ config, fetchImpl = (...a) => globalThis.fetch(...a), wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const secrets = [config.token]
  const base = (config.apiBase || 'https://graph.facebook.com/v23.0').replace(/\/+$/, '')
  const auth = { authorization: `Bearer ${config.token}` }
  const json = (path, options) => requestJson(fetchImpl, `${base}${path}`, options, { channel: 'instagram', secrets })
  const post = (path, body) => json(path, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body) })

  const channel = {
    name: 'instagram',
    capabilities: { text: true, image: true, video: true, link: true, maxText: 2200, maxImages: 1, maxImageBytes: 8 * 1024 * 1024, maxVideoBytes: 300 * 1024 * 1024 },
    status() {
      const missing = [!config.token && 'SHARE_INSTAGRAM_TOKEN', !config.accountId && 'SHARE_INSTAGRAM_ACCOUNT'].filter(Boolean)
      return { name: 'instagram', state: missing.length ? 'missing' : 'connected', detail: missing.length ? `set ${missing.join(' and ')}` : `account ${config.accountId}` }
    },
    async send(post_, { loadMedia } = {}) {
      if (channel.status().state !== 'connected') throw new ShareError('missing-token', channel.status().detail, { channel: 'instagram' })
      checkPost(channel, post_)
      const item = (post_.media || [])[0]
      if (!item) throw new ShareError('needs-media', 'Instagram needs one image or one video; a text-only post is not possible.', { channel: 'instagram' })
      if (!/^https:\/\//i.test(String(item.url || ''))) {
        throw new ShareError('bad-media', 'Instagram fetches the media itself: give a public https URL, not a space asset.', { channel: 'instagram' })
      }
      const isVideo = item.kind === 'video'
      const caption = composeText(post_)
      const created = await post(`/${config.accountId}/media`, isVideo
        ? { media_type: 'REELS', video_url: item.url, caption }
        : { image_url: item.url, caption, ...(item.alt ? { alt_text: item.alt } : {}) })
      const creationId = String(created.body.id || '')
      if (!creationId) throw new ShareError('api-error', 'instagram did not return a media container.', { channel: 'instagram' })
      if (isVideo) {
        let state = ''
        for (let i = 0; i < 30 && state !== 'FINISHED'; i += 1) {
          if (i) await wait(2000)
          const got = await json(`/${creationId}?fields=status_code`, { headers: auth })
          state = String(got.body.status_code || '')
          if (state === 'ERROR' || state === 'EXPIRED') throw new ShareError('api-error', `instagram could not process the video (${state}).`, { channel: 'instagram' })
        }
        if (state !== 'FINISHED') throw new ShareError('api-error', 'instagram is still processing the video; try again in a few minutes.', { channel: 'instagram' })
      }
      const published = await post(`/${config.accountId}/media_publish`, { creation_id: creationId })
      const id = String(published.body.id || '')
      const meta = await json(`/${id}?fields=permalink`, { headers: auth }).catch(() => null)
      return { id, url: (meta && meta.body.permalink) || '' }
    }
  }
  return channel
}

module.exports = { createInstagramChannel }
