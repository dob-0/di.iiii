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

run_gate() {
    local label="$1"; shift
    local out
    if ! out=$("$@" 2>&1); then
        printf 'PUSH BLOCKED — %s failed:\n%s\n→ Fix and push again (or DI_SKIP_PUSH_GATE=1 for a true emergency).\n' \
            "$label" "$(printf '%s' "$out" | tail -n 40)" >&2
        exit 2
    fi
}

run_gate "lint" npm run lint
run_gate "schema-sync tests" npm run test:schema-sync
run_gate "wiki/user-facing docs check" npm run docs:wiki:check
exit 0
