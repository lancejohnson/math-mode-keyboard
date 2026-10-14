# Ink editing diagnostics

`uv run -q --with playwright python tests/test-ink-editing.py --diagnose`

Runs independent focused-scribble, insertion and previous-line-button probes in
fresh contexts with mocked recognition. Prints a compact JSON report, writes full
evidence to `.artifacts/ink-diagnostics.json`, exits nonzero on failed probes, and
closes its browser and temporary server. This is headless Chromium, not iOS.

The normal `test-ink-editing.py` automatically runs the same probes when its
checks fail, then rethrows the original failure. Successful tests incur no probes.
No app source edits or screenshot inspection are needed to obtain:

- DOM pointer paths (including shadow roots) versus actual canvas-handler delivery.
- Host/deep hit target and hit stack at the gesture/button coordinates.
- Glyph bounds, caret offsets sampled across MathLive, focused state, saved stroke
  point counts, before/after expressions and button pointer-events styles.

All instrumentation exists only in disposable test pages; none ships in `app/`.
The historical `__scr`, `__mv`, `__ev` debug globals were already removed from
production by the original turn, so no production removal was necessary here.

## Regression replay

`uv run -q --with playwright python tests/test-ink-diagnostics.py`

Checks healthy probes, then serves the two historical defects through test-only
routes: removes MathLive-to-canvas pointer forwarding and the edit button's
`pointer-events:auto`. Both are diagnosed in one run, even though the first
scribble fails. The raw point-offset/glyph evidence is also reported up front.
Checks that contexts close and automatic reporting preserves the original error,
even if diagnostic collection itself fails.

## Measured comparison

Reviewed turn: `01a13876-585f-7b42-b724-d5ea27a5f1c0`, user turn beginning
October 14, 2026 at 1:44 am CT. No existing pi extension gathered this evidence.

The reviewer estimated 250 seconds avoidable. The diagnosis-to-pass window was
255.0 seconds wall time, but included 57 seconds idle/compaction and real fixes.
A narrower comparison excludes implementation and initial test creation:

| Evidence-only step | Active seconds (model + tool) |
|---|---:|
| 21: stroke count, toast, geometry | 9.003 |
| 22: point-offset samples | 12.582 |
| 23: atom bounds | 10.614 |
| 25: scratch instrumentation | 13.822 |
| 26: stroke point count | 10.192 |
| 27: pointer-move instrumentation | 13.916 |
| 28: DOM pointer paths | 16.881 |
| 30: previous-line HTML and hit-target investigation | 20.894 |
| Before total | 107.904 |
| After: all probes with historical routing/button defects | 7.576 |

Evidence collection is about **100.3 seconds faster (93%)** in this replay.
This is not a claim that all 250 seconds or the actual code-fix time disappears.
Healthy probes took 8.036 seconds. Automatic failure reporting adds this bounded
probe run only on failure; it does not shorten the initial failing check.
