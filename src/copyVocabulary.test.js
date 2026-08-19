import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WIKI_ARTICLES } from './wiki/wikiContent.js'
import { NODE_TYPES } from './project/nodeRegistry.js'

// ONE WORD, ONE MEANING — the executable half of docs/ai/vocabulary.md.
//
// The audit of 2026-08-19 found the product calling one thing four names and
// four things one name: an *entity* in the Inspector was an *object* in the
// wiki, a *workspace* was the canvas here and the whole space there, `Beta`
// named a lane deleted in August, and `di.i` — the retired name — was still on
// the page. None of that fails a build. Copy rots silently, which is exactly
// why it rots: the only thing that ever noticed was a person reading the
// screen, and by then it had been wrong for months.
//
// So the dictionary is a test. It governs STRINGS A PERSON CAN READ and
// nothing else. Type ids, op names, document keys, CSS classes, route segments
// and filenames are deliberately out of scope — `space` alone appears 5,607
// times in source, renaming it would buy nothing, and a guard that touched
// identifiers would be deleted the first week. The two sets barely overlap:
// roughly 200 sentences carry the whole user-facing vocabulary.
//
// Three deliberate limits, so this stays a guard and not a nuisance:
//
//   1. Six banned words, not the contract's full list. The contract also bans
//      `scene`, `surface`, `chrome`, `seed` and `V1` — but those are live
//      identifiers (`presentation-scene`, `raw-graph-surface`, `--raw-bottom-
//      chrome`, `dii.seed.`), and a text scan cannot tell a class name from a
//      sentence. The six below appear in this codebase ONLY as copy, so a hit
//      is a real hit. Adding a seventh means first proving the same.
//   2. A curated file list, not a glob. A new copy-carrying file is added here
//      by hand, in the change that adds it.
//   3. Every exception is an ALLOWLIST row with a reason, and a row that stops
//      matching FAILS — so the list cannot quietly outlive its excuse.

const srcDir = dirname(fileURLToPath(import.meta.url))
const repoDir = join(srcDir, '..')

// From the contract's "Banned in user-visible strings" table. `use` is what the
// failure message tells the next person to write instead.
const BANNED = [
    { word: 'entity', pattern: /\bentit(y|ies)\b/i, use: 'object' },
    { word: 'Beta', pattern: /\bBeta\b/, use: 'nothing — the lane was deleted 2026-08-06' },
    { word: 'lane', pattern: /\blanes?\b/i, use: 'the thing itself' },
    { word: 'workspace', pattern: /\bworkspaces?\b/i, use: 'canvas (the surface) · space (the place) · layout (Studio\'s panels)' },
    // Capital R only: `src/raw/`, `/main/raw` and "raw JSON" are fine, the
    // proper noun is not. `RawEditor` has no word break after Raw, so an
    // identifier written into a string cannot trip this.
    { word: 'Raw', pattern: /\bRaw\b/, use: 'the node editor, or nothing at all' },
    // The retired product name. `di.iiii` is not a hit — the lookahead stops it.
    { word: 'di.i', pattern: /\bdi\.i(?!i)/, use: 'di.iiii' }
]

