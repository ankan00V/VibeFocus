# VibeFocus Redesign Analysis & Proposal — `#screen-duration`

This document details the read-only investigation and the proposed HTML and CSS redesign for the VibeFocus Pomodoro application's duration selection screen (`#screen-duration`).

---

## 1. Summary of Findings

1. **Current Layout Structure**: The current duration screen (`#screen-duration`) consists of a 42%/58% grid split container (`.dur-split-container`). The left panel houses a liquid glass bubble dial, and the right panel houses a simple 2-column bento-like grid (`.dur-pills`) containing 5 options (25m, 45m, 60m, 90m, and custom).
2. **Visual Slop / Flat Elements**: The current styling is somewhat flat, using basic semi-transparent cards and a simple CSS dashed border for the circular dial's orbit track. The orbiting handle is a flat white dot that rotates around the circle.
3. **No-JS State Engine**: The screen currently displays the chosen duration inside the dial using CSS `:has()` rules. This functions by checking if a `.dur-pill` has the `.selected` class (updated by click events in `app.js`) and injecting that time as the `content` of the `.dial-display-time::after` pseudo-element. If the custom selector is active, it falls back to reading `data-custom-val` from the `.dial-display-time` attribute, which is modified by `app.js` when the custom input changes.

---

## 2. Redesign Architecture Objectives

The redesign focuses on high-fidelity, physical, and staggered metaphors to match VibeFocus's premium, mindfulness-focused aesthetics:

1. **Asymmetric Split Pane & Softened Background**:
   - The layout ratio will be adjusted to `45% / 55%` for a more deliberate asymmetric aesthetic.
   - The background video layer (`.hero-bg`) will be moved out of `#screen-hero` to the `body` level. A CSS `:has()` override on `body` will soften it with `filter: blur(14px) saturate(0.85) brightness(0.45)` and pull it back using `transform: scale(1.08)` to simulate cinematic depth of field and a vignette when the duration screen is active.
2. **Physical Instrument Dial**:
   - A highly detailed metallic brass rim (`.dial-brass-rim`) using high-contrast linear gradients and multiple shadows to create physical beveling.
   - 12 radial physical tick marks (`.dial-ticks`), highlighting the cardinal focus points (3, 6, 9, 12 positions) with warm gold tones.
   - A lit gem handle (`.dial-orbit-dot`) featuring a nested light source and a golden casing riding the outer brass rim.
   - A slow, ambient 32-second drifting orbit animation (`dial-drift`) that breathes life into the gem handle when the screen is idle.
3. **Staggered Frosted Glass Cards**:
   - Break standard grid rigidity by staggering grid column widths across rows (Full width, 5/7 split, 7/5 split) and introducing subtle vertical alignment variation.
   - Cards will feature a big, italic serif time display (`pill-time`), followed by a hairline separator rule (`pill-hairline`), and a small tracked uppercase sans-serif label (`pill-tag`).
   - The "Recommended" card (`#dur-25`) will feature a diagonal corner ribbon (`.pill-ribbon`) that gives it a physical certificate/tag appearance.
4. **Selected Transition**:
   - Active cards will transition smoothly over 300ms, scaling up slightly (+2%) and glowing with a soft violet border and drop-shadow (`box-shadow`), while expanding the hairline separator to fill the width of the card.
5. **No-JS State Engine Integrity**:
   - Preserving and validating the `:has()` CSS selectors to automatically populate the dial display based on the selected card state.

---

## 3. Proposed HTML Structure

The following HTML snippet will replace the current structure inside `#screen-duration` in `index.html`. 

*Note: The global background video slot (`.hero-bg`) must be moved from its current location inside `<section id="screen-hero">` to be a direct child of `<body>` (e.g. just after `<div id="gradient-bg">`). This allows the video to render beneath all screens.*

