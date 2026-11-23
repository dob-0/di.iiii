import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WIKI_ARTICLES } from '../wiki/wikiContent.js'

// THE LANDING'S PROMISES ARE CLAIMS ABOUT THE PRODUCT, WRITTEN IN FOUR PLACES.
//
// The same sentences live in the platform home (`src/landing/LandingPage.jsx`,
// drawn at `/`), in the repo source of the standing copy (`spaces/main/pages/
// landing/index.html`, the project `di-landing` of the space `main`, at
// `/di-iiii/landing`), in the wiki articles the landing's cards point to, and in
// the wiki's own lede. On 2026-10-26 a checker and a skeptic read the page
// against the code and the live servers: twenty sentences were false or never
// measured ("you get a space of your own", "embed in your own site", "every
// space has a public URL", "under two minutes"…). Fixing one place left the
// others saying it, so this file keeps the list once and checks every place.
//
// Two halves, both executable:
//   1. RETIRED — a sentence that was proven false stays out of the places it was
//      written. The `why` is the proof, with its file, so the next person who
//      wants the sentence back reads what it cost.
//   2. NOW — the replacement is there, and where two pages share a sentence they
//      say the same thing (the front door spells optimized / organizers with a
//      z; the copy with an s. Nothing else may differ).
// Then six PREMISES: the wiki's new sentences are true only while the code is
// what it is today, so each premise is read from the code. If you change the
// code, this fails and sends you to the sentence.
//
// Not a style guard: it does not decide what the page may say, only that it
// does not say what was measured to be false. Evidence: the checker's and the
// skeptic's reports of 2026-10-26 (agent-reports-2026-10-26/fix-all/claims-*).
//
// OPEN, on purpose not asserted: "Connect a space to a GitHub repo — pushes
// auto-update the live space" (the copy's last card). It needs the owner signed
// in to read GET /serverXR/api/github/app on prod; configured:true and one push
// keeps the card, configured:false removes it.

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(join(repoDir, path), 'utf8')

// What a person reads: JS-escaped apostrophes, HTML entities and line breaks
// are source, not sentence.
const plain = (text) => text
    .replace(/\\'/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const article = (id) => {
    const found = WIKI_ARTICLES.find((a) => a.id === id)
    if (!found) throw new Error(`no wiki article "${id}"`)
    return plain([found.title, found.summary, ...found.body.flatMap((b) => (typeof b === 'string' ? [b] : b.list))].join(' '))
}

const SURFACE = {
    door: plain(read('src/landing/LandingPage.jsx')),
    copy: plain(read('spaces/main/pages/landing/index.html')),
    lede: plain(read('src/wiki/WikiPage.jsx')),
    'wiki:guest-and-sandbox-modes': article('guest-and-sandbox-modes'),
    'wiki:publishing': article('publishing'),
    'wiki:api-and-agents': article('api-and-agents')
}

const lacks = (where, fragment) => !SURFACE[where].toLowerCase().includes(fragment.toLowerCase())

