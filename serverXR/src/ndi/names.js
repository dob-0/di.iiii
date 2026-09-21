// Which NDI® source does a name mean?
//
// The rule itself now lives in shared/nameMatch.cjs, with its ESM twin at
// src/shared/nameMatch.js — the same rule the `stream` surface uses to find a
// camera by label, and the one the desk uses to warn that no machine can
// resolve a name. Before that extraction there were three separate copies of
// it and a comment in each asking the next person to keep them the same.
//
// `sources` is ONLY ever the finder's own list: the result is a source the NDI
// runtime discovered, never a string a client supplied.
const { pickByName } = require('../../../shared/nameMatch.cjs')

const matchSourceName = (sources = [], name = '') => pickByName(sources, name, (source) => source && source.name)

module.exports = { matchSourceName }
