// Single source of truth for the in-app Wiki / Help (/wiki) and the landing teaser.
//
// RULE: when you ship a user-facing feature or change user-visible behavior, add or
// update the matching article here and bump its `updated`. Surface headline items in
// WIKI_HIGHLIGHTS so the landing page stays current. (See AGENTS.md / golden_rules.)
//
// Article shape: { id, category, title, summary, body, tags, updated }
//   body: array of blocks — a string is a paragraph; { list: [...] } is a bullet list.

export const WIKI_CATEGORIES = [
    'Getting started',
    'Spaces & access',
    'Editing',
    'For developers'
]

export const WIKI_ARTICLES = [
    {
        id: 'spaces-and-projects',
        category: 'Getting started',
        title: 'Spaces & projects',
        summary: 'How the platform is organized: a space is a workspace that holds projects, assets, and its own access.',
        body: [
            'A space is a self-contained workspace. Each space holds its own projects, uploaded assets, collaborators, and access rules.',
            'A project is a single scene/document inside a space. A space can hold many projects, and one of them can be marked as the space’s published (live) project.',
            'URLs mirror this structure:',
            { list: [
                '/<space>/studio — the project hub for a space',
                '/<space>/studio/projects/<id> — the editor for one project',
                '/<space> — the public viewer for a space’s published project',
                '/<space>/p/<id> — the public viewer for any single project (on a public space, no login needed — share a draft or a second page without moving the published pointer)'
            ] }
        ],
        tags: ['spaces', 'projects', 'basics'],
        updated: '2026-07-13'
    },
    {
        id: 'spaces-map-view',
        category: 'Spaces & access',
        title: 'Grid or Map: two ways to see your spaces',
        summary: 'The Spaces page has a Grid/Map toggle — Map is a spatial, orbit-and-click view of your spaces and their projects.',
        body: [
            'The Spaces page (/studio) has a Grid / Map toggle next to the page title whenever you have at least one space. Grid is the familiar card shelves; Map renders every space as a node you can orbit around and zoom into.',
            'Click a node in Map view to open a side panel for that space — rename, copy the live link, make public/private, delete, and manage its projects — the same actions as the grid, just reached from the map. Clicking a selected node’s satellite projects lets you rename them or set one live. Which space is "Main" (marked with a badge here and on the grid) is set from /admin only.',
            'Your choice of Grid or Map is remembered on this device for next time.'
        ],
        tags: ['spaces', 'map', 'constellation', 'ui'],
        updated: '2026-07-17'
    },
    {
        id: 'guest-and-sandbox-modes',
        category: 'Spaces & access',
        title: 'The Open Space, your sandbox & guest mode',
        summary: 'Everyone shares one communal Open Space, and every visitor — guest or account — gets exactly one private sandbox.',
        body: [
            'The landing page’s “Step inside” button drops you straight into the Open Space’s shared build — no account, no space picker, one click to 3D.',
            'There are three kinds of places, and everyone gets the first two without an account:',
            { list: [
                'The Open Space — one shared world where every visitor can build, together, live. It is always there and survives cleanup; an admin can restore it from a daily snapshot if it gets trashed.',
                'Your sandbox — exactly one private scratch space per person, the same one every time you return (same browser for guests; account-bound once signed in). It never appears in anyone else’s directory, admins included.',
                'Your spaces — real named spaces you own and can publish. These need a sign-in.'
            ] },
            'The Spaces page (/studio) shows exactly these shelves: Open Space · Your sandbox · Your spaces — so the answer to “where am I, what’s mine” is always the page itself. Admins additionally see guest sandboxes collapsed into one row with a count and a “Sweep expired” action.',
            'A sandbox only comes into existence when you actually enter it — just viewing a published space never creates one. Guest sandboxes are cleaned up after about a week of inactivity. Account sandboxes are yours for good: one untouched for about six months is folded down to a scene snapshot to keep the system lean, and your next visit restores it exactly as you left it. A sandbox holding Studio projects is never archived.',
            'Guests cannot create their own named spaces — sign in with GitHub or Google to get spaces that are yours and stay.',
            'Opening the Share window as a guest offers the two ways to keep your work: sign in (GitHub / Google) — the room comes with you: your whole sandbox, scene, projects and assets, moves onto your account automatically — or Export the project as a file you can import into any space later. The sign-in confirmation says when your sandbox came along. Existing account work is never overwritten by a later guest session.',
            'For a live jam — an event, a workshop, a projected wall — share the short link di-studio.xyz/open_jam (or turn it into a QR code). It opens the shared Open Jam directly, and a one-line welcome shows first-timers how to add their visual. Anyone who scans can drop in an image, video or 3D model on the spot, no account needed.',
            'The Open Jam opens in a simple mode: one Create window with file upload and a few basic shapes — the full editor’s other windows and import options stay out of the way. Tapping an object opens a small Edit window (change your text, pick a color, or remove it). Anyone who wants the complete toolset can press “⚒ All tools” in the control cluster (and “◱ Simple” switches back); the choice is remembered on that device.',
            'For admins: /admin → Manage can repoint the communal space (the guest entry), and the Open Space can be restored from its latest daily snapshot if someone wrecks it.',
            'The landing page’s “Enter Space” button (distinct from “Step inside”) opens whichever space is set as "Main" under /admin → Manage → a space → “Set as main”. That space needs a published project to show anything; until one is set as Main, “Enter Space” falls back to a decorative walkable preview instead.'
        ],
        tags: ['guest', 'sandbox', 'open space', 'access', 'jam', 'qr'],
        updated: '2026-07-21'
    },
    {
        id: 'joining-a-space',
        category: 'Getting started',
        title: 'Invited to collaborate? Start here',
        summary: 'The whole path from an invite link to your first saved edit — in a browser tab, with nothing to install.',
        body: [
            'Someone sent you a link to a space. You do not need to install anything, clone anything, or open a terminal: a browser is the entire toolchain. (The repo has a developer setup guide as well — that is a different door, for people who want to run the platform itself, and you can ignore it.)',
            { list: [
                '1 — Open the link. It carries the invite; the space opens as soon as access is granted.',
                '2 — Sign in with GitHub or Google when asked. You can accept an invite as a guest, but a guest session lasts about 30 days and lives in one browser; signing in makes the access permanent and carries any work you already did onto your account.',
                '3 — You land in the space. /<space>/studio is its project hub: every project in the space, plus ＋ New to start one.',
                '4 — Open a project and build. There is no Save button — every change is written as you make it, and anyone else in the same project sees it live.',
                '5 — Stuck? The ? button in the Studio (or Shift+?) opens the illustrated guides and the full shortcut list.'
            ] },
            'What an invite gives you is access to that one space, as an editor. You can open and edit its projects, create new ones, upload files, and use every tool in the Studio.',
            'What it does not give you is the space itself. Publishing (setting which project is live), renaming, changing the public link, making the space public or private, minting further invites, and deleting are the owner’s — see "Who owns a space". If you need one of those, ask whoever invited you; if the space has no owner at all, a platform admin has to assign one first.',
            'Your own work is separate from all of this and always there: every visitor gets a private sandbox, and a signed-in account can create its own spaces. Being a collaborator in someone else’s space does not spend any of that.',
            'If the link says it is invalid or has expired, it is not you — invites last 7 days. Ask for a fresh one.'
        ],
        tags: ['invite', 'collaboration', 'onboarding', 'getting started', 'no install', 'editor', 'access'],
        updated: '2026-08-06'
    },
    {
        id: 'free-spaces',
        category: 'Spaces & access',
        title: '3 free spaces per account',
        summary: 'Every signed-in account can create up to 3 spaces for free.',
        body: [
            'Sign in with GitHub or Google and you can create up to 3 of your own spaces at no cost.',
            'The limit counts only spaces you created (own). Spaces an admin shares with you do not count against your 3.',
            'When you reach the limit the create button shows “Space limit reached” — delete a space you no longer need to make room.',
            'Admins and unrestricted accounts are exempt and can create unlimited spaces.'
        ],
        tags: ['spaces', 'quota', 'account'],
        updated: '2026-06-26'
    },
    {
        id: 'publishing',
        category: 'Spaces & access',
        title: 'Publishing & public spaces',
        summary: 'Make a project live and decide who can see it — right from your Spaces page.',
        body: [
            'Each space has a public URL at /<space>. Set a space’s published project, then mark the space Public to let anyone view it without signing in.',
            'If you own the space you do all of this yourself on the Spaces page (/studio): Rename, Public/Private, Link project, GitHub sync, and Delete sit on each of your space cards. No admin needed.',
            'Public spaces show their live link right on the card (and in the editor’s Spaces panel) with one-click Copy — that link is what visitors open. Public spaces you can’t edit are marked “View live”, and clicking their card takes you straight to the live view — one click, no login wall.',
            'Live space cards on the Spaces page also show a live preview — a real miniature of the published scene, streamed from the live route and always up to date. Previews only load while their card is on screen, so a long spaces list stays fast.',
            'Owners manage the card preview from the Preview button on the card: keep the live miniature or upload a custom cover image (Replace image / Use live preview to switch back anytime). A cover image also works on spaces that aren’t public yet.',
            'The editor’s Spaces panel has the same self-serve Make Public / Make Private toggle as the Spaces page.',
            'Publishing (which project is live) and visibility (Public/Private) are independent choices — linking a project does not automatically make the space public.',
            'A public space also shares every project individually at /<space>/p/<project-id> — the same no-login viewer as the live route, without touching the published pointer. Handy for one-pagers, drafts, and documents that live next to the main page. Like the live route, these pages are chrome-free — nothing floats over your design; hop between a space’s projects from the Studio Projects window.',
            'A published-but-private space shows a login wall to visitors instead of the scene. The editor’s Share window and the space card both tell you when that’s the case and offer a one-click “Make space public” right there — no hunting for the toggle.',
            'Opening an editor URL (like /<space>/studio) with an account that isn’t scoped to that space no longer dead-ends: if the space is public you are taken to its live view; only private spaces show the access-restricted screen.',
            'Every public space carries a small “Made with di.iiii — build yours” badge, so visitors who like what they see have a way in. It never appears on hub-card preview thumbnails.',
            'Spaces and individual projects can each get a clean public link (a slug) that’s independent of their internal id — e.g. /wcc/artistplace instead of a longer id-based path. Set it from /admin → Manage (“Edit public link” next to Rename); old id-based links keep working forever, they’re never replaced.',
            'Published code pages can use the visitor’s camera, microphone and motion sensors — but only if the project opts in by setting deviceAccess: true in its presentation state (repo-synced pages set it in their di-space manifest). Opted-in pages run without the usual origin isolation, so reserve it for pages you author yourself; everything else stays fully sandboxed. The visitor still gets the normal browser permission prompt either way.',
            'Published code pages can read the URL’s query string — /<space>/<page>?just=bkyi — through window.diiPageQuery (already parsed for you as window.diiPageParams). A published page is rendered inside a frame with no URL of its own, so location.search there is always empty; read new URLSearchParams(window.diiPageQuery || location.search) and the same code keeps working when you open the file locally. This is what lets one published page hand over to another with state — “open the field, on the core I just made”.'
        ],
        tags: ['publish', 'public', 'sharing', 'owner', 'live link', 'slug', 'custom link', 'camera', 'device access', 'query', 'url parameters'],
        updated: '2026-08-07'
    },
    {
        id: 'invite-links',
        category: 'Spaces & access',
        title: 'Invite links: share a private space',
        summary: 'Owners mint invite links that let anyone — even guests — step into a private space. No admin needed.',
        body: [
            'Every space card on the Spaces page (/studio) has an Invite button for spaces you own. One click mints a fresh invite link and copies it — send it to whoever you want in the room.',
            'Opening the link grants access on arrival: the recipient lands straight in the space, whether they are signed in or just a guest. Guests keep the access with their guest session (about 30 days); signing in later carries it onto their account along with their sandbox.',
            'An invite grants access to that one space only — it does not make anyone an owner, and invited people cannot mint further invites or manage the space.',
            'Each link is valid for 7 days and works for any number of people until it expires. Minting again gives a new link; the old one keeps working until its own expiry.',
            'Invalid or expired links show a clear message on the access screen — ask the owner for a fresh one.'
        ],
        tags: ['invite', 'sharing', 'collaboration', 'access', 'owner'],
        updated: '2026-07-12'
    },
    {
        id: 'space-ownership',
        category: 'Spaces & access',
        title: 'Who owns a space, and how to hand one over',
        summary: 'Every space should have an owner — they manage it without needing an admin. Admins can assign or release ownership at any time.',
        body: [
            'The owner of a space is whoever created it. Ownership is what makes a space self-service: the owner publishes, mints invites, renames, changes the public link, and can delete it — none of which needs an admin.',
            'A space can also have no owner. That happens when it was provisioned over the API rather than created in the browser — every space linked to a GitHub repo starts this way. Such a space works normally, but every management action in it falls to a platform admin, which quietly makes one person the bottleneck.',
            'Admins assign the owner in /admin → Manage → pick the space → Owner & access. The panel names the current owner, or says plainly that there is none. "Make owner" hands the space over and grants that account access in the same move; clicking it again on the current owner releases the space back to the platform.',
            'Only admins can change ownership — an owner cannot give their own space away. Granting access is a separate, smaller thing: it lets someone into the space without making them its owner (that is also what an invite link does).'
        ],
        tags: ['owner', 'ownership', 'access', 'admin', 'handover', 'collaboration', 'spaces'],
        updated: '2026-08-05'
    },
    {
        id: 'studio-basics',
        category: 'Editing',
        title: 'Studio editor basics',
        summary: 'Add objects, arrange them, and tune the scene.',
        body: [
            'Open the Studio, pick or create a project, and start building.',
            { list: [
                'Five scene windows, one per job: Create (shapes, lights, and one Files library — imports, Google Drive, Commons), Scene (entity tree + selected-entity editing), World (scene-wide settings), Share (publish, export, activity), Code (HTML/CSS/JS files + the 3D↔code viewport toggle).',
                'A sixth, space-level window — Projects — lists every project in the space: click to switch, ＋ New to create, hover a row to rename or delete (the live project is badged; deleting it clears the published pointer). No more hub round-trips to hop between projects.',
                'Every file — uploaded, from Google Drive, or from the Commons — sits in the Create window’s Files list with + Add to place it in the scene, badges for scene usage and public sharing, and × to delete. PDFs import as image pages.',
                'Drag to position; edit the selected entity in the Scene window — world defaults live in the World window.',
                'In the Scene tree: double-click any entity to rename it, and use the per-row circle (show/hide) and square (lock/unlock) toggles — hidden entities disappear from the scene, locked ones can be selected but not moved.',
                'Duplicate (Ctrl+D / Shift+D) and copy/paste (Ctrl+C / Ctrl+V) carry whole hierarchies — duplicating a group brings all of its children along, and copy works on multi-selections.',
                'Drag a Scene-tree row onto a group to nest it (world position is kept), onto another entity to make them siblings, or onto empty list space to move it back to the root.',
                'Drop files straight onto the viewport — from your computer or from the Create window’s Files list — and they land in the scene at the point under your cursor.',
                'Hold Ctrl while dragging a gizmo or during G/R/S to snap: 0.5-unit moves, 15° rotations, 0.1 scale steps. Or type an exact value mid-operation (R, Y, then 45 = 45°; S then 2 = double size). Rotating or scaling a multi-selection with G/R/S turns the whole arrangement around its shared center.',
                'Eight primitive shapes — box, sphere, cone, cylinder, plane, torus, capsule, ring — all take materials: one-click Presets (Matte, Metal, Glass, Glow — Glow uses the entity’s own color), any imported image as a Texture, and fine Roughness / Metalness / Emissive controls in the Appearance section.',
                'Videos can play sound: untick Muted and set Volume in the video’s Media section. Sound starts after the visitor’s first click or keypress (browser autoplay rules) — this works in the editor and on published pages.',
                'Text entities have full type controls: six 2D font choices with weight, italic, and alignment; and for 3D text, four sculpted typefaces (Helvetiker, Helvetiker Bold, Optimer, Gentilis) with depth and bevel shaping.',
                '3D models import as .glb/.gltf (including Draco-, Meshopt-, and KTX2-compressed exports), .obj (+.mtl via the Materials picker), .stl, and .fbx. Models with embedded animation clips play them automatically — pick a specific clip, toggle “Play animations”, or set “Animation speed” in the model’s Media section; rigged/skinned characters animate correctly.',
                'Import an .hdr/.exr panorama and pick it as the Environment map in the World window — image-based lighting and reflections apply in the editor and on published pages (this is what makes Metal and Glass presets shine).',
                'Keyframe animation (Timeline, Scene window): move the playhead, pose the object, press ● Key — two keys make motion. Keys capture position, rotation, scale, and opacity; drag a key diamond to retime it, click to jump, ▶ previews right in the editor, and Duration/Loop shape the cycle. Timelines play automatically on published pages and replace the default idle motion. Every key edit is a normal undo step.',
                'Undo / redo with Ctrl+Z / Ctrl+Y — undo reverts only your own last change (a slider drag or a typing burst counts as one step), so working alongside collaborators is safe: their edits are never rolled back by your undo.',
                'History (Scene window, collapsed at the bottom): a Photoshop-style list of your session’s steps — click any step to jump back or forward to it, or “Session start” to rewind everything. Jumping is just batched undo/redo, so it is equally collaborator-safe.',
                'Your panel layout is fully remembered — open panels, positions, resized dimensions, and collapsed headers all restore next visit; shrinking the browser window pulls stranded panels back into view. Arrange → Reset returns everything to the default layout.',
                'Lost? The ? button (or Shift+?) opens the visual help: four illustrated guides — Move, Build, Edit, Share — plus the full keyboard-shortcut reference on its Shortcuts tab. On a guest’s very first visit a small coach pill walks through the three moves that matter — select something, add something, open Share — each hint completing itself the moment you do it.',
                'On a phone, Studio switches to a touch layout: the five windows become a bottom bar, each opening as a swipe-friendly sheet over the full-screen viewport, with back and Edit-mode buttons up top. The desktop floating-panel workspace is unchanged.',
                'If the browser ever drops the 3D graphics context (a GPU hiccup — the scene freezes or goes black), the viewport now recovers on its own; if it can’t, a “Restore 3D view” button appears instead of a dead canvas. The same safety net covers published pages.'
            ] }
        ],
        tags: ['studio', 'editor', 'basics'],
        updated: '2026-07-13'
    },
    {
        id: 'studio-content-model',
        category: 'Editing',
        title: 'How content flows',
        summary: 'One library of files feeds entities in the scene and the code view — the Studio mental model.',
        body: [
            'Everything you manage in Studio is one of three things: files (imported bytes), entities (objects placed in the 3D scene), and code (HTML/CSS/JS rendered in the Code view).',
            { list: [
                'Files: the Create window lists every file in one place — uploads, Google Drive imports, and Commons pulls. Each row shows where it lives (project / space), an “in scene ×N” badge when entities use it, and “public” when it is shared to the commons.',
                'Files are stored by content: re-importing a file the project already has (same bytes, any name) skips the upload and finishes instantly, and identical files across a space’s projects are stored only once.',
                '+ Add places a file into the scene as an entity. Deleting a file warns you when entities still use it — in this project or in other projects of the space.',
                'Code: the Code window edits HTML/CSS/JS files stored inside the project. The toggle at its top switches the viewport between the 3D scene and the code view, and the “Project file” picker inserts any file’s URL straight into your code.',
                'Instead of local files, the Code window can embed an external site (Embed external URL).',
                'Share controls what visitors see: the public entry view (3D scene or code) and the live route are set in the Share window.'
            ] }
        ],
        tags: ['studio', 'files', 'assets', 'code', 'content'],
        updated: '2026-07-09'
    },
    {
        id: 'scenes-that-show-themselves',
        category: 'Editing',
        title: 'Scenes that show themselves',
        summary: 'worldState settings that let a published scene present itself to a visitor who touches nothing — where they arrive, and a guided turn around a ring of objects.',
        body: [
            'A published scene has to work for someone who walks up, puts a headset on, and touches nothing — an exhibition visitor rather than an author. Three worldState settings cover that, and they apply to the walk/fly view, which is also the view a VR or AR session runs in.',
            { list: [
                'spawn — where the visitor arrives and which way they face (x, z, yaw, pitch, altY). Put whatever should be read first at that facing; the auto-framed camera of the orbit view ignores it, but walk, VR and AR all honour it.',
                'ringTour — a guided turn for work arranged in a circle. The view holds still on one object for dwell seconds, eases turn seconds round to the next, and repeats: stops (how many objects in the ring), startAngle (which one is first), direction, delay (dead time at the start, so an intro title is read before anything moves) and loop.',
                'The tour turns the visitor and never moves them, so it works the same on a laptop and in a headset. It surrenders permanently the moment the visitor turns the view themselves — an automatic turn that fights the mouse or the thumbstick is worse than none.'
            ] },
            'A caution for headsets: in VR the tour rotates the world around a body that is sitting still, which is the classic recipe for motion sickness — the visitor sees movement they do not feel. Keep turn slow and dwell long, and test on one person before an audience. If comfort matters more than a fixed running order, leave ringTour off and let the visitor turn their own head.',
            'Idle motion is separate and older: an object with no authored animation and no timeline gets a gentle drift in the live view (models float and turn, flat media sways) so imported legacy rooms keep the look they had. Objects that were placed deliberately should say animation.mode: static, and anything parented to a group is left alone automatically — otherwise the parts of one object drift away from each other.'
        ],
        tags: ['scene', 'spawn', 'vr', 'exhibition', 'tour', 'walk', 'animation'],
        updated: '2026-08-02'
    },
    {
        id: 'admin-manage',
        category: 'Spaces & access',
        title: 'Admin / Manage console',
        summary: 'The /admin console is admins-only; your own spaces are managed from /studio.',
        body: [
            '/admin is the platform console, visible to admin accounts only — everyone else is pointed back to their Spaces page. Owners never need it: your own spaces are fully self-service on /studio.',
            'Admins manage everything from /admin → Manage: a directory tree of spaces, each expanding to its projects. The console keeps three admin sections (Manage, Open Call, Agents) and three diagnostics sections (Overview, Inspect, System); the header shows counts for the work at hand instead of scene telemetry while you administer.',
            { list: [
                'Create / rename / delete spaces and projects inline.',
                'Edit a space or project’s public link (slug) separately from its rename — the id underneath never changes, so old links stay valid.',
                'Toggle Public / Permanent / Locked, set the published project, and choose the default space.',
                'Set the guest entry (shared global space) and grant per-account access and roles (viewer / editor / admin).'
            ] }
        ],
        tags: ['admin', 'manage', 'access', 'slug'],
        updated: '2026-08-08'
    },
    {
        id: 'agents-board',
        category: 'Spaces & access',
        title: 'Ops Graph → Agents',
        summary: 'An operator-only map of the Claude Code sessions and agents working on this machine.',
        body: [
            'The Agents section of /admin shows the AI sessions working alongside you: a live map of every running Claude Code session, which checkout and branch each one holds, and a directory of recent chats with their topics.',
            'Selecting a session opens its detail: the subagent tree it spawned, its background-job state, and the tail of its conversation.',
            { list: [
                'The map links each live session to the checkout it is editing — two sessions on one tree is visible at a glance.',
                'Live status (busy / shell / idle) updates every few seconds.',
                'This surface reads local machine data, so it only exists when serverXR runs on your own machine in dev mode. Deployed environments serve nothing here.'
            ] }
        ],
        tags: ['admin', 'agents', 'ai', 'sessions', 'operator'],
        updated: '2026-08-08'
    },
    {
        id: 'keyboard-shortcuts',
        category: 'Editing',
        title: 'Keyboard shortcuts',
        summary: 'Move around and control the UI faster.',
        body: [
            { list: [
                'H — toggle the UI',
                'F or . — frame the selection (Studio)',
                'Ctrl+Z — undo · Ctrl+Y or Ctrl+Shift+Z — redo (granular: reverts only your own last change, collaborator-safe)',
                'Shift+D or Ctrl+D — duplicate · Delete/Backspace — remove',
                'G / R / S — move, rotate, scale gizmo; X / Y / Z constrain the axis; hold Ctrl to snap or type an exact value (degrees for R, factor for S)',
                'While moving/rotating/scaling: Enter, Space or click — confirm · Esc — cancel and put everything back',
                'A — select all · Alt+A — deselect all',
                'Mouse wheel — zoom (always; it never rotates the view)',
                'WASD — walk when inside a space; click (or drag) to look with the mouse; scroll — step forward/back toward what you face',
                'F — fly mode (Space / Q up, C / E down); on phones, up/down buttons appear while flying',
                'VR & AR controllers — left stick walks, right stick turns and flies (push the stick up/down); works in passthrough AR too; a hint appears in-headset the first time you enter'
            ] }
        ],
        tags: ['shortcuts', 'controls', 'vr'],
        updated: '2026-08-04'
    },
    {
        id: 'api-and-agents',
        category: 'For developers',
        title: 'API & agents',
        summary: 'Read and drive scenes over the serverXR REST API.',
        body: [
            'di.iiii exposes a structured REST API under /serverXR/api/ for developers and AI agents.',
            { list: [
                'GET /serverXR/api/health — backend health',
                'GET /serverXR/api/auth/session — session + space quota state',
                'GET /serverXR/api/spaces — spaces visible to you',
                'GET /serverXR/api/spaces/:id/projects — projects in a space'
            ] },
            'Realtime updates are delivered over WebSocket (socket.io) and SSE.'
        ],
        tags: ['api', 'developers', 'agents'],
        updated: '2026-06-26'
    },
    {
        id: 'license-and-openness',
        category: 'For developers',
        title: 'License & openness',
        summary: 'di.iiii is open source under AGPL-3.0 — read it, run it, self-host it; your content stays yours.',
        body: [
            'The di.iiii platform code is licensed under the GNU AGPL-3.0 (see the LICENSE file in the repository). Anyone may read, use, modify, and self-host it; anyone who hosts a modified copy must publish their changes under the same license — the commons can grow but not be enclosed.',
            'Content is separate from code: spaces and projects you create belong to you, and published spaces stay free to visit — no login is ever needed to view a public space.',
            'Self-hosting is a supported path (npm run selfhost, docs/deploy/SELF_HOST.md), and space bundles are exportable, so your work is never locked to this host.'
        ],
        tags: ['license', 'open source', 'agpl', 'developers'],
        updated: '2026-07-19'
    },
    {
        id: 'github-sync',
        category: 'For developers',
        title: 'GitHub sync',
        summary: 'Connect a space to a GitHub repo — pushes auto-update the live space.',
        body: [
            'A space can be linked to a GitHub repo so every push updates the live space automatically, through the di.iiii GitHub App. No command line needed — space owners connect from the Spaces page (/studio → GitHub sync on your space card); admins have the same panel in /admin → Manage.',
            { list: [
                'Open GitHub sync on your space card, click the connect button — GitHub asks which repos to allow (one time).',
                'Back in di.iiii the repo list fills in by itself — pick your repository from the dropdown and it connects immediately.',
                'Edit your repo’s entry file (e.g. index.html) and push — the space re-syncs in seconds.',
                'Advanced: add a di-space.json manifest to the repo and pushes sync the whole space: "include" globs bring extra code files (css/js/…), "assets" globs upload the media your entry references (videos, images, models) with their URLs rewritten automatically. Without a manifest, only the entry file syncs.',
                'Sync is one-way (repo → space); Disconnect anytime.'
            ] }
        ],
        tags: ['github', 'sync', 'developers', 'deploy'],
        updated: '2026-07-08'
    },
    {
        id: 'google-drive-import',
        category: 'Editing',
        title: 'Import from Google Drive',
        summary: 'Connect your Drive and pick files with the Google picker, or paste a public share link.',
        body: [
            'In the Studio editor open the Create window — the Google Drive section sits right under Import files, already expanded (the classic editor has the same section in Project Assets). Two ways to bring files in:',
            { list: [
                'Connect your Drive: sign in with Google once, then hit Pick from Drive — Google’s own file picker opens, and whatever you pick imports into the current space. di.iiii can only ever see the files you pick, nothing else in your Drive.',
                'Files you picked before stay searchable in the panel for quick re-import.',
                'Public link: paste an “Anyone with the link” file URL — no login needed. A shared folder imports every file inside (needs GOOGLE_API_KEY on the server).',
                'Native Google Docs/Sheets/Slides come in as PDF/CSV; other files keep their original bytes.',
                'Imported files land in the space asset store exactly like uploads, so they work everywhere.',
                'Disconnect anytime — it removes your stored Drive access from the server.'
            ] }
        ],
        tags: ['assets', 'google', 'drive', 'import', 'studio', 'picker'],
        updated: '2026-07-10'
    },
    {
        id: 'asset-commons',
        category: 'Editing',
        title: 'The asset commons',
        summary: 'Share an asset publicly once — anyone can find it and reuse it in their own space.',
        body: [
            'The commons is the shared, public asset library across all of di.iiii. In the Studio editor open the Create window:',
            { list: [
                'Share: next to any file in the Files list, click Share — it becomes a public asset anyone can discover. Click Public to take it back down. Sharing needs a signed-in account; guests can browse and import from the commons but not publish to it.',
                'Reuse: click Commons, search what others have shared, select, and Import — the assets are copied into your space instantly (they are content-addressed, so nothing re-uploads). Then hit + Add on the file to place it in your scene.',
                'Shared assets keep their sharer label, and the bytes stay in the origin space — the commons is an index, not a second copy.',
                'Moderation: admins see the full commons in Ops Graph → Manage (Asset commons section) and can remove any entry; the origin space keeps its file.'
            ] }
        ],
        tags: ['assets', 'commons', 'share', 'public', 'studio'],
        updated: '2026-07-02'
    },
    {
        id: 'upload-privacy',
        category: 'Editing',
        title: 'What happens to a photo you upload',
        summary: 'Uploaded images have their embedded camera metadata — including GPS location — removed before they are stored.',
        body: [
            'Photos carry hidden EXIF metadata: the GPS coordinates where the shot was taken, the device model, the exact timestamp. Because published spaces are public, anyone who could see the image could read that data too.',
            { list: [
                'Images (JPEG, PNG, WebP, TIFF, AVIF, GIF) are re-encoded on upload and stored without EXIF, IPTC or XMP metadata.',
                'Rotation is preserved: the orientation is applied to the pixels before the tag is discarded, so portrait photos stay upright.',
                'SVG files are left untouched — re-encoding would turn a vector into a bitmap.',
                'Video, audio, 3D models and archives are stored as uploaded; their metadata is not stripped.',
                'This applies to new uploads. Images uploaded before this change keep the metadata they arrived with.'
            ] }
        ],
        tags: ['assets', 'uploads', 'privacy', 'exif', 'photos'],
        updated: '2026-07-29'
    },
    {
        id: 'open-call-applications',
        category: 'Spaces & access',
        title: 'Open-call applications',
        summary: 'Public application forms on linked-space pages store submissions in di.iiii; admins review them in Ops Graph → Open Call.',
        body: [
            'A linked-space page (like the Beyond Form open call) can host its own application form. Submissions are stored in di.iiii and — where the call uses one — mirrored to the organizers\u2019 Google Form in the background.',
            { list: [
                'Review: admins open /admin \u2192 Open Call to see applications with status chips (new / shortlist / accepted / declined), per-applicant notes, and status counts.',
                'Filter by status, expand a row for the full answers, and export everything as CSV for sharing with partners.',
                'Delete removes an application permanently (confirmation required) — use it to clear test submissions and junk entries.',
                'The public submit endpoint is unauthenticated and rate-limited; reviewing, updating, and deleting require an admin session.'
            ] }
        ],
        tags: ['open call', 'applications', 'admin', 'forms'],
        updated: '2026-07-13'
    },
    {
        id: 'open-inscriptions',
        category: 'Spaces & access',
        title: 'Open inscriptions',
        summary: 'A public space can opt in to anonymous, append-only inscriptions — visitors add one line of text, and optionally one drawing, to the scene.',
        body: [
            'Open inscriptions let an artwork or event page write a visitor’s answer into a di.iiii space without accounts or tokens (built for br_id_ge’s vi.ritual: complete the rite, and your inscription becomes a persistent object in the space).',
            { list: [
                'Opt-in per space: PATCH /api/spaces/:id with { "openInscriptions": true } (owner or admin). The space must also be public.',
                'Visitors POST /api/spaces/:id/inscriptions with { name, word } — the server itself builds a single sanitized text object (insc-…) and appends it to the scene. Arbitrary ops are impossible on this path; the generic ops route stays fully gated.',
                'Creating an inscription returns a one-time proof. Only its sha256 is stored, so the visitor — and nobody else — can DELETE /api/spaces/:id/inscriptions/:inscId to unmake exactly their own crossing. Inscriptions made before proofs existed cannot be unmade this way.',
                'An inscription may also carry a mark: the drawing the visitor made, as an opaque m1.… token (base64url, capped). The server validates its shape and never parses it, so a viewer can render the line that was actually drawn instead of a shape derived from the id. A malformed or oversized mark is dropped and the inscription still succeeds — a drawing can never cost someone the crossing.',
                'PUT /api/spaces/:id/inscriptions/:inscId/mark with { proof, mark } replaces the mark afterwards (the same authority that unmakes a crossing, writing that one property and nothing else) — for pages where the drawing is made after the inscription was already sent.',
                'Rate-limited per client, capped at 999 inscriptions per space; setting allowEdits=false pauses new inscriptions instantly, and restore-snapshot remains the recovery path.'
            ] }
        ],
        tags: ['inscriptions', 'spaces', 'public', 'br_id_ge'],
        updated: '2026-08-05'
    },
    {
        id: 'raw-lane',
        category: 'Editing',
        title: 'Raw: free-form node nesting',
        summary: 'Raw is di.iiii’s node-first editor lane at /<space>/raw, with free-form nesting: any node can contain a graph, and worlds open fullscreen.',
        body: [
            'Raw is di.iiii’s node-first editor, promoted from the landing page (/open/raw to try it as a guest). Its core idea is free-form nesting: no node type is a singleton, and any node can be entered to author a graph inside it.',
            { list: [
                'Reached from a space at /<space>/raw (same sign-in rules as Studio); /open/raw opens it on the communal open space.',
                'Enter any node with its “Enter ›” button; the breadcrumb tracks your depth and Escape steps back out one level at a time.',
                'Entering a World node opens its 3D viewport fullscreen; the ← World button in the topbar drops back to the graph.',
                'The palette only lists node types that actually compute or render — anything still marked “authoring only” is a declared-but-unbuilt placeholder.',
                'Webcam is the first real capture node: it asks for camera permission, shows a live preview on the node itself (with a visible message if access is denied or no camera is found), and its Frame output can be wired into a Plane’s Texture input to project the live feed onto geometry.',
                'Microphone is the second: it shows a live level meter on the node itself, and its Volume/Frequency outputs update continuously for anything wired to read them.'
            ] }
        ],
        tags: ['raw', 'nodes', 'editor', 'experimental', 'nesting', 'webcam', 'microphone'],
        updated: '2026-08-06'
    },
    {
        id: 'studio-node',
        category: 'Editing',
        title: 'The Studio node: an editor you can place in a graph',
        summary: 'Studio is one entry in Raw’s palette. Place it like any other node, enter it, and you find the panels it is assembled from — the same container idea you would use to build your own node later.',
        body: [
            'In Raw’s palette, Studio sits next to Color, Browser and Cube. Placing it gives you a single card on the canvas. Entering that card — the “›” control on its header — takes you inside, where you find the nodes it is made of: an Outliner, a Scene, and an Inspector. It is one node from the outside and a graph from the inside.',
            'This is the same shape TouchDesigner uses for a Component and Nuke uses for a Group: a container whose contents are a normal subgraph. That is the point of building it this way rather than hard-wiring Studio into the editor — the mechanism that makes Studio a node is the mechanism that will let you wrap your own patch into a palette item and place it beside the built-in ones.',
            { list: [
                'Every node in a scope now appears on the canvas, panels included. Previously a panel existed only as a floating window, so you could not select, move, wire or delete it from the graph, and a wire feeding a panel was invisible even though it was carrying a value.',
                'A panel window and its card are two views of one node: close the window and the card remains; open it from the Windows menu and the panel comes back.',
                'Studio’s panels start closed so that entering the node shows you its graph rather than three windows over it.'
            ] },
            'What is not there yet: Studio’s other panels — assets, code, share, projects — are still hardcoded chrome rather than nodes, because their bodies need a large amount of editor state that has not been re-plumbed yet. Two design questions are also deliberately still open: which of a container’s inner ports should show on the outside, and whether a saved palette item stays linked to the graph it came from or becomes a frozen copy.'
        ],
        tags: ['raw', 'studio', 'nodes', 'container', 'palette', 'nesting', 'touchdesigner'],
        updated: '2026-08-06'
    },
    {
        id: 'raw-on-a-phone',
        category: 'Editing',
        title: 'Raw on a phone: wiring nodes with a finger',
        summary: 'The Raw graph editor is usable on touch — pinch to zoom, drag between ports to wire, and an All Nodes Example that puts the whole palette in one graph.',
        body: [
            'The graph editor was previously mouse-only in a way no amount of zooming could work around: starting a wire on an output port captured the pointer, so the release never reached the input port under your finger and no connection could be made. Dragging between ports now works the same way on a phone as on a desktop.',
            { list: [
                'Drag from an output port to an input port to wire them. You do not have to land exactly on the dot — the drop snaps to the nearest port that accepts that type, within a finger’s width, so a small miss still connects.',
                'Pinch with two fingers to zoom and pan the canvas at the same time. The zoom buttons in the bottom-left corner do the same thing in steps.',
                'Opening a graph fits it to the screen instead of dropping you at 100% somewhere inside it, so you can see the whole patch before choosing where to work.',
                'Tap a wire to delete it — the tap area is much wider than the line you see.',
                'Panel windows (World, Text, Browser, Image) shrink to fit the screen rather than running off the edge.'
            ] },
            'The overflow menu (⋯) has an All Nodes Example: one graph containing every node type the palette can create, with a clock driving a chain of maths into a pulsing sphere, a colour crossfade on a cube, and a breathing light. It is the quickest way to see what the node system can currently do — and it is deliberately honest about what it cannot: geometry, texture and signal outputs are declared on several node types but are not computed yet, so those ports are left unwired rather than connected to look complete.'
        ],
        tags: ['raw', 'nodes', 'mobile', 'touch', 'phone', 'example', 'editor'],
        updated: '2026-08-06'
    },
    {
        id: 'br-id-ge',
        category: 'Spaces & access',
        title: 'br_id_ge (կամուրջ): an Armenian XR rite — live at Notations #2',
        summary: 'br_id_ge is a linked-space rite at /br_id_ge — cross the bridge, be read into Armenian letters, leave a chrome core. Showing at Notations #2, Jul 20 – Aug 2 2026, State Philharmonia of Armenia.',
        body: [
            'br_id_ge (կամուրջ, "bridge") is an Armenian XR rite that lives in di.iiii as a linked space — same pattern as WCC and Beyond Form, a real space routed through the normal public/private check. It is showing at Notations #2 (theme: "Rituals"), hosted by hosq at the State Philharmonia of Armenia, Jul 20 – Aug 2 2026, with festival days Aug 1–2.',
            { list: [
                '/br_id_ge — the door: the entry page for the rite.',
                '/br_id_ge/rite — cross the bridge: your silhouette is read into Armenian letters, you answer one question, and you leave a permanent chrome core.',
                '/br_id_ge/field — the field: every core is one crossing, accumulated as a persistent record in the space.'
            ] }
        ],
        tags: ['br_id_ge', 'exhibition', 'linked-space', 'rite', 'notations'],
        updated: '2026-08-01'
    },
    {
        id: 'wcc-exhibition',
        category: 'Spaces & access',
        title: 'WCC: Women Creating Change — a virtual exhibition space',
        summary: 'WCC is a linked-space exhibition at /wcc — a landing page plus a /wcc/scene 3D gallery of participant artworks, same pattern as br_id_ge.',
        body: [
            '“WCC: Women Creating Change” is a contemporary-art initiative supporting participants in turning personal experience into artworks, presented through a virtual exhibition — like br_id_ge and Beyond Form, it lives in di.iiii as a linked space (a real space like any other, routed through the normal public/private check).',
            { list: [
                '/wcc — the exhibition landing page: about text, session recaps, and the participating artists’ works with concept statements.',
                '/wcc/scene — the 3D gallery experience showing those works in-world.',
                'Public when the wcc space is marked public (same server-verified isPublic check as any other space) — otherwise it falls back to the normal sign-in gate.'
            ] }
        ],
        tags: ['wcc', 'exhibition', 'linked-space', 'art'],
        updated: '2026-07-15'
    },
    {
        id: 'algovrithm',
        category: 'Spaces & access',
        title: 'algovrithm — a code-authored VR space',
        summary: 'algovrithm is a linked space whose scene is written in three.js/R3F code rather than authored in Studio. /algovrithm introduces it; /algovrithm/scene is the piece.',
        body: [
            'algovrithm is a WebXR experience built the way br_id_ge and WCC are linked spaces — a real space, routed through the same server-verified public/private check — but with one difference that matters: its scene is not a project document you edit in Studio. The scene is code, living in src/algoVrithm/, so it can do things the entity model does not express (generative geometry, per-frame math, custom shaders).',
            { list: [
                '/algovrithm — the front door, and /algovrithm/scene — the piece, the same split as /wcc and /wcc/scene. The name is spelled lowercase and unpunctuated so that it is a legal space id exactly as written: unlike br_id_ge, whose URL keeps a styled name that has to be slugified down to the br-id-ge space, here the id, the URL and the label are one string with no seam between them.',
                'The front door is built from the concept and nothing else: the work’s name, the way in, the work moving, and the artist’s statement verbatim. Three rounds of cutting on 2026-08-04 removed three vocabularies rather than three decorations — the repo’s (src/algoVrithm/, startSec/endSec), the cutting room’s (a draggable timeline of the clip windows and their overlaps, a playhead, a running clock, timecodes on every beat), and finally the render pipeline’s (the beat names themselves — “Metaball field”, “Test pattern”, “Dispersion sphere” are techniques, and a list of them is a spec sheet however well it is set). What it costs is that a visitor cannot find out what the piece contains without entering it; the beats, their windows and their overlaps live in sequences/index.js and the director panel. A regression test asserts the page speaks no production vocabulary and reports no measurement. The page exists because entering costs a 1.6 MB renderer and a strobing piece that carries a photosensitivity warning, and neither should be spent on somebody who has only followed a link. It loads no three.js at all, opens on a held frame when the visitor’s system asks for reduced motion, and keeps one control — pause — because motion that starts by itself has to be stoppable.',
                'The picture behind the statement is the piece’s own shaders, running full-viewport on a bare WebGL context — not three.js, so the page still costs nothing to arrive at. Four of the seven beats are per-pixel fields (an exponential smooth minimum, a domain-warped fbm, a tent-filtered ramp, a limb term), which a 2D canvas cannot evaluate at all: the version before this one faked the metaball merge with radial gradients. Two departures from the piece are declared rather than hidden — the door views the halo’s ripples from 20m rather than the visitor’s 1.54m, because a fixed frame at eye height has every ring born outside it, and the monument’s camera is pitched 16° up, because the sphere’s top edge sits past a level gaze. The dispersion sphere also runs with its full-spectrum rainbow off: that knob is an authored exception to the work’s two-hue palette, and nothing on this page has been consented to. The 2D poster stays in the tree as the fallback for a machine that cannot compile the shaders, and a scrim between the picture and the text carries a measured contrast (15.5:1 for the prose) because two of the beats fill the frame with white.',
                'It plays itself — seven scenes in 53 seconds, no controls to learn — and loops continuously, so it can be left running for a whole exhibition day and a visitor who walks up halfway through only has to keep standing there to see the opening. “Enter VR” / “Enter AR” appear only when the headset or phone actually reports support for that mode, and entering VR restarts the piece from the top.',
                'Scene changes are cross-dissolves. Sequence windows overlap, each beat fades on its own envelope, and the room blends its backdrop colour and fog across the handover, so one scene becomes the next without anything being laid over the top of it. The glitch veil that used to cover every handover with a wall of horizontal signal noise was removed on 2026-08-04 — it read as an effect applied to the piece rather than something happening inside it. TransitionVeil.jsx and its maths are still in the folder, unmounted, for the case where a crossing needs covering again.',
                'The piece carries a synthesized spatial score: every beat has sound placed in the room around the visitor (the scan beat’s machine tick circles the head, the metaball hums sit on the blobs’ own orbit ring and close in with them, the reel globe plays 31 positional reel tracks from their places on the shell, and the closing sphere’s colonnade flashes are heard stepping away from you column by column). The handover static went silent with the glitch veil it belonged to — a head-locked burst of digital garbage with nothing failing on screen is the loudest sound in the piece attached to nothing the visitor can see. No audio files — everything is generated, driven by the same playhead as the picture, and browsers require one touch, click or key before any sound is allowed to start.',
                'The front door carries the artist’s statement, verbatim and in the first person, set below the preview, as the whole of the page’s prose. That placement is the point: read the beats first and they are craft — strobe rings, hairline bars, 288 reels — and read the statement first and the same seven beats are the six gestures it names (scroll, swipe, refresh, wait, record, repeat) treated as the rituals of a generation that never had to cross between the physical and the digital.',
                'Because the scene is code, editing it means editing the files in src/algoVrithm/ — the Studio editor has nothing to open for this space.',
                'The authoring tools start hidden and open on H. Everything an author needs — the timeline, the world and light controls, the placement handles, the “why is there no Enter VR button” message — is behind that one key, so the piece can be watched as an audience sees it without turning anything off. On a phone or tablet there is no keyboard to press, which is exactly the intent: what is left on screen is Enter AR and Full screen and nothing else.',
                'With the tools open the screen splits — the piece keeps the top 55%, the editor takes the bottom 45%, and neither sits on top of the other, so the part being worked on is never behind the controls working on it. Ctrl+Z (Cmd+Z on a Mac) undoes edits and Ctrl+Shift+Z redoes them; a whole drag of a handle or a clip edge counts as one undo rather than one per frame.'
            ] },
            'It is built as a timeline rather than one scene: a single playhead runs 0→1, and each sequence claims an in/out window on it in src/algoVrithm/sequences/index.js. Windows overlap on purpose so handovers cross-fade instead of cutting, and each sequence declares its own backdrop colour and fog range which the room blends between — without that, the near-white opening would hard-cut to the near-black scene after it, which in a headset is genuinely unpleasant.',
            'The playhead is advanced from the render loop rather than from a timer of its own. This matters in a headset: once an immersive session starts, the browser stops driving the flat page and the scene is drawn from the headset’s own frame callback instead, so a clock running on a page timer simply stops — the piece would render at full frame rate showing one frozen moment. Ticking it inside the scene means one clock, running at whatever the display in front of you actually refreshes at.',
            'The room and its lighting are edit-list data too, not code. A row carries a world — colour, fog range, and an ambient fill level saying how much unlit air you can see — plus an optional list of lights: point lamps, or “glow” lamps that also show the lit air around the source. Both are editable from the author-only director panel, with swatch grids drawn from the piece’s own palette, a custom colour picker that reports what a choice breaks without ever blocking it, and drag handles for placing a light in the room. Lights fade in and out with the row that owns them and the ambient level blends across a handover on exactly the same curve as the colour and fog, so nothing switches on at a cut.',
            'The panel saves, to one of two places, and it tells you which. On a machine running the dev server, Save writes the edits straight into src/algoVrithm/sequences/index.js — the single source of truth: git-tracked, reviewable, and what actually deploys. It writes in place, so only the fields that actually changed are rewritten and every other byte of the file is left exactly as it was, because that file carries a couple of hundred lines of reasoning about why each number is what it is, and a save that regenerated the list would delete all of it. A save with no edits in it changes nothing at all, so the button is safe to press to find out.',
            'Anywhere else — the deployed site, someone else’s laptop, a headset — Save keeps the timing on the space instead, and says “saved to this space ✓”. That is what makes the piece retimable by someone who is not running a dev server: open the Director on di-studio.xyz, move the beats, save, and it plays that way there for everyone. Only the numbers a director actually moves travel (each beat’s start and length); the scenes themselves, their worlds and the file’s reasoning stay in the code. The file remains what the piece IS and the saved timing says how this one space differs from it, so the two never fight: clearing the space’s timing always lands back on the file, and a deploy of new code does not wipe the retiming. Timing saved to a space does not travel to another one — send it on with Copy when it should become the piece everywhere.',
            '“Copy edit list” is still there for what neither save can do — rows added in the panel, which are new scenes and therefore need code, and carrying an edit from one place to the repo. It regenerates the whole array, so it drops the file’s comments and any field it was not taught about; paste it over the file only when that is what you want.'
        ],
        tags: ['algovrithm', 'vr', 'webxr', 'three.js', 'linked-space', 'code', 'lighting', 'spatial-audio'],
        updated: '2026-08-05'
    }
]

// Headline subset surfaced on the landing page. Keep ids here; `docs:wiki:check`
// fails CI if any id does not resolve to an article (otherwise it silently vanishes).
export const WIKI_HIGHLIGHT_IDS = ['br-id-ge', 'joining-a-space', 'guest-and-sandbox-modes', 'free-spaces', 'publishing', 'invite-links', 'admin-manage', 'github-sync']

export const WIKI_HIGHLIGHTS = WIKI_HIGHLIGHT_IDS
    .map((id) => WIKI_ARTICLES.find((article) => article.id === id))
    .filter(Boolean)
