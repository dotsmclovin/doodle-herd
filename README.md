# Doodle Herd

A tiny living sketchbook. Draw a creature, give it a simple movement rule, and let it join the herd.

## Open it

Open **doodle-herd.html** in a modern browser. This standalone file includes all styles and JavaScript, needs no installation, and works offline after download. Some mobile file viewers do not run HTML apps; use a browser that can open local HTML files.

For local development, from this folder run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then visit http://127.0.0.1:8765 in a browser on the **same computer**. A loopback URL on one machine does not provide a preview on another device.

## Play

- Draw with your mouse, finger, or pen; choose a color, undo the last stroke, or clear the pad
- Pick **Make friends**, **Need space**, or **Wander**, then press **Let it loose**
- The strokes you drew become the creature, scaled uniformly to fit the playground
- Tap a creature, or use **Meet the herd**, to inspect its actual rule, current target line, and status
- **Pause** freezes movement. **Examples** adds up to three sample creatures. **Reset** replaces the herd with the three original examples and leaves the current sketch in place
- The herd holds at most 20 creatures. Refresh starts over
- If your device requests reduced motion, the playground starts paused and the decorative bobbing is disabled

## What the rules do

- **Make friends:** Move toward the nearest neighbor and stop at a comfortable distance
- **Need space:** Move away from the nearest neighbor when it is within 145 playground pixels; otherwise stay put
- **Wander:** Follow a direction that changes using a seeded pseudo-random sequence

Every creature also gently separates from overlapping neighbors and avoids the edges. Status text reports when these adjustments apply. There is no language model, free-form prompt, learning, or remote intelligence.

## Privacy and scope

The app makes no network requests, uses no API keys, and does not save drawings or other state to local storage, cookies, or a backend. It has no accounts, payments, wallets, sharing, breeding, or export controls. Everything lives in the current tab and is lost on refresh.

## Development

No dependencies. Node 18+ is sufficient for the tests and standalone builder.

```sh
npm run check
npm test
node build.mjs
```

- `index.html`, `styles.css`, `app.js`: interface and drawing/playground rendering
- `engine.js`: dependency-free deterministic simulation, usable from Node and a browser
- `engine.test.js`, `app.test.js`: engine and mocked-DOM integration tests
- `doodle-herd.html`: generated standalone app; rebuild after editing source
- `QA.md`: verified checks and remaining browser/device verification limits

## Verification

The automated suite contains 38 passing tests (21 engine tests and 17 mocked-DOM interface tests). A deployed desktop render was inspected. Full real-browser interaction, physical touch/pen behavior, and mobile layout testing remain unverified. See `QA.md` for the scope and device checklist.

## Provenance and license

This is an AI-assisted prototype authored for this project. The runtime, tests, styles, and inline SVG drawings are included in this repository; there are no third-party runtime dependencies or external asset downloads.

MIT License. Copyright (c) 2026 dotsmclovin. See `LICENSE`.
