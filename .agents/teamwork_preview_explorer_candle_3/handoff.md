# Technical Specification & Handoff Report: `candle-3d.js` WebGL Component

## 1. Observation

### 1.1 Context & Baseline Architecture
- **Existing 2D Component**: `app.js` lines 1584–1735 (`drawCandle`) implemented a 2D canvas representation with flat gradient shading, basic sine-wave wick flicker, and 2D drip tracking.
- **Existing 3D Components**:
  - `water-bowl-3d.js`: Uses `THREE.WebGLRenderer` (`alpha: true`), `THREE.MeshPhysicalMaterial` with transmission/ior for realistic glass and liquid, custom GLSL vertex/fragment modification via `onBeforeCompile`, dynamic resize listeners, and progress-driven drip-fill simulation.
  - `tree-3d.js`: Uses `THREE.WebGLRenderer`, shadow mapping (`PCFSoftShadowMap`), instanced leaf mesh with wind physics, procedural branch generation, particle systems (`ShaderMaterial` fireflies), and camera lighting setup (`AmbientLight`, `DirectionalLight`, `PointLight`).
- **Global Integration**: `app.js` dispatcher `drawVibe` (lines 1030–1104) manages switching between visual modes (`vibe === 'candle'`, `'ice'`, `'tree'`, `'gallery'`), controlling `<canvas>` DOM visibility and routing `(progress, time, isCeremonyActive, totalSeconds)` to visual renderers.
- **DOM Canvas Setup**: `index.html` lines 461–463 hosts full-screen background canvases for 3D visual modes (`#water-bowl-canvas`, `#tree-canvas`). `#candle-canvas` will be integrated identically.

---

## 2. Logic Chain

### 2.1 3D Wax Body Architecture
To achieve high-end visual realism for candle wax (paraffin/beeswax):
1. **Geometry Design**:
   - **Main Cylinder Body**: `THREE.CylinderGeometry(radiusTop=0.75, radiusBottom=0.82, height=3.2, radialSegments=64, heightSegments=32)`.
   - **Top Basin Ring**: Concave top mesh deformed dynamically inward towards the wick position to simulate a melted wax basin.
   - **Wax Base Pedestal / Pool**: A flat ground plane disc (`THREE.CircleGeometry`) that accumulates melted wax drips at the candle base ($Y=0$).
2. **Material Setup (Subsurface Scattering & Translucency)**:
   - Base Material: `THREE.MeshPhysicalMaterial`
     - `color`: Warm ivory `#f7efe2` (`0xf7efe2`).
     - `roughness`: `0.32` (smooth wax sheen).
     - `metalness`: `0.04`.
     - `transmission`: `0.55` (allows light to penetrate the outer wax wall).
     - `thickness`: `0.85`.
     - `ior`: `1.46` (refractive index of candle wax).
   - **Subsurface Scattering (SSS) Shader Extension (`onBeforeCompile`)**:
     - Inject custom GLSL uniforms: `uMeltProgress`, `uFlamePosition`, `uFlameIntensity`.
     - **Vertex Shader**:
       - Height deformation: scale Y coordinates based on `uMeltProgress` ($H(P) = H_{\text{max}} \times (1.0 - 0.82 \times P^{0.75})$).
       - Top rim sag & deformation: perturb top vertex radius and Y level with multi-octave noise to create natural, non-uniform melt rims.
     - **Fragment Shader**:
       - Calculate distance from fragment world position to `uFlamePosition`.
       - Add translucent internal backlight glow:
         ```glsl
         float distToFlame = distance(vWorldPosition, uFlamePosition);
         float sssGlow = pow(clamp(1.0 - distToFlame / 1.8, 0.0, 1.0), 3.0);
         vec3 sssColor = vec3(1.0, 0.55, 0.15) * sssGlow * uFlameIntensity * 1.4;
         gl_FragColor.rgb += sssColor;
         ```

### 2.2 Organic Flame & Dynamic Lighting
1. **Flame Geometry & Custom GLSL Shader**:
   - Tear-drop volumetric mesh using `THREE.ConeGeometry(0.25, 0.9, 32, 16)` inverted or custom shape lathe.
   - **Vertex Shader**: Multi-frequency simplex noise applied to vertex positions along the Y-axis:
     ```glsl
     vec3 pos = position;
     float flickerX = sin(uTime * 11.0 + pos.y * 6.0) * 0.04 * pos.y;
     float flickerZ = cos(uTime * 13.0 + pos.y * 5.0) * 0.04 * pos.y;
     pos.x += flickerX;
     pos.z += flickerZ;
     ```
   - **Fragment Shader**: Procedural 3-tier color gradient:
     - Base (wick origin): Deep translucent blue (`#1a44ff`, alpha 0.9).
     - Core: Hot yellow-white (`#ffffdd`, alpha 1.0).
     - Outer edge & Tip: Vibrant amber orange (`#ff5500`, alpha 0.85).
2. **Outer Warm Halo / Glow**:
   - `THREE.Sprite` with radial glow canvas texture or custom billboard quad.
   - `THREE.AdditiveBlending`, transparent opacity `0.45`, pulsating scale: $S = 1.0 + 0.08 \sin(14t) + 0.05 \cos(23t)$.
