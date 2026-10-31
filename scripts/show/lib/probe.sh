# probe.sh: one read-only look at the show machine (di.iiii scripts/show/lib/probe.mjs writes the variables above
# this line: MARKER DIH API PAGES APIS KWIN IFACES WUNIT WCSV). It only reads: sysfs, the kernel log, di's own state routes.
set -u
exp() { case "$1" in "~") printf '%s' "$HOME";; "~/"*) printf '%s' "$HOME/${1#\~/}";; *) printf '%s' "$1";; esac; }
sec() { printf '\n@@%s\n' "$*"; }
MARKER=$(exp "$MARKER"); DIH=$(exp "$DIH")
sec now; date +%s%3N
sec marker; head -c 200 "$MARKER" 2>/dev/null
sec current; readlink -e "$DIH/current" 2>/dev/null
sec release; head -c 50000 "$DIH/current/release.json" 2>/dev/null
sec patches; tail -n 50 "$DIH/current/PATCHES" 2>/dev/null
if [ -n "$API" ]; then
  for p in $PAGES; do sec "page $p"; curl -s -m5 -o /dev/null -w '%{http_code}' "$API/$p"; done
  for pair in $APIS; do
    name=${pair%%=*}; u=${pair#*=}
    body=$(curl -s -m5 -w '\n%{http_code}' "$API/$u" 2>/dev/null | head -c 500000)
    code=${body##*$'\n'}; body=${body%$'\n'*}
    sec "api $name $code"; printf '%s' "$body"
  done
fi
sec temp; for z in /sys/class/thermal/thermal_zone*/temp; do cat "$z" 2>/dev/null; done
sec throttle
c=0; for f in /sys/devices/system/cpu/cpu*/thermal_throttle/core_throttle_count; do [ -r "$f" ] && c=$((c + $(cat "$f"))); done
printf 'core=%s\npackage=%s\n' "$c" "$(cat /sys/devices/system/cpu/cpu0/thermal_throttle/package_throttle_count 2>/dev/null)"
sec posture
printf 'governors=%s\n' "$(cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor 2>/dev/null | sort -u | paste -sd, -)"
printf 'driver=%s\n' "$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_driver 2>/dev/null)"
printf 'no_turbo=%s\n' "$(cat /sys/devices/system/cpu/intel_pstate/no_turbo 2>/dev/null)"
printf 'epb=%s\n' "$(cat /sys/devices/system/cpu/cpu0/power/energy_perf_bias 2>/dev/null)"
printf 'min_khz=%s\nmax_khz=%s\ncur_khz=%s\n' "$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_min_freq 2>/dev/null)" "$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null)" "$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null)"
ac=; for s in /sys/class/power_supply/*; do [ "$(cat "$s/type" 2>/dev/null)" = Mains ] && ac=$(cat "$s/online" 2>/dev/null); done; printf 'ac=%s\n' "$ac"
sec usb
for d in /sys/bus/usb/devices/*; do
  [ -r "$d/idVendor" ] || continue
  b=${d##*/}; case "$b" in usb*) continue;; esac
  drv=; for i in "$d/$b":*; do [ -e "$i/driver" ] && drv="$drv${drv:+,}$(basename "$(readlink "$i/driver")")"; done
  printf '%s\t%s:%s\t%s\t%s\t%s\n' "$b" "$(cat "$d/idVendor")" "$(cat "$d/idProduct")" "$(cat "$d/speed" 2>/dev/null)" "$drv" "$(tr '\t\n' '  ' < "$d/product" 2>/dev/null)"
done
sec kernel
if command -v journalctl >/dev/null 2>&1; then
  n=$(journalctl -k -b -o cat --no-pager -n 5 2>/dev/null | wc -l)
  if [ "$n" -gt 0 ]; then echo readable=1; else echo readable=0; fi
  journalctl -k -o cat --no-pager --since "-${KWIN}s" 2>/dev/null | grep -E '^usb [0-9][0-9.-]*:' | grep -Ei 'error|fail|reset|disconnect|over-current' | sed -E 's/^usb ([0-9][0-9.-]*):.*/\1/' | sort | uniq -c | awk '{print "err " $2 " " $1}'
else echo readable=0; fi
for i in $IFACES; do
  sec "link $i"; p=/sys/class/net/$i
  if [ -d "$p" ]; then printf 'carrier=%s\nchanges=%s\nrx_errors=%s\noperstate=%s\n' "$(cat "$p/carrier" 2>/dev/null)" "$(cat "$p/carrier_changes" 2>/dev/null)" "$(cat "$p/statistics/rx_errors" 2>/dev/null)" "$(cat "$p/operstate" 2>/dev/null)"; else echo missing=1; fi
done
sec journal; if [ -d /var/log/journal ]; then echo persistent=1; else echo persistent=0; fi
if [ -n "$WUNIT" ]; then
  sec watch; printf 'active=%s\n' "$(systemctl --user is-active "$WUNIT" 2>/dev/null)"
  if [ -n "$WCSV" ]; then f=$(exp "$WCSV"); if [ -e "$f" ]; then echo "csv_age_s=$(( $(date +%s) - $(stat -c %Y "$f") ))"; else echo csv_age_s=none; fi; fi
fi
sec midinodes; ls /dev/snd 2>/dev/null | grep -c midi
sec load; cut -d' ' -f1-3 /proc/loadavg
