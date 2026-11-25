## Monitor: the map and the Spaces box are the same on every machine (2026-11-24)

Owner 11-24: "why agent map not the same what in main-desk check everything what is in admin work right and synced right".
Measured before: studio-laptop map 58 nodes / 6 spaces, main-desk 85 nodes / 36 spaces.
Change: report carries a spaces panel (own server, di command's address); hub lends other machines' spaces + tiers;
map = one node per space name (sorted, max 80), equal agent share per machine (sorted by name, max 40).
Tests: monitorHub, monitorStore, monitorReport, monitorAccount, preferences (412 passed).
