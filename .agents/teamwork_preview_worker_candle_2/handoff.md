# Handoff Report: 3D Candle & Application Edge-Case Bug Fixes

**Agent**: `teamwork_preview_worker_candle_2`  
**Status**: Completed  

---

## 1. Observation

Challenger 1 and Challenger 2 identified 10 distinct edge-case, state management, boundary condition, and memory lifecycle defects across `candle-3d.js` and `app.js`:

1. **Unclamped Progress Ratio in `renderCandle3D`** (`candle-3d.js`):
   - *Issue*: Raw `progress` parameter was passed directly to GLSL uniforms (`waxUniforms.uMeltProgress.value = progress`), height scaling calculations, pool scaling, and drip triggers. Out-of-bounds progress values (`< 0` or `> 1.0`) caused vertex distortion and geometry inversion.
   - *Fix*: Added `const clampedProgress = Math.max(0, Math.min(1, progress));` at the start of `renderCandle3D` and used `clampedProgress` consistently across uniforms, melt factor math, pool scaling, and drip calculations.

2. **Drip Visibility Persistence on Backward Progress Jumps** (`candle-3d.js`):
   - *Issue*: `dripList.forEach` lacked an `else` branch when `clampedProgress < drip.triggerProgress`. When timer progress jumped backward (e.g. `0.9` -> `0.1`), activated drip meshes remained `visible = true` floating mid-air.
   - *Fix*: Added `else` branch to set `drip.active = false`, `drip.currentDist = 0`, and `drip.mesh.visible = false` when `clampedProgress < drip.triggerProgress`.

3. **Ember Motion Frame-Coupling & Pause Handling** (`candle-3d.js`):
   - *Issue*: Floating embers advanced unconditionally per frame without tracking delta time or checking timer pause state, causing particle drift when paused.
   - *Fix*: Introduced `lastFrameTime` tracking (`const dt = lastFrameTime ? Math.max(0, Math.min(0.1, time - lastFrameTime)) : 0.016; lastFrameTime = time;`). If `dt <= 0` or timer is paused (static `time`), particle translation and life updates are skipped.

4. **Aspect Ratio Zero-Division Guard in `resizeCandle3D`** (`candle-3d.js`):
   - *Issue*: Zero or negative canvas dimensions (`width <= 0` or `height <= 0`) resulted in `w / h` yielding `NaN` or `Infinity`, corrupting the Three.js projection matrix.
   - *Fix*: Added early return guard `if (!w || !h || w <= 0 || h <= 0) return;` in `resizeCandle3D`.

5. **Texture Memory Leak in `destroyCandle3D`** (`candle-3d.js`):
   - *Issue*: Three.js `Material.dispose()` does not automatically free attached `CanvasTexture` maps (`material.map`).
   - *Fix*: Added explicit texture map disposal `if (haloSprite && haloSprite.material && haloSprite.material.map) haloSprite.material.map.dispose();` and traversed scene materials to dispose `m.map`.

6. **Ember Particles Persistence on Reset** (`candle-3d.js`):
   - *Issue*: `resetCandle3D()` did not reset floating ember positions/lifetimes, causing embers to remain elevated at old session positions upon starting a new session.
   - *Fix*: Added ember reset loop in `resetCandle3D()`: `emberData.forEach(e => { e.y = 0.5 + Math.random() * 2.0; e.life = Math.random(); });`.

7. **Viewport & Aspect Ratio Update on 3D Canvas Reparenting** (`app.js`):
   - *Issue*: When a 3D canvas (`#candle-canvas`, `#water-bowl-canvas`, `#tree-canvas`) was reparented between elements in `drawVibe()`, viewport aspect ratio was not updated, resulting in stretched rendering.
   - *Fix*: Added resize invocation (`if (typeof resizeCandle3D === 'function') resizeCandle3D(candleCanvas.clientWidth, candleCanvas.clientHeight);`) inside parent insertion blocks.

8. **Safe Canvas Check & Error Handling in PiP Proxy** (`app.js`):
   - *Issue*: `tickFocus()` executed `pipProxyCtx.drawImage(activeCanvas, ...)` without verifying canvas dimensions or handling potential WebGL context draw exceptions.
   - *Fix*: Wrapped PiP proxy canvas drawing in a `try / catch` block and added validation check `if (activeCanvas && activeCanvas.width > 0 && activeCanvas.height > 0)`.

