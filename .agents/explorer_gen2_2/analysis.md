# VibeFocus screen-complete Redesign Analysis & Structure Proposal

This report outlines a complete re-architecting of the VibeFocus completion screen (`#screen-complete`) to transition from a three-card bento grid to an elegant, high-craft split layout. It defines custom visuals, typography stacks, animations, and CSS-only active state detection for four distinct aesthetic experiences: Painting (Quiet Dawn), Candle (Golden Hour), Water Bowl (Still Water), and Tree (Deep Woods).

---

## 1. Architectural Blueprint: The Split Layout

The new layout divides `#screen-complete` into two main columns on desktop, transitioning to a single-column stack on mobile.

```
┌───────────────────────────────────────┬───────────────────────────────────────┐
│                                       │                                       │
│             LEFT PANEL                │             RIGHT PANEL               │
│                                       │                                       │
│          [ Hero Visual ]              │       ┌───────────────────────┐       │
│      (Painting, Candle, Water,        │       │   TOTAL FOCUS TIME    │       │
│             or Tree)                  │       │      25 minutes       │       │
│                                       │       └───────────────────────┘       │
│                                       │       ┌───────────────────────┐       │
│        Masterpiece Unlocked.          │       │     RITUAL RESET      │       │
│     Deep work pays off. Well done.    │       │                       │       │
│                                       │       │    [ Begin Again ]    │       │
│                                       │       └───────────────────────┘       │
│                                       │                                       │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

### A. Design Rationale
- **Left Panel (Aesthetic Focus)**: Devoted entirely to sensory reward. It hosts an active, animated physical metaphor (hero visual) and the Display Typography. By isolating the visual metaphor, we enhance immersion and alignment with the app's premium, cinematic theme.
- **Right Panel (Utility Stack)**: Houses two stacked frosted glass cards. This organizes metrics (Total Focus Time) separately from actions (Ritual Reset / Begin Again), following clean material boundary guidelines.
- **Responsiveness**: Switches to vertical stacking at `768px` wide, ensuring usability on tablets and mobile screens while preserving typography scale ratios.

---

## 2. Redesigned HTML Structure

Below is the proposed markup for `#screen-complete`. This structure retains all crucial JS-bound IDs (`#screen-complete`, `#complete-time-display`, `#btn-restart`, `#confetti-canvas`) to ensure that `app.js` runs perfectly without modifications.

