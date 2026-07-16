# Plan — Redesign of Duration and Completion Screens

## 1. Aesthetic Direction: Luxury Minimal & Liquid Glass Refraction
This design moves away from typical dark-mode templates by establishing a split-pane layout with high-contrast, editorial typography (`Instrument Serif`) and sophisticated glassmorphism (liquid glass refraction effects).

### DFII Evaluation
- **Aesthetic Impact**: 4.5/5 (Asymmetric layout, responsive panels, liquid glass refractions)
- **Context Fit**: 5/5 (Fits a premium minimalist Pomodoro timer)
- **Implementation Feasibility**: 4.5/5 (Plain HTML/CSS/JS is easy to update)
- **Performance Safety**: 5/5 (Pure CSS animations, hardware-accelerated transforms)
- **Consistency Risk**: 1/5 (Isolated to duration and completion screens)
- **DFII Score**: `(4.5 + 5 + 4.5 + 5) - 1 = +18` (Excellent, execute fully)

---

## 2. Design System Extensions
We will define custom theme modifications in `styles.css`:
- **Liquid Glass Border**: `1px solid rgba(255, 255, 255, 0.08)` with `box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.15)`
- **Dynamic Accent Colors**:
  - `ice`: `rgba(125, 211, 245, 0.3)`
  - `candle`: `rgba(245, 158, 66, 0.3)`
  - `tree`: `rgba(110, 231, 183, 0.3)`
  - `gallery`: `rgba(212, 168, 83, 0.3)`
- **Spring Easings**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (tactile spring physics)

---

## 3. Milestones & Task Breakdown

### Milestone 1: Codebase Analysis & Baseline Verification
- [ ] Inspect existing `index.html` structure.
- [ ] Verify existing CSS classes in `styles.css`.
- [ ] Confirm JavaScript references to ensure we don't break existing event listeners.

### Milestone 2: Duration Screen Redesign (`#screen-duration`)
- [ ] **HTML Refactoring**: Re-architect `#screen-duration` to split into two primary panels:
  - Left Panel: `.duration-visual-pane` showing a large interactive glass dial indicator, the selected vibe title, and large serif numbers for selected minutes.
  - Right Panel: `.duration-select-pane` containing the presets stack, custom selector, and "Start Focus" button.
- [ ] **CSS Refactoring**:
  - Implement split layout with responsive flex/grid.
  - Re-style `.dur-pill` elements as asymmetric tablets.
  - Build spring-based interactive states for hover, focus, and selection.
  - Style custom duration input as a premium minimalist dial.
  - Remove neon purple shadows (`#7c3aed` box-shadows) and apply liquid glass refractions.

### Milestone 3: Completion Screen Redesign (`#screen-complete`)
- [ ] **HTML Refactoring**: Re-architect `#screen-complete` to use an asymmetric bento layout:
  - Main Panel: `.complete-canvas-pane` for the trophy glyph floating over liquid glass overlays.
  - Sidebar Panel: `.complete-actions-pane` for stats display, restart, and follower action links.
- [ ] **CSS Refactoring**:
  - Implement bento grid layout.
  - Re-style floating trophy `.complete-trophy` with dynamic shadow and spring physics.
  - Style stat card `.complete-stat-card` to use fine glass refractions.
  - Refine restart button and LinkedIn button aesthetics.

### Milestone 4: Verification & Rubric Audit
- [ ] Verify that all features work: selecting presets, custom input limit, starting timer, completing timer, and restarting.
- [ ] Spawn Reviewer to test and run visual/functional audits.
- [ ] Score the result against the design-taste-frontend rubric to ensure at least an 8/10.

---

## 4. Anti-Patterns to Avoid
- No symmetrical 2x2 or 3-column layouts.
- No purple glow box-shadows (`#7c3aed`).
- No generic SaaS buttons (e.g. solid purple background with rounded corners).
- Ensure mobile layout collapses gracefully into a clean vertical flow.
