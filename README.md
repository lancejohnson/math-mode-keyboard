# Math Mode

A phone-first, live math scratchpad with a real large-key numpad, not a modified QWERTY keyboard.

Live prototype: https://individually-trustee-arnold-corners.trycloudflare.com/

This is a temporary Cloudflare Tunnel address. It remains live while the tunnel runs; a tunnel restart can change the URL.

## Try it

- **Steps:** enter math with the touch numpad. Fractions and powers are structured, editable notation. → exits a numerator, denominator or exponent. ↵ starts a blank next step. Hold Return for a moment and slide upward to copy the current line. Flick x/y upward for a square/cube; hold backspace to erase repeatedly.
- **4 wide / 5 compact:** switch between two number-pad layouts. The large version has four columns and separate navigation; the compact version makes more space for your work. The five-column version puts x directly beside 9, with y nearby; fractions use the dedicated template above. More functions and letters live on separate layers.
- **Moves:** enter a numeric nonzero value and apply addition, subtraction, multiplication or division to both sides of a selected equation. A new simplified line is created. This is an experiment, not a full algebra tutor.
- **Ink:** real finger/mouse drawing, colors, erase and undo. Undo is a large, always-visible button. Double-tap the canvas (or tap Shrink) to resize the current handwriting into a compact row and open fresh space underneath. Earlier compact rows keep their size. Undo reverses shrinking too. Two fingers scroll an endless page. This preserves your handwriting as smaller ink, not recognized typed text.
- **Graph:** editable function plots, drag/pinch zoom, coordinate inspection, approximate straight-line/polygon snapping and shape labels. Radians for trigonometry. Not an implicit-equation plotter or geometry proof tool.
- **Question:** pin an image/screenshot or write the question. Drag the blue divider to resize. Math Academy opens separately. Use a line's ⋯ menu to copy plain math for pasting into the site's answer box. No direct Math Academy account integration.

Work is stored in the current browser's local storage; it is not uploaded. GitHub hosts the public app source and assets, not your work. No login or analytics. Browser data clearing removes saved work. Problems are selected at the top, and ＋ creates another.

The ordinary phone keyboard should not appear when using the math number pad. Free-text question and reason entry do use it. Physical keyboards also work in the math fields.

## Development

No build step. Serve `app/` with any static HTTP server. MathLive 0.111.1 and Compute Engine 0.153.0 are vendored, including fonts and licenses; no runtime CDN dependencies.

```sh
node --test app/core.test.js
uv run --with playwright python test-phone.py
```

The browser tests run headless Chromium at phone sizes, **not iOS Safari**. They start and stop their own temporary local HTTP server. They cover the numpad, structured fractions, cursor movement, blank steps, hold-and-slide copying, both-side operations, shape drawing, handwriting shrinking/undo, storage and phone widths.

Original static concepts are in `mockups/`. The live app is in `app/`. Agentbox hosts only `app/` through the `math-mode.service` user service on localhost port 8732. The `math-mode-tunnel.service` user service exposes it through a Cloudflare quick tunnel. Both are deliberately left available for phone testing. Stop them with `systemctl --user stop math-mode-tunnel.service math-mode.service` when no longer needed. To retrieve the current address: `journalctl --user -u math-mode-tunnel.service --no-pager | grep trycloudflare.com`.

GitHub Pages was not used: this account inherits a custom domain pointing elsewhere. Tailscale's existing routes were not changed: this machine requires elevated privileges to edit its Serve configuration. Source is backed up at github.com/lancejohnson/math-mode-keyboard.
