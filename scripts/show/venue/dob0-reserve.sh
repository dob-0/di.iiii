#!/bin/bash
# Pin the show devices to their current addresses on dob-0 (DHCP static leases). No device changes address now.
# Login by key (no password): ~/.ssh/dob0_studio_mac_rsa (KEY-LOGIN-OK 02:39, window 023401).
# Undo: ssh -i ~/.ssh/dob0_studio_mac_rsa -o IdentitiesOnly=yes root@10.0.0.1 \
#   'for n in cube-aa5c cube-ab30 cube-abc8 cube-ab50 ponyo studio-mac; do i=$(uci show dhcp | sed -n "s/^dhcp\.\(@host\[[0-9]*\]\|[a-z0-9_]*\)\.name=.$n.$/\1/p"); [ -n "$i" ] && uci delete dhcp.$i; done; uci commit dhcp; /etc/init.d/dnsmasq reload'
set -u
SSH=(ssh -i "$HOME/.ssh/dob0_studio_mac_rsa" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 root@10.0.0.1)
HOSTS="cube-aa5c 8c:bf:ea:06:aa:5c 10.0.0.127
cube-ab30 8c:bf:ea:06:ab:30 10.0.0.132
cube-abc8 8c:bf:ea:06:ab:c8 10.0.0.134
cube-ab50 8c:bf:ea:06:ab:50 10.0.0.164
ponyo a0:ce:c8:9b:d6:8d 10.0.0.216
studio-mac dc:32:62:24:eb:e1 10.0.0.142"
main() {
  if [ "${*: -1}" = "--dry-run" ]; then echo "would add up to 6 static leases on dob-0 (skip a MAC already pinned):"; echo "$HOSTS"; return 0; fi
  CMDS="set -e; echo '== before:' \$(uci show dhcp | grep -c '=host') 'static hosts';"
  while read -r n m a; do
    CMDS="$CMDS if uci show dhcp | grep -qi \"mac='$m'\"; then echo 'already pinned $n'; else s=\$(uci add dhcp host); uci set dhcp.\$s.name='$n'; uci set dhcp.\$s.mac='$m'; uci set dhcp.\$s.ip='$a'; echo 'pinned $n $a'; fi;"
  done <<< "$HOSTS"
  CMDS="$CMDS uci commit dhcp; /etc/init.d/dnsmasq reload; echo '== read-back:'; uci show dhcp | grep -E '@host|=host' | grep -E '\.(name|mac|ip)='"
  "${SSH[@]}" "$CMDS"; rc=$?; echo "== exit $rc"; return $rc
}
[[ ${BASH_SOURCE[0]} == "$0" ]] && main "$@"
