## A restart of the install points its name home (2026-10-29)
- Measured: the wifi door was open at 05:54; two restarts later the name still answered the wifi address while the door refused.
- wifiDoor.js: pointHome() (one signed PUT 127.0.0.1) and startHome() (5 s after start, one retry after 60 s, unref'd); index.js calls it at start.
- `di wifi --stop` on a closed door points home too; `di wifi --status` names a name that still points at a wifi address.
- Not tested: a real restart on the owner's install; dig must answer 127.0.0.1 within a minute.
