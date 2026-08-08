#!/usr/bin/env bash
#
# Pull the production secrets off the VPS, encrypt them, keep them with the
# backups that already exist.
#
# Why this exists: the nightly backup covers the database, the spaces and the
# uploads, in four places. It does not cover a single .env. So a full VPS loss
# returns every byte and still cannot start the platform — and worse, restoring
# with a fresh AUTH_SESSION_SECRET silently and permanently destroys every
# stored Google Drive token, because they are encrypted with a key derived from
# it. The data was never the gap. This is.
#
# Plaintext never touches the disk: the bundle is assembled under /dev/shm
# (tmpfs, RAM only) and removed on every exit path, including a failure.
#
#   ./secrets-backup.sh          write today's bundle
#   ./secrets-backup.sh --check  say what would be captured, encrypt nothing
#
# To read one back:
#   age -d -i ~/.ssh/id_ed25519 secrets-<date>.age | tar xz    (age)
#   gpg -d secrets-<date>.gpg | tar xz                          (gpg fallback)
set -euo pipefail

VPS="${VPS_HOST:-dii-vps}"
OUT_DIR="${SECRETS_OUT:-$HOME/di-backups/secrets}"
KEEP="${SECRETS_KEEP:-14}"
RECIPIENT_KEY="${SECRETS_AGE_RECIPIENT:-$HOME/.ssh/id_ed25519.pub}"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

# path-on-vps : name-in-bundle. The name records where it belongs, because a
# restore happens under pressure and "which .env was this" is not a question
# anyone should be answering then.
FILES=(
  "/opt/di.iiii/.env:opt-di.iiii--.env"
  "/opt/di.iiii-staging/.env:opt-di.iiii-staging--.env"
  "/opt/di-bo/.env:opt-di-bo--.env"
  "/opt/di.iiii/docker-compose.yml:opt-di.iiii--docker-compose.yml"
  "/opt/di.iiii-staging/docker-compose.staging.yml:opt-di.iiii-staging--docker-compose.staging.yml"
  "/opt/di.iiii/Caddyfile:opt-di.iiii--Caddyfile"
)

say() { printf '%s\n' "$*" >&2; }

# tmpfs, not /tmp — /tmp is a real filesystem here and a crash would leave
# plaintext secrets in it until someone noticed.
work=$(mktemp -d /dev/shm/secrets-backup.XXXXXX)
cleanup() { rm -rf "$work"; }
trap cleanup EXIT INT TERM

manifest="$work/MANIFEST.txt"
{
  echo "di.iiii secrets bundle"
  echo "taken from: $VPS"
  echo
  echo "Each file's name is its path with / written as -. To restore, put it"
  echo "back where the name says, chmod 600, and restart the unit that reads it."
  echo
  echo "Order matters on a rebuild: .env first, then docker compose up, then"
  echo "verify Drive tokens still decrypt — if AUTH_SESSION_SECRET differs from"
  echo "the one in this bundle, they never will, and the failure is silent."
  echo
} > "$manifest"

got=0
for entry in "${FILES[@]}"; do
  src="${entry%%:*}"; dst="${entry##*:}"
  if ssh "$VPS" "test -f '$src'" 2>/dev/null; then
    ssh "$VPS" "cat '$src'" > "$work/$dst" 2>/dev/null
    chmod 600 "$work/$dst"
    printf '  %-52s <- %s\n' "$dst" "$src" >> "$manifest"
    got=$((got + 1))
  else
    printf '  %-52s <- %s  (ABSENT)\n' "$dst" "$src" >> "$manifest"
  fi
done

if [ "$got" -eq 0 ]; then
  say "nothing captured — is $VPS reachable?"
  exit 1
fi

if [ "$CHECK" = 1 ]; then
  cat "$manifest"
  say "--check: captured $got file(s), encrypted nothing, wrote nothing."
  exit 0
fi

mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
stamp=$(ssh "$VPS" date -u +%Y-%m-%d 2>/dev/null || echo unknown)
# Build the archive OUTSIDE the directory being archived. Writing it into
# $work made tar notice the directory grow underneath it and exit 1 with
# "file changed as we read it" — and under `set -e` that aborted the script
# before it encrypted anything, so the run ended having written no bundle at
# all while looking like it had merely warned. --exclude does not help: it
# keeps the file out of the archive, not out of the directory tar is reading.
bundle=$(mktemp /dev/shm/secrets-bundle.XXXXXX.tar.gz)
cleanup() { rm -rf "$work" "$bundle"; }
tar -czf "$bundle" -C "$work" .

# age encrypts to the ssh key already protected and already backed up, so this
# adds no new secret to lose. gpg --symmetric is the fallback when age is not
# installed: it needs a passphrase, which is one more thing to keep, so it is
# second choice rather than first.
if command -v age >/dev/null 2>&1 && [ -f "$RECIPIENT_KEY" ]; then
  out="$OUT_DIR/secrets-$stamp.age"
  age -R "$RECIPIENT_KEY" -o "$out" "$bundle"
  method="age → $(basename "$RECIPIENT_KEY")"
elif command -v gpg >/dev/null 2>&1; then
  out="$OUT_DIR/secrets-$stamp.gpg"
  if [ -n "${SECRETS_PASSPHRASE_FILE:-}" ] && [ -f "$SECRETS_PASSPHRASE_FILE" ]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "$SECRETS_PASSPHRASE_FILE" -o "$out" "$bundle"
  else
    gpg --symmetric --cipher-algo AES256 -o "$out" "$bundle"
  fi
  method="gpg symmetric"
else
  say "no age and no gpg — refusing to write secrets in the clear."
  exit 1
fi
chmod 600 "$out"

# Prune by count, newest kept. Encrypted or not, old copies of live secrets are
# still live secrets.
ls -1t "$OUT_DIR"/secrets-*.age "$OUT_DIR"/secrets-*.gpg 2>/dev/null \
  | tail -n +$((KEEP + 1)) | xargs -r rm -f

say "wrote $out"
say "  $got file(s), $method, $(du -h "$out" | cut -f1)"
say "  keeping $(ls -1 "$OUT_DIR"/secrets-* 2>/dev/null | wc -l) of $KEEP"
