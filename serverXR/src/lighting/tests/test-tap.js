'use strict';
// Tap tempo maths (app.js tapTempo). Two taps 200 ms apart used to compute 300 BPM, hit the
// input's ceiling and get SAVED. app.js is a browser file, so the pure function is sliced out
// of its source and run here.
// Run with: node test-tap.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const js = fs.readFileSync(path.join(__dirname, '../ui/app.js'), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

const m = js.match(/function tapTempo\(timesMs\) \{[\s\S]*?\n\}\n/);
let tapTempo = null;
if (m) tapTempo = new Function(m[0] + '\nreturn tapTempo;')();

check('app.js defines tapTempo(timesMs)', () => assert.ok(tapTempo, 'no function tapTempo(timesMs) in app.js'));
if (tapTempo) {
  check('two taps are not a tempo', () => assert.ok('reject' in tapTempo([0, 200])));
  check('three taps 500 ms apart are 120 BPM', () => assert.strictEqual(tapTempo([0, 500, 1000]).bpm, 120));
  check('a 100 ms double tap restarts the run', () => assert.strictEqual(tapTempo([0, 100, 600, 1100]).bpm, 120));
  check('taps under 250 ms apart are too fast, not 300 BPM', () => {
    const r = tapTempo([0, 190, 380]);
    assert.ok('reject' in r && !('bpm' in r), JSON.stringify(r));
  });
  check('a long pause starts a new run', () => assert.strictEqual(tapTempo([0, 500, 10000, 10500, 11000]).bpm, 120));
  check('a result at the input floor is rejected', () => assert.ok('reject' in tapTempo([0, 3000, 6000])));
}

console.log(failures ? '\n' + failures + ' failing\n' : '\nall passing\n');
process.exit(failures ? 1 : 0);
