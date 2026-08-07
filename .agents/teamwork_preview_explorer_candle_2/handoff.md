# Candle Vibe & Timer Lifecycle 3D Integration Analysis Report

## 1. Observation

Direct code observations from inspecting `/Users/ankanghosh/Desktop/projects/timer timer/index.html`, `app.js`, `styles.css`, `water-bowl-3d.js`, and `tree-3d.js`:

### A. File Inclusions in `index.html`
- **3D Scripts Inclusions (`index.html:587-590`)**:
  ```html
  587:   <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  588:   <script src="water-bowl-3d.js"></script>
  589:   <script src="tree-3d.js"></script>
  590:   <script src="app.js"></script>
  ```
  `candle-3d.js` is currently **not included**.

- **Vibe Selector (`index.html:237-246`)**:
  ```html
  237:   <button class="vibe-card" id="vibe-candle" data-vibe="candle" aria-label="Select Candle">
  238:     <div class="card-glow-ring"></div>
  239:     <div class="vibe-canvas-wrap" aria-hidden="true">
  240:       <canvas class="vibe-preview" id="preview-candle" width="160" height="180"></canvas>
  241:     </div>
  242:     <div class="vibe-label-wrap">
  243:       <span class="vibe-name">Candle</span>
  244:       <span class="vibe-sub">Burns with quiet purpose</span>
  245:     </div>
  246:   </button>
  ```

- **Completion Visual Canvas Stack (`index.html:460-464`)**:
  ```html
  460:   <div class="hero-visual">
  461:     <canvas id="complete-canvas" aria-hidden="true"></canvas>
  462:     <canvas id="water-bowl-canvas" aria-hidden="true" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>
  463:     <canvas id="tree-canvas" aria-hidden="true" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>
  464:   </div>
  ```
  `#candle-canvas` is **missing** from `.hero-visual`.

- **Completion Variant Group (`index.html:475-480`)**:
  ```html
  475:   <div class="complete-variant-group candle-variant">
  476:     <div class="typography-stack">
  477:       <h2 class="complete-heading">Light Well Spent.</h2>
  478:       <p class="complete-sub">The flame held so your focus wouldn't have to.</p>
  479:     </div>
  480:   </div>
  ```

### B. Timer Hooks & Vibe Dispatcher in `app.js`

- **Focus Launch State Reset (`app.js:707`)**:
  ```javascript
  707:   if (typeof CANDLE !== 'undefined') { CANDLE.initd = false; CANDLE.smoke = []; CANDLE.embers = []; }
  ```

- **Picture-in-Picture Canvas Target (`app.js:778-780`)**:
  ```javascript
  778:   let activeCanvas = focusCanvas;
  779:   if (state.vibe === 'ice') activeCanvas = document.getElementById('water-bowl-canvas');
  780:   if (state.vibe === 'tree') activeCanvas = document.getElementById('tree-canvas');
  ```
  `candle` vibe is currently falling back to `focusCanvas`.

- **Session Completion Hook (`app.js:846-857 & 913`)**:
  ```javascript
  850:   completeScreen.classList.add('vibe-selected-' + state.vibe);
  856:   bodyEl.classList.add('vibe-selected-' + state.vibe);
  913:   drawVibe(completeCtx, w, h, 1.0, state.vibe, time, state.totalSeconds || 60);
  ```

- **Draw Dispatcher (`app.js:1030-1098`)**:
  ```javascript
  1030: function drawVibe(ctx, W, H, progress, vibe, time, totalSeconds = 60) {
  1031:   ctx.clearRect(0, 0, W, H);
  1032:   
  1033:   const waterBowlCanvas = document.getElementById('water-bowl-canvas');
  1034:   const treeCanvas = document.getElementById('tree-canvas');
  1035:   const isMainCanvas = ctx.canvas.id === 'focus-canvas' || ctx.canvas.id === 'complete-canvas';
  1036:   
  1037:   if (isMainCanvas) {
  1038:       if (waterBowlCanvas) { ... }
  1062:       if (treeCanvas) { ... }
  1089:       // Restore 2D canvas opacity if no 3D canvas is active
  1090:       if (vibe !== 'ice' && vibe !== 'tree') {
  1091:           ctx.canvas.style.opacity = '1';
  1092:       }
  1093: 
  1094:       // Skip 2D rendering for the main canvas when 3D is active
  1095:       if (vibe === 'ice' || vibe === 'tree') {
  1096:           return;
  1097:       }
  1098:   }
  1100:   if (vibe === 'ice')    drawWaterBowl(ctx, W, H, progress, time);
  1101:   if (vibe === 'candle') drawCandle(ctx, W, H, progress, time);
  1102:   if (vibe === 'tree')   drawTree(ctx, W, H, progress, time);
  1103:   if (vibe === 'gallery')drawGallery(ctx, W, H, progress, time);
  1104: }
  ```

