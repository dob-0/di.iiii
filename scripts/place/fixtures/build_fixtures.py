"""
build_fixtures.py — the MOXIR rig's fixtures as small, honest 3D models.

Run headless:
    blender -b -P scripts/place/fixtures/build_fixtures.py -- \
        --manifest scripts/place/fixtures/fixtures.json --out scripts/place/fixtures/glb [--only beam380] [--preview]

For every kind in the manifest it builds, in real metres and to the datasheet's
outer dimensions, a low-poly model made of separate NODES that move the way the
real machine does:

    Base  — sits on the floor (y = 0), its front toward +Z (glTF frame)
    Yoke  — origin ON the pan axis (the vertical through the base centre)
    Head  — origin ON the tilt axis (horizontal, along X)
    Lens  — the emitting faces only, riding with the head, so the rig can tint
            them per lamp (fixture-lib.mjs, fixtures-glb.mjs)

At pan 0 / tilt 0 the beam leaves the lens straight up (+Y). Static machines
(CO2 jet, spark machine, smoke machine) are one `Body` node (+ `Lens` for an
emitting nozzle where it helps the eye).

This is NOT the maker's CAD: no licensable model of these fixtures exists (see
fixtures.json -> "search"), so each model is drawn from the maker's photos and
datasheet dimensions. It says so in the manifest, and the sidecar JSON written
next to each GLB records what was actually built — the bounding box at home
position, the pivots, the triangle count, this script's hash and the Blender
version — so the numbers that pose a head in the room are the numbers of the
head that is drawn.

Blender's frame is Z up with the front at -Y; the glTF exporter turns that into
Y up with the front at +Z. Everything below is written in Blender's frame.
"""
import bpy
import bmesh
import hashlib
import json
import math
import os
import sys
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("--") else True
    return default


MANIFEST = os.path.abspath(arg("--manifest", os.path.join(os.path.dirname(__file__), "fixtures.json")))
OUT = os.path.abspath(arg("--out", os.path.join(os.path.dirname(__file__), "glb")))
ONLY = arg("--only")
PREVIEW = bool(arg("--preview", False))
MM = 0.001

# ---------------------------------------------------------------------------
# materials: few and shared, so a rig of 100 heads is a handful of draw calls
# ---------------------------------------------------------------------------
MATERIALS = {
    # name: (base colour sRGB, metallic, roughness)
    "Body": ((0.085, 0.088, 0.095), 0.3, 0.5),
    "Metal": ((0.42, 0.43, 0.45), 0.8, 0.35),
    "Trim": ((0.012, 0.012, 0.014), 0.0, 0.8),
    "Glass": ((0.02, 0.025, 0.03), 0.1, 0.08),
    "Lens": ((1.0, 1.0, 1.0), 0.0, 0.2),
    "Display": ((0.05, 0.25, 0.45), 0.0, 0.3),
    "Plastic": ((0.85, 0.86, 0.84), 0.0, 0.5),
}


