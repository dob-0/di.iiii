#!/usr/bin/env bash
# scripts/ollama-task.sh
# Safe delegation of bounded tasks to local Ollama models. Free — no API credits.
# Output is advisory — Claude Code or human reviews before acting on any suggestion.
#
# Usage:
#   bash scripts/ollama-task.sh <tier> "<task>"
#
# Tiers and models:
#   fast    → dob-fast:latest           (project-fine-tuned, fast — CSS tweaks, component Q&A)
#   deep    → dob-deep:latest           (project-fine-tuned, deep — architecture, complex analysis)
#   coder   → qwen3-coder:30b           (generic precision coder — test design, complex logic)
#   general → qwen3.5:latest            (generic — mixed reasoning + code)
#   tiny    → qwen2.5-coder:1.5b-base   (ultrafast — simple symbol search, yes/no questions)

set -euo pipefail

TIER="${1:-fast}"
TASK="${2:-}"

if [[ -z "$TASK" ]]; then
    echo "Usage: bash scripts/ollama-task.sh <tier> \"<task>\""
    echo "Tiers: fast | deep | coder | general | tiny"
    exit 1
fi

OLLAMA_URL="${OLLAMA_HOST:-http://localhost:11434}"

# Project-fine-tuned models: dob-fast and dob-deep already know di.i
# Do NOT override with a system prompt — it suppresses their fine-tuned behavior
# Generic models: send context so they understand the project

case "$TIER" in
    fast)
        MODEL="dob-fast:latest"
        USE_SYSTEM=false
        ;;
    deep)
        MODEL="dob-deep:latest"
        USE_SYSTEM=false
        ;;
    coder)
        MODEL="qwen3-coder:30b"
        USE_SYSTEM=true
        ;;
    general)
        MODEL="qwen3.5:latest"
        USE_SYSTEM=true
        ;;
    tiny)
        MODEL="qwen2.5-coder:1.5b-base"
        USE_SYSTEM=true
        ;;
    *)
        echo "Unknown tier: $TIER. Valid: fast | deep | coder | general | tiny" >&2
        exit 1
        ;;
esac

# Generic project context for non-fine-tuned models
SYSTEM_PROMPT="You are a code analyst for the di.i project — a spatial XR editor with a React + Three.js frontend (Studio and Beta lanes) and a Node.js + SQLite backend (serverXR). The Beta lane is a node-graph-first experimental editor. Visual identity: black background, cyan accent #4df9ff, square corners, monospace. Non-negotiables: no secrets in JS bundle, op-log is append-only CRDT-compatible, serverXR is the only write authority, shared/ is the canonical schema layer. Your job is analysis, explanation, planning, and documentation drafts. Any code change suggestions are advisory only — mark them with CHANGE NEEDED / ROLE / FILES so they can be handed off to the right engineer."

echo "── Ollama [$MODEL] ────────────────────────────────"
echo ""

if [[ "$USE_SYSTEM" == "true" ]]; then
    PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'model': sys.argv[1],
    'system': sys.argv[2],
    'prompt': sys.argv[3],
    'stream': False,
    'options': {'temperature': 0.3, 'num_predict': 2048}
}))
" "$MODEL" "$SYSTEM_PROMPT" "$TASK")
else
    PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'model': sys.argv[1],
    'prompt': sys.argv[2],
    'stream': False,
    'options': {'temperature': 0.3, 'num_predict': 2048}
}))
" "$MODEL" "$TASK")
fi

RESPONSE=$(curl -sf "${OLLAMA_URL}/api/generate" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD") || {
    echo "Error: Ollama API not reachable at $OLLAMA_URL" >&2
    echo "Start Ollama with: ollama serve" >&2
    exit 1
}

python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('response', '(no response)'))
" <<< "$RESPONSE"

echo ""
echo "── end Ollama output ── advisory only — review before acting ──"
