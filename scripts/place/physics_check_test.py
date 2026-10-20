"""Tests for physics_check: run `python3 -I -m unittest scripts/place/physics_check_test.py` from the repo root.
fix_ops (the 10-15 bug), and since 2026-10-20 the surfaces: every one comes from the hall record's dims.shell (a fixture shell with
a deck, a lantern opening and a lantern roof; a record without a shell is refused; the real hall record and the owner's final
hall reference 10-17 through main()). Run from the repo root: the real records are read by their path under scripts/place/rigs."""
import contextlib, importlib.util, io, json, math, pathlib, tempfile, unittest

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


def slab(i, surface, x, y, z):
    return {'id': i, 'surface': surface, 'x_m': x, 'y_m': y, 'z_m': z}


# a 20 x 20 m room: walls at x = +-10, z = +-10, a deck at y 10 with a 4 x 4 m opening at the middle, a lantern roof at y 14 over it
FIXTURE = {'shell': [
    slab('wall-e', 'long wall', [10, 10.3], [0, 14], [-10.3, 10.3]), slab('wall-w', 'long wall', [-10.3, -10], [0, 14], [-10.3, 10.3]),
    slab('wall-n', 'end wall', [-10.3, 10.3], [0, 14], [10, 10.3]), slab('wall-s', 'end wall', [-10.3, 10.3], [0, 14], [-10.3, -10]),
    slab('deck-1', 'deck', [-10, -2], [10, 10.1], [-10, 10]), slab('deck-2', 'deck', [2, 10], [10, 10.1], [-10, 10]),
    slab('deck-3', 'deck', [-2, 2], [10, 10.1], [2, 10]), slab('deck-4', 'deck', [-2, 2], [10, 10.1], [-10, -2]),
    slab('lantern-roof', 'lantern roof', [-2.3, 2.3], [14, 14.2], [-2.3, 2.3])]}
UP, EAST = [0.0, 1.0, 0.0], [1.0, 0.0, 0.0]


class Surfaces(unittest.TestCase):
    def setUp(self): self.shell = pc.shell_of(FIXTURE)

    def test_beam_stops_at_a_shell_slab(self):
        L, name = pc.first_surface([5, 1, 0], UP, self.shell)           # under the deck: the deck's underside, 9 m up
        self.assertAlmostEqual(L, 9.0); self.assertIn('deck-2', name)
        L, name = pc.first_surface([0, 1, 0], EAST, self.shell)         # sideways: the east wall's inner face at x = 10
        self.assertAlmostEqual(L, 10.0); self.assertIn('wall-e', name)

    def test_beam_passes_the_opening_and_stops_on_the_lantern_roof(self):
        L, name = pc.first_surface([0, 1, 0], UP, self.shell)           # through the 4 x 4 m opening, to the roof at y 14
        self.assertAlmostEqual(L, 13.0); self.assertIn('lantern-roof', name)

    def test_beam_in_the_opening_edge_hits_the_deck_not_the_roof(self):
        L, name = pc.first_surface([2.5, 1, 0], UP, self.shell)         # 0.5 m outside the opening
        self.assertAlmostEqual(L, 9.0); self.assertIn('deck-2', name)

    def test_floor_is_the_one_plane_outside_the_shell(self):
        L, name = pc.first_surface([0, 3, 0], [0.0, -1.0, 0.0], self.shell)
        self.assertAlmostEqual(L, 3.0); self.assertEqual(name, 'floor')

    def test_a_beam_from_outside_meets_the_wall_it_stands_behind(self):  # the hand-copied planes looked through to the far wall
        L, name = pc.first_surface([-12, 1, 0], EAST, self.shell)
        self.assertAlmostEqual(L, 1.7); self.assertIn('wall-w', name)

    def test_an_origin_inside_a_slab_is_distance_zero(self):
        L, name = pc.first_surface([10.1, 5, 0], UP, self.shell)
        self.assertEqual(L, 0.0); self.assertIn('wall-e', name)

    def test_axis_parallel_ray_outside_a_slab_misses_it(self):
        self.assertIsNone(pc.ray_box([0, 20, 0], EAST, [-1, 0, -1], [1, 5, 1]))


