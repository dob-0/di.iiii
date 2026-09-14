// The measuring half of "what a node is made of".
//
// Finds where each node type's code actually lives — its case in the runtime
// switch, its case in the viewport's renderNodeBody, its branch in the
// editor's panel if-chain — and reports each as a LINE RANGE in a named file.
// The browser then slices the real source by those ranges; nothing in the
// product ever pattern-matches source text at runtime.
//
// Parsed with acorn, never regexed. A regex slicer was tried against the real
// runtime file during design and produced three distinct wrong answers, all
// rendered confidently: a fall-through case (value.number) returned a bare
// label with no body, a section-header comment belonging to the NEXT case was
// glued onto the previous one, and the editor's if-chain — a fourth place code
// lives — was invisible to a `case '…':` pattern entirely.
//
// The measurement is taken at BUILD time and served as `virtual:node-anatomy`
// (see the plugin in vite.config.js) — it used to be committed as
// nodeAnatomy.generated.js and kept honest by a CI diff. Line numbers in a
// tracked file are a conflict on every wave that touches a measured file, and
// they were: the artifact appeared in 10 of 13 wave diffs and never once
// carried a decision anyone reviewed. Measuring at build time cannot go stale,
// so there is nothing left to check.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser } from 'acorn'
import jsx from 'acorn-jsx'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const JsxParser = Parser.extend(jsx())

const parse = (source) => JsxParser.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true
})

const walk = (node, visit) => {
    if (!node || typeof node.type !== 'string') return
    visit(node)
    for (const key of Object.keys(node)) {
        if (key === 'loc') continue
        const value = node[key]
        if (Array.isArray(value)) value.forEach((child) => walk(child, visit))
        else if (value && typeof value.type === 'string') walk(value, visit)
    }
}

