## 2026-07-25T08:12:05Z
You are teamwork_preview_worker_candle_1 working in /Users/ankanghosh/Desktop/projects/timer timer/.agents/teamwork_preview_worker_candle_1/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task is to implement `candle-3d.js` and integrate it into `index.html` and `app.js`.

1. Read the explorer reports:
   - `/Users/ankanghosh/Desktop/projects/timer timer/.agents/teamwork_preview_explorer_candle_1/handoff.md`
   - `/Users/ankanghosh/Desktop/projects/timer timer/.agents/teamwork_preview_explorer_candle_2/handoff.md`
   - `/Users/ankanghosh/Desktop/projects/teamwork_preview_explorer_candle_3/handoff.md`

2. Implement `candle-3d.js` in `/Users/ankanghosh/Desktop/projects/timer timer/candle-3d.js`:
   - Build a professional-grade 3D WebGL candle visual matching the technical quality of `tree-3d.js` and `water-bowl-3d.js`.
   - 3D Wax Body: Cylinder/Lathe geometry with concave top basin, SSS / translucent wax material (`THREE.MeshPhysicalMaterial` with transmission, roughness, thickness, ior, and custom `onBeforeCompile` for top rim sag & internal translucency glow).
   - Dynamic Organic Flame: Teardrop geometry or billboard particle mesh with custom GLSL `ShaderMaterial` (multi-frequency noise deformation, 3-tier color gradient blue->yellow->amber, outer additive pulsating glow halo).
   - Dynamic Lighting: `THREE.PointLight` attached to wick tip with realistic multi-frequency flicker.
   - Melting Physics: Height reduces smoothly as `progress` increases from 0.0 to 1.0; top basin, wick, flame sink down with top surface; procedural wax drips on walls.
   - Expose lifecycle functions matching existing 3D components: `initCandle3D(canvas)`, `renderCandle3D(progress, time, isCeremony, totalSeconds)`, `resetCandle3D()`, `destroyCandle3D()`, `resizeCandle3D(width, height)`.

3. Update `index.html` in `/Users/ankanghosh/Desktop/projects/timer timer/index.html`:
   - Inside `.hero-visual`, add `<canvas id="candle-canvas" aria-hidden="true" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>`.
   - Add `<script src="candle-3d.js"></script>` right after `tree-3d.js`.

4. Update `app.js` in `/Users/ankanghosh/Desktop/projects/timer timer/app.js`:
   - In `launchFocus()`: add `if (typeof resetCandle3D === 'function') resetCandle3D();`.
   - In `tickFocus()`: map `activeCanvas` for PiP proxy if vibe is 'candle': `if (state.vibe === 'candle') activeCanvas = document.getElementById('candle-canvas');`.
   - In `drawVibe()`:
     - Reference `candleCanvas = document.getElementById('candle-canvas')`.
     - Implement 3D layer reparenting for `candleCanvas`.
     - Call `initCandle3D(candleCanvas)` if needed.
     - Call `renderCandle3D(progress, time, isCeremony, totalSeconds)`.
     - Exclude `candle` from 2D opacity restore (`vibe !== 'ice' && vibe !== 'tree' && vibe !== 'candle'`).
     - Exclude `candle` from 2D early return guard (`vibe === 'ice' || vibe === 'tree' || vibe === 'candle'`).
     - Retain `drawCandle` preview for `#preview-candle` inside selection cards.

5. Test and verify your implementation (ensure JavaScript syntax is valid, test basic execution, ensure no uncaught errors).

6. Write your handoff report to `/Users/ankanghosh/Desktop/projects/timer timer/.agents/teamwork_preview_worker_candle_1/handoff.md` documenting implemented features, files modified, and verification results. Send a completion message to the orchestrator via send_message.
