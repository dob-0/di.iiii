# LaserCube network modes and what di must do (ledger N646)
Date 2026-10-14. Research only; nothing run against a cube. Clones were read-only, in the scratchpad.

Sources (short names):
- MAN = Wickedlasers/laserdockdocs @ cd4f829, docs/docs/guides/ultra-mk2-pro-manual/index.html (manual v1.5, written for firmware 2.0/2.1). Section names in quotes.
- QS = same repo, docs/start/wifi/index.html (WiFi-model quick start, steps 2-3).
- TD = NairoDorian/Laser-Cube-TouchDesigner README.md lines 14-28.
- SPEC = nannou-org/lasercube SPECIFICATION.md.
- CORE = Wickedlasers/libLaserdockCore: ldCore/src/Hardware/ldNetworkHardwareManager.cpp, ldDeviceBufferConfigDelegator.{h,cpp}, 3rdparty/laserdocklib/src/LaserDockNetworkDevice.cpp.

IMPORTANT version caveat: MAN describes firmware 2.x. Our cubes report fw 1.17 (from the 0x77 info). The WiFi-server defaults differ between sources (see matrix). Which numbering/era 1.17 belongs to is NOT stated anywhere I read; treat every default as "verify on the cube's own screen" (MAN: IP is shown bottom-right of the LCD; Settings -> Network).

## 1. Matrix

