# Node reference

Every node type the palette can place, one entry per family, generated from
`src/project/nodeRegistry.js` and `src/project/graph/examples/nodes/` by
`scripts/generate-node-reference.mjs` (`npm run docs:nodes`; `npm run docs:nodes:check`
fails CI if this drifts from the source). Written for an AI (or a person) building a
graph: each node's real ports, and a small working example graph as JSON to copy.

For the full audit this was built from — what is real vs. partial, and every cross-cutting
defect — see `docs/ai/audits/2026-09-14-raw-nodes.md`.

## Families

### make

See [make.md](make.md) for full ports and each example graph.

- **Cube** (`geom.cube`) — The plain box — Colour and Size come from wires here, not the [0,1,0] "invisible cube" bug the all-nodes example used to ship (docs/ai/known-fixes.md).
- **Sphere** (`geom.sphere`) — A ball whose Radius and Colour are both wired — grow it by changing the Number, not the card.
- **Plane** (`geom.plane`) — A flat panel — Width, Height and Colour come from wires. A Webcam wired into Texture would show live video once its window is opened (not running in this static graph).
- **Merge** (`shape.merge`) — Joins two shapes into one — bare it carries nothing on purpose; fed a Sphere and a Cube it merges them into one geometry value.
- **Array** (`geom.array`) — Repeats a shape N times along an offset — a Cube fed in becomes a row of cubes; bare it carries nothing.
- **Cylinder** (`geom.cylinder`) — A column — Radius and Height come from wires, standing in for a pillar or a drum.
- **Cone** (`geom.cone`) — A spike — Radius comes from a wire, so widening the Number widens the cone's base.
- **Torus** (`geom.torus`) — A ring — its Tube thickness is wired, so a thin Number makes a delicate hoop and a wide one a fat donut.
- **Line** (`geom.line`) — A stroke between two points — its far end is wired to a Vector, so moving the vector re-draws the line.
- **Circle** (`geom.circle`) — A flat disc — its Radius is wired, growing and shrinking the mark on the floor.
- **Transform** (`geom.transform`) — Re-frames one copy of a shape — a Torus fed in, moved and scaled by wires; bare it carries nothing.
- **Constructor** (`geom.constructor`) — A node made of nodes — enter it, build a shape from parts, and the Constructor stands in the room being that shape. Two spheres merged through its Out door make a snowman.
- **Text** (`view.text`) — A text panel — its Content is wired to a String, so what the panel reads is authored one card away.
- **List** (`view.list`) — A checklist panel with groups and rows — the only node whose card shows a summary ("N rows · M groups") without opening the window.
- **Image** (`view.image`) — An image panel — its Source is a texture port. A Webcam wired in would show a live frame once its window is open; nothing is running here.
- **Browser** (`view.browser`) — An iframe panel pointed at a URL — same-origin here (/wiki) so it still opens with no network, unlike a page on someone else's domain that may refuse to be framed.

### numbers

See [numbers.md](numbers.md) for full ports and each example graph.

