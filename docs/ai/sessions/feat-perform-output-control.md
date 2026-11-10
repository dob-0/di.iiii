# feat/perform-output-control (2026-11-10)

Owner (VJ, show Saturday): "we need button where we click it open close the output, and also setting for that window mb we want to many windows".

## What the model already had
- `mapping.output = { width, height, show?, slate? }` (`shared/projectSchema.cjs` normalizeMappingState, twin `src/shared/projectSchema.js`). Default 1920x1080.
- `output.show` = which MACHINE and screen a stage box (`di stage run`) puts the kiosk on (normalizeOutputShow). Not touched: it is the stage box's answer; this work is what the button does on the machine in front of the person.
- `surface.resolution` default [1280, 720] (projectSchema.js:252, :1775). One output only: `MapOutput.jsx` draws ALL surfaces; the route is `/{space}/map/{project}/out`; one window name `di-map-out-{project}`.
- Ops: `setMappingState` (patch; never touches surfaces/cues), `setMappingSurface`.

## Built (1 and 2)
- `src/perform/OutputControl.jsx` (+ `outputControl.css`): toggle OPEN OUTPUT / CLOSE OUTPUT with a text state OPEN / CLOSED, and a Settings panel. Replaces the two "Open output" buttons in PerformWindows.jsx.
- `src/perform/outputWindows.js`: controller (handle poll of `win.closed` every 1 s; BroadcastChannel ping/hello/bye for recovery after a reload; asks a recovered page to close itself), screen list (Window Management API, only when present; permission only on the "List screens" press unless already granted), `matchScreenOps` (output AND every surface resolution in one batch), `withOutputWindow`.
- `src/map/outputPresence.js`: the output page answers ping with hello, says hello on load and bye on pagehide, closes on request, and requests fullscreen on the first click/key when `output.window.fullscreen`.
- Schema, both twins: `output.window = { screen?: {label,index,size}, fullscreen?: true }`; absent means absent, old documents are byte-identical.

Browser limits stated in the panel: no screen placement outside Chromium; full screen needs one click in the output window; the window can only be closed by script if the page was opened by script (otherwise "close it by hand"). Pop-ups must be allowed.

## Multi-output: design, NOT built
Why not now: a clean second output touches the schema twins, MapStage/MapOutput filtering, the desk wall editor (assigning surfaces), cues (a cue stores per-surface state, fine) and the stage box (`show`), and there is no browser here to prove any of it before Saturday. A half model would be worse than one honest output.

Shape:
- `mapping.outputs = [{ id, name, width, height, show?, slate?, window? }]`; `mapping.output` stays and means outputs[0] ("Output 1"). Old document: `outputs` absent -> one output named "Output 1" made from `output`. Writers keep `output` in sync for output 1 so old readers still work.
- `surface.output = '<outputId>'`, absent = output 1. Every surface belongs to exactly one output; a surface on two walls is two surfaces (the corners differ anyway).
- Route: `/out` = output 1, `/out?o=<id>` the others. Window name `di-map-out-{project}-{id}`; presence channel carries `{ id }` in every message.
- `MapOutput`/`MapStage` draw only surfaces whose `output` matches; the desk shows an output switch.
- Controller: `createOutputController` gets an `outputId`; the list UI maps over `outputs` with "+ output" and remove (removing reassigns its surfaces to output 1 after a confirm).
- Tests to add: old doc = one output "Output 1"; `?o=` parsing in getMapLocationState; surface filter; twin agreement in schemaSync.test.js.

## Not verified
No browser was run. Checked by vitest (jsdom, fake window/channel) only. Needs a look on the real desk and a projector before the show.
