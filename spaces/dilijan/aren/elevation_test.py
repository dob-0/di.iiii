"""Tests for elevation.py: `python3 -I -m unittest discover -s spaces/dilijan/aren -p elevation_test.py` from the repo root.
Synthetic textured facades with known answers (no network, no assets): the plane and its photographed side, the level line
from a window row, the gap along a line and round a corner, the layout (parallel, level, one ground line, the gaps kept,
the reference unmoved) and the registration of a copy scanned apart at another scale (N1145, 2026-10-21)."""
import importlib.util, pathlib, unittest
import numpy as np

here = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('elevation', here / 'elevation.py'); el = importlib.util.module_from_spec(spec); spec.loader.exec_module(el)
tf = el.tf


def facade(W=4.0, H=1.0, sill=0.35, head=0.75, wins=(0.6, 1.7, 2.8), ww=0.5, n=40, seed=1, tex_px=0.005):
    """A wall in the local x-y plane (photographed from +z, winding toward +z) with a ground strip in front (winding up)
    and a photo: dark wall, white window frames (3 cm), grass; per-vertex UVs into one atlas (wall top, ground bottom)."""
    rng = np.random.default_rng(seed)
    xs, ys = np.linspace(0, W, n + 1), np.linspace(0, H, max(4, int(n*H/W)) + 1)
    P, UV, I = [], [], []
    for j, y in enumerate(ys):
        for i, x in enumerate(xs): P.append([x, y, 0.004*rng.standard_normal()]); UV.append([x/W, 0.3 + 0.7*y/H])
    nx = len(xs)
    for j in range(len(ys) - 1):
        for i in range(nx - 1):
            a, b, c, d = j*nx + i, j*nx + i + 1, (j + 1)*nx + i + 1, (j + 1)*nx + i
            I += [[a, b, c], [a, c, d]]                      # counter-clockwise seen from +z
    g0 = len(P); gz = np.linspace(0, 0.6, 4)
    for k, z in enumerate(gz):
        for i, x in enumerate(xs): P.append([x, 0.0, z]); UV.append([x/W, 0.28*k/(len(gz) - 1)])
    for k in range(len(gz) - 1):
        for i in range(nx - 1):
            a, b, c, d = g0 + k*nx + i, g0 + k*nx + i + 1, g0 + (k + 1)*nx + i + 1, g0 + (k + 1)*nx + i
            I += [[a, c, b], [a, d, c]]                      # normal +y
    Wpx, Hpx = int(W/tex_px), int(H/0.7/tex_px)
    T = np.full((Hpx, Wpx, 3), 60.0); T[int(Hpx*0.72):, :, :] = [60, 120, 50]
    def px(x, y): return int(x/W*Wpx), int((1 - (0.3 + 0.7*y/H))*Hpx)
    fr = int(0.03/tex_px)
    for x0 in wins:
        (a, b), (c, d) = px(x0, head), px(x0 + ww, sill)
        T[b:d, a:c] = 230; T[b + fr:d - fr, a + fr:c - fr] = 40      # frame, glass
    return {'P': np.array(P, float), 'UV': np.array(UV, float), 'I': np.array(I, np.int64), 'tex': T}


def rot(yaw=0.0, roll=0.0, tilt=0.0):
    """Turn about the facade's own normal (roll, local z), lean about local x (tilt), then about the vertical (yaw)."""
    a, b, c = np.radians([yaw, roll, tilt])
    Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    Rz = np.array([[np.cos(b), -np.sin(b), 0], [np.sin(b), np.cos(b), 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, np.cos(c), -np.sin(c)], [0, np.sin(c), np.cos(c)]])
    return Ry @ Rx @ Rz


FAST = {'n': 80000, 'iters': 600, 'per_px': 4.0}     # lighter sampling than the CLI; the answers are known exactly


