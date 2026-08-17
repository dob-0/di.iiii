// Gate for routes that shell out to git/gh/claude or read the operator's
// ~/.claude directory. These read/execute local operator state and must
// never be reachable on a deployed server, so the check is NODE_ENV AND
// loopback — either alone is not enough (a misconfigured NODE_ENV, or a
// dev box with its port forwarded, must still refuse).
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

const isProductionEnv = () => (process.env.NODE_ENV || '').toLowerCase() === 'production'

const isLoopbackRequest = (req) => {
  const address = req.ip || req.socket?.remoteAddress || ''
  return LOOPBACK_ADDRESSES.has(address)
}

const requireDevLocal = (req, res, next) => {
  if (isProductionEnv() || !isLoopbackRequest(req)) {
    res.status(404).end()
    return
  }
  next()
}

module.exports = { requireDevLocal, isProductionEnv, isLoopbackRequest }
