/**
 * The share door: one press puts this install on the wifi for guests, one press takes it off.
 * Plan: docs/ai/team-sync-by-network-name.md §7, §10, §12.
 *
 * Like the :80 door (localName.js) it is a SECOND listener that hands every
 * request and upgrade to the main server's own handlers — one app, one
 * Socket.IO, one writer — but it is added at runtime, on the LAN address of the
 * default-route interface, with the install's own name certificate
 * (~/.di/name/cert.pem + key.pem, written by `di name`). It:
 *   - serves only the install's own names, `<name>` and `*.<name>`; any other
 *     Host gets 421 (RFC 9110 §15.5.20), the DNS-rebinding rule of localName.js;
 *   - marks every request `req.diShareDoor`, which makes localOwner.js refuse
 *     the owner grant even when the packet comes from this machine's own wifi
 *     address, and turns guest mode on while the door is open (setGuests);
 *   - moves the broker record to the LAN address (signed PUT), starts a UDP
 *     beacon `{ di, label, port }` (a hint for other installs, unsigned), and
 *     checks the address every 10 s so a DHCP change rebinds and re-points.
 * Close reverses all of it. Nothing is written down: after a restart the install
 * is private again; the name and certificate stay.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const https = require('node:https')
const dgram = require('node:dgram')

const BEACON_PORT = 47474
const BEACON_EVERY_MS = 2000
const WATCH_EVERY_MS = 10 * 1000
const LOOPBACK_ADDRESS = '127.0.0.1'
const BORROWED = /^(docker|br-|virbr|veth|cni|flannel|podman|lxc|tun|tap)/i

const nameDirFor = (env = process.env) =>
  path.join(String(env.DI_HOME || '').trim() || path.join(os.homedir(), '.di'), 'name')

/** Does this Host header name `name` or one of its subdomains (any port)? */
const hostIsOwnName = (hostHeader, name) => {
  const host = String(hostHeader || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  return Boolean(name) && (host === name || host.endsWith(`.${name}`))
}

/** What `di name` left on disk, or { error }. Never throws. */
const readName = (dir) => {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(dir, 'name.json'), 'utf8'))
    if (!info?.name || !info?.label) return { error: 'no-name' }
    return {
      info,
      cert: fs.readFileSync(path.join(dir, 'cert.pem')),
      key: fs.readFileSync(path.join(dir, 'key.pem')),
      installKey: fs.readFileSync(path.join(dir, 'install.key'), 'utf8')
    }
  } catch {
    return { error: 'no-name' }
  }
}

/**
 * The address of the interface the default route leaves by: connecting a UDP
 * socket sends nothing, it only asks the kernel which source address it would
 * use. Falls back to the first real interface's IPv4 address.
 */
const defaultRouteAddress = ({ probe, interfaces = os.networkInterfaces() } = {}) => {
  const viaKernel = probe || (() => new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    const done = (value) => { try { socket.close() } catch { /* closed */ } resolve(value) }
    socket.once('error', () => done(null))
    socket.connect(53, '192.0.2.1', () => { try { done(socket.address().address) } catch { done(null) } })
  }))
  return Promise.resolve(viaKernel()).catch(() => null).then((found) => {
    if (found && found !== '0.0.0.0' && !found.startsWith('127.')) return found
    for (const [iface, entries] of Object.entries(interfaces || {})) {
      if (BORROWED.test(iface)) continue
      for (const entry of entries || []) {
        if (!entry.internal && (entry.family === 'IPv4' || entry.family === 4)) return entry.address
      }
    }
    return null
  })
}

// The one signing module is scripts/di/brokerClient.mjs; a packed install carries it as cli/ beside serverXR/
// (scripts/pack-runtime.mjs), a checkout as scripts/di/. An ES module, so import(), never require().
const loadBrokerClient = async () => {
  const { pathToFileURL } = require('node:url')
  for (const rel of [['..', '..', 'cli', 'brokerClient.mjs'], ['..', '..', 'scripts', 'di', 'brokerClient.mjs']]) {
    const file = path.join(__dirname, ...rel)
    if (fs.existsSync(file)) return import(pathToFileURL(file).href)
  }
  throw new Error('brokerClient.mjs not found beside this server')
}