- **Number** (`value.number`) — A plain number, wired into a Sphere so changing it changes the ball's size.
- **Colour** (`value.color`) — A colour swatch, wired straight into a Cube so the cube wears it.
- **Vector** (`value.vec3`) — An authored [x,y,z], wired into a Cube's Position so the cube stands where the vector points.
- **Boolean** (`value.boolean`) — An on/off switch, wired into the Grid's Visible so the floor grid can be hidden.
- **String** (`value.string`) — A line of text, wired into a Text panel so it reads what the String says.
- **Time** (`time`) — The document clock. Its Sin swings -1..1 once a second (bpm 60); remapped through Range, it drives a lamp's brightness up and down.
- **Math** (`math.op`) — One card, an operation menu — set to Multiply here, it scales two numbers into a Sphere's radius. Add, Subtract, Divide, Modulo, Power, Sin and Absolute live on the same card.
- **Mix** (`math.mix`) — Crossfades two colours by Factor — wired ports lerp correctly; typed straight into the inspector as text, the same port hard-switches at 0.5 instead (a documented defect, not shown here).
- **Clamp** (`math.clamp`) — Keeps a number inside Min..Max — a Number well above 1 is clamped to 1 before it reaches a Sphere's radius.
- **Compare** (`logic.compare`) — Watches two numbers and answers Less/Equal/Greater as three lamps — here Greater drives whether the floor grid shows.
- **Route** (`logic.route`) — One card, an operation menu — set to Switch here, Pick chooses between two colours for a Cube. Set to Gate, the same card passes a value through only while Open.
- **Lag** (`signal.lag`) — Chases a target instead of jumping to it — a Number that steps from 0 to 1 arrives at the Sphere's radius gradually, over the Lag time.
- **Noise** (`value.noise`) — A smooth wander -1..1 over the document clock — every window sees the same drift, driving a lamp's intensity here.
- **Range** (`math.range`) — Remaps a number from one span into another — a Number measured 0..100 answers 0..1 at a Sphere's radius.
- **Oscillator** (`signal.lfo`) — Four waveforms of one phase, all -1..1 — the Triangle output here drives a lamp's intensity up and down every second.
- **Logic** (`logic.combine`) — Two booleans, four verdicts in plain words — Either drives whether the floor grid shows here.
- **Extremes** (`math.extremes`) — Answers the Least and Greatest of two numbers at once — Greatest sets a Sphere's radius here.
- **Round** (`math.round`) — Nearest, Floor and Ceiling of one number at once — Round quantises a Number into whole steps at a light's intensity.
- **Ease** (`signal.ease`) — Shapes a 0..1 progress with intent — Smooth softens a Number into a Sphere's radius; Ease In, Ease Out and Bounce answer on the same card.
- **Counter** (`signal.counter`) — Counts rising edges of Count — a Button's presses tally here, feeding a Sphere's radius one step at a time.
- **Hold** (`signal.hold`) — Sample-and-hold: freezes Value on each rising edge of Sample — here it captures a Number the instant a Boolean flips.
- **Delay** (`signal.delay`) — Answers what Value was Delay seconds ago — a young Delay is late, never silent, so a Sphere still gets a radius from the first instant.
- **Timer** (`signal.timer`) — A cued stopwatch — a rising edge on Start begins it, Progress climbs 0..1 over Length, driving a lamp's intensity.
- **Trigger** (`signal.trigger`) — Shapes a firing into an attack-hold-release envelope, 0 to 1 and back — a Button re-fires it, driving a lamp's intensity.
- **Speed** (`signal.speed`) — Integrates a Rate over the clock into a running total — turns "how fast" into "how far", driving a Cube along one axis (via Combine, in the Vector Combine example).
- **Toggle** (`logic.toggle`) — A latch: each rising edge on Flip inverts it — a light switch, not a held button — wired here into the floor grid's visibility.
- **Split** (`vector.split`) — Opens a vector into its three numbers — just the height (Y) drives a lamp's intensity here.
- **Combine** (`vector.combine`) — Packs three numbers into one vector — wired into a Cube's Position so it stands where X, Y and Z say.
- **Channels** (`colour.split`) — Opens a colour into Red/Green/Blue and Hue/Saturation/Lightness at once — Red drives a lamp's intensity here.
- **Compose** (`colour.combine`) — Builds a colour from Red, Green and Blue (0..1 each) — wired into a Cube so it wears exactly that colour.
- **Distance** (`vector.distance`) — How far apart two points stand, and how long the first one is — Distance drives a lamp's intensity here.
- **Dot** (`vector.dot`) — How much two directions agree — 1 parallel, 0 perpendicular, -1 opposed — Angle (in degrees) drives a lamp's intensity here.
- **Cross** (`vector.cross`) — The direction perpendicular to two vectors — the surface normal when A and B are two edges of it, wired into a Cube's Position here.
- **Direction** (`vector.direction`) — The pure direction of a vector, length 1 — a Cube's Position moves exactly one unit that way.
- **Rotation** (`vector.rotation`) — Spins a vector around an Axis by an Angle (degrees) — wired into a Cube's Position, tracing an orbit as Angle changes.
- **Aim** (`vector.aim`) — The rotation that turns a thing at From to face To — wired straight into a Cube's Rotation so it faces the aimed point.
- **Random** (`value.random`) — One fixed draw between Least and Greatest per Variant — change Variant to draw again; it does NOT wander over time (that is Noise). Wired into a Sphere's radius.
- **Ramp** (`colour.ramp`) — A three-stop gradient read at Position — 0 is A, half is B, 1 is C — wired into a Cube's colour so it reads a journey along the ramp.

### the scene

See [room.md](room.md) for full ports and each example graph.

