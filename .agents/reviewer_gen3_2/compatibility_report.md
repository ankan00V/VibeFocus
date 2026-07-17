# Compatibility & Functional Behavior Review Report

## Review Summary

**Verdict**: REQUEST_CHANGES

**Summary**: While the Pomodoro UI redesign introduces highly polished visual elements, a critical regression was introduced on the landing/hero page. Relocating the global background container `.hero-bg` from inside `#screen-hero` to the body level, combined with `#screen-hero`'s solid black background styling (`background: #000` with `z-index: 10`), results in a solid black background on the landing page, completely blocking the ambient video loops and the interactive Spline 3D canvas. Additionally, the new design relies heavily on the CSS parent selector `:has()`. While modern browser support is wide (~93-98%), there are no fallback behaviors for unsupported browsers, which would lead to critical layout failures (e.g., missing timer digits and empty completion variants). All JS event listeners and bindings remain functional and unbroken.

---

## Findings

### [Critical] Finding 1: Landing Page Background Regression (Covered by Solid Black `#screen-hero`)
- **What**: The background video container `.hero-bg` was moved to the body level to remain visible behind transparent screens during duration selection and session completion. However, `#screen-hero` retains `background: #000;` and `z-index: 10;`.
- **Where**: `index.html` (lines 37-58) and `styles.css` (line 2317)
- **Why**: Since `.hero-bg` (at body level, `z-index: 0`) and `#spline-bg` (at body level, `z-index: 1`) have lower stacking contexts than `#screen-hero` (at body level, `z-index: 10`), the solid black background of `#screen-hero` completely covers them. This renders the landing page completely black instead of displaying the immersive video loops or the Spline 3D background.
- **Suggestion**: In `styles.css` (line 2317), change the background of `#screen-hero` to transparent:
  ```css
  #screen-hero {
    ...
    background: transparent;
    ...
  }
  ```

### [Major] Finding 2: Lack of Fallback for CSS Parent Selector `:has()`
- **What**: The redesign utilizes CSS `:has()` for critical state management, such as showing completion variants (`body:has(#vibe-candle.selected)`) and injecting selected timer digits inside the dial (`#screen-duration:has(#dur-25.selected) .dial-display-time::after`).
- **Where**: `styles.css` (lines 535, 1027-1032, 1262, 1311-1333, 1900, 2831, 2839)
- **Why**: On browsers that do not support `:has()` (e.g., Firefox < 121, older Chrome/Safari/Edge, or some mobile/webview browsers), the selected timer digits will not appear in the central dial, and the completion screen will display an empty left panel with no variant graphics or typography.
- **Suggestion**: Implement fallback styles using `@supports not selector(:has(*))` or standard class-based selectors managed via JS to ensure graceful degradation. For example, adding classes like `vibe-selected-[name]` or `duration-selected-[minutes]` to the parent screen container via JS when selected.

---

## Verified Claims

- **Claim**: All event listeners and DOM queries in `app.js` remain fully functional and unbroken.
  - **Verification Method**: Checked all queried IDs and selectors in `app.js` (including `#screen-duration`, `#btn-back-vibe`, `#selected-vibe-label`, `.dur-pill` presets, `#btn-start`, `#screen-complete`, `#confetti-canvas`, `#complete-time-display`, `#btn-restart`, and custom duration inputs `#custom-minutes` and `#dur-custom`) against the modified `index.html` structure.
  - **Result**: **PASS**. All queried IDs, element classes, and event listener bindings are correctly preserved in the HTML structure.

- **Claim**: The onboarding modal (`#how-it-works-modal`) remains completely untouched in the current modifications.
  - **Verification Method**: Ran git diff on `index.html` and `styles.css` specifically checking the HTML modal template and the `.hiw-modal-*` styles.
  - **Result**: **PASS**. The onboarding modal elements, content, classes, and styles are identical to their state in `HEAD` and completely untouched.

---

## Coverage Gaps
- **Internet Explorer & Obsolete WebViews** — risk level: **LOW** — recommendation: Accept risk as the app targets premium modern web experiences.
- **Dynamic JS-based Fallbacks** — risk level: **MEDIUM** — recommendation: Implement class-based state classes on screen wrappers to remove the dependency on `:has()` for rendering critical text (like timer digits) and visual completion variants.

---

## Unverified Items
- **Actual video autoplay behaviors on iOS/Safari in Low Power Mode** — reason not verified: Requires physical hardware testing to verify if strict iOS low-power policies block the newly relocated body-level background videos from playing seamlessly.