// A fragment that was proven false, the places it was written, and the proof.
const RETIRED = [
    { claim: 1, text: 'you get a space of your own', in: ['door', 'copy'], why: 'Step inside makes no space: on the front door it flies the camera into the scene and asks for no session (LandingPage.jsx openDoor; LandingPage.test.jsx), on the copy it opens /spaces. A guest cannot make a named space (spaceRoutes.js, 403 auth_required).' },
    { claim: 2, text: 'for whoever opens your link', in: ['door', 'copy'], why: 'A new space is private; a stranger meets a sign-in wall unless the space is public or they hold an invite (StudioShellPanels.jsx PublishPanel).' },
    { claim: 3, text: 'across the world', in: ['copy'], why: 'Never measured: no remote run and no latency number anywhere in the repo.' },
    { claim: 4, text: 'cursors and changes live, in the same space', in: ['door', 'copy'], why: 'The cursor relay and the changes go to one project\'s room (socketHandlers.js `project-<id>`), not to the space.' },
    { claim: 5, text: 'Copy the space link to invite', in: ['door', 'copy'], why: 'Copy link gives the address visitors open; collaborators come in through Invite, a separate 7-day link (SpaceHub.jsx).' },
    { claim: 6, text: 'Lock editing or leave it open', in: ['door', 'copy'], why: 'No control in Studio or on the Spaces page sets allowEdits; the buttons are in the older editor only.' },
    { claim: 7, text: 'Open Studio →', in: ['door', 'copy', 'wiki:guest-and-sandbox-modes'], why: 'The link goes to the Spaces page; Studio is the four editing panels (vocabulary.md).' },
    { claim: 8, text: 'open your own room', in: ['door'], why: 'The button goes to the shared Open Space jam (buildJamScenePath); nothing there is "your own".' },
    { claim: 9, text: 'has a public URL', in: ['door', 'copy', 'wiki:publishing'], why: 'Every space has an address, but a private space opens for a visitor on a sign-in wall, not on its work (StudioShellPanels.jsx "Space is private"). Only a Public space opens with no sign-in, and a live project is not needed for that: it only decides what they see there (claim 23).' },
    { claim: 10, text: 'sets the sky', in: ['door', 'copy'], why: 'No Studio control is called sky; an environment map gives light and reflections, never a sky (WorldEnvironment.jsx).' },
    { claim: 11, text: 'embed in your own site', in: ['door', 'copy'], why: 'dev and prod send frame-ancestors \'self\' and two studio addresses (nginx.conf); an iframe on another site stays empty (browser test 2026-10-26).' },
    { claim: 11, text: 'put it in an iframe', in: ['wiki:publishing'], why: 'Same rule: the wiki told people to frame a published link on their own page.' },
    { claim: 12, text: 'Machine-readable endpoints at /serverXR/api/', in: ['door', 'copy'], why: 'GET /serverXR/api/ answers 404; the machine-readable list is /serverXR/api/catalogue.' },
    { claim: 13, text: 'Every object is a typed node', in: ['copy'], why: 'Objects and nodes are two lists of the project (projectSchema.js `entities`, `nodes`); no node type runs user scripts on a hosted server.' },
    { claim: 13, text: 'Objects and nodes on one canvas', in: ['copy'], why: 'The canvas is where nodes sit; objects stand in the scene (vocabulary.md).' },
    { claim: 14, text: 'served automatically', in: ['door', 'copy'], why: 'Nothing is optimised on upload: the server strips location data (assetScrub.js); only a .glb of 10 MB or more is offered optimising, in the browser (assetOptimization.js).' },
    { claim: 15, text: 'Publish anywhere', in: ['door', 'copy'], why: '"Embed" was false (claim 11) and "Export JSON" was a zip (studioProjectBundle.js); JSON is the API.' },
    { claim: 16, text: 'kept up to date as di.iiii grows', in: ['door', 'copy', 'lede'], why: 'Nothing ties the wiki to the code: on 2026-10-26, 31 of 118 articles were over 60 days old.' },
    { claim: 17, text: 'under two minutes', in: ['door', 'copy'], why: 'No timed first run exists anywhere in the repo.' },
    { claim: 18, text: 'automated systems alike', in: ['door', 'copy'], why: '"alike" says equal support; the four cards are not equal.' },
    { claim: 19, text: 'No 3D software experience needed', in: ['door', 'copy'], why: 'No first-time-user test exists.' },
    { claim: 20, text: 'conferences, or art shows', in: ['door', 'copy'], why: '"Conferences" has no feature or use on record.' },
    { claim: 1, text: 'opens your own private sandbox', in: ['wiki:guest-and-sandbox-modes'], why: 'On the front door Step inside flies into the scene; the sandbox is on the Spaces page.' },
    // Claim 22: found by the same read, after the first pass. A local install shows its own line under the buttons.
    { claim: 22, text: 'Studio is a room on the same desk', in: ['door'], why: 'It names no button and says `desk`, a word the dictionary retired ("say the true thing", vocabulary.md). Step inside is a camera move into the scene, on a local install as on a hosted one (LandingPage.jsx openDoor).' },
    // Claims 23 to 25: found in a third pass. A skeptic read the two wiki paragraphs
    // the second pass had re-stamped "2026-10-26" and found them still false.
    // Claim 23's sentence was written on this branch (red against its earlier
    // head 25eb141a2, not against dev); 24 and 25 are older sentences the branch
    // kept in the guest article (red against origin/dev too).
    { claim: 23, text: 'only when two things are true', in: ['wiki:publishing'], why: 'Marking the space Public is enough. requireReadRole passes every GET on a public space before it looks at a live project (serverXR/src/index.js), SpaceSurfaceRoute drops the sign-in wall for it (RootApp.jsx), and with no live project SpaceSurfaceApp shows the space itself. Measured on dev 2026-10-26: the space the-light-put-back is public with publishedProjectId null, and GET /serverXR/api/spaces/the-light-put-back/scene answers 200 with no session.' },
    { claim: 24, text: 'The room has one address', in: ['wiki:guest-and-sandbox-modes'], why: 'The space main has the slug di-iiii. Seen in the agent browser on dev and on the own di, 2026-10-26: /di-iiii stays at /di-iiii and draws the same scene as /?room=1. The copy links /di-iiii. And "room" is not the 3D place: the dictionary reversed Room to Scene (vocabulary.md, 2026-08-19).' },
    { claim: 25, text: 'it just heals to / so', in: ['wiki:guest-and-sandbox-modes'], why: 'A bare /main heals to /?room=1, the scene without the page (RootApp.jsx isBareHomeSpacePath), and not at all on a local install. Seen 2026-10-26: dev /main ends at /?room=1; the own di /main stays /main and draws the scene.' }
]

