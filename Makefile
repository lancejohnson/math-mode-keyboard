.PHONY: test-eraser test-trig

# Focused headless phone regression; mocked recognition, no screenshots.
test-eraser:
	uv run -q --with playwright python tests/test-eraser.py

# pass-cache (~/.pi/agent/bin): a step that already passed on the same app/trig + test file is skipped
# (docs-only edits, re-checks before commit). PASS_CACHE=0 make test-trig forces a full run.
PASS = $(if $(shell command -v pass-cache),pass-cache --in app/trig --in $(1) --,)

# Trig Unit 1 phone run (~30s; instant animations). Debug one path: make test-trig ARGS="--only 390 --topics 3"
test-trig:
	$(call PASS,tests/test-trig-unit1.py) uv run -q --with playwright python tests/test-trig-unit1.py $(ARGS)
	$(call PASS,app/trig/facts.test.js) node --test app/trig/facts.test.js
	$(call PASS,tests/test-trig-facts.py) uv run -q --with playwright python tests/test-trig-facts.py
	$(call PASS,tests/test-trig-map.py) uv run -q --with playwright python tests/test-trig-map.py
