# Forensic Integrity Audit Report: 3D Candle Implementation

**Auditor Agent**: `teamwork_preview_auditor_candle_1`  
**Date**: 2026-07-25  
**Final Audit Verdict**: `VERDICT: CLEAN`

---

## 1. Observation

Direct examination of the codebase files `/Users/ankanghosh/Desktop/projects/timer timer/candle-3d.js`, `/Users/ankanghosh/Desktop/projects/timer timer/index.html`, `/Users/ankanghosh/Desktop/projects/timer timer/app.js`, and `/Users/ankanghosh/Desktop/projects/timer timer/styles.css` yielded the following findings:

### Genuine WebGL 3D Implementation (`candle-3d.js`)
- **Three.js Core Entities**:
  - `THREE.Scene`: Instantiated at line 85 (`candleScene = new THREE.Scene();`).
  - `THREE.PerspectiveCamera`: Instantiated at line 87 (`candleCamera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);`).
  - `THREE.WebGLRenderer`: Instantiated at line 72 with high-performance settings, antialiasing, alpha transparency, and ACES Filmic Tone Mapping (`candleRenderer = new THREE.WebGLRenderer(...)`).
  - **Meshes & Geometries**:
    - Wax Cylinder Mesh: Line 201 (`waxMesh = new THREE.Mesh(waxGeo, waxMat)` using 64 radial x 64 height segment `CylinderGeometry`).
    - Concave Top Basin Mesh: Line 224 (`basinMesh = new THREE.Mesh(basinGeo, basinMat)` with custom inward radial z-depth deformation).
    - Wick Mesh: Line 235 (`wickMesh = new THREE.Mesh(wickGeo, wickMat)`).
    - Teardrop Flame Mesh: Line 332 (`flameMesh = new THREE.Mesh(flameGeo, flameMat)` using a 24-point lathe curvature `LatheGeometry`).
    - Outer Additive Glow Halo Sprite: Line 344 (`haloSprite = new THREE.Sprite(haloMat)` using procedurally generated 128x128 radial canvas texture).
    - Base Wax Pool Mesh: Line 358 (`poolMesh = new THREE.Mesh(poolGeo, poolMat)`).
    - Procedural Drip Meshes: Line 394 (10 cylinder drip meshes inside `dripGroup`).
    - Floating Embers: Line 451 (35 points `THREE.Points` particle system).
- **Custom Shaders & Materials**:
  - `waxMat`: `MeshPhysicalMaterial` with SSS (Subsurface Scattering) transmission (`transmission: 0.55`, `thickness: 1.1`, `ior: 1.46`). Custom `onBeforeCompile` GLSL injection (lines 135-199) handles real-time vertex deformation (Y compression & top rim sagging) and fragment SSS flame translucency glow.
  - `flameMat`: Custom `ShaderMaterial` (lines 259-330) with multi-frequency vertex fluttering and a 3-tier fragment color gradient (`Blue Base (0.12, 0.38, 1.0) -> Yellow Core (1.0, 0.96, 0.65) -> Amber Tip (1.0, 0.42, 0.04)`).
- **Lighting**:
  - `PointLight`: Line 108 (`flameLight = new THREE.PointLight(0xff9933, 3.2, 12, 1.8)`), dynamically synchronized to the wick tip with multi-frequency organic flickering (lines 501-507).
- **Melting Physics & Real-Time Progress Sync**:
  - Melt compression: `meltFactor = progress * 0.72` (line 475), reducing candle height from `MAX_HEIGHT` (3.0) to 28% of original height.
  - Sinking components: Top basin, wick, flame mesh, halo sprite, and point light sink downward together using calculated `topY = BASE_Y + currentHeight` (lines 484-491).
  - Expanding base pool: `poolMesh.scale.set(1.0 + progress * 0.65, 1.0 + progress * 0.65, 1.0)` (line 514).
  - Procedural wax wall drips: Triggered dynamically as `progress >= drip.triggerProgress` (lines 518-538).

