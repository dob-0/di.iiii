// Which NDI® source does a name mean? The same rule as `matchStreamDevice` in
// src/map/MapSourceView.jsx (the `stream` source: a camera label resolved on the
// machine that draws): exact, case-insensitive, first — then "contains", so
// "td_out" is enough for "AYLMO (td_out_windows)". Reimplemented here in CJS because
// the server cannot import the client; keep the two rules the same.
//
// `sources` is ONLY ever the finder's own list: the result is a source the NDI runtime
// discovered, never a string a client supplied.
const matchSourceName = (sources = [], name = '') => {
  const wanted = String(name || '').trim().toLowerCase()
  if (!wanted) return null
  const list = Array.isArray(sources) ? sources : []
  return list.find((source) => String(source?.name || '').toLowerCase() === wanted)
    || list.find((source) => String(source?.name || '').toLowerCase().includes(wanted))
    || null
}

module.exports = { matchSourceName }
