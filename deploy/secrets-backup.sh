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
# Encrypting only to this machine's key makes the bundle useless in the exact
# case it exists for: this disk dying takes the private key with it. Every
# public key listed here (one per line, comments and blanks ignored) can open
# the bundle independently, so a second machine is a second way in — not a
# second copy of the same single point of failure.
RECIPIENTS_FILE="${SECRETS_AGE_RECIPIENTS:-$OUT_DIR/recipients.txt}"
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

# The payload lives one level down: tarring a directory into itself makes tar
# notice it growing mid-read ("file changed as we read it") and abort, which
# under `set -e` means no bundle at all.
payload="$work/payload"
mkdir -p "$payload"
manifest="$payload/MANIFEST.txt"
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
    ssh "$VPS" "cat '$src'" > "$payload/$dst" 2>/dev/null
    chmod 600 "$payload/$dst"
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
tar -czf "$work/bundle.tar.gz" -C "$payload" .

# age encrypts to the ssh key already protected and already backed up, so this
# adds no new secret to lose. gpg --symmetric is the fallback when age is not
# installed: it needs a passphrase, which is one more thing to keep, so it is
# second choice rather than first.
if command -v age >/dev/null 2>&1 && [ -f "$RECIPIENT_KEY" ]; then
  out="$OUT_DIR/secrets-$stamp.age"
  recipients=(-R "$RECIPIENT_KEY")
  names=$(basename "$RECIPIENT_KEY")
  if [ -f "$RECIPIENTS_FILE" ]; then
    recipients+=(-R "$RECIPIENTS_FILE")
    names="$names + $(grep -cvE '^\s*(#|$)' "$RECIPIENTS_FILE") more"
  fi
  age "${recipients[@]}" -o "$out" "$work/bundle.tar.gz"
  method="age → $names"
elif command -v gpg >/dev/null 2>&1; then
  out="$OUT_DIR/secrets-$stamp.gpg"
  if [ -n "${SECRETS_PASSPHRASE_FILE:-}" ] && [ -f "$SECRETS_PASSPHRASE_FILE" ]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "$SECRETS_PASSPHRASE_FILE" -o "$out" "$work/bundle.tar.gz"
  else
    gpg --symmetric --cipher-algo AES256 -o "$out" "$work/bundle.tar.gz"
  fi
  method="gpg symmetric"
else
  say "no age and no gpg — refusing to write secrets in the clear."
  exit 1
fi
chmod 600 "$out"

# Prune by count, newest kept. Encrypted or not, old copies of live secrets are
# still live secrets.
#
# `|| true`: with only .age bundles present the .gpg glob matches nothing, ls
# exits 2, and under `set -euo pipefail` that killed the script AFTER the bundle
# was written — so it succeeded silently and reported failure, which is the
# worst of both. Found the first time this ran for real.
find "$OUT_DIR" -maxdepth 1 -name 'secrets-*' -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | tail -n +$((KEEP + 1)) | cut -d' ' -f2- | xargs -r rm -f || true

say "wrote $out"
say "  $got file(s), $method, $(du -h "$out" | cut -f1)"
say "  keeping $(ls -1 "$OUT_DIR"/secrets-* 2>/dev/null | wc -l) of $KEEP"
