"""Tests for round_gate.py (exact-name skip, pose-set refusal, finalize rollback) and sfm_seq_track.time_order_warning.
Run from the repo root: python3 scripts/place/model-hall/round_gate_test.py
(the repo has no pytest; these are plain unittest and also run under pytest)"""
import importlib.util, json, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod


rg = load(HERE / 'round_gate.py', 'round_gate')
seq = load(HERE.parent / 'colmap' / 'sfm_seq_track.py', 'sfm_seq_track')


class T(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory(); self.addCleanup(self._td.cleanup); self.tmp = Path(self._td.name)

    def test_room_files_exact_name(self):
        room = self.tmp / 'room'
        for d in ('renders', 'cam', 'camera_rig', 'r5', 'r50', 'keep'):
            (room / d).mkdir(parents=True); (room / d / 'a.txt').write_text('x')
        got = {p.parent.name for p in rg.room_files(room)}
        self.assertEqual(got, {'camera_rig', 'r50', 'keep'})   # prefix match would have dropped camera_rig and r50

    def mk(self, rnd, n, shaval):
        d = self.tmp / 'rounds' / f'r{rnd}'; d.mkdir(parents=True, exist_ok=True)
        (d / 'overlap.json').write_text(json.dumps({'valid_poses': n, 'gate_poses_sha256': shaval, 'rooms': {'a': {'score': 0.5}}}))

    def test_check_refuses_pose_change(self):
        self.mk(1, 3, 'aa'); self.mk(2, 2, 'aa')
        with self.assertRaisesRegex(SystemExit, 'valid poses'): rg.check(self.tmp, 2, 1, 0.01, False)
        self.mk(2, 3, 'bb')
        with self.assertRaisesRegex(SystemExit, 'gate_poses.json'): rg.check(self.tmp, 2, 1, 0.01, False)
        self.mk(2, 3, 'aa')
        self.assertEqual(rg.check(self.tmp, 2, 1, 0.01, False), [])

    def test_pose_set_counts_valid(self):
        t = self.tmp
        (t / 'survey' / 'frames').mkdir(parents=True); (t / 'survey' / 'frames' / 'f.jpg').write_text('x'); (t / 'p.json').write_text('{}')
        (t / 'gate_poses.json').write_text(json.dumps({'a': [{'frame': 'f.jpg', 'pose': 'p.json'}, {'frame': 'no.jpg', 'pose': 'p.json'}, {'frame': 'f.jpg', 'pose': 'missing.json'}]}))
        n, h = rg.pose_set(t)
        self.assertEqual(n, 1); self.assertEqual(len(h), 64)

    def test_finalize_rolls_back_on_failure(self):
        t = self.tmp
        (t / 'rooms' / 'a').mkdir(parents=True); (t / 'rooms' / 'a' / 'x.txt').write_text('x')
        (t / 'floor.glb').write_text('g'); (t / 'gate_poses.json').write_text('{}')
        r = t / 'rounds' / 'r3'; r.mkdir(parents=True); (r / 'marker').write_text('orig')
        with mock.patch.object(rg, 'score', side_effect=SystemExit('render failed')):
            with self.assertRaises(SystemExit): rg.finalize(t, 3, 'blender')
        self.assertEqual((r / 'marker').read_text(), 'orig'); self.assertFalse((t / 'rounds' / 'r3-pre-gate').exists())
        with mock.patch.object(rg, 'score'): rg.finalize(t, 3, 'blender')   # re-run works
        self.assertTrue((t / 'rounds' / 'r3-pre-gate' / 'marker').exists()); self.assertTrue((r / 'MANIFEST.json').exists())

    def test_time_order_warning(self):
        self.assertIsNone(seq.time_order_warning([f'f_{i:04d}.jpg' for i in range(1, 12)]))
        self.assertIsNotNone(seq.time_order_warning(sorted(f'f_{i}.jpg' for i in range(1, 12))))   # f_10 sorts before f_2
        self.assertIsNotNone(seq.time_order_warning(['a.jpg', 'b.jpg']))


if __name__ == '__main__':
    unittest.main()
