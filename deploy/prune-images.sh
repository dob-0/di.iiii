#!/usr/bin/env bash
# Keep the running images and the 2 newest per <repo>:<env>- family; drop the rest.
#
# Nothing here is the only copy of anything: every image was pushed to ghcr.io by
# the deploy that built it, so a removed one is a `docker pull` away. Keeping two
# is for rollback speed, not safety.
#
# --apply to actually delete. Default is a dry run.
set -uo pipefail
KEEP_PER_FAMILY=2
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

keep=$(mktemp); all=$(mktemp); trap 'rm -f "$keep" "$all"' EXIT

# In use by a running container — never touched, whatever its age.
docker ps --format '{{.Image}}' | while read -r ref; do
  docker image inspect "$ref" --format '{{.Id}}' 2>/dev/null
done >> "$keep"

# The N newest of each family.
for repo in ghcr.io/dob-0/dii-client ghcr.io/dob-0/dii-server; do
  for env in prod staging; do
    docker images "$repo" --format '{{.ID}}\t{{.Tag}}\t{{.CreatedAt}}' \
      | grep -P "\t${env}-" | sort -k3 -r | head -n "$KEEP_PER_FAMILY" | cut -f1 \
      | while read -r id; do docker image inspect "$id" --format '{{.Id}}' 2>/dev/null; done
  done
done >> "$keep"

# Anything not on that list and not held by a container is fair game.
docker images -q --no-trunc --filter dangling=false | sort -u > "$all"
docker images -q --no-trunc --filter dangling=true | sort -u >> "$all"
sort -u "$keep" -o "$keep"; sort -u "$all" -o "$all"

doomed=$(comm -23 "$all" "$keep")
n=$(printf '%s\n' "$doomed" | grep -c . || true)

echo "keeping   $(grep -c . "$keep") image(s)"
echo "removing  $n image(s)"
[ "$APPLY" = 0 ] && { echo; echo "DRY RUN — pass --apply to delete"; exit 0; }

printf '%s\n' "$doomed" | grep . | xargs -r -n1 docker image rm -f >/dev/null 2>&1
docker builder prune -af >/dev/null 2>&1
journalctl --vacuum-size=100M >/dev/null 2>&1
echo "done"
df -h / | tail -1
