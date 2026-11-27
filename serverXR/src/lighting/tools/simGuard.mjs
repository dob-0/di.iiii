// The APC40 simulation writes to a desk (layers, the saved MIDI map, ARM, blackout). It may run only against
// a di-dev scratch tree, never diiii.localhost or the installed desk. Pure: the caller passes `di-dev ls` text.
// Returns null when the target is allowed, else the reason it is refused.
export function checkSimTarget(url, devLsText) {
  let u
  try { u = new URL(url) } catch { return 'not a URL: ' + url }
  if (/diiii\.localhost$|thedi\.studio$|diiii\.xyz$/i.test(u.hostname)) return 'refused: ' + u.hostname + ' is the installed or a shared desk'
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return 'refused: only a di-dev scratch tree at 127.0.0.1 is allowed'
  if (!u.port) return 'refused: no port, so not a di-dev scratch tree'
  const re = new RegExp('\\bscratch\\s+web\\s+:' + u.port + '\\b')
  if (!re.test(String(devLsText || ''))) return 'refused: port ' + u.port + ' is not the web port of a di-dev scratch tree (di-dev ls)'
  return null
}
