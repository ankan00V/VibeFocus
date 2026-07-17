# Original User Request

## Follow-up — 2026-07-17T03:03:08Z

Redesign the duration selection and completion screens of the VibeFocus Pomodoro application to be visually stunning, industry-grade, and perfectly aligned with the app's premium, immersive aesthetic according to a strict visual spec.

Working directory: /Users/ankanghosh/Desktop/projects/timer timer
Integrity mode: development

## Requirements

### R1. Shared DNA (Typography, Materials, Colors, Motion)
- **Typography:** Italic serif for display headlines (large, tight leading); tracked-uppercase sans-serif for labels, stats, buttons (11–13px, ~0.15em letter-spacing). No mixed systems.
- **Material:** Frosted glass panels (`rgba(255,255,255,0.06–0.1)` fill, `backdrop-filter: blur(20px)`, 1px `rgba(255,255,255,0.15)` border, 16–20px radius, soft inner top highlight). Never flat opaque cards or flat solid-color backgrounds.
- **Color Grading:** Warm golden-hour grade everywhere (desaturated shadows, warm highlights). Cream/off-white for text, gold as secondary accent. Violet gradient is reserved ONLY for the primary CTA button.
- **Motion Physics:** Slow, ambient, breathing (2–3s ease-in-out loops, gentle parallax). No spinners, no bounce. 
- **Photography:** Cinematic depth of field. No flat color backgrounds.

### R2. Duration Selector ("The Instrument")
- Do NOT reuse the landing page's train-window framing. Pull back the background photo and soften it (shallow depth of field, vignette).
- **Hero Object:** The circular dial must be rendered as a physical instrument (brass rim, tick marks, a lit handle/gem riding the edge, real gradient and shadow), not a flat SVG ring. The lit handle drifts slowly around the rim when idle.
- **Duration Cards:** Use the shared glass material. Consistent template: big serif number, hairline rule, tracked label. "Recommended" is a small ribbon integrated into the card corner.
- **Selected State:** Soft violet glow at the border + slight scale-up (300ms glow-in), not a snap or simple shade change.

### R3. Completion Screen ("The Arrival" - 4 Variants)
- No train frame or window mullions. The user is *inside* the scene. 
- **Shared Layout:** Left: hero visual + italic serif headline + sans subhead. Right: two stacked glass cards ("TOTAL FOCUS TIME" and "RITUAL RESET" with "Begin Again").
- **Ceremony Motion (on load):** 800ms–1.2s light-bloom animation (unique per variant), timed with the headline easing up 12px into place.
- **Variants:**
  - *Painting (Quiet Dawn):* Close up in front of finished painting, soft gallery light. Headline: "Masterpiece Unlocked." Subhead: "Deep work pays off. Well done." Motion: Last unrevealed patch dissolves as light bloom crosses canvas.
  - *Candle (Golden Hour):* Intimate low-light interior. Headline: "Flame Kept." Subhead: "Your focus didn't flicker. Well done." Motion: Flame grows from ember height to full with warm pulse.
  - *Water Bowl (Still Water):* Close on water surface. Headline: "Stillness Reached." Subhead: "Nothing spilled. Nothing rushed." Motion: One ripple crosses the surface and settles.
  - *Tree (Deep Woods):* Wide natural framing, dappled light. Headline: "Roots Deepened." Subhead: "Growth takes time. This was time well spent." Motion: Final growth stage eases in, dappled light shifts.

### R4. Scope Strictness
- Modify ONLY `#screen-duration` and `#screen-complete`. 
- Do NOT modify the landing page or onboarding modal. Extend existing CSS rather than starting a new styling approach.

## Acceptance Criteria

### Visual Consistency & Constraints
- [ ] No flat solid-color backgrounds exist on `#screen-duration` or `#screen-complete`.
- [ ] No flat opaque cards are used; all cards use the frosted glass mixin.
- [ ] Violet gradient is strictly confined to primary CTA buttons.
- [ ] The train-window frame from the landing page is not present on either the duration or completion screens.

### Design Taste Independent Evaluation
- [ ] An agent-as-judge using the `design-taste-frontend` skill evaluates the two screens and scores them at least 9/10 for strict adherence to the typography, material, and motion DNA outlined above.
- [ ] The evaluation confirms the absence of generic "slop" patterns (e.g., standard symmetric flex-box cards, default UI glow effects) in favor of the bespoke, physical "instrument" and "arrival" metaphors.

### Functional Completeness
- [ ] The circular dial on the duration screen features a lit handle/gem that animates smoothly.
- [ ] The completion screen dynamically displays one of four distinct scenes and ceremony animations based on the `variant` state, while preserving the structural right-column glass cards across all four.