// Copy-carrying files, read as text. Everything a visitor, a guest or an owner
// reads on the way through the product: landing, hubs, editors, panels, the
// preferences pages, the published-page templates, the share cards, and the
// public README.
//
// NOT here, on purpose:
//   src/project/hooks/useOpHistory.js — its edit-history labels still read
//     "Workspace" and "Create entity" as of 2026-08-19. That file belonged to
//     no partition in the vocabulary pass and was left untouched rather than
//     edited blind. Add it to this list in the same change that fixes it.
//   README.md — the internal repo guide, written for agents, where `lane` and
//     `V1` are the architecture's own words. public-README.md is the one a
//     visitor lands on, and that one is guarded.
//   *.test.js(x) — a test asserting old copy is a broken test, not copy.
const COPY_FILES = [
    'public-README.md',
    'serverXR/src/routes/ogRoutes.js',
    'src/index.html',
    'src/Menu.jsx',
    'src/RootApp.jsx',
    'src/SpaceSurfaceApp.jsx',
    'src/SpacesPanel.jsx',
    'src/ViewPanel.jsx',
    'src/components/AppSurfaceSwitch.jsx',
    'src/components/AuthGate.jsx',
    'src/components/EditorLayoutContainer.jsx',
    'src/components/EditorOverlays.jsx',
    'src/components/MobileEditorShell.jsx',
    'src/components/PreferencesPage.jsx',
    'src/components/WebglContextGuard.jsx',
    'src/components/preferences/AdminManageSection.jsx',
    'src/components/preferences/AgentsSection.jsx',
    'src/components/preferences/PreferencesShared.jsx',
    'src/hooks/useControlButtons.js',
    'src/hooks/useControlSections.js',
    'src/hooks/usePreferencesData.js',
    'src/hooks/useSceneActions.js',
    'src/hooks/useSpaceLabel.js',
    'src/hooks/useStatusItems.js',
    'src/landing/LandingPage.jsx',
    'src/pages/PrivacyPage.jsx',
    'src/pages/TermsPage.jsx',
    'src/project/components/PublicProjectViewer.jsx',
    'src/project/entityPalette.js',
    'src/project/entityRegistry.js',
    'src/project/graph/examples/allNodesExample.js',
    'src/project/graph/nodeInspectorSections.js',
    'src/project/graph/studioNode.js',
    'src/project/nodeRegistry.js',
    'src/raw/components/AgentRunPanel.jsx',
    'src/raw/components/CreatePanelWindow.jsx',
    'src/raw/components/DesktopWindow.jsx',
    'src/raw/components/KeeperPanelWindow.jsx',
    'src/raw/components/NodePalette.jsx',
    'src/raw/components/OutlinerPanelWindow.jsx',
    'src/raw/components/RawEditor.jsx',
    'src/raw/components/RawGraphSurface.jsx',
    'src/raw/components/RawHelpDialog.jsx',
    'src/raw/components/RawHub.jsx',
    'src/raw/components/RawViewport.jsx',
    'src/raw/components/TextPanelWindow.jsx',
    'src/raw/components/WorkStatusPanel.jsx',
    'src/raw/components/WorldPanelWindow.jsx',
    'src/raw/director/DispersionPanel.jsx',
    'src/raw/utils/dropAsset.js',
    'src/raw/utils/rawGuide.js',
    'src/raw/utils/surfaceWorkflow.js',
    'src/studio/components/SpaceHub.jsx',
    'src/studio/components/StudioCodeSpaceDirector.jsx',
    'src/studio/components/StudioControlCluster.jsx',
    'src/studio/components/StudioEditor.jsx',
    'src/studio/components/StudioGraphSurface.jsx',
    'src/studio/components/StudioHub.jsx',
    'src/studio/components/StudioInspector.jsx',
    'src/studio/components/StudioProjectsPanel.jsx',
    'src/studio/components/StudioQuickInsert.jsx',
    'src/studio/components/StudioShell.jsx',
    'src/studio/components/StudioShellPanels.jsx',
    'src/studio/components/StudioViewportLayout.jsx',
    'src/studio/components/StudioWorldSurface.jsx',
    'src/studio/utils/assetFormats.js',
    'src/studio/utils/codeSpaces.js',
    'src/studio/utils/studioGuide.js',
    'src/utils/presentationTemplates.js'
]

// Survivors, each with the reason it survives. A row here is a decision on the
// record; a row that no longer matches anything is a lie, and fails below.
const ALLOWLIST = [
    {
        file: 'src/raw/components/RawEditor.jsx',
        string: '[local-workspace] save failed — browser storage is full or unavailable',
        why: 'console.error, not a sentence anyone reads in the product — `local-workspace` names the storage mode it reports on. The alert() one line down is the copy a person actually sees, and that one says canvas.'
    },
    {
        file: 'src/project/entityRegistry.js',
        string: 'entity',
        why: "generateId('entity') — an id prefix that lands in document keys, which the contract explicitly does not govern."
    }
]

// --- extraction -------------------------------------------------------------
//
// Two honest passes and no parser. Quoted string literals and JSX text nodes
// cover labels, aria-labels, titles, placeholders, toasts, errors and prose;
// a template literal with an interpolation in it is skipped rather than
// half-read. Anything that reads as an identifier — `raw-graph-surface`,
// `application/x-dii-entity`, `--raw-bottom-chrome` — is dropped, because a
// class name is not copy and flagging one is how a guard earns its deletion.