const createShareDoor = ({
  mainServer,
  ownPort,
  nameDir = nameDirFor(),
  getAddress = defaultRouteAddress,
  setGuests = () => true,
  loadBroker = loadBrokerClient,
  ports,
  createServer = (options) => https.createServer(options),
  createSocket = () => dgram.createSocket('udp4'),
  watchEveryMs = WATCH_EVERY_MS,
  beaconEveryMs = BEACON_EVERY_MS,
  beaconPort = BEACON_PORT,
  now = () => Date.now(),
  log = () => {}
} = {}) => {
  const state = { shared: false, name: null, label: null, address: null, port: null, since: null, error: null, server: null, beacon: null, watch: null, broker: null, fields: null }
  const preferred = ports || [443, Number(ownPort) + 1]

  const listenOn = (server, address) => new Promise((resolve, reject) => {
    const tryPort = (index) => {
      if (index >= preferred.length) return reject(Object.assign(new Error('no free port for the share door'), { code: 'EADDRINUSE' }))
      const onError = (error) => {
        server.removeListener('listening', onListening)
        if (['EADDRINUSE', 'EACCES'].includes(error.code)) return tryPort(index + 1)
        reject(error)
      }
      const onListening = () => { server.removeListener('error', onError); resolve(server.address().port) }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(preferred[index], address)
    }
    tryPort(0)
  })

  const makeDoor = (fields) => {
    const door = createServer({ cert: fields.cert, key: fields.key })
    door.on('request', (req, res) => {
      if (!hostIsOwnName(req.headers.host, fields.info.name)) {
        res.writeHead(421, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        return res.end(`This door answers ${fields.info.name} only.\n`)
      }
      req.diShareDoor = true
      mainServer.emit('request', req, res)
    })
    door.on('upgrade', (req, socket, head) => {
      if (!hostIsOwnName(req.headers.host, fields.info.name)) return socket.destroy()
      req.diShareDoor = true
      mainServer.emit('upgrade', req, socket, head)
    })
    return door
  }

  const moveRecord = async (address) => {
    const broker = state.broker || (state.broker = await loadBroker())
    const { info, installKey } = state.fields
    const key = broker.readInstallKey(installKey)
    const result = await broker.putAddress({ brokerUrl: info.brokerUrl, label: info.label, address, key })
    if (!result.ok) {
      state.error = `the name broker did not take the address (${result.status || result.error || 'no answer'})`
      log(`[share] ${state.error}`)
    } else if (state.error?.startsWith('the name broker')) state.error = null
    return result
  }

  const stopBeacon = () => {
    if (state.beacon) { clearInterval(state.beacon.timer); try { state.beacon.socket.close() } catch { /* closed */ } }
    state.beacon = null
  }
  const startBeacon = () => {
    stopBeacon()
    try {
      const socket = createSocket()
      socket.on('error', () => {})
      const send = () => {
        const message = Buffer.from(JSON.stringify({ di: 1, label: state.label, port: state.port }))
        try { socket.send(message, 0, message.length, beaconPort, '255.255.255.255') } catch { /* no network this beat */ }
      }
      socket.bind(0, () => { try { socket.setBroadcast(true) } catch { /* not allowed here */ } send() })
      const timer = setInterval(send, beaconEveryMs)
      timer.unref?.()
      state.beacon = { socket, timer }
    } catch (error) {
      log(`[share] beacon not started: ${error?.message || error}`)
    }
  }

  const bind = async (address) => {
    const door = makeDoor(state.fields)
    state.port = await listenOn(door, address)
    state.server = door
    state.address = address
  }
  const unbind = () => { try { state.server?.close() } catch { /* closed */ } try { state.server?.closeAllConnections?.() } catch { /* none */ } state.server = null }

  /** The address changed: rebind the door, move the record, say it in the beacon. */
  const tick = async () => {
    if (!state.shared) return state
    const address = await getAddress()
    if (!address || address === state.address) return state
    unbind()
    try {
      await bind(address)
      await moveRecord(address)
      startBeacon()
      log(`[share] address is now ${address}:${state.port}`)
    } catch (error) {
      state.error = `could not follow the new address ${address}: ${error?.message || error}`
      log(`[share] ${state.error}`)
    }
    return state
  }

  // Private, the name is still said: the panel offers Share only to an install that has one.
  const status = () => ({
    shared: state.shared,
    name: state.name || readName(nameDir).info?.name || null,
    address: state.shared ? state.address : null,
    port: state.shared ? state.port : null,
    since: state.since,
    ...(state.error ? { error: state.error } : {})
  })

  const open = async () => {
    if (state.shared) return { ok: true, ...status() }
    const fields = readName(nameDir)
    if (fields.error) return { ok: false, reason: fields.error }
    const address = await getAddress()
    if (!address) return { ok: false, reason: 'no-network' }
    if (!setGuests(true)) return { ok: false, reason: 'no-guest-secrets' }
    state.fields = fields
    state.name = fields.info.name
    state.label = fields.info.label
    state.error = null
    try {
      await bind(address)
    } catch (error) {
      setGuests(false)
      return { ok: false, reason: 'no-port', detail: String(error?.message || error) }
    }
    state.shared = true
    state.since = new Date(now()).toISOString()
    await moveRecord(address)
    startBeacon()
    state.watch = setInterval(() => { tick().catch(() => {}) }, watchEveryMs)
    state.watch.unref?.()
    log(`[share] open on ${address}:${state.port} as ${state.name}`)
    return { ok: true, ...status() }
  }

  const close = async () => {
    if (!state.shared) return { ok: true, ...status() }
    clearInterval(state.watch)
    state.watch = null
    stopBeacon()
    unbind()
    setGuests(false)
    state.shared = false
    await moveRecord(LOOPBACK_ADDRESS)
    const done = status()
    log('[share] closed')
    state.since = null
    return { ok: true, ...done, shared: false }
  }

  return { open, close, status, tick }
}

module.exports = { BEACON_PORT, createShareDoor, loadBrokerClient, defaultRouteAddress, hostIsOwnName, nameDirFor, readName }
