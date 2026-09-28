# Live AI engine

The image model behind the map desk's **AI restyle** camera effect: a camera
frame goes in, the same room comes back restyled by a prompt, many times a
second. It runs on the machine that draws the wall, with no internet — the
same local-only shape as the NDI® receiver and the local chat model.

```
camera → page (src/map/liveAiRestyle.js)
       → serverXR /liveai (serverXR/src/liveAi/relay.js, local installs only)
       → this engine on ws://127.0.0.1:7861/ws
       → back the same way, drawn on the surface
```

## Run it

**Real model** (NVIDIA GPU, Python 3.10–3.12):

```bash
python -m venv .venv-liveai
.venv-liveai/Scripts/pip install torch --index-url https://download.pytorch.org/whl/cu128
.venv-liveai/Scripts/pip install -r scripts/liveai/requirements.txt
.venv-liveai/Scripts/python scripts/liveai/engine.py
```

The first start downloads SD-Turbo (~2.6 GB) and TAESD into the Hugging Face
cache; after that it starts offline. RTX 50-series cards need the `cu128`
(or newer) PyTorch build shown above.

**No model** — proves the whole loop, returns every frame unchanged:

```bash
node scripts/liveai/mock-engine.mjs
```

serverXR finds the engine at `ws://127.0.0.1:7861/ws`; set `LIVEAI_URL` to
point it elsewhere. The relay answers 404 on a hosted tier (no `DI_LOCAL=1`,
`NODE_ENV=production`) and 403 to other machines unless
`DI_ALLOW_LAN_DEVICES=1` (`di up --lan`).

## Protocol

One WebSocket per surface. The relay passes every message through untouched.

| direction | message | meaning |
|---|---|---|
| page → engine | text `{"type":"params","prompt":"…","strength":0.5}` | sent on connect and whenever the desk changes a knob |
| page → engine | binary JPEG | one camera frame, ~512 wide |
| engine → page | binary JPEG | the restyled frame |
| engine → page | text `{"type":"status","state":"ready","detail":"…"}` | engine loaded / what it is running |
| relay → page | text `{"type":"status","state":"no-engine","detail":"…"}` | nothing listening at `LIVEAI_URL`; the surface shows `detail` |

The page keeps **one frame in flight**: it sends the next frame only when the
previous answer arrives (or after 2 s). Stale frames never queue up, so the
wall lags the room by one model step, not by a backlog.
