// The Kit — every tool di.iiii has, as data.
//
// One module, read by the /tools page (KitPage.jsx) and by its tests. A card
// is here only if the audit of 2026-09-28 saw the tool working with no account
// (`live`) or saw that it exists only on a person's own install (`install`).
// The audit's verdict per tool is in kitReady.json, copied from that audit; a
// tool it marked "not ready" cannot appear here — kitCatalogue.test.js fails
// the build if one does. Nothing on this page says "coming": if it does not
// work, it is not on the page.
//
// Every `try` path is a route the router really has (the test walks them
// through the same routing modules RootApp uses), every `sources` entry is a
// file that exists in this repo, every `wiki` id is a live article.
//
// Words: docs/ai/vocabulary.md. The tools are Studio · Nodes · Projection ·
// Light; the node canvas is never "Raw" in a sentence a person reads.

// Where a source link goes: the public repo, on the branch the dev tier runs.
export const KIT_SOURCE_BASE = 'https://github.com/dob-0/di.iiii/blob/dev/'

// The way a person thinks about the tools, in this order. A group with no
// card in it is not drawn (there is no "capture" card today: the scan of a
// place was not ready to show when this was written).
export const KIT_GROUPS = [
    { id: 'walk', label: 'walk', line: 'Arrive, move through a scene, read how it works.' },
    { id: 'build', label: 'build', line: 'Make a scene of your own.' },
    { id: 'nodes', label: 'nodes', line: 'Wire it up and run it live.' },
    { id: 'light', label: 'light & projection', line: 'Put it on a wall and into the lights.' },
    { id: 'capture', label: 'capture', line: 'Bring a real place in.' },
    { id: 'carry', label: 'carry & share', line: 'Keep it as a file, publish it, hand it on.' },
    { id: 'together', label: 'together', line: 'Other people, in the same scene.' },
    { id: 'agents', label: 'for agents', line: 'Programs and assistants at the same doors.' }
]

// Placeholders the page fills from the visitor's own session.
export const SANDBOX_PLACEHOLDER = '{sandbox}'

