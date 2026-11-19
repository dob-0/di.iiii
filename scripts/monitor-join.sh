#!/bin/bash
# Join a machine to the di.iiii Monitor: sign in once (a code shows here, you type it in the browser),
# then it reports every 30 s. Needs di (a dev build, 0.4.4 or newer) on that machine.
# Usage: scripts/monitor-join.sh <ssh-host>      Undo: ssh <host> 'di monitor install-timer --remove'
set -e

main() {
  local host="${1:-}"
  if [[ -z "$host" || "$host" == -* ]]; then echo "usage: monitor-join.sh <ssh-host> [--dry-run]" >&2; return 2; fi
  if [[ "${*: -1}" == "--dry-run" ]]; then   # a window script first shows what it would do, and changes nothing
    echo "would: sign $host in to dev.diiii.xyz (code typed in the browser), send one report, start a 30 s report timer"
    return 0
  fi
  ssh -t -- "$host" 'export PATH=$HOME/.di/bin:$PATH; di whoami >/dev/null 2>&1 || di login --tier dev; di monitor report --once && di monitor install-timer && echo "this machine now reports to the Monitor"'
}

[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
