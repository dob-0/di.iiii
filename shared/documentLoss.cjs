// What a whole-document replace DESTROYS, said before it runs.
//
// 2026-09-16 → 09-18: the front room (`main-dii-project`) held 76 image
// entities — the studio's portfolio deck. An audit sampled one file, called
// them debris and deleted them on local and dev. Two days later a "carry the
// good version" pass copied dev's document to production with
// `project-pull.mjs --force`, which lands as one `replaceDocument` op. It
// removed 76 authored slides from prod and nothing said so: no diff, no count,
// no refusal. The owner approved "carry main front room" without being told it
// deleted 76 slides.
//
// The established shape for a destructive operation is the plan-then-confirm
// one — `terraform plan`, `rsync --dry-run --delete`, `git push
// --force-with-lease`: show exactly what goes, and require an acknowledgement
// that names it. Here the acknowledgement is a NUMBER: `--accept-loss <N>`,
// where N must equal the media items this replace removes. A stale or wrong N
// refuses again, so an approval given for one plan can never cover another.
//
// Pure, no I/O, CommonJS: the server (contentProposals.js, via sharedRuntime)
// and the scripts (project-pull, tier-sync, space-bundle, space-proposal) all
// read the same one.

// Entity types whose whole point is a file. Anything else that carries an
// asset reference counts as media too (see assetRefsOf).
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'model'])

// A key that names an asset: assetId, assetRef, textureAssetId,
// materialsAssetId, environmentAssetId, …
const ASSET_KEY_RE = /^asset(id|ref)$|assetid$/i
// An asset URL inside a string (built markup, a src field). Legacy ids are
// uuids, current ones sha256 hex — take either.
const ASSET_URL_RE = /\/api\/(?:projects|spaces)\/[A-Za-z0-9._-]+\/assets\/([A-Za-z0-9._-]{8,})/g

const collectRefs = (value, out, key = '') => {
  if (typeof value === 'string') {
    if (value && ASSET_KEY_RE.test(key)) out.add(value)
    if (value.includes('/assets/')) {
      for (const match of value.matchAll(ASSET_URL_RE)) out.add(match[1])
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, out, key)
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectRefs(v, out, k)
  }
}

/** Every asset id one entity/node/object points at, sorted, deduplicated. */
const assetRefsOf = (item) => {
  const out = new Set()
  collectRefs(item, out)
  return [...out].sort()
}

const LISTS = [
  ['entities', 'entity'],
  ['nodes', 'node'],
  // A legacy space scene (scene.json) is the same question with `objects`.
  ['objects', 'object']
]

/** The things a document is made of, flattened, each with what it points at. */
const itemsOf = (document) => {
  const items = []
  if (!document || typeof document !== 'object') return items
  for (const [listKey, kind] of LISTS) {
    const list = document[listKey]
    if (!Array.isArray(list)) continue
    list.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') return
      const id = typeof raw.id === 'string' && raw.id ? raw.id : `#${index}`
      const type = String(raw.type || raw.typeId || raw.kind || 'unknown')
      const name = String(raw.name || raw.label || raw.title || id)
      const assetRefs = assetRefsOf(raw)
      items.push({
        key: `${kind}:${id}`,
        kind,
        id,
        type,
        name,
        assetRefs,
        media: MEDIA_TYPES.has(type) || assetRefs.length > 0
      })
    })
  }
  return items
}

const countBy = (list, pick) => {
  const out = {}
  for (const item of list) {
    const k = pick(item)
    out[k] = (out[k] || 0) + 1
  }
  return out
}

/**
 * Compare what the target holds now with what is about to replace it.
 *
 * Items are matched by id. A media item whose id is gone but whose exact type
 * and asset references reappear on an item the target did not have is
 * `reidentified` — the same picture under a new id — and is not counted as
 * lost. Everything else that disappears is `removed`; the media among it is
 * `removedMedia`, and its length is the number `--accept-loss` must name.
 */
const diffDocumentLoss = (current, incoming) => {
  const before = itemsOf(current)
  const after = itemsOf(incoming)
  const afterByKey = new Map(after.map((item) => [item.key, item]))
  const beforeKeys = new Set(before.map((item) => item.key))

  // Items that only the incoming document has, by what they show — the pool a
  // removed media item may have moved to.
  const signature = (item) => `${item.type}|${item.assetRefs.join(',')}`
  const newcomers = new Map()
  for (const item of after) {
    if (beforeKeys.has(item.key) || !item.assetRefs.length) continue
    const sig = signature(item)
    newcomers.set(sig, (newcomers.get(sig) || 0) + 1)
  }

  const removed = []
  const reidentified = []
  const assetChanged = []
  for (const item of before) {
    const next = afterByKey.get(item.key)
    if (next) {
      if (item.assetRefs.join(',') !== next.assetRefs.join(',')) {
        assetChanged.push({ ...item, from: item.assetRefs, to: next.assetRefs })
      }
      continue
    }
    const sig = signature(item)
    if (item.media && item.assetRefs.length && newcomers.get(sig) > 0) {
      newcomers.set(sig, newcomers.get(sig) - 1)
      reidentified.push(item)
      continue
    }
    removed.push(item)
  }
  const removedMedia = removed.filter((item) => item.media)
  return {
    before: before.length,
    after: after.length,
    removed,
    removedMedia,
    reidentified,
    assetChanged,
    mediaLost: removedMedia.length,
    removedByType: countBy(removed, (item) => item.type),
    mediaByType: countBy(removedMedia, (item) => item.type)
  }
}

