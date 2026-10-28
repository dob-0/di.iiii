import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
    DIIII_FILE_ENTRIES,
    DI_HELP_LINES,
    INSTALL_LINES,
    KIT_GROUPS,
    KIT_LIBS,
    KIT_TOOLS,
    MCP_RIG_TOOL_NAMES,
    MCP_TOOL_NAMES,
    SANDBOX_PLACEHOLDER,
    kitAppPaths,
    kitGroupsWithTools
} from './kitCatalogue.js'
import { KIT_STACK, KIT_STACK_GROUPS } from './kitStack.js'
import kitReady from './kitReady.json'
import kitWeights from './kitWeights.json'
import { describeRoute } from './kitRoutes.js'
import { WIKI_ARTICLES } from '../wiki/wikiContent.js'

// The Kit is data, and this is the contract on that data. Every card must be a
// tool the audit saw working; every button must open a route the router has;
// every source link must name a file that exists; every version and licence
// printed under "What we use" must be the one installed.

const srcDir = dirname(fileURLToPath(import.meta.url))
const repoDir = join(srcDir, '..', '..')
const READY = new Set(['live', 'install (honest label)'])
const wikiIds = new Set(WIKI_ARTICLES.map((article) => article.id))

describe('the kit catalogue — which tools', () => {
    it('lists exactly the tools the audit marked live or install-only, and none it marked not ready', () => {
        const ready = Object.entries(kitReady.labels).filter(([, label]) => READY.has(label)).map(([id]) => id).sort()
        const listed = KIT_TOOLS.map((tool) => tool.id).sort()
        expect(listed).toEqual(ready)
        for (const tool of KIT_TOOLS) {
            expect(READY.has(kitReady.labels[tool.id]), `${tool.id} is "${kitReady.labels[tool.id]}" in the audit`).toBe(true)
        }
    })

    it('gives every card a group that exists, and draws only groups with cards', () => {
        const groupIds = new Set(KIT_GROUPS.map((group) => group.id))
        for (const tool of KIT_TOOLS) expect(groupIds.has(tool.group), `${tool.id} → ${tool.group}`).toBe(true)
        for (const group of kitGroupsWithTools()) expect(group.tools.length).toBeGreaterThan(0)
    })

    it('has ids that are unique, and names in the vocabulary (Nodes, Projection, Light — never the lane names)', () => {
        const ids = KIT_TOOLS.map((tool) => tool.id)
        expect(new Set(ids).size).toBe(ids.length)
        const names = KIT_TOOLS.map((tool) => tool.name)
        expect(names).toContain('Nodes')
        expect(names).toContain('Projection')
        expect(names).toContain('Light')
        expect(names).toContain('Studio')
        for (const tool of KIT_TOOLS) {
            expect(`${tool.name} ${tool.line}`).not.toMatch(/\bRaw\b|\bmapper\b|\bBeta\b|\bstaging\b|\bworkspace\b/i)
        }
    })

    it('never counts our progress or names a tier, branch or machine in a sentence a person reads', () => {
        for (const tool of KIT_TOOLS) {
            expect(tool.line).not.toMatch(/\d+ of \d+|coming soon|not yet|dev tier|dev\.diiii|aylmo|branch/i)
        }
    })
})

describe('the kit catalogue — every button opens a real place', () => {
    it('points every in-app path at a surface the router has', () => {
        const paths = kitAppPaths().map((path) => path.replace(SANDBOX_PLACEHOLDER, 'sandbox-abc123'))
        expect(paths.length).toBeGreaterThan(20)
        for (const path of paths) {
            expect(describeRoute(path), `${path} reaches no surface`).not.toBeNull()
        }
    })

    it('opens the tools at the surfaces the audit tried', () => {
        const byId = Object.fromEntries(KIT_TOOLS.map((tool) => [tool.id, tool]))
        expect(describeRoute(byId.nodes.try.path)).toBe('nodes')
        expect(describeRoute(byId.perform.try.path)).toBe('perform')
        expect(describeRoute(byId.projection.try.path)).toBe('projection')
        expect(describeRoute(byId.studio.try.path)).toBe('studio')
        expect(describeRoute(byId.make.try.path)).toBe('make')
        expect(describeRoute(byId['open-space'].try.path)).toBe('jam')
        expect(describeRoute(byId.chat.try.path)).toBe('chat')
        expect(describeRoute(byId['sign-in'].try.path)).toBe('sign-in')
        expect(describeRoute(byId.wiki.try.path)).toBe('wiki')
        expect(describeRoute(byId.api.try.path)).toBe('for-apps')
        expect(describeRoute(byId.works.try.path)).toBe('work')
        expect(describeRoute(byId.walk.try.path)).toBe('project')
        expect(describeRoute(byId.sandbox.try.path.replace(SANDBOX_PLACEHOLDER, 'sandbox-abc123'))).toBe('studio')
    })

    it('gives every card either a Try, a plain sentence about what is needed, or an install-only label', () => {
        for (const tool of KIT_TOOLS) {
            const ok = Boolean(tool.try) || Boolean(tool.needs) || tool.where === 'install'
            expect(ok, `${tool.id} has no way in and no word about it`).toBe(true)
            if (tool.try) expect(tool.try.label.length).toBeGreaterThan(1)
        }
    })

    it('frames only routes that honour ?preview=1 without announcing anyone', () => {
        // The surfaces patched to read isPreviewRequest — a frame of anything
        // else would join presence from a thumbnail.
        const previewSafe = new Set(['project', 'front-door', 'work', 'studio', 'nodes', 'perform', 'projection', 'make', 'jam', 'wiki', 'terms', 'privacy', 'for-apps', 'sign-in', 'space'])
        for (const tool of KIT_TOOLS) {
            if (tool.preview.kind !== 'frame') continue
            const surface = describeRoute(tool.preview.path.replace(SANDBOX_PLACEHOLDER, 'sandbox-abc123'))
            expect(previewSafe.has(surface), `${tool.id} frames ${tool.preview.path} → ${surface}`).toBe(true)
        }
    })
})