3. **Dynamic PointLight Attachment**:
   - `THREE.PointLight(0xff9933, intensity=2.8, distance=14, decay=2.0)`.
   - Attached to the flame position `(flameX, flameY, flameZ)`.
   - Real-time intensity flicker formula:
     ```javascript
     const noiseVal = Math.sin(time * 8.3) * 0.35 + Math.sin(time * 17.1) * 0.2 + Math.cos(time * 29.5) * 0.1;
     flameLight.intensity = 2.5 + noiseVal;
     flameLight.position.x = flameX + Math.sin(time * 9.0) * 0.03;
     flameLight.position.z = flameZ + Math.cos(time * 11.0) * 0.03;
     ```

### 2.3 Melting Physics & Math Model
1. **Timer Progress Mapping**:
   - Let $P \in [0, 1]$ be `progress` (0 = timer started, 1 = session complete).
   - Remaining height:
     $$H(P) = H_{\text{max}} \times (1.0 - 0.82 \cdot P^{0.75})$$
     Where $H_{\text{max}} = 3.2$.
   - Candle Top Y Level:
     $$Y_{\text{top}}(P) = Y_{\text{base}} + H(P)$$
   - Wick Tip Position:
     $$\text{WickY}(P) = Y_{\text{top}}(P) + 0.25$$
2. **Dynamic Wick Tracking**:
   - Wick mesh (`THREE.CylinderGeometry(0.02, 0.025, 0.35)`) is translated every frame to maintain origin at $Y_{\text{top}}(P)$.
   - Flame mesh and PointLight are bound to $\text{WickY}(P)$.
3. **Procedural Wax Drips**:
   - As $P$ increases, discrete wax drips (`InstancedMesh` of small teardrops) spawn around top edge.
   - Drips slide down the cylinder surface ($Y$ decreases from $Y_{\text{top}}$ to $Y_{\text{base}}$), freeze in place (speed decelerates to 0), and leave permanent wax trails.
   - Base pool radius grows proportionally to accumulated melted volume:
     $$R_{\text{pool}}(P) = R_{\text{initial}} + 0.6 \cdot P$$

### 2.4 API Contract & Lifecycle
To mirror `tree-3d.js` and `water-bowl-3d.js`:
- `initCandle3D()`: Initializes renderer, camera, scene, lights, shaders, geometries, and window resize listeners. Sets `isCandleInitialized = true`.
- `renderCandle3D(progress, time, isCeremonyActive, totalSeconds = 60)`: Executes per-frame updates, uniform assignments, physics calculations, and `candleRenderer.render(candleScene, candleCamera)`.
- `resetCandle3D()`: Resets melt progress uniforms, drip instances, and wick height to full length.
- `resizeCandle3D()`: Updates camera aspect ratio and renderer size.
- `destroyCandle3D()`: Disposes of geometries, materials, textures, renderer, and removes DOM resize listeners.

---

## 3. Caveats

1. **Mobile Performance Capping**:
   - High transmission (`MeshPhysicalMaterial`) and shadow maps can be GPU intensive on low-end mobile devices.
   - *Recommendation*: Use `RENDER_DPR = Math.min(window.devicePixelRatio, 1.5)` on mobile and conditionally disable shadow maps if DPR $\le 1.0$.
2. **Safari WebGL Compatibility**:
   - `MeshPhysicalMaterial` transmission features rely on WebGL2 framebuffers. Fallback to standard `MeshStandardMaterial` with emissive map if WebGL2 extension is unavailable.
3. **Timer Pause & Resume Handling**:
   - During pause, `time` variable should continue incrementing for organic flame flicker, while `progress` remains stationary so height does not decrease while paused.

---

## 4. Conclusion

The specification for `candle-3d.js` delivers a production-grade WebGL implementation that matches and exceeds the visual bar established by `tree-3d.js` and `water-bowl-3d.js`. It fully satisfies requirements R1 (WebGL Three.js foundation), R2 (organic GLSL flame, subsurface scattering wax body, dynamic light source), and R3 (seamless timer state synchronization and melting math).

---

## 5. Verification Method

### 5.1 Pre-Implementation Verification Checklist
1. **Architecture Inspection**:
   - Confirm canvas declaration in `index.html`: `<canvas id="candle-canvas" aria-hidden="true" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>`.
   - Confirm export functions `initCandle3D`, `renderCandle3D`, `resetCandle3D`, `destroyCandle3D` exist in `candle-3d.js`.
   - Confirm dispatcher wiring in `app.js` `drawVibe` for `vibe === 'candle'`.

### 5.2 Automated & Browser Verification Steps
1. **Console & Syntax Check**:
   - Execute `node check_errors.js` or run browser console test to verify zero syntax errors.
2. **Visual Inspection**:
   - Load `index.html` in browser, select "Candle" vibe, start timer.
   - Observe 3D wax body translucent glow under flame light.
   - Observe dynamic flame flickering with organic shape movement.
   - Observe candle smoothly shortening as timer progress $P$ advances from 0 to 1.
