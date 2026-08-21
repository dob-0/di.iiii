// Chat with Claude inside di.iiii — the consumer of the per-user key store
// (aiConnectionStore). The browser never talks to Anthropic: this proxy
// decrypts the user's key server-side, streams the reply out over SSE, and
// records token usage per turn. Registered after the global auth gates, so
// every route already requires an authenticated editor; guests are rejected
// on top of that — a key must belong to an accountable account.

const { createRateLimiter } = require('../rateLimit')
const { isGuestSubject } = require('../authAccess')
const aiConnectionStore = require('../aiConnectionStore')
const chatStore = require('../aiChatStore')
const anthropic = require('../anthropicClient')
const localClaude = require('../localClaudeRunner')
const { isLocalOperatorRequest } = require('./agentBoardRoutes')

// Cost controls: per-subject message rate + per-user in-flight streams.
// max_tokens per turn is capped in anthropicClient; a broader daily token
// budget can build on aiChatStore.usageSince when a shared pool arrives.
const MESSAGE_LIMIT = { windowMs: 5 * 60_000, max: 20, name: 'ai chat messages' }
const MAX_CONCURRENT_STREAMS_PER_USER = 2

// Sent with every conversation. Still short — the user's own words should dominate
// the context, not ours — but it now carries two things it cannot work without.
//
// The vocabulary, because a model with no model of the product invents one, and the
// invented one is usually flat ("spaces and projects" as two sibling piles) which is
// exactly backwards.
//
// And the no-counts rule, because NOTHING here injects the caller's spaces or projects.
// Asked "how many do I have", the model previously answered with a number it made up,
// and a made-up number is indistinguishable from a real one to the person reading it.
const SYSTEM_PROMPT = [
    'You are Claude, working alongside a creator inside di.iiii, a browser-native XR authoring studio.',
    'How it is arranged: di.iiii holds spaces. A space is a place that is yours — an address, a guest list, and everything in it. A space holds projects. A project is one thing you make inside a space. Studio and the node editor are two ways of opening a project, not places that contain one.',
    'You are not given the creator\'s spaces or projects. Never state how many they have, and never name one you were not told about — say you cannot see them from here and point at the space\'s own Projects screen.',
    'Be concise and practical.'
].join(' ')

const HISTORY_LIMIT = 40

