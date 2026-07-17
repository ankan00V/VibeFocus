# Project: VibeFocus Pomodoro UI Redesign (Follow-up)

## Architecture
VibeFocus is a static frontend Pomodoro application. The user flows from the Landing Screen (`screen-hero`) to Vibe Selection (`screen-vibe`), then to Duration Selection (`screen-duration`), Focus Screen (`screen-focus`), and finally the Completion Screen (`screen-complete`).

This project redesigns `#screen-duration` and `#screen-complete` in `index.html` and `styles.css` according to a strict visual spec, while preserving all JavaScript bindings in `app.js` and supporting 4 distinct variants on the completion screen.

## Code Layout
- `index.html` - HTML structure for all screens
- `styles.css` - UI layout, animations, typography, and glassmorphism styling
- `app.js` - State machine, event handlers, audio/video, and confetti rendering

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Baseline Verification | Read code, verify selectors & state variables | None | DONE |
| 2 | Redesign Duration Screen | Implement circular dial as physical instrument, brass rim, lit handle, soft bg | M1 | PLANNED |
| 3 | Redesign Completion Screen | Implement left/right split, 4 variants, ceremony animations, stacked right cards | M2 | PLANNED |
| 4 | Verification & Audit | Interactive testing, design-taste validation, and victory review | M3 | PLANNED |

## Interface Contracts
The JavaScript file `app.js` interacts with the DOM elements via direct IDs and class selectors:
- `#screen-duration`: active state class toggled
- `#btn-back-vibe`: event listener for back action
- `#selected-vibe-label`: textContent updated on vibe selection
- `.dur-pill`: list of clickable presets
  - `#dur-25`, `#dur-45`, `#dur-60`, `#dur-90`: presets
  - `#dur-custom`: custom duration pill
  - `#custom-minutes`: custom minutes input field
- `#btn-start`: start timer button
- `#screen-complete`: active state class toggled
- `#confetti-canvas`: canvas element resized and rendered on completion
- `#complete-time-display`: displays final completed duration
- `#btn-restart`: event listener to go back to hero screen

All redesigned HTML elements must preserve these exact IDs, class selectors, and structural data attributes (`data-minutes` on presets, etc.).

For the 4 completion variants, `app.js` has a `state.vibe` which determines the current vibe (e.g. `'ice'`, `'candle'`, `'tree'`, `'gallery'`). The completion screen variants can be styled or animated using class names corresponding to the active vibe (e.g., `#screen-complete.vibe-ice`, `#screen-complete.vibe-candle`, etc.) or similar selectors since `app.js` sets the body or screen classes or we can bind to `state.vibe` or the selected vibe. We need to check how `app.js` sets or manages active vibes!
