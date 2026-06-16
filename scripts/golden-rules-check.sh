#!/usr/bin/env bash
# Context-aware golden rules check — runs at end of every Claude Code session.
# Reads what actually changed and fires specific signals, not generic reminders.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
cd "$REPO_ROOT"

# What changed this session (staged + unstaged + untracked)
CHANGED=$(git diff --name-only 2>/dev/null)
STAGED=$(git diff --cached --name-only 2>/dev/null)
UNTRACKED=$(git status --short 2>/dev/null | grep '^??' | awk '{print $2}' | tr '\n' ' ')
ALL_CHANGED="$CHANGED $STAGED $UNTRACKED"

# Signal detection
SIGNALS=()

echo "$ALL_CHANGED" | grep -qE "(auth|session|cookie|token|password|secret)" \
  && SIGNALS+=("Auth / session files changed")

echo "$ALL_CHANGED" | grep -qE "(db\.js|migrate|spaceStore|projectStore|sqlite|database)" \
  && SIGNALS+=("Database or persistence files changed")

echo "$ALL_CHANGED" | grep -qE "(Dockerfile|docker-compose|\.dockerignore|nginx|deploy)" \
  && SIGNALS+=("Infra / deploy files changed")

echo "$ALL_CHANGED" | grep -qE "(config\.js|settings\.json|\.env)" \
  && SIGNALS+=("Config files changed")

echo "$ALL_CHANGED" | grep -qE "(hook|Hook)" \
  && SIGNALS+=("Hook or event system changed")

echo "$ALL_CHANGED" | grep -qE "\.test\.(js|jsx|ts|tsx)" \
  && SIGNALS+=("Tests added or changed")

NEW_FILE_COUNT=$(echo "$UNTRACKED" | tr ' ' '\n' | grep -v '^$' | wc -l | tr -d ' ')
[[ "$NEW_FILE_COUNT" -gt 0 ]] \
  && SIGNALS+=("$NEW_FILE_COUNT new file(s) created: $UNTRACKED")

# Output
echo ""
echo "── Golden Rules Check ──────────────────────────────────────────────"

if [[ ${#SIGNALS[@]} -gt 0 ]]; then
  echo "  Signals from this session:"
  for signal in "${SIGNALS[@]}"; do
    echo "    • $signal"
  done
  echo ""
  echo "  Does any of these qualify? Add a rule if you:"
  echo "    → fixed a structural bug (not just a typo)"
  echo "    → measured a 30%+ performance improvement"
  echo "    → found a non-obvious interaction between two systems"
  echo "    → refused or corrected a destructive / bad prompt"
  echo "    → discovered an existing pattern was wrong"
else
  echo "  No high-signal changes detected. Quick check: anything non-obvious?"
fi

echo ""
echo "  Capture now (one command, works mid-session too):"
echo "    ./scripts/capture-rule.sh \"Title\" \"Rule\" \"Why\" \"How\" \"Files\""
echo "────────────────────────────────────────────────────────────────────"
echo ""
