// The request log (morgan 'tiny' in index.js): which answers get a line.
//
// Only answers that went wrong — status 400 and up — the way morgan's own README shows it
// ("only log error responses": skip when res.statusCode < 400). A line for every answer
// drowned the journal: the follow engine asks its own server for news every 0.7–5 s per
// followed space (follow/follower.js), which on aylmo was ~1,750 lines a minute on 2026-10-26
// (N1307) — 98 % of them "200"/"304" — so the journal's 4 GB cap held six days and pushed
// real errors out with them. A systemd LogFilterPatterns= drop-in cannot do this instead:
// it works for system services only, and di-server is a user unit (man systemd.exec).
// DI_ACCESS_LOG=all logs every request again, for debugging a client.
const accessLogSkip = (env = process.env) => {
  const logAll = env.DI_ACCESS_LOG === 'all'
  return (_req, res) => !logAll && res.statusCode < 400
}

module.exports = { accessLogSkip }
