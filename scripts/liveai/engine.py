"""Live-AI engine: camera frames in, restyled frames out, on this machine.

Speaks the engine protocol in README.md over a WebSocket on 127.0.0.1 only;
serverXR relays pages to it (serverXR/src/liveAi/relay.js).

The model is SD-Turbo in img2img mode: one or two denoising steps per frame,
guidance off, with TAESD (a tiny VAE) decoding the result — the combination
that makes a frame cheap enough to call "live". `strength` is how far the
picture may drift from the camera: 0.05 keeps the room, 1.0 keeps only the
prompt.

    python scripts/liveai/engine.py [--port 7861] [--model stabilityai/sd-turbo]

The first start downloads the model (~2.6 GB) into the Hugging Face cache;
every start after that works with no internet.
"""
import argparse
import asyncio
import io
import json
import math
import time

import torch
from PIL import Image
from diffusers import AutoPipelineForImage2Image, AutoencoderTiny
import websockets

parser = argparse.ArgumentParser()
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=7861)
parser.add_argument("--model", default="stabilityai/sd-turbo")
parser.add_argument("--vae", default="madebyollin/taesd")
parser.add_argument("--steps", type=int, default=2)
args = parser.parse_args()

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32

print(f"[liveai] loading {args.model} on {device}…", flush=True)
pipe = AutoPipelineForImage2Image.from_pretrained(args.model, torch_dtype=dtype, variant="fp16" if device == "cuda" else None)
pipe.vae = AutoencoderTiny.from_pretrained(args.vae, torch_dtype=dtype)
pipe = pipe.to(device)
pipe.set_progress_bar_config(disable=True)
generator = torch.Generator(device=device)

# One warm-up frame so the first real one is not the slow one.
with torch.inference_mode():
    pipe(prompt="warm up", image=Image.new("RGB", (512, 512)), num_inference_steps=2, strength=0.5, guidance_scale=0.0)
print(f"[liveai] ready on ws://{args.host}:{args.port}/ws", flush=True)


def restyle(jpeg: bytes, prompt: str, strength: float) -> bytes:
    image = Image.open(io.BytesIO(jpeg)).convert("RGB")
    strength = min(1.0, max(0.05, strength))
    # img2img runs int(steps * strength) steps; keep at least one.
    steps = max(args.steps, math.ceil(1 / strength))
    generator.manual_seed(42)  # a steady seed: the picture changes with the room, not by chance
    with torch.inference_mode():
        out = pipe(
            prompt=prompt or "a painting",
            image=image,
            num_inference_steps=steps,
            strength=strength,
            guidance_scale=0.0,
            generator=generator,
        ).images[0]
    buffer = io.BytesIO()
    out.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


async def serve(socket):
    params = {"prompt": "", "strength": 0.5}
    await socket.send(json.dumps({"type": "status", "state": "ready", "detail": f"{args.model} on {device}"}))
    frames, since = 0, time.monotonic()
    async for message in socket:
        if isinstance(message, str):
            try:
                data = json.loads(message)
            except ValueError:
                continue
            if data.get("type") == "params":
                params["prompt"] = str(data.get("prompt", ""))[:300]
                try:
                    params["strength"] = float(data.get("strength", 0.5))
                except (TypeError, ValueError):
                    pass
            continue
        # Off the event loop, so params keep arriving while a frame renders.
        result = await asyncio.to_thread(restyle, message, params["prompt"], params["strength"])
        await socket.send(result)
        frames += 1
        if time.monotonic() - since >= 5:
            print(f"[liveai] {frames / (time.monotonic() - since):.1f} fps", flush=True)
            frames, since = 0, time.monotonic()


async def main():
    async with websockets.serve(serve, args.host, args.port, max_size=4 * 1024 * 1024,
                                process_request=None):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