// Libraries a card can name. One entry per library, so the official link is
// written once. `url` is the project's own site, never a mirror.
export const KIT_LIBS = {
    react: { name: 'React', url: 'https://react.dev' },
    reactRouter: { name: 'React Router', url: 'https://reactrouter.com' },
    three: { name: 'three.js', url: 'https://threejs.org' },
    r3f: { name: '@react-three/fiber', url: 'https://r3f.docs.pmnd.rs' },
    drei: { name: '@react-three/drei', url: 'https://drei.docs.pmnd.rs' },
    mui: { name: 'Material UI', url: 'https://mui.com' },
    socketio: { name: 'Socket.IO', url: 'https://socket.io' },
    express: { name: 'Express', url: 'https://expressjs.com' },
    node: { name: 'Node.js', url: 'https://nodejs.org' },
    nodeSqlite: { name: 'node:sqlite', url: 'https://nodejs.org/api/sqlite.html' },
    nodeDgram: { name: 'Node.js UDP (dgram)', url: 'https://nodejs.org/api/dgram.html' },
    nodeChildProcess: { name: 'Node.js child_process', url: 'https://nodejs.org/api/child_process.html' },
    passport: { name: 'Passport.js', url: 'https://www.passportjs.org' },
    webCrypto: { name: 'Web Crypto (ECDH P-256, AES-GCM)', url: 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto' },
    matrix3d: { name: 'CSS matrix3d', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/matrix3d' },
    clipboard: { name: 'Clipboard API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API' },
    openGraph: { name: 'Open Graph', url: 'https://ogp.me' },
    ndi: { name: 'NDI', url: 'https://ndi.video' },
    artnet: { name: 'Art-Net', url: 'https://art-net.org.uk' },
    sacn: { name: 'sACN (ANSI E1.31)', url: 'https://tsp.esta.org/tsp/documents/published_docs.php' },
    enttec: { name: 'ENTTEC DMX USB Pro', url: 'https://www.enttec.com/product/lighting-communication-protocols/dmx512/dmx-usb-pro/' },
    mcp: { name: 'Model Context Protocol', url: 'https://modelcontextprotocol.io' },
    zod: { name: 'zod', url: 'https://zod.dev' },
    tar: { name: 'GNU tar', url: 'https://www.gnu.org/software/tar/' },
    systemd: { name: 'systemd user units', url: 'https://systemd.io' },
    shell: { name: 'POSIX shell', url: 'https://pubs.opengroup.org/onlinepubs/9799919799/utilities/sh.html' },
    powershell: { name: 'PowerShell', url: 'https://learn.microsoft.com/powershell/' }
}

// The `di` command's own help, quoted line for line. kitCatalogue.test.js runs
// `node scripts/di/cli.mjs help` and fails if any line here has drifted from it.
export const DI_HELP_LINES = [
    'di up            start it, and open it',
    'di down          stop it',
    'di status        what is running, where, and how big',
    'di open          open it in your browser',
    'di new NAME      start a new space',
    'di save SPACE    save it as one file you can carry anywhere',
    'di open FILE     open a file someone saved (or di open, for di.iiii itself)',
    'di spaces        what is in this di.iiii',
    'di backup        every space and the light show, in one file',
    'di restore FILE  read one back in',
    'di mcp           hand this di.iiii to Claude, or any agent that speaks MCP',
    'di stage join SPACE --from URL   make this machine the one under the projector',
    'di stage status  what it is showing, and why not · di stage leave to undo it',
    'di update        get the newest version — never touches your work',
    'di doctor        what this machine can and cannot do',
    'di uninstall     remove it, keep your work',
    '--port N     run somewhere other than 4000',
    '--lan        answer on this wifi too, for phones in the room — anyone on it can edit',
    '--guests     with --lan: visitors get their own room, not yours'
]

const help = (...prefixes) => prefixes.map((prefix) => DI_HELP_LINES.find((line) => line.startsWith(prefix)))

// The one-line install, as the wiki prints it (di-cli-local).
export const INSTALL_LINES = [
    'macOS and Linux — curl -fsSL https://diiii.xyz/get | sh',
    'Windows (PowerShell) — irm https://diiii.xyz/get.ps1 | iex'
]

// The four tools the agent door registers (sdk/mcp.mjs).
export const MCP_TOOL_NAMES = ['di_find', 'di_describe', 'di_call', 'di_run']

// What a saved space unpacks to — the paths inside a .diiii, read from
// scripts/space-bundle.mjs (the test checks each name appears there).
export const DIIII_FILE_ENTRIES = ['space.json', 'scene.json', 'projects/', 'assets/', 'lighting/show.json']

const preview = {
    // A real route in the app, framed at ?preview=1 once the card is asked for
    // it: still camera, no toolbar, one live card at a time. `poster` is the
    // still shown until then — a real screenshot of that surface.
    frame: (path, poster) => ({ kind: 'frame', path, poster }),
    // A still only: a real screenshot, never a mock.
    still: (poster) => ({ kind: 'still', poster }),
    // Lines of real text — a command's help, a file's contents — for a tool
    // that has no picture on the web.
    text: (lines) => ({ kind: 'text', lines })
}

const web = 'web'
const install = 'install'
const both = 'both'

export const KIT_TOOLS = [
    // ── walk ─────────────────────────────────────────────────────────────
    {
        id: 'landing',
        group: 'walk',
        name: 'Front door',
        line: 'The address opens straight into a scene you can walk through, not a page about one.',
        where: web,
        try: { path: '/', label: 'Open' },
        preview: preview.frame('/?room=1', '/kit/landing.webp'),
        show: [{ label: 'diiii.xyz', href: 'https://diiii.xyz/' }],
        madeWith: ['react', 'reactRouter'],
        sources: ['src/RootApp.jsx', 'src/landing/LandingPage.jsx'],
        wiki: 'the-front-door'
    },
    {
        id: 'walk',
        group: 'walk',
        name: 'Walk / Fly',
        line: 'Move through a public scene on foot or in the air — keyboard and mouse at a desk, a thumb on a phone.',
        where: web,
        try: { path: '/wcc/alla-virabyan', label: 'Walk in' },
        preview: preview.frame('/wcc/alla-virabyan', '/kit/walk.webp'),
        show: [
            { label: 'Alla Virabyan', href: 'https://diiii.xyz/wcc/alla-virabyan' },
            { label: 'Dilijan', href: 'https://diiii.xyz/dilijan' },
            { label: 'the front room', href: 'https://diiii.xyz/?room=1' }
        ],
        madeWith: ['three', 'r3f', 'drei'],
        sources: ['src/components/LiveProjectScene.jsx', 'src/project/components/PublicProjectViewer.jsx', 'src/components/walkModeConfig.js'],
        wiki: 'scenes-that-show-themselves'
    },
    {
        id: 'works',
        group: 'walk',
        name: 'Works',
        line: 'Finished pieces at their own addresses — an exhibition, a bridge, a network, a village.',
        where: web,
        try: { path: '/wcc', label: 'Open one' },
        preview: preview.frame('/wcc', '/kit/works.webp'),
        show: [
            { label: 'WCC', href: 'https://diiii.xyz/wcc' },
            { label: 'algovrithm', href: 'https://diiii.xyz/algovrithm' },
            { label: 'br_id_ge', href: 'https://diiii.xyz/br-id-ge' },
            { label: 'the network', href: 'https://diiii.xyz/network' },
            { label: 'Beyond Form', href: 'https://diiii.xyz/beyond-form' },
            { label: 'Dilijan', href: 'https://diiii.xyz/dilijan' }
        ],
        madeWith: ['react'],
        sources: ['src/works/works.js', 'src/works/routes.jsx'],
        wiki: 'wcc-exhibition'
    },
    {
        id: 'wiki',
        group: 'walk',
        name: 'Wiki',
        line: 'How everything here works, in plain words. Every article keeps its address.',
        where: web,
        try: { path: '/wiki', label: 'Read' },
        preview: preview.frame('/wiki', '/kit/wiki.webp'),
        show: [{ label: 'the words, in one place', href: '/wiki#glossary' }],
        madeWith: ['react'],
        sources: ['src/wiki/wikiContent.js', 'src/wiki/WikiPage.jsx'],
        wiki: 'glossary'
    },
    {
        id: 'privacy-terms',
        group: 'walk',
        name: 'Privacy & Terms',
        line: 'What the site keeps about you, and the terms it runs under. The code is free software, AGPL-3.0.',
        where: web,
        try: { path: '/terms', label: 'Read' },
        preview: preview.frame('/terms', '/kit/privacy-terms.webp'),
        show: [{ label: 'privacy', href: '/privacy' }, { label: 'terms', href: '/terms' }],
        madeWith: ['react'],
        sources: ['src/pages/TermsPage.jsx', 'src/pages/PrivacyPage.jsx'],
        wiki: 'privacy-and-terms'
    },

    // ── build ────────────────────────────────────────────────────────────
    {
        id: 'studio',
        group: 'build',
        name: 'Studio',
        line: 'Build a scene in floating panels: add shapes and lights, arrange them, set the world, share the result.',
        where: web,
        try: { path: '/open/studio', label: 'Open in the Open Space' },
        preview: preview.frame('/open/studio/projects/open-jam', '/kit/studio.webp'),
        show: [
            { label: 'Alla Virabyan', href: 'https://diiii.xyz/wcc/alla-virabyan' },
            { label: 'Dilijan', href: 'https://diiii.xyz/dilijan' }
        ],
        madeWith: ['three', 'r3f', 'drei', 'mui'],
        sources: ['src/studio/StudioApp.jsx', 'src/studio/components/StudioShell.jsx', 'src/project/hooks/useProjectDocumentSync.js'],
        wiki: 'studio-basics'
    },
    {
        id: 'sandbox',
        group: 'build',
        name: 'Sandbox',
        line: 'A private space of your own, given to every visitor, account or not. It stays while you keep coming back, and clears after seven quiet days; sign in and it comes with you.',
        where: web,
        try: { path: `/${SANDBOX_PLACEHOLDER}/studio`, label: 'Open yours' },
        preview: preview.frame(`/${SANDBOX_PLACEHOLDER}/studio`, '/kit/sandbox.webp'),
        show: [],
        madeWith: ['express', 'nodeSqlite'],
        sources: ['serverXR/src/index.js', 'serverXR/src/authAccess.js', 'serverXR/src/spaceStore.js'],
        wiki: 'guest-and-sandbox-modes'
    },
    {
        id: 'make',
        group: 'build',
        name: 'Make',
        line: 'One scene as a full-screen playground with four controls — add, colour, photo, talk. Made for a child holding a phone.',
        where: web,
        try: { path: '/open/make/open-jam', label: 'Play' },
        preview: preview.frame('/open/make/open-jam', '/kit/make.webp'),
        show: [],
        madeWith: ['three', 'r3f', 'drei'],
        sources: ['src/make/MakeSurface.jsx', 'src/make/MakeRoom.jsx', 'src/raw/components/RawViewport.jsx'],
        wiki: 'the-toybox'
    },
    {
        id: 'lamps',
        group: 'build',
        name: 'Lights in a scene',
        line: 'Point, spot and directional lights you place in Studio and aim in degrees. A fixture number can join one to a lighting desk in the room.',
        where: web,
        try: { path: '/open/studio', label: 'Open Studio' },
        preview: preview.still('/kit/lamps.webp'),
        show: [],
        madeWith: ['three', 'r3f'],
        sources: ['src/objectComponents/SpotLightObject.jsx', 'src/project/viewport/spotLightAim.js', 'src/project/entityRegistry.js'],
        wiki: 'lights-on-a-place'
    },

    // ── nodes ────────────────────────────────────────────────────────────
    {
        id: 'nodes',
        group: 'nodes',
        name: 'Nodes',
        line: 'Wire cards together on a canvas — numbers, shapes, pictures, sound, devices — and the scene follows the graph live.',
        where: web,
        try: { path: '/open/raw/projects/open-jam', label: 'Open the canvas' },
        preview: preview.frame('/open/raw/projects/open-jam', '/kit/nodes.webp'),
        show: [{ label: 'the Open Space as nodes', href: 'https://diiii.xyz/open/raw/projects/open-jam' }],
        madeWith: ['react', 'three', 'r3f'],
        sources: ['src/raw/RawApp.jsx', 'src/raw/components/RawEditor.jsx', 'src/project/nodeRegistry.js', 'src/raw/components/NodePalette.jsx'],
        wiki: 'what-a-node-is-made-of'
    },
    {
        id: 'perform',
        group: 'nodes',
        name: 'Perform',
        line: 'Run a show from a project with only the windows the job needs — a VJ deck, the wall, a clock, master and blackout — kept as a preset.',
        where: web,
        try: { path: '/open/perform/open-jam', label: 'Open' },
        preview: preview.frame('/open/perform/open-jam', '/kit/perform.webp'),
        show: [],
        madeWith: ['react'],
        sources: ['src/perform/PerformApp.jsx', 'src/perform/PerformDesk.jsx', 'src/perform/presets.js'],
        wiki: 'perform'
    },

    // ── light & projection ───────────────────────────────────────────────
    {
        id: 'projection',
        group: 'light',
        name: 'Projection',
        line: 'Drag each surface’s four corners onto the shape a projector hits, mask it, and play a project, a page, a video or a camera inside it.',
        where: web,
        try: { path: '/open/map/open-jam', label: 'Open' },
        preview: preview.frame('/open/map/open-jam', '/kit/projection.webp'),
        show: [],
        madeWith: ['matrix3d', 'ndi'],
        sources: ['src/map/MapSurface.jsx', 'src/map/MapOutput.jsx', 'src/map/cornerPin.js'],
        wiki: 'projection-mapping'
    },
    {
        id: 'light',
        group: 'light',
        name: 'Light',
        line: 'Patch fixtures, build scenes and cues, and send them to real lights over Art-Net, sACN or a USB DMX widget. It runs on a di.iiii on your own machine, in the room with the lights.',
        where: install,
        try: { path: '/light', label: 'Open' },
        preview: preview.still('/kit/light.webp'),
        show: [],
        madeWith: ['artnet', 'sacn', 'enttec', 'nodeDgram'],
        sources: ['serverXR/src/routes/lightingRoutes.js', 'serverXR/src/lighting/desk.js', 'serverXR/src/lighting/artnet.js', 'serverXR/src/lighting/sacn.js', 'serverXR/src/lighting/enttec.js'],
        wiki: 'lighting-desk'
    },
    {
        id: 'stage-machine',
        group: 'light',
        name: 'di stage',
        line: 'One command makes the computer wired to the projector the machine under it: it keeps the output on every screen it was given, full screen, and comes back with the machine.',
        where: install,
        try: null,
        preview: preview.text(help('di stage join', 'di stage status')),
        show: [],
        madeWith: ['nodeChildProcess', 'systemd'],
        sources: ['scripts/di/stage.mjs', 'scripts/di/stagePlan.mjs', 'docs/architecture/RIG.md'],
        wiki: 'the-machine-under-the-projector'
    },
    {
        id: 'rig',
        group: 'light',
        name: 'The rig',
        line: 'Every di.iiii started with di up --lan on the same wifi finds the others within seconds, lists them as machines, and any one can send a cue or a blackout to any other.',
        where: install,
        try: null,
        preview: preview.text(help('di up', '--lan', '--guests')),
        show: [],
        madeWith: ['nodeDgram'],
        sources: ['serverXR/src/rig/discovery.js', 'serverXR/src/rig/protocol.js', 'serverXR/src/rig/members.js', 'docs/architecture/RIG.md'],
        wiki: 'the-rig'
    },

    // ── carry & share ────────────────────────────────────────────────────
    {
        id: 'diiii-file',
        group: 'carry',
        name: '.diiii file',
        line: 'A whole space in one file — the scene, every edit, the projects, the pictures and models, the light show — that opens on any di.iiii.',
        where: both,
        try: { path: '/serverXR/api/spaces/open/bundle', label: 'Save the Open Space as a file', download: true },
        preview: preview.text(['open.diiii', ...DIIII_FILE_ENTRIES.map((entry) => `  ${entry}`)]),
        show: [],
        madeWith: ['tar', 'nodeSqlite'],
        sources: ['scripts/space-bundle.mjs', 'serverXR/src/routes/spaceRoutes.js'],
        wiki: 'di-cli-local'
    },
    {
        id: 'space-bundle',
        group: 'carry',
        name: 'Space bundle',
        line: 'The same file from the command line: di save packs a space, di open reads one back, di backup takes everything at once.',
        where: install,
        try: null,
        preview: preview.text(help('di save', 'di open FILE', 'di backup', 'di restore')),
        show: [],
        madeWith: ['tar', 'nodeSqlite'],
        sources: ['scripts/space-bundle.mjs', 'scripts/send.mjs', 'scripts/di/cli.mjs'],
        wiki: 'di-cli-local'
    },
    {
        id: 'spaces',
        group: 'carry',
        name: 'Spaces',
        line: 'Every public space as a card, a list or a map. A space is an address, a guest list and everything in it; sign in to make one that is yours.',
        where: web,
        try: { path: '/spaces', label: 'Browse' },
        preview: preview.still('/kit/spaces.webp'),
        show: [{ label: 'spaces', href: 'https://diiii.xyz/spaces' }],
        madeWith: ['react', 'nodeSqlite'],
        sources: ['src/studio/components/SpaceHub.jsx', 'serverXR/src/routes/spaceRoutes.js', 'serverXR/src/spaceStore.js'],
        wiki: 'spaces-and-projects'
    },
    {
        id: 'publishing',
        group: 'carry',
        name: 'Publishing',
        line: 'Give one project a short public address — /space/name — and choose whether the space around it is open or behind a door.',
        where: web,
        try: null,
        needs: { text: 'Sign in, then Share in Studio.', href: '/login', label: 'Sign in' },
        preview: preview.frame('/network', '/kit/publishing.webp'),
        show: [
            { label: 'Alla Virabyan', href: 'https://diiii.xyz/wcc/alla-virabyan' },
            { label: 'the network', href: 'https://diiii.xyz/network' }
        ],
        madeWith: ['express'],
        sources: ['serverXR/src/routes/projectRoutes.js', 'src/utils/spaceRouting.js'],
        wiki: 'publishing'
    },
    {
        id: 'pages',
        group: 'carry',
        name: 'Page',
        line: 'A project can be a published web page — HTML, CSS and JS — served at the space’s address and pushed from a folder on your own machine.',
        where: web,
        try: null,
        needs: { text: 'A folder of files and one script.', href: `${KIT_SOURCE_BASE}scripts/space-code-push.mjs`, label: 'the script' },
        preview: preview.frame('/br-id-ge', '/kit/pages.webp'),
        show: [
            { label: 'br_id_ge', href: 'https://diiii.xyz/br-id-ge' },
            { label: 'Beyond Form', href: 'https://diiii.xyz/beyond-form' }
        ],
        madeWith: ['node'],
        sources: ['scripts/space-code-push.mjs', 'scripts/sync-space-assets.mjs'],
        wiki: 'public-page-node'
    },
    {
        id: 'share',
        group: 'carry',
        name: 'Share',
        line: 'Copy a project’s or a space’s link. Add ?embed=1 to set it inside your own page; pasted into a chat, the link shows the space’s own card.',
        where: web,
        try: { path: '/spaces', label: 'Copy a link' },
        preview: preview.still('/kit/share.webp'),
        show: [{ label: 'a scene inside a page', href: 'https://diiii.xyz/open_jam/scene?embed=1' }],
        madeWith: ['clipboard', 'openGraph'],
        sources: ['serverXR/src/routes/ogRoutes.js', 'src/utils/previewMode.js'],
        wiki: 'public-page-node'
    },
    {
        id: 'offline',
        group: 'carry',
        name: 'Offline',
        line: 'Installed on your own machine, all of di.iiii runs with no internet — the program and every work — which is what a hall or a camp needs.',
        where: install,
        try: null,
        preview: preview.text(help('di up', 'di down', 'di status', 'di spaces')),
        show: [],
        madeWith: ['node'],
        sources: ['src/works/buildProfile.js', 'scripts/pack-runtime.mjs', 'serverXR/src/localRuntimeGuard.js'],
        wiki: 'di-cli-local'
    },
    {
        id: 'di-cli',
        group: 'carry',
        name: 'di',
        line: 'One command on your machine: run it, stop it, save a space, open a file, back everything up, hand it to an agent.',
        where: install,
        try: null,
        preview: preview.text(DI_HELP_LINES),
        show: [],
        madeWith: ['node'],
        sources: ['scripts/di/cli.mjs', 'scripts/di/args.mjs'],
        wiki: 'di-cli-local'
    },
    {
        id: 'installer',
        group: 'carry',
        name: 'Installer',
        line: 'One line installs di.iiii on macOS, Linux or Windows. It brings its own Node if the machine has none, and asks for no admin rights.',
        where: install,
        try: null,
        preview: preview.text(INSTALL_LINES),
        show: [],
        madeWith: ['shell', 'powershell'],
        sources: ['install.sh', 'install.ps1'],
        wiki: 'di-cli-local'
    },

    // ── together ─────────────────────────────────────────────────────────
    {
        id: 'open-space',
        group: 'together',
        name: 'Open Space',
        line: 'One shared scene anyone can walk into and add to, live, beside whoever else is there. What you place is public.',
        where: web,
        try: { path: '/open', label: 'Walk in' },
        preview: preview.frame('/open', '/kit/open-space.webp'),
        show: [{ label: 'the Open Space', href: 'https://diiii.xyz/open' }],
        madeWith: ['three', 'r3f', 'socketio'],
        sources: ['src/project/components/JamSurface.jsx', 'src/project/routing/jamRouting.js', 'src/project/hooks/useProjectPresence.js'],
        wiki: 'jam-surface'
    },
    {
        id: 'chat',
        group: 'together',
        name: 'Chat',
        line: 'A room for each space, and private one-to-one conversations encrypted in the browser.',
        where: web,
        try: { path: '/chat', label: 'Open' },
        preview: preview.still('/kit/chat.webp'),
        show: [],
        madeWith: ['socketio', 'webCrypto'],
        sources: ['src/chat/useSpaceChat.js', 'src/chat/p2pCrypto.js', 'serverXR/src/socketHandlers.js'],
        wiki: 'guests-in-the-room'
    },
    {
        id: 'sign-in',
        group: 'together',
        name: 'Sign in',
        line: 'GitHub or Google, or a username and a password — an install with no internet can still make accounts.',
        where: web,
        try: { path: '/login', label: 'Open' },
        preview: preview.frame('/login', '/kit/sign-in.webp'),
        show: [],
        madeWith: ['passport'],
        sources: ['serverXR/src/routes/authRoutes.js', 'serverXR/src/routes/passwordAuthRoutes.js', 'src/components/AuthGate.jsx'],
        wiki: 'accounts-of-our-own'
    },

    // ── for agents ───────────────────────────────────────────────────────
    {
        id: 'api',
        group: 'agents',
        name: 'API for apps',
        line: 'Programs may read what the public sees. Name yourself and the door opens wider: 300 reads a minute instead of 30.',
        where: web,
        try: { path: '/for-apps', label: 'Read the door sign' },
        preview: preview.frame('/for-apps', '/kit/api.webp'),
        show: [{ label: 'the live catalogue', href: '/serverXR/api/catalogue' }],
        madeWith: ['express'],
        sources: ['src/pages/ForAppsPage.jsx', 'serverXR/src/appVisitors.js', 'serverXR/src/catalogue/index.js'],
        wiki: 'for-apps'
    },
    {
        id: 'mcp',
        group: 'agents',
        name: 'The agent door',
        line: 'An agent such as Claude connects to your own di.iiii over MCP and reaches, through four tools, everything the live catalogue opens to it — never more than your own key can.',
        where: install,
        try: null,
        preview: preview.text([...help('di mcp'), '', ...MCP_TOOL_NAMES.map((name) => `  ${name}`)]),
        show: [{ label: 'the live catalogue', href: '/serverXR/api/catalogue' }],
        madeWith: ['mcp', 'zod'],
        sources: ['sdk/mcp.mjs', 'sdk/door.js', 'serverXR/src/catalogue/index.js', 'docs/architecture/SPEC_agent_door.md'],
        wiki: 'api-and-agents'
    }
]

// The groups that have cards, with their cards, in page order.
export const kitGroupsWithTools = (tools = KIT_TOOLS) => KIT_GROUPS
    .map((group) => ({ ...group, tools: tools.filter((tool) => tool.group === group.id) }))
    .filter((group) => group.tools.length > 0)

export const sourceUrl = (path) => `${KIT_SOURCE_BASE}${path}`

// A path that names a place in this same app (not a download, not another site).
export const isAppPath = (path) => typeof path === 'string' && path.startsWith('/') && !path.startsWith('/serverXR/')

// Every app route a card can send a person to, for the route contract.
export const kitAppPaths = (tools = KIT_TOOLS) => {
    const paths = new Set()
    for (const tool of tools) {
        if (tool.try?.path && !tool.try.download && isAppPath(tool.try.path)) paths.add(tool.try.path)
        if (tool.preview?.kind === 'frame') paths.add(tool.preview.path)
        for (const item of tool.show || []) if (isAppPath(item.href)) paths.add(item.href.split('#')[0])
        if (tool.needs?.href && isAppPath(tool.needs.href)) paths.add(tool.needs.href)
    }
    return [...paths]
}
