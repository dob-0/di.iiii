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
                '/<space> — the public viewer for a space’s published project'
            ] }
        ],
        tags: ['spaces', 'projects', 'basics'],
        updated: '2026-06-26'
    },
    {
        id: 'guest-and-sandbox-modes',
        category: 'Spaces & access',
        title: 'Guest & sandbox modes',
        summary: 'What signed-out visitors get: a shared global space, or a private sandbox each.',
        body: [
            'Visitors who are not signed in still get a working session so they can explore without an account.',
            'There are two guest modes, chosen by the admin in the /admin → Manage console:',
            { list: [
                'Shared global space — every guest lands in the same editable space (good for an open jam or demo).',
                'Private sandbox — each guest gets their own throwaway sandbox space, isolated from others.'
            ] },
            'Guests cannot create their own named spaces — that requires a signed-in account.'
        ],
        tags: ['guest', 'sandbox', 'access'],
        updated: '2026-06-26'
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
        summary: 'Make a project live and decide who can see it.',
        body: [
            'Each space has a public URL at /<space>. Set a space’s published project, then mark the space Public to let anyone view it without signing in.',
            'Publishing (which project is live) and visibility (Public/Private) are independent choices — linking a project does not automatically make the space public.',
            'A published-but-private space shows a login wall to visitors instead of the scene.'
        ],
        tags: ['publish', 'public', 'sharing'],
        updated: '2026-06-26'
    },
    {
        id: 'studio-basics',
        category: 'Editing',
        title: 'Studio editor basics',
        summary: 'Add objects, arrange them, and tune the scene.',
        body: [
            'Open the Studio, pick or create a project, and start building.',
            { list: [
                'Add 3D shapes, text, images, and 3D models from the Library panel.',
                'Drag to position; use the Inspector on the right to change colors, lighting, camera, and background.',
                'Undo / redo with Ctrl+Z / Ctrl+Y.',
                'Your panel layout is remembered — open panels and their positions restore next visit; use Arrange → Reset to go back to the default layout.'
            ] }
        ],
        tags: ['studio', 'editor', 'basics'],
        updated: '2026-07-02'
    },
    {
        id: 'admin-manage',
        category: 'Spaces & access',
        title: 'Admin / Manage console',
        summary: 'The /admin Manage tab is one directory tree for spaces, projects, and access.',
        body: [
            'Admins manage everything from /admin → Manage: a directory tree of spaces, each expanding to its projects.',
            { list: [
                'Create / rename / delete spaces and projects inline.',
                'Toggle Public / Permanent / Locked, set the published project, and choose the default space.',
                'Set the guest entry (shared global space) and grant per-account access and roles (viewer / editor / admin).'
            ] }
        ],
        tags: ['admin', 'manage', 'access'],
        updated: '2026-06-26'
    },
    {
        id: 'keyboard-shortcuts',
        category: 'Editing',
        title: 'Keyboard shortcuts',
        summary: 'Move around and control the UI faster.',
        body: [
            { list: [
                'H — toggle the UI',
                'F — frame the scene',
                'Z — undo the last action',
                'WASD — walk when inside a space; drag to look',
                'F — fly mode (Space / Q up, C / E down)',
                'VR controllers — left stick walks, right stick turns and flies (push the stick up/down); a hint appears in-headset the first time you enter'
            ] }
        ],
        tags: ['shortcuts', 'controls', 'vr'],
        updated: '2026-07-02'
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
        id: 'github-sync',
        category: 'For developers',
        title: 'GitHub sync',
        summary: 'Connect a space to a GitHub repo — pushes auto-update the live space.',
        body: [
            'A space can be linked to a GitHub repo so every push updates the live space automatically, through the di.iiii GitHub App.',
            { list: [
                'Install the di.iiii GitHub App on your repo (one time).',
                'In /admin → Manage → pick a space → GitHub sync, enter owner / repo / project and Connect.',
                'Edit your repo’s entry file (e.g. index.html) and push — the space re-syncs in seconds.',
                'Sync is one-way (repo → space); Disconnect anytime.'
            ] }
        ],
        tags: ['github', 'sync', 'developers', 'deploy'],
        updated: '2026-06-30'
    },
    {
        id: 'google-drive-import',
        category: 'Editing',
        title: 'Import from Google Drive',
        summary: 'Connect your Drive to browse your own files, or paste a public share link.',
        body: [
            'In the Studio editor open the Assets panel and click Google Drive (the classic editor has the same button in Project Assets). Two ways to bring files in:',
            { list: [
                'Connect your Drive: sign in with Google once, then search your own Drive and import selected files — each person connects their own account, and files import into the current space.',
                'Public link: paste an “Anyone with the link” file URL — no login needed. A shared folder imports every file inside (needs GOOGLE_API_KEY on the server).',
                'Native Google Docs/Sheets/Slides come in as PDF/CSV; other files keep their original bytes.',
                'Imported files land in the space asset store exactly like uploads, so they work everywhere.',
                'Disconnect anytime — it removes your stored Drive access from the server.'
            ] }
        ],
        tags: ['assets', 'google', 'drive', 'import', 'studio'],
        updated: '2026-07-02'
    },
    {
        id: 'asset-commons',
        category: 'Editing',
        title: 'The asset commons',
        summary: 'Share an asset publicly once — anyone can find it and reuse it in their own space.',
        body: [
            'The commons is the shared, public asset library across all of di.iiii. In the Studio editor open the Assets panel:',
            { list: [
                'Share: next to any space file, click Share — it becomes a public asset anyone can discover. Click Public to take it back down.',
                'Reuse: click Commons, search what others have shared, select, and Import — the assets are copied into your space instantly (they are content-addressed, so nothing re-uploads).',
                'Shared assets keep their sharer label, and the bytes stay in the origin space — the commons is an index, not a second copy.'
            ] }
        ],
        tags: ['assets', 'commons', 'share', 'public', 'studio'],
        updated: '2026-07-02'
    }
]

// Headline subset surfaced on the landing page. Keep ids here; `docs:wiki:check`
// fails CI if any id does not resolve to an article (otherwise it silently vanishes).
export const WIKI_HIGHLIGHT_IDS = ['guest-and-sandbox-modes', 'free-spaces', 'publishing', 'admin-manage', 'github-sync']

export const WIKI_HIGHLIGHTS = WIKI_HIGHLIGHT_IDS
    .map((id) => WIKI_ARTICLES.find((article) => article.id === id))
    .filter(Boolean)
