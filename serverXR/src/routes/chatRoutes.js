// What the app opens on: the list of rooms this person can walk into, each with
// the last thing said in it.
//
// The room itself is a socket — join, replay, listen. That is right for being IN
// a room and wrong for looking at ten of them: opening ten sockets to draw a
// list is how a chat app becomes slow on a phone. So the list is one HTTP call,
// and it carries only what a list row shows.
//
// Scope is the same rule as everywhere else (`canAccessSpace`), asked per space
// rather than assumed from the session's array — an unrestricted account reaches
// every space without any of them being written down against it.

const { canAccessSpace } = require('../authAccess')
const spaceChatStore = require('../spaceChatStore')

const PREVIEW_MAX_LENGTH = 140

const registerChatRoutes = (router, { deps = {} } = {}) => {
  const listSpaces = deps.listSpaces
  const store = { listRecent: spaceChatStore.listRecent, getPin: spaceChatStore.getPin, ...deps.store }

  if (typeof listSpaces !== 'function') {
    throw new Error('registerChatRoutes needs listSpaces')
  }

  router.get('/api/chat/rooms', async (req, res, next) => {
    try {
      const authState = req.authState
      if (!authState?.authenticated) {
        return res.status(401).json({ error: 'Sign in to see your rooms.' })
      }

      const spaces = await listSpaces()
      // A sandbox is one person's scratch space, not a room anybody talks in;
      // listing every one of them would bury the rooms that matter under a pile
      // of empty ones.
      const mine = spaces
        .filter((space) => space.kind !== 'sandbox')
        .filter((space) => canAccessSpace(authState, space.id))

      const rooms = mine.map((space) => {
        // One line each. `listRecent` is the same window the room replays from,
        // asked for its tail — no second table, no denormalised "last message"
        // column to keep in step with the one that already exists.
        let last = null
        try {
          last = store.listRecent(space.id, { limit: 1 })[0] || null
        } catch {
          // A room whose history cannot be read is still a room you can open.
          last = null
        }
        return {
          spaceId: space.id,
          label: space.label || space.id,
          lastText: last ? String(last.text || '').slice(0, PREVIEW_MAX_LENGTH) : null,
          lastBy: last ? last.userName || null : null,
          lastAt: last ? Number(last.timestamp) || null : null
        }
      })

      // Rooms that have been spoken in first, most recent at the top; the silent
      // ones keep their own order underneath. A list sorted purely by name puts
      // the room somebody just wrote in below a room nobody has ever used.
      rooms.sort((a, b) => {
        if (a.lastAt && b.lastAt) return b.lastAt - a.lastAt
        if (a.lastAt) return -1
        if (b.lastAt) return 1
        return String(a.label).localeCompare(String(b.label))
      })

      return res.json({ rooms })
    } catch (error) {
      return next(error)
    }
  })
}

module.exports = { registerChatRoutes, PREVIEW_MAX_LENGTH }