const functionNode = (ast, fnName) => {
    let found = null
    walk(ast, (node) => {
        if (found) return
        if (node.type === 'FunctionDeclaration' && node.id?.name === fnName) found = node
        if (node.type === 'VariableDeclarator' && node.id?.name === fnName
            && (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')) {
            found = node.init
        }
    })
    return found
}

// Which output port ids a case answers: every string literal compared against
// the identifier `portId` inside it, `===` and `!==` alike (port.in's guard is
// `portId !== 'value'`, and 'value' is exactly the port it answers).
const answersIn = (nodes) => {
    const answers = new Set()
    nodes.forEach((node) => walk(node, (child) => {
        if (child.type !== 'BinaryExpression') return
        if (child.operator !== '===' && child.operator !== '!==') return
        const sides = [child.left, child.right]
        const port = sides.find((side) => side.type === 'Identifier' && side.name === 'portId')
        const literal = sides.find((side) => side.type === 'Literal' && typeof side.value === 'string')
        if (port && literal) answers.add(literal.value)
    }))
    return [...answers]
}

/**
 * Every case group of the `switch (node.typeId)` inside fnName, with the line
 * range of its body. Fall-through labels accumulate into ONE group — that is a
 * structural fact of the switch, not a slicing guess — and the range starts at
 * the group's first `case` line and ends at its last statement, so a comment
 * sitting above the NEXT case can never be swallowed (the trailing-comment
 * mis-attribution is the second of the three regex defects above).
 */
export function extractSwitchCases(source, fnName) {
    const fn = functionNode(parse(source), fnName)
    if (!fn) throw new Error(`no function named ${fnName}`)
    let switchNode = null
    walk(fn, (node) => {
        if (switchNode || node.type !== 'SwitchStatement') return
        let mentionsTypeId = false
        walk(node.discriminant, (child) => {
            if (child.type === 'Identifier' && child.name === 'typeId') mentionsTypeId = true
        })
        if (mentionsTypeId) switchNode = node
    })
    if (!switchNode) throw new Error(`no typeId switch inside ${fnName}`)

    const groups = []
    let pending = []
    for (const caseNode of switchNode.cases) {
        if (caseNode.test == null) { pending = []; continue } // default: is nobody's code
        pending.push(caseNode)
        if (caseNode.consequent.length === 0) continue
        const last = caseNode.consequent[caseNode.consequent.length - 1]
        groups.push({
            typeIds: pending.map((c) => c.test.value),
            fromLine: pending[0].loc.start.line,
            toLine: last.loc.end.line,
            answers: answersIn(caseNode.consequent)
        })
        pending = []
    }
    return groups
}

/**
 * A COLOCATED runtime module — the whole file is one type's compute code
 * (src/project/nodes/<typeId>/runtime.js, the lookup-first side of the
 * dispatcher). The slice is the entire module; answers come from the same
 * portId-comparison walk the switch cases use.
 */
export function extractModuleAnswers(source) {
    const ast = parse(source)
    return {
        fromLine: 1,
        toLine: source.replace(/\n$/, '').split('\n').length,
        answers: answersIn([ast])
    }
}

/**
 * The `if (node.typeId === '…')` chain inside fnName — the fourth place code
 * lives, and the one a switch-shaped extractor reports as "no code" for every
 * type in it.
 */
export function extractIfChain(source, fnName) {
    const fn = functionNode(parse(source), fnName)
    if (!fn) throw new Error(`no function named ${fnName}`)
    const branches = []
    walk(fn, (node) => {
        if (node.type !== 'IfStatement' || node.test?.type !== 'BinaryExpression') return
        if (node.test.operator !== '===') return
        const { left, right } = node.test
        const isTypeId = left.type === 'MemberExpression' && left.property?.name === 'typeId'
        if (!isTypeId || right.type !== 'Literal' || typeof right.value !== 'string') return
        branches.push({
            typeIds: [right.value],
            fromLine: node.loc.start.line,
            toLine: node.consequent.loc.end.line,
            answers: []
        })
    })
    return branches
}

/**
 * The doorway read — the block at the top of computeNodeOutput that answers a
 * container's promoted sockets BEFORE the type switch is ever consulted. Every
 * container shares these lines; the sheet's `a door` sentence points here.
 */
export function extractDoorwaySpan(source, fnName) {
    const fn = functionNode(parse(source), fnName)
    if (!fn) throw new Error(`no function named ${fnName}`)
    const body = fn.body?.body || []
    const switchIndex = body.findIndex((node) => node.type === 'SwitchStatement')
    if (switchIndex < 1) throw new Error(`no statements before the switch in ${fnName}`)
    return { fromLine: body[0].loc.start.line, toLine: body[switchIndex - 1].loc.end.line }
}

// The three hand-named files the manifest measures by parsing a function out of
// them. Colocated runtimes are the fourth source and are DISCOVERED, not named —
// see NODES_DIR below.
export const RUNTIME_FILE = 'src/project/graph/nodeGraphRuntime.js'
export const VIEWPORT_FILE = 'src/raw/components/RawViewport.jsx'
export const EDITOR_FILE = 'src/raw/components/RawEditor.jsx'
export const MEASURED_FILES = [RUNTIME_FILE, VIEWPORT_FILE, EDITOR_FILE]

// One directory per type, whole file is that type's compute code.
export const NODES_DIR = 'src/project/nodes'
const COLOCATED_RE = /(^|\/)src\/project\/nodes\/[^/]+\/runtime\.js$/

/**
 * Does a change to this file change the manifest? The dev server asks per
 * change event, rather than holding a list built at startup, because a type
 * migrating out of the switch ADDS a colocated runtime — a list would be blind
 * to exactly the file that just appeared.
 */
export const isMeasuredFile = (filePath) => {
    const normalized = filePath.split('\\').join('/')
    return MEASURED_FILES.some((file) => normalized.endsWith(file))
        || COLOCATED_RE.test(normalized)
        || normalized.endsWith(TOP_RUNTIME_FILE)
}

// Every picture operator is answered by ONE shared runtime (NODE_RUNTIMES
// spreads computeTopOutput over the operator ids instead of a folder per type),
// so a colocated-runtime scan finds nothing for them and the manifest used to
// say `computes: null` for every picture. Named here, whole file.
export const TOP_RUNTIME_FILE = 'src/project/tops/topRuntime.js'
// The component that runs every picture operator on this page — the GPU half
// the shader tab edits. A window-less feed, like the two below.
export const TOP_FEED_FILE = 'src/raw/components/TopNetworkFeed.jsx'

// Types whose live half is an invisible FEED the editor mounts beside the
// graph rather than a window — no extractor sees these, because the feed is
// chosen by a `.filter(node => node.typeId === …)` in the editor's JSX, not by
// a branch in renderViewNodeContent. Hand-kept like EXTRA_PLACES, and guarded
// the same way: a test asserts each file exists and the editor still mounts
// the named symbol.
export const FEED_PLACES = {
    'device.keyboard': { file: 'src/raw/components/KeyboardFeed.jsx', symbol: 'KeyboardFeed' },
    'device.midi.out': { file: 'src/raw/components/MidiOutFeed.jsx', symbol: 'MidiOutFeed' },
    'media.video': { file: 'src/raw/components/VideoFrameFeed.jsx', symbol: 'VideoFrameFeed' },
    'media.audio': { file: 'src/raw/components/SoundAnalysisFeed.jsx', symbol: 'SoundAnalysisFeed' }
}

/**
 * Which component file each renderViewNodeContent branch renders: the first
 * JSX element in the branch whose name is imported from a relative module (or
 * declared in the editor itself — BrowserPanelWindow lives there). Resolved
 * through the file's own ImportDeclarations, never by guessing from the type
 * id, so a panel renamed tomorrow is found by the import that names it.
 */
export function resolveBranchComponents(source, branches, { fromFile = EDITOR_FILE } = {}) {
    const ast = parse(source)
    const imports = new Map()
    const local = new Set()
    for (const statement of ast.body) {
        if (statement.type === 'ImportDeclaration' && typeof statement.source.value === 'string'
            && statement.source.value.startsWith('.')) {
            for (const specifier of statement.specifiers) {
                imports.set(specifier.local.name, statement.source.value)
            }
        }
        if (statement.type === 'FunctionDeclaration' && statement.id?.name) local.add(statement.id.name)
    }
    const dir = path.posix.dirname(fromFile)
    const elements = []
    walk(ast, (node) => {
        if (node.type !== 'JSXOpeningElement' || node.name?.type !== 'JSXIdentifier') return
        elements.push({ name: node.name.name, line: node.loc.start.line })
    })
    return branches.map((branch) => {
        const inBranch = elements.filter((el) => el.line >= branch.fromLine && el.line <= branch.toLine)
        for (const el of inBranch) {
            if (imports.has(el.name)) {
                const file = path.posix.normalize(path.posix.join(dir, imports.get(el.name)))
                return { ...branch, component: { file, symbol: el.name } }
            }
            if (local.has(el.name)) return { ...branch, component: { file: fromFile, symbol: el.name, local: true } }
        }
        return { ...branch, component: null }
    })
}

// The one hand-kept entry. `time` is the single type whose reality includes a
// file no extractor can find: without useGraphClock's scan the context's clock
// never advances and the case reads a dead `now`. Guarded by a test asserting
// the named symbol still lives in the named file — a hand-kept fact is the one
// thing here a person must remember, so a machine remembers it too.
export const EXTRA_PLACES = {
    time: {
        file: 'src/project/graph/useGraphClock.js',
        symbol: 'useGraphClock',
        sentence: 'It only moves because something outside it keeps a clock — useGraphClock.js.'
    }
}

export async function buildManifest() {
    const { fingerprintSource } = await import('../src/raw/utils/sourceFingerprint.js')
    const { NODE_TYPES } = await import('../src/project/nodeRegistry.js')

    const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
    const runtimeSource = read(RUNTIME_FILE)
    const viewportSource = read(VIEWPORT_FILE)
    const editorSource = read(EDITOR_FILE)

    const anatomy = {}
    for (const id of Object.keys(NODE_TYPES)) {
        anatomy[id] = { computes: null, draws: null, panel: null, feed: null, alsoNeeds: EXTRA_PLACES[id] || null }
    }
    const place = (slot, file) => (group) => {
        for (const id of group.typeIds) {
            if (!anatomy[id]) continue // a case for a type the registry dropped — assertion 2 in the test reports it
            anatomy[id][slot] = {
                file,
                fromLine: group.fromLine,
                toLine: group.toLine,
                sharedWith: group.typeIds.filter((other) => other !== id),
                ...(slot === 'computes' ? { answers: group.answers } : {})
            }
        }
    }
    extractSwitchCases(runtimeSource, 'computeNodeOutput').forEach(place('computes', RUNTIME_FILE))
    extractSwitchCases(viewportSource, 'renderNodeBody').forEach(place('draws', VIEWPORT_FILE))
    const branches = resolveBranchComponents(editorSource, extractIfChain(editorSource, 'renderViewNodeContent'))
    branches.forEach(place('panel', EDITOR_FILE))
    for (const branch of branches) {
        for (const id of branch.typeIds) {
            if (anatomy[id]?.panel) anatomy[id].panel.component = branch.component
        }
    }
    for (const [id, feed] of Object.entries(FEED_PLACES)) {
        if (anatomy[id]) anatomy[id].feed = { file: feed.file, symbol: feed.symbol }
    }

    const fingerprints = {
        [RUNTIME_FILE]: fingerprintSource(runtimeSource),
        [VIEWPORT_FILE]: fingerprintSource(viewportSource),
        [EDITOR_FILE]: fingerprintSource(editorSource)
    }

    // Colocated runtimes — the lookup-first side of the dispatcher. Whole file,
    // one type, fingerprinted like the trio so an edit invalidates the manifest
    // the same way. Placed AFTER the switch pass on purpose: a type that has
    // migrated out still has a stale case standing in nodeGraphRuntime.js
    // during the move, and the colocated module is the one that runs.
    const nodesDir = path.join(ROOT, NODES_DIR)
    if (fs.existsSync(nodesDir)) {
        for (const entry of fs.readdirSync(nodesDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            const typeId = entry.name
            const file = `${NODES_DIR}/${typeId}/runtime.js`
            if (!fs.existsSync(path.join(ROOT, file)) || !anatomy[typeId]) continue
            const moduleSource = read(file)
            anatomy[typeId].computes = { file, ...extractModuleAnswers(moduleSource), sharedWith: [] }
            fingerprints[file] = fingerprintSource(moduleSource)
        }
    }

    // Picture operators: the one shared runtime, whole file, shared by all.
    const topIds = Object.keys(anatomy).filter((id) => id.startsWith('top.'))
    if (topIds.length && fs.existsSync(path.join(ROOT, TOP_RUNTIME_FILE))) {
        const topSource = read(TOP_RUNTIME_FILE)
        for (const id of topIds) {
            anatomy[id].computes = {
                file: TOP_RUNTIME_FILE,
                ...extractModuleAnswers(topSource),
                sharedWith: topIds.filter((other) => other !== id)
            }
            anatomy[id].feed = { file: TOP_FEED_FILE, symbol: 'TopNetworkFeed' }
        }
        fingerprints[TOP_RUNTIME_FILE] = fingerprintSource(topSource)
    }

    return {
        anatomy,
        doorway: { file: RUNTIME_FILE, ...extractDoorwaySpan(runtimeSource, 'computeNodeOutput') },
        fingerprints
    }
}

/**
 * The source of `virtual:node-anatomy`. Line numbers reach the browser as a
 * module built from the files as they are on disk in this very build — they
 * cannot describe a different revision than the one that ships.
 */
export function renderManifestModule({ anatomy, doorway, fingerprints }) {
    return `// MEASURED AT BUILD TIME from the files it points into — there is no copy of
// this on disk to fall out of date. See scripts/node-anatomy-lib.mjs.
export const NODE_ANATOMY = ${JSON.stringify(anatomy)}

// The block at the top of computeNodeOutput that answers a container's
// promoted sockets before the type switch is ever consulted.
export const DOORWAY_PLACE = ${JSON.stringify(doorway)}

export const SOURCE_FINGERPRINTS = ${JSON.stringify(fingerprints)}
`
}

/**
 * The source of `virtual:node-source` — the REAL text behind every place the
 * manifest names, for the inside's MADE OF drawer. Imported only lazily
 * (`import('virtual:node-source')` on the first open), so the main bundle
 * carries the small manifest and nobody pays for the text until they look.
 *
 * Slices (a switch case, a draw case, an editor branch, the doorway block, a
 * colocated runtime) are embedded as strings, de-duplicated — ten value types
 * share one case. Whole component files (a panel, a feed) are NOT embedded:
 * each is a loader for its own `?raw` chunk, fetched only when that tab opens.
 * Text and line numbers come from the same read of the same file in the same
 * build, so no fingerprint check is needed between them.
 */
export async function buildSourceBundle(manifest = null) {
    const { anatomy, doorway } = manifest || await buildManifest()
    const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
    const cache = new Map()
    const lines = (file) => {
        if (!cache.has(file)) cache.set(file, read(file).split('\n'))
        return cache.get(file)
    }
    const texts = []
    const textIndex = new Map()
    const slice = (place) => {
        if (!place) return null
        const key = `${place.file}:${place.fromLine}-${place.toLine}`
        if (!textIndex.has(key)) {
            textIndex.set(key, texts.length)
            texts.push(lines(place.file).slice(place.fromLine - 1, place.toLine).join('\n'))
        }
        return { file: place.file, fromLine: place.fromLine, toLine: place.toLine, text: textIndex.get(key) }
    }
    const files = new Set()
    const sources = {}
    for (const [id, entry] of Object.entries(anatomy)) {
        const component = entry.panel?.component && !entry.panel.component.local ? entry.panel.component.file : null
        if (component) files.add(component)
        if (entry.feed?.file) files.add(entry.feed.file)
        sources[id] = {
            computes: slice(entry.computes),
            draws: slice(entry.draws),
            branch: slice(entry.panel),
            component,
            feed: entry.feed?.file || null,
            alsoNeeds: entry.alsoNeeds?.file || null
        }
    }
    return { sources, texts, doorway: slice(doorway), files: [...files].filter((file) => fs.existsSync(path.join(ROOT, file))).sort() }
}

export function renderSourceModule({ sources, texts, doorway, files }) {
    const loaders = files
        // An absolute filesystem path: the app's Vite root is src/, so a
        // root-relative `/src/…` does not resolve, and a module with no real
        // importer location has no relative base either.
        .map((file) => `    ${JSON.stringify(file)}: () => import(${JSON.stringify(`${path.join(ROOT, file)}?raw`)})`)
        .join(',\n')
    return `// MEASURED AT BUILD TIME — see scripts/node-anatomy-lib.mjs (buildSourceBundle).
export const SOURCE_TEXTS = ${JSON.stringify(texts)}
export const NODE_SOURCE = ${JSON.stringify(sources)}
export const DOORWAY_SOURCE = ${JSON.stringify(doorway)}
export const FILE_LOADERS = {
${loaders}
}
`
}