def material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    colour, metal, rough = MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    lin = tuple(c ** 2.2 for c in colour)
    bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    mat.diffuse_color = (*lin, 1.0)  # what the Workbench preview shows
    mat.metallic = metal
    mat.roughness = rough
    if name in ("Lens", "Display"):
        bsdf.inputs["Emission Color"].default_value = (*lin, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return mat


# ---------------------------------------------------------------------------
# a tiny geometry kit on bmesh (Blender frame, metres)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _tag(self, faces, mat):
        idx = self.slot(mat)
        for f in faces:
            f.material_index = idx

    def box(self, centre, size, mat="Body", bevel=0.0):
        """An axis-aligned box, optionally with chamfered edges (one segment)."""
        before = set(self.bm.faces)
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=Matrix.Translation(Vector(centre)) @ Matrix.Diagonal((*size, 1.0)))
        verts = res["verts"]
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=1, affect="EDGES", profile=0.5)
        self._tag([f for f in self.bm.faces if f not in before], mat)

    def cyl(self, centre, radius, depth, axis="Z", segments=16, mat="Body", radius2=None, cap=True):
        """A cylinder (or cone frustum with radius2) along an axis."""
        before = set(self.bm.faces)
        rot = {"Z": Matrix.Identity(4), "X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
        bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=segments,
                              radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth,
                              matrix=Matrix.Translation(Vector(centre)) @ rot)
        self._tag([f for f in self.bm.faces if f not in before], mat)

    def disc(self, centre, radius, axis="Z", segments=16, mat="Lens", flip=False):
        """A flat disc facing +axis (or -axis with flip) — an emitting face."""
        before = set(self.bm.faces)
        rot = {"Z": Matrix.Identity(4), "-Z": Matrix.Rotation(math.pi, 4, "X"),
               "-Y": Matrix.Rotation(math.pi / 2, 4, "X"), "Y": Matrix.Rotation(-math.pi / 2, 4, "X")}[axis]
        res = bmesh.ops.create_circle(self.bm, cap_ends=True, cap_tris=False, segments=segments, radius=radius,
                                      matrix=Matrix.Translation(Vector(centre)) @ rot)
        faces = [f for f in self.bm.faces if f not in before]
        if flip:
            bmesh.ops.reverse_faces(self.bm, faces=faces)
        self._tag(faces, mat)

    def build(self, origin, parent=None):
        """Turn into an object whose ORIGIN is `origin` (a pivot), mesh stored relative to it."""
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        bmesh.ops.translate(self.bm, verts=self.bm.verts, vec=-Vector(origin))
        self.bm.to_mesh(mesh)
        self.bm.free()
        for m in self.mats:
            mesh.materials.append(material(m))
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = Vector(origin)
        if parent is not None:
            obj.parent = parent
            obj.location = Vector(origin) - Vector(parent["pivot"])
        obj["pivot"] = list(origin)
        return obj


def handles(part, w, d, h, z0, mat="Trim"):
    """Carry handles on the two long sides of a base (a bar standing off the side)."""
    for s in (-1, 1):
        x = s * (w / 2 + 0.018)
        part.box((x, 0, z0 + h * 0.55), (0.02, d * 0.55, 0.03), mat)
        for y in (-d * 0.26, d * 0.26):
            part.box((s * (w / 2 + 0.009), y, z0 + h * 0.55), (0.02, 0.025, 0.03), mat)


# ---------------------------------------------------------------------------
# archetypes
# ---------------------------------------------------------------------------
def moving_head(p):
    """A moving head: base, turntable + two yoke arms, a head on the tilt axis."""
    bw, bd, bh = (v * MM for v in p["base_mm"])  # width (X), depth (Y), height
    arm_t = p.get("arm_t_mm", 40) * MM
    arm_w = p.get("arm_w_mm", 120) * MM
    head = p["head"]
    tilt_y = p["tilt_axis_mm"] * MM  # above the floor
    pan_y = bh
    # Base: a chamfered box, handles, a display window on the front (-Y).
    base = Part("Base")
    base.box((0, 0, bh / 2), (bw, bd, bh), "Body", bevel=min(bw, bd, bh) * 0.08)
    base.box((0, -bd / 2 - 0.002, bh * 0.5), (bw * 0.28, 0.004, bh * 0.22), "Display")
    if p.get("handles", True):
        handles(base, bw, bd, bh, 0)
    if p.get("feet"):
        for sx in (-1, 1):
            for sy in (-1, 1):
                base.box((sx * bw * 0.38, sy * bd * 0.38, -0.006), (0.05, 0.05, 0.012), "Trim")
    base_o = base.build((0, 0, 0))

    # Yoke: a turntable and two arms reaching to the tilt axis.
    yoke = Part("Yoke")
    hw = head["width_mm"] * MM  # head extent along the tilt axis (X)
    span = hw + p.get("arm_gap_mm", 20) * MM * 2  # inside of arm to inside of arm
    yoke.cyl((0, 0, pan_y + 0.02), min(bw, bd) * 0.36, 0.04, "Z", 16, "Body")
    bridge_z = pan_y + 0.04 + 0.03
    yoke.box((0, 0, bridge_z), (span + 2 * arm_t, arm_w, 0.06), "Body", bevel=0.01)
    arm_top = tilt_y + arm_w * 0.5
    for s in (-1, 1):
        x = s * (span / 2 + arm_t / 2)
        height = arm_top - (bridge_z - 0.03)
        yoke.box((x, 0, bridge_z - 0.03 + height / 2), (arm_t, arm_w, height), "Body", bevel=arm_t * 0.3)
        yoke.cyl((s * (span / 2 + arm_t + 0.004), 0, tilt_y), arm_w * 0.3, 0.012, "X", 12, "Trim")  # tilt hub cap
    yoke_o = yoke.build((0, 0, pan_y), parent=base_o)

    # Head: shape by kind, centred on the tilt axis, lens facing +Z at home.
    hd = Part("Head")
    lens = Part("Lens")
    lens_y = build_head(hd, lens, head, tilt_y)
    head_o = hd.build((0, 0, tilt_y), parent=yoke_o)
    lens_o = lens.build((0, 0, tilt_y), parent=head_o)
    return {"panY": pan_y, "tiltY": tilt_y, "lensY": lens_y, "motion": "pan-tilt",
            "parts": ["Base", "Yoke", "Head", "Lens"], "objects": [base_o, yoke_o, head_o, lens_o]}


