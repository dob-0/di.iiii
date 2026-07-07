#!/usr/bin/env bash
# Capture a golden rule mid-session, the moment you discover it.
#
# Usage (inline during work):
#   ./scripts/capture-rule.sh "Title" "Rule" "Why" "How" "Files"
#
# Minimal usage (fills blanks you can edit later):
#   ./scripts/capture-rule.sh "Title"
#
# All args after title are optional. Fill what you know now.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
RULES_FILE="$REPO_ROOT/docs/ai/golden_rules.md"

if [[ ! -f "$RULES_FILE" ]]; then
  echo "ERROR: golden_rules.md not found at $RULES_FILE" >&2
  exit 1
fi

TITLE="${1:-}"
RULE="${2:-}"
WHY="${3:-}"
HOW="${4:-}"
FILES="${5:-}"

if [[ -z "$TITLE" ]]; then
  echo ""
  echo "Usage: capture-rule.sh \"Title\" [\"Rule\"] [\"Why\"] [\"How\"] [\"Files\"]"
  echo ""
  echo "Examples:"
  echo "  ./scripts/capture-rule.sh \\"
  echo "    \"SQLite over JSON for concurrent writes\" \\"
  echo "    \"Use SQLite for anything written by concurrent requests.\" \\"
  echo "    \"JSON read-modify-write races caused lost ops under load.\" \\"
  echo "    \"better-sqlite3 serializes writes atomically at OS level.\" \\"
  echo "    \"serverXR/src/db.js, serverXR/src/spaceStore.js\""
  echo ""
  exit 1
fi

# Build the markdown entry with real newlines — printf "%b" would interpret
# backslash escapes inside user-supplied text (e.g. a pasted Windows path).
NL=$'\n'
ENTRY="${NL}---${NL}${NL}### ${TITLE}${NL}"
ENTRY+="${NL}**Rule:** ${RULE:-TODO}${NL}"
ENTRY+="${NL}**Why:** ${WHY:-TODO}${NL}"
if [[ -n "$HOW" ]]; then
  ENTRY+="${NL}**How:** ${HOW}${NL}"
fi
if [[ -n "$FILES" ]]; then
  ENTRY+="${NL}**Files:** \`${FILES}\`${NL}"
fi

printf "%s" "$ENTRY" >> "$RULES_FILE"

echo ""
echo "  ✓ Rule captured: \"${TITLE}\""
echo "    → docs/ai/golden_rules.md"
echo ""

# Show the appended block for quick review
echo "  Preview:"
tail -12 "$RULES_FILE" | sed 's/^/    /'
echo ""
