# Comprehensive Analysis of Timer State Management & 3D Flower Spawning Integration

## Executive Summary
This analysis details the timer state tracking mechanism in `app.js` and `tree-3d.js`, evaluates the integration interface between the timer loop and the 3D scene, and formulates the exact logic for spawning WebGL flowers proportionally across the total timer duration. All edge cases (pause, reset, fast-forward, completion, and extreme timer durations) are verified.

---

## 1. Timer State Management Analysis

### 1.1 State Tracking in `app.js`
In `app.js`, session state is maintained in a central `state` object (lines 58–70):
```javascript
const state = {
  vibe:         null,     // 'candle', 'ice', 'tree', 'gallery'
  minutes:      null,     // User-selected duration in minutes (1 to 120)
  totalSeconds: 0,        // state.minutes * 60
  startTime:    null,     // performance.now() timestamp when focus began
  rafId:        null,     // requestAnimationFrame handle (fallback)
  ...
};
```

#### Lifecycle Hooks & Time Calculation:
1. **Start (`launchFocus()`, lines 710–739)**:
   - Set `state.totalSeconds = state.minutes * 60`.
   - Resets 2D/3D physics & particle states (including calling `resetCandle3D()`, clearing leaf arrays).
   - Transitions to `'focus'` screen via `goTo('focus')`.
   - Records `state.startTime = performance.now()`.
   - Starts Web Worker ticker (`focusWorker.postMessage('start')`) or `requestAnimationFrame(tickFocus)`.

2. **Frame Tick (`tickFocus(now)`, lines 739–836)**:
   - Calculates elapsed duration:
     `const elapsed = Math.min((now - state.startTime) / 1000, state.totalSeconds);`
   - Calculates normalized progress ratio ($0.0 \le \text{prog} \le 1.0$):
     `const prog = elapsed / state.totalSeconds;`
   - Calculates remaining time in seconds:
     `const remaining = Math.max(0, state.totalSeconds - elapsed);`
   - Passes `prog` and `state.totalSeconds` to `drawVibe(...)`.

3. **Render Dispatch (`drawVibe(...)`, lines 1044–1156)**:
   - For `vibe === 'tree'`, `drawVibe` ensures `treeCanvas` is displayed, initializes `initTree3D()` if needed, and calls:
     ```javascript
     renderTree3D(progress, totalSeconds); // app.js line 1103
     ```

4. **Session Termination (`stopSession()` / `onSessionComplete()`, lines 838–899)**:
   - `onSessionComplete()` triggers when `elapsed >= state.totalSeconds`. Stops sound, exits PiP/fullscreen, and transitions to `'complete'` screen where `tickComplete` continues rendering `drawVibe(..., progress = 1.0, ...)`.
   - `stopSession()` halts worker/rAF loops, clears HUD timers, stops audio, and resets view state.

---

## 2. Integration Hooks & Communication with `tree-3d.js`

### 2.1 Direct Hook Architecture
`tree-3d.js` does not run its own independent timer loop. Instead, `app.js` drives `tree-3d.js` per frame via `renderTree3D(progress, totalSeconds)` (line 362).

```
[app.js: tickFocus()] ──> [app.js: drawVibe()] ──> [tree-3d.js: renderTree3D(progress, totalSeconds)]
```

### 2.2 Current Progress & Reset Handling in `tree-3d.js`
In `tree-3d.js` (lines 385–407):
- `lastTotalSecondsForLeaves`: Stores the previous `totalSeconds`. If `totalSeconds !== lastTotalSecondsForLeaves` or `progress < 0.001`:
  - Recalculates total active leaves: `activeLeafCount = Math.max(10, Math.min(leafData.length, Math.floor(60 + totalSeconds * 0.5)))`.
  - Resets detachment state when `progress < 0.01`:
    ```javascript
    currentTargetDropped = 0;
    detachmentQueue = 0;
    // reset all leaf positions to startPos, attached = true, grounded = false
    ```
- `resetTree3D()` (lines 350–360) also resets `currentTargetDropped = 0` and attaches all leaves back to `startPos`.

---

## 3. Flower Spawning Logic & Mathematical Formulation

### 3.1 Requirements Overview
- **Automated Blooming**: Flowers emerge on ground automatically as timer countdown progresses.
- **Proportional Spawning**: Flower count builds linearly from 0 at `progress = 0.0` to target total at `progress = 1.0` (or `progress = 0.95`).
- **3D Sprite / Billboard Integration**: Flowers rendered as 2D sprites/billboards on ground plane `y = 0.08`.
- **Persistence**: Once bloomed, flowers remain permanently visible until timer reset.

### 3.2 Target Flower Count (`TARGET_FLOWERS`)
To maintain high visual quality and 60 FPS performance without ground clutter:
- **Default Target**: `TARGET_FLOWERS = 50` (or dynamically scaled: `Math.min(80, Math.max(30, Math.floor(totalSeconds / 15)))`).
- For 50 flowers:
  - 1-min timer (60s): 1 flower spawns every 1.2s.
  - 25-min timer (1500s): 1 flower spawns every 30s.
  - 60-min timer (3600s): 1 flower spawns every 72s.

