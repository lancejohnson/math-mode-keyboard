# Trigonometry course: draft outline

Math Academy has no standalone trigonometry course. Its trigonometry is spread across
three courses (checked on mathacademy.com, Oct 2026):

| Math Academy course | Trigonometry it covers | Topics |
|---|---|---|
| Geometry | right-triangle ratios, special triangles, radians, arc length | about 20 |
| Algebra II | unit circle, special angles, law of sines and cosines, graphs and transformations | about 45 |
| Precalculus | inverse functions, identities, sum/double-angle formulas, equations, polar coordinates | about 50 |

Mathematical Foundations II and III (their adult track) cover the same material.

This course collects it into one sequence of about 100 small topics. The structure is
the same as Math Academy's: one idea per topic, prerequisites, worked example then
practice, and spaced review. Each unit adds the intuition-first pieces: predict first,
a draggable model, the features you need to reproduce a picture by hand, a sketch
graded on those features, and an explain prompt. The wording, examples and problems
are original.

## Units

1. **Angles and radians.** Angles as rotation; degrees; radians as "radius-lengths of arc"
   (model: wrap a string the length of the radius around a circle); converting; arc length
   and sector area; coterminal and negative angles.
2. **Right-triangle trigonometry.** Ratios that depend only on the angle (model: drag a
   similar triangle bigger, ratios don't change); sine, cosine and tangent; solving for sides
   and angles; reciprocal ratios; complementary angles; area with ½ab·sin C.
3. **Special triangles.** 45-45-90 and 30-60-90 from a square and an equilateral triangle;
   the exact values, derived first, then drilled until automatic.

**Facts to know by heart** are part of the units, not a separate course. A topic that teaches
angles lists them (`facts:` in the unit page, cards in `app/trig/facts.js`); a "by heart" topic
drills them timed (only answers under 3 s count); afterwards they return as quick facts in later
practice and as a short spaced review on the unit's topic list. `facts.html` shows all decks.

**How new facts are dosed** (`app/trig/drill.js`, used by the "by heart" topic with `dose: true` and
by every deck on `facts.html`):

- At most **3 facts** are being learned at once. A fact is what you remember, so 60° = π/3 is one fact
  asked both ways. The next fact joins when one has settled.
- A fact you've never seen is **shown first** (untimed, with its picture). A fact already met in a lesson is
  asked straight away.
- A **miss** shows the answer, and you tap it to go on. It comes back after **at least 2 other questions and
  10 seconds**, ahead of anything new.
- Each fast right answer (under 3 s) **widens the gap**: 2 → 4 → 8 questions, and 10 → 30 → 60 seconds;
  both must pass. A right but slow answer repeats the same gap.
- **Cold (automatic)** = 3 fast right answers in a row at those gaps, the last at least a minute after the one
  before. A fact met in a lesson that is fast at first sight needs 2. The first review is then **a day later**
  (box 2 in `facts.js`), and the spacing grows from there.
- Gaps are filled with facts you already know, never a brand-new one; if there is nothing else, a waiting
  card is asked early, and an early answer doesn't move it on.
- **4 or more of the last 10 answers wrong**: no new fact joins until that clears. A card missed 3 times
  shrinks the set to 2 until it is cold.
- A sitting stops taking new facts after 120 questions in the unit, or 60 on `facts.html`. Progress is saved.
- Every answer stores the time to answer (`s`) and the time to the first touch on an answer (`s0`), for
  later use.

Simulated learners (`app/trig/drill.test.js`): a learner who is always right and fast gets all 16 angles cold
in about 5–6 minutes. Weaker learners stop at the question cap with their progress saved.
4. **The unit circle.** cos θ and sin θ as the x and y of a point going round
   (model: drag the point); quadrants and signs; reference angles; exact values everywhere;
   sin² + cos² = 1 as the Pythagorean theorem on the circle.
5. **Graphs of sine and cosine.** Unwrapping the circle into a wave (model: a point turning
   on the circle traces the graph next to it); period, amplitude, zeros, peaks.
6. **Transformed sinusoids.** y = A·sin(B(x − C)) + D: predict-first rounds like the parabola
   lesson; the features you need to sketch one (midline, amplitude, period, start point,
   the five key points); graded sketches; modeling tides, Ferris wheels, daylight.
7. **Tangent and the reciprocal functions.** tan as slope of the radius; asymptotes;
   graphs of tan, sec, csc, cot.
8. **Inverse functions.** Why the domain must be restricted; arcsin, arccos, arctan;
   "which angle?" on the circle.
9. **Equations.** Solve on the circle first, then generalise (+ 2πn); transformed and
   quadratic equations.
10. **Identities.** Pythagorean family; sum and difference formulas (model: rotating a
    point twice); double-angle; amplitude-phase form; proving identities.
11. **General triangles.** Law of sines, law of cosines, the ambiguous case shown with a
    swinging side; navigation and surveying problems.
12. **Polar coordinates.** Points by angle and distance; converting; simple polar curves.

## Diagnostic

The course starts with a short placement check (about 15 questions sampled across units
1 to 6) so a learner who already knows right-triangle ratios starts at the unit circle.
