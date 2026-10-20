import unittest, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import wire_match as w

LOG = ['2026-01-01T00:00:00.000Z 1,2,0,0', '2026-01-01T00:00:10.000Z 1,2,4,0', 'read failed x', '2026-01-01T00:00:20.000Z 1,2,5,0', '2026-01-01T00:00:30.000Z 1,2,9,0']


class T(unittest.TestCase):
    def test_parse_skips_noise(self):
        self.assertEqual(len(w.parse_log(LOG)), 4)

    def test_graphic(self):
        self.assertEqual([w.graphic_of(v) for v in (0, 1, 2, 5)], [1, 1, 2, 3])
        self.assertEqual(w.graphic_of(9, 3), 4)

    def test_value_at(self):
        log = w.parse_log(LOG); t0 = log[0][0]
        self.assertIsNone(w.value_at(log, t0 - 1, 2))
        self.assertEqual(w.value_at(log, t0 + 5, 2), 0)
        self.assertEqual(w.value_at(log, t0 + 10, 2), 4)
        self.assertEqual(w.value_at(log, t0 + 99, 2), 9)

    def test_graphic_changes(self):
        log = w.parse_log(LOG); t0 = log[0][0]
        # 0→4 crosses (g1→g3), 4→5 crosses (g3→g3? 4//2=2, 5//2=2: no), 5→9 crosses
        self.assertEqual([round(t - t0) for t in w.graphic_changes(log, 2)], [10, 30])

    def test_match_photos_time_and_order(self):
        log = w.parse_log(LOG)
        photos = [{'sent': '2025-12-31T23:59:00Z', 'name': 'a'}, {'sent': '2026-01-01T00:00:12.5Z', 'name': 'b'}, {'sent': '2026-01-01T00:00:25Z', 'name': 'c'}]
        cells = w.match_photos(photos, log, 2)
        self.assertEqual([(g, v, how) for g, v, how, _ in cells], [(1, None, 'by order'), (3, 4, 'by time'), (3, 5, 'by time')])

    def test_best_offset_finds_shift(self):
        log_ch = [100.0, 110.0, 125.0]
        video = [1.0, 11.0, 26.0]   # video started at 99
        hits, start = w.best_offset(video, log_ch, 90.0, 20.0)
        self.assertEqual(hits, 3)
        self.assertAlmostEqual(start, 99.0, delta=0.05)

    def test_best_offset_empty_log(self):
        self.assertEqual(w.best_offset([1.0], [], 0.0, 5.0), (0, None))


if __name__ == '__main__':
    unittest.main()