def build_head(hd, lens, head, tilt_y):
    """The head: its body, then the emitting faces on the front (+Z at home). Returns the lens height."""
    shape = head["shape"]
    w = head["width_mm"] * MM  # along X (the tilt axis)
    d = head.get("depth_mm", head["width_mm"]) * MM  # along Y
    below = head["below_axis_mm"] * MM  # how far the head's back reaches below the axis at home
    above = head["above_axis_mm"] * MM  # how far the front reaches above it
    z0 = tilt_y - below
    z1 = tilt_y + above
    if shape == "box":
        hd.box((0, 0, (z0 + z1) / 2), (w, d, z1 - z0), "Body", bevel=min(w, d) * head.get("round", 0.14))
    elif shape == "barrel":  # a cylinder along the beam, round in section (LED spot/BSW)
        r = head["barrel_mm"] * MM / 2
        hd.cyl((0, 0, (z0 + z1) / 2), r, z1 - z0, "Z", 20, "Body")
        hd.cyl((0, 0, z0 - 0.015), r * 0.8, 0.03, "Z", 16, "Body")
        for s in (-1, 1):  # side vent slats
            for k in range(4):
                hd.box((s * (r - 0.004), 0, z0 + (z1 - z0) * (0.2 + 0.12 * k)), (0.012, r * 0.9, 0.012), "Trim")
    elif shape == "snout":  # an egg-shaped rear housing along the beam (lamp + reflector, a ring of vents) and a long nose to the lens
        rr = head["drum_mm"] * MM / 2
        egg_top = tilt_y + rr * 0.55
        hd.cyl((0, 0, (z0 + 0.05 + egg_top) / 2), rr, egg_top - z0 - 0.05, "Z", 20, "Body")
        hd.cyl((0, 0, z0 + 0.025), rr * 0.93, 0.05, "Z", 20, "Body", radius2=rr)  # the rounded back
        hd.cyl((0, 0, z0 - 0.01), rr * 0.7, 0.02, "Z", 16, "Body", radius2=rr * 0.93)
        for k in range(10):  # the ring of vent holes round the housing, as dark studs
            a = 2 * math.pi * k / 10
            hd.box((math.cos(a) * (rr + 0.002), math.sin(a) * (rr + 0.002), tilt_y + rr * 0.2), (0.024, 0.024, 0.03), "Trim")
        r = head["barrel_mm"] * MM / 2
        hd.cyl((0, 0, egg_top + 0.02), rr * 0.8, 0.04, "Z", 20, "Body", radius2=r)  # the shoulder into the nose
        hd.cyl((0, 0, (egg_top + 0.04 + z1) / 2), r, z1 - egg_top - 0.04, "Z", 20, "Body", radius2=r * head.get("barrel_taper", 1.0))
    else:
        raise ValueError(f"unknown head shape {shape}")
    # The front: a black bezel ring and the emitting lens(es) just proud of it.
    front = z1 + 0.002
    lens_d = head["lens_mm"] * MM
    layout = head.get("lens_layout", "single")
    if layout == "single":
        hd.cyl((0, 0, z1 - 0.004), lens_d / 2 + 0.012, 0.012, "Z", 20, "Trim")
        lens.disc((0, 0, front + 0.004), lens_d / 2, "Z", 20, "Lens")
    elif layout == "hex19":  # 1 + 6 + 12: the bee-eye face
        pitch = head["lens_pitch_mm"] * MM
        cells = [(0, 0)]
        for ring in (1, 2):
            for k in range(6):
                a0 = math.radians(60 * k)
                a1 = math.radians(60 * (k + 1))
                for j in range(ring):
                    t = j / ring
                    x = ring * pitch * ((1 - t) * math.cos(a0) + t * math.cos(a1))
                    y = ring * pitch * ((1 - t) * math.sin(a0) + t * math.sin(a1))
                    cells.append((x, y))
        for x, y in cells:
            lens.disc((x, y, front + 0.004), lens_d / 2, "Z", 8, "Lens")
        hd.cyl((0, 0, z1 - 0.004), min(w, d) / 2 - 0.004, 0.012, "Z", 20, "Trim")  # the round bezel
    elif layout == "grid":  # an LED PAR's face: a round window of many small emitters, drawn as one disc + rings
        hd.cyl((0, 0, z1 - 0.004), lens_d / 2 + 0.012, 0.012, "Z", 24, "Trim")
        lens.disc((0, 0, front + 0.004), lens_d / 2, "Z", 24, "Lens")
    elif layout == "window":  # a laser's aperture: a small rectangle
        ww, wh = (v * MM for v in head["window_mm"])
        lens.box((0, 0, front + 0.002), (ww, wh, 0.004), "Lens")
    return front + 0.006