### 3.3 Spawning Progress Formula
To ensure all flowers finish blooming 2 seconds before the timer completes (matching leaf detachment pacing):
$$\text{effectiveProgress} = \min\left(1.0, \frac{\text{progress} \times \text{totalSeconds}}{\max(1, \text{totalSeconds} - 2)}\right)$$
$$\text{idealFlowerCount} = \lfloor \text{effectiveProgress} \times \text{TARGET\_FLOWERS} \rfloor$$

On each frame in `renderTree3D(progress, totalSeconds)`:
```javascript
if (flowersBloomedCount < idealFlowerCount) {
    const numToSpawn = idealFlowerCount - flowersBloomedCount;
    for (let i = 0; i < numToSpawn; i++) {
        spawnFlowerNext(time);
    }
}
```

### 3.4 Ground Plane Coordinate Generation
Ground bounds in `tree-3d.js`:
- Camera: `position = (0, 20, 65)`, `lookAt = (0, 12, 0)`.
- Tree trunk: Center `(0, 0, 0)`, radius $\approx 1.5$.
- Visible ground area: $X \in [-30, 30]$, $Z \in [-20, 35]$, $Y = 0.08$.

To achieve uniform area density around the tree trunk without overlapping the trunk:
$$r = \sqrt{r_{\text{min}}^2 + \text{random}() \times (r_{\text{max}}^2 - r_{\text{min}}^2)}$$
where $r_{\text{min}} = 2.5$, $r_{\text{max}} = 26.0$.
$$\theta = \text{random}() \times 2\pi$$
$$x = r \cdot \cos(\theta), \quad z = r \cdot \sin(\theta), \quad y = 0.08$$

### 3.5 Billboard Sprite / Shader Material Structure
Flowers can be created using `THREE.Sprite` with a custom `THREE.ShaderMaterial` (or `THREE.Mesh` with `PlaneGeometry` rotated towards camera/lying flat):
- **Uniforms**: `uTime`, `uBloom` (0.0 to 1.0 bloom factor), `uColor` (petal tint), `uCenterColor`.
- **Bloom Animation**: Each flower object stores `spawnTime`.
  $$\text{bloomProgress} = \min\left(1.0, \frac{\text{currentTime} - \text{spawnTime}}{\text{BLOOM\_DURATION}}\right)$$
- `uBloom` updates per frame until reaching 1.0, where it remains persistent.

### 3.6 Reset & Scene Graph Cleanup
When `progress < 0.001` or `resetTree3D()` is called:
- Iterate through flower pool/group.
- Set `visible = false` or `flowersBloomedCount = 0`.
- Reset flower `uBloom` uniforms to `0.0`.

---

## 4. Edge Cases Verification Matrix

| Edge Case Scenario | Expected Behavior | Verification & Safety Mechanism |
|---|---|---|
| **Timer Pause** | No new flowers spawn; bloomed flowers stay visible and gently sway. | `progress` stops advancing, `idealFlowerCount` remains constant. Shader `uBloom` stays at 1.0. |
| **Timer Reset / Exit** | All flowers disappear immediately; ground plane returns to initial grass state. | Reset hook in `resetTree3D()` and `progress < 0.001` block sets `flowersBloomedCount = 0` and hides flower meshes. |
| **Fast-Forward / Progress Jump** | Missing flowers spawn immediately without skipping. Past flowers spawn in fully bloomed state (`uBloom = 1.0`). | Loop `idealFlowerCount - flowersBloomedCount` enqueues all missing flowers; if `currentTime - spawnTime > BLOOM_DURATION`, `uBloom = 1.0`. |
| **Session Completion (100%)** | All 100% of target flowers are fully bloomed on ground during completion screen ceremony. | `effectiveProgress = 1.0` forces `idealFlowerCount = TARGET_FLOWERS`. `tickComplete` continues rendering `drawVibe` with `progress = 1.0`. |
| **Short Timer (1 min)** | Rapid, smooth flower emergence (1 flower every 1.2s). | `baseGap = 60 / 50 = 1.2s`. Frame updates handle multi-flower spawn per frame if delta > spawn interval. |
| **Long Timer (120 min)** | Slow, serene flower emergence (1 flower every ~144s). | Spawning directly driven by normalized `effectiveProgress`, maintaining linear distribution over 2 hours. |

---

## 5. Architectural Recommendations & Implementation Plan (For Implementer)

1. **Flower System Object in `tree-3d.js`**:
   Maintain a `flowerGroup = new THREE.Group()` and `flowerData = []` array initialized in `initTree3D()`.
2. **Pre-instanced Object Pool**:
   Pre-create `TARGET_FLOWERS` (e.g. 50 `THREE.Sprite` or `THREE.Mesh` instances with custom shader materials) during `initTree3D()`. Set `visible = false` initially.
3. **Frame Update Integration**:
   Inside `renderTree3D(progress, totalSeconds)`:
   - Calculate `idealFlowerCount`.
   - Activate unbloomed flowers up to `idealFlowerCount`.
   - Update `uBloom` and `uTime` uniforms for active flowers.
4. **Reset Integration**:
   Inside `resetTree3D()` & `progress < 0.001` branch of `renderTree3D`:
   - Set all flower meshes `visible = false`, `uBloom = 0.0`.
   - Reset `flowersBloomedCount = 0`.
