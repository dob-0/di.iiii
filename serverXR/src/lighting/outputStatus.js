'use strict';
// One answer per route the desk sends to: ok | unreachable | off, with the reason in words.
// Pure: the desk hands in what each driver already knows; nothing here touches a socket.
// Why: a patched, cued, running desk looks healthy from every other reading on the page while
// frames go to an Art-Net node that is gone or an ENTTEC that is not plugged in (installed desk,
// 2026-10-21: output ON to a dead address and a missing ENTTEC, silent).
//
//   ok           frames leave and nothing says they do not arrive
//   unreachable  the driver cannot send, or its last sends failed, or a node that spoke went quiet
//   off          the wire switch for this route is off (nothing is sent, by choice)
//
// An Art-Net node that never answered ArtPoll is NOT called unreachable: most house nodes ignore it,
// so silence from a node that never spoke proves nothing. One that answered and then stopped does.

const ERROR_FRESH_MS = 5000;   // a send error older than this was followed by a quiet stretch: not news
const NODE_QUIET_MS = 20000;   // a node that spoke and has been silent this long (the page greys it at the same age)
const SERIAL_STALL_MS = 2000;  // same bar the wire pill uses for a serial port with no recent frame

const label = { artnet: 'Art-Net', sacn: 'sACN', enttec: 'ENTTEC' };

function freshError(drv, now) {
  if (!drv || !drv.lastError) return null;
  // ENTTEC keeps its lastError until the port recovers; the UDP drivers stamp lastErrorAt.
  if (drv.lastErrorAt && now - drv.lastErrorAt > ERROR_FRESH_MS) return null;
  return drv.lastError;
}

// route: { driver, enabled, targets?:[ip], serial?:enttec.status(), ready?:bool, lastError?, lastErrorAt? }
// nodes: [{ ip, ageMs }] as the desk's nodeList() gives them.
function routeStatus(route, nodes = [], now = Date.now()) {
  const name = label[route.driver] || route.driver;
  if (!route.enabled) return { status: 'off', reason: `${name} is switched off — nothing is leaving this machine` };

  if (route.driver === 'enttec') {
    const s = route.serial;
    if (!s || !s.connected) {
      return { status: 'unreachable', reason: `${(s && s.port) || route.serialPort || 'ENTTEC port'} is not open${s && s.lastError ? ': ' + s.lastError : ' — is the ENTTEC plugged in?'}` };
    }
    if (s.ageMs != null && s.ageMs > SERIAL_STALL_MS) {
      return { status: 'unreachable', reason: `${s.port} is open but no frame left for ${Math.round(s.ageMs / 1000)} s` };
    }
    return { status: 'ok', reason: `${s.port} open` };
  }

  if (!route.ready) return { status: 'unreachable', reason: `${name} socket is not ready${route.lastError ? ': ' + route.lastError : ''}` };
  const err = freshError(route, now);
  if (err) return { status: 'unreachable', reason: `${name} send failed: ${err}` };

  if (route.driver === 'artnet') {
    const quiet = (route.targets || [])
      .map((ip) => nodes.find((n) => n.ip === ip))
      .filter((n) => n && n.ageMs != null && n.ageMs > NODE_QUIET_MS);
    if (quiet.length) {
      return { status: 'unreachable', reason: `${quiet.map((n) => n.ip).join(', ')} answered before and has been silent for ${Math.round(quiet[0].ageMs / 1000)} s` };
    }
  }
  return { status: 'ok', reason: `${name} frames are leaving this machine` };
}

// The worst of the routes decides the one word the page shows; every route keeps its own line.
function busStatus(routes, nodes = [], now = Date.now()) {
  const list = routes.map((r) => ({ id: r.id || 'main', name: r.name || label[r.driver] || r.driver, driver: r.driver, ...routeStatus(r, nodes, now) }));
  const live = list.filter((r) => r.status !== 'off');
  const bad = list.filter((r) => r.status === 'unreachable');
  const status = bad.length ? 'unreachable' : live.length ? 'ok' : 'off';
  return { status, routes: list, unreachable: bad.map((r) => r.id) };
}

module.exports = { routeStatus, busStatus, ERROR_FRESH_MS, NODE_QUIET_MS, SERIAL_STALL_MS };