| Mode | Set it | Default address / credentials | What the laptop must do | Internet kept | Cubes | Known limits |
|---|---|---|---|---|---|---|
| Ethernet client (LAN Client) | Cube: Settings -> Connection -> LAN Client; Settings -> Network -> LAN Client: IP mode Auto or Static IP/mask/gateway (MAN "Connection Settings", "Network Settings") | DHCP from router/switch; with no DHCP, cube self-assigns 169.254.x.x after ~20 s (APIPA) (MAN "APIPA mode explained") | Be on the same L2 network. APIPA case: MAN says turn laptop WiFi off, start LaserOS after cubes have addresses, WiFi back on after | Yes if a router with DHCP is on the switch; in APIPA case WiFi must be off at first | Many (maker's recommended mode for several cubes, MAN "A Show for Several Cubes") | Needs a wire. 100 Mbps port (MAN specs). Our current setup (aylmo 10.42.0.1 DHCP) is this |
| Ethernet server (LAN Server) | Settings -> Connection -> LAN Server; IP/mask editable | Cube hands the laptop an address. 192.168.1.1 in TD (older cubes); MAN does not state a LAN-server default | One laptop cable straight to the cube (USB-C to Ethernet adapter is in the box) | WiFi stays on: yes | ONE (MAN "LAN Server Mode": "single device") | Adapter needed on a laptop with no port. Several server cubes need distinct subnets (TD: 192.168.2.1, .3.1, ...) |
| WiFi server (cube's own AP) | Settings -> Connection -> WiFi server; Settings -> Network -> WiFi Server: SSID, password, channel (Auto), 20/40 MHz, IP, mask; WiFi Scan button | SSID "LaserCube", password "Laser2020", 2.4 GHz only (MAN "Connection Settings"; QS step 3). IP: 192.168.4.1 on Ultra MK2 (MAN "playlist web server", "MadMapper"); 192.168.1.1 on the older WiFi cube (QS step 2, TD). SSID suffix per cube: NOT in any source | Join the cube's SSID. OS will warn "no internet": stay connected (QS) | NO on a single radio: the laptop's WiFi is the cube's AP, so the internet is gone unless the laptop has a second link (phone USB tether, Ethernet, 2nd WiFi dongle). Inferred, not in MAN | ONE per laptop link (MAN: "single cube LaserOS operation"). Two server cubes = two APs; laptop radio can join only one. Inferred | Antenna must be fitted. MAN: congested 2.4 GHz gives projection break-up; its advice is wired. Needs line of sight/no noisy band |
| WiFi client (cube joins a router) | Settings -> Connection -> WiFi Client; Network -> WiFi Client: SSID, password, IP mode Auto/Static. QS says join via the router's WPS button (older cube) | DHCP from the router | Same WiFi network (or wired to the same router) as the cube | Yes, router provides it | Many in principle; no limit stated | MAN: "Performance may vary depending on router quality, congestion and existing traffic". Needs a router the laptop can share. 2.4 GHz only |
| Mixed (one server cube, others clients) | TD line 28: one cube in server mode, others in client mode connect to the server cube | Server cube's subnet (192.168.1.x / 4.x) | Join the server cube's network | Same as WiFi server (no) | Several | Only from TD, from the 2022 script era; MAN says nothing. Unverified on Ultra MK2. CORE has a "server + client(s)" buffer profile, so Wicked's host does support it |
| USB | MAN: the Ultra MK2/Pro USB-A port is for MIDI controllers only (APC40/APC mini) and does NOT work in LaserOS control mode (MAN "USB MIDI Settings", line ~2455). USB data path exists only on the original USB LaserCube / first-gen Ultra (libusbK, MAN troubleshooting) | n/a | n/a | n/a | n/a | USB does NOT take over the network on the Ultra MK2, and cannot carry our data stream. USB-C to Ethernet adapter in the box is an adapter for the laptop, not a cube mode |
| Cube Link | MAN "Cube Link Mode" | own low-rate radio network | none | n/a | master + slaves | Only synchronises SD-card playback (Playlist/Visualizer/Show). Not for streaming from di |

Changing mode: fw before 2.1 asks for a reboot; fw 2.1+ changes without one (MAN). Web page: MAN "Web Admin Page" (legacy, LaserOS control mode): open the IP shown on the LCD, user `LaserCubeUser`, password `Laser2020`; sections Home, Config (network and mode settings), Update (remote firmware). TD says default page http://192.168.1.1/ password `Laser2020` (older cube). Firmware update for Ultra MK2: SD card preferred, or that web Update page; LaserOS app does not update it (MAN "Firmware Update"). Multi-cube advice from the maker: Ethernet + LAN client through a switch (MAN "A Show for Several Cubes"; "Connection Settings").

## 2. Implications for di

### Discovery (answers "why did our 0x77 broadcast get no answer")
The maker's host does NOT discover with 0x77 on 45457 (CORE LaserDockNetworkDevice.cpp lines ~207-241):
- message: ALIVE, one byte `0x27` (LASERCUBE_GET_ALIVE, line 17);
- port: ALIVE_PORT 45456 (SPEC also lists 45456 as "simple pings to check which lasers are on the network");
- address: the subnet directed broadcast of EVERY interface that is up, running and not point-to-point (e.g. 10.42.0.255), not 255.255.255.255;
- the host binds its own receive socket to 0.0.0.0:45456 and the cube replies to that port; a valid reply is exactly 2 bytes `[0x27, 0x00]`; the sender IP is the cube IP;
- it repeats the ping periodically and re-scans interfaces each time (so a WiFi joined later is picked up);
- then it unicasts the 0x77 info request to the found IP (45457), and does an authentication step (SecurityResponseReceived) per device.
Evidence this fits our observation: SPEC's suggested "broadcast GET_FULL_INFO (0x77)" is the unverified part; our test (0x77 broadcast: no answer, unicast: answer) matches CMD port not handling broadcast/ALIVE being the discovery door. INFERRED, not yet tested: a 0x27 to 45456 on 10.42.0.255 gets [0x27,0x00]. Test it first (one packet, read-only).

Find cubes per mode:
- Ethernet client: send 0x27 to <iface>.broadcast on 45456; also try 255.255.255.255. Subnet = whatever the DHCP gave (10.42.0.0/24 here). APIPA case: cube is 169.254.x.x, laptop must itself have a 169.254 address on that interface; then the directed broadcast is 169.254.255.255.
- Ethernet/WiFi server: the cube's net is 192.168.4.0/24 (Ultra MK2) or 192.168.1.0/24 (older); broadcast to that iface; also unicast probe 192.168.4.1 and 192.168.1.1 once the laptop is on that net (cheap, no broadcast needed).
- WiFi client: same as Ethernet client but on the WiFi interface; the WiFi interface can be a different one than the wired one, so loop over ALL up interfaces like Wicked does. Never bind to one interface or one subnet.
- Several server cubes on separate subnets (TD): a direct unicast list (manual IPs) is needed; broadcast cannot cross.
- Always offer "add by IP" as a fallback, and keep a remembered list (IP + serial) so a cube that stops answering broadcast on a noisy WiFi is still reachable.
- Windows caveat (inferred, standard WinSock behaviour): directed broadcast from a socket on a multi-NIC laptop only goes out on the interface chosen by route; send once per interface, binding to each interface address.

### Stream tuning (what Wicked's host does, CORE ldDeviceBufferConfigDelegator.h; desktop/else branch, fields = samples_per_packet, remote_buffer_cutoff, wait_connect_sleep_ms, wait_buffer_sleep_ms, sleep_after_packet_send_ms, max_samples_per_udp_xfer, max_udp_packets_per_xfer)
| Connection | samples/packet | buffer cutoff (samples) | wait buffer ms | sleep after send ms | max samples/xfer | max packets/xfer |
|---|---|---|---|---|---|---|
| USB | 768 | 1024 | 6 | 0 | 0 | 0 |
| WiFi server (alone) | 600 | 2000 | 4 | 10 | 140 | 20 |
| WiFi server + client(s) | 600 | 2500 | 5 | 10 | 140 | 10 |
| WiFi client | 700 | 1800 | 6 | 4 | 80 | 20 |
| 2x WiFi client | 700 | 1500 | 6 | 8 | 140 | 10 |
(The LAN rows are in the same header; I printed only the WiFi ones. Android/iOS profiles use larger cutoffs, 2400-4000, i.e. more buffer on phones. Read the LAN rows before copying numbers.) Per-type profile chosen from the FIRST cube's connection type only ("TODO: for now only use the first device's connection type", cpp ~line 58). The connection type comes from the cube's info reply: SPEC says 2 = Ethernet, 3 = WiFi in the info response (SPEC line ~69-70); di can read the type itself and pick the profile per cube.
Rules in SPEC: buffer ~6000 samples; stop sending when free < ~5000 left to fill (i.e. keep it fed, wait when full); send critical commands twice; keep DATA packets under 1500 bytes, about 140 points per DATA message; enable 0x78 so data packets get an 0xa9 buffer-free reply; monitor free space to spot loss.
Meaning for di (inferred from these numbers, to be measured): on WiFi use 140 points/datagram (not bigger; Wicked caps UDP transfers at 80-140 per xfer on WiFi), keep the cube buffer FULLER than on Ethernet (more latency headroom; Wicked's WiFi cutoffs are 1500-2500 vs LAN lower), and send small packets with a short sleep, not bursts. Latency cost: at 30 kpps, 2000 samples buffered = 67 ms; 2500 = 83 ms.
Loss tooling on the cube: Status Info "PKT Loss Events" counter, resettable (MAN troubleshooting, line ~4160). Use it as the loss metric. WiFi Scan on the cube picks the quietest channel (server mode only).

### Do the 200 ms frame-timeout and 3 s link-lost guards risk false trips on WiFi?
I did not read di's guard code in this task; the following is from the numbers only. 3 s link-lost: safe against jitter, WiFi stalls of that size mean a real outage; keep it. 200 ms frame-timeout: at 83 ms of buffered audio in a typical WiFi profile, a 200 ms stall means the buffer ran dry and the cube already repeats/blanks, so 200 ms is a genuine fault there too, BUT a power-save/roam stall of 100-300 ms on a laptop WiFi radio is common (inferred, general WiFi behaviour) and would trip it repeatedly, each trip going dark. Recommendation: do not loosen the safety guard blindly. Measure first (section 3); if the jitter p99.9 sits near 150 ms, either raise the buffer target (so the cube keeps drawing through the stall) or make the frame-timeout per-link-type with the number taken from the measurement, and state it. Ask the owner before changing a safety guard.

## 3. Measurement plan (real cube on WiFi, 5 minutes per mode)
Setup: cube in WiFi server (or client), laptop 1-3 m away, same room, then again 10 m through a wall. Cube at LaserOS control mode. Record SSID, channel (WiFi Scan), RSSI from the laptop (`iw dev <if> link` on Linux, `netsh wlan show interfaces` on Windows), fw version.
1. Baseline ping, 300 s, 10 pps: `ping -i 0.1 -c 3000 <cubeIP>` (Linux). Record loss %, rtt min/avg/max/mdev, and p99/p99.9 from the raw list. Windows has no sub-second interval; use a small script or di's own 0x77 query at 10 Hz and log rtt.
2. Stream test: stream a constant 30 kpps pattern for 300 s using the profile under test. Record per second: buffer free from the 0xa9 replies (min, max, stddev), number of times free went below a floor, number of 0xa9 replies missing (our packet loss proxy), cube "PKT Loss Events" before/after (reset first), number of frame-timeout and link-lost guard trips.
3. Repeat A/B with the Ethernet client at the same pattern as the control.
4. Optional: with a phone downloading on the same channel for 60 s, to see interference.
Pass/fail lines (mine unless a source is named; a threshold without a source is a proposal for the owner to confirm, not a standard):
- Ping loss <= 1 % over 300 s (proposal).
- rtt p99.9 < 100 ms (so a 200 ms guard has 2x margin); any single gap > 200 ms = FAIL for that run.
- Buffer: free space never reaches empty (cube buffer ~6000 samples, SPEC); no refill dips below ~1 frame of data; zero underruns.
- Cube PKT Loss Events: climbs by <= a handful per 5 min (maker gives no number; MAN only says watch whether it climbs); if it climbs steadily the WiFi is not good enough, use wire (MAN).
- Zero spurious guard trips (200 ms or 3 s) over 300 s. A trip = FAIL, not a retune.
- Latency, shown to the owner: buffer target in ms = samples / 30000.

## 4. Tonight (PONYO, Windows, no Ethernet port, two cubes)
Order of reliability, from the sources:
1. Best (maker's own advice, MAN "Connection Settings", "A Show for Several Cubes", "Troubleshooting"): the USB-C to Ethernet adapter that comes in each box (MAN: "If the computer has no network port, use the USB-C to Ethernet adapter") + the D-Link switch, cubes in LAN client mode as today, and ICS/DHCP on the laptop (Windows "Internet Connection Sharing" on the adapter gives 192.168.137.1 and DHCP) or APIPA (169.254) with WiFi off first (MAN). Two cubes, one switch, WiFi left free for internet after APIPA starts (MAN step 6 "turn WiFi back on"). If a third-party USB-Ethernet or USB-C dock is at hand it does the same. This is the quickest reliable route; the adapter is already in the cube boxes.
2. If no adapter at all: put both cubes in WiFi client mode on the venue's router (cube joins router, laptop joins the same router, internet kept). Set the cubes up from the LCD (Settings -> Connection -> WiFi Client, SSID and password; fw 1.17 might use WPS instead, QS). Performance depends on the router and congestion (MAN), so run the 5-minute check (section 3) before show time, and have step 1 ready.
3. Last resort: cube 1 WiFi server, laptop joins "LaserCube"/Laser2020; only one cube at a time and no internet (needs a second link). Not for two cubes.
Before show: every WiFi cube needs the antenna fitted; verify the mode on each cube's LCD and write down its IP; add the IPs by hand in di (Find cubes by broadcast may not answer, see section 2).
Not verified: that di's Windows build can send the directed broadcast, and the discovery change above is not yet built.

## 5. Open items (owed)
- Test the 0x27 / 45456 / directed-broadcast discovery on the real cubes (one packet; expected reply [0x27,0x00]).
- Read the cubes' own fw 1.17 screens for LAN/WiFi defaults; the manual covers fw 2.x only.
- Run section 3 on a real cube on WiFi before relying on it; thresholds above need the owner's confirmation.
- Decide the guard handling per link type after the measurement (owner's word).
- Sterile: yes (clones only in the scratchpad, nothing running).