- **In** (`port.in`) — A doorway: placed inside a Geo, it puts a socket on the Geo's outer face. A Colour wired to that socket from outside reaches this door's Value.
- **Out** (`port.out`) — A doorway the other way: placed inside a Geo, its Value input is fed by a Number, and the Geo grows a matching socket on its outer face — read from outside.
- **Environment** (`world.environment`) — The scene's ambient wash and one sun — Ambient Colour and Sun Intensity come from wires. No output: a scene has exactly one, so nothing downstream needs to read it back.
- **Light** (`light.point`) — A lamp standing where you put it — Colour, Intensity and Position all come from wires, root or inside any container.
- **Camera** (`world.camera`) — An authored eye — Position and Look At come from wires. Standing in the room is not the same as being the shot: the ● toggle (not a port) marks which camera is active.
- **Background** (`world.background`) — The sky colour, wired to a Colour card so it can be authored beside everything else.
- **Grid** (`world.grid`) — The floor grid — Visible, Size and Colour all come from wires, so a Boolean can hide it entirely.
- **Scene** (`universe.world`) — The 3D place, entered like any container — Title and Sky come from wires, and (since 2026-08-19) the Scene's own Title output can feed a sibling Text panel, an edge crossing OUT of a container.
- **Kiosk** (`universe.space`) — Hides the toolbar for everything inside — set directly on the card, honestly: a wire into "Show the toolbar" is accepted by the port but currently ignored by the chrome check (docs/ai/known-fixes.md), so it is not wired here.
- **Geo** (`geom.geo`) — The plain place — TouchDesigner's Geometry COMP. Everything spatial placed inside it renders inside it and travels with it; a Cube standing in this Geo IS its Geometry output.
- **Studio** (`studio`) — The editor itself, as one node you can enter — its Title comes from a wire and is the only thing it will say about itself; what is inside stays inside.

### watch

See [watch.md](watch.md) for full ports and each example graph.

- **Outliner** (`view.outliner`) — Lists what exists in the current scope — its Title is wired, but the list itself has no port: it reads the document directly, not a wire.
- **Inspector** (`view.inspector`) — Edits whatever is selected — its Title is wired, but selection itself is per-viewer state, never a wire.
- **Timeline** (`view.timeline`) — The transport as wire values — Playhead climbs on the document clock while Playing is true, driving a Sphere's radius here so growth is visible without opening the window.
- **Director** (`view.director`) — A specialised editor for a registered work (algovrithm) — it reads as general-purpose in the palette, but the piece it edits is a hard-coded fallback, not a port (docs/ai/known-fixes.md).
- **Monitor** (`stream.monitor`) — TouchDesigner's viewer, as a window — wire any texture into Source and watch it live while you keep wiring. A picture operator (Camera In, Blur, …) cannot be watched here yet: its picture never leaves the GPU network (topRuntime.js), a known gap.
- **Desk** (`view.desk`) — Every machine linked into this space and what it has — cameras, microphones, screens — with a button that places a device's operator already set to run on its machine. No ports: what it shows comes from the space's machine roster, not a wire.

### bring in

See [bring-in.md](bring-in.md) for full ports and each example graph.

- **Model** (`geom.model`) — A file the person brought in, standing in space — Scale is wired here. No `src` asset ships with this example (honest: a freshly placed Model is exactly this empty until a file is chosen), so nothing renders yet.
- **Video** (`media.video`) — A video file standing in space, wired to Loop — its playing picture publishes to the Frame port only while the window that renders it is open (the same idiom as Webcam).
- **Sound** (`media.audio`) — A sound file standing in space — Volume and Loop are wired; Volume/Low/Mid/High publish live analysis numbers while the editor's own playback runs.
- **Webcam** (`source.webcam`) — The live camera frame — real once its window is open (permission-denied and no-camera are normal states it shows). Wired here into a Plane's Texture; a live frame always wins over a Texture URL.
- **Microphone** (`source.mic`) — Volume 0..1, live while the window is open — wired here into a lamp's Intensity so the room pulses with sound. Frequency is a raw spectrum array; nothing in the registry can consume it yet.
- **MIDI In** (`device.midi.in`) — A hardware controller, live while its window is open — listening on every channel (0) by default so a controller set to any channel is heard. Note is wired into a Sphere's radius here.
- **Button** (`view.button`) — The desk's Go — Presses is the authored, undoable count (one document op per press); Pressed is this window's live finger, honest only while actually held.
- **Keyboard** (`device.keyboard`) — The operator's other hand — a chosen key, live while the editor is open. Count rises once per press, wired here into a lamp's Intensity; a wire into Key itself is accepted but ignored (the listener reads node.values.key directly).

