'use strict'

// Lane D · sinks. GET /api/rig/events — an SSE stream of the local blackout/cue state, for
// browser outputs (src/rig/rigEvents.js on the client side of this same wire). See
// docs/architecture/rig/PROTOCOL-1.md §7's lane D interface block.

const { requireLocalRuntime } = require('../localRuntimeGuard')

// Same shape as serverXR/src/routes/projectRoutes.js's own /events stream: text/event-stream,
// X-Accel-Buffering: no (nginx would otherwise buffer small SSE writes on the Docker/VPS
// deploy — see that file's comment), a keep-alive comment every 25s, cleanup on close.
const KEEPALIVE_MS = 25000

function registerRigEvents(app, sinks, { guard } = {}) {
  // `guard` is injected by the core lane (rig/index.js, rig/routes.js) — every /api/rig/*
  // route sits behind requireLocalRuntime (PROTOCOL-1.md §1). This registers its own route
  // directly on `app` rather than through that shared router, so it applies the same guard
  // itself, defaulting to requireLocalRuntime so the route is never accidentally open when
  // nobody wires a guard through.
  const middleware = typeof guard === 'function' ? guard : requireLocalRuntime

  app.get('/api/rig/events', middleware, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    let closed = false
    const send = (event, data) => {
      if (closed) return
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      } catch {
        // The socket is already gone; req.on('close') below runs the real cleanup.
      }
    }

    // Current state immediately on connect (PROTOCOL-1.md §7): a tab that opens mid-blackout
    // must render black on its first paint, not wait for the next toggle.
    send('blackout', { on: sinks.isBlackout(), from: null })

    const onBlackout = (payload) => send('blackout', payload)
    const onCue = (payload) => {
      if (!payload) return
      if (payload.name === 'reload') send('reload', {})
      else if (payload.name === 'show-page') send('show-page', { url: payload.args && payload.args.url })
      // Any other cue name is not part of this stream's contract; browser outputs learn
      // about it, if at all, through a future cue-specific event.
    }
    sinks.events.on('blackout', onBlackout)
    sinks.events.on('cue', onCue)

    const keepAlive = setInterval(() => {
      try {
        res.write(':keep-alive\n\n')
      } catch {
        clearInterval(keepAlive)
      }
    }, KEEPALIVE_MS)
    keepAlive.unref?.()

    req.on('close', () => {
      closed = true
      clearInterval(keepAlive)
      sinks.events.off('blackout', onBlackout)
      sinks.events.off('cue', onCue)
    })
  })
}

module.exports = { registerRigEvents }
