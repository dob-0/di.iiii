#!/usr/bin/env bash
# gen3d.sh <image|dir> [--model <id>|auto] [--out dir] [--where colab|local] [--height M | --size W,H,D | --sizes file.json]
#          [--use product|research] [--allow-conditional] [--no-people-confirmed] [--dry-run] [--list]
# Thin wrapper: all logic is in gen3d.mjs (tested). Uses the pinned node of this repo's toolchain.
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/gen3d.mjs" "$@"
