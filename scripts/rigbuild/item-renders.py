"""item-renders.py — the inventory's own pictures: a studio shot of every body we model.

docs/architecture/RIG_BUILD.md §13. The item cards of the equipment inventory show, first,
a render of OUR OWN model of the device (the GLBs are this repository's, AGPL-3.0-only),
because a maker's product photo may not be copied without permission.

    blender -b --factory-startup -P scripts/rigbuild/item-renders.py -- \
        [--out public/rigbuild/items/render] [--size 512] [--only up-q108s]

Workbench engine only: flat studio light, the house paper background, an ink outline. It is
cheap (no path tracing), so it runs on the CPU in seconds and does not heat the machine.
Writes one PNG per item and `src/rigbuild/items/renders.json`: for each picture the model it
came from and both files' sha256, the Blender version and this script, so a picture can be
traced to its model and regenerated.
"""
import hashlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


OUT = os.path.join(REPO, arg("--out", "public/rigbuild/items/render"))
SIZE = int(arg("--size", "512"))
ONLY = arg("--only")
MANIFEST = os.path.join(REPO, "src/rigbuild/items/renders.json")

FIX = "scripts/place/fixtures/glb"
PIECES = "scripts/rigbuild/pieces"
# item id → (model, how to pose it). A moving head leans its head toward the camera, as a
# maker's photo does; the rest stand as modelled.
MODELS = {
    "up-b380f": (f"{FIX}/beam380.glb", "lean"),
    "up-250bsw": (f"{FIX}/bsw250.glb", "lean"),
    "up-hk1915": (f"{FIX}/beeEye.glb", "lean"),
    "up-pl5403": (f"{FIX}/par.glb", "stand"),
    "up-la40wf": (f"{FIX}/laser.glb", "stand"),
    "up-q108s": (f"{FIX}/co2.glb", "stand"),
    "up-yh600f": (f"{FIX}/spark.glb", "stand"),
    "up-yz31p": (f"{FIX}/smoke.glb", "stand"),
    "truss-3m": (f"{PIECES}/truss-3m.glb", "long"),
    "truss-2m": (f"{PIECES}/truss-2m.glb", "long"),
    "truss-1m": (f"{PIECES}/truss-1m.glb", "long"),
    "tower": (f"{PIECES}/tower.glb", "tall"),
    "deck-2x1": (f"{PIECES}/deck-2x1.glb", "stand"),
}

PAPER = (1.0, 1.0, 1.0)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def bounds(objects):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objects:
        if o.type != "MESH":
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


def render(item_id, glb, pose):
    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, glb))
    objects = list(bpy.context.scene.objects)
    if pose == "lean":
        for o in objects:
            if o.name.startswith("Head"):
                o.rotation_mode = "XYZ"
                o.rotation_euler.x += math.radians(-40)
    bpy.context.view_layer.update()
    lo, hi = bounds(objects)
    centre = (lo + hi) / 2
    size = max(hi - lo)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.show_object_outline = True
    shading.object_outline_color = (0.067, 0.067, 0.067)
    shading.show_shadows = True
    shading.shadow_intensity = 0.25
    shading.background_type = "VIEWPORT"
    shading.background_color = PAPER
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 90

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 60
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    # glTF is Y up; Blender imports it Z up. A three-quarter view from the front, a little above.
    if pose == "long":
        offset = Vector((size * 0.3, -size * 0.65, size * 0.3))
    elif pose == "tall":
        offset = Vector((size * 0.45, -size * 0.8, size * 0.18))
    else:
        offset = Vector((size * 0.7, -size * 1.05, size * 0.5))
    cam.location = centre + offset
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    # Fit: start close, then widen until the model's bounding box corners all fall inside the frame, with a margin.
    from bpy_extras.object_utils import world_to_camera_view
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    for _ in range(60):
        bpy.context.view_layer.update()
        pts = [world_to_camera_view(scene, cam, c) for c in corners]
        if all(0.08 <= p.x <= 0.92 and 0.08 <= p.y <= 0.92 for p in pts):
            break
        cam.location = centre + (cam.location - centre) * 1.08
    out = os.path.join(OUT, f"{item_id}.png")
    os.makedirs(OUT, exist_ok=True)
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    return out


def main():
    manifest = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as f:
            manifest = json.load(f).get("renders", {})
    for item_id, (glb, pose) in MODELS.items():
        if ONLY and item_id != ONLY:
            continue
        out = render(item_id, glb, pose)
        manifest[item_id] = {
            "file": os.path.relpath(out, os.path.join(REPO, "public")).replace(os.sep, "/"),
            "model": glb,
            "modelSha256": sha256(os.path.join(REPO, glb)),
            "sha256": sha256(out),
            "licence": "AGPL-3.0-only (this repository's model, rendered here)",
        }
        print(f"rendered {item_id} -> {os.path.relpath(out, REPO)}")
    with open(MANIFEST, "w") as f:
        json.dump({
            "howToRead": "docs/architecture/RIG_BUILD.md §13. Written by scripts/rigbuild/item-renders.py — never by hand.",
            "blender": bpy.app.version_string,
            "engine": "BLENDER_WORKBENCH",
            "size": SIZE,
            "renders": dict(sorted(manifest.items())),
        }, f, indent=2)
        f.write("\n")


main()