```html
<!-- SCREEN 4 · Completion Screen -->
<section id="screen-complete" class="screen" aria-label="Session complete">
  <!-- Confetti particle engine remains unchanged -->
  <canvas id="confetti-canvas" aria-hidden="true"></canvas>
  
  <div class="complete-inner split-layout">
    
    <!-- LEFT PANEL: Hero Visual & Typography Stack per Variant -->
    <div class="complete-left-panel">
      
      <!-- Variant 1: Painting (Quiet Dawn) -->
      <div class="complete-variant-group painting-variant">
        <div class="hero-visual painting-visual">
          <div class="canvas-art">
            <svg class="artwork-painting" viewBox="0 0 320 240" aria-hidden="true">
              <defs>
                <linearGradient id="art-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#1e1b4b" />
                  <stop offset="40%" stop-color="#4c1d95" />
                  <stop offset="80%" stop-color="#db2777" />
                  <stop offset="100%" stop-color="#f59e0b" />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" rx="16" fill="url(#art-gradient)" />
              <circle cx="200" cy="100" r="45" fill="#f59e0b" opacity="0.85" filter="blur(2px)"/>
              <path d="M 0 180 Q 80 120 160 180 T 320 180 L 320 240 L 0 240 Z" fill="#0f172a" opacity="0.9" />
              <path d="M 0 200 Q 120 150 240 210 T 320 200 L 320 240 L 0 240 Z" fill="#020617" />
            </svg>
            <div class="unrevealed-patch" aria-hidden="true"></div>
            <div class="light-bloom-overlay" aria-hidden="true"></div>
          </div>
        </div>
        <div class="typography-stack">
          <h2 class="complete-heading">Masterpiece Unlocked.</h2>
          <p class="complete-sub">Deep work pays off. Well done.</p>
        </div>
      </div>

      <!-- Variant 2: Candle (Golden Hour) -->
      <div class="complete-variant-group candle-variant">
        <div class="hero-visual candle-visual">
          <div class="candle-chamber">
            <div class="candle-holder">
              <svg viewBox="0 0 120 180" class="candle-holder-svg" aria-hidden="true">
                <path d="M20 160 L100 160 Q100 175 85 175 L35 175 Q20 175 20 160 Z" fill="#b45309" />
                <rect x="48" y="70" width="24" height="90" rx="3" fill="#fef3c7" />
              </svg>
            </div>
            <div class="candle-wick" aria-hidden="true"></div>
            <div class="candle-flame" aria-hidden="true"></div>
            <div class="candle-glow" aria-hidden="true"></div>
          </div>
        </div>
        <div class="typography-stack">
          <h2 class="complete-heading">Flame Kept.</h2>
          <p class="complete-sub">Your focus didn't flicker. Well done.</p>
        </div>
      </div>

      <!-- Variant 3: Water Bowl (Still Water) -->
      <div class="complete-variant-group water-variant">
        <div class="hero-visual water-visual">
          <div class="water-container">
            <div class="water-surface">
              <div class="water-ripple ripple-1" aria-hidden="true"></div>
              <div class="water-ripple ripple-2" aria-hidden="true"></div>
              <div class="water-bloom-glow" aria-hidden="true"></div>
            </div>
          </div>
        </div>
        <div class="typography-stack">
          <h2 class="complete-heading">Stillness Reached.</h2>
          <p class="complete-sub">Nothing spilled. Nothing rushed.</p>
        </div>
      </div>

      <!-- Variant 4: Tree (Deep Woods) -->
      <div class="complete-variant-group tree-variant">
        <div class="hero-visual tree-visual">
          <div class="tree-scene">
            <svg class="tree-svg" viewBox="0 0 200 200" aria-hidden="true">
              <path d="M 100 200 C 100 160 102 130 106 110 C 110 90 114 70 106 62 C 98 54 90 62 82 70" fill="none" stroke="#78350f" stroke-width="6" stroke-linecap="round" />
              <path d="M 106 110 C 90 95 78 95 66 102" fill="none" stroke="#78350f" stroke-width="3" stroke-linecap="round" />
              <path d="M 107 95 C 121 80 137 84 149 95" fill="none" stroke="#78350f" stroke-width="3" stroke-linecap="round" />
            </svg>
            <div class="foliage-stage-1" aria-hidden="true"></div>
            <div class="foliage-stage-final" aria-hidden="true"></div>
            <div class="dappled-light-effect" aria-hidden="true"></div>
          </div>
        </div>
        <div class="typography-stack">
          <h2 class="complete-heading">Roots Deepened.</h2>
          <p class="complete-sub">Growth takes time. This was time well spent.</p>
        </div>
      </div>

    </div>

    <!-- RIGHT PANEL: Stacked Glass Cards -->
    <div class="complete-right-panel">
      
      <!-- Card 1: Total Focus Time -->
      <div class="complete-glass-card complete-stats-card">
        <span class="stat-label">Total Focus Time</span>
        <h1 class="stat-value" id="complete-time-display">25 minutes</h1>
        <div class="metrology-line" aria-hidden="true"></div>
      </div>

      <!-- Card 2: Ritual Reset -->
      <div class="complete-glass-card complete-action-card">
        <div class="action-card-header">
          <span class="stat-label">Ritual Reset</span>
          <p class="action-subtext">Return to presence when ready.</p>
        </div>

        <button id="btn-restart" class="btn-restart" aria-label="Begin a new focus session">
          <span>Begin Again</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
          </svg>
        </button>

        <div class="complete-follow">
          <p class="complete-follow-text">Built by Ankan — follow the journey</p>
          <a href="https://www.linkedin.com/in/ghoshankan/" target="_blank" rel="noopener noreferrer" class="complete-follow-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            <span>Connect on LinkedIn</span>
          </a>
        </div>
      </div>

    </div>

  </div>
</section>
```

