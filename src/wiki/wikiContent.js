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
            'A public space also shares every project individually at /<space>/p/<project-id> — the same no-login viewer as the live route, without touching the published pointer. Handy for one-pagers, drafts, and documents that live next to the main page. Direct project links carry a small floating project list (top-left), so viewers can hop between the space’s pages without a detour through the hub; the published live route stays chrome-free.',
            'A published-but-private space shows a login wall to visitors instead of the scene. The editor’s Share window and the space card both tell you when that’s the case and offer a one-click “Make space public” right there — no hunting for the toggle.',
            'Opening an editor URL (like /<space>/studio) with an account that isn’t scoped to that space no longer dead-ends: if the space is public you are taken to its live view; only private spaces show the access-restricted screen.',
            'Every public space carries a small “Made with di.iiii — build yours” badge, so visitors who like what they see have a way in. It never appears on hub-card preview thumbnails.',
            'Spaces and individual projects can each get a clean public link (a slug) that’s independent of their internal id — e.g. /wcc/artistplace instead of a longer id-based path. Set it from /admin → Manage (“Edit public link” next to Rename); old id-based links keep working forever, they’re never replaced. Every project link in a space’s floating project switcher has a one-click Copy link action that uses the slug when one is set.'
        ],
        tags: ['publish', 'public', 'sharing', 'owner', 'live link', 'slug', 'custom link'],
        updated: '2026-07-19'
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
        id: 'admin-manage',
        category: 'Spaces & access',
        title: 'Admin / Manage console',
        summary: 'The /admin console is admins-only; your own spaces are managed from /studio.',
        body: [
            '/admin is the platform console, visible to admin accounts only — everyone else is pointed back to their Spaces page. Owners never need it: your own spaces are fully self-service on /studio.',
            'Admins manage everything from /admin → Manage: a directory tree of spaces, each expanding to its projects.',
            { list: [
                'Create / rename / delete spaces and projects inline.',
                'Edit a space or project’s public link (slug) separately from its rename — the id underneath never changes, so old links stay valid.',
                'Toggle Public / Permanent / Locked, set the published project, and choose the default space.',
                'Set the guest entry (shared global space) and grant per-account access and roles (viewer / editor / admin).'
            ] }
        ],
        tags: ['admin', 'manage', 'access', 'slug'],
        updated: '2026-07-19'
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
                'Mouse wheel — zoom (always; it never rotates the view)',
                'WASD — walk when inside a space; click (or drag) to look with the mouse; scroll — step forward/back toward what you face',
                'F — fly mode (Space / Q up, C / E down); on phones, up/down buttons appear while flying',
                'VR & AR controllers — left stick walks, right stick turns and flies (push the stick up/down); works in passthrough AR too; a hint appears in-headset the first time you enter'
            ] }
        ],
        tags: ['shortcuts', 'controls', 'vr'],
        updated: '2026-07-08'
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
        summary: 'A public space can opt in to anonymous, append-only inscriptions — visitors add one line of text to the scene, nothing else.',
        body: [
            'Open inscriptions let an artwork or event page write a visitor’s answer into a di.iiii space without accounts or tokens (built for br_id_ge’s vi.ritual: complete the rite, and your inscription becomes a persistent object in the space).',
            { list: [
                'Opt-in per space: PATCH /api/spaces/:id with { "openInscriptions": true } (owner or admin). The space must also be public.',
                'Visitors POST /api/spaces/:id/inscriptions with { name, word } — the server itself builds a single sanitized text object (insc-…) and appends it to the scene. Update and delete are impossible on this path; the generic ops route stays fully gated.',
                'Rate-limited per client, capped at 999 inscriptions per space; setting allowEdits=false pauses new inscriptions instantly, and restore-snapshot remains the recovery path.'
            ] }
        ],
        tags: ['inscriptions', 'spaces', 'public', 'br_id_ge'],
        updated: '2026-07-12'
    },
    {
        id: 'beta-lane',
        category: 'Editing',
        title: 'Beta: the experimental node-first editor',
        summary: 'Beta is a second, experimental editor lane at /<space>/beta — node-first project documents, for research-style iteration alongside Studio.',
        body: [
            'Studio is the main, stable editor. Beta is a separate lane at /<space>/beta for the same space’s projects, built around a recursive, node-first document model instead of Studio’s window/entity model — it’s where node-based and research-style editor work happens.',
            { list: [
                'Reached from a space at /<space>/beta (protected the same way as Studio — sign-in required for non-public spaces).',
                'Beta and Studio share the same underlying projects and persistence, but the two editors are not drop-in equivalents — a project built with one lane’s assumptions may not look or behave identically in the other.',
                'Expect it to be less polished and to change more often than Studio: it is where new node-first ideas get tried before (if ever) they inform Studio.'
            ] }
        ],
        tags: ['beta', 'nodes', 'editor', 'experimental'],
        updated: '2026-07-15'
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
        summary: 'algovrithm at /algovrithm is a linked space whose scene is written in three.js/R3F code rather than authored in Studio.',
        body: [
            'algovrithm is a WebXR experience built the way br_id_ge and WCC are linked spaces — a real space, routed through the same server-verified public/private check — but with one difference that matters: its scene is not a project document you edit in Studio. The scene is code, living in src/algoVrithm/, so it can do things the entity model does not express (generative geometry, per-frame math, custom shaders).',
            { list: [
                '/algovrithm — the experience. The name is spelled lowercase and unpunctuated so that it is a legal space id exactly as written: unlike br_id_ge, whose URL keeps a styled name that has to be slugified down to the br-id-ge space, here the id, the URL and the label are one string with no seam between them.',
                'It plays itself — seven scenes in 47 seconds, no controls to learn — and loops continuously, so it can be left running for a whole exhibition day and a visitor who walks up halfway through only has to keep standing there to see the opening. “Enter VR” / “Enter AR” appear only when the headset or phone actually reports support for that mode, and entering VR restarts the piece from the top.',
                'Scene changes are glitch transitions, not fades: at each handover the view tears into horizontal strips of signal noise — sparse at the edges, a full wall of static at the crossing — then clears into the next scene. The noise re-rolls below the photosensitive flicker band (test-guarded), and its brightness swings around the current room’s own colour so it reads as this world failing rather than an overlay.',
                'The piece carries a synthesized spatial score: every beat has sound placed in the room around the visitor (the scan beat’s machine tick circles the head, the metaball hums sit on the blobs’ own orbit ring and close in with them, the reel globe plays 31 positional reel tracks from their places on the shell, and the closing sphere’s colonnade flashes are heard stepping away from you column by column), and the glitch transitions are heard as bursts of static on the same pulse as the visuals. No audio files — everything is generated, driven by the same playhead as the picture, and browsers require one touch, click or key before any sound is allowed to start.',
                'Because the scene is code, editing it means editing the files in src/algoVrithm/ — the Studio editor has nothing to open for this space.',
                'The authoring tools start hidden and open on H. Everything an author needs — the timeline, the world and light controls, the placement handles, the “why is there no Enter VR button” message — is behind that one key, so the piece can be watched as an audience sees it without turning anything off. On a phone or tablet there is no keyboard to press, which is exactly the intent: what is left on screen is Enter AR and Full screen and nothing else.',
                'With the tools open the screen splits — the piece keeps the top 55%, the editor takes the bottom 45%, and neither sits on top of the other, so the part being worked on is never behind the controls working on it. Ctrl+Z (Cmd+Z on a Mac) undoes edits and Ctrl+Shift+Z redoes them; a whole drag of a handle or a clip edge counts as one undo rather than one per frame.'
            ] },
            'It is built as a timeline rather than one scene: a single playhead runs 0→1, and each sequence claims an in/out window on it in src/algoVrithm/sequences/index.js. Windows overlap on purpose so handovers cross-fade instead of cutting, and each sequence declares its own backdrop colour and fog range which the room blends between — without that, the near-white opening would hard-cut to the near-black scene after it, which in a headset is genuinely unpleasant.',
            'The playhead is advanced from the render loop rather than from a timer of its own. This matters in a headset: once an immersive session starts, the browser stops driving the flat page and the scene is drawn from the headset’s own frame callback instead, so a clock running on a page timer simply stops — the piece would render at full frame rate showing one frozen moment. Ticking it inside the scene means one clock, running at whatever the display in front of you actually refreshes at.',
            'The room and its lighting are edit-list data too, not code. A row carries a world — colour, fog range, and an ambient fill level saying how much unlit air you can see — plus an optional list of lights: point lamps, or “glow” lamps that also show the lit air around the source. Both are editable from the author-only director panel, with swatch grids drawn from the piece’s own palette, a custom colour picker that reports what a choice breaks without ever blocking it, and drag handles for placing a light in the room. Lights fade in and out with the row that owns them and the ambient level blends across a handover on exactly the same curve as the colour and fog, so nothing switches on at a cut.',
            'Nothing the panel does is saved. It edits a draft, the piece renders from that draft live, and “Copy edit list” hands back source to paste into src/algoVrithm/sequences/index.js — which stays the single source of truth: git-tracked, reviewable, and what actually deploys.'
        ],
        tags: ['algovrithm', 'vr', 'webxr', 'three.js', 'linked-space', 'code', 'lighting', 'spatial-audio'],
        updated: '2026-08-01'
    }
]

// Headline subset surfaced on the landing page. Keep ids here; `docs:wiki:check`
// fails CI if any id does not resolve to an article (otherwise it silently vanishes).
export const WIKI_HIGHLIGHT_IDS = ['guest-and-sandbox-modes', 'free-spaces', 'publishing', 'invite-links', 'admin-manage', 'github-sync']

export const WIKI_HIGHLIGHTS = WIKI_HIGHLIGHT_IDS
    .map((id) => WIKI_ARTICLES.find((article) => article.id === id))
    .filter(Boolean)