### Code Layout & Standards Compliance
- `candle-3d.js` exports lifecycle functions (`initCandle3D`, `renderCandle3D`, `resetCandle3D`, `destroyCandle3D`, `resizeCandle3D`) to `window` (lines 656-661), adhering strictly to the architecture established in `tree-3d.js` and `water-bowl-3d.js`.
- `index.html` includes `#candle-canvas` (line 464) and imports `<script src="candle-3d.js"></script>` (line 591) prior to `app.js`.
- `app.js` dispatches `renderCandle3D` inside `drawVibe` (lines 1092-1118) and resets state in `launchFocus` (line 708).

### Violet Glow & Regression Check
- `candle-3d.js`: Hex/RGB colors are strictly warm ambers (`#ff9933`, `#fdf6ed`, `vec3(1.0, 0.52, 0.16)`), soft blue base (`vec3(0.12, 0.38, 1.0)`), and dark brown/amber lights. No violet (`#7c3aed` or `rgba(124, 58, 237, ...)`) exists in `candle-3d.js`.
- `styles.css`: The candle theme utilizes `--candle: #f59e42`, `--candle-glow: rgba(245, 158, 66, 0.2)`, and dark maroon background `rgba(127, 29, 29, 0.35)`. No forbidden violet glow box-shadows were reintroduced.

---

## 2. Logic Chain

1. **Check 1: Genuine 3D WebGL Implementation**
   - Observation: `candle-3d.js` instantiates Three.js Scene, Camera, WebGLRenderer, MeshPhysicalMaterial with SSS shader injection, custom Lathe teardrop ShaderMaterial flame, PointLight, procedural cylinder drips, and floating particle embers.
   - Inference: The candle implementation is a genuine, high-fidelity 3D WebGL scene with procedural physics. It contains no 2D facades, dummy overlays, or pre-rendered images.

2. **Check 2: Code Layout & Standards**
   - Observation: `candle-3d.js` matches the exported global API (`init*`, `render*`, `reset*`, `destroy*`, `resize*`) used by `tree-3d.js` and `water-bowl-3d.js`. `app.js` hooks into `drawVibe` and `launchFocus` seamlessly. Canvas element `#candle-canvas` is present in `index.html`.
   - Inference: The implementation fully conforms to project architectural standards and code layout patterns.

3. **Check 3: Violet Glow Regressions**
   - Observation: Neither `candle-3d.js` nor the candle styles in `styles.css` contain `#7c3aed` or violet `rgba(124, 58, 237, ...)` box-shadow glows.
   - Inference: The candle feature maintains absolute visual integrity and introduces zero forbidden violet glow regressions.

4. **Check 4: Functional Timer Sync**
   - Observation: Progress ratio `progress` directly drives `uMeltProgress` uniform, wax cylinder height contraction, top rim sag, component Y-sinking (`topY`), base wax pool radial expansion, and drip progression.
   - Inference: Real-time timer synchronization is genuine, physics-based, and mathematically derived from progress ratio.

---

## 3. Caveats

- **No caveats**: All 4 forensic integrity checks were directly inspected and verified against source files without reliance on assumptions or unverified claims.

---

## 4. Conclusion

The 3D Candle implementation in `candle-3d.js`, `index.html`, `app.js`, and `styles.css` passes all forensic integrity audit checks without defects, facades, or regressions.

`VERDICT: CLEAN`

---

## 5. Verification Method

To independently verify this audit:
1. Inspect `/Users/ankanghosh/Desktop/projects/timer timer/candle-3d.js` lines 72-110, 135-199, 259-330, and 462-570.
2. Confirm Three.js WebGL renderer, scene, camera, materials, shaders, point light, and physics formulas.
3. Check `app.js` lines 1092-1118 to verify integration with `drawVibe`.
4. Inspect `styles.css` lines 2009-2017 to verify warm maroon/amber styling without violet (`#7c3aed`) glows.