### send out

See [send-out.md](send-out.md) for full ports and each example graph.

- **Public page** (`view.publish`) — What a visitor to the public page gets — Title is wired; the space-level switches (make public, set the live project) live in the panel itself, owner-or-admin only.
- **DMX Out** (`device.dmx.out`) — A channel on the lighting desk's rig — Master, Channel, Value and Blackout all come from real wires here (a wired Boolean is safe; typing "0"/"false" straight into Blackout's free-text field is a documented trap). Status reports the rig's own reply.
- **MIDI Out** (`device.midi.out`) — Sends a note out over Web MIDI — Trigger holds the note, a changed Value goes out as CC. Status reports the feed's own reply.

### agents

See [agents.md](agents.md) for full ports and each example graph.

- **Agent** (`agent`) — Chat with Claude, as a node — Title is wired; the transcript lives server-side (ai_chats/ai_messages), never in the document.
- **Keeper** (`agent.keeper`) — A model you name by endpoint, not an account — Prompt is wired; Endpoint/Model/System are settings, not ports (nothing upstream should repoint the keeper mid-graph). Reply and Busy publish while it answers.
- **Agent Run** (`work.agent`) — Launches a headless `claude -p` session — Prompt is wired from Work Status's Summary, never Trigger, so placing this example never launches a real process. Status/Running/Result publish while it runs.
- **Work Status** (`work.status`) — Every session, worktree and open PR, local-dev only — Summary is wired into a Text panel so the count reads on the canvas.

### pictures

See [picture.md](picture.md) for full ports and each example graph.

- **Camera In** (`top.camera`) — A live camera feed as a picture operator — wired into Difference here. Its picture stays on the GPU; `out` is null in the graph (see the file header).
- **Difference** (`top.difference`) — What changed since the last frame — Camera In feeds it, and it feeds Level, the real motion-detection chain the all-nodes example wires end to end.
- **Level** (`top.level`) — Threshold, gain, brightness, gamma, invert, opacity — one card of picture adjustment, fed by Difference and feeding Blur.
- **Blur** (`top.blur`) — Softens a picture by Size — fed by Level, feeding Feedback, so a motion trail glows instead of hard-edging.
- **Edge** (`top.edge`) — Outlines a picture by Strength — wired straight off Camera In so it can join Feedback in a Blend.
- **Feedback** (`top.feedback`) — Fades its own last frame by Trail, then joins the new one — the motion-glow trick, fed by Blur, joined with Edge in a Blend.
- **Blend** (`top.blend`) — Combines two pictures by Mode and Amount — Feedback and Edge joined here, the way the all-nodes example lights the projector.
- **Picture Out** (`top.out`) — What the projector shows — a pass-through sink so the output page never has to know which operator happens to be last. Fed by Blend here.
- **Analyze** (`top.analyze`) — Picture to numbers — Brightness, Amount, and the lit centre (X, Y) are measured a few times a second and published live while the editor runs. Fed by Level here.

## Putting examples into a real di.iiii

`scripts/push-node-examples.mjs --base <url> --space <id> [--token <token>] [--family <id>]
[--dry-run]` creates one project per family (e.g. "examples · numbers", slug
`examples-numbers`) inside the given space, using the same APIs the app itself uses:
`POST /api/spaces/:space/projects` to create the project (a second run finds the same slug
already there and reuses it — it does NOT fail), then `POST /api/projects/:project/ops`
with `createNode`/`createEdge` ops whose `opId` is the node/edge's own stable id, so
resubmitting the SAME example is a no-op (serverXR drops an op whose `opId` it already
applied). Known limit: it only ever creates — if an example's `build()` changes after a
first push, re-running does not update the nodes already there; delete the family's
project first for a clean re-push. Pass `--token` for a space that requires authentication,
`--family <id>` to push just one family, `--dry-run` to print the op counts and touch
nothing. This script is NEVER run against a live install from an agent session — only the
lead runs it, against a real space, after review.

```sh
node scripts/push-node-examples.mjs --base https://staging.di-studio.xyz --space my-space --token "$TOKEN"
```
