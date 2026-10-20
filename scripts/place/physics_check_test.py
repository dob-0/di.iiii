"""Tests for physics_check.fix_ops: run `python3 -I -m unittest scripts/place/physics_check_test.py` from the repo root."""
import importlib.util, pathlib, unittest

spec = importlib.util.spec_from_file_location('physics_check', pathlib.Path(__file__).with_name('physics_check.py'))
pc = importlib.util.module_from_spec(spec); spec.loader.exec_module(pc)


class FixOps(unittest.TestCase):
    def test_laser_leak_gets_an_op(self):  # the 10-15 bug: the only leak was a laser, ops came out empty, the route answered 400
        leaks = [{'id': 'rig-laser-42', 'drawn': 69.72, 'first_hit': 60.02, 'surface': 'roof deck', 'over_m': 9.7, 'laser': True}]
        ops = pc.fix_ops(leaks, 1)
        self.assertEqual(len(ops), 1)
        self.assertEqual(ops[0]['payload'], {'entityId': 'rig-laser-42', 'component': 'beam', 'patch': {'length': 60.02}})

    def test_every_leak_gets_its_own_op_id(self):
        leaks = [{'id': f'b{i}', 'first_hit': 10.0 + i, 'laser': bool(i % 2)} for i in range(4)]
        ops = pc.fix_ops(leaks, 7)
        self.assertEqual(len({o['opId'] for o in ops}), 4)

    def test_no_leak_no_ops(self):
        self.assertEqual(pc.fix_ops([], 1), [])


if __name__ == '__main__':
    unittest.main()
