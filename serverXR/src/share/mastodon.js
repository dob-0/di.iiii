// Mastodon channel — any instance, one access token.
// Docs: https://docs.joinmastodon.org/methods/media/#v2
//       https://docs.joinmastodon.org/methods/statuses/#create
// Limits (mastodon.social defaults, instance-set; https://docs.joinmastodon.org/user/posting/, checked 2026-10-21):
// text 500 characters (a link counts 23), ≤ 4 attachments, image ≤ 16 MB, video ≤ 99 MB.
// Settings: SHARE_MASTODON_URL (https://instance), SHARE_MASTODON_TOKEN (scope write:media write:statuses).

const { ShareError } = require('./errors')
const { requestJson } = require('./http')
const { composeText, loadAll } = require('./channels')

function createMastodonChannel({ config, fetchImpl = (...a) => globalThis.fetch(...a), wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const secrets = [config.token]
  const json = (path, options) => requestJson(fetchImpl, `${config.url}${path}`, options, { channel: 'mastodon', secrets })
  const auth = { authorization: `Bearer ${config.token}` }

  const channel = {
    name: 'mastodon',
    capabilities: { text: true, image: true, video: true, link: true, maxText: 500, maxImages: 4, maxImageBytes: 16 * 1024 * 1024, maxVideoBytes: 99 * 1024 * 1024 },
    status() {
      const missing = [!config.url && 'SHARE_MASTODON_URL', !config.token && 'SHARE_MASTODON_TOKEN'].filter(Boolean)
      return { name: 'mastodon', state: missing.length ? 'missing' : 'connected', detail: missing.length ? `set ${missing.join(' and ')}` : config.url }
    },
    async send(post, { loadMedia }) {
      if (channel.status().state !== 'connected') throw new ShareError('missing-token', channel.status().detail, { channel: 'mastodon' })
      const status = composeText(post)
      const media = await loadAll(channel, post, loadMedia)
      const ids = []
      for (const m of media) {
        const f = new FormData()
        f.append('file', new Blob([m.buffer], { type: m.mime }), m.name)
        if (m.item.alt) f.append('description', m.item.alt)
        const uploaded = await json('/api/v2/media', { method: 'POST', headers: auth, body: f })
        ids.push(uploaded.body.id)
        // 202 = the instance is still processing (video); wait until the attachment has a url.
        if (uploaded.status === 202) {
          let ready = false
          for (let i = 0; i < 10 && !ready; i += 1) {
            await wait(1000)
            const got = await requestJson(fetchImpl, `${config.url}/api/v1/media/${uploaded.body.id}`, { headers: auth }, { channel: 'mastodon', secrets }).catch(() => null)
            ready = Boolean(got && got.status === 200)
          }
          if (!ready) throw new ShareError('api-error', 'mastodon is still processing the media; try again in a minute.', { channel: 'mastodon' })
        }
      }
      const payload = { status, visibility: 'public', ...(ids.length ? { media_ids: ids } : {}) }
      const { body } = await json('/api/v1/statuses', {
        method: 'POST',
        // The same draft sent twice (a retry) must not post twice.
        headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': post.id || '' },
        body: JSON.stringify(payload)
      })
      return { id: String(body.id || ''), url: body.url || '' }
    }
  }
  return channel
}

module.exports = { createMastodonChannel }