// The replacement. `both` is one sentence on both pages; `door` / `copy` differ
// only where the page's voice does.
const NOW = [
    { claim: 1, door: 'Click "Step inside" to walk into the scene behind this page. Build in a private sandbox on the Spaces page — no account needed. Sign in to keep it.', copy: 'Open the Spaces page — a private sandbox is yours to build in, no account needed. Sign in to keep it and to make spaces of your own.' },
    { claim: 2, both: 'no account to start, nothing to install — for you, and for whoever you send a public link or an invite.' },
    { claim: 3, copy: 'See live cursors and changes in the same project. They join from a browser tab, nothing to install.' },
    { claim: 4, both: 'cursors and changes live, in the same project.' },
    { claim: 5, both: 'Copy an invite link for collaborators, or set the project live and make the space public.' },
    { claim: 6, both: 'Share by link, keep it private or make it public.' },
    { claim: 7, both: 'Already have spaces? Open your Spaces →' },
    { claim: 8, door: 'walk into the Open Space →' },
    { claim: 9, copy: 'Every space has its own address. Set a project live, make the space public and share the link — visitors see your work in their browser or in a VR/AR headset.' },
    { claim: 10, both: 'The Scene window sets the background and the lighting. Select an object and edit it in the Objects window.' },
    { claim: 11, both: 'connect via the serverXR API, or drive di.iiii from an agent over MCP.' },
    { claim: 12, both: 'Read scene state and space data over the serverXR REST API; signed in, change objects too. The machine-readable list is at /serverXR/api/catalogue.' },
    { claim: 13, copy: 'Objects and nodes in one project' },
    { claim: 13, copy: 'Place objects in the scene, wire nodes on the canvas — one project holds both.' },
    { claim: 14, door: 'Photos are stripped of location data; a large .glb can be optimized before it goes up.', copy: 'Photos are stripped of location data; a large .glb can be optimised before it goes up.' },
    { claim: 15, both: 'Publish by link' },
    { claim: 15, both: 'Set a project live and make the space public — anyone can open its address. Save a space as a .diiii file from your Spaces page, or read a project as JSON over the API.' },
    { claim: 16, both: 'free accounts, publishing, and the API.' },
    { claim: 17, both: 'Four steps, from a new space to a link you can share.' },
    { claim: 18, door: 'artists, developers, organizers, and automated systems.', copy: 'artists, developers, organisers, and automated systems.' },
    { claim: 20, both: 'for live events or art shows.' },
    { claim: 22, door: 'no account, no quota. Step inside walks into the scene.' }
]

