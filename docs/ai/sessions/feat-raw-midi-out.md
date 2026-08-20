## What this branch does

Wakes device.midi.out — the first dormant send-out node made real. A
MidiOutFeed (the KeyboardFeed shape: invisible, one per node, editor-level)
sends over Web MIDI: Trigger truthy holds a note (rising edge strikes at
Note/Velocity, falling releases the note actually struck), a truthy-but-
changed trigger re-strikes (the rising-count idiom), and a changed Value
leaves as CC. useMidiOutput joins useMidiInput in midiCapture.js — same
status vocabulary, same hotplug behaviour, same navigator-boundary fake in
tests. Status is a real output read from the live side channel.

## Where things stand

Registry entry un-shelled (runtime 'web', channel input added, hostHint
default dropped), removed from UNIMPLEMENTED_NODE_TYPES, guard test now
holds device.osc.out as the canonical shell. Wired in the all-nodes
example; wiki article beside MIDI In's; behaviour-tested at the fake
navigator boundary including the stuck-key release on unmount.

## Decisions worth keeping

- Sends to EVERY connected output; a device picker can come later — a
  venue with exactly one synth cable is the common case.
- Note release names the note that was STRUCK, not the current Note input —
  anything else leaves stuck keys when Note moves while held.
- No hardware in CI or on this machine: verified at the API boundary plus
  a browser pass showing honest status text. The first real cable test is
  the owner's — the node says plainly what it is doing either way.
