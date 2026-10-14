# Recognition state and safety

Only the cropped ink image goes to a single fast vision reader: Anthropic Claude Sonnet 5.5 by default. No question, problem title, previous steps, browser storage, credential or agent tool is part of the model context. The prompt instructs faithful transcription, not solving; wrong written math must stay wrong. The former independent second reader and confirmation flow are deliberately removed for speed. Automatic recognition can misread: tap math to correct it, or restore the saved original. An uncertain reading colors its row menu yellow and exposes the warning there; it does not stop writing.

## Successful conversion and uninterrupted writing

1. Initially `problem = {strokes: S, inkConversions: C}`.
2. Convert records an Undo snapshot, adds `{id: G, status: pending, lines: [], strokes: S}` to `C`, and clears only `problem.strokes`. Originals are saved immediately; the canvas is never locked. A compact left-aligned “Reading…” row occupies the batch's place.
3. The user writes `T` on the freed canvas while the bounded request runs. The server validates authentication, origin, PNG and budgets, then makes one transcription call without enabled reasoning. It does not solve or correct math.
4. The response updates only group `G`, looked up by id in its original problem. It sets `status: ready` and editable lines. No confirmation or replacement of `T` occurs. The output is left-aligned above the canvas; action buttons are tucked into ⋯. Subsequent strokes and existing field focus are preserved.
5. If a finger is still drawing or scrolling with two fingers, the changed row waits to render until pointer release, avoiding a mid-stroke canvas-origin shift.
6. Undo first removes any newer handwriting, then restores the pre-conversion snapshot. Snapshots containing old pending states are reconciled with completed results, not needlessly re-read. Corrections to surviving math rows are kept when undoing handwriting.
7. After reload, ⋯ → Restore ink recovers original vectors. If unrelated handwriting exists, it is preserved and restored ink is placed below it. Saved pending batches automatically resume; completed batches do not get resent.

## Problem switch and stale responses

1. A request belongs to a specific problem object and group id. Switching to problem B does not cancel problem A's saved batch: A may finish in the background, without altering B.
2. Undo or Restore ink removes a group; reconciliation aborts its request. Even if transport ignores abort, a result is rejected when its controller is aborted, its job identity changed, or its group no longer exists.
3. A fresh conversion uses a new id. A late old response cannot create a group, overwrite new handwriting, replace another reading, or close the keyboard while another row is being edited.
4. The client runs at most two requests and queues other pending batches. Server concurrency remains bounded separately.

## Failure and recovery

A network failure, timeout, authentication error, unreadable diagram, malformed result or exhausted budget sets the batch to `failed`, leaving its original vectors saved. It does not erase unrelated current handwriting or open a confirmation dialog. The row offers Retry and Restore ink under ⋯; Undo also remains available. Retrying reuses only that batch's original strokes. Failure status is reconciled into old pending Undo snapshots so they do not spin or automatically retry forever.

## Access and retention

Recognition requires the separate random invite at `~/.local/state/math-mode/recognition-invite`, mode 0600. The fragment invite is exchanged for a secure HttpOnly SameSite cookie and removed from the address bar; queued requests await that exchange. Neither model credentials nor the invite enter client source. Only a narrow image endpoint is exposed, not arbitrary prompts, models or server files. Limits: two concurrent server requests, 30 requests/minute, 600/hour, bounded PNG/body size and 30-second model timeout. The client has a 32-second request timeout and bounded authentication/status requests.

The server does not persist or log handwriting images/results. Provider data handling still applies. Raw drawings, recognized math and recovery vectors persist in browser local storage. Clearing browser data removes them. Undo history resets on reload; saved originals remain recoverable.

## Verification and latency

Node tests cover faithful parsing, incorrect arithmetic, exactly one model call with no enabled reasoning, private access, origins, static boundaries, payload limits, failures and quotas. Phone-size Chromium tests use explicit model mocks and exercise automatic application, immediate continued writing, deferred reflow while drawing, editing, recovery, refresh, Undo reconciliation and late-response races. `tests/test-live-recognition.py` separately exercises the real public service with manually drawn powers, a fraction and deliberately incorrect arithmetic, writing fresh ink while each request runs and recovering exact original vectors.

The real public-service run measured 1.73, 1.11 and 1.02 seconds for those three conversions, respectively. A small direct comparison put Sonnet 5.5 at 1.1–1.5 seconds and Sonnet 4.5 at 1.4–1.7 seconds. These are a few test fixtures, not a benchmark establishing best recognition accuracy or a latency guarantee. They are not Lance's handwriting. Chromium phone viewports are not iOS Safari.