---

## 3. CSS Variant State Detection

To display the correct variant content and trigger animations dynamically, we leverage the modern CSS `:has()` selector. When a vibe is selected, the application state toggles the class `.selected` on the corresponding option button in Screen 1 (`#screen-vibe`). 

Here are the mappings to detect the active variant:
- **`gallery` (Painting - Quiet Dawn)**: Active when `#vibe-gallery.selected` is present.
- **`candle` (Candle - Golden Hour)**: Active when `#vibe-candle.selected` is present.
- **`ice` (Water Bowl - Still Water)**: Active when `#vibe-ice.selected` is present.
- **`tree` (Tree - Deep Woods)**: Active when `#vibe-tree.selected` is present.

### CSS State Rules
```css
/* 1. By default, hide all variant groups inside Left Panel */
.complete-variant-group {
  display: none;
  width: 100%;
}

/* 2. Show corresponding variant when selected */
body:has(#vibe-gallery.selected) #screen-complete .painting-variant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

body:has(#vibe-candle.selected) #screen-complete .candle-variant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

body:has(#vibe-ice.selected) #screen-complete .water-variant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

body:has(#vibe-tree.selected) #screen-complete .tree-variant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
```

---

## 4. Typography & Material styling

Our redesign follows the strict visual rules outlined in the design specification:

```css
/* --- Material System: Frosted Glass Cards --- */
.complete-glass-card {
  position: relative;
  background: rgba(255, 255, 255, 0.07); /* 0.06–0.1 fill */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15); /* 1px white border */
  border-radius: 20px; /* 16–20px radius */
  padding: 2.5rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.4s var(--ease), box-shadow 0.4s var(--ease);
}

/* Soft inner top reflection highlight */
.complete-glass-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
  pointer-events: none;
}

/* Accent Glow meshes */
.complete-glass-card::after {
  content: '';
  position: absolute;
  top: -15%; right: -15%;
  width: 50%; height: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.02) 0%, transparent 70%);
  pointer-events: none;
}

/* --- Typography --- */

/* Display Headlines (Italic Serif, tight leading) */
.complete-heading {
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  font-weight: 400;
  font-size: 3.8rem;
  line-height: 1.05;
  color: #fff;
  letter-spacing: -0.01em;
  margin-top: 1.75rem;
}

/* Subhead (Sans-serif, clean hierarchy) */
.complete-sub {
  font-family: var(--font-sans);
  font-size: 1.05rem;
  font-weight: 400;
  color: var(--text-dim);
  margin-top: 0.65rem;
  line-height: 1.5;
}

/* Tracked Labels, Stats Metadata, Buttons (11-13px, ~0.15em letter-spacing) */
.stat-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--text-dim);
}

.action-subtext {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-faint);
  margin-top: 0.25rem;
}

.complete-follow-text {
  font-family: var(--font-sans);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-faint);
}

/* Metrology display */
.complete-stats-card .stat-value {
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  font-size: 4rem;
  font-weight: 400;
  color: #fff;
  line-height: 1;
  margin-top: 0.5rem;
  text-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Primary Button (Violet Gradient) */
.btn-restart {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 1.1rem;
  border-radius: var(--r-pill);
  border: none;
  background: linear-gradient(135deg, #6d28d9 0%, #7c3aed 40%, #9d6cf0 100%);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.2);
  transition: transform 0.4s var(--ease), box-shadow 0.4s var(--ease);
}

.btn-restart span {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

.btn-restart:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(124, 58, 237, 0.35);
}

.btn-restart:active {
  transform: scale(0.98);
}
```

---

## 5. CSS Ceremony Animations & Motion Specs

All variants animate "on load" by targeting `#screen-complete.active`.

### Headline Easing Motion (Shared)
When the complete screen fades in, the headline slides up `12px` and transitions in opacity.
```css
#screen-complete.active .complete-heading {
  animation: complete-headline-up 1.1s cubic-bezier(0.25, 1, 0.5, 1) 0.15s both;
}

#screen-complete.active .complete-sub {
  animation: complete-subhead-in 1.3s cubic-bezier(0.25, 1, 0.5, 1) 0.3s both;
}

@keyframes complete-headline-up {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes complete-subhead-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
```

