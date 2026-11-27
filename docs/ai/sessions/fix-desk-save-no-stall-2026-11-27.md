## 2026-11-27 — light desk: a look edit no longer stalls the DMX output for half a second

- A save serialised all 80 looks (42 MB) again after every look edit, on the DMX loop's thread: the worst frame gap after an edit was 515 ms (p50), 596 ms (max), measured on a scratch desk with a copy of the live show file.
- Now one JSON text per look object (WeakMap), made when the look is new, warmed one look per 5 ms timer; the file is written from those pieces, byte-identical to JSON.stringify(state) (test). looksEdited() drops all entries.
- Not measured: a show load or import (all looks new at once; the warm-up spreads the work, the save in the same tick is not).
