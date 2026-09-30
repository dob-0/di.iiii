#!/bin/sh
# preview-install.sh — put a preview build of di.iiii on THIS machine with a backup and a one-command rollback.
#
# The owner's preview channel (RIG_BUILD, 2026-09-28 onward) was installed by hand twelve times: copy the
# running artifact, the env, the database, the desk and the moxir space aside, write a rollback script, run
# `di update --from`. This is that routine as a script (CLAUDE.md rule 5: no hand-made state). It changes
# nothing until the checks pass, refuses to overwrite an existing backup step, and its rollback.sh restores the
# program (and, with --with-data, the data taken just before) in one command.
#
#   sh scripts/rigbuild/preview-install.sh --step 13 --version 0.4.16-rigbuilder.13 --prev 0.4.16-rigbuilder.12 \
#        --artifact dist-runtime/di-runtime-0.4.16-rigbuilder.13.tar.gz [--root <backup root>] [--dry-run]
#
# The artifact is built with `npm run di:pack -- --version=<version>`. --prev names the version that is running
# now; its artifact must sit at <root>/step-<N-1>/installed/di-runtime-<prev>.tar.gz (every step keeps it there).
# The backup root defaults to ~/di-backups/preview-rig-builder-2026-09-28 (the home layout: every backup in
# ~/di-backups).
set -eu

usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

STEP=""; VERSION=""; PREV=""; ART=""; DRY=0
ROOT="$HOME/di-backups/preview-rig-builder-2026-09-28"
while [ $# -gt 0 ]; do
    case "$1" in
        --step) STEP=${2:-}; shift 2;;
        --version) VERSION=${2:-}; shift 2;;
        --prev) PREV=${2:-}; shift 2;;
        --artifact) ART=${2:-}; shift 2;;
        --root) ROOT=${2:-}; shift 2;;
        --dry-run) DRY=1; shift;;
        *) echo "unknown flag $1" >&2; usage;;
    esac
done
[ -n "$STEP" ] && [ -n "$VERSION" ] && [ -n "$PREV" ] && [ -n "$ART" ] || usage
[ -f "$ART" ] || { echo "missing artifact $ART" >&2; exit 1; }
case "$ART" in *"$VERSION"*) ;; *) echo "artifact name does not carry $VERSION: $ART" >&2; exit 1;; esac

PREV_ART="$ROOT/step-$((STEP - 1))/installed/di-runtime-$PREV.tar.gz"
[ -f "$PREV_ART" ] || { echo "missing the running artifact $PREV_ART" >&2; exit 1; }
DIR="$ROOT/step-$STEP"
[ ! -e "$DIR" ] || { echo "$DIR exists — refusing to overwrite a backup step" >&2; exit 1; }
DATA="$HOME/.di/data"
for f in "$HOME/.di/di.env" "$DATA/di.db" "$HOME/.di/state.json"; do [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }; done
command -v sqlite3 >/dev/null || { echo "sqlite3 is needed for a consistent database copy" >&2; exit 1; }
command -v di >/dev/null || { echo "di is not on PATH" >&2; exit 1; }

echo "step $STEP: $PREV -> $VERSION"
echo "  artifact  $ART ($(sha256sum "$ART" | cut -c1-12)…)"
echo "  backup    $DIR"
if [ "$DRY" = 1 ]; then
    echo "[dry-run] would copy $PREV_ART, di.env, the database, the desk and the moxir space into $DIR,"
    echo "[dry-run] write SHA256SUMS + rollback.sh, then run: di update --from $ART"
    exit 0
fi