9. **Race Condition in Screen Transitions in `goTo()`** (`app.js`):
   - *Issue*: Rapid screen navigation caused pending transition `setTimeout` callbacks to overlap and race.
   - *Fix*: Tracked transition timer in `screenTransitionTimeout` and cleared any pending timeout (`if (screenTransitionTimeout) clearTimeout(screenTransitionTimeout);`) before initiating a new transition.

10. **CPU Optimization in `animatePreviews()`** (`app.js`):
    - *Issue*: `animatePreviews` rendered canvas previews continuously regardless of active screen state.
    - *Fix*: Added screen active check `if (screens && screens.vibe && screens.duration) { if (!screens.vibe.classList.contains('active') && !screens.duration.classList.contains('active')) return; }` to skip preview loop rendering when off-screen.

---

## 2. Logic Chain

- **Fix 1**: Clamping `progress` to `[0, 1]` guarantees that `meltFactor` stays within `[0, 0.72]`, preventing GLSL shader deformation of the wax body cylinder outside physical boundaries.
- **Fix 2**: Resetting drip mesh visibility to `false` when `clampedProgress < drip.triggerProgress` ensures backward progress jumps correctly hide drips that shouldn't be active at the target progress.
- **Fix 3**: Computing `dt` from `time - lastFrameTime` ensures that when `time` remains constant during timer pause (`dt = 0`), ember updates do not run, maintaining particle synchronization with the paused flame.
- **Fix 4**: Checking `w <= 0 || h <= 0` before updating camera aspect ratio prevents matrix pollution with `NaN` / `Infinity`.
- **Fix 5**: Explicitly calling `.dispose()` on `material.map` releases WebGL canvas textures from VRAM during scene destruction.
- **Fix 6**: Re-initializing ember heights `e.y` and `e.life` in `resetCandle3D()` guarantees clean initial particle state on session restart.
- **Fix 7**: Re-running `resizeCandle3D` upon reparenting updates camera aspect ratios to match new container DOM dimensions.
- **Fix 8**: Checking active canvas dimensions and wrapping `drawImage` in try/catch prevents browser exceptions during WebGL canvas capture for Picture-in-Picture.
- **Fix 9**: Storing and clearing `screenTransitionTimeout` prevents multiple screen transition timeouts from firing out of order.
- **Fix 10**: Skipping preview rendering when neither vibe selection nor duration selection screens are active eliminates unnecessary canvas redrawing and reduces background CPU/GPU usage.

---

## 3. Caveats

- **No Caveats**: All 10 fixes were implemented with minimal changes, fully retaining existing features, aesthetic designs, and performance behavior without breaking structural APIs.

---

## 4. Conclusion

All 10 edge-case bugs identified by Challenger 1 & Challenger 2 have been successfully resolved in `/Users/ankanghosh/Desktop/projects/timer timer/candle-3d.js` and `/Users/ankanghosh/Desktop/projects/timer timer/app.js`.

---

## 5. Verification Method

1. **Boundary Clamping Verification**:
   - Call `renderCandle3D(-0.5, 0)` and `renderCandle3D(1.5, 0)`.
   - Inspect `waxUniforms.uMeltProgress.value` to confirm it is clamped to `0.0` and `1.0` respectively.

2. **Drip Reset Verification**:
   - Call `renderCandle3D(0.9, 10)`. Confirm drip meshes are visible.
   - Call `renderCandle3D(0.1, 11)`. Confirm drip meshes with `triggerProgress > 0.1` have `visible === false`.

3. **Ember Pause Verification**:
   - Call `renderCandle3D(0.5, 5.0)` twice with static `time = 5.0`.
   - Confirm `emberParticles.geometry.attributes.position.array` remains static (no translation).

4. **Zero Dimension & Reparenting Verification**:
   - Call `resizeCandle3D(0, 0)`. Confirm no `NaN` aspect ratio error occurs.
   - Trigger canvas reparenting in `drawVibe`. Confirm `resizeCandle3D` is called with current container dimensions.

5. **Screen Transition & Preview Loop Verification**:
   - Rapidly invoke `goTo('vibe')` and `goTo('hero')`. Confirm no timer race condition occurs and preview loop pauses on non-preview screens.
