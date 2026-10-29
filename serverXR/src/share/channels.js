// The channel contract of the share door.
//
//   {
//     name:         'telegram' | 'bluesky' | 'mastodon' | …
//     capabilities: { text, image, video, link, maxText, maxImages, maxImageBytes, maxVideoBytes }
//     status()      → { name, state: 'connected' | 'missing', detail }   never a secret
//     send(post, { loadMedia }) → { url?, id? }   throws ShareError
//   }
//
// `post` is { text, link, media:[{kind,url?,ref?,alt?}] }; `loadMedia(item)`
// resolves one item to { buffer, mime, name } (the service reads space assets
// from disk and downloads absolute URLs). Adapters never read env themselves:
// they get their settings from `config.share.<name>`, so tests can aim them at
// a fake server. To add a channel see docs/ai/publishing.md ("Add a channel").

const { ShareError } = require('./errors')

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g

// The words that go out: text, then the link on its own line unless the text has it.
function composeText(post) {
  const text = String(post.text || '').trim()
  const link = String(post.link || '').trim()
  if (link && !text.includes(link)) return text ? `${text}\n${link}` : link
  return text
}

// Characters as a person counts them (emoji and combining marks are one).
const graphemes = (text) => {
  if (typeof Intl?.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length
  }
  return Array.from(text).length
}

// What a channel will refuse, before anything is sent: the checks every adapter shares.
function checkPost(channel, post, loadedSizes = []) {
  const caps = channel.capabilities
  const text = composeText(post)
  const media = post.media || []
  if (!text && media.length === 0) throw new ShareError('empty', 'The post has no words and no media.', { channel: channel.name })
  if (graphemes(text) > caps.maxText) {
    throw new ShareError('text-too-long', `${channel.name} takes ${caps.maxText} characters; this post is ${graphemes(text)}.`, { channel: channel.name })
  }
  const images = media.filter((m) => m.kind !== 'video')
  const videos = media.filter((m) => m.kind === 'video')
  if (images.length && !caps.image) throw new ShareError('unsupported-media', `${channel.name} cannot carry images here.`, { channel: channel.name })
  if (videos.length && !caps.video) throw new ShareError('unsupported-media', `${channel.name} cannot carry video in this phase.`, { channel: channel.name })
  if (caps.maxImages && images.length > caps.maxImages) {
    throw new ShareError('too-many-media', `${channel.name} takes ${caps.maxImages} images; this post has ${images.length}.`, { channel: channel.name })
  }
  loadedSizes.forEach(({ kind, bytes }) => {
    const limit = kind === 'video' ? caps.maxVideoBytes : caps.maxImageBytes
    if (limit && bytes > limit) {
      throw new ShareError('media-too-big', `${channel.name} takes a ${kind} up to ${limit} bytes; this one is ${bytes}.`, { channel: channel.name })
    }
  })
}

// Load every media item once, with its kind, and check sizes against the channel.
async function loadAll(channel, post, loadMedia) {
  checkPost(channel, post)
  const out = []
  for (const item of post.media || []) {
    const loaded = await loadMedia(item)
    out.push({ item, ...loaded })
  }
  checkPost(channel, post, out.map((m) => ({ kind: m.item.kind, bytes: m.buffer.length })))
  return out
}

module.exports = { URL_PATTERN, composeText, graphemes, checkPost, loadAll }
