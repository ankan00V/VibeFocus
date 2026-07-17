# VibeFocus Styling Guidelines and DOM Integrity Specifications

## Executive Summary
This document defines the Shared DNA design tokens, photography, and motion guidelines for the VibeFocus Pomodoro application redesign of the duration selector (`#screen-duration`) and completion (`#screen-complete`) screens. It establishes a rigorous verification checklist of all DOM selectors, IDs, and attributes queried by `app.js` to ensure the visual overhaul integrates seamlessly without breaking existing functionality.

---

## 1. Design Tokens (The Shared DNA)

To achieve a coherent, premium aesthetic, all redesigned components must strictly adhere to the following design tokens. Mixed typography or flat opaque elements are prohibited.

### Typography
*   **Display Headlines (Italic Serif)**:
    *   **Font Family**: `'Instrument Serif'`, `serif` (or `'Playfair Display'` fallback).
    *   **Font Style**: `italic`.
    *   **Leading (Line Height)**: Tight leading, strictly `1.0` to `1.1` to create an elegant, editorial silhouette.
    *   **Letter Spacing**: Negative tracking, `0.02em` to `-0.03em`.
    *   **Visual Weight**: Light/regular (e.g., `font-weight: 400`).
*   **Labels, Stats Labels, and Buttons (Tracked Sans-Serif)**:
    *   **Font Family**: `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `'Segoe UI'`, `sans-serif` (referenced as `var(--font-sans)`).
    *   **Text Transform**: `uppercase`.
    *   **Letter Spacing (Tracking)**: Extended tracking, strictly `0.1em` to `0.35em` (e.g., `letter-spacing: 0.15em`).
    *   **Font Size**: Compact, strictly `11px` to `13px` (`0.7rem` to `0.8rem`).
    *   **Font Weight**: Semibold (`font-weight: 600` or `700`) for high-contrast legibility.

### Materials (Frosted Glass panels)
*   **Background Fill**: High-translucency white fill, `rgba(255, 255, 255, 0.06)` to `rgba(255, 255, 255, 0.1)`. (Never flat opaque or pure solid backgrounds).
*   **Backdrop Filter**: Deep blur, `backdrop-filter: blur(20px) saturate(180%)`.
*   **Borders**: 1px thin borders, `rgba(255, 255, 255, 0.15)`.
*   **Specular Highlights**: A linear top light gradient to simulate refraction, e.g.,:
    ```css
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%);
    ```
    Or a border gradient on the top edge using pseudo-elements:
    ```css
    border-top: 1px solid rgba(255, 255, 255, 0.25);
    ```
*   **Shadows**: Deep, physical, and ambient shadows. Use a blend of dark drop shadows and inner occlusion:
    ```css
    box-shadow: 
      0 12px 40px rgba(0, 0, 0, 0.4), 
      inset 0 1px 1px rgba(255, 255, 255, 0.12),
      inset 0 -1px 8px rgba(0, 0, 0, 0.6);
    ```
*   **Corner Radii**: Generous rounded corners, `16px` to `20px` (or `var(--r-md)` / `var(--r-lg)`).

### Color Grading (Warm Golden-Hour)
*   **Shadow Tone**: Dark, desaturated slate and charcoal shadows (no high-saturation purple or blue glows). Shadows should feel physically grounded.
*   **Text & Accents**: Cream/off-white (`#faf9f6` or `var(--text)`) for main text. Warm gold accents (`#d4a853` or `var(--gallery)`) for focus rings, tick marks, and subtle highlight details.
*   **Violet Gradient Restriction**: The signature purple-to-violet gradient (`linear-gradient(135deg, #6d28d9 0%, #7c3aed 40%, #9d6cf0 100%)`) is strictly restricted to primary Call-To-Action (CTA) buttons:
    *   `#btn-start` (Start Focus button on `#screen-duration`)
    *   `#btn-restart` (Begin Again button on `#screen-complete`)
    *   *No other elements, cards, text, or backgrounds may use this gradient.*

---

## 2. Background and Photography Guidelines

To preserve visual depth and transition cleanly from the landing page, the duration selector and completion screens must use the active vibe's cinematic video assets, but with a distinct, softened treatment.

### Background Softening Rules
*   **Removal of Window Frame**: The train-window frame (`.hero-overlay-png`) is exclusive to the landing screen (`#screen-hero`). It must not be displayed on the duration selector or completion screens.
*   **Cinematic Depth of Field**: Apply a high-radius blur filter directly to the background container when these screens are active, simulating a shallow camera depth of field.
    *   `filter: blur(20px) scale(1.05);` (the scale compensates for edge bleeding).
    *   This keeps the focus on the user interface while maintaining a soft connection to the selected scene.
*   **Heavy Vignette**: Add a dark vignette layer to draw attention to the center panel and enhance legibility.
    ```css
    background: radial-gradient(circle at center, transparent 30%, rgba(5, 5, 10, 0.75) 100%);
    ```

### Strategy for Background Persistence
Currently, `app.js` hides the background video layer (`.hero-bg`) when leaving the hero screen. To keep the video visible on subsequent screens:
1.  **CSS Transition**: Modify the CSS classes or JS transition in `goTo` to allow `.hero-bg` to remain visible during `'duration'` and `'complete'` modes, but append a blurring class (e.g., `.bg-softened`) to the container.
2.  **Opacity Adjustment**: Ensure the background opacity is set to ~0.7 to blend with a warm desaturated backplate layer.

---

## 3. Motion Physics Specification

