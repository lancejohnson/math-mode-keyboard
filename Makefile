.PHONY: test-eraser test-trig

# Focused headless phone regression; mocked recognition, no screenshots.
test-eraser:
	uv run -q --with playwright python tests/test-eraser.py

# Trig Unit 1 phone run (~27s; instant animations). Debug one path: make test-trig ARGS="--only 390 --topics 3"
test-trig:
	uv run -q --with playwright python tests/test-trig-unit1.py $(ARGS)
	node --test app/trig/facts.test.js
	uv run -q --with playwright python tests/test-trig-facts.py
