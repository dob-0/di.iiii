# algovrithm assets

Drop media in this folder and it appears in the director panel's bin. Nothing
else to do — no upload, no manifest, no database row.

Recognised: `.png` `.jpg` `.jpeg` `.webp` `.gif` `.avif` · `.mp4` `.webm` `.mov`
· `.glb` `.gltf`. Anything else is ignored (this README included).

The filename becomes the asset's id, so `ritual-01.png` is `ritual-01`. An edit
list pasted back into `sequences/index.js` refers to that id — **renaming a file
orphans any clip using it**.

These files are committed to the branch on purpose. Unlike every other di.iiii
space, algovrithm's scene is code rather than a project document, and its media
follows the same rule: clone the branch and the piece is complete, with no
content to pull down from a server first. Keep files small enough to live in git
comfortably — compress video before adding it.
