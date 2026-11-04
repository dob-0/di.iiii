#!/usr/bin/env bash
# tools/lint-words.sh -- the words check of docs/ai/vocabulary.md.
#
# The owner's rules name this path ("Repos with the machine check run tools/lint-words.sh
# (Vale, pinned)"). This repo implements the SAME check in node, not Vale, and says why:
#   - Vale reads prose files; the dictionary governs STRINGS A PERSON CAN READ inside
#     JS/JSX/HTML and the wiki's data (src/copyVocabulary.test.js walks those with a
#     string extractor that drops identifiers, class names and routes). Vale cannot tell a
#     class name from a sentence; the extractor is what made the guard usable.
#   - Vale is a Go binary: not in this repo's CI image, and it would be a second source of
#     truth for the same dictionary.
# If a Vale config is wanted later, it should be generated from the BANNED list in that test.
# Exit code: 0 = clean, non-zero = banned word(s) printed with the string and the word to use.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx --no-install vitest run src/copyVocabulary.test.js "$@"
