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
        id: 'glossary',
        category: 'Getting started',
        title: 'The words, in one place',
        summary: 'Every word di.iiii uses for its own parts, one line each. One word, one meaning.',
        body: [
            'di.iiii uses each of these words for exactly one thing. If you know the list, the rest of the wiki reads without guessing.',
            { list: [
                'space — a place that is yours: an address, a guest list, and everything in it.',
                'project — one thing you make inside a space.',
                'canvas — the surface your nodes sit on.',
                'node — one card on the canvas.',
                'port — where a wire attaches to a node.',
                'wire — what runs between two ports.',
                'object — one thing standing in the scene.',
                'scene — the 3D place you can be inside.',
                'page — a published web page (HTML/CSS/JS). Never a project.',
                'Studio — the one you walk into for the editing panels. It is also a node, so you can place one on a canvas.',
                'di.iiii — the whole thing. Spaces live in it.'
            ] },
            'And five that carry their own meaning, each with an article of its own:',
            { list: [
                'the commons — the shared, public file library across all of di.iiii: publish one file, anyone can reuse it.',
                'sandbox — the one private space every visitor gets, account or not.',
                'Open Space — the one shared space anybody can build in, together, live.',
                'slug — the clean public name in a link (/wcc/artistplace) instead of an id.',
                'inscription — one line a visitor leaves in a space that opted into open inscriptions.'
            ] },
            'A word on the site that is not here and not obvious is a mistake in the writing — say so at info@thedi.studio.'
        ],
        tags: ['glossary', 'words', 'vocabulary', 'basics', 'getting started'],
        updated: '2026-08-19'
    },
    {
        id: 'spaces-and-projects',
        category: 'Getting started',
        title: 'Spaces & projects',
        summary: 'How di.iiii is organized: a space is a place that is yours, and a project is one thing you make inside it.',
        body: [
            'A space is a place that is yours: an address, a guest list, and everything in it — projects, uploaded files, collaborators, and the rules about who gets in.',
            'A project is one thing you make inside a space. A space can hold many projects, and one of them can be marked as the space’s published (live) project.',
            'The address of a project always begins with its space. The editor addresses put the tool first for historical reasons, which is why the shortcut below exists — it is the one that reads the way the product is actually arranged:',
            { list: [
                '/<space>/projects — the space’s projects. This is the one to use: the list belongs to the space, not to whichever tool you are holding.',
                '/spaces — all of your spaces',
                '/<space>/studio — the same list, in Studio’s older address',
                '/<space>/raw/projects — the same projects, in the node editor’s older address',
                '/<space>/studio/projects/<id> — the editor for one project',
                '/<space>/<project>/studio — the same project, open for editing. Add /raw instead for the node editor. This works on any project link: take the address you are looking at and add the word. It is a shortcut, not a second address — the bar heals to the editor’s own link once it opens.',
                '/<space> — the public viewer for a space’s published project',
                '/<space>/p/<id> — the public viewer for any single project (on a public space, no login needed — share a draft or a second project without moving the published pointer)'
            ] }
        ],
        tags: ['spaces', 'projects', 'basics'],
        updated: '2026-08-21'
    },
    {
        id: 'the-front-door',
        category: 'Getting started',
        title: 'The front door',
        summary: 'di.iiii\u2019s own page is the room it describes \u2014 pressing Step inside moves the camera rather than loading anything.',
        body: [
            'The page at the bare address is a page you read and scroll like any other. It is also the room. The wordmark, the line under it, the buttons and the sections are laid out in the room\u2019s own space, each at its own distance, and the view starts square on to them \u2014 which is why it looks flat.',
            'Press Step inside and nothing loads. The room is already on screen behind the page, so the door is a camera move \u2014 and at that moment the page stops being a page. Every part of it becomes a real thing in the room, with weight: the wordmark, the line, the buttons all fall, turn over, and come to rest flat on the floor, where the doors stand in front of them and the far ones go soft in the room\u2019s haze. You walk in as it lands. It is one continuous shot, not a page change, and the address does not move.',
            { list: [
                '/ \u2014 the front door: the page, with the room behind it.',
                '/?room=1 \u2014 the room on its own, without the page. For anyone who wants the space and not the door.',
                '/main \u2014 the old address of that same room. It still resolves and always will, and it still opens the room; the name just never reaches the address bar.'
            ] },
            'If your system asks for reduced motion, the door does not fly you anywhere: you arrive at the same place immediately, and nothing falls. The destination is never different, only the journey.',
            'On a phone the room is not loaded until you ask for it \u2014 a passive visit should not pay for a 3D engine it is not going to show \u2014 so the first press waits a moment for it to arrive before the flight begins.'
        ],
        tags: ['landing', 'basics', 'navigation', 'room', 'walk'],
        updated: '2026-09-01'
    },
    {
        id: 'spaces-map-view',
        category: 'Spaces & access',
        title: 'Grid or Map: two ways to see your spaces',
        summary: 'The Spaces page has a Grid/Map toggle — Map is a spatial, orbit-and-click view of your spaces and their projects.',
        body: [
            'The Spaces page (/studio) has a Grid / Map toggle next to the page title whenever you have at least one space. Grid is the familiar card shelves; Map draws every space as a point you can orbit around and zoom into.',
            'Click a space in Map view to open a side panel for it — rename, copy the live link, make public/private, delete, and manage its projects — the same actions as the grid, just reached from the map. Clicking the satellite projects around a selected space lets you rename them or set one live. Which space is "Main" (marked with a badge here and on the grid) is set in Ops Graph → Manage only.',
            'Your choice of Grid or Map is remembered on this device for next time.'
        ],
        tags: ['spaces', 'map', 'constellation', 'ui'],
        updated: '2026-08-19'
    },
    {
        id: 'guest-and-sandbox-modes',
        category: 'Spaces & access',
        title: 'The Open Space, your sandbox & guest mode',
        summary: 'Everyone shares one communal Open Space, and every visitor — guest or account — gets exactly one private sandbox.',
        body: [
            'The landing page’s “Step inside” button opens your own private sandbox — no account, no space picker, one click to building. What you make there is kept in the space, where Studio and Nodes sit side by side and “View live” hands out the address. The shared Open Space itself lives at /open.',
            'There are three kinds of places, and everyone gets the first two without an account:',
            { list: [
                'The Open Space — one shared space where every visitor can build, together, live. It is always there and survives cleanup; an admin can restore it from a daily snapshot if it gets trashed.',
                'Your sandbox — exactly one private scratch space per person, the same one every time you return (same browser for guests; account-bound once signed in). It never appears in anyone else’s directory, admins included.',
                'Your spaces — real named spaces you own and can publish. These need a sign-in.'
            ] },
            'The Spaces page (/studio) shows exactly these shelves: Open Space · Your sandbox · Your spaces — so the answer to “where am I, what’s mine” is always the page itself. Admins additionally see guest sandboxes collapsed into one row with a count and a “Sweep expired” action.',
            'A sandbox only comes into existence when you actually enter it — just viewing a published space never creates one. Guest sandboxes are cleaned up after about a week of inactivity. Account sandboxes are yours for good: one untouched for about six months is folded down to a snapshot to keep the system lean, and your next visit restores it exactly as you left it. A sandbox holding Studio projects is never archived.',
            'Guests cannot create their own named spaces — sign in with GitHub or Google to get spaces that are yours and stay.',
            'Opening the Share window as a guest offers the two ways to keep your work: sign in (GitHub / Google) — everything comes with you: your whole sandbox, its projects and its files, moves onto your account automatically — or Export the project as a file you can import into any space later. The sign-in confirmation says when your sandbox came along. Existing account work is never overwritten by a later guest session.',
            'For a live jam — an event, a workshop, a projected wall — share the short link di-studio.xyz/open_jam (or turn it into a QR code). It opens the shared Open Jam directly, and a one-line welcome shows first-timers how to add their visual. Anyone who scans can drop in an image, video or 3D model on the spot, no account needed.',
            'There are two ways in, and they are the same jam. di-studio.xyz/open_jam/scene puts you inside the scene — you stand in it, walk around, and add things where you are looking; it is the one to put on a flyer or a QR code for a phone. See "Standing in the jam" for what it does.',
            'The Open Jam opens in a simple mode: one Create window with file upload and a few basic shapes — the full editor’s other windows and import options stay out of the way. Tapping an object opens a small Edit window (change your text, pick a colour, or remove it). Anyone who wants the complete toolset can press “⚒ All tools” in the toolbar (and “◱ Simple” switches back); the choice is remembered on that device.',
            'For admins: Ops Graph → Manage can repoint the communal space (the guest entry), and the Open Space can be restored from its latest daily snapshot if someone wrecks it.',
            'The front door IS the room. Opening di-studio.xyz no longer shows a page about the space with the space drawn behind it — it opens the space: the name and the one line stand inside it as things you can walk past, and the doors to the works are the real links. The room has one address and it is the bare domain: an old /main link still resolves, it just heals to / so you are never shown a room called “main”. The addresses inside that space — /main/studio, /main/raw, a project deep-link — keep their names. The old landing page is moved rather than deleted: it is at /?tour=1.',
            'The landing page has one door. It used to offer three side by side — “Step inside”, “Open Studio” and “Enter Space” — which asked a first-time visitor to choose between them before they knew what any of them were. Studio is not a rival to the door now: step inside, and Studio is there to walk into. The quiet “Already have spaces? Open Studio →” line under the button is the return path for people who already have work of their own.',
            'The “Set as main” switch under Ops Graph → Manage → a space no longer puts its own button on the landing page. Where no Main space is set at all, the landing offers “Look around” instead — a decorative walkable preview of its own hero, not a real space.'
        ],
        tags: ['guest', 'sandbox', 'open space', 'access', 'jam', 'qr'],
        updated: '2026-08-23'
    },
    {
        id: 'jam-surface',
        category: 'Spaces & access',
        title: 'Standing in the jam',
        summary: 'Scan the code and you are inside the scene: walk around, add something where you are looking, and see everyone else who is there.',
        body: [
            'di-studio.xyz/open_jam/scene opens the shared Open Jam as a place you are in, rather than as an editor with most of it switched off. You arrive standing at eye height. Drag a thumb across the right of the screen to look around, and the left to walk.',
            'One large ＋ sits at the bottom, in reach of a thumb. Tap it and a sheet comes up with five shapes — box, sphere, cone, torus, text — and a photo from your camera or your camera roll. Nothing else: at an event the whole point is that somebody who has never seen di.iiii can put something in before the moment passes.',
            'What you add lands on the ground about two metres in front of you, where you are looking. That is the real difference from the editor. Everyone who opens the editor starts from the same saved view, so everyone drops their work into the same handful of spots; here, twenty people standing in twenty places make twenty places.',
            'While something is yours, the sheet lets you change it: retype the words if it is text, pick a different colour, push it further away or pull it nearer, or remove it. A chip above the ＋ counts what you added so you can find it again. That list lives on your own device and is a convenience, not a lock — the Open Jam is shared, and anyone in it can still change anything in it, exactly as before.',
            'A line at the top says how many people are here, and each of them stands in the scene as a soft marker on the floor with their name above it, turned whichever way they are facing. Until now everybody in the jam was invisible to everybody else on a phone, because the old marker followed a mouse and a phone has none.',
            '“Full editor →” at the top right opens the same jam in Studio with every tool in it. A phone had no way through to that at all before: the switch lived in a toolbar that only appears on a wide screen.',
            'The editor is unchanged and still lives at di-studio.xyz/open_jam. The two are the same jam — whatever is made in one shows up in the other, live — so a laptop can be doing the careful work while the phones in the space keep adding.'
        ],
        tags: ['jam', 'open space', 'qr', 'event', 'walk', 'phone', 'presence', 'scene', 'mobile'],
        updated: '2026-08-23'
    },
    {
        id: 'lighting-desk',
        category: 'Spaces & access',
        title: 'The lighting desk',
        summary: 'di.iiii carries a full lighting desk. Patch your rig, save looks as scenes, run them from a phone — and let a graph play it.',
        body: [
            'A di.iiii running on your own machine has a lighting desk in it, at /light. Not a plugin and not a separate program: the same install that serves your projects also drives an Art-Net or ENTTEC rig, from the first fixture to the last scene of the night.',
            'It opens on five pages, and they are five different jobs:',
            { list: [
                'Setup — patch the rig. Add each fixture, give it a profile and an address, and drag it into place on a plan of the room, so the desk looks like the room you are standing in.',
                'Control — the desk proper. Fixtures, colours, a master, scenes, chases, effects and LFOs; save what you are looking at as a scene and give it a name you will recognise in the dark.',
                'Touch — the show surface. Big scene buttons, made for a phone in one hand at the back of the room.',
                'Fader — plain channel faders, for when a fixture is doing something no profile explains and you need to poke a channel by hand.',
                'MIDI — map a controller. Mappings live with the desk, not in one browser, so the same knobs work from any screen you open it on.'
            ] },
            'One rule that matters more than any other: output is OFF until you switch it on, under OUTPUT. Until then the desk runs, the stage view moves, scenes recall — and nothing leaves the machine. A dev server on a shared wifi can never blast a frame at somebody else\'s rig by accident, and a rig only ever lights when a person decided it should.',
            'The rig is yours. Nothing in the desk is patched to any particular room — you name the fixtures, you set the addresses, you save the looks. Its data lives with your di.iiii install, so the show survives a restart and can be carried to the venue on the same laptop.',
            'A graph can play the desk. Drop a DMX Out node into a canvas, leave it on its default rig, and Master, Channel, Value, Blackout and Scene are wired straight into the desk you just patched — an oscillator on a lamp, a scene name recalled by a button, a whole rig blacked out by a wire. See “DMX Out: the graph lights the room”.',
            'The desk lives on a local di.iiii only — `di up`, or npm run dev. A hosted di-studio.xyz has no /light in it at all, on purpose: a lighting desk is a thing that reaches hardware in a room, and the room is where you are.'
        ],
        tags: ['light', 'lighting', 'dmx', 'artnet', 'enttec', 'desk', 'scene', 'show', 'stage', 'performance', 'local', 'di up'],
        updated: '2026-09-03'
    },
    {
        id: 'projection-mapping',
        category: 'Spaces & access',
        title: 'Putting a space on a wall',
        summary: 'Point a projector at a wall, drag each surface onto the shape it belongs to, and the work runs there — no separate mapping software.',
        body: [
            'di-studio.xyz/{space}/map/{project} opens a mapping. A mapping is a project whose contents are other projects: a list of surfaces, each one a four-cornered shape on the wall with something playing inside it.',
            'A projector never sees a wall straight on, so a rectangle of picture lands on it as a slanted quadrilateral. That is what the corner handles are for. Pick a surface, drag its four corners onto the four corners of the thing you are projecting at — a sheet of paper, a panel, a doorway — and the picture is squeezed to fit it exactly. Arrow keys nudge by one projector pixel, hold shift for ten.',
            'Before any of the work is ready, set a surface to a test pattern. A grid, rings, diagonal bars or corner brackets, in white on black, with the surface\'s name across the middle. You align in a dark room against a pattern, not against a finished piece: a picture gives your eye no edge to judge, and the name tells you which shape is whose.',
            'Shapes are rarely rectangles. Press M for the mask and click round the outline you actually want — a cut corner, a triangle, a doorway — and everything outside it goes black. Drag a point to move it, alt-click to remove it.',
            'A surface can show a project from this space, any web page by its address, a video, an image, or a flat colour. The address is the important one: work that was never a di.iiii project — a page somebody made somewhere else — still goes on the wall, live, next to work that was.',
            'Each surface has its own opacity, brightness, contrast, saturation and hue, and a blend mode for where two of them overlap. Projected light is not paint: on coloured paper, some of the colour is simply absorbed, and these are how you claw back what the paper takes.',
            'Corners snap — to the other surfaces\' corners, and to the frame\'s edges and middle — and the line they agreed with is drawn while you drag, so you can see what just happened. There is a grid too if you want one. Hold alt while dragging and nothing snaps at all, for the surface that genuinely sits a hair off its neighbour.',
            'Put a photograph of the wall behind the surfaces while you work: choose a file, set how strongly it shows through, and trace each paper edge over it. It is never projected — it is there to draw against. Do not expect the traced corners to be final, though. A photo is taken from where you stood, and the projector stands somewhere else; the shapes will still want a pass on site.',
            'Cues are how a wall gets performed instead of operated. Set the wall the way you want it, add a cue, and it keeps that state under a number key — press the key and the wall goes there, over the fade you gave it. Give a cue a hold time and Play walks through them on its own; a hold of zero means the show waits for you. A cue remembers what each surface is showing and how bright it is, and deliberately nothing about where it is: no keystroke should ever be able to move an alignment you spent an afternoon on.',
            'A cue can carry the light as well as the wall. If the lighting desk is running on this machine, a Light button appears in the toolbar and each cue gets a scene picker: choose one of the desk’s scenes and firing the cue recalls it, fading over the cue’s own fade time, so the room and the projection change together. The lighting desk is local only — on di-studio.xyz there is no desk to talk to, the picker says so, and a cue that names a scene simply keeps the name until you are back at the venue.',
            'A camera can be a surface, so the room is on the wall beside the work. Surfaces can be duplicated, and one surface\'s shape or look pasted onto another. And a whole mapping can be exported as text and pasted into another machine, which matters because the laptop that drives the projector is usually not the one the mapping was made on.',
            '“Open output” opens a second window with nothing in it but the surfaces on black — no toolbar, no title, no cursor once it has been still. Drag that window onto the projector and put it full screen. Keep the first window on your laptop: the two stay in step, so you drag a corner while watching the wall.',
            'One caution. A surface showing a project or a page is a whole page running, and over a plain http:// address a browser only allows a handful at once — past about four, the rest never load. On di-studio.xyz this does not apply. If you are running from a laptop and the bar warns you about it, use video or image surfaces for some of them.'
        ],
        tags: ['projection', 'mapping', 'projector', 'wall', 'exhibition', 'show', 'surface', 'corner pin', 'mask', 'output', 'cues', 'snapping', 'camera', 'lighting', 'light'],
        updated: '2026-09-03'
    },
    {
        id: 'joining-a-space',
        category: 'Getting started',
        title: 'Invited to collaborate? Start here',
        summary: 'The whole path from an invite link to your first saved edit — in a browser tab, with nothing to install.',
        body: [
            'Someone sent you a link to a space. You do not need to install anything, clone anything, or open a terminal: a browser is the entire toolchain. (The repo has a developer setup guide as well — that is a different door, for people who want to run di.iiii itself, and you can ignore it.)',
            { list: [
                '1 — Open the link. It carries the invite; the space opens as soon as access is granted.',
                '2 — Sign in with GitHub or Google when asked. Sign-in brings you back to the page you started from, invite link intact. You can accept an invite as a guest, but a guest session lives in one browser and lasts about a week — the same week its sandbox survives idleness; signing in makes the access permanent and carries any work you already did onto your account.',
                '3 — You land in the space. /<space>/studio is its project hub: every project in the space, plus ＋ New to start one.',
                '4 — Open a project and build. There is no Save button — every change is written as you make it, and anyone else in the same project sees it live.',
                '5 — Stuck? The ? button in the Studio (or Shift+?) opens the illustrated guides and the full shortcut list.'
            ] },
            'What an invite gives you is access to that one space, as an editor. You can open and edit its projects, create new ones, upload files, and use every tool in the Studio.',
            'What it does not give you is the space itself. Publishing (setting which project is live), renaming, changing the public link, making the space public or private, minting further invites, and deleting are the owner’s — see "Who owns a space". If you need one of those, ask whoever invited you; if the space has no owner at all, a di.iiii admin has to assign one first.',
            'Your own work is separate from all of this and always there: every visitor gets a private sandbox, and a signed-in account can create its own spaces. Being a collaborator in someone else’s space does not spend any of that.',
            'If the link says it is invalid or has expired, it is not you — invites last 7 days. Ask for a fresh one.'
        ],
        tags: ['invite', 'collaboration', 'onboarding', 'getting started', 'no install', 'editor', 'access'],
        updated: '2026-08-21'
    },
    {
        id: 'chat-in-a-space',
        category: 'Spaces & access',
        title: 'Talking to the others in a space',
        summary: 'Two chat rooms behind one Chat button: everyone in the space, or only the people in this project.',
        body: [
            'Chat opens on whichever room you were last reading. The tab named after the space reaches everyone in it, whatever project each of them has open — the room to use when you are working alone in your own project and want to say something to the others. The tab that says "This project" reaches only the people who have this project open, which is the older behaviour and is unchanged.',
            'The badge on the Chat button counts both rooms together, so a message in the tab you are not looking at still gets your attention.',
            { list: [
                'The space room keeps its messages. Someone arriving an hour late, or reloading the page, reads what was said before they got there — the last 100 lines.',
                'The project room does not keep anything. Close the tab and that conversation is gone, on purpose.',
                'Both rooms are limited to 500 characters a message, and only people with access to the space can read or write either.'
            ] },
            'Your name in chat is the name this browser knows you by. Set it once and every message carries it; without one you appear as Guest-XXXX.',
            'Moderation, plainly: a di.iiii admin — not a space owner, not an invited editor — can delete any message in the space room, and it disappears from everyone\'s screen at once, including the person who wrote it. Nobody can edit a message, nothing is filtered automatically, and the project room has no delete at all. If a space is being used by children, an adult with an admin account should be in it.'
        ],
        tags: ['chat', 'collaboration', 'space', 'project', 'presence', 'moderation', 'invite'],
        updated: '2026-08-26'
    },
    {
        id: 'public-page-node',
        category: 'Editing',
        title: 'The Public page window',
        summary: 'Set what a visitor to your published page gets — from inside the node editor, without owning the space.',
        body: [
            'Every project has a public face: the page a stranger sees when they open its address. The Public page window is where you decide what that face is, and it sits in the node editor with everything else rather than in a separate settings screen.',
            { list: [
                'What a visitor gets — the 3D room they can walk in, or the code view your project builds.',
                'What is IN that room — everything the project holds. Nodes you placed and objects you made both stand in it, exactly as they do in the node editor\u2019s own viewport. A project built entirely out of nodes publishes as the room those nodes make; it is no longer an empty page.',
                'Headset entry — whether the page offers AR, VR, or neither.',
                'Camera and microphone — off by default. Turning it on stops the page being sandboxed from the site, so only do it for a page that genuinely needs a live camera.',
                'The address — the link itself, with a copy button.'
            ] },
            'All four are settings on the project, so anyone who can edit the project can change them — including a collaborator who joined by invite. They save as you click, like every other edit, and undo works on them.',
            'What the window does not offer is the space-level half: making the space public, or choosing which project the space shows at its short address. Those belong to whoever owns the space. Rather than show you buttons that would refuse, the window tells you in a sentence where the space currently stands — live, showing a different project, or private — so you know whether anyone can actually reach what you just set.',
            'The window is a node like any other: it can be closed, minimized, moved, and it lives in the project it belongs to.'
        ],
        tags: ['publish', 'public', 'share', 'link', 'visitor', 'raw', 'node', 'entry view', 'xr'],
        updated: '2026-08-22'
    },
    {
        id: 'deleting-someones-work',
        category: 'Editing',
        title: 'Delete asks first',
        summary: 'Delete and Backspace now ask before they take anything, and say when the thing was made by somebody else.',
        body: [
            'Pressing Delete or Backspace no longer removes the selected object straight away. A small panel appears naming what is about to go — the object\u2019s name, or how many there are — with Cancel and Delete. Enter deletes, Escape cancels, clicking outside cancels, and cancelling leaves everything exactly as it was.',
            'If what you selected was made by somebody else, the panel says so and names them. It is a warning, not a lock: you can still delete it. The reason for the warning is that undo is yours alone — it reverts only your own last change — so the person whose work you delete has nothing to undo. On a space several people share, that is the one edit that cannot be taken back from the other side.',
            'Anything made before this existed has no maker recorded, so it is nobody\u2019s in particular and the panel simply asks the plain question.',
            'This applies everywhere the keyboard can delete: Studio\u2019s viewport, the node editor\u2019s canvas for both nodes and objects, and the Delete button on a phone. The buttons are full-size touch targets, and on a phone the panel sits at the bottom of the screen where your thumb already is.'
        ],
        tags: ['delete', 'backspace', 'undo', 'collaboration', 'shared space', 'safety', 'editing'],
        updated: '2026-08-24'
    },
    {
        id: 'text-window',
        category: 'Editing',
        title: 'Writing on a Text window',
        summary: 'A Text window is a note you can type straight into — unless something is wired to it.',
        body: [
            'A Text window holds writing: a title for a canvas, instructions for whoever opens the project next, a list you are still working out. Click into it and type. What you write saves as you go, the same way every other edit does, and undo works on it.',
            'Anyone who can edit the project can write in one, including a collaborator who arrived by invite. If two of you are in the project at once you will see each other\'s changes.',
            'One case is different. A Text window\'s content can be fed by another node — wired in, like a colour is wired into a scene. When it is, the window shows the text but will not let you type, and says so: the value belongs to the node upstream, and anything typed here would be replaced the moment that node changed. Unplug the wire and the window becomes writable again.',
            'The window is a node like any other: close it, minimize it to a bar, move it, or open it up from the graph card that carries the same name.'
        ],
        tags: ['text', 'note', 'writing', 'window', 'node', 'raw', 'board', 'editing'],
        updated: '2026-08-21'
    },
    {
        id: 'list-window',
        category: 'Editing',
        title: 'The List window',
        summary: 'A list you actually maintain — add, edit, delete, reorder, and move a line from one group to another.',
        body: [
            'A List window holds a list with headings: what a project needs, what it would be nice to have, what is already done. It is the alternative to keeping a list as written text, where moving one line from one heading to another means retyping two paragraphs and hoping nothing was lost on the way.',
            { list: [
                'Type in a line to change it.',
                'The arrows move a line up or down inside its own heading.',
                'The dropdown beside a line moves it to a different heading.',
                '× removes a line.',
                '+ Add puts a new line under the heading you pressed it on.'
            ] },
            'The headings are yours. Type in one to rename it — every line under it comes along, so nothing is stranded. “+ Add a group” makes another. Removing a heading never removes work: its lines move to the first heading rather than disappearing with it.',
            'Everything saves as you go, undo works on all of it, and anyone who can edit the project can maintain the list — including a collaborator who arrived by invite. If two of you have it open you will see each other working.',
            'The window is a node like any other: close it, minimize it to a bar, move it, or open it from its graph card.'
        ],
        tags: ['list', 'checklist', 'window', 'node', 'raw', 'editing', 'groups', 'todo'],
        updated: '2026-08-21'
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
        id: 'ai-connection',
        category: 'Spaces & access',
        title: 'Connect your own Claude API key',
        summary: 'Every signed-in account can store its own Claude API key against the account — encrypted, never shared with other users.',
        body: [
            'Open the account menu (bottom-right avatar) while signed in and paste a Claude API key under "Claude API key." It is encrypted at rest and stored per account — no one else, including admins, can read it back once saved.',
            'The panel shows "Connected — ····XXXX" (the last 4 characters, as a hint that it is the right key) once saved, with a Disconnect button to remove it.',
            'Your key powers the Claude agent node (see "Chat with Claude"): the server uses it on your behalf for your own chats; the key itself never reaches the browser or other users.',
            'Guest sessions cannot connect a key — sign in with GitHub or Google first.'
        ],
        tags: ['ai', 'claude', 'integrations', 'account', 'api key'],
        updated: '2026-08-19'
    },
    {
        id: 'claude-chat-node',
        category: 'Editing',
        title: 'Chat with Claude',
        summary: 'Place an agent node on the canvas and chat with Claude while you work — powered by your own connected API key.',
        body: [
            'Add an agent node from the palette. It opens as a chat window: type, and Claude answers in a live stream, right there on the canvas. Conversations are saved to your account — reopen the node and the chat is still there.',
            'On your own machine — meaning a di.iiii you run locally (`di up` in its ordinary mode, or the dev server), not the hosted site and not the docker container, which cannot see programs on the host — if Claude Code is installed and logged in (a Claude Pro/Max subscription), the node just works — no API key at all: di.iiii talks to your local Claude, and conversations continue across sessions. Otherwise it runs on the Claude API key connected to your account, and the node itself asks for it: paste the key straight into the panel (or sign in first, if you are a guest) — no detour through settings. Keys stay on the server: the browser never talks to Anthropic directly, and nobody else can use yours.',
            { list: [
                'Each agent node holds its own conversation — place several for parallel topics.',
                'Replies stream token by token; usage (tokens in/out) is recorded per turn on your account.',
                'Costs go to your own Anthropic account, with a per-reply cap and a rate limit as guardrails.'
            ] }
        ],
        tags: ['ai', 'claude', 'chat', 'raw', 'agent', 'node'],
        updated: '2026-08-19'
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
            'Live space cards on the Spaces page also show a live preview — a real miniature of the published project, streamed from the live route and always up to date. Previews only load while their card is on screen, so a long spaces list stays fast.',
            'Owners manage the card preview from the Preview button on the card: keep the live miniature or upload a custom cover image (Replace image / Use live preview to switch back anytime). A cover image also works on spaces that aren’t public yet.',
            'The editor’s Spaces panel has the same self-serve Make Public / Make Private toggle as the Spaces page.',
            'Publishing (which project is live) and visibility (Public/Private) are independent choices — linking a project does not automatically make the space public.',
            'A public space also shares every project individually at /<space>/p/<project-id> — the same no-login viewer as the live route, without touching the published pointer. Handy for one-pagers, drafts, and projects that live next to the main one. Like the live route, these carry no toolbar of ours — nothing floats over your design; hop between a space’s projects from the Studio Projects window.',
            'A published-but-private space shows a login wall to visitors instead of the project. The editor’s Share window and the space card both tell you when that’s the case and offer a one-click “Make space public” right there — no hunting for the toggle.',
            'Opening an editor URL (like /<space>/studio) with an account that isn’t scoped to that space no longer dead-ends: if the space is public you are taken to its live view; only private spaces show the access-restricted screen.',
            'Every public space carries a small “Made with di.iiii” mark in the bottom-left corner, so visitors who like what they see have a way in. At rest it is just the ◈ — the page is yours, and nothing of di.iiii’s should sit on top of your work; point at it (or reach it with the keyboard) and it opens into the full “Made with di.iiii — build yours” link. It never appears on hub-card preview thumbnails, and it stays out of di.iiii’s own front space — there it would only be a link back to the room you are already standing in.',
            'Spaces and individual projects can each get a clean public link (a slug) that’s independent of their internal id — e.g. /wcc/artistplace instead of a longer id-based path. Set it from Ops Graph → Manage (“Edit public link” next to Rename); old id-based links keep working forever, they’re never replaced.',
            'Published code pages can use the visitor’s camera, microphone and motion sensors — but only if the project opts in by setting deviceAccess: true in its presentation state (repo-synced pages set it in their di-space manifest). Opted-in pages run without the usual origin isolation, so reserve it for pages you author yourself; everything else stays fully sandboxed. The visitor still gets the normal browser permission prompt either way.',
            'Opting into deviceAccess also gives the page real, persistent localStorage and sessionStorage — what it saves survives reloads and is shared with the space’s other opted-in pages on the same device, which is how one page can leave something for a sibling to find. Fully sandboxed pages keep an in-memory stand-in instead: calls succeed, but nothing outlives the visit.',
            'Published code pages can read the URL’s query string — /<space>/<slug>?just=bkyi — through window.diiPageQuery (already parsed for you as window.diiPageParams). A published page is rendered inside a frame with no URL of its own, so location.search there is always empty; read new URLSearchParams(window.diiPageQuery || location.search) and the same code keeps working when you open the file locally. This is what lets one published page hand over to another with state — “open the field, on the core I just made”.',
            'Add ?embed=1 to any published link and the viewer becomes glass: no dark shell of its own, no “Made with di.iiii” badge, no Walk/Fly button, no loading screen. Use it when the page is a window inside another page rather than somewhere you send people — put it in an iframe and whatever your host page draws shows through behind it. Your page keeps its own background, so make that transparent too if you want the host to show through.'
        ],
        tags: ['publish', 'public', 'sharing', 'owner', 'live link', 'slug', 'custom link', 'camera', 'device access', 'query', 'url parameters', 'embed', 'iframe', 'transparent', 'storage', 'localstorage'],
        updated: '2026-09-01'
    },
    {
        id: 'invite-links',
        category: 'Spaces & access',
        title: 'Invite links: share a private space',
        summary: 'Owners mint invite links that let anyone — even guests — step into a private space. No admin needed.',
        body: [
            'Every space card on the Spaces page (/studio) has an Invite button for spaces you own. One click mints a fresh invite link and copies it — send it to whoever you want in the space.',
            'Opening the link grants access on arrival: the recipient lands straight in the space, whether they are signed in or just a guest. Guests keep the access with their guest session (about 30 days); signing in later carries it onto their account along with their sandbox.',
            'An invite grants access to that one space only — it does not make anyone an owner, and invited people cannot mint further invites or manage the space.',
            'Each link is valid for 7 days and works for any number of people until it expires. Minting again gives a new link; the old one keeps working until its own expiry.',
            'Invalid or expired links show a clear message on the access screen — ask the owner for a fresh one.'
        ],
        tags: ['invite', 'sharing', 'collaboration', 'access', 'owner'],
        updated: '2026-08-19'
    },
    {
        id: 'space-ownership',
        category: 'Spaces & access',
        title: 'Who owns a space, and how to hand one over',
        summary: 'Every space should have an owner — they manage it without needing an admin. Admins can assign or release ownership at any time.',
        body: [
            'The owner of a space is whoever created it. Ownership is what makes a space self-service: the owner publishes, mints invites, renames, changes the public link, and can delete it — none of which needs an admin.',
            'A space can also have no owner. That happens when it was provisioned over the API rather than created in the browser — every space linked to a GitHub repo starts this way. Such a space works normally, but every management action in it falls to a di.iiii admin, which quietly makes one person the bottleneck.',
            'Admins assign the owner in Ops Graph → Manage → pick the space → Owner & access. The panel names the current owner, or says plainly that there is none. "Make owner" hands the space over and grants that account access in the same move; clicking it again on the current owner releases the space back to di.iiii.',
            'Only admins can change ownership — an owner cannot give their own space away. Granting access is a separate, smaller thing: it lets someone into the space without making them its owner (that is also what an invite link does).'
        ],
        tags: ['owner', 'ownership', 'access', 'admin', 'handover', 'collaboration', 'spaces'],
        updated: '2026-08-19'
    },
    {
        id: 'studio-basics',
        category: 'Editing',
        title: 'Studio editor basics',
        summary: 'Add objects, arrange them, and tune the scene.',
        body: [
            'Open the Studio, pick or create a project, and start building.',
            { list: [
                'Five windows, one per job: Create (shapes, lights, and one Files library — imports, Google Drive, Commons), Objects (the object tree, and editing whatever is selected), Scene (settings for the whole 3D scene), Share (publish, export, activity), Code (HTML/CSS/JS files + the 3D↔code viewport toggle).',
                'A sixth, space-level window — Projects — lists every project in the space: click to switch, ＋ New to create, hover a row to rename or delete (the live project is badged; deleting it clears the published pointer). No more hub round-trips to hop between projects.',
                'Every file — uploaded, from Google Drive, or from the Commons — sits in the Create window’s Files list with + Add to place it in the scene, badges for where it is used and for public sharing, and × to delete. PDFs import as images, one per page.',
                'Drag to position; edit the selected object in the Objects window — the defaults for the whole scene live in the Scene window.',
                'In the Objects tree: double-click any object to rename it, and use the per-row circle (show/hide) and square (lock/unlock) toggles — hidden objects disappear from the scene, locked ones can be selected but not moved.',
                'Duplicate (Ctrl+D / Shift+D) and copy/paste (Ctrl+C / Ctrl+V) carry whole hierarchies — duplicating a group brings all of its children along, and copy works on multi-selections.',
                'Drag an Objects-tree row onto a group to nest it (its position in the scene is kept), onto another object to make them siblings, or onto empty list space to move it back to the root.',
                'Drop files straight onto the viewport — from your computer or from the Create window’s Files list — and they land in the scene at the point under your cursor.',
                'Hold Ctrl while dragging a gizmo or during G/R/S to snap: 0.5-unit moves, 15° rotations, 0.1 scale steps. Or type an exact value mid-operation (R, Y, then 45 = 45°; S then 2 = double size). Rotating or scaling a multi-selection with G/R/S turns the whole arrangement around its shared center.',
                'Eight primitive shapes — box, sphere, cone, cylinder, plane, torus, capsule, ring — all take materials: one-click Presets (Matte, Metal, Glass, Glow — Glow uses the object’s own colour), any imported image as a Texture, and fine Roughness / Metalness / Emissive controls in the Appearance section.',
                'Videos can play sound: untick Muted and set Volume in the video’s Media section. Sound starts after the visitor’s first click or keypress (browser autoplay rules) — this works in the editor and on published pages.',
                'Text objects have full type controls: six 2D font choices with weight, italic, and alignment; and for 3D text, four sculpted typefaces (Helvetiker, Helvetiker Bold, Optimer, Gentilis) with depth and bevel shaping.',
                '3D models import as .glb/.gltf (including Draco-, Meshopt-, and KTX2-compressed exports), .obj (+.mtl via the Materials picker), .stl, and .fbx. Models with embedded animation clips play them automatically — pick a specific clip, toggle “Play animations”, or set “Animation speed” in the model’s Media section; rigged/skinned characters animate correctly.',
                'Import an .hdr/.exr panorama and pick it as the Environment map in the Scene window — image-based lighting and reflections apply in the editor and on published pages (this is what makes Metal and Glass presets shine).',
                'Keyframe animation (Timeline, Objects window): move the playhead, pose the object, press ● Key — two keys make motion. Keys capture position, rotation, scale, and opacity; drag a key diamond to retime it, click to jump, ▶ previews right in the editor, and Duration/Loop shape the cycle. Timelines play automatically on published pages and replace the default idle motion. Every key edit is a normal undo step.',
                'Undo / redo with Ctrl+Z / Ctrl+Y — undo reverts only your own last change (a slider drag or a typing burst counts as one step), so working alongside collaborators is safe: their edits are never rolled back by your undo.',
                'History (Objects window, collapsed at the bottom): a Photoshop-style list of your session’s steps — click any step to jump back or forward to it, or “Session start” to rewind everything. Jumping is just batched undo/redo, so it is equally collaborator-safe.',
                'Your panel layout is fully remembered — open panels, positions, resized dimensions, and collapsed headers all restore next visit; shrinking the browser window pulls stranded panels back into view. Arrange → Reset returns everything to the default layout.',
                'Lost? The ? button (or Shift+?) opens the visual help: four illustrated guides — Move, Build, Edit, Share — plus the full keyboard-shortcut reference on its Shortcuts tab. On a guest’s very first visit a small coach pill walks through the three moves that matter — select something, add something, open Share — each hint completing itself the moment you do it.',
                'On a phone, Studio switches to a touch layout: the five windows become a bottom bar, each opening as a swipe-friendly sheet over the full-screen viewport, with back and Edit-mode buttons up top. The desktop floating-panel layout is unchanged.',
                'If the browser ever drops the 3D graphics context (a GPU hiccup — the scene freezes or goes black), the viewport now recovers on its own; if it can’t, a “Restore 3D view” button appears instead of a dead canvas. The same safety net covers published pages.'
            ] }
        ],
        tags: ['studio', 'editor', 'basics'],
        updated: '2026-08-19'
    },
    {
        id: 'studio-content-model',
        category: 'Editing',
        title: 'How content flows',
        summary: 'One library of files feeds the objects in the scene and the code view — how Studio fits together.',
        body: [
            'Everything you manage in Studio is one of three things: files (imported bytes), objects (what stands in the scene), and code (HTML/CSS/JS rendered in the Code view).',
            { list: [
                'Files: the Create window lists every file in one place — uploads, Google Drive imports, and Commons pulls. Each row shows where it lives (project / space), a “placed ×N” badge when objects use it, and “public” when it is shared to the commons.',
                'Files are stored by content: re-importing a file the project already has (same bytes, any name) skips the upload and finishes instantly, and identical files across a space’s projects are stored only once.',
                '+ Add places a file into the scene as an object. Deleting a file warns you when objects still use it — in this project or in other projects of the space.',
                'Code: the Code window edits HTML/CSS/JS files stored inside the project. The toggle at its top switches the viewport between the scene and the code view, and the “Project file” picker inserts any file’s URL straight into your code.',
                'Instead of local files, the Code window can embed an external site (Embed external URL).',
                'Share controls what visitors see: the public entry view (the scene or the code) and the live route are set in the Share window.'
            ] }
        ],
        tags: ['studio', 'files', 'assets', 'code', 'content'],
        updated: '2026-08-19'
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
            'Idle motion is separate and older: an object with no authored animation and no timeline gets a gentle drift in the live view (models float and turn, flat media sways) so imported legacy scenes keep the look they had. Objects that were placed deliberately should say animation.mode: static, and anything parented to a group is left alone automatically — otherwise the parts of one object drift away from each other.',
            'Whether the button is there at all: a published page offers Walk / Fly whenever the room holds objects for it to show — and it does not matter whether the project also has a graph, so a project built in both editors is walkable on the strength of its objects. A project made of nodes and nothing else still has no button, because walk/fly renders objects and would drop the visitor into an empty version of the room they are already looking at. Give that project one real object and the door opens — and VR and AR open with it, since a headset session is entered from inside walk/fly.',
            'A composed opening shot does not close that door either: a project whose entry view is Fixed camera opens on the shot you framed and still offers Walk / Fly, because the shot is where the visit starts rather than a promise the visitor may never move. The mouse and touch stay live on that shot too — the visitor can orbit away from your framing the moment they arrive. Only the camera\u2019s explicit “locked” switch freezes the shot into a still, and only a Code entry view has no button, since it has no room to give one to.',
            'You frame that shot on whatever screen you are sitting at, and that screen is almost always a wide one. A phone held upright sees about half as much from side to side, so a shot framed to the edges of a laptop arrived on a phone with its edges cut off — in a room whose doors are spread across the width, the outer doors were simply not there. A composed shot now steps back on a narrow screen until it holds what you framed, so a visitor on a phone gets the whole shot instead of the middle of it. Nothing changes on a screen as wide as it is tall or wider: there you get exactly the frame you set. Locked shots step back too — that visitor is the one who cannot move to find what was cut.'
        ],
        tags: ['scene', 'room', 'spawn', 'vr', 'exhibition', 'tour', 'walk', 'animation'],
        updated: '2026-09-01'
    },
    {
        id: 'spatial-video-sound',
        category: 'Editing',
        title: 'Video sound you can walk toward',
        summary: 'A video can place its sound in the room, so it swells as a visitor approaches and falls away behind them.',
        body: [
            'Add a video to a space and it brings its sound with it, placed at the video’s position: walking toward it makes it louder, walking away lets it recede. Several videos in one room stop competing, because the one you are facing is the one you hear.',
            'Videos added before this existed stay exactly as they were — silent and flat — because turning sound on retroactively would have changed how every space already built sounds. Switch it on per video when you want it.',
            { list: [
                'spatial — on for videos added from now on, off for older ones. Turning it off returns a video to playing flat at a constant volume.',
                'muted — a muted video has no sound to place, so this has to be off for spatial to do anything.',
                'distance — the reference distance. Inside it the sound is at full volume; past it the sound starts falling away. Smaller values make a work more intimate, and keep neighbouring works from bleeding into each other.',
                'maxDistance — where the falloff stops getting quieter.'
            ] },
            'Sound comes from the video’s own track rather than a separate file, so picture and sound cannot drift apart no matter how long the clip runs.',
            'Two things to expect. A browser will not let any sound start until the visitor clicks, taps or presses a key — until then the scene is silent, which is a browser rule and not something a space can opt out of. And past maxDistance the sound gets no quieter rather than stopping altogether, so in a space with many videos a distant murmur can build up; keep distance small when several works share a room.'
        ],
        tags: ['video', 'sound', 'audio', 'spatial', 'vr', 'exhibition'],
        updated: '2026-08-07'
    },
    {
        id: 'portal-labels',
        category: 'Editing',
        title: 'Naming an embedded work',
        summary: 'A portal that embeds another project floats its name above it — and how that name is set.',
        body: [
            'A portal in embed mode pulls another project into this scene and floats its label above it. By default the label is white type on a dark plate, which stays readable over whatever happens to be behind it — the safe choice when you do not know what the backdrop will be.',
            'When you do know the backdrop, the plate is often the thing spoiling the look. Three settings on the portal control that:',
            { list: [
                'labelColor — the type colour. Defaults to white.',
                'labelPlate — the dark plate behind the type. Set it off to let the name sit directly on the scene. The type outline goes with it, since an outline only exists to separate the letters from a plate.',
                'labelFont — “default” (di.iiii’s own vendored face, the same one every 3D label uses) or “helvetica”. Helvetica here is Arimo, which is metrically identical to Helvetica and Arial and openly licensed, so it can ship with di.iiii. Real Helvetica and Arial cannot: they are proprietary, and 3D labels cannot reach the fonts installed on a visitor’s machine the way a web page can.'
            ] },
            'Fonts are chosen by name from a fixed list rather than by URL on purpose — the renderer will fetch whatever address it is handed, and a project document should not be able to point it at an arbitrary site.',
            'Left alone, every one of these keeps the original look, so existing portals are unaffected.'
        ],
        tags: ['portal', 'label', 'typography', 'embed', 'exhibition'],
        updated: '2026-08-07'
    },
    {
        id: 'walking-through-a-portal',
        category: 'Editing',
        title: 'Walking through a door',
        summary: 'In walk mode a portal opens by walking into it — and its name appears as you near it.',
        body: [
            'A portal in gateway mode draws a ring on the floor and leads somewhere else. Clicking that ring has always been the way through, and still is — from a desk, in view mode, a click is the quickest way in.',
            'In walk mode it was the wrong verb. The hands are on the movement keys or the joystick and the mouse is looking around, so entering a door meant stopping, aiming a cursor at a ring and clicking it. In a headset there is no cursor to aim at all. So walking into the ring now takes you through it, the way a door works.',
            'What that means for a space you are building:',
            { list: [
                'It fires when the visitor reaches the ring itself, not from across the room — about the width of the ring you can see. A portal scaled larger is a larger door and opens from proportionally further out.',
                'It fires once per arrival. Standing in the ring does not repeat, and stepping half out and back in is still one arrival; the visitor has to leave the doorway properly before it is a doorway again.',
                'A portal with no space named leads nowhere, exactly as its click does.',
                'Embed portals — the kind that pull another project into this scene — are windows, not doors. Walking up to one does nothing, so an exhibition floor built out of them stays walkable.',
                'A visitor who arrives standing on a portal does not get sent straight back out of it. Nothing travels until they have been seen clear of every ring in the room, so two rooms whose doors face each other cannot bounce someone between them.',
                'Going through a door on foot keeps you on foot: the room on the other side opens already in walk mode, provided it is walkable at all. A click in view mode still arrives in view mode.'
            ] },
            'A door also announces itself on the way in. Its name floats hidden until the visitor is within a few strides, then scales up as they approach — so a hall of many doors reads as architecture and colour from the entrance, not as a wall of overlapping nameplates. In view mode, pointing at a ring shows its name the same way; in the editor every name stays visible, since the author needs to see what points where.',
            'Nothing changes in an embedded page or in a preview thumbnail: those have no walker, so there is nothing to walk into.'
        ],
        tags: ['portal', 'walk', 'navigation', 'vr', 'exhibition', 'visiting'],
        updated: '2026-08-24'
    },
    {
        id: 'portal-door-shape',
        category: 'Editing',
        title: 'What shape a door is',
        summary: 'A gateway portal can be a square-cornered frame you walk through instead of a glowing ring on the floor.',
        body: [
            'A gateway portal has always drawn one thing: a glowing ring lying flat on the floor, with a soft halo around it. That reads well in a dark, atmospheric room, and it is still what every door does unless you say otherwise.',
            'It is also the only thing a door could be, which made some rooms impossible to build. A ring is a circle with a glow — and a space built to the studio’s own identity has square corners everywhere, hairline edges, flat fills, and no glow at all. There was no way to author a doorway that belonged in one of those rooms.',
            'So a portal now has a shape:',
            { list: [
                'style: "gateway" — the ring and its halo. The default, and exactly what it has always looked like.',
                'style: "frame" — a threshold standing on the floor: two uprights, a lintel across the top, a sill across the bottom, all square-cornered and flat, with no halo. The opening carries a barely-there fill that is also its tap target, so pointing at the doorway itself works the way pointing at the ring does.'
            ] },
            'Both shapes are the same door in every other respect. They take the portal’s colour, they carry the same nameplate that appears as a visitor approaches, they open on a click in view mode, and they are entered on foot in walk mode from the same distance — a frame is drawn exactly as wide as the ring it replaces, so nothing about walking through changes. Scaling the portal scales the door.',
            'A frame stands up out of the floor rather than lying in it, so it wants to sit at floor level; a portal placed high in the air will have its doorway hanging there. Rotating the portal aims the doorway, the same way it aims any other object.',
            'Left alone, a portal keeps the ring — no existing room changes.'
        ],
        tags: ['portal', 'door', 'brand', 'exhibition', 'walk'],
        updated: '2026-09-03'
    },
    {
        id: 'text-reveal',
        category: 'Editing',
        title: 'Text that types itself',
        summary: 'A text object can reveal itself one character at a time instead of appearing all at once.',
        body: [
            'A text object normally draws in full the moment the scene loads. Setting a reveal on it types the text out instead, line by line, which suits work made of questions or statements the visitor is meant to read in order rather than take in at a glance.',
            { list: [
                'mode — “none” (the default, and what every existing text does) or “typewriter”.',
                'speed — characters per second. Around 30 reads as deliberate; 60–80 feels like normal typing. A long text at a slow speed can run for half a minute, so count the characters before choosing.',
                'delay — dead seconds before the first character, so a visitor has time to arrive and look at the right thing.',
                'lineDelay — an extra pause at the end of each line. Blank lines cost only this pause, so they act as beats between stanzas.',
                'loop and hold — off by default. When loop is on, the finished text holds for hold seconds and then types again from the top.'
            ] },
            'The reveal starts when the text comes into the scene, not when the visitor looks at it, and it is purely visual — the text is always fully present in the document, so copy, search and translation are unaffected.',
            'Only the line currently being typed is redrawn; finished lines are drawn once and left alone. That keeps a long text cheap enough for a headset, where redrawing a whole block of type every frame would not be.'
        ],
        tags: ['text', 'typography', 'animation', 'entities', 'exhibition'],
        updated: '2026-08-07'
    },
    {
        id: 'admin-manage',
        category: 'Spaces & access',
        title: 'Ops Graph — the admin console',
        summary: 'Ops Graph, at /admin, is admins-only; your own spaces are managed from /studio.',
        body: [
            'Ops Graph is di.iiii’s console. It lives at /admin and is visible to admin accounts only — everyone else is pointed back to their Spaces page. Owners never need it: your own spaces are fully self-service on /studio.',
            'Admins manage everything from Ops Graph → Manage: a directory tree of spaces, each expanding to its projects. The console keeps three admin sections (Manage, Open Call, Agents) and four diagnostics sections (Overview, Inspect, System, Estate); the header shows counts for the work at hand instead of 3D telemetry while you administer.',
            { list: [
                'Create / rename / delete spaces and projects inline.',
                'Edit a space or project’s public link (slug) separately from its rename — the id underneath never changes, so old links stay valid.',
                'Toggle Public / Permanent / Locked, set the published project, and choose the default space.',
                'Set the guest entry (shared global space) and grant per-account access and roles (viewer / editor / admin).'
            ] }
        ],
        tags: ['admin', 'manage', 'access', 'slug', 'ops graph'],
        updated: '2026-08-19'
    },
    {
        id: 'admin-estate',
        category: 'Spaces & access',
        title: 'Estate — the machines behind di.iiii',
        summary: 'A read-only map of every machine, address and store the studio runs, shown inside Ops Graph.',
        body: [
            'Ops Graph → Estate renders the studio\u2019s infrastructure map: the tailnet topology, every machine and what it is for, what runs where, the public names, and the totals \u2014 threads, memory, storage, GPUs, backups.',
            'It is written and kept in a private repository, not in this one. This repository is public, so the map is never committed here and never served from the static site; the server reads it from a path given at deploy time and hands it only to admin accounts.',
            { list: [
                'A host that was never given the file says so plainly \u2014 that is the normal state, not a fault.',
                'The map is displayed in a fully sandboxed frame: no scripts, no forms, no same-origin access.',
                'Source name, last-modified date and size are shown above it, so a stale copy is visible rather than believed.'
            ] }
        ],
        tags: ['admin', 'estate', 'infrastructure', 'diagnostics'],
        updated: '2026-08-19'
    },
    {
        id: 'agents-board',
        category: 'Spaces & access',
        title: 'Ops Graph → Agents',
        summary: 'An operator-only map of the Claude Code sessions and agents working on this machine.',
        body: [
            'The Agents section of Ops Graph shows the AI sessions working alongside you: a live map of every running Claude Code session, which checkout and branch each one holds, and a directory of recent chats with their topics.',
            'Selecting a session opens its detail: the subagent tree it spawned, its background-job state, and the tail of its conversation.',
            { list: [
                'The map links each live session to the checkout it is editing — two sessions on one tree is visible at a glance.',
                'Live status (busy / shell / idle) updates every few seconds.',
                'This section reads local machine data, so it only exists when serverXR runs on your own machine in dev mode. Deployed environments serve nothing here.'
            ] }
        ],
        tags: ['admin', 'agents', 'ai', 'sessions', 'operator'],
        updated: '2026-08-19'
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
                'WASD — walk when you are inside a scene; click (or drag) to look with the mouse; scroll — step forward/back toward what you face',
                'F — fly mode (Space / Q up, C / E down); on phones, up/down buttons appear while flying',
                'VR & AR controllers — left stick walks, right stick turns and flies (push the stick up/down); works in passthrough AR too; a hint appears in-headset the first time you enter'
            ] }
        ],
        tags: ['shortcuts', 'controls', 'vr'],
        updated: '2026-08-19'
    },
    {
        id: 'api-and-agents',
        category: 'For developers',
        title: 'API & agents',
        summary: 'Read and drive spaces and projects over the serverXR REST API.',
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
        updated: '2026-08-19'
    },
    {
        id: 'license-and-openness',
        category: 'For developers',
        title: 'License & openness',
        summary: 'di.iiii is open source under AGPL-3.0 — read it, run it, self-host it; your content stays yours.',
        body: [
            'di.iiii’s code is licensed under the GNU AGPL-3.0 (see the LICENSE file in the repository). Anyone may read, use, modify, and self-host it; anyone who hosts a modified copy must publish their changes under the same license — the commons can grow but not be enclosed.',
            'Content is separate from code: spaces and projects you create belong to you, and published spaces stay free to visit — no login is ever needed to view a public space.',
            'Self-hosting is a supported path (npm run selfhost, docs/deploy/SELF_HOST.md), and space bundles are exportable, so your work is never locked to this host.'
        ],
        tags: ['license', 'open source', 'agpl', 'developers'],
        updated: '2026-07-19'
    },
    {
        id: 'privacy-and-terms',
        category: 'Spaces & access',
        title: 'Privacy & terms',
        summary: 'What di.iiii stores about you and under which terms — plainly, at /privacy and /terms.',
        body: [
            'Two pages disclose how di.iiii treats you: /privacy describes exactly what is collected (the session cookie, OAuth profile fields, uploads, retention) and what is deliberately not (no third-party analytics, no stored IP addresses, no tracking that links visits together) — including the parts that are not built yet, named as gaps rather than hidden.',
            '/terms covers the AGPL-3.0 license, the 3-free-spaces limit, and the append-only nature of anonymous inscriptions.',
            'Visits are counted anonymously first-party: one event per page load with path, time, and referring site — no cookie, no IP, nothing identifying.',
            'For anything the pages do not answer, or to request account or data removal by hand: info@thedi.studio.'
        ],
        tags: ['privacy', 'terms', 'legal', 'data', 'contact'],
        updated: '2026-08-18'
    },
    {
        id: 'github-sync',
        category: 'For developers',
        title: 'GitHub sync',
        summary: 'Connect a space to a GitHub repo — pushes auto-update the live space.',
        body: [
            'A space can be linked to a GitHub repo so every push updates the live space automatically, through the di.iiii GitHub App. No command line needed — space owners connect from the Spaces page (/studio → GitHub sync on your space card); admins have the same panel in Ops Graph → Manage.',
            { list: [
                'Open GitHub sync on your space card, click the connect button — GitHub asks which repos to allow (one time).',
                'Back in di.iiii the repo list fills in by itself — pick your repository from the dropdown and it connects immediately.',
                'Edit your repo’s entry file (e.g. index.html) and push — the space re-syncs in seconds.',
                'Advanced: add a di-space.json manifest to the repo and pushes sync the whole space: "include" globs bring extra code files (css/js/…), "assets" globs upload the media your entry references (videos, images, models) with their URLs rewritten automatically. Without a manifest, only the entry file syncs.',
                'Sync is one-way (repo → space); Disconnect anytime.'
            ] }
        ],
        tags: ['github', 'sync', 'developers', 'deploy'],
        updated: '2026-08-19'
    },
    {
        id: 'google-drive-import',
        category: 'Editing',
        title: 'Import from Google Drive',
        summary: 'Connect your Drive and pick files with the Google picker, or paste a public share link.',
        body: [
            'In the Studio editor open the Create window — the Google Drive section sits right under Import files, already expanded. Two ways to bring files in:',
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
        updated: '2026-08-19'
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
        updated: '2026-08-19'
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
                'An image whose metadata cannot be removed is refused, not saved — you get an error asking for a JPEG or PNG instead. iPhone HEIC photos are the usual case: set Camera → Formats → Most Compatible on the phone, and the photos arrive as JPEG.',
                'Photos imported from Google Drive go through the same scrub, and are refused on the same terms.',
                'Video, audio, 3D models and archives are stored as uploaded; their metadata is not stripped.',
                'This applies to new uploads. Images uploaded before this change keep the metadata they arrived with.'
            ] }
        ],
        tags: ['assets', 'uploads', 'privacy', 'exif', 'photos', 'heic'],
        updated: '2026-08-22'
    },
    {
        id: 'open-call-applications',
        category: 'Spaces & access',
        title: 'Open-call applications',
        summary: 'A space’s published page can carry an application form; submissions are stored in di.iiii and reviewed in Ops Graph → Open Call.',
        body: [
            'A space’s published page (like the Beyond Form open call) can host its own application form. Submissions are stored in di.iiii and — where the call uses one — mirrored to the organizers\u2019 Google Form in the background.',
            { list: [
                'Review: admins open Ops Graph \u2192 Open Call to see applications with status chips (new / shortlist / accepted / declined), per-applicant notes, and status counts.',
                'Filter by status, expand a row for the full answers, and export everything as CSV for sharing with partners.',
                'Delete removes an application permanently (confirmation required) — use it to clear test submissions and junk entries.',
                'The public submit endpoint is unauthenticated and rate-limited; reviewing, updating, and deleting require an admin session.'
            ] }
        ],
        tags: ['open call', 'applications', 'admin', 'forms'],
        updated: '2026-08-19'
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
        updated: '2026-08-19'
    },
    {
        id: 'raw-lane',
        category: 'Editing',
        title: 'The node editor: free-form nesting',
        summary: 'di.iiii’s node editor lives at /<space>/raw. Any node can hold a graph of its own, and entering a Scene opens it fullscreen.',
        body: [
            'The node editor is the other way to build: a canvas, nodes on it, and wires between them. Its core idea is free-form nesting — no node type is a singleton, and any node can be entered to author a graph inside it.',
            { list: [
                'A space’s node projects are listed at /<space>/raw/projects (same sign-in rules as Studio). /<space>/raw opens the canvas itself — a scratch surface stored in your browser, not on the server; /open/raw is that canvas addressed to the communal open space.',
                'A canvas can become a real project: the ⋯ menu’s “Save to <space>” copies what is on it into the space you are in, names it, and opens it as a project — from then on it syncs, opens on another device, and can be shared. The canvas itself is left as it was, so the scratch surface stays yours.',
                'One project, two editors: the ⋯ menu’s “Open in Studio” swaps the project you are in over to the Studio editor, and Studio’s toolbar “⇄ Nodes” button swaps it back. A project made here shows as “Nodes” in Studio’s project list.',
                'Crossing from Studio into the node editor shows an empty graph, and that is the truth: a project built in Studio has objects, not nodes. The canvas says so — “Built in Studio — N objects in the room, no nodes yet” — and its “See the room” button opens the 3D view where those objects are standing. Adding a node there adds it to that same room; nothing you built in Studio is lost or hidden by crossing over.',
                'Enter any node with its “Enter ›” button; the breadcrumb tracks your depth and Escape steps back out one level at a time.',
                'Entering a Scene node opens its 3D viewport fullscreen; the ← Scene button in the toolbar drops back to the graph.',
                'The canvas stays clear on purpose — what you place stands in the room, not behind the cards. So the toolbar’s Scene button counts it: “Scene · 3” means three things are standing in the room at the level you are on, and it changes the moment you place the first one. Plain “Scene” means the room is still empty. On a phone the toolbar drops the words and keeps the controls — the arrow, the count, the ⋯ menu.',
                'The palette groups its nodes into seven families by what you are doing — bring in, make, numbers, the scene, watch, send out, agents — each with its own colour, the same colour the node’s card wears on the canvas. Typing dissolves the groups into a flat search. It only lists node types that actually compute or render; a “shell” tag marks anything that places but carries nothing yet, and “local dev” marks nodes that only work against a local dev server.',
                'While you drag a wire, every input that can take it lights up and every input that cannot goes quiet — an incompatible drop no longer fails silently.',
                'Starting from nothing: a blank canvas shows a “Build an example” button in the canvas’s lower band (out of the double-click zone). It builds a scene with a light, a cube, a colour wired into that cube, and an empty Model node waiting for your own file — plus a note giving the moves in plain words. It only offers itself on a truly blank canvas at the top level: inside a container the empty state stays yours (a stray double-click used to inject the whole demo INTO the container being filled); the ⋯ menu still offers it deliberately, anywhere. It is there because a blank canvas opens with no toolbar at all, so the ⋯ menu (which also offers it) does not exist for the person most likely to want it.',
                'The Geo is the plain container — TouchDesigner’s Geometry COMP, by name. It arrives empty but is visibly a place (a faint floor tile marks its footprint), you enter it and collect what you need — objects, models, Lights — and everything renders inside it and travels with it. It adds nothing of its own — no shell, no rules — and it gives out what it collects: a Geometry port carrying everything standing in it as one shape, so Geo → Merge → Constructor composes collected scenes, and a Geo standing inside a Geo carries through. When in doubt, build in a Geo. A Geo stands on the floor, and in the scene a click picks up the whole Geo — drag it or set its Position to part two geos; enter the Geo to handle one thing inside. A place shows only what stands IN it: objects made in Studio’s Create window live in the project’s top scene and never appear inside a container.',
                'Light and Environment are two nodes now, because they were always two things. A Light is a lamp: a real point light with a glowing marker, standing wherever you put it — top level or inside any container, no disappearing act. An Environment is the scene’s settings: the ambient wash and one sun (colour, intensity, direction), one per level, the ● toggle picking the active one. Old projects made before the split keep their old Light nodes and light exactly as they did.',
                'The Camera is the authored eye. Placing one never steals the view: it stands in the scene as a small housing until the ● toggle on its card marks it as the eye for this level. Marked, the scene is seen through it — Position, Look At and FOV are inputs like any other, so a wire can move the shot — its housing disappears, and orbiting is off because the shot is authored. Unmark (or delete) it to look around freely again.',
                'The projector cable: /out. Every project has an output address — /{space}/raw/projects/{id}/out — that renders just the scene, read-only, no toolbar, following every edit live. A space\'s own canvas has /{space}/raw/out (same browser only — a local canvas lives in that browser). Add ?scope= to output a container\'s scene; mark a Camera ● there and the output holds the authored shot. If the space is public, /out is public with it — open it on the show machine, press F11, walk away, no sign-in anywhere. In a private space it stays behind the same gate as the editor, so that machine has to be signed in as someone with access. The space\'s own canvas /out is always gated: it renders whatever is in THAT browser, so there is nothing in it to show anyone else.',
                'The Constructor is the first node made of nodes: a container that wears whatever shape the nodes inside it build. Place parts inside and it wears them — wire an Out door only when you want to say “exactly this, nothing else”. See “The Constructor: a node made of nodes”.',
                                'In the scene, touch works the way you expect: click an object to select it, click empty floor to deselect, drag to move it (the camera holds still), hold Shift while dragging to lift it, Ctrl/Cmd+D to duplicate the selected node.',
                'The canvas is clear — always. Cards on flat paper, nothing behind them. The scene is a view you open: the Scene window (drag its corner glyph to size it), the Scene button or the palette\'s Scene command for fullscreen, and /out for a whole display. Fullscreen survives walking through doors: each door swaps which scene fills the screen.',
                'One rule for every place: a container shows only what stands IN it. A Geo draws its contents in the scene; a Scene is its own stage, seen through its window or by entering it; a Constructor shows only what reaches its doors. The 3D Desk is no longer offered — Geo is the place that does that job (old desks keep working exactly as they were).',
                'A container has a wall, and you make holes in it. Enter a Scene, a Geo or a Studio, place an In node inside it, and a port with that name appears on the container’s outer face — wire something into it from outside and the In node hands that value to whatever it feeds inside. An Out node does the same in reverse. This is how TouchDesigner, Blender, Max and Unreal all do it, and it is the answer to “I can’t connect anything to a Scene”. Renaming a doorway never breaks its wire: the port is identified by the node itself, not by its name. Two limits worth knowing — a doorway only makes a port on the container it is INSIDE, and a Code node (node.null) cannot grow one, because its ports are already fully hand-declared.',
                'Standing inside any node, “what is it made of” — beside the “inside X” label, and on the canvas itself when there is nothing in there — opens a reading of that node: what it takes and gives with the values going through it at that moment, where each of those values came from, what works them out, what puts the node on screen, and what is inside it. Every node answers the same four, so reading one teaches you how to read all of them. It is the honest answer to “why can’t I see what a cube is”: a cube has no inside because it is made of code rather than of other nodes, and this says what it has instead.',
                'A container also gives out its own settings, and only those: a Scene offers its Title and Sky, a Geo its Position, Rotation and Scale, a Studio its Title. Nothing about what is inside a container leaks through its wall by itself — that is what the doorways are for, and it is deliberate. Assuming otherwise is the most common mistake people make with containers in every tool that has them.',
                'Your own files come in through three “bring in” nodes: Model (.glb/.gltf incl. Draco and Meshopt, .obj, .stl, .fbx — with its animations, which Play/Speed/Clip control), Video and Sound. Drag a file straight onto the canvas and the node arrives holding it; drop it onto a scene and it lands in that scene, already visible. On a phone, where there is nothing to drag, the ＋ beside the node’s file picker opens the same door. In a project on the server the file uploads and your collaborators get it; on a local canvas it stays in this browser.',
                'Webcam is the first real capture node: it asks for camera permission, shows a live preview on the node itself (with a visible message if access is denied or no camera is found), and its Frame output can be wired into a Plane’s Texture input to project the live feed onto geometry.',
                'The Monitor is the canvas\'s viewer window: wire any texture into its Source — a Webcam\'s or a Video\'s Frame — and watch it live while you keep wiring, TouchDesigner\'s operator viewer as a window. It only watches; scenes have the World window, the Scene button and /out.',
                'Microphone is the second: it shows a live level meter on the node itself, and its Volume/Frequency outputs update continuously for anything wired to read them.',
                'Work Status reads your local dev setup — recent sessions, worktree branches and dirty state, open PRs, recent deploys — and outputs a running count, a dirty flag, an open-PR count and a text summary. Local dev only; it 404s on a deployed server.',
                'Agent Run launches a real headless `claude -p` process from a wired Prompt and fires on a Trigger port changing value (not on it being truthy — same contract as the clock’s beat output). Its Status/Running/Result outputs update as the run progresses. Local dev only, and only inside a di.iiii checkout.',
                'A Timeline node (view.timeline) cuts clips on a frame-exact timeline: drag to move, drag an edge to trim, razor at the playhead, ripple later clips, retime a clip from 0.1x to 4x. Gaps are drawn as red hatching and cross-fades in amber, so an accidental hole in a cut is visible rather than silent.',
                'A Director node (view.director) is a timeline editor for code-authored pieces, moved out of algovrithm into the node editor on 2026-08-05 and generalised the same day — it takes the piece as input rather than being welded to one, so a future piece is a registration rather than a fork. For algovrithm it can retime and reorder its beats, edit each scene’s colour, fog and lights, and drop assets onto the timeline — the same panel the Director page inside Studio opens embedded in the piece, so this is a second way to reach it, not the only one. “Save to source” writes src/algoVrithm/sequences/index.js in place with its comments intact from either one.'
            ] }
        ],
        tags: ['raw', 'nodes', 'editor', 'experimental', 'nesting', 'webcam', 'microphone', 'work-status', 'agent-run', 'timeline', 'director', 'model', 'glb', 'video', 'sound', 'import', 'containers', 'doorways', 'ports', 'scene', 'example', 'getting-started', 'anatomy', 'made-of', 'crossing'],
        updated: '2026-08-23'
    },
    {
        id: 'studio-node',
        category: 'Editing',
        title: 'The Studio node: an editor you can place in a graph',
        summary: 'Studio is one entry in the palette. Place it like any other node, enter it, and you find the panels it is assembled from — the same container idea you would use to build your own node later.',
        body: [
            'In the palette, Studio sits next to Colour, Browser and Cube. Placing it gives you a single card on the canvas. Entering that card — the “›” control on its header — takes you inside, where you find the nodes it is made of: a Scene, an Outliner, an Inspector, and Create. It is one node from the outside and a graph from the inside.',
            'Create (added 2026-08-18) is the panel that makes the scene usable: the same shapes, text and lights Studio’s own Create window offers — box, sphere, cone, cylinder, plane, torus, capsule, ring, text, group, portal, and the four lights — placed straight into the scene. It is the same list Studio uses, kept in one place so the two can never drift apart, and what it makes is a real object in the project: selectable, editable in the Inspector, undoable, and visible to everyone else in the space.',
            'This is the same shape TouchDesigner uses for a Component and Nuke uses for a Group: a container whose contents are a normal subgraph. That is the point of building it this way rather than hard-wiring Studio into the editor — the mechanism that makes Studio a node is the mechanism that will let you wrap your own patch into a palette item and place it beside the built-in ones.',
            { list: [
                'Every node in a scope now appears on the canvas, panels included. Previously a panel existed only as a floating window, so you could not select, move, wire or delete it from the graph, and a wire feeding a panel was invisible even though it was carrying a value.',
                'A panel window and its card are two views of one node: close the window and the card remains; open it from the Windows menu and the panel comes back.',
                'Studio’s panels start closed so that entering the node shows you its graph rather than three windows over it.'
            ] },
            'What is not there yet: Studio’s remaining panels — assets, code, share, projects — are still built in rather than nodes, because their bodies need a large amount of editor state that has not been re-plumbed yet. Two design questions are also deliberately still open: which of a container’s inner ports should show on the outside, and whether a saved palette item stays linked to the graph it came from or becomes a frozen copy.'
        ],
        tags: ['raw', 'studio', 'nodes', 'container', 'palette', 'nesting', 'touchdesigner', 'create'],
        updated: '2026-08-19'
    },
    {
        id: 'what-a-node-is-made-of',
        category: 'Editing',
        title: 'What a node is made of',
        summary: 'Walk into any node and read the same four things: what it takes and gives with the values going through it right now, what works those out, what puts the node on screen, and what is inside it.',
        body: [
            'Walking into a Cube used to show a blank canvas. Then it showed one sentence saying a Cube has no inside. Both answer “is there anything in here”, and neither answers the question people were actually asking, which is what the Cube IS. “what is it made of” — the control beside the “inside X” label, and a button on the canvas when the node you are in is empty — answers that one.',
            'It asks the same four questions of every node there is. Three are answered differently from node to node; the fourth is the only structural difference between a Cube and a container.',
            { list: [
                'What it takes and gives — every port, its type, and the value on it at this moment, taken from the same reading the scene is drawing with. Under each value is where it came from: down a wire (and from which card, with a control that takes you to it), typed on this node, or left at the port’s default.',
                'What works it out — whether its answers come from code, from its own window while that window is open, or from an Out door standing inside it. A container usually answers two ways at once, and the sheet names both.',
                'What puts it on screen — whether it stands in the scene, opens as a window over the canvas, or is drawn nowhere at all and exists only to feed other nodes.',
                'What is inside it — nothing, for anything made of code; or the count of what it holds, for a container you are standing in.'
            ] },
            'Two things it will tell you that nothing else does. A wire that is connected but carrying nothing reads as exactly that, rather than as a live wire — the node quietly falls back to its own value in that case, and now you can see it happen. And a doorway you placed but never wired reads “nothing wired in”, so you can tell at a glance which of a container’s doors are actually connected to anything.',
            'It only reads. Nothing on it changes the document, and there is no field to type in — changing a value is still the Inspector’s job. A value shown as “nothing” means the port is genuinely carrying nothing, which is a different fact from carrying zero or an empty word, and the sheet keeps those apart on purpose.',
            'And it can show you the code. Where a node is worked out or drawn, the sheet names the file and the exact lines — “Show the lines” opens them, real and unedited, fetched only when you ask. The pointing can never rot: a build step measures the real files and CI fails the moment an edit moves them, and if a running page and its code ever disagree the sheet refuses to show anything rather than show the wrong lines. Where one piece of code answers for several nodes at once — the five value nodes share one — it says so, so reading it once is reading all of them.'
        ],
        tags: ['raw', 'nodes', 'anatomy', 'ports', 'doorways', 'containers', 'made-of', 'learning', 'constructor', 'code', 'source', 'lines'],
        updated: '2026-08-19'
    },
    {
        id: 'the-constructor',
        category: 'Editing',
        title: 'The Constructor: a node made of nodes',
        summary: 'A container that wears whatever shape the nodes inside it build. Enter it, wire shapes into its Out door, walk out — it stands in the scene being that shape.',
        body: [
            'Every node used to be made of code — you could read the code, but you could not open the node and change what it is. The Constructor is the first node made of nodes. Its inside is its definition; its outside is the result.',
            { list: [
                'Place a Constructor from the palette (it sits with the other “make” nodes). Empty, it stands as a violet wireframe: shape goes here.',
                'Enter it. Place a Cube or a Sphere or a Plane — it appears in the scene behind your cards as you place it, and the Constructor outside is already wearing it. No wiring needed: everything you place inside contributes, like TouchDesigner’s flags.',
                'Each part keeps its own Position, Rotation and colour, so a snowman is two spheres with different positions — placed, not plumbed. For exact control, place an Out door and wire shapes into it (through a Merge for several): the moment a door exists, ONLY what reaches a door is worn.',
                'The inside is a workshop, not a room: the parts standing in it are not drawn as objects in the outer room — only what reaches a door is drawn. Standing inside, you see your parts; standing outside, you see the result.',
                'Everything stays live. Wire a colour into a part inside, and the worn shape outside changes with it; wire the clock’s Sin into a Sphere’s Radius and the worn shape breathes.',
                'Geometry is a value like any other — the violet port. Cube, Sphere and Plane each give their shape out as Geometry, and built shapes nest: place one Constructor inside another and wire the inner one’s port onward toward the outer door.',
                'Ask any Constructor “what is it made of” and the sheet answers like it answers everything: its doors, what they carry right now, and how many nodes are standing inside.'
            ] },
            'Limits, stated plainly: a worn shape carries colour but not textures or files yet; Model, Video and Sound do not give Geometry out; a feedback loop — two Constructors feeding each other — wears nothing rather than something arbitrary; and a runaway graph is capped at 256 pieces and 16 levels deep, so one wire cannot freeze the scene.'
        ],
        tags: ['raw', 'constructor', 'geometry', 'shape', 'merge', 'nodes', 'container', 'doorways', 'build', 'graph'],
        updated: '2026-08-19'
    },
    {
        id: 'raw-windows-travel-with-the-canvas',
        category: 'Editing',
        title: 'Panel windows: travelling with the canvas, or pinned to the screen',
        summary: 'An unpinned panel window (Scene, Text, Image, List) lives on the canvas with its card — pan and it moves, zoom and it shrinks. Press ⌖ to pin one to the screen instead. Resize from any edge, and scrolling inside a window scrolls the window, not the desk.',
        body: [
            'A panel node — Text, Scene, Image, List, Browser, Monitor — is two views of one thing: the card on the canvas and the window that shows its panel. Unpinned, that window is placed in the same graph space as the card: panning the canvas carries it along, and zooming out shrinks it with everything else, the way a scene parked far from the rest of the desk stays reachable by panning to it rather than by scrolling a fixed sidebar.',
            { list: [
                'Press ⌖ to pin a window to the screen — it holds still at its current on-screen position and size while the canvas pans and zooms underneath it, the old behaviour. Press it again to release it back onto the canvas, where it keeps exactly where it was standing.',
                'Drag the title bar to move a window; drag any edge or corner to resize it, not only the bottom-right grip. Arrow keys on the title bar move it, arrow keys on the corner grip resize it — hold Shift for a one-pixel nudge.',
                'Scrolling inside a window\'s body belongs to that window: a Text note scrolls, a List scrolls, a Scene orbits. Scrolling on the canvas zooms the desk, and Ctrl/⌘ + scroll zooms the desk from anywhere, including over a window.',
                'On a phone every window stays pinned — the clamp that fits a wide default frame into a narrow screen is the whole layout there, and a window that travelled freely on the canvas would walk straight off it.'
            ] }
        ],
        tags: ['raw', 'nodes', 'windows', 'pin', 'resize', 'zoom', 'canvas', 'editor'],
        updated: '2026-09-03'
    },
    {
        id: 'raw-on-a-phone',
        category: 'Editing',
        title: 'Nodes on a phone: wiring with a finger',
        summary: 'The node editor is usable on touch — pinch to zoom, drag between ports to wire, and an All Nodes Example that puts the whole palette in one graph.',
        body: [
            'The graph editor was previously mouse-only in a way no amount of zooming could work around: starting a wire on an output port captured the pointer, so the release never reached the input port under your finger and no connection could be made. Dragging between ports now works the same way on a phone as on a desktop.',
            { list: [
                'Drag from an output port to an input port to wire them. You do not have to land exactly on the dot — the drop snaps to the nearest port that accepts that type, within a finger’s width, so a small miss still connects.',
                'Pinch with two fingers to zoom and pan the canvas at the same time. The zoom buttons in the bottom-left corner do the same thing in steps.',
                'Opening a graph fits it to the screen instead of dropping you at 100% somewhere inside it, so you can see the whole patch before choosing where to work.',
                'Tap a wire to delete it — the tap area is much wider than the line you see.',
                'Panel windows (Scene, Text, Browser, Image) shrink to fit the screen rather than running off the edge.'
            ] },
            'The overflow menu (⋯) has an All Nodes Example: one graph containing every node type the palette can create, with a clock driving a chain of maths into a pulsing sphere, a colour crossfade on a cube, and a breathing light. It is the quickest way to see what the node system can currently do — and it is deliberately honest about what it cannot: geometry, texture and signal outputs are declared on several node types but are not computed yet, so those ports are left unwired rather than connected to look complete.'
        ],
        tags: ['raw', 'nodes', 'mobile', 'touch', 'phone', 'example', 'editor'],
        updated: '2026-08-19'
    },
    {
        id: 'br-id-ge',
        category: 'Spaces & access',
        title: 'br_id_ge (կամուրջ): an Armenian XR rite — shown at Notations #2',
        summary: 'br_id_ge is a rite at /br_id_ge — cross the bridge, be read into Armenian letters, leave a chrome core. Shown at Notations #2, Jul 20 – Aug 2 2026, State Philharmonia of Armenia.',
        body: [
            'br_id_ge (կամուրջ, "bridge") is an Armenian XR rite that lives in di.iiii as a space — the same pattern as WCC and Beyond Form, routed through the normal public/private check. It was shown at Notations #2 (theme: "Rituals"), hosted by hosq at the State Philharmonia of Armenia, Jul 20 – Aug 2 2026, with festival days Aug 1–2.',
            { list: [
                '/br_id_ge — the door: the entry page for the rite.',
                '/br_id_ge/rite — cross the bridge: your silhouette is read into Armenian letters, you answer one question, and you leave a permanent chrome core.',
                '/br_id_ge/field — the field: every core is one crossing, accumulated as a persistent record in the space.'
            ] }
        ],
        tags: ['br_id_ge', 'exhibition', 'linked-space', 'rite', 'notations'],
        updated: '2026-08-19'
    },
    {
        id: 'wcc-exhibition',
        category: 'Spaces & access',
        title: 'WCC: Women Creating Change — a virtual exhibition space',
        summary: 'WCC is an exhibition space at /wcc — a landing page plus a 3D gallery of participant artworks at /wcc/scene, the same pattern as br_id_ge.',
        body: [
            '“WCC: Women Creating Change” is a contemporary-art initiative supporting participants in turning personal experience into artworks, presented through a virtual exhibition — like br_id_ge and Beyond Form, it lives in di.iiii as a space like any other, routed through the normal public/private check.',
            { list: [
                '/wcc — the exhibition landing page: about text, session recaps, and the participating artists’ works with concept statements.',
                '/wcc/scene — the 3D gallery, the same works standing in a room you can walk through.',
                'Public when the wcc space is marked public (same server-verified isPublic check as any other space) — otherwise it falls back to the normal sign-in gate.'
            ] }
        ],
        tags: ['wcc', 'exhibition', 'linked-space', 'art'],
        updated: '2026-08-19'
    },
    {
        id: 'algovrithm',
        category: 'Spaces & access',
        title: 'algovrithm — a code-authored VR space',
        summary: 'algovrithm is a space whose scene is written in three.js/R3F code rather than authored in Studio. /algovrithm introduces it; /algovrithm/scene is the piece.',
        body: [
            'algovrithm is a WebXR experience built the way br_id_ge and WCC are — a real space, routed through the same server-verified public/private check — but with one difference that matters: what you walk into is not a project you edit in Studio. It is code, living in src/algoVrithm/, so it can do things the object model does not express (generative geometry, per-frame math, custom shaders).',
            { list: [
                '/algovrithm — the front door, and /algovrithm/scene — the piece, the same split as /wcc and /wcc/scene. The name is spelled lowercase and unpunctuated so that it is a legal space id exactly as written: unlike br_id_ge, whose URL keeps a styled name that has to be slugified down to the br-id-ge space, here the id, the URL and the label are one string with no seam between them.',
                'The front door is built from the concept and nothing else: the work’s name, the way in, the work moving, and the artist’s statement verbatim. Three rounds of cutting on 2026-08-04 removed three vocabularies rather than three decorations — the repo’s (src/algoVrithm/, startSec/endSec), the cutting room’s (a draggable timeline of the clip windows and their overlaps, a playhead, a running clock, timecodes on every beat), and finally the render pipeline’s (the beat names themselves — “Metaball field”, “Test pattern”, “Dispersion sphere” are techniques, and a list of them is a spec sheet however well it is set). What it costs is that a visitor cannot find out what the piece contains without entering it; the beats, their windows and their overlaps live in sequences/index.js and the director panel. A regression test asserts the page speaks no production vocabulary and reports no measurement. The page exists because entering costs a 1.6 MB renderer and a strobing piece that carries a photosensitivity warning, and neither should be spent on somebody who has only followed a link. It loads no three.js at all, opens on a held frame when the visitor’s system asks for reduced motion, and keeps one control — pause — because motion that starts by itself has to be stoppable.',
                'The picture behind the statement is the piece’s own shaders, running full-viewport on a bare WebGL context — not three.js, so the page still costs nothing to arrive at. Four of the seven beats are per-pixel fields (an exponential smooth minimum, a domain-warped fbm, a tent-filtered ramp, a limb term), which a 2D canvas cannot evaluate at all: the version before this one faked the metaball merge with radial gradients. Two departures from the piece are declared rather than hidden — the door views the halo’s ripples from 20m rather than the visitor’s 1.54m, because a fixed frame at eye height has every ring born outside it, and the monument’s camera is pitched 16° up, because the sphere’s top edge sits past a level gaze. The dispersion sphere also runs with its full-spectrum rainbow off: that knob is an authored exception to the work’s two-hue palette, and nothing on this page has been consented to. The 2D poster stays in the tree as the fallback for a machine that cannot compile the shaders, and a scrim between the picture and the text carries a measured contrast (15.5:1 for the prose) because two of the beats fill the frame with white.',
                'It plays itself — seven beats in 53 seconds, no controls to learn — and loops continuously, so it can be left running for a whole exhibition day and a visitor who walks up halfway through only has to keep standing there to see the opening. “Enter VR” / “Enter AR” appear only when the headset or phone actually reports support for that mode, and entering VR restarts the piece from the top.',
                'Changes between beats are cross-dissolves. Sequence windows overlap, each beat fades on its own envelope, and the scene blends its backdrop colour and fog across the handover, so one beat becomes the next without anything being laid over the top of it. The glitch veil that used to cover every handover with a wall of horizontal signal noise was removed on 2026-08-04 — it read as an effect applied to the piece rather than something happening inside it. TransitionVeil.jsx and its maths are still in the folder, unmounted, for the case where a crossing needs covering again.',
                'The piece carries a synthesized spatial score: every beat has sound placed in the room around the visitor (the scan beat’s machine tick circles the head, the metaball hums sit on the blobs’ own orbit ring and close in with them, the reel globe plays 31 positional reel tracks from their places on the shell, and the closing sphere’s colonnade flashes are heard stepping away from you column by column). The handover static went silent with the glitch veil it belonged to — a head-locked burst of digital garbage with nothing failing on screen is the loudest sound in the piece attached to nothing the visitor can see. No audio files — everything is generated, driven by the same playhead as the picture, and browsers require one touch, click or key before any sound is allowed to start.',
                'The front door carries the artist’s statement, verbatim and in the first person, set below the preview, as the whole of the page’s prose. That placement is the point: read the beats first and they are craft — strobe rings, hairline bars, 288 reels — and read the statement first and the same seven beats are the six gestures it names (scroll, swipe, refresh, wait, record, repeat) treated as the rituals of a generation that never had to cross between the physical and the digital.',
                'Because the piece is code, editing it means editing the files in src/algoVrithm/ — the Studio editor has nothing to open for this space.',
                'The authoring tools start hidden and open on H. Everything an author needs — the timeline, the scene and light controls, the placement handles, the “why is there no Enter VR button” message — is behind that one key, so the piece can be watched as an audience sees it without turning anything off. On a phone or tablet there is no keyboard to press, which is exactly the intent: what is left on screen is Enter AR and Full screen and nothing else.',
                'With the tools open the screen splits — the piece keeps the top 55%, the editor takes the bottom 45%, and neither sits on top of the other, so the part being worked on is never behind the controls working on it. Ctrl+Z (Cmd+Z on a Mac) undoes edits and Ctrl+Shift+Z redoes them; a whole drag of a handle or a clip edge counts as one undo rather than one per frame.'
            ] },
            'It is built as a timeline rather than one fixed scene: a single playhead runs 0→1, and each sequence claims an in/out window on it in src/algoVrithm/sequences/index.js. Windows overlap on purpose so handovers cross-fade instead of cutting, and each sequence declares its own backdrop colour and fog range which the scene blends between — without that, the near-white opening would hard-cut to the near-black beat after it, which in a headset is genuinely unpleasant.',
            'The playhead is advanced from the render loop rather than from a timer of its own. This matters in a headset: once an immersive session starts, the browser stops driving the flat page and the piece is drawn from the headset’s own frame callback instead, so a clock running on a page timer simply stops — the piece would render at full frame rate showing one frozen moment. Ticking it inside the render loop means one clock, running at whatever the display in front of you actually refreshes at.',
            'The scene and its lighting are edit-list data too, not code. A row carries a scene — colour, fog range, and an ambient fill level saying how much unlit air you can see — plus an optional list of lights: point lamps, or “glow” lamps that also show the lit air around the source. Both are editable from the director panel, reachable either embedded in the piece (the Director page inside Studio) or as a Director node on a canvas (moved there 2026-08-05) — the same panel either way, with swatch grids drawn from the piece’s own palette, a custom colour picker that reports what a choice breaks without ever blocking it, and drag handles for placing a light in the scene. Lights fade in and out with the row that owns them and the ambient level blends across a handover on exactly the same curve as the colour and fog, so nothing switches on at a cut.',
            'The panel saves, to one of two places, and it tells you which. On a machine running the dev server, Save writes the edits straight into src/algoVrithm/sequences/index.js — the single source of truth: git-tracked, reviewable, and what actually deploys. It writes in place, so only the fields that actually changed are rewritten and every other byte of the file is left exactly as it was, because that file carries a couple of hundred lines of reasoning about why each number is what it is, and a save that regenerated the list would delete all of it. A save with no edits in it changes nothing at all, so the button is safe to press to find out.',
            'Anywhere else — the deployed site, someone else’s laptop, a headset — Save keeps the timing on the space instead, and says “saved to this space ✓”. That is what makes the piece retimable by someone who is not running a dev server: open the Director on di-studio.xyz, move the beats, save, and it plays that way there for everyone. Only the numbers a director actually moves travel (each beat’s start and length); the beats themselves, their scenes and the file’s reasoning stay in the code. The file remains what the piece IS and the saved timing says how this one space differs from it, so the two never fight: clearing the space’s timing always lands back on the file, and a deploy of new code does not wipe the retiming. Timing saved to a space does not travel to another one — send it on with Copy when it should become the piece everywhere.',
            '“Copy edit list” is still there for what neither save can do — rows added in the panel, which are new beats and therefore need code, and carrying an edit from one place to the repo. It regenerates the whole array, so it drops the file’s comments and any field it was not taught about; paste it over the file only when that is what you want.'
        ],
        tags: ['algovrithm', 'vr', 'webxr', 'three.js', 'linked-space', 'code', 'lighting', 'spatial-audio'],
        updated: '2026-08-19'
    },
    {
        id: 'di-cli-local',
        category: 'Getting started',
        title: 'Run di.iiii on your own machine',
        summary: 'One line installs di.iiii locally. Your work lives on your disk, and it keeps working with no internet.',
        body: [
            'di.iiii does not have to be somewhere you go. One line puts the whole thing on your own machine, with your spaces in a folder you own, and after the install it keeps working with no internet at all.',
            { list: [
                'macOS and Linux — curl -fsSL https://di-studio.xyz/get | sh',
                'Windows (PowerShell) — irm https://di-studio.xyz/get.ps1 | iex'
            ] },
            'Then type di up. It starts, opens in your browser, and you are in a Studio that looks exactly like the one online, with an empty Main Space waiting. di down stops it. di help lists the rest.',
            'Your work is files. `di save my-show` writes one file — my-show.diiii — holding everything that space is made of: the scene, every edit ever made to it, the projects inside it, the images and models. Copy it to a stick, email it, keep it for ten years; `di open my-show.diiii` puts it back, on this machine or anyone else’s. It is the same idea as a Blender file, with one difference worth knowing: a space is live, so there is nothing to lose by forgetting to save — di.iiii is already keeping it. Saving is how you get a copy you can carry, not how the work survives.',
            'You do not need the terminal for this. Every space on the Spaces page has a Save to file button, and Open a file sits next to + Create — the same file, either way. If a space of that name is already there, di.iiii asks what to call this one instead of refusing.',
            'A file remembers which di.iiii wrote it. An older file opens normally. A file written by a NEWER di.iiii is refused, with the reason, rather than opened halfway — because a half-opened file does not look broken, it looks fine and is quietly wrong.',
            'What arrives is di.iiii itself and nothing else — about a 3 MB download. The exhibitions and pieces that live on di-studio.xyz are not part of it: they are work made with di.iiii, not part of the tool, and carrying them would have made the download forty times larger for things you did not ask for. Your copy starts empty and fills with your own.',
            'This is meant for a laptop at a venue with bad wifi, a studio that would rather not keep its work on someone else’s server, and anyone who wants the piece to still open in ten years. Offline is the normal state, not a broken one. Nothing is sent anywhere: the one outbound request is a version check, at most once a day, which gives up after three seconds and never blocks anything — and the page loads no fonts or scripts from anywhere else, down to the 3D text labels, whose font ships with the install.',
            'A local di.iiii wears a green border and a small LOCAL badge in the corner, with the address it is answering on. staging.di-studio.xyz wears an amber one. The live site wears nothing — so if there is no border, you are on di-studio.xyz and anyone can see what you do next. It is there because two di.iiii that look identical are two di.iiii you will eventually confuse.',
            'Your work lives in a folder called .di in your home directory, deliberately kept apart from the app itself — so updating, rolling back, or removing di.iiii cannot touch it. di uninstall says as much, and leaves your spaces where they are.',
            { list: [
                'di new NAME — start a new space',
                'di save SPACE — save one space as a single file you can carry anywhere',
                'di open FILE — open a file someone saved, here',
                'di spaces — what is in this di.iiii',
                'di backup — writes your whole di.iiii to one file you can carry to another machine',
                'di restore — reads one back in',
                'di update — installs the newest version, and never touches your work; di update --rollback returns to the one before',
                'di update --from FILE — updates from a file on this machine, for a venue with no network',
                'di restore --snapshot — the copies di.iiii takes of your work by itself, before an update that changes how it is stored',
                'di status — what is running, on which address, and how much space your work takes',
                'di doctor — what this machine can and cannot do, and what to install if something is missing',
                'di mcp — hands this di.iiii to Claude, or any other agent that speaks MCP'
            ] },
            'Before an update changes anything, the new version opens a COPY of your work and checks it can read it — if it cannot, the update stops and you are still on the version you were. And when an update changes how the work is stored, di.iiii keeps a copy of it first, so going back is always possible: di restore --snapshot lists them. Going back to a version too old to read your work is refused rather than done, because that would not fail, it would quietly misread it.',
            'It does not need admin rights, and it does not ask for a password. It runs as a single ordinary program, and if there is no suitable Node it quietly fetches its own rather than sending you away. Docker is there too, but only if you ask for it (di install --docker) — a container cannot reach things on your machine, so the surfaces that talk to your own tools (the agent board, a Claude installed on this computer) work in the ordinary mode and not in the container one.',
            'A local space can now be linked to one on di-studio.xyz: di link connects the two, and di sync compares them and moves work in whichever direction is safe — it refuses rather than guess when both sides have changed. di backup and the space bundles on the Spaces page are still there when you would rather carry a file.'
        ],
        tags: ['install', 'local', 'offline', 'cli', 'di', 'self-host', 'venue', 'backup'],
        updated: '2026-08-21'
    },
    {
        id: 'keeper-node',
        category: 'Editing',
        title: 'The Keeper: a language model as a node',
        summary: 'Point a Keeper node at a model — one on this machine, or a box on the same network — and its answer becomes a value the rest of the graph can use.',
        body: [
            'Add a Keeper from the palette (category Agent) and it opens as a window with a prompt box. Set an Endpoint and a Model in the window itself, ask it something, and the reply appears in the panel.',
            'The Keeper is pointed at an endpoint rather than signed in to an account. You give it a URL and a model name; nothing runs as you, and no key is stored. That means it works with a model on your own machine, and it works with no internet at all — which is the situation it was built for.',
            { list: [
                'Endpoint — a chat URL. A bare host such as http://localhost:11434 is completed for you; anything with a path is used as given.',
                'Model — the model name that server knows, for example qwen3.',
                'System — an optional instruction that shapes every answer.'
            ] },
            'It speaks to Ollama and to any OpenAI-compatible server, because both accept the same request. If a reasoning model wraps its working in <think> tags, that part is dropped and only the answer is shown. If the reply was cut off mid-sentence the panel says so rather than presenting a fragment as complete.',
            'Two ports carry the result into the graph: Reply (the text) and Busy (true while it is thinking). Wire something into the Prompt port and the graph asks the question instead of you — the box then shows what it was asked and becomes read-only.',
            'If the keeper cannot be reached the node says so. A browser will also refuse a call to a local model that has not been told to allow this page, so a model box may need its allowed origins set before it will answer.'
        ],
        tags: ['raw', 'nodes', 'keeper', 'agent', 'llm', 'local', 'offline', 'ollama'],
        updated: '2026-08-19'
    },
    {
        id: 'midi-in-node',
        category: 'Editing',
        title: 'MIDI In: a controller as a node',
        summary: 'Plug in a MIDI controller and its keys and knobs become numbers the graph can use.',
        body: [
            'Add a MIDI In node from the palette. It asks the browser for MIDI access, lists what is plugged in, and shows each message as it arrives so you can see the node is really hearing your controller.',
            'Pick a Device, or leave it on "First available". Pick a Channel, or leave it on "All channels" — a controller set to a channel the node is not listening on looks exactly like a broken cable, so listening to everything is the default.',
            'Four ports carry what it hears: Note and Velocity from keys and pads, CC and Value from knobs and faders. A key you release reports velocity 0 rather than going blank, because that is what a released key means.',
            'The fifth port, Trigger, counts up by one on every message. Watch it change rather than trying to catch a pulse — that is how a node downstream knows something happened, even between frames.',
            'This needs Chrome or Edge; Safari and Firefox have no Web MIDI and the node says so instead of sitting blank. A controller plugged in after you opened the page appears on its own, without a reload.'
        ],
        tags: ['raw', 'nodes', 'midi', 'device', 'controller', 'performance'],
        updated: '2026-08-08'
    },
    {
        id: 'midi-out-node',
        category: 'Editing',
        title: 'MIDI Out: the graph plays your gear',
        summary: 'Wire numbers out to a synth, a sampler, or a lighting desk that speaks MIDI.',
        body: [
            'Add a MIDI Out node from the palette. It asks the browser for MIDI access and sends to every connected device; its Status port says what it is doing, so a Text panel wired to Status is an honest meter.',
            'Notes: while Trigger is on, the note is held. The moment Trigger rises the node strikes Note at Velocity; the moment it falls it releases exactly the note it struck, even if Note has moved since. A Button, a Compare, a Toggle — anything true-or-false — makes a good Trigger.',
            'A Trigger that stays on but keeps changing — MIDI In\'s rising count, a Counter — re-strikes on every change. That is the same idiom the rest of the canvas uses: something happened because the number changed.',
            'Knobs: whenever Value changes it leaves as a control change on the CC number. Wire an Oscillator through Range into Value and a filter sweeps itself. Nothing is sent while Value merely stays what it was.',
            'Channel picks the MIDI channel (1-16). This needs Chrome or Edge; Safari and Firefox have no Web MIDI and Status says so instead of sitting blank. Devices plugged in later appear without a reload.'
        ],
        tags: ['raw', 'nodes', 'midi', 'device', 'synth', 'lighting', 'performance'],
        updated: '2026-08-21'
    },
    {
        id: 'dmx-out-node',
        category: 'Editing',
        title: 'DMX Out: the graph lights the room',
        summary: 'Wire numbers out to real lamps — either through di.iiii\'s own lighting desk, or through a vizzz box on your network.',
        body: [
            'Add a DMX Out node from the palette and choose which rig it speaks to. There are two, and the node says which one it is on.',
            { list: [
                'The lighting desk — di.iiii\'s own desk at /light, and what a new node picks. The rig, the scenes and the effects are already there; the graph is simply another pair of hands on it.',
                'A vizzz node on the network — the small box wired straight into your DMX rig, given by address. This is what the node always did, and a graph you made before the desk existed keeps doing it: a node that names a host stays on its box.'
            ] },
            'On the desk, the panel says what the desk actually holds — how many fixtures are patched, how many scenes are saved, which look is up, whether an effect is running, and whether output is on. That sentence is also the Status port, so a Text panel wired to Status is an honest meter. “Open the desk” opens the desk itself in a new tab.',
            'Master dims the whole rig: whenever it changes, the new level goes out. Value at Channel sets one DMX channel the same way — wire an Oscillator through Range into Value and a lamp breathes on its own. Wires carry 0 to 1, as everywhere on the canvas; the node turns them into DMX bytes.',
            'Scene is the desk\'s own port, and the strongest one: send a scene\'s name — the words you wrote on the desk — or its id, and the whole look is recalled with its fade. One string on a wire does what a hundred Channel and Value pairs could not. A name the node has not seen yet makes it re-read the desk\'s library and try again, so a scene saved a minute ago still fires.',
            'Blackout kills the lights the moment it rises, ahead of anything else queued. A Button, a Compare, a Toggle — anything true-or-false — makes a good Blackout. The two rigs differ in one way worth knowing: on a vizzz node, blackout is a single blow and the rig recovers as soon as new levels arrive. On the desk it is a STATE — it stays down until it is lifted — so the node sends the falling edge too, and the lights come back when Blackout goes false.',
            'Nothing is sent for a value that merely stays what it was, and fast wires are paced so neither a small box nor the desk is asked sixty times a second.',
            'Both rigs need a di.iiii running on your own machine, for different reasons. The desk only exists on a local di.iiii (`di up`, or npm run dev) — a hosted di-studio.xyz has no desk in it, and the panel says so rather than going quiet. A vizzz box speaks http, and a https page is not allowed to reach it — the panel says that too. On a hosted tab the node is honest and idle; on your own machine it lights the room.'
        ],
        tags: ['raw', 'nodes', 'dmx', 'artnet', 'light', 'lighting desk', 'scene', 'device', 'performance'],
        updated: '2026-09-03'
    },
    {
        id: 'build-zones',
        category: 'Editing',
        title: 'A room that arranges itself',
        summary: 'Turn build zones on and the room stops being free space: everything hung lands on the wall, in line, whoever adds it and however.',
        body: [
            'A room open to everybody fills up with everybody\'s aim. The Open Jam room came out of one night with thirty phones in it: photos at the origin, photos behind the wall, cones and empty text boxes left where someone found the editor. Nothing was wrong with any single edit. The room was simply free space, and free space is what a crowd makes a mess of.',
            'Build zones make the wall a set of numbered slots. A photo that arrives is put in the next free one, scaled to the row height and squared to the hanging line — whether it came from a phone standing in the room, from the editor, or from a script. Drag one into the void and it goes to the nearest free slot instead: you still choose where on the wall it hangs, you just cannot choose nowhere.',
            'The slots are a shape, not a stock. When the wall fills, the next photo starts a new bay and the room grows outward, so a jam never runs out of places to hang. Delete a photo and its slot is free again the moment it goes.',
            'The rule lives on the server, which is what makes it a rule. Every edit passes through it, so nobody sees a differently arranged room and no client can talk its way around it.',
            'Two things stay under your hand. Anything you pin keeps its place and takes no slot — that is how a QR code sits on its lectern instead of being hung as an exhibit. And the whole thing is a switch: turn build zones off and every picture stays exactly where it is, in a room that is free space again.'
        ],
        tags: ['room', 'space', 'jam', 'placement', 'build zones', 'photos', 'arrange'],
        updated: '2026-09-03'
    },
    {
        id: 'raw-zen-workspace',
        category: 'Editing',
        title: 'A canvas with nothing on it',
        summary: 'A new canvas opens bare. One gesture summons everything else — panels, the help, even the toolbar itself.',
        body: [
            'A new canvas has no toolbar, no zoom buttons, no help or chat button. There is the canvas, whatever nodes you place, and nothing else sitting there waiting to be needed.',
            'A first visit opens on a clean, empty canvas — one sentence, one offer. “Build an example” builds a worked example (a scene, a light, a cube with a colour wired in) the moment you ask for it, and only then: choosing the demo is your act, not the product’s.',
            'Everything is one gesture away. Press ⌘K (Ctrl+K) or just / — on a touch screen, double-tap the empty canvas. The same panel opens either way: type what you want and press Enter.',
            'That panel creates nodes and summons everything else from the same list. "Help", "Chat", "Outliner", any window you closed, and "Show the toolbar" to bring it back. Summoning rows sit at the top, so with the toolbar hidden they are never more than a keystroke away.',
            'Zoom still works as it always did: the wheel on a computer, and on a phone the zoom buttons stay in the corner — faded until you reach for them, because on a touch screen they are the only way to zoom.',
            'The bare start lasts exactly as long as the canvas is bare: the moment your first node lands, the toolbar appears on its own — the Scene button and the node count belong on screen once there is a scene to look at. A toolbar you explicitly turned off stays off; only the automatic bare start lifts itself.',
            'Each canvas remembers its own choice, on this device. A canvas you already arranged keeps its toolbar; only new ones start bare. Turning the toolbar on or off on one canvas never changes another, and never changes what anyone else sees.',
            'The faint di.iiii wordmark at the bottom is the way home — it links to the landing page. With the toolbar up, the ⋯ menu also offers Spaces and the Wiki, so the canvas is never a room without doors.'
        ],
        tags: ['raw', 'canvas', 'workspace', 'zen', 'minimal', 'palette', 'shortcuts', 'ui', 'starter'],
        updated: '2026-08-21'
    },
    {
        id: 'reading-the-workspace',
        category: 'Editing',
        title: 'Reading the canvas: what each colour means',
        summary: 'Grey is furniture, colour is your work, and cyan means you touched it. Once you know the three, you can read a canvas without reading a word.',
        body: [
            'Everything on the canvas is one of two things. Your work — the nodes, their wires, the scene — carries colour. The furniture around it — windows, the palette, the toolbar, the zoom buttons — is grey and stays out of the way. Before 18 August 2026 they all wore the same cyan outline, so a floating window looked exactly like a node card and nothing showed which was in front.',
            { list: [
                'Grey edge — furniture. A window, the palette, the toolbar, a button waiting to be used. It floats above your work and it is not part of it.',
                'Coloured edge — a node, in its family\'s colour: yellow for values, purple for the scene, pink for the panels that watch, blue for what you bring in, and so on. The card\'s little square icon carries the same colour, so the family is readable at a glance instead of spelled out in small type.',
                'Cyan — you. Selected, hovered, or focused. Because nothing else is cyan any more, the thing you are working on is the brightest thing on screen.',
                'Port colours — the kind of value a wire carries: a colour, a number, a texture. Unchanged, and the wires match their ports.'
            ] },
            'A window shows a stripe along its top edge in the colour of the node it belongs to, and names that family above its title — "the scene", not the code\'s internal name. So when you open a Scene node\'s window, the purple stripe ties it back to the purple card sitting on the canvas behind it: one node, two views of it.',
            'Windows also tell you their state now: a pinned window says so in its header, and the buttons in a window header are quiet until you reach for them, with Close turning red so it never gets pressed by accident.'
        ],
        tags: ['raw', 'ui', 'colour', 'families', 'windows', 'nodes', 'reading', 'design', 'canvas'],
        updated: '2026-08-19'
    }
]

// Headline subset surfaced on the landing page. Keep ids here; `docs:wiki:check`
// fails CI if any id does not resolve to an article (otherwise it silently vanishes).
export const WIKI_HIGHLIGHT_IDS = ['glossary', 'build-zones', 'raw-windows-travel-with-the-canvas', 'br-id-ge', 'di-cli-local', 'joining-a-space', 'guest-and-sandbox-modes', 'free-spaces', 'publishing', 'invite-links', 'admin-manage', 'github-sync']

export const WIKI_HIGHLIGHTS = WIKI_HIGHLIGHT_IDS
    .map((id) => WIKI_ARTICLES.find((article) => article.id === id))
    .filter(Boolean)