---

### Variant Ceremony Motions

#### A. Painting (Quiet Dawn)
The canvas art fades the dark, blurred "unrevealed" block while a warm, golden radial spotlight sweep rolls across the painting.
```css
.painting-visual .canvas-art {
  position: relative;
  width: 320px;
  height: 200px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0,0,0,0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.painting-visual .unrevealed-patch {
  position: absolute;
  inset: 0;
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(8px);
  z-index: 2;
}

.painting-visual .light-bloom-overlay {
  position: absolute;
  inset: -50%;
  background: radial-gradient(circle, rgba(253, 224, 71, 0.25) 0%, transparent 60%);
  pointer-events: none;
  z-index: 3;
  opacity: 0;
  mix-blend-mode: screen;
}

/* Animations */
#screen-complete.active .painting-variant .unrevealed-patch {
  animation: painting-patch-dissolve 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

#screen-complete.active .painting-variant .light-bloom-overlay {
  animation: painting-bloom-sweep 1.4s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes painting-patch-dissolve {
  0% { opacity: 0.95; filter: blur(8px); }
  100% { opacity: 0; filter: blur(0); pointer-events: none; }
}

@keyframes painting-bloom-sweep {
  0% { opacity: 0; transform: scale(0.8) translate(-20%, -20%); }
  45% { opacity: 1; }
  100% { opacity: 0.4; transform: scale(1) translate(0%, 0%); }
}
```

#### B. Candle (Golden Hour)
The candle flame flares up from a small scale, then transitions into a slow, warm flicker with a pulsing ambient aura.
```css
.candle-visual {
  position: relative;
  width: 320px;
  height: 200px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.candle-chamber {
  position: relative;
  width: 100px;
  height: 160px;
}

.candle-holder {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.candle-wick {
  position: absolute;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 8px;
  background: #1e293b;
}

.candle-flame {
  position: absolute;
  bottom: 96px;
  left: 50%;
  width: 14px;
  height: 26px;
  background: radial-gradient(ellipse at bottom, #fff 20%, #f97316 60%, #b91c1c 100%);
  border-radius: 50% 50% 20% 20%;
  transform: translateX(-50%) scale(0.1);
  transform-origin: bottom center;
  opacity: 0;
  box-shadow: 0 0 20px rgba(249, 115, 22, 0.6);
}

.candle-glow {
  position: absolute;
  bottom: 60px;
  left: 50%;
  width: 120px;
  height: 120px;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.2) 0%, transparent 70%);
  transform: translate(-50%) scale(0.5);
  opacity: 0;
  pointer-events: none;
}

/* Animations */
#screen-complete.active .candle-variant .candle-flame {
  animation: 
    candle-ignite 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
    candle-flicker 2.5s ease-in-out infinite 1s;
}

#screen-complete.active .candle-variant .candle-glow {
  animation: 
    candle-glow-bloom 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards,
    candle-glow-pulse 4s ease-in-out infinite 1.2s;
}

@keyframes candle-ignite {
  0% { transform: translateX(-50%) scale(0.1); opacity: 0; }
  85% { transform: translateX(-50%) scale(1.3); opacity: 1; }
  100% { transform: translateX(-50%) scale(1); opacity: 1; }
}

@keyframes candle-glow-bloom {
  0% { transform: translate(-50%, -15px) scale(0.2); opacity: 0; }
  100% { transform: translate(-50%, -15px) scale(1); opacity: 1; }
}

@keyframes candle-flicker {
  0%, 100% { transform: translateX(-50%) scale(1) rotate(-1deg); }
  50% { transform: translateX(-50%) scale(1.04) rotate(1.5deg); }
}

@keyframes candle-glow-pulse {
  0%, 100% { opacity: 0.8; transform: translate(-50%, -15px) scale(1); }
  50% { opacity: 0.95; transform: translate(-50%, -15px) scale(1.08); }
}
```

