# Stress-Test Handoff Report: 3D Candle Visualizer (`candle-3d.js`)

**VERDICT: FAILED**

---

## 1. Observation

Direct code examination of `/Users/ankanghosh/Desktop/projects/timer timer/candle-3d.js` revealed five distinct edge-case, state management, math boundary, and resource lifecycle defects:

### Defect 1: Unclamped Uniform in GLSL Vertex Shader for Progress Boundaries (`progress < 0`, `progress > 1.0`)
- **Location**: `candle-3d.js`, Lines 153–157, Line 481
- **Verbatim Code**:
  ```javascript
  // Line 153-157 in waxMat.onBeforeCompile:
  float hFrac = clamp((transformed.y + 1.5) / 3.0, 0.0, 1.0);
  float meltFactor = uMeltProgress * 0.72; // Max melt 72%
  transformed.y = -1.5 + (transformed.y + 1.5) * (1.0 - meltFactor);

  // Line 481 in renderCandle3D:
  waxUniforms.uMeltProgress.value = progress;
  ```
- **Observed Behavior**: While JS line 475 clamps `meltFactor = Math.min(1.0, Math.max(0.0, progress)) * 0.72`, line 481 passes raw `progress` directly to `waxUniforms.uMeltProgress.value`.
  - When `progress < 0` (e.g. `-0.5`), GLSL `meltFactor` becomes `-0.36`. `(1.0 - meltFactor)` becomes `1.36`, stretching the 3D wax cylinder upward to height 4.08 (top at `y = 2.58`). Meanwhile JS top components (`basinMesh`, `wickMesh`, `flameMesh`) remain at height 3.0 (`topY = 1.5`), submerging the flame and wick inside the expanded wax geometry.
  - When `progress > 1.0` (e.g. `1.5`), GLSL `meltFactor` becomes `1.08`. `(1.0 - meltFactor)` becomes `-0.08`, vertically inverting the wax cylinder geometry inside-out below the base (`y = -1.74`), completely detaching it from top components.

### Defect 2: Active Drip Mesh Persistence on Backward Progress Jumps (e.g. `0.9` -> `0.1`)
- **Location**: `candle-3d.js`, Lines 518–538
- **Verbatim Code**:
  ```javascript
  dripList.forEach((drip) => {
      if (progress >= drip.triggerProgress) {
          if (!drip.active) {
              drip.active = true;
              drip.mesh.visible = true;
          }
          const flowT = Math.min(1.0, (progress - drip.triggerProgress) * 4.0 * drip.speed);
          drip.currentDist = flowT * drip.length;

          const dripY = topY - drip.currentDist;
          if (dripY >= BASE_Y) {
              drip.mesh.position.set(
                  Math.cos(drip.angle) * drip.radius,
                  dripY,
                  Math.sin(drip.angle) * drip.radius
              );
              drip.mesh.rotation.y = -drip.angle;
          }
      }
  });
  ```
- **Observed Behavior**: `dripList.forEach` lacks an `else` branch to handle cases where `progress < drip.triggerProgress`. If a user jumps timer progress backwards (e.g., from `0.9` to `0.1`) without dropping below `0.001` (the auto-reset threshold), any drip mesh that activated at `progress >= 0.5` remains `visible = true` and `active = true`. Its position remains fixed at its previous low 3D coordinate in mid-air while the candle body expands back up to `topY = 1.284`.

### Defect 3: Floating Embers Animate During Timer Pause
- **Location**: `candle-3d.js`, Lines 544–559
- **Verbatim Code**:
  ```javascript
  for (let i = 0; i < emberData.length; i++) {
      const e = emberData[i];
      e.life += 0.012;
      if (e.life > 1.0) {
          e.life = 0;
          e.x = (Math.random() - 0.5) * 0.35;
          e.y = topY + 0.35;
          e.z = (Math.random() - 0.5) * 0.35;
      } else {
          e.y += e.speedY * 0.015;
          e.x += Math.sin(time * 3.0 + e.phase) * 0.003;
          e.z += Math.cos(time * 2.5 + e.phase) * 0.003;
      }
      positions[i * 3] = e.x;
      positions[i * 3 + 1] = e.y;
      positions[i * 3 + 2] = e.z;
  }
  ```
- **Observed Behavior**: `e.life += 0.012` and `e.y += e.speedY * 0.015` update particle positions unconditionally on every call to `renderCandle3D`. If the timer is paused (`time` parameter stays fixed), `renderCandle3D` continues to move and respawn glowing embers upward, creating a visual discrepancy where embers rise while flame and wax flame light stay static.

### Defect 4: Aspect Ratio `NaN`/`Infinity` in `resizeCandle3D(w, h)` for Zero Dimensions
- **Location**: `candle-3d.js`, Lines 609–618
- **Verbatim Code**:
  ```javascript
  function resizeCandle3D(width, height) {
      if (!candleRenderer || !candleCamera) return;
      const canvas = candleRenderer.domElement;
      const w = width || canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
      const h = height || canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;

      candleCamera.aspect = w / h;
      candleCamera.updateProjectionMatrix();
      candleRenderer.setSize(w, h, false);
  }
  ```
- **Observed Behavior**: If `height` or `width` evaluates to `0` (e.g. collapsed hidden container or explicit `0`), `w / h` produces `NaN` or `Infinity`, leading to corrupted projection matrices in Three.js.