def par_can(p):
    """An outdoor LED PAR: a round finned can on a U-bracket of flat bar that is also its floor stand."""
    can_d = p["can_d_mm"] * MM
    can_l = p["can_l_mm"] * MM
    tilt_y = p["tilt_axis_mm"] * MM
    outer_w = p["width_mm"] * MM
    bar = 0.008
    span = can_d + 0.016
    base = Part("Base")  # the stand: a flat-bar loop on the floor
    fw = outer_w
    fd = p.get("foot_d_mm", 200) * MM
    for sy in (-1, 1):
        base.box((0, sy * fd / 2, bar / 2), (fw, 0.03, bar), "Body")
    for sx in (-1, 1):
        base.box((sx * fw / 2, 0, bar / 2), (0.03, fd, bar), "Body")
    base_o = base.build((0, 0, 0))
    yoke = Part("Yoke")  # the two arms, up from the stand to the pivots, and a big knob on each
    for s in (-1, 1):
        x = s * (span / 2 + bar / 2)
        yoke.box((x, 0, tilt_y / 2 + 0.004), (bar, 0.035, tilt_y + 0.03), "Body")
        yoke.box(((s * (fw / 2 + span / 2 + bar)) / 2, 0, 0.012), (abs(fw / 2 - span / 2) + 0.03, 0.035, bar), "Body")
        yoke.cyl((s * (span / 2 + bar + 0.008), 0, tilt_y), 0.024, 0.016, "X", 10, "Trim")
    yoke_o = yoke.build((0, 0, 0.0), parent=base_o)
    hd = Part("Head")
    lens = Part("Lens")
    below = can_l * p.get("back_frac", 0.55)
    z0 = tilt_y - below
    z1 = tilt_y + (can_l - below)
    r = can_d / 2
    hd.cyl((0, 0, (z0 + z1) / 2), r * 0.86, z1 - z0, "Z", 20, "Body")
    for k in range(p.get("fins", 16)):  # the deep radial cooling fins
        a = 2 * math.pi * k / p.get("fins", 16)
        m = Matrix.Translation(Vector((math.cos(a) * r * 0.93, math.sin(a) * r * 0.93, z0 + (z1 - z0) * 0.42))) @ Matrix.Rotation(a, 4, "Z")
        before = set(hd.bm.faces)
        bmesh.ops.create_cube(hd.bm, size=1.0, matrix=m @ Matrix.Diagonal((r * 0.16, 0.006, (z1 - z0) * 0.8, 1.0)))
        hd._tag([f for f in hd.bm.faces if f not in before], "Body")
    hd.cyl((0, 0, z1 - 0.01), r, 0.02, "Z", 24, "Body")  # the front bezel
    hd.cyl((0, 0, z1 + 0.002), p["window_mm"] * MM / 2 + 0.006, 0.004, "Z", 24, "Trim")
    lens.disc((0, 0, z1 + 0.006), p["window_mm"] * MM / 2, "Z", 24, "Lens")
    head_o = hd.build((0, 0, tilt_y), parent=yoke_o)
    lens_o = lens.build((0, 0, tilt_y), parent=head_o)
    return {"panY": 0.0, "tiltY": tilt_y, "lensY": z1 + 0.006, "motion": "tilt",
            "parts": ["Base", "Yoke", "Head", "Lens"], "objects": [base_o, yoke_o, head_o, lens_o]}