- **Selection Screen Preview Animation (`app.js:2600-2633`)**:
  ```javascript
  2602:   candle: { canvas: $('preview-candle'), ctx: null },
  2630:   if (vibe === 'candle') drawCandle(ctx, W, H, pp, t);
  ```
  Card previews explicitly use `drawCandle(ctx, W, H, pp, t)` on `preview-candle` (where `isMainCanvas` is `false`).

- **Audio Binding (`app.js:2711 & 2824`)**:
  ```javascript
  2824:   if (vibe === 'candle') src = 'sounds/fire.wav';
  ```

### C. CSS Styling in `styles.css`
- Lines 748, 1064, 1069, 1427-1428, 2010-2015 contain full CSS support for `.vibe-selected-candle` (dial orbit ring color, selected duration pill highlight, completion variant display, ambient background gradients).

---

## 2. Logic Chain

1. **Observations 1A & 1B (Canvas Element & Script Tag)**:
   - 3D elements in VibeFocus (`water-bowl-3d.js` and `tree-3d.js`) require a dedicated `<canvas>` element in `.hero-visual` (`#screen-complete`) and a `<script>` tag in `index.html`.
   - Without `<canvas id="candle-canvas">` and `<script src="candle-3d.js"></script>`, `app.js` cannot locate or initialize the WebGL context for candle 3D.

2. **Observations 1B & 3D Dispatch Pattern in `drawVibe`**:
   - `drawVibe` inspects `ctx.canvas.id`. If `isMainCanvas` is `true` (`#focus-canvas` or `#complete-canvas`), it reparents the 3D canvas into `ctx.canvas.parentElement` (`#screen-focus` or `.hero-visual`), toggles visibility, sets `ctx.canvas.style.opacity = '0'`, and invokes the corresponding 3D render function.
   - For `candle` to run in 3D during focus and completion, `drawVibe` must get `#candle-canvas`, execute initialization (`initCandle3D()`), call the 3D render method (`renderCandle3D(progress, time, isCeremony, totalSeconds)`), update the opacity restoration condition (`vibe !== 'ice' && vibe !== 'tree' && vibe !== 'candle'`), and include `candle` in the early return guard (`vibe === 'ice' || vibe === 'tree' || vibe === 'candle'`).

3. **Observation 1B (Card Preview & Backward Compatibility)**:
   - `drawVibe` is also called during preview animations (`animatePreviews`, `app.js:2630`) where `isMainCanvas` is `false`.
   - Leaving line 1101 `if (vibe === 'candle') drawCandle(...)` guarantees that selection card `#preview-candle` continues to display smooth 2D candle previews without requiring heavy WebGL instances on every card.

4. **Observation 1B (Picture-in-Picture Integration)**:
   - In `tickFocus`, `activeCanvas` is copied to `pipProxyCtx` when PiP widget is active.
   - Adding `if (state.vibe === 'candle') activeCanvas = document.getElementById('candle-canvas');` ensures the 3D candle stream is rendered to PiP instead of blank 2D canvas.

5. **Observation 1B (Lifecycle Hooks)**:
   - `launchFocus()` resets state when starting a session. Adding `if (typeof resetCandle3D === 'function') resetCandle3D();` or setting `isCandleInitialized = false` resets candle physics/wax height for fresh focus sessions.

---

## 3. Caveats

- **Existing 2D `drawCandle` Function**:
  - `drawCandle` in `app.js:1584-1740` will remain in `app.js` for 2D card previews (`#preview-candle`). It should NOT be removed.