function registerAiChatRoutes(router, {
  streamFn = anthropic.streamChatCompletion,
  localRunFn = localClaude.runLocalClaude,
  localAvailableFn = localClaude.isLocalClaudeAvailable
} = {}) {
  const inFlight = new Map() // userId -> count

  // The operator's own machine can chat through its logged-in `claude` CLI
  // (subscription login, no API key). Same trust boundary as the agent board:
  // loopback + local server (non-production, or DI_LOCAL=1 on a di CLI
  // install) — never a hosted path.
  const localBackendFor = (req) => isLocalOperatorRequest(req) && localAvailableFn()

  const requireAccount = (req, res, next) => {
    const userId = req.authState?.subject
    if (!userId || isGuestSubject(userId)) {
      res.status(403).json({ error: 'Sign in with an account to chat with your Claude.' })
      return
    }
    req.aiUserId = userId
    next()
  }

  const messageLimiter = createRateLimiter({
    ...MESSAGE_LIMIT,
    keyFn: (req) => req.authState?.subject || 'anonymous'
  })

  router.get('/api/ai/providers', requireAccount, (req, res) => {
    res.json({
      keyConnected: Boolean(aiConnectionStore.getConnection(req.aiUserId, 'claude')),
      localClaude: localBackendFor(req)
    })
  })

  router.get('/api/ai/chats', requireAccount, (req, res) => {
    res.json({ chats: chatStore.listChats(req.aiUserId) })
  })

  router.post('/api/ai/chats', requireAccount, (req, res) => {
    const { title, nodeId, projectId } = req.body || {}
    const chat = chatStore.createChat(req.aiUserId, {
      title: typeof title === 'string' ? title.slice(0, 120) : null,
      nodeId: typeof nodeId === 'string' ? nodeId : null,
      projectId: typeof projectId === 'string' ? projectId : null
    })
    res.status(201).json({ chat })
  })

  router.get('/api/ai/chats/:chatId', requireAccount, (req, res) => {
    const chat = chatStore.getChat(req.aiUserId, req.params.chatId)
    if (!chat) {
      res.status(404).json({ error: 'chat not found' })
      return
    }
    res.json({ chat, messages: chatStore.listMessages(req.aiUserId, chat.id) })
  })

  router.patch('/api/ai/chats/:chatId', requireAccount, (req, res) => {
    const chat = chatStore.getChat(req.aiUserId, req.params.chatId)
    if (!chat) {
      res.status(404).json({ error: 'chat not found' })
      return
    }
    const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 120) : null
    res.json({ chat: chatStore.renameChat(req.aiUserId, chat.id, title) })
  })

  router.delete('/api/ai/chats/:chatId', requireAccount, (req, res) => {
    if (!chatStore.deleteChat(req.aiUserId, req.params.chatId)) {
      res.status(404).json({ error: 'chat not found' })
      return
    }
    res.status(204).end()
  })

  router.post('/api/ai/chats/:chatId/messages', requireAccount, messageLimiter, async (req, res) => {
    const userId = req.aiUserId
    const chat = chatStore.getChat(userId, req.params.chatId)
    if (!chat) {
      res.status(404).json({ error: 'chat not found' })
      return
    }
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    if (!text || text.length > 32_000) {
      res.status(400).json({ error: 'message text required (max 32k chars)' })
      return
    }
    const apiKey = aiConnectionStore.getKey(userId, 'claude')
    const useLocal = !apiKey && localBackendFor(req)
    if (!apiKey && !useLocal) {
      res.status(403).json({ error: 'no-ai-connection', hint: 'Connect your Claude API key from your account menu first.' })
      return
    }
    if ((inFlight.get(userId) || 0) >= MAX_CONCURRENT_STREAMS_PER_USER) {
      res.status(429).json({ error: 'Too many parallel replies — wait for one to finish.' })
      return
    }

    // History BEFORE persisting the new user turn, then append it — keeps the
    // outbound conversation ordered without re-reading.
    const history = (chatStore.listMessages(userId, chat.id) || [])
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }))
    const userMessage = chatStore.appendMessage(userId, chat.id, { role: 'user', content: text })

    // SSE out. X-Accel-Buffering is mandatory — nginx's generic block buffers
    // small SSE writes otherwise (see docs/ai/known-fixes.md).
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.flushHeaders?.()
    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
    send('accepted', { userMessage })

    // A closed client (window closed, node deleted, navigation) must abort
    // the upstream request — otherwise tokens keep burning and the in-flight
    // slot stays held for the full run.
    const abortController = new AbortController()
    res.on('close', () => abortController.abort())

    inFlight.set(userId, (inFlight.get(userId) || 0) + 1)
    try {
      let result
      if (useLocal) {
        // continuity via Claude Code's own --resume; no history replay needed
        result = await localRunFn({
          prompt: text,
          resumeSessionId: chat.claude_session_id || null,
          signal: abortController.signal,
          onDelta: (delta) => send('delta', { text: delta })
        })
        if (result.sessionId && result.sessionId !== chat.claude_session_id) {
          chatStore.setClaudeSession(userId, chat.id, result.sessionId)
        }
      } else {
        result = await streamFn({
          apiKey,
          model: typeof req.body?.model === 'string' ? req.body.model : undefined,
          system: SYSTEM_PROMPT,
          messages: [...history, { role: 'user', content: text }],
          signal: abortController.signal,
          onDelta: (delta) => send('delta', { text: delta })
        })
      }
      const assistantMessage = chatStore.appendMessage(userId, chat.id, {
        role: 'assistant',
        content: result.text,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      })
      send('done', { assistantMessage, stopReason: result.stopReason || null })
    } catch (error) {
      // A failed turn must not leave an orphaned user message in the history —
      // later turns would replay a dangling user turn with no reply forever.
      try { chatStore.deleteMessage(userId, chat.id, userMessage.id) } catch { /* best effort */ }
      // 401 from Anthropic = the stored key is bad — tell the user to
      // reconnect instead of surfacing a bare server error.
      const message = error.status === 401
        ? 'Your Claude API key was rejected — reconnect it from your account menu.'
        : (error.message || 'The reply failed.')
      send('error', { message, status: error.status || 500 })
    } finally {
      const count = (inFlight.get(userId) || 1) - 1
      if (count <= 0) inFlight.delete(userId)
      else inFlight.set(userId, count)
      res.end()
    }
  })
}

module.exports = { registerAiChatRoutes }