def laser_box(p):
    """A show laser: a box whose aperture hood is at the top of its front face, in a U-bracket over it."""
    w, h, l = (v * MM for v in p["box_mm"])  # front-face width (X), front-face height, length along the beam
    tilt_y = p["tilt_axis_mm"] * MM
    base = Part("Base")  # the bracket's foot, where it is clamped or stands
    base.box((0, 0, 0.005), (0.16, 0.1, 0.01), "Metal")
    base_o = base.build((0, 0, 0))
    yoke = Part("Yoke")  # the U: foot, two uprights to the side pivots
    arm = p.get("bracket_gap_mm", 30) * MM
    for s in (-1, 1):
        x = s * (w / 2 + arm)
        yoke.box((x, 0, tilt_y / 2 + 0.005), (0.01, 0.04, tilt_y + 0.01), "Metal")
        yoke.cyl((x + s * 0.02, 0, tilt_y), 0.022, 0.03, "X", 10, "Trim")  # locking knob
    yoke.box((0, 0, 0.012), (w + 2 * arm + 0.01, 0.04, 0.01), "Metal")
    yoke_o = yoke.build((0, 0, 0.0), parent=base_o)
    hd = Part("Head")
    lens = Part("Lens")
    # At home the beam points up (+Z here), so the box's LENGTH stands along Z
    # and its front face (width w, height h — h along Blender -Y) is the top.
    z0 = tilt_y - l / 2
    z1 = tilt_y + l / 2
    hd.box((0, 0, tilt_y), (w, h, l), "Body", bevel=0.008)
    hood_w, hood_h = (v * MM for v in p["hood_mm"])
    hy = -h / 2 + hood_h / 2 + 0.02  # the hood sits at the upper edge of the front face
    hd.box((0, hy, z1 + 0.025), (hood_w, hood_h, 0.05), "Trim")
    for k in range(-5, 6):  # the vent grille across the front, below the hood
        hd.box((k * w / 13, h * 0.18, z1 + 0.002), (0.008, h * 0.4, 0.004), "Trim")
    ww, wh = (v * MM for v in p["window_mm"])
    lens.box((0, hy, z1 + 0.052), (ww, wh, 0.004), "Lens")
    head_o = hd.build((0, 0, tilt_y), parent=yoke_o)
    lens_o = lens.build((0, 0, tilt_y), parent=head_o)
    # The beam leaves the hood's window, off the box's centre line: its axis is
    # parallel to the tilt pivot's but offset by `hy` — recorded, and small.
    return {"panY": 0.0, "tiltY": tilt_y, "lensY": z1 + 0.054, "lensOffsetFront_m": round(-hy, 4), "motion": "tilt",
            "parts": ["Base", "Yoke", "Head", "Lens"], "objects": [base_o, yoke_o, head_o, lens_o]}