### Defect 5: Un-disposed Canvas Texture in `destroyCandle3D()`
- **Location**: `candle-3d.js`, Lines 630–653
- **Verbatim Code**:
  ```javascript
  candleScene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
          if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
          } else {
              child.material.dispose();
          }
      }
  });
  ```
- **Observed Behavior**: Three.js `Material.dispose()` does not dispose attached texture maps (`material.map`). `haloSprite` uses `haloMap` (a `THREE.CanvasTexture`). Repeated creation and destruction cycles (`initCandle3D()` -> `destroyCandle3D()`) leak texture memory on GPU/RAM.

---

## 2. Logic Chain

1. **Boundary Values (`progress < 0`, `progress > 1.0`)**:
   - `renderCandle3D` receives `progress`.
   - `waxUniforms.uMeltProgress.value` is assigned raw `progress`.
   - In GLSL, `transformed.y = -1.5 + (transformed.y + 1.5) * (1.0 - uMeltProgress * 0.72)`.
   - For `progress = -0.5`: `1.0 - (-0.36) = 1.36`. Vertices stretch to `y = 2.58`. Flame and wick position in JS are calculated with clamped `meltFactor = 0`, putting top at `y = 1.5`. Therefore, wax geometry envelops top components.
   - For `progress = 1.5`: `1.0 - 1.08 = -0.08`. Geometry vertically flips inside-out down to `y = -1.74`.

2. **State Transitions (Backward Progress Jump)**:
   - When progress progresses to `0.9`, drips with `triggerProgress <= 0.9` set `drip.active = true` and `drip.mesh.visible = true`.
   - When progress jumps back to `0.1` (without dropping below `0.001`), `dripList.forEach` evaluates `progress >= drip.triggerProgress` as `false`.
   - Without an `else` branch, `drip.mesh.visible` remains `true` and its 3D transform is unchanged. The drip mesh floats in 3D space below the elevated top surface.

3. **Pause / Freeze Dynamics**:
   - Timer pause freezes `time` (e.g. `time = 10.0`).
   - Flame and lighting uniforms rely on `time` (`waxUniforms.uTime.value = time`), so flame animation pauses correctly.
   - Particle ember system increments `e.life` and `e.y` per call without reference to time delta or pause state, causing embers to float continuously during pause.

4. **Resource Management**:
   - `destroyCandle3D` traverses `candleScene` calling `dispose()` on geometries and materials.
   - CanvasTexture objects created via `document.createElement('canvas')` (e.g., `haloMap`) require explicit `texture.dispose()`. Omitting this leaves texture resources allocated in WebGL context memory.

---

## 3. Caveats

- **No Caves / Assumptions**:
  - Tested against pure mathematical and logic definitions in `candle-3d.js`.
  - Review-only role: implementation code was inspected without direct modification per role guidelines.

---

## 4. Conclusion

`candle-3d.js` fails adversarial stress-testing. While the visual aesthetic design and standard countdown path (0.0 to 1.0 linear) perform smoothly, it suffers from critical mathematical boundary glitches in GLSL, state persistence bugs during backward progress jumps, frame-coupled particle movement during pause, zero-dimension matrix calculation vulnerabilities, and texture memory leaks upon destruction.

### Recommended Fixes:
1. **Clamp `uMeltProgress` Uniform**:
   In `renderCandle3D`:
   `const clampedProgress = Math.min(1.0, Math.max(0.0, progress));`
   `waxUniforms.uMeltProgress.value = clampedProgress;`
2. **Handle Drip Invalidation in `dripList.forEach`**:
   ```javascript
   if (progress >= drip.triggerProgress) {
       // activate and position drip
   } else {
       drip.active = false;
       drip.currentDist = 0;
       if (drip.mesh) drip.mesh.visible = false;
   }
   ```
3. **Bind Embers to Delta Time or Pause State**:
   Pass time delta or pause flag to ember update loop, or skip particle translation when `time` is static.
4. **Guard Zero Dimensions in `resizeCandle3D`**:
   `if (w <= 0 || h <= 0) return;`
5. **Dispose Texture Maps in `destroyCandle3D`**:
   ```javascript
   if (child.material) {
       if (child.material.map) child.material.map.dispose();
       child.material.dispose();
   }
   ```

---

## 5. Verification Method

To independently verify these findings:

1. **Verify Boundary Out-of-Bounds**:
   - Execute `renderCandle3D(-0.5, 0)` in browser console or simulator test script. Inspect `waxUniforms.uMeltProgress.value` (equals `-0.5`). Observe GLSL vertex deformation expanding wax cylinder above `topY = 1.5`.
   - Execute `renderCandle3D(1.5, 0)`. Observe GLSL vertex scale factor `(1.0 - 1.08) = -0.08` inverting geometry.

2. **Verify Backward Progress Jump Bug**:
   - Execute `renderCandle3D(0.9, 10.0)`. Confirm active drips (`drip.mesh.visible === true`).
   - Execute `renderCandle3D(0.1, 11.0)`. Inspect `dripList`. Confirm `drip.mesh.visible === true` for drips with `triggerProgress > 0.1`, floating at old Y coordinates.

3. **Verify Ember Animation During Pause**:
   - Call `renderCandle3D(0.5, 5.0)` repeatedly with fixed `time = 5.0`. Observe `emberParticles.geometry.attributes.position.array` Y values increasing on every call.

4. **Verify Texture Disposal Leak**:
   - Call `initCandle3D()`, then `destroyCandle3D()`. Inspect `haloSprite.material.map`. Observe `dispose()` was never called on `haloMap`.
