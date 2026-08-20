// Fetches the real lines behind a manifest place, or refuses.
//
// An explicit thunk map, not a dynamic import path: Vite must see each `?raw`
// literal to make it a chunk, and the map doubles as the honest boundary of
// what the sheet can quote. Only the two small measured files are fetchable
// (5.0 + 7.0 kB gzipped, each its own lazy chunk, paid only when a disclosure
// is opened). RawEditor.jsx is deliberately NOT here — quoting a 5-line branch
// would ship ~23 kB gzipped of duplicate string to every reader — so panel
// places get a location row without a "Show the lines" door.
//
// The slice is BY LINE RANGE from the manifest, never by pattern in the
// browser: a runtime pattern-match is an unreviewed chance to show the wrong
// lines every time someone edits the runtime. And before anything is shown,
// the fetched text's fingerprint must equal the one recorded at generation —
// in a normal build they cannot differ (one commit, one artifact), but a
// hot-patched deploy could desync them, and that one check turns the only
// silent-lie path into a visible refusal.
import { SOURCE_FINGERPRINTS } from '../../project/graph/nodeAnatomy.generated.js'
import { fingerprintSource } from './sourceFingerprint.js'

const SOURCES = {
    'src/project/graph/nodeGraphRuntime.js': () => import('../../project/graph/nodeGraphRuntime.js?raw'),
    'src/raw/components/RawViewport.jsx': () => import('../components/RawViewport.jsx?raw')
}

// Colocated runtimes (src/project/nodes/<typeId>/runtime.js) are each a few
// hundred bytes and each its own lazy chunk — the glob keeps the map honest
// as types migrate out of the switch, with no hand-kept list to rot.
const COLOCATED = import.meta.glob('../../project/nodes/*/runtime.js', { query: '?raw' })
for (const [globPath, load] of Object.entries(COLOCATED)) {
    SOURCES[globPath.replace('../../project/nodes/', 'src/project/nodes/')] = load
}

// The sheet may show a longer slice's location but not quote it — eighty lines
// in a 400px window is a scrollbar wearing a code block.
export const MAX_QUOTED_LINES = 80

export const canShowLines = (file) => Boolean(SOURCES[file])

/**
 * @returns {Promise<{ ok: true, text: string } | { ok: false, reason: 'unavailable'|'moved'|'failed'|'too-long' }>}
 */
export async function loadSourceSlice({ file, fromLine, toLine }) {
    const load = SOURCES[file]
    if (!load) return { ok: false, reason: 'unavailable' }
    if (toLine - fromLine + 1 > MAX_QUOTED_LINES) return { ok: false, reason: 'too-long' }
    let source
    try {
        source = (await load()).default
    } catch {
        return { ok: false, reason: 'failed' }
    }
    if (fingerprintSource(source) !== SOURCE_FINGERPRINTS[file]) return { ok: false, reason: 'moved' }
    const lines = source.split('\n').slice(fromLine - 1, toLine)
    // Strip the shared indent so a switch case does not open eight spaces deep
    // in a narrow window. Whole indent levels only — relative shape survives.
    const indent = Math.min(...lines.filter((line) => line.trim())
        .map((line) => line.length - line.trimStart().length))
    return { ok: true, text: lines.map((line) => line.slice(indent)).join('\n') }
}

// Test-only: lets the refusal path be exercised against the REAL loader with a
// corrupted expectation, instead of mocking the mechanism away.
export const _testOnly = { SOURCES }