const isIdentifierish = (token) => (
    // kebab / snake / dotted / slashed: needs at least one separator, so a
    // plain English word is never mistaken for a class name.
    /^(--)?[A-Za-z0-9]+([-_.:/][A-Za-z0-9]+)+$/.test(token)
    // CSS values, hex colours, urls, paths, template leftovers.
    || /^[#@$/.]/.test(token)
)

const looksLikeCode = (value) => {
    const tokens = value.split(/\s+/).filter(Boolean)
    return tokens.length > 0 && tokens.every(isIdentifierish)
}

const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    // Line comments go too: developer prose is full of the words this file
    // bans, and it is allowed to be — `// the Raw lane` explains the code.
    .map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/([^:'"`])\/\/.*$/, '$1'))
    .join('\n')

const readableStringsFromCode = (source) => {
    const found = []
    stripComments(source).split('\n').forEach((line, index) => {
        for (const match of line.matchAll(/'([^'\\\n]{2,})'|"([^"\\\n]{2,})"|`([^`\\\n$]{2,})`/g)) {
            found.push({ line: index + 1, value: match[1] ?? match[2] ?? match[3] })
        }
        for (const match of line.matchAll(/>([^<>{}\n]{2,})</g)) {
            found.push({ line: index + 1, value: match[1] })
        }
    })
    return found
}

const readableStringsFromMarkdown = (source) => {
    const found = []
    let inFence = false
    source.split('\n').forEach((raw, index) => {
        if (raw.trimStart().startsWith('```')) { inFence = !inFence; return }
        if (inFence) return
        // Inline code is identifiers by definition — routes, paths, type ids.
        const line = raw.replace(/`[^`]*`/g, ' ').replace(/\(https?:[^)]*\)/g, ' ')
        if (line.trim().length > 1) found.push({ line: index + 1, value: line })
    })
    return found
}

const readableStrings = (path, source) => (
    path.endsWith('.md') ? readableStringsFromMarkdown(source) : readableStringsFromCode(source)
)

const isAllowed = (path, value) => ALLOWLIST.some((row) => row.file === path && row.string === value.trim())

const offencesIn = (path, entries) => {
    const offences = []
    for (const { line, value } of entries) {
        if (looksLikeCode(value)) continue
        if (isAllowed(path, value)) continue
        for (const { word, pattern, use } of BANNED) {
            if (!pattern.test(value)) continue
            offences.push(`${path}:${line}  banned word "${word}" — say ${use}\n    in: ${value.trim().slice(0, 140)}`)
        }
    }
    return offences
}

const report = (offences) => (
    `${offences.length} banned word(s) in strings a person can read.\n`
    + 'Fix the copy, or — if it is genuinely not copy — add an ALLOWLIST row\n'
    + `in src/copyVocabulary.test.js saying why. Contract: docs/ai/vocabulary.md\n\n${offences.join('\n')}`
)

// --- the wiki ---------------------------------------------------------------

describe('the wiki says only the words the contract sanctions', () => {
    // Walked structurally off the real export, not parsed out of the file: the
    // wiki is the longest piece of prose in the product and the one place a
    // person goes when a word confuses them. It has to be right first.
    const wikiStrings = []
    for (const article of WIKI_ARTICLES) {
        const at = `${article.id}`
        if (typeof article.title === 'string') wikiStrings.push({ where: `${at} · title`, value: article.title })
        if (typeof article.summary === 'string') wikiStrings.push({ where: `${at} · summary`, value: article.summary })
        for (const block of article.body || []) {
            if (typeof block === 'string') wikiStrings.push({ where: `${at} · body`, value: block })
            else if (block && Array.isArray(block.list)) {
                for (const item of block.list) {
                    if (typeof item === 'string') wikiStrings.push({ where: `${at} · list`, value: item })
                }
            }
        }
    }

    it('has articles to check at all', () => {
        // A restructure that renamed `body` would otherwise turn this whole
        // describe into a green no-op — the quietest failure there is.
        expect(WIKI_ARTICLES.length).toBeGreaterThan(20)
        expect(wikiStrings.length).toBeGreaterThan(200)
    })

    it('uses none of the banned words', () => {
        const offences = []
        for (const { where, value } of wikiStrings) {
            for (const { word, pattern, use } of BANNED) {
                if (!pattern.test(value)) continue
                offences.push(`src/wiki/wikiContent.js  ${where}  banned word "${word}" — say ${use}\n    in: ${value.slice(0, 140)}`)
            }
        }
        expect(offences, report(offences)).toEqual([])
    })
})

// --- the product's own strings ----------------------------------------------

describe('the product says only the words the contract sanctions', () => {
    const sources = COPY_FILES.map((path) => {
        let source = null
        try { source = readFileSync(join(repoDir, path), 'utf8') } catch { /* reported below */ }
        return { path, source }
    })

    it('can still find every file it guards', () => {
        // A renamed file must not silently drop out of coverage.
        const missing = sources.filter((f) => f.source === null).map((f) => f.path)
        expect(missing, `COPY_FILES lists file(s) that no longer exist: ${missing.join(', ')}`).toEqual([])
    })

    it('uses none of the banned words', () => {
        const offences = []
        for (const { path, source } of sources) {
            if (source === null) continue
            offences.push(...offencesIn(path, readableStrings(path, source)))
        }
        expect(offences, report(offences)).toEqual([])
    })

    it('keeps every allowlisted exception real', () => {
        // An ALLOWLIST row outliving its string means the reason it records is
        // no longer true of anything. Delete the row.
        const stale = []
        for (const row of ALLOWLIST) {
            const file = sources.find((f) => f.path === row.file)
            const hit = file?.source && readableStrings(row.file, file.source).some((e) => e.value.trim() === row.string)
            if (!hit) stale.push(`${row.file} :: "${row.string}"`)
        }
        expect(stale, `ALLOWLIST row(s) match nothing any more — delete them:\n${stale.join('\n')}`).toEqual([])
    })

    it('gives every allowlisted exception a reason', () => {
        for (const row of ALLOWLIST) {
            expect(row.why, `ALLOWLIST row for ${row.file} has no reason`).toBeTruthy()
            expect(row.why.length, `ALLOWLIST reason for ${row.file} is too short to be a reason`).toBeGreaterThan(30)
        }
    })
})

// --- node labels ------------------------------------------------------------

describe('node labels match the contract', () => {
    // Settled 2026-08-19. The type ids do NOT move — they are document keys —
    // and that is the whole point: one type had been wearing three names on
    // screen (`World` in the palette, `Scene` inside Studio, "the room" in the
    // prose) while its id sat still.
    //
    // Scene, not Room: it is what Blender, Unity, Godot and three.js — the
    // engine actually underneath this — all call the 3D place, and what
    // serverXR's own `/api/spaces/:spaceId/scene` calls it. The word was
    // banned in the first pass because it meant four things at once; giving it
    // back exactly one meaning is the better fix than retiring it, and it is
    // the rare word that is native to both 3D and theatre.
    it('labels universe.world Scene', () => {
        expect(NODE_TYPES['universe.world']?.label).toBe('Scene')
    })

    it('labels universe.space Container', () => {
        // Not a space and not a universe: a container you enter, whose one
        // setting hides the editor's furniture for everything inside it.
        // Named Container because the port menu and the wiki already say
        // "container" for this exact thing — three surfaces, one word.
        expect(NODE_TYPES['universe.space']?.label).toBe('Container')
    })

    it('names that container\'s one setting in plain words', () => {
        const showChrome = NODE_TYPES['universe.space']?.inputs?.find((port) => port.id === 'showChrome')
        expect(showChrome?.label).toBe('Show the toolbar')
    })

    it('carries no banned word in any label a person reads', () => {
        const offences = []
        for (const [typeId, type] of Object.entries(NODE_TYPES)) {
            const fields = [['label', type.label], ['description', type.description]]
            for (const port of type.inputs || []) fields.push([`input ${port.id}`, port.label])
            for (const port of type.outputs || []) fields.push([`output ${port.id}`, port.label])
            for (const [field, value] of fields) {
                if (typeof value !== 'string') continue
                for (const { word, pattern, use } of BANNED) {
                    if (!pattern.test(value)) continue
                    offences.push(`nodeRegistry ${typeId} · ${field}  banned word "${word}" — say ${use}\n    in: ${value}`)
                }
            }
        }
        expect(offences, report(offences)).toEqual([])
    })
})
