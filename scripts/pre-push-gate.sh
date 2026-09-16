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

# Warn, never block: "is this the platform or a project?" is a judgement call,
# and the answer is the developer's. src/works/boundary.test.js is the gate
# that actually fails; this is the sentence that arrives in time to matter.
node scripts/works-boundary.mjs || true

# Warn, never block: a branch behind origin/dev can still push a perfectly
# good change (a stacked PR, a deliberate rebase later) — the start check
# exists to make the fact visible before it becomes a surprise merge
# conflict, not to stop the push. --code-only skips the (slower) space check;
# this gate only cares about the branch position, and every second here is a
# second added to every push. Never let a network hiccup here block a push —
# start-check itself degrades to "not checked" rather than throwing, so this
# can only warn or stay silent.
BEHIND_JSON=$(node scripts/start-check.mjs --code-only --json 2>/dev/null) && \
    BEHIND=$(printf '%s' "$BEHIND_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const r=JSON.parse(s);console.log(r.code?.behindOriginDev||"")}catch{console.log("")}})' 2>/dev/null) && \
    [[ -n "$BEHIND" ]] && \
    printf '\n  \xe2\x9a\xa0 this branch is %s commits behind origin/dev — pushing anyway. git pull (or rebase) to catch up first.\n\n' "$BEHIND" >&2

run_gate "lint" npm run lint
run_gate "schema-sync tests" npm run test:schema-sync
run_gate "wiki/user-facing docs check" npm run docs:wiki:check
run_gate "AI docs (CURRENT.md limit + derived facts + freshness)" npm run docs:ai:check
exit 0
