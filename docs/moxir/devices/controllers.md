# MOXIR DMX controllers — what is on hand (owner, 2026-10-16 18:2x)
The owner's words: "2 esp controllers that we tested and also one entec, also one esp but with old firm soft — it is just wifi and artnet, we will update that in future".
Every row: what it is, how di reaches it, its state, the source. TESTED = light seen on a lamp or output measured; OWNER = his word only.

| # | controller | id | how di sends to it | state | source |
|---|---|---|---|---|---|
| 1 | vizzz.di ESP32 node (perfboard, MAX485) | `vizzz.di_BA6FCC`, MAC D4:E9:F4:BA:6F:CC | Art-Net / sACN over Wi-Fi; its own AP 192.168.4.1, or the house Wi-Fi (192.168.88.66, DHCP) | **TESTED**: lamp red 10-15; on the truss 10-16 04:xx (beam · 10 wash · beam); output ceiling 255 measured (desk 255 → ch 17 = 255), fw vizzz.di 2c819ed | ledger N882.3; memory reference_vizzz_node_ba6fcc |
| 2 | vizzz.di ESP32 node (second board) | `vizzz.di_BC5A64`, MAC D4:E9:F4:BC:5A:64 | Art-Net / sACN over Wi-Fi (house Wi-Fi 192.168.88.77, DHCP) | **TESTED**: lamp red 10-15 18:5x (Cameo Thunder Wash, 6Ch2); fw af5453d — not yet the 255-ceiling build | vizzz.di docs/devices/cameo-thunder-wash-100-rgb.md |
| 3 | ENTTEC DMX USB PRO | serial EN293364, firmware 1.44 | USB serial (Linux `/dev/serial/by-id/usb-ENTTEC_DMX_USB_PRO_EN293364-if00-port0`, Windows `COMn`); di's desk driver `enttec` (serverXR/src/lighting/enttec.js), one widget = one universe | **TESTED** on aylmo (Art-Net bridge, 09-xx); not yet run from di's desk at MOXIR | memory reference_enttec_dmx_touchdesigner |
| 4 | ESP node on OLD firmware | not identified (candidate: `vizzz.di_EA8982`, seen 2026-05-07 in ARTNET_ONLY mode on AP 10.0.0.1) | Art-Net over Wi-Fi only — no web console, no di /status bridge | **OWNER**: works as Wi-Fi + Art-Net; update to the current vizzz.di build later (owed) | owner 2026-10-16; vizzz.di HANDOVER 2026-05-07 |

**Rules that hold for any mix of these (di desk, serverXR/src/lighting/desk.js):** one universe = one sender. A second machine sends with a lower sACN priority, or not at all.
The desk's extra outputs give each controller its own driver and universes: a USB widget is one DMX line.
**Owed:** the IP of each node fixed (DHCP may move them); node 2 on the 255-ceiling build; node 4 identified and updated; which controller carries which universe at the venue (the patch recheck, N870).