Motion must feel ambient, calm, and deliberate. Bouncy, hyperactive, or mechanical animations are forbidden.

### Breathing Loops (2-3s Ease-In-Out)
*   **Dial Gem Orbit/Drift**: The lit handle or highlight gem on the brass dial rim should slowly oscillate or drift when idle (e.g., a +/- 3-degree drift or a slow breathing scale pulse of its glow aura over 3 seconds).
*   **Glass Panel Breathing**: Ambient pulses on card boundaries:
    ```css
    @keyframes panel-breathe {
      0%, 100% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35); }
      50% { box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45); }
    }
    ```

### Transition Mechanics
*   **No Spinners or Bounces**: Use heavily damped spring curves. The CSS `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) should govern sliding transitions.
*   **Selected State Transition**: When selecting a duration card, the transition to the soft violet border glow and scale-up (`scale(1.02)`) must ease in over `300ms` rather than snapping.
*   **Bento Grid Entrance (Completion Screen)**: Elements slide up sequentially from `translateY(16px)` with staggered animation delays (50ms intervals).

### Variant Ceremony Animations (On Load)
*   **Masterpiece (Quiet Dawn)**:
    *   *Visual*: Art canvas thumbnail on the left card.
    *   *Motion*: The final unrevealed canvas patch dissolves (opacity 0 -> 1) in tandem with a subtle, warm light-bloom sweep (`linear-gradient` moving horizontally).
*   **Flame Kept (Golden Hour)**:
    *   *Visual*: Stylized candle wick/candle flame vector.
    *   *Motion*: The flame element scales up from zero height (`transform: scaleY(0.1) translateY(10px)`) to full height over 1.2s, followed by a gentle horizontal flicker loop.
*   **Stillness Reached (Still Water)**:
    *   *Visual*: Water pool/bowl profile.
    *   *Motion*: A single circular ripple ring expands outwards (`transform: scale(0) -> scale(1.6)`, `opacity: 0.8 -> 0`) and settles back to a smooth, reflective glassy state.
*   **Roots Deepened (Deep Woods)**:
    *   *Visual*: Dappled canopy shadows.
    *   *Motion*: Staggered growth animation of branches (drawing stroke paths) while dappled lighting coordinates shifts.

---

## 4. DOM Selector & Javascript Integrity Checklist

To prevent regressions, the HTML structures and selectors used by `app.js` must remain intact. The following table maps every ID, class, and attribute that the JavaScript relies on.

| Selector / ID | Element Context | Role in `app.js` | Action / Constraints |
| :--- | :--- | :--- | :--- |
| `screen-duration` | `<section id="screen-duration">` | Target for duration screen selection. | Must exist as a transition target in the `screens` object. |
| `screen-complete` | `<section id="screen-complete">` | Target for completion screen display. | Must exist as a transition target in the `screens` object. |
| `selected-vibe-label` | `<span id="selected-vibe-label">` | Displays active vibe name on duration screen. | JS sets `textContent = vibeName.toUpperCase()`. Must be kept. |
| `custom-minutes` | `<input id="custom-minutes">` | Custom minutes number entry. | JS reads value, clamps it [1-120], and updates `state.minutes`. |
| `dur-custom` | `<button id="dur-custom">` | Custom duration button wrapper. | JS checks if `.selected` class is present; hooks click to focus input. |
| `.dur-pill` | `<button class="dur-pill">` | Preset duration pill collection. | JS adds click listeners to remove other selections and add `.selected`. |
| `data-minutes` | Attribute on `.dur-pill` | Defines time preset value (e.g. `25`, `45`). | JS queries `dataset.minutes`. Must preserve this attribute. |
| `data-custom-val` | Attribute on `.dial-display-time` | Storage for input custom value. | CSS `:has()` queries this to display custom time in the dial. |
| `dial-display-time` | `<h1 class="dial-display-time">` | Target for custom text representation. | Receives `data-custom-val` update via JS helper `updateDialCustom(val)`. |
| `btn-back-vibe` | `<button id="btn-back-vibe">` | Back to landing page action. | Click handler triggers transition back to `hero` screen. |
| `btn-start` | `<button id="btn-start">` | Start session action. | Click handler initializes audio and launches focus mode. Disabled when null. |
| `complete-time-display`| `<h1 id="complete-time-display">` | Renders elapsed focus duration. | JS sets `textContent` dynamically (e.g., `"25 minutes"`). |
| `btn-restart` | `<button id="btn-restart">` | Return to start / restart ritual. | Click handler cancels confetti and transitions to `hero` screen. |
| `confetti-canvas` | `<canvas id="confetti-canvas">` | Canvas overlay for particle physics. | JS resizes canvas and triggers random burst functions on load. |

---

## 5. Verification Checklist for Redesign Hand-Off

Prior to finalizing any style changes, verify:
- [ ] **No Flat Colors**: Check `#screen-duration` and `#screen-complete` backgrounds for solid flat declarations.
- [ ] **Material Compliance**: Confirm all cards use the frosted glass backdrop filter and translucency variables.
- [ ] **Font Cleanliness**: Inspect text files to guarantee display titles use `'Instrument Serif'` italic, and labels/stats labels/CTAs use `var(--font-sans)` in tracked uppercase.
- [ ] **Functional Selection**: Verify that clicking presets or entering a custom value correctly updates the `.dial-display-time` content via CSS `:has()` matching.
- [ ] **Start/Stop Integration**: Check that the Start button is correctly disabled until a preset is chosen, and that Back and Restart trigger transitions properly.
