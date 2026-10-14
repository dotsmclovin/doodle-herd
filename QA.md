# Doodle Herd verification

Prototype verification, 14 October 2026

## Passed

- JavaScript syntax: `node --check engine.js` and `node --check app.js`
- 21 deterministic engine tests: `node --test engine.test.js`
  - Nearest-neighbor pursuit and comfortable stopping distance
  - Move-away behavior inside the 145 px neighbor range
  - Seeded wandering and deterministic replay
  - 20-creature cap without rejected-add mutation
  - Paused-state immutability and reset behavior
  - Overlap separation, finite positions, edge bounds, resizes, and 1 px worlds
  - Browser-compatible UMD export without a DOM
- 17 mocked-DOM app integration tests: `node --test app.test.js`
  - Three-example startup, empty release guard, exact multicolor stroke preservation, and scaled pad coordinates
  - Single-dot drawings, undo, clear, rule selection, repeated examples, and cap enforcement
  - Reset IDs with draft preservation; pause/play and inspector selection
  - Reduced-motion startup and live changes; pointer cancellation, extra-pointer rejection, visibility recovery
  - These tests execute app.js in Node VM with DOM/canvas/event mocks, not a browser
- Combined suite: 38 tests passed, zero failed
- Standalone generation: `node build.mjs`
- Standalone HTML parsed successfully with unique element IDs and no external assets
- All 18 directly referenced app element IDs exist in the source HTML
- Source review found no network-request, cookie, persistent-storage, or service-worker APIs

## Browser and device verification limits

A deployed desktop render was inspected. Full real-browser interaction, physical touch/pen behavior, and mobile-layout QA remain unverified. Automated and mocked-DOM checks are not substitutes for browser/device testing.

Before describing the app as visually verified on a device, open the standalone file or an authorized hosted preview there and check:

1. The three initial creatures render and move
2. Draw multiple strokes with a mouse or finger, switch colors, undo, and clear
3. Choose each rule and release the exact drawing into the herd
4. Select a creature by tapping and by the keyboard-accessible dropdown; check rule, status, and target line
5. Pause/play, repeat examples to the cap of 20, and reset to three
6. At a narrow mobile width, no controls are clipped or horizontally overflow
7. With reduced motion enabled, the app starts paused

## Artifact scope

No third-party dependencies, accounts, keys, wallets, payments, persistence, sharing, or remote intelligence. The authored prototype is a local HTML/CSS/Canvas/JavaScript app. These implementation checks do not certify behavior on every device or browser.