mkdir -p "$DIR/data" "$DIR/runtime" "$DIR/installed"
cp "$PREV_ART" "$DIR/runtime/"
cp "$HOME/.di/di.env" "$DIR/di.env"; chmod 600 "$DIR/di.env"
sqlite3 "$DATA/di.db" ".backup '$DIR/data/di.db'"
tar -C "$DATA" -czf "$DIR/data/lighting.tar.gz" lighting
tar -C "$DATA" -cf "$DIR/data/spaces-moxir.tar" spaces/moxir
( cd "$DIR/data" && di save moxir >/dev/null )          # moxir.diiii lands in the working directory
[ -f "$DIR/data/moxir.diiii" ] || { echo "di save did not write $DIR/data/moxir.diiii" >&2; exit 1; }
cp "$ART" "$DIR/installed/"
sha256sum "$ART" > "$DIR/installed/checksums-${VERSION#*-}.txt"
cp "$HOME/.di/state.json" "$DIR/installed/state.json"
ls "$HOME/.di/versions" > "$DIR/installed/versions-dir.txt"

cat > "$DIR/rollback.sh" <<'EOF'
#!/bin/sh
# rollback.sh — undo __VERSION__ and go back to __PREV__ in one command.
#   sh .../step-__STEP__/rollback.sh              # program + di.env back
#   sh .../step-__STEP__/rollback.sh --with-data  # ALSO di.db, moxir, the desk (taken just before the install)
#   sh .../step-__STEP__/rollback.sh --dry-run    # check, change nothing
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
DRY=0; DATA=0
for a in "$@"; do case "$a" in --dry-run) DRY=1;; --with-data) DATA=1;; *) echo "unknown flag $a" >&2; exit 2;; esac; done
ART="$HERE/runtime/di-runtime-__PREV__.tar.gz"
[ -f "$ART" ] || { echo "missing $ART" >&2; exit 1; }
( cd "$HERE" && sha256sum -c SHA256SUMS --quiet ) || { echo "SHA256SUMS check failed" >&2; exit 1; }
echo "artifact ok: $ART"
if [ "$DRY" = 1 ]; then
    echo "[dry-run] would run: di update --from $ART"
    echo "[dry-run] would copy $HERE/di.env to ~/.di/di.env"
    [ "$DATA" = 1 ] && echo "[dry-run] would stop di, restore data/di.db, data/lighting.tar.gz, data/spaces-moxir.tar, start di"
    exit 0
fi
cp "$HERE/di.env" "$HOME/.di/di.env"
di update --from "$ART"
if [ "$DATA" = 1 ]; then
    di down
    cp "$HERE/data/di.db" "$HOME/.di/data/di.db"; rm -f "$HOME/.di/data/di.db-wal" "$HOME/.di/data/di.db-shm"
    rm -rf "$HOME/.di/data/lighting"; tar -C "$HOME/.di/data" -xzf "$HERE/data/lighting.tar.gz"
    rm -rf "$HOME/.di/data/spaces/moxir"; tar -C "$HOME/.di/data" -xf "$HERE/data/spaces-moxir.tar"
    di up
fi
echo "back on __PREV__"
EOF
sed -i "s/__VERSION__/$VERSION/g; s/__PREV__/$PREV/g; s/__STEP__/$STEP/g" "$DIR/rollback.sh"

( cd "$DIR" && find . -type f ! -name SHA256SUMS ! -name rollback.sh ! -name install.log | sort | xargs sha256sum ) > "$DIR/SHA256SUMS"
( cd "$DIR" && sha256sum rollback.sh >> SHA256SUMS )
echo "backup written: $DIR ($(du -sh "$DIR" | cut -f1)); rollback: sh $DIR/rollback.sh [--with-data] [--dry-run]"

# the rollback checks its own inputs before anything changes
sh "$DIR/rollback.sh" --dry-run

echo "installing $VERSION…"
if di update --from "$ART" > "$DIR/install.log" 2>&1; then
    cat "$DIR/install.log"
    echo "installed. Look at it on the real screen before calling it done."
else
    cat "$DIR/install.log" >&2
    echo "di update FAILED — the backup is intact; undo with: sh $DIR/rollback.sh" >&2
    exit 1
fi
