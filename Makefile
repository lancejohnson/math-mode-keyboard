.PHONY: kelly-answer test-eraser test-trig test-trig-specific trig-unit1 trig-facts-unit trig-facts trig-map trig-nav kelly-unit kelly kelly-answer bug ask

# Focused headless phone regression; mocked recognition, no screenshots.
test-eraser:
	uv run -q --with playwright python tests/test-eraser.py

# pass-cache (~/.pi/agent/bin): a step that already passed on the same app/trig + test file is skipped
# (docs-only edits, re-checks before commit). PASS_CACHE=0 make test-trig forces a full run.
PASS = $(if $(shell command -v pass-cache),pass-cache --in app/trig --in app/kelly --in app/kb.js --in app/ink-answer.js --in app/nav.js --in app/bug.js --in app/ask.js --in server/ask.mjs --in server/server.mjs --in tests/pwfast.py --in $(1) --,)

# Trig suite (~40 s; the four steps run in parallel, output grouped per step). Browser steps use
# tests/pwfast.py: 2 s waits (PW_TIMEOUT=ms to change), a failing step stops in ~4 s and its last
# stderr lines name the test line, error, page errors, state and a FAIL screenshot.
# While editing one assert, run only its part instead of the whole suite:
#   make test-trig-specific   targeted wrong-way / swipe / parse checks at 390 (~5 s)
#   make test-trig ARGS="--part mastery|sizes|specific" or ARGS="--only 390 --topics 3"
test-trig:
	@$(MAKE) --no-print-directory -j7 -O trig-unit1 trig-facts-unit trig-facts trig-map trig-nav kelly-unit kelly kelly-answer bug ask

test-trig-specific:
	uv run -q --with playwright python tests/test-trig-unit1.py --part specific

trig-unit1:
	$(call PASS,tests/test-trig-unit1.py) uv run -q --with playwright python tests/test-trig-unit1.py $(ARGS)
trig-facts-unit:
	$(call PASS,app/trig/drill.test.js) node --test app/trig/facts.test.js app/trig/drill.test.js
trig-facts:
	$(call PASS,tests/test-trig-facts.py) uv run -q --with playwright python tests/test-trig-facts.py
trig-map:
	$(call PASS,tests/test-trig-map.py) uv run -q --with playwright python tests/test-trig-map.py
trig-nav:
	$(call PASS,tests/test-nav.py) uv run -q --with playwright python tests/test-nav.py
kelly-unit:
	$(call PASS,app/kelly/kelly.test.js) node --test app/kelly/kelly.test.js
kelly:
	$(call PASS,tests/test-kelly.py) uv run -q --with playwright python tests/test-kelly.py
kelly-answer:
	$(call PASS,tests/test-kelly-answer.py) uv run -q --with playwright python tests/test-kelly-answer.py

# Bug button + rolling recording (app/bug.js, server /api/recording + /api/bug) against a fake Relay daemon.
bug:
	$(call PASS,tests/test-bug.py) uv run -q --with playwright python tests/test-bug.py

# Lesson chat (app/ask.js, server /api/ask) with a fake model behind the real server.
ask:
	$(call PASS,tests/test-ask.py) uv run -q --with playwright python tests/test-ask.py
