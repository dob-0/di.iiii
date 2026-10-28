#!/usr/bin/env bash
# Starts a new Roblox game repo from the di-games template.
# Usage: new-game.sh <name> <dir>     name: kebab-case, for example haunted-school; dir: new or empty
# Copies ../template to <dir>, fills in the name, adds the design page (skill game-design) and the asset
# check (skill game-look), and runs `git init`. Writes nothing outside <dir>. Needs: bash and git.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$HERE/../template"
SKILLS="$(cd "$HERE/../.." && pwd)"

usage() { echo "usage: new-game.sh <name> <dir>   (name: kebab-case, for example haunted-school)" >&2; exit 2; }
[[ $# -eq 2 ]] || usage
NAME="$1"
DIR="$2"
[[ "$NAME" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]] || { echo "new-game.sh: name '$NAME' must be kebab-case: lower-case letters and digits, single dashes, starting with a letter" >&2; exit 2; }
[[ -d "$TEMPLATE" && -f "$SKILLS/game-design/design-template.md" && -f "$SKILLS/game-look/scripts/check_assets.py" ]] || { echo "new-game.sh: the plugin files are incomplete (template, game-design or game-look is missing)" >&2; exit 1; }
if [[ -e "$DIR" ]] && { [[ ! -d "$DIR" ]] || [[ -n "$(ls -A "$DIR")" ]]; }; then
  echo "new-game.sh: $DIR exists and is not an empty directory; refusing to touch it" >&2
  exit 1
fi

# kebab-case to PascalCase for the Roblox project name: haunted-school -> HauntedSchool
PROJECT=""
IFS='-' read -r -a PARTS <<< "$NAME"
for p in "${PARTS[@]}"; do PROJECT+="${p^}"; done

mkdir -p "$DIR"
cp -a "$TEMPLATE/." "$DIR/"
mv "$DIR/CLAUDE.template.md" "$DIR/CLAUDE.md"
cp "$SKILLS/game-design/design-template.md" "$DIR/docs/design.md"
cp "$SKILLS/game-look/scripts/check_assets.py" "$DIR/scripts/check_assets.py"
chmod +x "$DIR/scripts/"*.sh "$DIR/scripts/"*.py

grep -rlZ --exclude-dir=.git -e '__PROJECT_NAME__' -e '__GAME_SLUG__' "$DIR" \
  | xargs -0 sed -i -e "s/__PROJECT_NAME__/$PROJECT/g" -e "s/__GAME_SLUG__/$NAME/g"

git -C "$DIR" init -q -b main

echo "created $DIR (game '$NAME', Roblox project '$PROJECT')"
echo "next:  cd $DIR && scripts/setup-tools.sh && scripts/check.sh"
