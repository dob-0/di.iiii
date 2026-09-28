#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash): before any `git push` from a
# session, run the fast check subset — lint, schema-sync contract, wiki sync
# (~30-60s). Exit 2 blocks the push with the failure shown; everything else
# passes through untouched. Full tests stay in CI; this is the "don't send
# obviously broken work" layer. Escape hatch for emergencies:
#   DI_SKIP_PUSH_GATE=1 git push ...
set -u
INPUT=$(cat 2>/dev/null) || exit 0
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:](])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push' || exit 0
[[ "$CMD" == *DI_SKIP_PUSH_GATE=1* ]] && exit 0

cd "$(dirname "$0")/.." || exit 0

# When the git hook is installed it runs the same checks on every push — this
# hook would only run them twice. (An older branch without scripts/git-hooks gets
# nothing from git, so it still gets the checks here.)
[[ "$(git config --get core.hooksPath 2>/dev/null)" == scripts/git-hooks && -x scripts/git-hooks/pre-push ]] && exit 0

# Claude Code reads exit 2 as "block this tool call"; push-checks.sh says 1.
bash scripts/push-checks.sh || exit 2
exit 0
