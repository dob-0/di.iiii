// Telegram channel — Bot API sendMessage / sendPhoto / sendVideo / sendMediaGroup.
// Docs: https://core.telegram.org/bots/api#sendmessage (checked 2026-10-21)
// Limits (https://core.telegram.org/bots/api#sending-files): photo ≤ 10 MB, other
// files ≤ 50 MB by upload; text 4096 chars; a caption 1024; an album 2–10 items.
// Settings: SHARE_TELEGRAM_BOT_TOKEN, SHARE_TELEGRAM_CHAT (@channel or numeric id).

const { ShareError } = require('./errors')
const { requestJson } = require('./http')
const { composeText, loadAll } = require('./channels')

const CAPTION_MAX = 1024

function createTelegramChannel({ config, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  const secrets = [config.botToken]
  const call = (method, payload) => {
    const options = payload instanceof FormData
      ? { method: 'POST', body: payload }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }
    return requestJson(fetchImpl, `${config.apiBase}/bot${config.botToken}/${method}`, options, { channel: 'telegram', secrets })
  }
  const urlFor = (message) => {
    const username = /^@/.test(config.chat) ? config.chat.slice(1) : message?.chat?.username
    return username && message?.message_id ? `https://t.me/${username}/${message.message_id}` : ''
  }
  const form = (fields, files = []) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '') f.append(k, typeof v === 'string' ? v : JSON.stringify(v))
    for (const { field, buffer, mime, name } of files) f.append(field, new Blob([buffer], { type: mime }), name)
    return f
  }

  const channel = {
    name: 'telegram',
    capabilities: { text: true, image: true, video: true, link: true, maxText: 4096, maxImages: 10, maxImageBytes: 10 * 1024 * 1024, maxVideoBytes: 50 * 1024 * 1024 },
    status() {
      const missing = [!config.botToken && 'SHARE_TELEGRAM_BOT_TOKEN', !config.chat && 'SHARE_TELEGRAM_CHAT'].filter(Boolean)
      return { name: 'telegram', state: missing.length ? 'missing' : 'connected', detail: missing.length ? `set ${missing.join(' and ')}` : `chat ${config.chat}` }
    },
    async send(post, { loadMedia }) {
      if (channel.status().state !== 'connected') throw new ShareError('missing-token', channel.status().detail, { channel: 'telegram' })
      const text = composeText(post)
      const media = await loadAll(channel, post, loadMedia)
      const chat_id = config.chat
      if (media.length === 0) {
        const { body } = await call('sendMessage', { chat_id, text })
        return { id: String(body.result?.message_id || ''), url: urlFor(body.result) }
      }
      const captionFits = text.length <= CAPTION_MAX
      const caption = captionFits ? text : ''
      let first
      if (media.length === 1) {
        const m = media[0]
        const isVideo = m.item.kind === 'video'
        const field = isVideo ? 'video' : 'photo'
        const { body } = await call(isVideo ? 'sendVideo' : 'sendPhoto', form({ chat_id, caption }, [{ field, ...m }]))
        first = body.result
      } else {
        const files = media.map((m, i) => ({ field: `file${i}`, ...m }))
        const group = media.map((m, i) => ({ type: m.item.kind === 'video' ? 'video' : 'photo', media: `attach://file${i}`, ...(i === 0 && caption ? { caption } : {}) }))
        const { body } = await call('sendMediaGroup', form({ chat_id, media: group }, files))
        first = Array.isArray(body.result) ? body.result[0] : body.result
      }
      if (!captionFits && text) await call('sendMessage', { chat_id, text })
      return { id: String(first?.message_id || ''), url: urlFor(first) }
    }
  }
  return channel
}

module.exports = { createTelegramChannel }
