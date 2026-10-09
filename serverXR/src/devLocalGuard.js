// Gate for routes that shell out to git/gh/claude or read the operator's
// ~/.claude directory. These read/execute local operator state and must
// never be reachable on a deployed server, so the check is NODE_ENV AND
// loopback — either alone is not enough (a misconfigured NODE_ENV, or a
// dev box with its port forwarded, must still refuse).
// "Loopback" is a program on this machine: the peer is loopback and every
// proxy on the way says the client is too (localRequest.js).
const { requestFromThisMachine, isOwnPageOrNotABrowser } = require('./localRequest')

const isProductionEnv = () => (process.env.NODE_ENV || '').toLowerCase() === 'production'

const isLoopbackRequest = (req) => requestFromThisMachine(req)

const requireDevLocal = (req, res, next) => {
  if (isProductionEnv() || !isLoopbackRequest(req)) {
    res.status(404).end()
    return
  }
  next()
}

// For routes that start programs: on top of requireDevLocal, a browser must be
// on this server's own page (Sec-Fetch-Site: same-origin, or an Origin on this
// machine when the browser sends no Fetch Metadata).
const requireDevLocalOwnPage = (req, res, next) => {
  requireDevLocal(req, res, () => {
    if (!isOwnPageOrNotABrowser(req)) {
      res.status(404).end()
      return
    }
    next()
  })
}

module.exports = { requireDevLocal, requireDevLocalOwnPage, isProductionEnv, isLoopbackRequest }
