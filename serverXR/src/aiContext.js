// GET /ai/context — the one context, at the caller's level. The levels, one
// order, each seeing what is below it (the di-bo repo's one-context audit brief
// §3):
//
//   owner > core > crew > partner > registered > public
//
// The level comes from who is asking, decided HERE from the request's auth
// state, never from what the caller says it is:
//
//   no key, a guest, auth switched off          public
//   a di.bo act token, tier root                owner
//   a di.bo act token, tier admin               core
//   a di.bo act token, tier member              by the account's group:
//                                               team/crew → crew, partner →
//                                               partner, anything else →
//                                               registered
//   an API key, a terminal login, a session:    core if the account is an
//                                               unrestricted admin, else by
//                                               group as above
//   the person at this machine (`di up`)        owner
//
// A group of core or owner stored on an account does NOT lift a member-tier
// token: those two need the server's env list too (actTokenTier.js), so a
// database edit alone reads as registered (the di-bo repo's groups design brief
// §2.1, "two keys"). The group column does not exist yet; until it does every
// group lookup is null and member means registered.
//
// `?level=` asks for a level at or below the caller's; above it is a 403, never
// a lower level handed back silently. With no `?level=` the caller gets their own.
//
// Where the bundles live: public is in the repo (docs/ai/public/context.md),
// because the repo is public and so is that level. Every other level is in the
// server's data folder (<data>/ai-context/<level>/CONTEXT.md, or AI_CONTEXT_DIR),
// written there by the context build and never by this server; a level with no
// file is a 404. The repo never holds a non-public bundle.

const fs = require('node:fs/promises')
const path = require('node:path')

const LEVELS = Object.freeze(['public', 'registered', 'partner', 'crew', 'core', 'owner'])
const rank = (level) => LEVELS.indexOf(level)

const DEFAULT_PUBLIC_FILE = path.resolve(__dirname, '../../docs/ai/public/context.md')

const levelForGroup = (group) => {
  const g = String(group || '').trim().toLowerCase()
  if (g === 'team' || g === 'crew') return 'crew'
  if (g === 'partner') return 'partner'
  return 'registered'
}

/**
 * The caller's level from req.authState. `groupOf(userId)` reads the account's
 * group, or null when there is none (or no such column yet).
 */
const levelForAuthState = (state, { groupOf = () => null, isGuestSubject = () => false } = {}) => {
  if (!state || !state.authenticated) return 'public'
  if (state.type === 'disabled' || state.type === 'guest' || isGuestSubject(state.subject)) return 'public'
  if (state.subject === 'local-owner') return 'owner'
  const group = () => {
    try { return groupOf(state.subject) } catch { return null }
  }
  if (state.actor === 'di.bo') {
    if (state.actTier === 'root') return 'owner'
    if (state.actTier === 'admin') return 'core'
    return levelForGroup(group())
  }
  if (state.role === 'admin' && state.isUnrestricted) return 'core'
  return levelForGroup(group())
}

const readText = async (file) => {
  try {
    return await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

const readBundle = async (level, { publicFile = DEFAULT_PUBLIC_FILE, contextDir }) => {
  if (level === 'public') return { text: await readText(publicFile), stamp: null }
  if (!contextDir) return { text: null, stamp: null }
  const dir = path.join(contextDir, level)
  const text = await readText(path.join(dir, 'CONTEXT.md'))
  let stamp = null
  const rawStamp = await readText(path.join(dir, 'STAMP.json'))
  if (rawStamp) {
    try { stamp = JSON.parse(rawStamp) } catch { stamp = null }
  }
  return { text, stamp }
}

function registerAiContextRoutes(router, {
  contextDir = null,
  publicFile = DEFAULT_PUBLIC_FILE,
  groupOf,
  isGuestSubject
} = {}) {
  router.get('/ai/context', async (req, res, next) => {
    try {
      // Every answer depends on who asked: no shared cache may keep one.
      res.set({ 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie', 'X-Content-Type-Options': 'nosniff' })
      const yours = levelForAuthState(req.authState, { groupOf, isGuestSubject })
      const asked = req.query.level === undefined ? yours : String(req.query.level).trim().toLowerCase()
      if (!LEVELS.includes(asked)) {
        return res.status(400).json({ error: 'unknown_level', level: asked, levels: LEVELS })
      }
      if (rank(asked) > rank(yours)) {
        return res.status(403).json({
          error: 'level_refused',
          level: asked,
          yours,
          note: yours === 'public'
            ? 'This level needs a key: send Authorization: Bearer <token>.'
            : 'Your key reaches a lower level than the one asked for.'
        })
      }
      const { text, stamp } = await readBundle(asked, { publicFile, contextDir })
      if (text === null) return res.status(404).json({ error: 'no_bundle', level: asked })
      res.set({ 'X-Di-Context-Level': asked, 'X-Di-Context-Yours': yours })
      if (stamp?.time) res.set('X-Di-Context-Built', String(stamp.time).slice(0, 40))
      res.type('text/markdown; charset=utf-8').send(text)
    } catch (error) { next(error) }
  })
}

module.exports = { LEVELS, levelForAuthState, levelForGroup, readBundle, registerAiContextRoutes, DEFAULT_PUBLIC_FILE }