describe('landing promises: what was proven false stays out', () => {
    for (const row of RETIRED) {
        it(`claim ${row.claim}: "${row.text}" is gone from ${row.in.join(', ')}`, () => {
            for (const where of row.in) {
                expect(lacks(where, row.text), `${where} says "${row.text}" again. ${row.why}`).toBe(true)
            }
        })
    }
})

describe('landing promises: the replacements are there, and the two pages agree', () => {
    for (const row of NOW) {
        const door = row.door ?? row.both
        const copy = row.copy ?? row.both
        it(`claim ${row.claim}: ${(door ?? copy).slice(0, 60)}…`, () => {
            if (door) expect(SURFACE.door, 'the front door (src/landing/LandingPage.jsx)').toContain(door)
            if (copy) expect(SURFACE.copy, 'the copy (spaces/main/pages/landing/index.html)').toContain(copy)
        })
    }

    it('the copy links the space by its address, not its id', () => {
        // The live page already says /di-iiii (apply-structure moved the address,
        // N1290); the repo source still said /main, so the next push from the repo
        // would have put the old link back over the live one.
        expect(read('spaces/main/pages/landing/index.html')).toContain('href="/di-iiii"')
        expect(read('spaces/main/pages/landing/index.html')).not.toContain('href="/main"')
    })

    it('the wiki articles the landing points to say today\'s behaviour', () => {
        const guest = SURFACE['wiki:guest-and-sandbox-modes']
        expect(guest).toContain('“Step inside” button walks you into the scene behind the page')
        expect(guest).toContain('Open your Spaces →')
        const publishing = SURFACE['wiki:publishing']
        expect(publishing).toContain('Each space has its own address at /<space>. Mark the space Public and anyone can open it without signing in; set a project live and that project is what they see there.')
        expect(publishing).toContain('does not let another website show the link in a frame')
        const api = SURFACE['wiki:api-and-agents']
        expect(api).toContain('/serverXR/api/catalogue')
        expect(api).toContain('Reading a public space needs no sign-in. Changing anything does')
        expect(api).toContain('run di mcp from an install')
    })

    it('the guest article names the front door\'s routes as they are today, in dictionary words', () => {
        // A skeptic found this paragraph still false after the second pass had
        // re-stamped the article: "The room has one address and it is the bare
        // domain" (the space has its own, /di-iiii), "heals to /" (it heals to
        // /?room=1, and not at all on a local install) and "room" for the 3D
        // place, which the dictionary calls a scene (Room was reversed to Scene
        // on 2026-08-19). copyVocabulary.test.js leaves lowercase "room" alone on
        // purpose ("read new copy for the sense"), so the sense is read here.
        const paragraph = WIKI_ARTICLES.find((a) => a.id === 'guest-and-sandbox-modes')
            .body.find((b) => typeof b === 'string' && b.startsWith('The front door is the landing page'))
        expect(paragraph, 'the front-door paragraph of the guest article').toBeTruthy()
        const text = plain(paragraph)
        expect(text).toContain('a phone loads the scene only when you press “Step inside”')
        expect(text).toContain('?room=1 opens the scene bare, without the page')
        expect(text).toContain('its own address, /di-iiii')
        expect(text).toContain('heals to /?room=1')
        expect(text).toContain('the landing page is at /?tour=1, and /main is not rewritten')
        // No "room" for a place, except the query value the address really has.
        expect(text.replaceAll('?room=1', '')).not.toMatch(/\brooms?\b/i)
        // The address it names is the one the copy links.
        expect(read('spaces/main/pages/landing/index.html')).toContain('href="/di-iiii"')
    })
})

