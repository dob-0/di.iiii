# checkpoint.sh: snapshot the running show state on the show machine before a change (owner's rule 2026-10-17).
# di.iiii scripts/show/checkpoint.mjs writes the variables above this line: TS DIH API DATA STATES PORT CACHE MARKER VENUE.
# Exit 0 = whole · 3 = partial (data and version kept, a live state unreadable, named on stderr) · 1 = failed · 2 = refused.
# Ported from di-atlas a0ffd48 (checkpoint.sh). Lock files (.token) never enter the copy: tar excludes them.
set -u
exp() { case "$1" in "~") printf '%s' "$HOME";; "~/"*) printf '%s' "$HOME/${1#\~/}";; *) printf '%s' "$1";; esac; }
DIH=$(exp "$DIH"); CACHE=$(exp "$CACHE"); CK="$CACHE/$TS"
M=$(head -c 200 "$(exp "$MARKER")" 2>/dev/null | tr -d '[:space:]')
if [ -n "$M" ] && [ "$M" != "$VENUE" ]; then echo "refused: this machine is marked \"$M\", the profile is \"$VENUE\"" >&2; exit 2; fi
mkdir -p "$CK" || { echo "cannot make $CK" >&2; exit 1; }
printf '%s\n' "$M" > "$CK/marker.txt"
# shellcheck disable=SC2086 # DATA is a list of plain folder names, checked by the profile schema
if ! tar czf "$CK/data.tgz" --exclude=.token -C "$DIH/data" $DATA 2>"$CK/tar.err"; then
  echo "data copy failed: $(head -c 300 "$CK/tar.err")" >&2; exit 1
fi
rm -f "$CK/tar.err"
readlink -e "$DIH/current" > "$CK/version.txt" 2>/dev/null
[ -s "$CK/version.txt" ] || { echo "no running version at $DIH/current" >&2; exit 1; }
for f in release.json PATCHES; do if [ -e "$DIH/current/$f" ]; then cp "$DIH/current/$f" "$CK/$f"; fi; done
partial=0
if [ -z "$API" ]; then echo "no api in the profile: live states not read" >&2; partial=1; fi
for u in $STATES; do
  [ -n "$API" ] || break
  n=$(printf '%s' "$u" | tr '/' '-')
  if curl -fsS -m5 "$API/$u" > "$CK/$n.json" 2>"$CK/$n.err"; then rm -f "$CK/$n.err"
  else echo "state $u unreadable: $(head -c 200 "$CK/$n.err")" >&2; rm -f "$CK/$n.json" "$CK/$n.err"; partial=1; fi
done
if [ -n "$PORT" ]; then
  pid=$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
  if [ -n "$pid" ]; then ps -o pid=,unit=,user=,args= -p "$pid" > "$CK/server.txt" 2>&1; fi
fi
nmcli -t -f NAME,DEVICE,STATE con show --active > "$CK/network.txt" 2>/dev/null || true
ip -br addr > "$CK/ip.txt" 2>/dev/null || true
tar czf - -C "$CACHE" "$TS" || { echo "could not stream the checkpoint" >&2; exit 1; }
exit $(( partial ? 3 : 0 ))