describe('the kit catalogue — what it says is made of, exists', () => {
    it('links every source to a file in this repo', () => {
        for (const tool of KIT_TOOLS) {
            expect(tool.sources.length).toBeGreaterThan(0)
            for (const path of tool.sources) {
                expect(existsSync(join(repoDir, path)), `${tool.id}: ${path} is not in the repo`).toBe(true)
            }
        }
    })

    it('names only libraries with an official link, and a wiki article that exists', () => {
        for (const tool of KIT_TOOLS) {
            expect(tool.madeWith.length).toBeGreaterThan(0)
            for (const key of tool.madeWith) {
                expect(KIT_LIBS[key], `${tool.id}: unknown library ${key}`).toBeTruthy()
                expect(KIT_LIBS[key].url).toMatch(/^https:\/\//)
            }
            expect(wikiIds.has(tool.wiki), `${tool.id}: wiki#${tool.wiki} does not exist`).toBe(true)
        }
    })

    it('has a real screenshot for every still and every frame poster', () => {
        for (const tool of KIT_TOOLS) {
            const poster = tool.preview.poster
            if (!poster) continue
            expect(existsSync(join(repoDir, 'public', poster)), `${tool.id}: ${poster} missing`).toBe(true)
        }
    })

    it('quotes the di command’s help line for line', () => {
        const help = execFileSync('node', [join(repoDir, 'scripts/di/cli.mjs'), 'help'], { encoding: 'utf8' })
            .split('\n').map((line) => line.trim())
        for (const line of DI_HELP_LINES) {
            expect(help, `not in di help: ${line}`).toContain(line.trim())
        }
    })

    it('quotes the install lines the wiki prints', () => {
        const wiki = readFileSync(join(repoDir, 'src/wiki/wikiContent.js'), 'utf8')
        for (const line of INSTALL_LINES) expect(wiki).toContain(line)
    })

    it('names the tools the agent door registers, the four door tools and the four rig tools', () => {
        const mcp = readFileSync(join(repoDir, 'sdk/mcp.mjs'), 'utf8')
        for (const name of [...MCP_TOOL_NAMES, ...MCP_RIG_TOOL_NAMES]) expect(mcp).toContain(`registerTool('${name}'`)
    })

    it('names what a .diiii file holds, as the bundle tool writes it', () => {
        const bundle = readFileSync(join(repoDir, 'scripts/space-bundle.mjs'), 'utf8')
        for (const entry of DIIII_FILE_ENTRIES) {
            const name = entry.replace(/\/$/, '').split('/').pop()
            expect(bundle, `${entry} is not written by space-bundle.mjs`).toContain(`'${name}'`)
        }
    })
})

describe('what we use', () => {
    const readPkg = (entry) => {
        const root = entry.server ? join(repoDir, 'serverXR', 'node_modules') : join(repoDir, 'node_modules')
        const file = join(root, entry.npm, 'package.json')
        return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
    }

    it('groups every entry, with a link, a licence and one line on what it does here', () => {
        const groupIds = new Set(KIT_STACK_GROUPS.map((group) => group.id))
        for (const entry of KIT_STACK) {
            expect(groupIds.has(entry.group), `${entry.name} → ${entry.group}`).toBe(true)
            expect(entry.url).toMatch(/^https:\/\//)
            expect(entry.licence.length).toBeGreaterThan(2)
            expect(entry.use.length).toBeGreaterThan(10)
        }
    })

    it('prints the version and licence of the package that is installed', () => {
        for (const entry of KIT_STACK) {
            if (!entry.npm) continue
            const pkg = readPkg(entry)
            if (!pkg) continue // a fresh clone before install; CI installs first
            expect(pkg.version, `${entry.name}: installed ${pkg.version}, table says ${entry.version}`).toBe(entry.version)
            if (typeof pkg.license === 'string' && !/SEE LICENSE|^\(/.test(pkg.license) && !/gsap/i.test(entry.npm)) {
                expect(entry.licence, `${entry.name}: licence`).toBe(pkg.license)
            }
        }
    })

    // known-fixes 2026-10-05: versions typed into kitStack.js failed every
    // Dependabot bump (eight PRs stuck). They come from the lock files now.
    it('takes every npm version from the lock files, none typed into the table', () => {
        const source = readFileSync(join(srcDir, 'kitStack.js'), 'utf8')
        const typed = source.split('\n').filter((line) => /npm: '/.test(line) && /\bversion: '/.test(line))
        expect(typed, 'an npm entry with a hand-written version').toEqual([])
        for (const entry of KIT_STACK) {
            if (!entry.npm) continue
            expect(entry.version, `${entry.name}: not in ${entry.server ? 'serverXR/' : ''}package-lock.json`).toMatch(/^\d+\.\d+\.\d+/)
        }
    })

    it('carries measured weights, not placeholders', () => {
        expect(kitWeights.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        for (const key of ['kitPageKB', 'coreKB', 'threeKB', 'firstLoadKB', 'firstLoadPhoneKB']) {
            expect(kitWeights[key], key).toBeGreaterThan(0)
        }
        // The page's own code must stay a small part: an order of magnitude
        // under the 3D engine a live picture fetches.
        expect(kitWeights.kitPageKB * 10).toBeLessThan(kitWeights.threeKB)
        // Opening /tools must not fetch the 3D engine (known-fixes 2026-09-28:
        // every route did, through a shared babel helper seated in three-vendor).
        expect(kitWeights.threeOnFirstLoad).toBe(false)
    })
})