def co2_jet(p):
    """A CO2 jet: a compact box (Body) on an L-bracket with the jet nozzle standing out of a collar (Mount)."""
    w, d, h = (v * MM for v in p["box_mm"])
    body = Part("Body")
    body.box((0, 0, 0.008 + h / 2), (w, d, h), "Body", bevel=0.006)
    body.box((w * 0.25, -d / 2 - 0.002, 0.008 + h * 0.55), (w * 0.35, 0.004, h * 0.5), "Metal")  # the grey side panel
    mount = Part("Mount")
    mount.box((0, 0, 0.004), (w + 0.06, d + 0.04, 0.008), "Metal")  # the bracket's foot plate
    mount.box((0, d / 2 + 0.01, h * 0.5), (w + 0.06, 0.008, h), "Metal")  # its upright
    mount.cyl((w / 2 + 0.03, 0, h * 0.35), 0.012, 0.06, "X", 8, "Metal")  # the hose inlet
    mount.cyl((0, 0, 0.008 + h + 0.015), 0.035, 0.03, "Z", 12, "Metal")  # the collar
    mount.cyl((0, 0, 0.008 + h + 0.07), 0.014, 0.08, "Z", 10, "Metal")  # the nozzle
    lens = Part("Lens")
    top = 0.008 + h + 0.11
    lens.disc((0, 0, top + 0.001), 0.01, "Z", 8, "Lens")
    body_o = body.build((0, 0, 0))
    mount_o = mount.build((0, 0, 0), parent=body_o)
    lens_o = lens.build((0, 0, 0), parent=body_o)
    return {"lensY": top, "motion": "none", "parts": ["Body", "Mount", "Lens"], "objects": [body_o, mount_o, lens_o]}


def spark_machine(p):
    """A cold spark machine: an upright box with rounded vertical edges, the outlet on top."""
    w, d, h = (v * MM for v in p["box_mm"])
    body = Part("Body")
    body.box((0, 0, h / 2), (w, d, h), "Body", bevel=0.018)
    body.cyl((0, 0, h + 0.004), p.get("nozzle_d_mm", 40) * MM / 2 + 0.01, 0.008, "Z", 12, "Trim")
    lens = Part("Lens")
    lens.disc((0, 0, h + 0.009), p.get("nozzle_d_mm", 40) * MM / 2, "Z", 12, "Lens")
    body_o = body.build((0, 0, 0))
    lens_o = lens.build((0, 0, 0), parent=body_o)
    return {"lensY": h + 0.009, "motion": "none", "parts": ["Body", "Lens"], "objects": [body_o, lens_o]}


def smoke_machine(p):
    """A smoke machine: a long grey box, a round nozzle in its front face, the fluid tank and two handles on top."""
    w, l, h = (v * MM for v in p["box_mm"])  # width (X), length (Y, front at -Y), height
    body = Part("Body")
    body.box((0, 0, h / 2 + 0.012), (w, l, h), "Metal", bevel=0.01)
    body.box((0, -l / 2 + 0.035, h / 2 + 0.012), (w + 0.004, 0.07, h + 0.004), "Body")  # the black front cap
    body.cyl((0, -l / 2 - 0.004, h * 0.5), p.get("nozzle_d_mm", 50) * MM / 2, 0.012, "Y", 12, "Trim")
    for sx in (-1, 1):
        for sy in (-1, 1):
            body.box((sx * w * 0.38, sy * l * 0.42, 0.006), (0.03, 0.03, 0.012), "Trim")  # feet
    tl, th = l * 0.3, h * 0.28
    body.box((0, l * 0.12, h + 0.012 + th / 2), (w * 0.55, tl, th), "Plastic", bevel=0.01)  # the tank
    for y in (-l * 0.18, l * 0.36):
        for x in (-w * 0.3, w * 0.3):
            body.box((x, y, h + 0.012 + 0.03), (0.018, 0.018, 0.06), "Trim")
        body.box((0, y, h + 0.012 + 0.06), (w * 0.62, 0.022, 0.018), "Trim")
    body_o = body.build((0, 0, 0))
    return {"lensY": h * 0.5, "motion": "none", "parts": ["Body"], "objects": [body_o]}


ARCHETYPES = {"moving-head": moving_head, "par": par_can, "laser": laser_box,
              "co2-jet": co2_jet, "spark-machine": spark_machine, "smoke-machine": smoke_machine}


