# Raw node editor: design and accessibility audit

    date        2026-09-14
    surface     https://local.thedi.studio/test-desk/raw/projects/design-audit
    code        /home/dob/work/di.iiii-asuz @ 10c5ed79 (read only)
    browser     Playwright Chromium headless, swiftshader, DPR 2
    viewports   1440x900 desktop, 1024x768 laptop, 390x844 phone (touch)
    shots       scratchpad/design-audit/*.png (31, every one opened)
    project     design-audit, 18 nodes / 7 wires, made through the API,
                TRASHED at the end (restorable). The owner's `test`
                project was not opened or touched.

Findings are ranked by how much they get in the way of a person who
wants to "change and see everything". Each has the screenshot, the
code, and the smallest fix I can see. Contrast figures were measured
with getComputedStyle and the WCAG formula (AA body text is 4.5:1).

A caveat on the test document: nodes made through the API have no
window frame, so their windows pile up. Placing a node from the palette
seeds a frame (RawEditor.jsx:1066, 1105). The pile still happens to
imports, examples and anything an agent builds, so I kept it as a
finding but ranked it by that reach.


## A. Broken or misleading (fix first)

### A1. On a phone, inside a node, the top bar pushes ⋯ off screen
    shots   08-inside-cube-phone.png, 09-inside-camera-phone.png
    code    src/raw/styles/raw.css:4350-4360
The crumb chip makes the bar wider than 390px. The bar turns into a
side-scroller with its scrollbar hidden, so Chat and ⋯ sit off screen
with nothing to show they are there. On the root canvas the bar only
just fits: the project name is dropped and the count reads "15".
Fix: at 640px and below, keep ⋯ pinned right (`flex-shrink:0`), put
Scene, Chat and the node count inside ⋯, and drop the crumb chip
(the "inside X" marker already says where you are).

### A2. Monitor says "Nothing wired in" while a wire is plugged into it
    shots   13-window-Monitor-desktop.png (the Picture Out -> Source
            wire is visible on the card below)
    code    src/raw/components/MonitorPanelWindow.jsx:11-21,
            src/raw/components/LiveTextureView.jsx:8
`isLiveTexture` only accepts objects that have `.image`. A picture-
operator texture fails that test, so Monitor falls through to the
empty sentence. The window says the opposite of what the canvas shows.
Fix: first check whether the Source port has an edge. If it does and
the value can't be drawn, say "Wired from Picture Out, can't show this
kind of picture yet". Better: draw top.* textures the way the card
preview already does (cardPreview / TopThumbnail).

### A3. A wired field shows its old stored value, not what the wire brings
    shots   03-cube-selected-inspector-desktop.png (Roughness WIRED
            shows 1; the Number wired into it holds 0.4)
    code    src/raw/components/PropertyInspector.jsx:33-36, 227-243
The disabled box shows `node.values[port]`. That number no longer
does anything, so the inspector lies about the wired value.
Fix: fill the disabled box with the evaluated input (the graph
context already has it) and swap the "WIRED" tag for "from Number".

### A4. Selection is saved into the shared document
    shots   01-first-desktop.png (a fresh browser opens with Oscillator
            selected), 01-first-phone.png, 02-canvas-clean-phone.png
            (a fresh phone opens with the inspector sheet over 40% of
            the screen and Delete armed)
    code    src/raw/components/RawEditor.jsx:589-600 (selectNode sends
            a setWorkspaceState op); verified through the API:
            document.workspaceState.selectedNodeId = "n-out" after the
            keyboard walk
Whatever one person last clicked is what every other device and
viewer opens with.
Fix: keep selection per viewer (React state or localStorage). Don't
send it as a document op.

### A5. Panel windows open by themselves, stack on the cards and cover each other's Close buttons
    shots   01-first-desktop.png, 01-first-laptop.png, 01-first-phone.png,
            13-window-Desk-desktop.png (the Text window's controls are
            under the Desk window)
    code    src/raw/components/RawEditor.jsx:131-158 (`visible:
            frame.visible !== false`, cascade of 16 slots at 72/56px)
Measured: Playwright's click on Text's Close was blocked by the DMX Out
header on top of it. On the phone, three windows fill the whole screen.
Fix: a panel node with no frame starts closed. Open it from the card
(a small "show" control) or by double-click, next to its card. On a
phone, allow at most one open window.

### A6. The phone canvas can't be read or aimed at
    shots   02-canvas-clean-phone.png, 04-palette-phone.png
    code    src/raw/styles/raw.css:3081-3093 (door plates are 44px
            SCREEN size at every zoom), zoom controls raw.css:2828+
Fit lands at 34%, so card text is about 4px on screen. The 44px door
plates stay full size and cover the card titles. The zoom bar and the
Delete button sit on top of cards, and the graph is squeezed into a
band behind the sheet while the top 60% of the screen is empty.
Fix: below about 60% zoom on a coarse pointer, hide the door plates.
Tap the card to select it, and put "Enter" in the sheet. Fit the graph
to the space above the sheet. On a phone, consider the outliner list
as the first view.


## B. Clarity: what is this, what does it do, where am I

### B1. The family word on every card header is noise
    shots   02-canvas-clean-desktop.png ("numbers", "make", "watch",
            "the scene", "send out", "pictures" on all 15 cards)
    code    src/raw/components/RawGraphSurface.jsx:1420-1429,
            raw.css:2993
It repeats what the colour already says. It's 10px mono, and it names
things oddly: Text is "make", Desk is "watch", Studio is "the scene".
It also takes about 70px of header width away from the node's name.
Fix: remove it from the card. Show the family once, in the inspector
header and the palette group.

### B2. The card icon looks like an unticked checkbox
    shots   any card in 02-canvas-clean-desktop.png
    code    RawGraphSurface.jsx:1416, raw.css:2937-2943 (14px square,
            3px border, transparent)
Fix: use a filled 8px family swatch, or let the square carry the
node's value (see B3).

### B3. Value nodes don't show their value
    shots   02-canvas-clean-desktop.png: Colour shows no colour,
            Number shows no number, Oscillator shows no motion
Only geometry and picture nodes draw a preview. For a TouchDesigner
user, seeing the value on the node is the whole point.
Fix: next to the output port, draw a swatch for colour, "0.40" for
numbers, and a small moving trace for LFO. Use the same slot as
cardPreview.

### B4. Cards list every input, even the unwired defaults
    shots   02-canvas-clean-desktop.png (Cube card is 319px tall with
            8 inputs, 1 wired; MIDI Out 6 inputs, 1 wired)
Fix: show wired ports plus a "+6" row. Show all ports on hover or
select. Card height drops by more than half, and the wired ports stand
out.

### B5. Code ids are shown to people as if they were words
    shots   03-cube-selected-inspector-desktop.png ("geom.cube"),
            04-palette-desktop.png (every row: "geom.cube",
            "view.text"), 09-inside-camera-desktop.png
            ("inside · top.camera")
    code    RawEditor.jsx:922 (inspectorSubtitle = typeId),
            NodePalette.jsx:75 (hint: definition.id),
            topInside/TopInsidePanel.jsx:44
Contrast is 3.32-3.77:1 at 10px. There is also nowhere a node says
what it does: NODE_TYPES has no description field (one hit, and that
one is a port).
Fix: add a one-line `summary` per type ("A box you can colour, size
and move") and show it in the palette and the inspector subtitle.
Keep the id in a title attribute for developers.

### B6. Inside a node, "where am I" is said three times, and once wrongly
    shots   08-inside-cube-desktop.png, 10-inside-geo-desktop.png
    code    top-bar crumb chip; scope marker RawEditor.jsx:2505-2530;
            centre hint RawEditor.jsx:1010-1027
The top-bar chip says "Cube", the pill says "inside Cube", and the
centre sentence says "Inside Cube...". Meanwhile the top-bar centre
still says "Scene · 2" inside Geo.
Fix: keep one: the breadcrumb, with a back arrow in front. Delete the
floating pill. Show the centre hint only on an empty scope.

### B7. Inside a Cube there is nothing of the Cube
    shots   08-inside-cube-desktop.png (empty grid plus "What it's made of")
Camera In gets a proper inside: picture, machine, settings
(09-inside-camera-desktop.png). A Cube gets an empty room that invites
you to place things.
Fix: give every node made of code the TopInsidePanel pattern: large
preview on top, its fields below, and "what it's made of" as a link.

### B8. The inspector is one flat "Ports" list: inputs only, no outputs, no live values
    shots   12-osc-selected-desktop.png (Frequency, Phase; the four
            outputs and their values are absent), 11-level-selected-
            desktop.png (mixed half and full widths, "In WIRED -" line)
    code    src/project/graph/nodeInspectorSections.js:172
Fix: three groups. "Settings" (editable), "From wires" (read-only,
showing the value and its source; see A3) and "Out" (live values).
"Ports" is a developer word.

### B9. Panel window chrome is heavier than the content, and "Enter ›" is offered where there is no inside
    shots   13-window-DMXOut-desktop.png (header wraps to 94px of a
            267px window), 13-window-Text-desktop.png,
            13-window-Timeline-desktop.png ("Timeline" said twice)
    code    src/raw/components/DesktopWindow.jsx:300-316,
            raw.css:1490, 1587
Each title bar has a family word, the title, "Enter ›" and four 42x42
glyph buttons. "Enter ›" ("Go inside this node to put things in it")
shows on Text, Monitor, Timeline and DMX Out, which are all code nodes.
Fix: a 32px single-row header with the title and ×. Put pin, maximise
and minimise in a header context menu or on double-click. Show Enter
only for CONTAINER_TYPE_IDS.

### B10. Inside Camera In, the canvas chrome draws on top of the panel
    shots   09-inside-camera-desktop.png (di.iiii wordmark over the
            Exposure select, ghost "What it's made of" over Focus),
            09-inside-camera-phone.png (ghost button at Resize, zoom
            bar at Frame rate; the "inside Camera In" pill overlaps the
            panel's own title)
    code    RawGraphSurface.jsx:1244 (empty-scope button),
            TopInsidePanel stacking
Fix: give the panel an opaque background and a z-index above the
surface chrome, or skip the empty-state, zoom bar and wordmark while a
TopInsidePanel is mounted.


## C. Consistency, chrome, accessibility

### C1. Contrast failures (measured, desktop)
    element                      ratio   size   rule
    topbar "15 nodes" / "Chat"   3.13    10px   raw.css:1311-1323
    inspector subtitle (typeId)  3.77    10px   RawEditor.jsx:922
    inspector "Ports" heading    3.26    10px
    inspector field labels       4.50    10px   (exactly the floor)
    palette type id              3.32    10px   NodePalette.jsx:75
    palette placeholder          ~2.3    14px   raw.css:218 (alpha .28)
    window "Enter ›"             4.09    12px
    di.iiii wordmark             2.27    14px   raw.css:4941
    port labels                  5.28    10px   raw.css:3236 (passes,
                                                but 10px)
Fix: raise muted text to at least alpha 0.6 on black (--di-text-muted)
and the placeholder to 0.5.

### C2. Type is too small for operating text
    code    src/styles/base.css:145-147 (--di-text-1 8px, -2 10px,
            -3 12.16px)
"WIRED" is 8px (raw.css:1985). Port labels, family words and inspector
labels are 10px, and on the phone the measured text includes 8px and
10px chrome. Cards at 94% zoom bring port labels to about 9px.
Fix: 12px floor for anything a person reads while working. Retire
--di-text-1.

### C3. The top bar uses three button styles in one row
    shots   01-first-desktop.png
    code    RawEditor.jsx:2143-2170, raw.css:1311, 1369
"Help" is boxed at 52x41. "15 nodes" and "Chat" are bare 10px mono at
57x13 and 32x13. "⋯" is 41x31 and has NO accessible name (the only
unnamed button found). "Scene · 2" reads like a title but is a button.
On the phone every one of these is under 44px (measured: back 34x29,
Chat 32x13, ⋯ 41x31).
Fix: one ghost-button style, 44px tall on coarse pointers.
aria-label="More" on ⋯. Name the room button so it reads as an action.

### C4. The overflow menu doesn't close on Escape and mixes unrelated things
    shots   05-overflow-menu-desktop.png, 05b-overflow-after-escape-
            desktop.png (still open after Escape; it also stayed open
            under Help and through zooming)
    code    RawEditor.jsx:2170-2245
It holds navigation (Home, Spaces, Wiki), a UI size select, two
example builders ("Build an example" next to "All Nodes Example"), and
an identity "GUEST-39DF" on a local install with auth disabled. "Open
in Studio" goes against the settled Studio -> Editor naming.
Fix: close on Escape and outside click. Group as Go to / View /
Examples. Sentence case. Rename to Editor.

### C5. Keyboard: tab order follows the DOM, cards have no name, and doors are nested
    shots   14-keyboard-focus-topbar-desktop.png, 14b-keyboard-focus-
            cards-desktop.png
    code    RawGraphSurface.jsx:1336-1337 (card role=button, no
            aria-label), 1383 (door button inside it)
Measured order: cards from mid-graph, then the wordmark, inspector,
BODY, top bar, Delete, the canvas, the zoom buttons, and only then the
first cards. Each card takes two Tab stops (card, then door). The
accessible name of a card is its text run together, e.g.
"›ColournumbersColour". A button inside role=button is nested
interactive content. A visible 2px focus ring is present, which is good.
Fix: aria-label = "Colour, 1 output, wired to Cube". Door gets
tabIndex=-1, and Enter/Space on the focused card opens it. Make the
graph one Tab stop with arrow keys between cards (roving tabindex).
Order: top bar, canvas, inspector.

### C6. The palette opens on a command and runs off the bottom edge
    shots   04-palette-desktop.png (first row "Hide the toolbar",
            list clipped at the viewport bottom), 04-palette-phone.png
    code    NodePalette.jsx:75-80
Fix: commands after nodes, and only when the query matches. Clamp the
palette's position to the viewport.

### C7. Help is mostly decoration, and one line is wrong on a full canvas
    shots   06-help-desktop.png
    code    src/raw/utils/rawGuide.js:59 ("The canvas starts empty.")
There are two rows of tabs (Navigation Basics / All Controls, then
Start / Wires / Places / The scene). A large illustration of empty
ghost boxes takes about half the dialog.
Fix: one column of three short steps, worded for the current state:
nothing selected, a node selected, or inside a node.

### C8. The zoom bar covers cards and changes width
    shots   03-cube-selected-laptop.png (covers the Camera In card and
            its port), 11-level-selected-desktop.png (grows a ◎ button
            when something is selected)
    code    RawGraphSurface.jsx:1209 ("-" is a hyphen next to "+")
Fix: U+2212 minus, fixed width, collapse to one "%" button that opens
the steps. Keep it out of the graph's fit area.

### C9. Zoomed out, the wires stay but what they connect disappears
    shots   07-zoomed-out-desktop.png (54%: port labels hidden, titles
            about 6px)
Fix: at mid zoom keep the labels of wired ports, and nothing else.

### C10. Delete floats alone, far from the inspector it acts on
    shots   03-cube-selected-inspector-desktop.png, 02-canvas-clean-phone.png
            (overlaps the Geo door)
    code    raw.css:1438 (.raw-delete-fab)
Fix: put a Delete action in the inspector header.

### C11. The inspector covers work on desktop
    shots   03-cube-selected-inspector-desktop.png (covers Geo),
            03-cube-selected-laptop.png (covers Studio, Geo)
Fix: dock it as a column that the graph fits beside, or pan the graph
out from under it on select.

### Passes worth keeping
- prefers-reduced-motion is honoured on cards (transition 1e-06s).
- Focus rings are visible (2px solid) on cards, doors and top bar.
- Window headers can be moved with the keyboard and have aria-labels.
- Desk window's "+ Camera In" / "+ Picture Out" is the clearest
  "change it right here" pattern in the editor
  (13-window-Desk-desktop.png). Copy it.
- Camera In's inside view (09) is the model for B7.


## Top 20, ranked

     1  A1  phone top bar hides ⋯ inside a node      raw.css:4350
     2  A2  Monitor "Nothing wired in" while wired   MonitorPanelWindow.jsx:11
     3  A3  wired field shows stale stored value     PropertyInspector.jsx:227
     4  A4  selection saved into shared document     RawEditor.jsx:589
     5  A5  windows auto-open and pile on cards      RawEditor.jsx:131-158
     6  A6  phone canvas unreadable, doors cover     raw.css:3081
     7  B3  value nodes don't show their value       RawGraphSurface.jsx (card body)
     8  B5  code ids shown, no one-line purpose      RawEditor.jsx:922, NodePalette.jsx:75
     9  B8  inspector: flat inputs, no outputs       nodeInspectorSections.js:172
    10  B1  family word on every card header         RawGraphSurface.jsx:1420
    11  B4  every unwired port listed on cards       RawGraphSurface.jsx (port rows)
    12  B7  inside a Cube is an empty room           RawEditor.jsx:1010, TopInsidePanel pattern
    13  B9  window chrome: 7 things, false Enter ›   DesktopWindow.jsx:300
    14  C1  contrast 2.3-4.1:1 on muted text         raw.css:1311, 218, 4941
    15  C2  8/10px type for operating text           base.css:145-147
    16  C5  card name, tab order, nested door        RawGraphSurface.jsx:1336, 1383
    17  B6  "where am I" said three times            RawEditor.jsx:2505
    18  B10 chrome bleeds over Camera In panel       RawGraphSurface.jsx:1244
    19  C3  top bar: 3 styles, unnamed ⋯, <44px      RawEditor.jsx:2143-2170
    20  C4  ⋯ menu ignores Escape, mixed, "Studio"   RawEditor.jsx:2170-2245