- **Initialization Teardown**:
  - Neither `water-bowl-3d.js` nor `tree-3d.js` implements a full WebGL context teardown (`dispose()`). `candle-3d.js` should follow this established pattern or provide safe re-initialization flags (`isCandleInitialized`).

---

## 4. Conclusion

Integrating `candle-3d.js` into VibeFocus requires exact, minimal updates across `index.html` and `app.js` while leveraging existing CSS rules and sound bindings.

### Exact Required Changes:

#### File 1: `index.html`
1. **Add Canvas Element**:
   - Location: Inside `<div class="hero-visual">` (line 464, alongside `#water-bowl-canvas` and `#tree-canvas`).
   - Line to add:
     ```html
     <canvas id="candle-canvas" aria-hidden="true" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>
     ```
2. **Add Script Inclusion**:
   - Location: Line 590 (after `tree-3d.js`, before `app.js`).
   - Line to add:
     ```html
     <script src="candle-3d.js"></script>
     ```

#### File 2: `app.js`
1. **`launchFocus()` (Line 707)**:
   - Add state reset call for 3D candle (e.g. `if (typeof resetCandle3D === 'function') resetCandle3D();` or `if (typeof CANDLE3D !== 'undefined') CANDLE3D.initd = false;`).
2. **`tickFocus()` Picture-in-Picture Selection (Line 780)**:
   - Change:
     ```javascript
     if (state.vibe === 'ice') activeCanvas = document.getElementById('water-bowl-canvas');
     if (state.vibe === 'tree') activeCanvas = document.getElementById('tree-canvas');
     if (state.vibe === 'candle') activeCanvas = document.getElementById('candle-canvas');
     ```
3. **`drawVibe()` Dispatcher (Line 1033 & 1061-1097)**:
   - Get canvas: `const candleCanvas = document.getElementById('candle-canvas');`
   - Add 3D canvas management block:
     ```javascript
     if (candleCanvas) {
         if (vibe === 'candle') {
             ctx.canvas.style.opacity = '0';
             candleCanvas.style.display = 'block';
             
             if (candleCanvas.parentElement !== ctx.canvas.parentElement) {
                 ctx.canvas.parentElement.insertBefore(candleCanvas, ctx.canvas);
                 candleCanvas.style.position = 'absolute';
                 candleCanvas.style.top = '0';
                 candleCanvas.style.left = '0';
                 candleCanvas.style.width = '100%';
                 candleCanvas.style.height = '100%';
                 candleCanvas.style.zIndex = '-1';
             }
             
             if (typeof initCandle3D === 'function' && typeof isCandleInitialized !== 'undefined' && !isCandleInitialized) {
                 initCandle3D();
             }
             
             if (typeof renderCandle3D !== 'undefined') {
                 const isCeremony = ctx.canvas.id === 'complete-canvas';
                 renderCandle3D(progress, time, isCeremony, totalSeconds);
             }
         } else {
             candleCanvas.style.display = 'none';
         }
     }
     ```
   - Update 2D canvas opacity restoration:
     ```javascript
     if (vibe !== 'ice' && vibe !== 'tree' && vibe !== 'candle') {
         ctx.canvas.style.opacity = '1';
     }
     ```
   - Update 3D early exit guard:
     ```javascript
     if (vibe === 'ice' || vibe === 'tree' || vibe === 'candle') {
         return;
     }
     ```

---

## 5. Verification Method

1. **Static Analysis Verification**:
   - Inspect `index.html` lines 460-466 and 587-592 to verify `#candle-canvas` and `<script src="candle-3d.js"></script>` are present.
   - Inspect `app.js` `drawVibe` to verify `candleCanvas` block, opacity checks, and return statement.
2. **Browser Runtime Verification**:
   - Open VibeFocus in browser, select "Candle" vibe on Screen 1.
   - Click "Start Focus" (25 min session). Verify `#candle-canvas` is dynamically moved into `#screen-focus` and rendering WebGL content.
   - Verify PiP mode renders the 3D candle stream correctly.
   - Let session complete (or test complete ceremony). Verify `#candle-canvas` is reparented into `.hero-visual` in `#screen-complete` with `isCeremony = true`.