class Refusals(unittest.TestCase):
    def test_no_shell_is_refused_loudly(self):
        for dims in ({}, {'shell': []}, {'truss_top_h_m': 13.3, 'ridge_h_m': 16.5, 'lantern_w_m': 12.0}):
            err = io.StringIO()
            with contextlib.redirect_stderr(err), self.assertRaises(SystemExit) as cm: pc.shell_of(dims)
            self.assertEqual(cm.exception.code, 2); self.assertIn('no dims.shell', err.getvalue()); self.assertIn('hall_shell.py', err.getvalue())

    def test_a_slab_without_extent_is_refused(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm: pc.shell_of({'shell': [{'id': 'x'}]})
        self.assertEqual(cm.exception.code, 2)


def run_main(dims, ents, *extra):
    """main() against a project document served from a file:// 'API' (urllib reads it as http would); returns (exit code, stdout lines)."""
    with tempfile.TemporaryDirectory() as d:
        d = pathlib.Path(d); (d / 'api/projects/p').mkdir(parents=True)
        (d / 'api/projects/p/document').write_text(json.dumps({'version': 7, 'document': {'entities': ents}}))
        (d / 'hall.json').write_text(json.dumps({'dims': dims}))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = pc.main(['--api', d.as_uri(), '--project', 'p', '--hall', str(d / 'hall.json'), *extra])
    return rc, out.getvalue().splitlines()


def lamp(i, pos, rot, length, laser=False):
    return {'id': i, 'type': 'spotLight', 'components': {'transform': {'position': pos, 'rotation': rot}, 'beam': {'length': length, 'laser': laser}, 'light': {}}}


FLIP = [math.pi, 0, 0]   # rotation x = pi turns the rest axis (-Y) to +Y


class Main(unittest.TestCase):
    def test_output_format_and_leak_through_the_deck_in_the_gap(self):
        # a lamp under the deck pointing up drawn 12 m: the deck is 9 m up -> leak 3 m, surface named; the one under the opening is fine (13 m to the roof)
        rc, out = run_main(FIXTURE, [lamp('a', [5, 1, 0], FLIP, 12.0, laser=True), lamp('b', [0, 1, 0], FLIP, 12.0)])
        self.assertEqual(rc, 1)
        self.assertEqual(json.loads(out[0]), {'project': 'p', 'version': 7, 'beams_checked': 2, 'leaks': 1})
        leak = json.loads(out[1])
        self.assertEqual((leak['id'], leak['drawn'], leak['first_hit'], leak['over_m'], leak['laser']), ('a', 12.0, 9.0, 3.0, True))
        self.assertIn('deck-2', leak['surface'])

    def test_no_leak_when_drawn_to_the_first_surface(self):
        rc, out = run_main(FIXTURE, [lamp('a', [5, 1, 0], FLIP, 9.0), lamp('b', [0, 1, 0], FLIP, 13.0)])
        self.assertEqual((rc, json.loads(out[0])['leaks']), (0, 0))

    def test_a_hall_without_a_shell_exits_2_and_checks_nothing(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            run_main({'truss_top_h_m': 13.3}, [lamp('a', [5, 1, 0], FLIP, 12.0)])
        self.assertEqual(cm.exception.code, 2)


ROOT = pathlib.Path(__file__).resolve().parent
RIGS = ROOT / 'rigs'


def load(path):
    with open(path) as f: return json.load(f)


class RealHall(unittest.TestCase):
    """The hall record the room draws (v13, project moxir-v2-11 / moxir-scenes-v2-0) and the owner's final hall reference (10-17)."""
    HALLS = ['moxir-hall-2026-10-11-v11-show-park-far41.hall.json', 'moxir-hall-2026-10-12-v13-skin.hall.json']

    def test_the_reference_rig_has_no_leak_when_drawn_to_its_first_surface_and_every_lamp_stands_in_the_room(self):
        ref = load(RIGS / 'moxir-hall-reference-2026-10-17.json')['lamps']
        for hall in self.HALLS:
            dims = load(RIGS / hall)['dims']; shell = pc.shell_of(dims); ents = []; lengths = {}
            for l in ref:
                if l.get('dmx') is False: continue
                d = pc.axis_of(l['rotation']); L, name = pc.first_surface(l['position'], d, shell)
                self.assertTrue(0 < L < math.inf, (hall, l['id'], L, name))   # inside the room (not in a slab), and the beam ends on something
                lengths[l['id']] = L; ents.append(lamp(l['id'], l['position'], l['rotation'], round(L, 2)))
            rc, out = run_main(dims, ents)
            self.assertEqual((rc, json.loads(out[0])['leaks'], json.loads(out[0])['beams_checked']), (0, 0, len(ents)), hall)
            longer = [dict(e, components=dict(e['components'], beam={'length': round(lengths[e['id']], 2) + 1.0})) for e in ents]
            rc, out = run_main(dims, longer)   # the same rig drawn 1 m past every first surface: every lamp leaks
            self.assertEqual(json.loads(out[0])['leaks'], len(ents), hall)

    def test_the_real_shell_has_the_openings_the_hand_planes_lacked(self):
        shell = pc.shell_of(load(RIGS / self.HALLS[1])['dims'])
        L, name = pc.first_surface([0.0, 1.0, -5.0], UP, shell)         # the 12 m gap between the lantern segments of span 0: deck at 13.35
        self.assertAlmostEqual(L, 12.35); self.assertIn('deck', name)
        L, name = pc.first_surface([0.0, 1.0, 20.0], UP, shell)         # inside the lantern: the roof underside at 16.4
        self.assertAlmostEqual(L, 15.4); self.assertIn('lantern roof', name)
        L, name = pc.first_surface([24.0, 1.0, 20.0], UP, shell)        # span 1 has a lantern too (x 18..30); the hand planes stopped on a deck
        self.assertAlmostEqual(L, 15.4); self.assertIn('lantern roof', name)
        L, name = pc.first_surface([0.0, 7.5, 0.0], EAST, shell)        # the east wall's block, inner face x = 60.4 (hand plane: 60.4)
        self.assertAlmostEqual(L, 60.4, places=3); self.assertIn('wall', name)
        L, name = pc.first_surface([0.0, 5.5, 0.0], EAST, shell)        # a ribbon window band: the glazing is 0.12 m behind the block face
        self.assertAlmostEqual(L, 60.52, places=3); self.assertIn('glazing', name)
        L, name = pc.first_surface([30.0, 7.0, 0.0], [0.0, 0.0, -1.0], shell)   # the back wall: -53.8 in the model, -53.6 in the hand plane
        self.assertAlmostEqual(L, 53.8, places=3); self.assertIn('end wall', name)
        L, name = pc.first_surface([0.0, 3.0, 0.0], [0.0, 0.0, -1.0], shell)    # through the far gate (an opening in the shell): open sky
        self.assertEqual(L, math.inf)


if __name__ == '__main__':
    unittest.main()
