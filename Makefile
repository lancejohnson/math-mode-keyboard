.PHONY: test-eraser

# Focused headless phone regression; mocked recognition, no screenshots.
test-eraser:
	uv run -q --with playwright python tests/test-eraser.py
