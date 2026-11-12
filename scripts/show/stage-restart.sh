#!/usr/bin/env bash
# stage-restart.sh — close the show browser cleanly and open the stage + Perform windows again.
#
#   scripts/show/stage-restart.sh [--dry-run] [stage-open.sh options…]
#
# Why: a change to the browser's sandbox (k2-browser-access.sh on) or a newly plugged controller is only seen by
# a browser that starts after it. This asks the running browser (remote debugging on 9224) to quit the normal way
# (Browser.close: tabs and profile are saved), waits until it is gone, then runs stage-open.sh through di-here so
# the new windows belong to the owner's desktop. Nothing is killed: if the browser does not quit in 20 s it stops
# and says so.
# Undo: none needed; the same two pages come back. --dry-run prints what it would do and changes nothing.
set -euo pipefail
PORT=9224
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

browser_up() { curl -s -m 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; }

main() {
    local dry=0 args=()
    for a in "$@"; do [[ $a == --dry-run ]] && dry=1 || args+=("$a"); done

    if (( dry )); then
        echo "dry run, nothing is changed. It would:"
        echo "  1. ask the browser on port ${PORT} to quit (Browser.close) — running now: $(browser_up && echo yes || echo no)"
        echo "  2. wait until port ${PORT} is closed (20 s at most)"
        echo "  3. di-here ${HERE}/stage-open.sh ${args[*]}"
        "${HERE}/stage-open.sh" "${args[@]}" --dry-run | tail -3
        return 0
    fi

    if browser_up; then
        echo "asking the browser to quit…"
        node -e '
            (async () => {
                const v = await (await fetch("http://127.0.0.1:'"${PORT}"'/json/version")).json()
                const ws = new WebSocket(v.webSocketDebuggerUrl)
                await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
                ws.send(JSON.stringify({ id: 1, method: "Browser.close" }))
                setTimeout(() => process.exit(0), 1500)
            })().catch((e) => { console.error("could not reach the browser: " + e.message); process.exit(1) })'
        for _ in $(seq 1 40); do browser_up || break; sleep 0.5; done
        if browser_up; then echo "the browser did not quit in 20 s — nothing was killed; close it by hand and run again" >&2; return 1; fi
        sleep 2
    else
        echo "no browser on port ${PORT}; opening a fresh one"
    fi

    echo "opening the stage and the Perform window…"
    di-here "${HERE}/stage-open.sh" "${args[@]}"
    for _ in $(seq 1 40); do browser_up && break; sleep 0.5; done
    browser_up && echo "the browser is up again on port ${PORT}" || { echo "the browser did not come up" >&2; return 1; }
}

[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