# ---------------------------------------------------------------------------
def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def world_bbox(objects):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for obj in objects:
        for v in obj.data.vertices:
            w = obj.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def main():
    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    os.makedirs(OUT, exist_ok=True)
    with open(__file__, "rb") as fh:
        script_sha = hashlib.sha256(fh.read()).hexdigest()
    for kind, entry in manifest["kinds"].items():
        if ONLY and kind != ONLY:
            continue
        model = entry["model"]
        clear()
        built = ARCHETYPES[model["archetype"]](model["params"])
        objects = built.pop("objects")
        lo, hi = world_bbox(objects)
        # What the datasheet's box measures: by default the whole fixture;
        # `compare` names the parts when the published size leaves some out
        # (a laser's "without the handle").
        compare = model.get("compare")
        clo, chi = world_bbox([o for o in objects if o.name in compare]) if compare else (lo, hi)
        # Blender (x, y, z) -> glTF (x, z, -y): width X, depth along glTF Z, height Y.
        size_mm = [round((hi.x - lo.x) * 1000), round((hi.y - lo.y) * 1000), round((hi.z - lo.z) * 1000)]
        glb = os.path.join(OUT, f"{kind}.glb")
        for obj in bpy.data.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_yup=True, export_apply=False,
                                  export_materials="EXPORT", export_normals=True, export_texcoords=False,
                                  export_extras=False, export_cameras=False, export_lights=False, use_selection=False)
        sidecar = {
            "kind": kind,
            "code": entry.get("code"),
            "glb": f"{kind}.glb",
            "builtBy": "scripts/place/fixtures/build_fixtures.py",
            "scriptSha256": script_sha,
            "blender": bpy.app.version_string,
            "archetype": model["archetype"],
            "frame": "glTF: metres, Y up, base on y=0, front +Z; beam +Y at pan 0 / tilt 0",
            **{k: round(v, 4) if isinstance(v, float) else v for k, v in built.items()},
            "sizeAtHome_mm": {"width_x": size_mm[0], "depth_z": size_mm[1], "height_y": size_mm[2]},
            "triangles": {obj.name: tris(obj) for obj in objects},
        }
        sidecar["triangles"]["total"] = sum(sidecar["triangles"].values())
        with open(os.path.join(OUT, f"{kind}.json"), "w", encoding="utf-8") as fh:
            json.dump(sidecar, fh, indent=2)
            fh.write("\n")
        print(f"{kind:10s} {entry.get('code', ''):10s} {size_mm} mm  {sidecar['triangles']['total']} tris  -> {glb}")
        spec = entry.get("specs", {}).get("size_mm", {}).get("value")
        if spec:
            # Compare like with like: the published box sorted by size against ours.
            ours = sorted([round((chi.x - clo.x) * 1000), round((chi.y - clo.y) * 1000), round((chi.z - clo.z) * 1000)])
            theirs = sorted(spec)
            sidecar["datasheetSize_mm"] = spec
            sidecar["deviationFromDatasheet_pct"] = [round(100 * (a - b) / b, 1) for a, b in zip(ours, theirs)]
            sidecar["comparedParts"] = compare or "all"
            with open(os.path.join(OUT, f"{kind}.json"), "w", encoding="utf-8") as fh:
                json.dump(sidecar, fh, indent=2)
                fh.write("\n")
            print(f"           datasheet {spec} mm, deviation (sorted axes) {sidecar['deviationFromDatasheet_pct']} %")
        if PREVIEW:
            head = bpy.data.objects.get("Head")
            if head is not None:
                head.rotation_euler.x = math.radians(55)  # lean the head toward its front, as in the makers' photos
            preview(kind, objects, lo, hi)


def preview(kind, objects, lo, hi):
    """A Workbench (cheap, no GPU path tracing) three-quarter render of the model."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.film_transparent = False
    scene.world = scene.world or bpy.data.worlds.new("w")
    centre = (lo + hi) / 2
    size = max(hi - lo)
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = centre + Vector((size * 1.5, -size * 2.0, size * 0.9))
    direction = centre - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT, "preview", f"{kind}.png")
    os.makedirs(os.path.dirname(scene.render.filepath), exist_ok=True)
    bpy.ops.render.render(write_still=True)


main()