describe('landing promises: the premises the new sentences stand on', () => {
    it('hosted servers still refuse to be framed by another site (wiki: publishing)', () => {
        // The article says an iframe on another site stays empty. That is true
        // while nginx answers frame-ancestors 'self' (+ the studio's own two
        // addresses). If framing is ever opened, change the article, the
        // Developers card and this test in the same commit.
        const nginx = read('nginx.conf')
        expect(nginx).toMatch(/frame-ancestors 'self'/)
        expect(nginx).not.toMatch(/frame-ancestors[^;"]*\*/)
    })

    it('the endpoints the pages name are routes the server has (wiki: api-and-agents)', () => {
        expect(read('serverXR/src/index.js')).toContain("router.get('/api/catalogue'")
        expect(read('serverXR/src/routes/spaceRoutes.js')).toContain("router.get('/api/spaces/:spaceId/scene'")
        expect(read('serverXR/src/routes/projectRoutes.js')).toContain("router.get('/api/projects/:projectId/document'")
    })

    it('the front door\'s Step inside is still a camera move, not a navigation (wiki: guest-and-sandbox-modes)', () => {
        // The wiki says Step inside makes nothing and asks for no sign-in. The
        // behaviour is pinned in LandingPage.test.jsx (preventDefault, no session
        // call); this pins the comment-free source line the sentence leans on.
        const door = read('src/landing/LandingPage.jsx')
        expect(door).toContain('event.preventDefault()')
        expect(door).toContain('flyInside(')
    })

    it('a phone gets the scene only when the door is pressed (wiki: guest-and-sandbox-modes)', () => {
        // Seen 2026-10-26 at 390 px: the hero is a plain page, no rings, no grid.
        // The door mounts the scene at rest only above 520 px, and on a press it
        // loads the chunk and flies anyway.
        const door = read('src/landing/LandingPage.jsx')
        expect(door).toContain("window.matchMedia?.('(max-width: 520px)').matches")
        expect(door).toContain('const showBackground = entered || flightArmed || (heroInView && !isSmallScreen && landingBackdropOn())')
    })

    it('a public space opens with no live project (wiki: publishing)', () => {
        // The article says Public alone opens a space and a live project only
        // decides what visitors see there. Server: the public pass is the first
        // thing requireReadRole does with a space, before any look at a live
        // project. Client: the sign-in wall is dropped for a public space
        // whether or not a project is live.
        const server = read('serverXR/src/index.js')
        const from = server.indexOf('const requireReadRole = ')
        const pass = server.indexOf('if (meta?.isPublic) return next()', from)
        expect(from, 'requireReadRole exists').toBeGreaterThan(-1)
        expect(pass, 'requireReadRole lets a public space through').toBeGreaterThan(from)
        expect(server.slice(from, pass), 'nothing before the public pass looks at a live project').not.toContain('publishedProjectId')
        expect(read('src/RootApp.jsx')).toMatch(/if \(canBePublic && isPublic\) \{\s*return <SpaceSurfaceApp routeState=\{appState\} \/>/)
    })

    it('the bare /main heals to /?room=1, not on a local install, and /?tour=1 keeps the landing (wiki: guest-and-sandbox-modes)', () => {
        const root = read('src/RootApp.jsx')
        expect(root).toContain('&& localInstall.resolved && !localInstall.isLocal')
        expect(root).toContain("params.set('room', '1')")
        expect(root).toContain("rootQuery.get('room') === '1'")
        expect(root).toContain("rootQuery.get('tour') === '1'")
        expect(root).toContain('localInstall.isLocal && !wantsTour')
    })
})