```html
  <!-- ══════════════════════════════════════════
       SCREEN 2 · Duration Selection
  ══════════════════════════════════════════ -->
  <section id="screen-duration" class="screen" aria-label="Choose session duration">
    <div class="dur-split-container">
      
      <!-- LEFT PANEL: Physical Circular Dial Instrument -->
      <div class="dur-left-panel">
        <div class="glass-dial-wrapper">
          <div class="glass-dial-orb">
            
            <!-- Metallic Brass Rim -->
            <div class="dial-brass-rim" aria-hidden="true"></div>
            
            <!-- Physical Tick Marks (12 ticks, styled via CSS Custom Properties) -->
            <div class="dial-ticks" aria-hidden="true">
              <span class="tick" style="--r: 0deg;"></span>
              <span class="tick" style="--r: 30deg;"></span>
              <span class="tick" style="--r: 60deg;"></span>
              <span class="tick" style="--r: 90deg;"></span>
              <span class="tick" style="--r: 120deg;"></span>
              <span class="tick" style="--r: 150deg;"></span>
              <span class="tick" style="--r: 180deg;"></span>
              <span class="tick" style="--r: 210deg;"></span>
              <span class="tick" style="--r: 240deg;"></span>
              <span class="tick" style="--r: 270deg;"></span>
              <span class="tick" style="--r: 300deg;"></span>
              <span class="tick" style="--r: 330deg;"></span>
            </div>
            
            <!-- Ambient interior glows -->
            <div class="dial-glow-aura" aria-hidden="true"></div>
            <div class="dial-shimmer" aria-hidden="true"></div>
            
            <!-- Central Display Information -->
            <div class="dial-content">
              <!-- Bound to app.js for label text content updates -->
              <span class="dial-eyebrow" id="selected-vibe-label">WATER BOWL</span>
              
              <!-- Bound to CSS :has() for dynamic minutes display -->
              <h1 class="dial-display-time"></h1>
              
              <span class="dial-unit">minutes focus</span>
            </div>
            
            <!-- Orbiting micro-focus indicator / Lit Gem -->
            <div class="dial-orbit-track" aria-hidden="true">
              <div class="dial-orbit-dot"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT PANEL: Asymmetric Controls & Staggered Cards -->
      <div class="dur-right-panel">
        <button id="btn-back-vibe" class="btn-back" aria-label="Back to vibe selection">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          <span>Back</span>
        </button>

        <div class="dur-intro">
          <h2 class="dur-heading">How deep will you go?</h2>
          <p class="dur-subtitle">Select a duration to allocate your attention.</p>
        </div>

        <!-- Asymmetrical/Staggered Preset Grid -->
        <div class="dur-pills" role="group" aria-label="Duration options">
          
          <!-- Card 1: 25 Min Recommended (Full-width with Corner Ribbon) -->
          <button class="dur-pill preset-hero" id="dur-25" data-minutes="25" aria-label="25 minutes — Recommended Focus">
            <div class="pill-ribbon" aria-hidden="true">Recommended</div>
            <div class="pill-content">
              <span class="pill-time">25</span>
              <div class="pill-hairline"></div>
              <span class="pill-tag">Light Focus</span>
            </div>
          </button>
          
          <!-- Card 2: 45 Min (Left, Width: 41.6%) -->
          <button class="dur-pill" id="dur-45" data-minutes="45" aria-label="45 minutes — Deep Focus">
            <div class="pill-content">
              <span class="pill-time">45</span>
              <div class="pill-hairline"></div>
              <span class="pill-tag">Deep Session</span>
            </div>
          </button>
          
          <!-- Card 3: 60 Min (Right, Width: 58.3%) -->
          <button class="dur-pill" id="dur-60" data-minutes="60" aria-label="60 minutes — Serious Work">
            <div class="pill-content">
              <span class="pill-time">60</span>
              <div class="pill-hairline"></div>
              <span class="pill-tag">Serious Work</span>
            </div>
          </button>
          
          <!-- Card 4: 90 Min (Left, Width: 58.3%) -->
          <button class="dur-pill" id="dur-90" data-minutes="90" aria-label="90 minutes — Extreme Focus">
            <div class="pill-content">
              <span class="pill-time">90</span>
              <div class="pill-hairline"></div>
              <span class="pill-tag">Extreme Depth</span>
            </div>
          </button>
          
          <!-- Card 5: Custom Wide Input (Right, Width: 41.6%) -->
          <button class="dur-pill custom-wide" id="dur-custom" aria-label="Custom duration">
            <div class="pill-content">
              <div class="custom-input-group">
                <input type="number" id="custom-minutes" min="1" max="120" value="10" />
                <span class="pill-unit">min</span>
              </div>
              <div class="pill-hairline"></div>
              <span class="pill-tag">Custom Window</span>
            </div>
          </button>
        </div>

        <!-- Action Button (Primary CTA - Violet Gradient Reserved) -->
        <button id="btn-start" class="btn-start" disabled aria-label="Start focus session">
          <span class="btn-start-label">Start Focus</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
          <div class="btn-start-pulse" aria-hidden="true"></div>
        </button>
      </div>

    </div>
  </section>
```

---

## 4. Proposed CSS Stylesheet

The following CSS selectors will override and extend the existing styles in `styles.css`.

