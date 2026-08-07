# Handoff Report: Milestones M1 & M2 Technical Implementation Blueprint

## 1. Observation

Direct observations from codebase inspection of `/Users/ankanghosh/Desktop/projects/timer timer/tree-3d.js` and survey handoffs (`explorer_survey_1/handoff.md`, `explorer_survey_2/handoff.md`, `explorer_survey_3/handoff.md`):

- **Ground & Scene Structure (`tree-3d.js:304–335`)**: Ground plane is a 150x150 flat mesh at $Y=0$. Instanced grass blades extend up to height $Y=0.75$. Trunk origin is at $(0, 0, 0)$.
- **Camera View Angle (`tree-3d.js:34–37`)**: Camera is positioned at $(0, 20, 65)$ looking at $(0, 12, 0)$ with a 45° field of view, creating a downward viewing frustum over the surrounding ground plane.
- **Timer Driven Render Loop (`tree-3d.js:362–414`)**: `renderTree3D(progress, totalSeconds)` executes per frame via `app.js:1103`. Pacing calculates `timeElapsed = progress * totalSeconds`, `targetDetachmentTime = Math.max(1, totalSeconds - 2)`, and `effectiveProgress = Math.min(1.0, timeElapsed / targetDetachmentTime)`.
- **Reset Mechanics (`tree-3d.js:350–360` & `tree-3d.js:397–406`)**: Resetting occurs via `resetTree3D()` or inside `renderTree3D` when `progress < 0.001` (or `< 0.01`).

---

## 2. Logic Chain

1. **Observation 1 (Scene Geometry & Elevation)**: The ground sits at $Y=0.0$.
   - **Reasoning**: To prevent z-fighting with the ground mesh ($Y=0.0$) while remaining embedded under grass tips ($Y=0.75$), flower planar meshes (`THREE.PlaneGeometry(1.8, 1.8)`) must sit at $Y = 0.08 + \text{random}(0.0, 0.03)$, rotated $X = -\pi/2$.

2. **Observation 2 (Camera View & Ground Bounds)**: Trunk radius is $\approx 1.2$, and viewable ground extends to $r \approx 25.0$.
   - **Reasoning**: Spawning flowers randomly in polar coordinates $r \in [2.5, 25.0]$, $\theta \in [0, 2\pi]$ guarantees natural ring-like blooming around the tree base without colliding with the trunk or appearing out of frame.

3. **Observation 3 (Shader & Material Specifications)**: WebGL blending must be smooth and non-clipping.
   - **Reasoning**: Using `THREE.ShaderMaterial` with `transparent: true`, `depthWrite: false`, and procedural GLSL polar coordinate formulas ($r, \theta = \text{atan}(y, x)$) enables crisp multi-petal shapes ($N \in [5, 8]$), golden yellow stamen centers, and smooth edge anti-aliasing without depth buffer clipping artifacts.

4. **Observation 4 (Pacing & Persistence)**: Flowers must emerge progressively and remain permanently until explicit timer reset.
   - **Reasoning**: Mapping `targetCount = Math.floor(effectiveProgress * TOTAL_FLOWERS)` (where `TOTAL_FLOWERS = 60`) syncs flower blooming with leaf fall, completing all blooms 2 seconds before session end. Incrementing `uBloom` smoothly by `delta / 2.0` up to `1.0` and locking at `1.0` ensures natural 2-second bloom transitions and persistent flowers.

5. **Observation 5 (Reset Handling)**: Session reset triggers `resetTree3D()` or `progress < 0.001`.
   - **Reasoning**: Iterating over `flowerPool` to reset `bloomProgress = 0.0`, `uBloom = 0.0`, and `mesh.visible = false` inside `resetTree3D()` and the early `renderTree3D()` reset block provides clean session restarts.

---

## 3. Caveats

- **Frame Delta Calculation**: In high-refresh-rate monitors (120Hz/144Hz) or background tab throttling, hardcoded frame increments can cause erratic bloom speeds. The blueprint specifies calculating `delta = Math.min(0.1, time - lastTreeFrameTime)` to ensure consistent 2.0-second bloom duration regardless of frame rate.
- **Depth Writing**: `depthWrite: false` is required on `flowerMat` to avoid rectangular bounding box transparency artifacts on overlapping flowers or grass blades.

---

## 4. Conclusion

A complete, exact technical blueprint for Milestones M1 & M2 has been produced and saved to `/Users/ankanghosh/Desktop/projects/timer timer/.agents/explorer_m1/blueprint.md`.

It specifies:
1. Complete GLSL `flowerVertexShader` and `flowerFragmentShader` source code.
2. Three.js material & geometry creation parameters (`PlaneGeometry(1.8, 1.8)`, `ShaderMaterial`, `transparent: true`, `depthWrite: false`).
3. Random ground placement math ($r \in [2.5, 25.0]$, $\theta \in [0, 2\pi]$, height $Y \in [0.08, 0.11]$, rotation $Z \in [0, 2\pi]$, color palette, petal count $5..8$).
4. Object pool architecture (`flowerPool` array of 60 items added to `flowerGroup`).
5. Autonomous bloom animation and pacing logic inside `renderTree3D()`.
6. Reset lifecycle handling inside `resetTree3D()` and `progress < 0.001`.
7. Line-by-line integration points in `tree-3d.js`.

---

## 5. Verification Method

To verify the blueprint and downstream implementation:
1. Inspect `/Users/ankanghosh/Desktop/projects/timer timer/.agents/explorer_m1/blueprint.md` for complete code strings and formulas.
2. Verify line numbers in `/Users/ankanghosh/Desktop/projects/timer timer/tree-3d.js` match integration points specified in Section 7 of `blueprint.md`.
3. Following code modification in `tree-3d.js` by implementer, test in browser to verify:
   - Flowers appear on ground $Y \in [0.08, 0.11]$ without z-fighting.
   - Flowers open smoothly over 2.0s and lock at 100% bloom until reset.
   - Resetting the timer cleanly hides all flowers and resets bloom uniforms to 0.0.
