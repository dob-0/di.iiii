#!/usr/bin/env python3
"""Tests for ledger_board.py. Run: python3 -m unittest scripts/show/board/test_ledger_board.py (no network, no git needed)."""
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ledger_board as lb

LEDGER = """| id | when | text | state | who |
| N10 | 11-11 09:00 | verbatim: too old | NEW | session abcd1234 | too old |
| N3600 | 11-11 10:00 | verbatim, not restated: fix the k2 | NEW | session abcd1234 | fix the k2 fader |
| N3600.1 | 11-11 10:01 | K2 fader 4 moves the deck | BUILT: waits for your hands | - |
| N3601 | 11-11 10:05 | verbatim: lamps | NEW | session abcd1234 | patch the lamps |
| N3601.1 | 11-11 10:06 | the patch of the lamps | ROUND 2 FAILED | - |
| N3602 | 11-11 10:07 | verbatim: other chat | NEW | session ffff0000 | not ours |
"""


class LedgerBoard(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory(); d = self.d.name
        os.mkdir(d + '/lanes')
        open(d + '/ledger.md', 'w').write(LEDGER)
        open(d + '/lanes/lead.md', 'w').write('NOW: 10:10 writing the test\nRISK: none\n')
        open(d + '/facts.md', 'w').write('## The show\n- Sat 20:00 <somewhere>\n')
        cfg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'board.example.json')))
        cfg.update(title='TEST SHOW', ledger=d + '/ledger.md', reports=d, firstRow=3560, treeGlob='', prs=[],
                   chats=[{'name': 'lead', 'session': 'abcd1234', 'what': 'leads'}],
                   areas=[{'name': 'K2', 'what': 'controller', 'match': 'k2'}, {'name': 'Other', 'what': 'rest', 'match': ''}])
        json.dump(cfg, open(d + '/board.json', 'w'))
        lb.load(d + '/board.json')

    def tearDown(self):
        self.d.cleanup()

    def test_kind(self):
        self.assertEqual(lb.kind('BUILT: waits for your hands'), 'you')
        self.assertEqual(lb.kind('ROUND 2 FAILED 23:07'), 'bad')
        self.assertEqual(lb.kind('DONE 10:00'), 'done')
        self.assertEqual(lb.kind('IN PROGRESS'), 'run')
        self.assertEqual(lb.kind(None), 'open')

    def test_rows_keep_only_our_chats_from_first_row(self):
        self.assertEqual(sorted(lb.rows()), [3600, 3601])

    def test_page(self):
        page, note = lb.render()
        self.assertNotIn('{{', page)
        self.assertIn('<h1>TEST SHOW</h1>', page)
        self.assertIn('N3600', page); self.assertIn('K2 fader 4 moves the deck', page)
        self.assertIn('<h2>K2</h2>', page); self.assertIn('<h2>Other</h2>', page)
        self.assertIn('10:10 writing the test', page)
        self.assertIn('Sat 20:00 &lt;somewhere&gt;', page)
        self.assertNotIn('not ours', page); self.assertNotIn('too old', page)
        self.assertTrue(note.startswith("rows 2 tally {'bad': 1, 'you': 1, 'run': 0, 'open': 0, 'done': 0}"), note)


if __name__ == '__main__':
    unittest.main()
