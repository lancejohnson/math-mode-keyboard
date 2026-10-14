# Math Mode

A phone-first, live math scratchpad with a real large-key numpad, not a modified QWERTY keyboard.

Live prototype: https://individually-trustee-arnold-corners.trycloudflare.com/

This is a temporary Cloudflare Tunnel address. It remains live while the tunnel runs; a tunnel restart can change the URL.

## Try it

- **Steps:** enter math with the touch numpad. Fractions and powers are structured, editable notation. → exits a numerator, denominator or exponent. ↵ starts a blank next step. Hold Return for a moment and slide upward to copy the current line. Flick x/y upward for a square/cube; hold backspace to erase repeatedly.
- **4 wide / 5 compact:** switch between two number-pad layouts. The large version has four columns and separate navigation; the compact version makes more space for your work. The five-column version puts x directly beside 9, with y nearby; fractions use the dedicated template above. More functions and letters live on separate layers.
- **Moves:** enter a numeric nonzero value and apply addition, subtraction, multiplication or division to both sides of a selected equation. A new simplified line is created. This is an experiment, not a full algebra tutor.
- **Ink:** write at a comfortable size, then double-tap or tap **Convert**. Your drawing immediately moves into a saved batch, freeing the canvas so you can keep writing while one fast vision reader works. Smaller, editable math appears automatically at the left margin **inside the writing grid**, near the height where you wrote it—no separate strip, review or confirmation. Write to the right of a single-line equation and convert again to append that handwriting to the same editable equation; write below it to start another expression. Tap the whole equation to edit with the big numpad. Ink and typeset math pan together. **Undo** restores original ink; tap the math for **⋯ → Restore ink**, which also works after a reload. The same menu offers **→ Steps**. Colors, erase and two-finger scrolling still work. No ink shrinking.
- **Graph:** editable function plots, drag/pinch zoom, coordinate inspection, approximate straight-line/polygon snapping and shape labels. Radians for trigonometry. Not an implicit-equation plotter or geometry proof tool.
- **Question:** pin an image/screenshot or write the question. Drag the blue divider to resize. Math Academy opens separately. Use a line's ⋯ menu to copy plain math for pasting into the site's answer box. No direct Math Academy account integration.

Work is stored in the current browser's local storage. **Convert sends only a tightly cropped image of the handwriting to this Math Mode server, where a dedicated handwriting-math reader runs in memory.** Your question, screenshots, problem title and previous lines are not sent. Nothing goes to an outside AI company unless you tap **Slower AI read (Anthropic)** on a line; that sends only that line's cropped ink to Anthropic (Claude Sonnet 5.5). The server does not save or log handwriting or results. Original strokes stay saved locally beside each recognized line. No Math Academy login or analytics. Clearing browser data removes saved work. Problems are selected at the top, and ＋ creates another.

Ink mode has one writing line at the bottom. Write it, double-tap or press Convert, and keep writing to extend the same equation. **New line ↑** converts anything unfinished and moves the line up into *Previous lines* immediately, without waiting for recognition. Previous lines stay editable and keep their original ink.

Editing by hand, on the writing line: **pinch** to zoom (up to 4×; the pill at the top right resets); **tap** typed math to put the caret there and use the keypad; **scribble** (a zigzag) over symbols to delete them, or over unconverted ink to remove it; **write starting inside** an expression to insert at that spot (otherwise new ink is appended). The pink **Eraser** button (tap again for the pen) removes any handwritten stroke it touches and, when you lift your finger, any typed symbols it rubbed over. **✎** on a previous line makes it the writing line again. Undo reverses each of these.

The fast reader thickens thin phone strokes to the pen width it was trained on (about 3 px at 36 px character height). Without that, normal-size handwriting misread badly (a 6 became i). `tests/fixtures/phone-*.png` are those thin-stroke cases.

Recognition requires a private invite link supplied separately, not published in this repository. Opening it exchanges the invite for a secure browser cookie and removes the invite from the address bar. Drawing and typed math still work at the public link. Recognition can misread; it is applied automatically, so glance at the result and tap to correct it or restore the original. There is no second-model check. Without connectivity or if recognition fails, originals stay in the saved batch and can be restored using Undo or the row menu. Pending batches resume after refresh. There is no solving or arithmetic correction during transcription.

The ordinary phone keyboard should not appear when using the math number pad. Free-text question and reason entry do use it. Physical keyboards also work in the math fields.

## Development

No build step. A static HTTP server serving `app/` supports everything except recognition. The Node server in `server/server.mjs` adds the private recognition endpoint and serves only `app/` publicly. MathLive 0.111.1 and Compute Engine 0.153.0 are vendored, including fonts and licenses; no runtime CDN dependencies.