class Elevation(unittest.TestCase):
    rng = np.random.default_rng(3)

    def test_plane_side_and_level(self):
        m = facade(); R = rot(30, 2.0, 1.0); f = el.measure(m, 1.0, R, np.array([1.0, 0.2, -2.0]), self.rng, 'a', **FAST)
        self.assertLess(el.angle(f['n'], R @ [0, 0, 1]), 0.3)                 # the photographed side, with its lean
        self.assertEqual(f['level_by'], 'edges'); self.assertEqual(len(f['windows']), 3)
        self.assertLess(el.angle(f['h'], R @ [1, 0, 0]), 0.3)                 # level along the sills, not the scan's x
        back = el.measure({**m, 'I': m['I'][:, ::-1]}, 1.0, R, np.zeros(3), self.rng, 'b', **FAST)
        self.assertLess(el.angle(back['n'], R @ [0, 0, -1]), 0.3)             # reversed winding: the other side
        self.assertGreater(el.ground_winding(m['P'], m['I']), 0.95)

    def test_gap_along_a_line_and_round_a_corner(self):
        mk = lambda c, h, a0, a1: {'c': np.array(c, float), 'h': np.array(h, float), 'a0': a0, 'a1': a1}
        g, ang, K = el.gap_along(mk([0, 0, 0], [1, 0, 0], -1, 1), mk([2.5, 0, 0], [1, 0, 0], -1, 1)); self.assertAlmostEqual(g, 0.5, 6); self.assertIsNone(K)
        g, _, _ = el.gap_along(mk([0, 0, 0], [1, 0, 0], -1, 1), mk([1.5, 0, 0.0], [1, 0, 0], -1, 1)); self.assertEqual(g, 0.0)   # overlap: touching
        g, ang, K = el.gap_along(mk([0, 0, 0], [1, 0, 0], -1, 1), mk([1.2, 0, 1.3], [0, 0, 1], -1, 1))  # ends 0.2 and 0.3 from the corner
        self.assertAlmostEqual(g, 0.5, 6); self.assertAlmostEqual(ang, 90.0, 4)

    def test_view_frame_holds_every_vertex(self):
        # the camera's frame spans every drawn vertex along the level line, not only the facades (N1145: on a phone the courtyard's tent was cut off)
        r = {'n': np.array([0.0, 0.0, 1.0]), 'c': np.zeros(3), 'foot': 0.0, 'w': np.array([0.0, 1.0, 0.0])}
        S = {'a': {'facade_h': 1.0}, 'b': {'facade_h': 1.2}}
        world = {'a': np.array([[-5.0, 0.0, 0.0], [0.0, 1.0, 0.0]]), 'b': np.array([[0.0, 0.0, 0.0], [6.5, 0.3, 0.4]])}      # b's tent reaches x = 6.5
        v = el.view_frame(r, S, ['a', 'b'], world)
        self.assertAlmostEqual(v['width'], 11.5, 3); self.assertAlmostEqual(v['centre'][0], 0.75, 3); self.assertAlmostEqual(v['centre'][1], 0.6, 3)
        self.assertAlmostEqual(v['height'], 1.2, 3); self.assertAlmostEqual(v['theta'], 0.0, 5)
        for X in world.values(): self.assertTrue(np.all(np.abs(X[:, 0] - v['centre'][0]) <= v['width']/2 + 1e-6))

    def test_layout_one_building(self):
        poses = {'left': (1.0, rot(-128, 1.5, 3.0), np.array([4.5, 0.05, 0.3])), 'mid': (0.84, rot(181, -1.0, 0.8), np.array([2.0, -0.03, 1.7])),
                 'ref': (1.0, rot(3.4, 0.3, 0.2), np.array([-2.0, 0.0, 1.8]))}
        meshes = {'left': facade(seed=2, wins=()), 'mid': facade(seed=3, W=3.4), 'ref': facade(seed=4, W=5.5, H=1.2, sill=0.5, head=1.0, wins=(0.5, 1.9, 3.3))}
        F = {k: el.measure(meshes[k], *poses[k], self.rng, k, **FAST) for k in poses}
        self.assertEqual(F['left']['level_by'], 'foot')                       # too few edges: levelled by its foot
        order, gaps = ['left', 'mid', 'ref'], [0.3, 0.0]
        L = el.layout(F, order, 'ref', gaps)
        M, shift, _ = L['ref']; self.assertTrue(np.allclose(M, np.eye(3))); self.assertTrue(np.allclose(shift, 0))
        after = {}
        for k in order:
            s, q, t = el.compose(*poses[k], L[k][0], L[k][1])
            after[k] = el.measure(meshes[k], s, tf.R_from_quat(q), t, self.rng, k, **FAST)
        for k in ('left', 'mid'):
            self.assertLess(el.angle(after[k]['n'], after['ref']['n']), 0.3)   # walls parallel, photographed side to the viewer
            self.assertLess(abs(after[k]['roll_deg']), 0.3)                     # level (true horizontal)
            self.assertLess(el.angle(after[k]['h'], after['ref']['h']), 0.5)   # window rows parallel (the reference keeps its 0.3)
        feet = [after[k]['c'][1] + after[k]['foot']*after[k]['w'][1] for k in order]
        self.assertLess(np.ptp(feet), 0.01)                                     # one ground line
        sills = [w['sill'] for w in after['mid']['windows']]; self.assertLess(np.ptp(sills), 0.015)
        # the gaps, measured on the laid-out pieces along the reference's level line
        A = {k: sorted([(after[k]['c'] + after[k][e]*after[k]['h'] - after['ref']['c']) @ after['ref']['h'] for e in ('a0', 'a1')]) for k in order}
        self.assertAlmostEqual(A['mid'][0] - A['left'][1], 0.3, delta=0.02); self.assertAlmostEqual(A['ref'][0] - A['mid'][1], 0.0, delta=0.02)
        self.assertAlmostEqual(after['mid']['facade_h'], 0.84, delta=0.02)   # the scale is the pose's, not stretched

    def test_register_a_copy_scanned_apart(self):
        part = facade(seed=5, W=3.4)
        Rp = rot(176.7, 0.0, 0.0); part = {**part, 'P': part['P'] @ Rp.T + [2.0, 0.1, 1.76]}
        frag = facade(seed=5, W=3.4); k = 1/0.84; Rf = rot(2.6, 1.0, 0.5)
        frag = {**frag, 'P': (k*frag['P']) @ Rf.T + [-7.7, 0.0, 1.7]}
        r = el.register_apart(frag, part, self.rng, span=0.06, **FAST)
        self.assertAlmostEqual(r['s'], 0.84, delta=0.006)
        self.assertLess(r['median_cm'], 0.6)
        X = r['s']*frag['P'] @ r['R'].T + r['t']
        self.assertLess(np.median(np.linalg.norm(X - part['P'], axis=1)), 0.02)   # vertex for vertex: the same wall


if __name__ == '__main__':
    unittest.main()