/** Several replaces as one plan (a tier carry, a bundle import). */
const combineLoss = (entries) => {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.loss)
  return {
    entries: list,
    mediaLost: list.reduce((n, e) => n + e.loss.mediaLost, 0),
    removed: list.reduce((n, e) => n + e.loss.removed.length, 0)
  }
}

const describeTypes = (byType, media) => Object.entries(byType)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([type, n]) => `${n} ${type}${media && media[type] ? ' (media)' : ''}`)
  .join(', ')

const MAX_NAMED = 20

/**
 * The plain words for one replace: "prod main-dii-project: this replace
 * REMOVES 76 of 85 items — 76 image (media)", then the media items by name.
 */
const describeLoss = (loss, label = 'target') => {
  const lines = []
  if (!loss.removed.length) {
    lines.push(`${label}: nothing is removed (${loss.before} → ${loss.after} items)`)
  } else {
    lines.push(`${label}: this replace REMOVES ${loss.removed.length} of ${loss.before} items — ${describeTypes(loss.removedByType, loss.mediaByType)}`)
    if (loss.removedMedia.length) {
      lines.push(`  media removed (${loss.removedMedia.length}):`)
      for (const item of loss.removedMedia.slice(0, MAX_NAMED)) {
        lines.push(`    - ${item.type} "${item.name}"${item.assetRefs.length ? ` [${item.assetRefs.map((r) => r.slice(0, 12)).join(', ')}]` : ''}`)
      }
      if (loss.removedMedia.length > MAX_NAMED) lines.push(`    … and ${loss.removedMedia.length - MAX_NAMED} more`)
    }
  }
  if (loss.reidentified.length) lines.push(`  ${loss.reidentified.length} media item(s) keep their file under a new id — not counted as lost`)
  if (loss.assetChanged.length) {
    lines.push(`  ${loss.assetChanged.length} item(s) will point at a different file:`)
    for (const item of loss.assetChanged.slice(0, MAX_NAMED)) {
      lines.push(`    - ${item.type} "${item.name}": ${item.from.map((r) => r.slice(0, 12)).join(',') || '(none)'} → ${item.to.map((r) => r.slice(0, 12)).join(',') || '(none)'}`)
    }
    if (loss.assetChanged.length > MAX_NAMED) lines.push(`    … and ${loss.assetChanged.length - MAX_NAMED} more`)
  }
  return lines.join('\n')
}

/**
 * `--accept-loss <N>` / `--accept-loss=<N>` out of an argv. null when absent,
 * NaN when present but not a whole number (which never matches, so refuses).
 */
const parseAcceptLoss = (argv = []) => {
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i])
    let raw = null
    if (arg === '--accept-loss') raw = argv[i + 1]
    else if (arg.startsWith('--accept-loss=')) raw = arg.slice('--accept-loss='.length)
    else continue
    return /^\d+$/.test(String(raw ?? '')) ? Number(raw) : NaN
  }
  return null
}

/**
 * May the write go ahead? Only when no media is lost, or when the caller named
 * the exact number that is. Non-media removals are shown, never blocked.
 */
const lossGate = ({ mediaLost, acceptLoss = null }) => {
  if (!mediaLost) return { ok: true, message: null }
  if (acceptLoss === mediaLost) {
    return { ok: true, message: `--accept-loss ${acceptLoss}: removing ${mediaLost} media item(s), as acknowledged.` }
  }
  if (acceptLoss === null || acceptLoss === undefined) {
    return {
      ok: false,
      message: `REFUSED: this removes ${mediaLost} media item(s) of authored work. Nothing was written.\n`
        + 'Look at every one of them first (never judge media from a sample) and let the owner decide.\n'
        + `To carry it out anyway, re-run with --accept-loss ${mediaLost}.`
    }
  }
  return {
    ok: false,
    message: `REFUSED: --accept-loss ${Number.isNaN(acceptLoss) ? '(not a number)' : acceptLoss} does not match the ${mediaLost} media item(s) this replace removes. Nothing was written.\n`
      + 'The target changed since that number was read, or it was a guess. Look again, then pass the number shown above.'
  }
}

module.exports = {
  MEDIA_TYPES,
  assetRefsOf,
  itemsOf,
  diffDocumentLoss,
  combineLoss,
  describeLoss,
  parseAcceptLoss,
  lossGate
}
