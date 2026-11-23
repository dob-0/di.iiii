# feat/deck-effects: effects in the VJ deck

Owner ask (2026-11-10, "where is effect"): the deck had clips, layers, blend, opacity, master,
crossfader and NO effects. Resolume style, in the di look: an effect stack on each LAYER and on
the MASTER. Clip-level stacks are a later step; the data is shaped so they fit (a clip would carry
the same `effects` array and its stack would run right after the clip source, before the layer's).

## Data (all inside `node.values.deck`, nothing new stored elsewhere)

    layer.effects = [{ id, type, on, mix, params }]     // max 8
    deck.effects  = [...]                               // the MASTER stack, max 8

- `type`: one of the offered picture operators (below). Unknown type: dropped.
- `on`: boolean, default true. `mix`: dry/wet 0..1, default 1.
- `params`: the operator's own params via `resolveTopParams` (defaults filled, clamped to its ranges).
- `id`: stable string (`fx-...`), unique within the stack, generated when missing.
- An old deck without the fields loads with empty stacks and draws exactly as before.

## Offered operators (effects ARE the existing picture operators; no new shader, no second engine)

| type | label | main params shown |
|---|---|---|
| top.level | Level | gain, brightness, gamma |
| top.tint | Tint | amount (+ the Bright colour) |
| top.blur | Blur | size |
| top.edge | Edge | strength |
| top.feedback | Feedback | trail |
| top.transform | Reframe | scale, rotate, move X |

## Expansion (`expandDeck`)

- Layer: clip source -> its effects in order -> the layer's blend (input `b`). Master: last layer blend -> master effects -> master Level.
- Each ON effect = two operators: the effect itself (`top.*`, input `a` = what came before) and a `top.blend`
  (mode Mix, `a` = dry, `b` = effect, Amount = `mix`). dry/wet therefore uses the EXISTING Blend operator.
  The blend stays even at mix 1 so a slider never adds or removes operators (no rebuild while a pot turns).
- `on: false` or an empty stack: no operators at all (zero cost).
- Node ids derive from the effect id, not its position: `<deck>::L<i>::fx::<id>` / `::fxmix::<id>`, master `<deck>::fx::<id>` /
  `::fxmix::<id>`. A param change leaves the id set unchanged; a reorder only rewires.
- A layer with no active clip has no effects drawn (no source). The master stack is drawn only when some layer has a picture.

## UI (VjDeckView, bottom row: SOURCES | CLIP | EFFECTS)

EFFECTS panel, 24 px header, square corners, existing tokens/classes. LAYER | MASTER switch (LAYER = the layer of the selected
clip, or the one picked by tapping its name). `+ Add` opens a small list of the operator names. Each effect row: on/off, name,
up, down, remove; mix slider; its main params as sliders (labels from the operator definitions; colour params as a colour input).
Touch targets >= 28 px. No sideways scroll at 979 and 1707 px.

## MIDI

New action `fx` in deckBinding.js: args `{ param: 'mix' | 0 | 1 | 2, layer?, effect? }`. Without `layer`/`effect` it addresses the
SELECTED stack's first effect (the view hands `ctx.fx = { layer }`, -1 = master). K2 default: pots 9-12 = mix, param 1, 2, 3.
Absolute controls use soft takeover like the others. Sliders carry `data-midi-target`:
`fxmix:<layer|m>:<effect>` and `fxp:<layer|m>:<effect>:<n>` so Learn binds any of them.

## Non-goals

Clip-level stacks UI, effect presets, colour-param MIDI, new operators, per-effect beat sync, reorder by drag.
