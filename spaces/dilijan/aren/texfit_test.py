"""Tests for texfit.py: run `python3 -I -m unittest discover -s spaces/dilijan/aren -p texfit_test.py` from the repo root.
Synthetic surfaces with known answers (no network, no assets): the seam check tells flipY=true from false, the UV fit finds
a tilted pose exactly where a turn about the vertical alone cannot (the N1131 fault), quaternions round-trip, and the
yard.html poses keep the wall's tilt."""
import importlib.util, pathlib, re, json, unittest
import numpy as np

here = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('texfit', here / 'texfit.py'); tf = importlib.util.module_from_spec(spec); spec.loader.exec_module(tf)


def grid_surface(n=24, size=2.0, bump=0.05):
    """A bumpy n x n square cut into two charts (left / right half) placed apart in the atlas, at different heights as a
    bake places them (with both at one height a v-flip would mirror both sides alike); quantised like the packs."""
    xs = np.linspace(0, size, n + 1); X, Y = np.meshgrid(xs, xs); Z = bump*np.sin(3*X)*np.cos(2*Y)
    P, UV, idx = [], [], {}
    def vid(i, j, chart):
        k = (i, j, chart)
        if k not in idx:
            idx[k] = len(P); P.append([X[j, i], Y[j, i], Z[j, i]])
            u = i/n*0.45 + (0.0 if chart == 0 else 0.5) - (0.0 if chart == 0 else 0.45*0.5); UV.append([0.05 + u, (0.55 if chart == 0 else 0.05) + j/n*0.4])
        return idx[k]
    I = []
    for j in range(n):
        for i in range(n):
            chart = 0 if i < n//2 else 1
            a, b, c, d = vid(i, j, chart), vid(i + 1, j, chart), vid(i + 1, j + 1, chart), vid(i, j + 1, chart)
            I += [[a, b, c], [a, c, d]]
    P = np.array(P); q = np.round((P - P.min(0))/np.ptp(P, 0).clip(1e-9)*65535).astype(np.uint16)
    return P, np.array(UV), np.array(I, np.int64), q


def paint(P, UV, I, H=512, flip=True):
    """Bake a photo exactly: every texel inside a chart gets f(its 3D point), at the row WebGL reads (row (1-v)H when flip)."""
    f = lambda p: np.stack([128 + 100*np.sin(5*p[:, 0]), 128 + 100*np.cos(4*p[:, 1]), 128 + 80*np.sin(3*(p[:, 0] + p[:, 1]))], 1)
    idm = tf.uv_raster(UV, I, H); vv, uu = np.mgrid[0:H, 0:H]; uv = np.stack([(uu.ravel() + 0.5)/H, (vv.ravel() + 0.5)/H], 1)
    p = tf.uv_to_3d(P, I, UV, idm, uv); ok = ~np.isnan(p).any(1); r, c = vv.ravel()[ok], uu.ravel()[ok]
    T = np.random.default_rng(3).uniform(0, 255, (H, H, 3))  # outside the charts: unrelated content, as a real atlas's padding
    T[(H - 1 - r) if flip else r, c] = f(p[ok])
    return T


def rot(yaw, tilt):
    a, b = np.radians(yaw), np.radians(tilt)
    Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]]); Rx = np.array([[1, 0, 0], [0, np.cos(b), -np.sin(b)], [0, np.sin(b), np.cos(b)]])
    return Ry @ Rx


class Seams(unittest.TestCase):
    def test_flip_true_photo_agrees_across_the_seam_flip_false_does_not(self):
        P, UV, I, q = grid_surface(); T = paint(P, UV, I, flip=True)
        right, wrong = tf.seam_score(q, I, UV, T, True), tf.seam_score(q, I, UV, T, False)
        self.assertGreater(right['edges'], 10)
        self.assertGreater(right['r'], 0.8); self.assertLess(wrong['r'], 0.5); self.assertLess(right['med'], wrong['med'])


class PoseByUV(unittest.TestCase):
    def test_a_tilted_copy_is_found_exactly_and_a_yaw_only_fit_cannot(self):
        P, UV, I, q = grid_surface(); T = paint(P, UV, I)
        R0, t0 = rot(229.3, 4.3), np.array([4.52, 0.89, 0.43])
        part = {'P': P @ R0.T + t0, 'UV': UV, 'I': I, 'tex': T}; frag = {'P': P, 'UV': UV, 'I': I, 'tex': T}
        r = tf.pose_by_uv(frag, part, R=1024)
        self.assertLess(np.abs(r['R'] - R0).max(), 1e-6); self.assertLess(np.abs(r['t'] - t0).max(), 1e-6)
        self.assertAlmostEqual(r['tilt_deg'], np.degrees(np.arccos(R0[1, 1])), places=4); self.assertGreater(r['photo_r'], 0.99)
        X, Y = P, P @ R0.T + t0
        _, _, res = tf.trimmed_fit(X, Y, yaw_only=True)
        self.assertGreater(np.percentile(res, 90), 0.01)  # what the N1123 yaw-only ICP could reach: more than 1 cm off

    def test_another_surfaces_photo_is_not_a_shared_atlas(self):
        P, UV, I, q = grid_surface(); T = paint(P, UV, I); other = np.random.default_rng(2).uniform(0, 255, T.shape)
        r = tf.pose_by_uv({'P': P, 'UV': UV, 'I': I, 'tex': other}, {'P': P, 'UV': UV, 'I': I, 'tex': T}, R=1024)
        self.assertLess(r['photo_r'], 0.3)


class Quaternions(unittest.TestCase):
    def test_round_trip_including_half_turns(self):
        for yaw, tilt in ((0, 0), (229.77, 4.3), (180, 0), (90, 179), (-130.65, 4.298)):
            R = rot(yaw, tilt); q = tf.quat_from_R(R)
            self.assertAlmostEqual(np.linalg.norm(q), 1.0, places=9); self.assertLess(np.abs(tf.R_from_quat(q) - R).max(), 1e-9)


class YardPage(unittest.TestCase):
    def test_the_wall_keeps_its_lean_and_the_courtyard_stays_upright(self):
        poses = tf.page_poses((here / 'yard.html').read_text())
        tilt = lambda R: np.degrees(np.arccos(np.clip(R[1, 1], -1, 1)))
        self.assertTrue(4.0 < tilt(poses['wall'][0]) < 4.6)
        self.assertLess(tilt(poses['courtyard'][0]), 0.01)
        self.assertNotIn('cabin', poses)  # not in the yard scan: it shows only in the wall

    def test_older_yaw_poses_still_read(self):
        R, t = tf.page_poses('const IN_YARD={"wall":{"yaw":90,"t":[1,2,3]}};')['wall']
        self.assertLess(np.abs(R @ [1, 0, 0] - [0, 0, -1]).max(), 1e-9); self.assertEqual(t.tolist(), [1, 2, 3])


if __name__ == '__main__':
    unittest.main()
