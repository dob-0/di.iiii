// The share door over HTTP (docs/ai/publishing.md). Admin only, every method:
// a draft is private and a send speaks as the platform.
//   GET  /api/share/channels            what each channel is (connected / missing), never a secret
//   GET  /api/share/posts               newest first
//   POST /api/share/posts               draft { text, link, media[], channels[] }
//   GET  /api/share/posts/:id
//   POST /api/share/posts/:id/send      approve + send every channel that has not posted yet
//   GET  /share/posts/:id/preview       the page: the post as each channel will show it

const store = require('../share/postStore')
const { renderPreview } = require('../share/preview')

const STATUS_BY_CODE = {
  'missing-token': 409,
  'api-error': 502,
  unreachable: 502,
  busy: 409
}

const actorOf = (req) => req.authState?.subject || 'admin'
const originOf = (req) => `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}${req.baseUrl || ''}`

function registerShareRoutes(router, { requireAdminAlways, service }) {
  const withLinks = (req, post) => post && ({ ...post, previewUrl: `${originOf(req)}/share/posts/${post.id}/preview` })
  const fail = (res, error) => {
    if (error?.name !== 'ShareError') throw error
    return res.status(STATUS_BY_CODE[error.code] || 400).json({ error: error.message, code: error.code })
  }

  router.get('/api/share/channels', requireAdminAlways, (req, res) => {
    res.json({ channels: service.statusList() })
  })

  router.get('/api/share/posts', requireAdminAlways, (req, res) => {
    res.json({ posts: store.listPosts({ limit: req.query.limit }).map((p) => withLinks(req, p)) })
  })

  router.post('/api/share/posts', requireAdminAlways, (req, res) => {
    try {
      const draft = service.validateDraft(req.body || {})
      res.status(201).json({ post: withLinks(req, store.createPost({ ...draft, createdBy: actorOf(req) })) })
    } catch (error) { fail(res, error) }
  })

  router.get('/api/share/posts/:id', requireAdminAlways, (req, res) => {
    const post = store.getPost(req.params.id)
    if (!post) return res.status(404).json({ error: 'No such post.' })
    res.json({ post: withLinks(req, post) })
  })

  router.post('/api/share/posts/:id/send', requireAdminAlways, async (req, res, next) => {
    try {
      const post = await service.send(req.params.id, actorOf(req))
      if (!post) return res.status(404).json({ error: 'No such post.' })
      res.json({ post: withLinks(req, post) })
    } catch (error) {
      try { fail(res, error) } catch (e) { next(e) }
    }
  })

  router.get('/share/posts/:id/preview', requireAdminAlways, (req, res) => {
    const post = store.getPost(req.params.id)
    if (!post) return res.status(404).type('text/plain').send('No such post.')
    res.set('Cache-Control', 'no-store')
    res.type('html').send(renderPreview({ post, channels: service.channels, base: originOf(req) }))
  })
}

module.exports = { registerShareRoutes }
