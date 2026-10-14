# Recognition state and safety

Only the cropped ink image is sent to two independent vision readers (OpenAI GPT-6.1 Sol and Anthropic Claude Opus 5.5). No question, problem title, previous steps, browser storage, credential or agent tool is part of the model context. The prompt instructs faithful transcription, not solving; wrong written math must stay wrong. This is a chosen high-quality prototype pipeline, not a benchmark claiming superiority to every specialist recognizer.

## Concrete trace: successful conversion

1. `problem = {strokes: S, inkConversions: C}`, `recognizer = {sequence: 0, busy: false, preview: null}`.
2. Convert snapshots `S`, captures problem id and fingerprint, sets `sequence: 1, busy: true`. Raw strokes and converted groups remain unchanged. The canvas is locked while busy.
3. Server validates the private cookie, same origin, bounded PNG, concurrency and request budgets. Two readers receive the same high-contrast cropped image independently; neither sees the other's interpretation.
4. Server returns both interpretations when they differ; no algebraic simplification decides between readings. A failed second reader is explicitly reported as an unavailable independent check, not agreement.
5. Client checks sequence, problem id and unchanged `S`, then sets `busy: false, preview: P`. User edits/selects the preview. `problem` remains `{strokes: S, inkConversions: C}`.
6. Use this math pushes `{strokes: S, inkConversions: C, pan}` to undo history, adds `{lines: edited P, strokes: S}` to `C`, and sets raw strokes to `[]`. Original vectors stay in the saved conversion group. The user writes a fresh large expression underneath the editable typeset rows.
7. Undo restores the snapshot exactly. After a reload, Restore ink still recovers the saved original vectors. An unrelated current drawing is preserved and restored strokes are placed below it rather than replacing it.

## Concrete trace: problem switch during a request

1. Request `sequence: 4` is reading problem A; `problem A.strokes = S` unchanged.
2. Select problem B. Cancel aborts the request, clears the preview and sets `sequence: 5`; current problem becomes B.
3. A late result for request 4 observes `4 !== 5` and does nothing. Its finally block also does nothing to request 5's state. Neither A's nor B's work is overwritten.

## Concrete trace: failure or cancellation

1. Input strokes remain in local storage throughout network work.
2. A timeout, authentication error, provider failure, Keep ink, Undo, Clear or tab/problem switch cancels the pending conversion or preview. A result cannot overwrite a later state.
3. No conversion group is created until explicit Use this math. No unreadable diagram is guessed into a solution.

## Access and retention

Recognition is restricted to a separate randomly generated invite kept outside the repository at `~/.local/state/math-mode/recognition-invite`, mode 0600. The invite URL uses a fragment, is exchanged for a secure HttpOnly SameSite cookie, then removed from the address bar. Neither model credentials nor the invite are included in client source. Only the app's narrow image endpoint is exposed; users cannot select arbitrary prompts/models or access server files. Concurrent requests, per-minute requests, hourly quota, PNG dimensions, payload size and request duration are bounded.

The server does not persist or log handwriting images/results. Provider data handling still applies. Raw drawings, recognized math and recovery strokes persist in the phone browser's local storage. Browser storage clearing removes them. In-memory undo history resets on reload; saved originals remain recoverable using Restore ink.

## Tests

Node tests exercise parsing, preserving wrong math, differing readers, failures, access controls, origin checks, static-file boundaries and quotas. Phone-size Chromium tests mock model outputs to deterministically exercise preview/edit/disagreement/undo/error paths. `tests/test-live-recognition.py` separately exercises real models through the public service using manually drawn vector fixtures. These are test fixtures, not samples of Lance's handwriting, and Chromium is not iOS Safari.