Recognition uses **BTTR** (a 6.5-million-parameter handwritten-math model trained on the CROHME 2014 dataset) through the MIT-licensed CrispEmbed engine v0.17.12, kept warm in a persistent worker (`server/local-ocr.py`, `server/local-recognizer.mjs`). Ink is cropped, normalized to a fixed character height and read in about 0.15–0.4 s on the server; the public phone-to-result round trip was **0.29–0.43 s** on three test fixtures (the previous Claude Sonnet path took 1.2–1.6 s). Low-confidence readings are marked and offer the slower AI read. High confidence does not guarantee correctness, and the published accuracy of this model on the CROHME benchmark is about 50% of whole expressions, so check each line. Set `MATH_MODE_ENGINE=local` to use it; otherwise the server uses Claude Sonnet 5.5 only.

The native library, model and Python environment live outside the repository in `~/.local/share/math-mode/ocr/` (`libcrispembed.so`, `libggml*.so.0`, `bttr.gguf` from `cstr/bttr-handwritten-math-GGUF`, `venv/` with Pillow, NumPy and SciPy). **The BTTR weights are licensed CC BY-NC-SA 3.0 (non-commercial); they are not committed or redistributed here.** See `server/licenses/`. No provider credentials enter browser code. `MATH_MODE_MODEL` overrides the slower reader's `provider/model`. The server creates a mode-0600 invite file at `~/.local/state/math-mode/recognition-invite`; `MATH_MODE_TOKEN_FILE` overrides its location. Never publish its contents. The private link is the public URL followed by `/#recognition=<invite>`.

Authentication, origin checks, image dimensions, payload size, concurrent requests, per-minute/hour budgets and model-call timeouts are enforced server-side. See [recognition state/safety traces](docs/recognition-state.md).

```sh
node --test app/core.test.js server/server.test.mjs
uv run --with playwright python test-phone.py
uv run --with playwright python tests/test-inline-math.py
# Focused eraser behavior + toolbar fit at three phone widths; no screenshots:
make test-eraser
# Requires the live service and a local private invite; calls real models:
uv run --with playwright python tests/test-current-line.py
uv run --with playwright python tests/test-live-recognition.py
```

The browser tests run headless Chromium at phone sizes, **not iOS Safari**. The deterministic suite starts/stops its temporary local HTTP server and explicitly mocks model results. It covers the numpad, fractions, blank/copy steps, both-side operations, shapes, automatic conversion, uninterrupted drawing, pen-down layout stability, math editing, Undo, failure recovery, stale asynchronous responses, refresh recovery and phone widths. `tests/test-ink-editing.py` checks tap-to-edit, scribble delete, insert-inside, pinch zoom and ✎. `tests/test-current-line.py` checks the confined writing line, New line, completed lines above, cross-line isolation, races and recovery. `MATH_MODE_TEST_LOCAL=1 node --test server/local-recognizer.test.mjs` runs the real local reader. The inline suite checks shared-grid placement, handwritten continuation, editing the combined equation, shared panning, unchanged canvas geometry and recoverable originals. The separate live test exercises actual local recognition through the public service with manually drawn vector fixtures: powers, a fraction equation and deliberately incorrect arithmetic that must remain uncorrected, plus a real handwritten +3 continuation joined into one editable equation. These are test fixtures, not Lance's handwriting. Real iPhone testing is still needed.

Original static concepts are in `mockups/`. The live app is in `app/`. Agentbox runs `server/server.mjs` through the `math-mode.service` user service on localhost port 8732, serving only `app/` plus the authenticated image-recognition API. The `math-mode-tunnel.service` user service exposes it through a Cloudflare quick tunnel. Both are deliberately left available for phone testing. Stop them with `systemctl --user stop math-mode-tunnel.service math-mode.service` when no longer needed. To retrieve the current address: `journalctl --user -u math-mode-tunnel.service --no-pager | grep trycloudflare.com`.

GitHub Pages was not used: this account inherits a custom domain pointing elsewhere. Tailscale's existing routes were not changed: this machine requires elevated privileges to edit its Serve configuration. Source is backed up at github.com/lancejohnson/math-mode-keyboard.

## Lesson prototype (intuition first)

`app/lesson/` (served at `/lesson/`) is a one-topic prototype for the course idea: graphing parabolas in vertex form. It has an interactive model you drag (vertex and shape handles), callouts for each defining feature (vertex, axis of symmetry, direction, the 1-4-9 step pattern, intercepts), a five-move recipe for reproducing the graph by hand, a word problem solved by fitting the model, a freehand sketch graded on those features, and an explain prompt. `tests/test-lesson.py` drives all of it at phone sizes (Chromium, not iOS).

## Trigonometry course (draft)

`app/trig/` is a trigonometry course built in the intuition-first style; the outline is in
`docs/trig-course.md`. Unit 1, angles and radians (`app/trig/unit1.html`), has six parts:
predict rounds, a model you drag to turn an angle (negative and multi-turn angles included),
a degrees-to-radians recipe, a bike-wheel problem, a drawn angle that is graded, and generated
practice with worked solutions. Test: `uv run -q --with playwright python tests/test-trig-unit1.py`.
