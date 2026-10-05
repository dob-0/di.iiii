#!/usr/bin/env bash
#
# Pull the production secrets off the Mac (production since 2026-09-27; the
# VPS is offline), encrypt them, keep the encrypted bundle in two places:
# this machine and a second one (asuz).
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
# Source: SOURCE_HOST (default di-mac, user non, who can read the tier files
# under /usr/local/di-*/etc). The old name VPS_HOST is still honoured.
# Second copy: SECOND_HOST (default asuz, then asuz-ts) into SECOND_DIR
# (default ~/di-backups/secrets); only the encrypted file travels, and both
# sides are compared by sha256. SECOND_HOST=none turns the second copy off.
#
#   ./secrets-backup.sh          write today's bundle
#   ./secrets-backup.sh --check  say what would be captured, encrypt nothing
#
# To read one back:
#   age -d -i ~/.ssh/id_ed25519 secrets-<date>.age | tar xz    (age)
#   gpg -d secrets-<date>.gpg | tar xz                          (gpg fallback)
set -euo pipefail

VPS="${SOURCE_HOST:-${VPS_HOST:-di-mac}}"
SECOND_HOSTS="${SECOND_HOST:-asuz asuz-ts}"
SECOND_DIR="${SECOND_DIR:-di-backups/secrets}"   # relative to the second host's home
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

# path-on-source : name-in-bundle. The name records where it belongs, because a
# restore happens under pressure. Names of the three .env members are kept
# from the VPS era: di-atlas tools/standby-deploy.sh reads them from the newest
# bundle (`tar xzOf - opt-di.iiii--.env`). On the Mac the compose files and
# Caddy do not exist (the repo carries compose; nginx/tunnel are the Mac's).
FILES=(
  "/usr/local/di-standby/etc/source.env:opt-di.iiii--.env"
  "/usr/local/di-dev/etc/source.env:opt-di.iiii-dev--.env"
  "/usr/local/di-bo/etc/bot.env:opt-di-bo--.env"
  "/usr/local/di-standby/etc/tunnel.yml:mac-di-standby--tunnel.yml"
  "/usr/local/di-standby/etc/tunnel-cde8afd8-c97d-4052-99d6-737465ad2c8e.json:mac-di-standby--tunnel-credentials.json"
  "/usr/local/di-standby/etc/nginx.conf:mac-di-standby--nginx.conf"
)

say() { printf '%s\n' "$*" >&2; }
fail() { say "FAILED: $*"; exit 1; }

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
  echo "taken from: $VPS (production Mac)"
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
  fail "nothing captured from $VPS — unreachable, or no readable file at the listed paths"
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
  fail "no age and no gpg — refusing to write secrets in the clear"
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

# Second place. Only the encrypted file leaves this machine. Verified by
# sha256 on both sides; any failure is loud and non-zero (the local bundle
# stays, the exit code says the second copy is missing).
second=""
if [ "$SECOND_HOSTS" != "none" ]; then
  want=$(sha256sum "$out" | cut -d' ' -f1)
  for h in $SECOND_HOSTS; do
    if ssh -o BatchMode=yes -o ConnectTimeout=10 "$h" \
         "umask 077; mkdir -p '$SECOND_DIR' && chmod 700 '$SECOND_DIR'" 2>/dev/null \
       && cat "$out" | ssh -o BatchMode=yes "$h" \
         "umask 077; cat > '$SECOND_DIR/$(basename "$out").part' && mv '$SECOND_DIR/$(basename "$out").part' '$SECOND_DIR/$(basename "$out")'" 2>/dev/null; then
      have=$(ssh -o BatchMode=yes "$h" "sha256sum '$SECOND_DIR/$(basename "$out")'" 2>/dev/null | cut -d' ' -f1)
      [ "$have" = "$want" ] || fail "second copy on $h differs (local $want, remote ${have:-none})"
      ssh -o BatchMode=yes "$h" "cd '$SECOND_DIR' && ls -1t secrets-* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f" 2>/dev/null || true
      second="$h:$SECOND_DIR sha256 ${want:0:12}"
      break
    fi
  done
  [ -n "$second" ] || fail "second copy not written — none of [$SECOND_HOSTS] reachable by key (Tailscale SSH check? LAN?); local bundle $out is kept"
fi

say "wrote $out"
say "  $got file(s), $method, $(du -h "$out" | cut -f1)"
[ -z "$second" ] || say "  second copy: $second (verified)"
say "  keeping $(ls -1 "$OUT_DIR"/secrets-* 2>/dev/null | wc -l) of $KEEP"
