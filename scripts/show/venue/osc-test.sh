#!/bin/bash
# Prove the hub's OSC sender before Eter arrives: hub on loopback, lasers off + DMX off (not --sim: sim only LOGS osc) with --osc-out 127.0.0.1:9001,
# a 5 s UDP listener on 9001 prints the decoded /lava/level; exit 0 on >= 1 message. Sends nothing to the network.
set -u
D=/home/dob/work/show-tools/2026-11-07; W=/home/dob/work/di.iiii/.claude/worktrees/agent-a41e5fd929a6b629c
N=$D/node/node-v22.11.0-linux-x64/bin/node; PORT=4456
main() {
  [ "${*: -1}" = "--dry-run" ] && { echo "would: hub (lasers off, dmx off) :$PORT --osc-out 127.0.0.1:9001, scene rising, listen 5 s on 127.0.0.1:9001"; return 0; }
  cd $W && ln -sfn $D/deps/node_modules node_modules
  python3 -I - <<'PY' & LP=$!
import socket,struct,time,sys
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.bind(('127.0.0.1',9001)); s.settimeout(0.5); n=0; end=time.time()+5
def cstr(b,i):
    j=b.index(b'\0',i); v=b[i:j].decode(); return v,(j+4)&~3
while time.time()<end:
    try: b,_=s.recvfrom(2048)
    except socket.timeout: continue
    a,i=cstr(b,0)
    if a!='/lava/level': continue
    t,i=cstr(b,i); v=struct.unpack('>f',b[i:i+4])[0] if t==',f' else None
    n+=1
    if n<=3: print(f'got {a} {t} {v:.3f}', flush=True)
print(f'== /lava/level messages in 5 s: {n}'); sys.exit(0 if n>=1 else 1)
PY
  sleep 0.3
  $N scripts/show/lava-hub.mjs --port $PORT --dmx off --lasers off --osc-in off --osc-out 127.0.0.1:9001 >/dev/null 2>&1 & HP=$!
  sleep 1; curl -s -m2 -X POST 127.0.0.1:$PORT/api/control -H 'content-type: application/json' -d '{"scene":"rising"}' >/dev/null
  wait $LP; rc=$?; kill -TERM $HP 2>/dev/null; wait $HP 2>/dev/null; rm -f $W/node_modules
  echo "== exit $rc"; return $rc
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