```css
/* ─────────────────────────────────────────────────────────
   DURATION SELECTION REDESIGN (The physical Instrument)
   ───────────────────────────────────────────────────────── */

/* 1. Global Background Depth of Field Control */
body:has(#screen-duration.active) .hero-bg {
  opacity: 0.22 !important;
  visibility: visible !important;
  filter: blur(14px) saturate(0.85) brightness(0.45);
  transform: scale(1.08);
  transition: opacity 0.8s ease, filter 0.8s ease, transform 0.8s ease;
}

/* 2. Asymmetric Split Pane */
.dur-split-container {
  display: grid;
  grid-template-columns: 45% 55%; /* Asymmetrical aesthetic weighting */
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
  align-items: center;
}

.dur-left-panel {
  display: flex;
  justify-content: center;
  align-items: center;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  height: 100%;
  position: relative;
  padding: 4rem;
  background: radial-gradient(circle at 10% 30%, rgba(255, 255, 255, 0.01) 0%, transparent 70%);
}

.dur-right-panel {
  padding: 5rem 6.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  overflow-y: auto;
}

/* 3. The Physical Instrument Dial */
.glass-dial-wrapper {
  perspective: 1000px;
}

.glass-dial-orb {
  position: relative;
  width: 330px;
  height: 330px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.015) 60%, rgba(0, 0, 0, 0.35) 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: 
    0 35px 70px rgba(0, 0, 0, 0.6), 
    inset 0 10px 20px rgba(255, 255, 255, 0.08), 
    inset 0 -15px 30px rgba(0, 0, 0, 0.7);
  overflow: visible;
  will-change: transform;
}

/* Brass Metallic Rim */
.dial-brass-rim {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 6px solid transparent;
  background: linear-gradient(135deg, 
    #dfb668 0%, 
    #b28e46 20%, 
    #fff5d6 40%, 
    #8e6c27 60%, 
    #ffebad 80%, 
    #b28e46 100%) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  box-shadow: 
    inset 0 1.5px 2px rgba(255, 255, 255, 0.45),
    inset 0 -1.5px 2px rgba(0, 0, 0, 0.6),
    0 8px 24px rgba(0, 0, 0, 0.55),
    0 1px 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  z-index: 5;
}

/* Tick Marks (Radial lines around the center) */
.dial-ticks {
  position: absolute;
  inset: 16px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 2;
}

.tick {
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 6px;
  background: rgba(255, 255, 255, 0.12);
  transform: translateX(-50%) rotate(var(--r));
  transform-origin: 50% 149px; /* radius: (330px/2) - 16px = 149px */
}

/* Highlight cardinal positions (3, 6, 9, 12 o'clock) */
.tick:nth-child(3n+1) {
  width: 2px;
  height: 10px;
  background: rgba(223, 182, 104, 0.55);
}

/* Inner Ambient Refraction and Aura */
.dial-glow-aura {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(223, 182, 104, 0.05) 0%, transparent 70%);
  filter: blur(10px);
  pointer-events: none;
  z-index: 1;
}

.dial-shimmer {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.05) 0%, transparent 50%, rgba(255, 255, 255, 0.01) 100%);
  pointer-events: none;
  z-index: 3;
}

/* Lit Gem/Handle Riding the Rim Edge */
.dial-orbit-track {
  position: absolute;
  inset: -3px; /* Centers the gem riding precisely on the 6px brass rim */
  border-radius: 50%;
  pointer-events: none;
  z-index: 6;
  animation: dial-drift 42s linear infinite;
  will-change: transform;
}

.dial-orbit-dot {
  position: absolute;
  top: 0;
  left: 50%;
  width: 16px;
  height: 16px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px solid #dfb668; /* Golden metal bezel casing */
  /* Inner Glowing Gem Gradient */
  background: radial-gradient(circle at 35% 35%, #ffffff 0%, #a78bfa 40%, #7c3aed 70%, #4c1d95 100%);
  box-shadow: 
    0 0 10px rgba(124, 58, 237, 0.8),
    0 0 20px rgba(124, 58, 237, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.85),
    inset 0 -1.5px 2px rgba(0, 0, 0, 0.7);
}

@keyframes dial-drift {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 4. Staggered Preset Cards */
.dur-pills {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1.25rem;
  margin-top: 2.5rem;
  margin-bottom: 3.5rem;
  width: 100%;
}

.dur-pill {
  position: relative;
  grid-column: span 6; /* Base width */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1.75rem 1.5rem;
  border-radius: var(--r-md);
  border: 1px solid var(--glass-border);
  background: rgba(18, 18, 22, 0.35);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  cursor: pointer;
  overflow: hidden;
  outline: none;
  transition: 
    border-color 0.3s cubic-bezier(0.25, 1, 0.5, 1),
    background 0.3s cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 0.3s cubic-bezier(0.25, 1, 0.5, 1),
    transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}

/* Fine-edge specular top highlight */
.dur-pill::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid transparent;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, transparent 60%) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  z-index: 1;
}

/* Staggered Grid Pattern Allocation */
#dur-25 {
  grid-column: span 12; /* Hero Recommended pill takes full width */
}

#dur-45 {
  grid-column: span 5; /* Left, 41.6% column width */
}

#dur-60 {
  grid-column: span 7; /* Right, 58.3% column width */
}

#dur-90 {
  grid-column: span 7; /* Left, 58.3% column width */
}

#dur-custom {
  grid-column: span 5; /* Right, 41.6% column width */
}

/* Diagonal Recommended Corner Ribbon */
.pill-ribbon {
  position: absolute;
  top: 14px;
  right: -28px;
  background: linear-gradient(135deg, #dfb668 0%, #a8843c 100%);
  color: #06060a;
  font-family: var(--font-sans);
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 3px 28px;
  transform: rotate(45deg);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  z-index: 10;
  pointer-events: none;
}

/* Card Content Arrangement */
.pill-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  z-index: 2;
}

/* Typography (Shared DNA) */
.pill-time {
  font-family: 'Instrument Serif', serif;
  font-size: 3.2rem;
  font-weight: 400;
  font-style: italic;
  line-height: 1;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 0.25rem;
  transition: color 0.3s ease;
}

.preset-hero .pill-time {
  font-size: 4rem;
}

/* Hairline Rule */
.pill-hairline {
  width: 32px;
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0.6rem 0;
  transition: background-color 0.3s ease, width 0.3s ease;
}

.preset-hero .pill-hairline {
  width: 50px;
}

.pill-tag {
  font-family: var(--font-sans);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 0.15rem;
  transition: color 0.3s ease;
}

/* Custom Input Styling */
.custom-input-group {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

#custom-minutes {
  background: transparent;
  border: none;
  border-bottom: 1.5px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  font-family: 'Instrument Serif', serif;
  font-size: 2.2rem;
  font-weight: 400;
  font-style: italic;
  width: 60px;
  text-align: center;
  padding: 0 0 2px 0;
  margin: 0;
  outline: none;
  transition: border-color 0.3s ease;
}

#custom-minutes:focus {
  border-color: rgba(223, 182, 104, 0.6); /* Gold focus underline */
}

/* 5. Hover and Selected States (300ms transitions) */
.dur-pill:hover,
.dur-pill:focus-visible {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-2px);
  box-shadow: 
    0 12px 24px rgba(0, 0, 0, 0.45),
    inset 0 1px 1px rgba(255, 255, 255, 0.08);
}

.dur-pill.selected {
  border-color: rgba(139, 92, 246, 0.5); /* Soft violet glow border */
  background: rgba(139, 92, 246, 0.03);
  transform: translateY(-2px) scale(1.02); /* Slight scale-up */
  box-shadow: 
    0 0 24px rgba(139, 92, 246, 0.25), /* Soft violet outer glow */
    0 12px 32px rgba(0, 0, 0, 0.5);
}

.dur-pill.selected .pill-time {
  color: #fff;
  text-shadow: 0 0 16px rgba(255, 255, 255, 0.25);
}

.dur-pill.selected .pill-hairline {
  background-color: rgba(139, 92, 246, 0.4);
  width: 70%; /* Line expands dynamically on selection */
}

.dur-pill.selected .pill-tag {
  color: #fff;
}

/* 6. State Engine via :has() (Displays selected time inside the dial) */
#screen-duration:has(#dur-25.selected) .dial-display-time::after { content: '25'; }
#screen-duration:has(#dur-45.selected) .dial-display-time::after { content: '45'; }
#screen-duration:has(#dur-60.selected) .dial-display-time::after { content: '60'; }
#screen-duration:has(#dur-90.selected) .dial-display-time::after { content: '90'; }
#screen-duration:has(#dur-custom.selected) .dial-display-time::after { content: attr(data-custom-val); }
```

---

## 5. Verification of the CSS `:has()` Selector Rules

The `:has()` state engine functions seamlessly because `app.js` is already coded to manage class selection. When any card is selected:

1. `app.js` listens to click events on elements with `.dur-pill` class.
2. It removes the `.selected` class from all `.dur-pill` items, then adds it to the target element.
3. The parent `#screen-duration` matches the CSS `:has()` criteria matching the specific selected card ID (e.g., `#dur-25.selected`).
4. The CSS engine changes the dynamic `::after` content on the child `.dial-display-time` element to display the preset number.
5. If custom is selected, `app.js` reads the numeric input value and sets `data-custom-val="[number]"` directly on `.dial-display-time` using `setAttribute()`. The CSS engine grabs this dynamically updated attribute via `content: attr(data-custom-val)` inside the `:has(#dur-custom.selected)` wrapper.
6. This structure remains **fully functional with zero changes** to the `app.js` codebase, completely confirming functional parity.