#### C. Water Bowl (Still Water)
Concentric light ripples propagate outward from the center and settle to a completely calm surface reflecting a soft, warm light.
```css
.water-visual {
  position: relative;
  width: 320px;
  height: 200px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.water-container {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(14, 116, 144, 0.15) 0%, rgba(8, 47, 73, 0.4) 100%);
  border: 2px solid rgba(255, 255, 255, 0.15);
  box-shadow: 
    0 12px 36px rgba(0,0,0,0.5),
    inset 0 4px 12px rgba(255, 255, 255, 0.15);
  overflow: hidden;
  position: relative;
}

.water-surface {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.water-ripple {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  transform: scale(0);
  opacity: 0;
  pointer-events: none;
}

.water-bloom-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(125, 211, 245, 0.18) 0%, transparent 70%);
  opacity: 0;
  pointer-events: none;
}

/* Animations */
#screen-complete.active .water-variant .ripple-1 {
  animation: water-ripple-spread 1.6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
}

#screen-complete.active .water-variant .ripple-2 {
  animation: water-ripple-spread 1.6s cubic-bezier(0.1, 0.8, 0.3, 1) 0.25s forwards;
}

#screen-complete.active .water-variant .water-bloom-glow {
  animation: water-bloom-in 1.4s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes water-ripple-spread {
  0% { transform: scale(0); opacity: 0.9; }
  50% { opacity: 0.45; }
  100% { transform: scale(8.5); opacity: 0; }
}

@keyframes water-bloom-in {
  0% { opacity: 0; }
  60% { opacity: 1; }
  100% { opacity: 0.65; }
}
```

#### D. Tree (Deep Woods)
The foliage layers representing the final growth stage scale up and settle, overlaid with shifting dappled shadows.
```css
.tree-visual {
  position: relative;
  width: 320px;
  height: 200px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.tree-scene {
  position: relative;
  width: 180px;
  height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.tree-svg {
  position: absolute;
  bottom: 0;
  z-index: 1;
}

.foliage-stage-1 {
  position: absolute;
  bottom: 50px;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.15);
  filter: blur(8px);
  z-index: 2;
}

.foliage-stage-final {
  position: absolute;
  bottom: 45px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(52, 211, 153, 0.4) 0%, rgba(4, 120, 87, 0.25) 100%);
  filter: blur(3px);
  border: 1px solid rgba(255,255,255,0.06);
  transform: scale(0.65);
  opacity: 0;
  z-index: 3;
}

.dappled-light-effect {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at top left, rgba(253, 224, 71, 0.12) 0%, transparent 60%),
              radial-gradient(ellipse at bottom right, rgba(16, 185, 129, 0.08) 0%, transparent 60%);
  opacity: 0;
  pointer-events: none;
  z-index: 4;
}

/* Animations */
#screen-complete.active .tree-variant .foliage-stage-final {
  animation: tree-growth 1.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

#screen-complete.active .tree-variant .dappled-light-effect {
  animation: 
    tree-light-fade 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards,
    tree-light-shift 8s ease-in-out infinite 1.2s;
}

@keyframes tree-growth {
  0% { transform: scale(0.6) translateY(12px); opacity: 0; filter: blur(6px); }
  100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(3px); }
}

@keyframes tree-light-fade {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes tree-light-shift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-8px, 8px) scale(1.06); }
}
```

---

## 6. Responsive Adaptation (Mobile & Tablet)

To guarantee that the redesign fits smaller form factors:
```css
@media (max-width: 768px) {
  .complete-inner.split-layout {
    grid-template-columns: 1fr;
    gap: 2rem;
    padding: 1.5rem 1rem;
    text-align: center;
    overflow-y: auto;
  }
  
  .complete-left-panel {
    align-items: center;
  }
  
  .hero-visual {
    margin: 0 auto;
  }

  .complete-heading {
    font-size: 2.8rem;
    margin-top: 1.2rem;
  }

  .complete-sub {
    font-size: 0.95rem;
  }

  .complete-glass-card {
    padding: 1.75rem;
  }
}
```
This preserves the alignment and aesthetic depth of the design on smaller viewports by scaling typography and converting to a centered stacked layout.
