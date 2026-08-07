# Technical Analysis: Three.js 3D Scene & Ground Perspective Survey

## Overview
This document presents the detailed architectural and spatial analysis of the Three.js 3D scene in `tree-3d.js`, providing exact coordinates, rendering patterns, bounds, lighting parameters, and object setup for integrating an automated WebGL flower blooming effect on the ground plane.

---

## 1. Scene, Camera, Lighting & Particle System Mapping

### A. Scene & Renderer Setup
- **File**: `tree-3d.js:20-30`
- **Canvas Element**: `#tree-canvas`
- **Renderer**: `THREE.WebGLRenderer` with options `{ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }`.
- **Shadow Mapping**: Enabled with `THREE.PCFSoftShadowMap`.
- **Scene**: `treeScene = new THREE.Scene();` (No skybox mesh; background transparency enabled for page background blending).

### B. Camera Parameters & Spatial Orientation
- **File**: `tree-3d.js:33-37`
- **Type**: `THREE.PerspectiveCamera`
- **Field of View (FOV)**: `45` degrees
- **Near / Far Clipping**: `0.1` / `100`
- **Camera Position**: $(X=0, Y=20, Z=65)$
- **LookAt Target**: $(X=0, Y=12, Z=0)$ (Center of main trunk / branch canopy split)
- **Camera Angle & View Vector**:
  - Distance vector to target: $\Delta X = 0$, $\Delta Y = -8$, $\Delta Z = -65$.
  - Total distance to target: $\approx 65.49$ units.
  - Downward pitch angle: $\arctan(8 / 65) \approx 7.02^\circ$ below horizontal.
  - Perspective impact: The camera sits at high distance $Z=65$ and moderate height $Y=20$, creating a gentle telephoto-like perspective on the ground plane ($Y=0$).

### C. Lighting System
- **File**: `tree-3d.js:39-64`
1. **Ambient Light**: `THREE.AmbientLight(0xffffff, 0.4)` — Global ambient fill.
2. **Rim Light**: `THREE.DirectionalLight(0xbbeeff, 2.5)` at position $(-10, 20, -10)$ — Cool back-light glow.
3. **Fill Light (Shadow Caster)**: `THREE.DirectionalLight(0xaaffcc, 1.2)` at position $(15, 25, 15)$.
   - Shadow map size: $1024 \times 1024$.
   - Shadow camera frustum: Near $0.5$, Far $100$, Bounds $[-25, 25, 25, -25]$, Bias $-0.001$.
4. **Magical Core Point Light**: `THREE.PointLight(0xa8d870, 3, 25)` at position $(0, 12, 0)$ — Interior canopy warm green glow.

### D. Falling Leaves & Fireflies Systems
1. **Falling Leaves System (`leafInstancedMesh` & `leafData`)** (`tree-3d.js:210-302, 362-591`):
   - `THREE.InstancedMesh` with procedural extruded leaf geometry (`THREE.ExtrudeGeometry`).
   - Dynamic count up to 8000 (scaled via `activeLeafCount = Math.max(10, Math.min(leafData.length, Math.floor(60 + totalSeconds * 0.5)))`).
   - Attached leaves sway at branch endpoints.
   - Detached leaves float downwards with gravity ($a_y = -0.004$), wind drift ($X, Z$ oscillating vectors), air resistance ($0.92$ velocity dampening), and land at $Y \approx 0.1$.
   - Leaf Boundary Limits (`tree-3d.js:536-558`):
     - $X \in [-35, +35]$
     - $Z_{back} = -25$, $Z_{front} = 45$
     - Ground contact: $Y \le 0.1 \implies$ set $Y = 0.1 + \text{rand}(0, 0.1)$, lie flat ($\text{rotation.x} = -\pi/2$).
2. **Fireflies Particle System (`fireflyParticles`)** (`tree-3d.js:84-140`):
   - `THREE.Points` with 150 particles using custom `THREE.ShaderMaterial` (additive blending, soft glow edge, size attenuation `25.0 * (10.0 / -mvPosition.z)`).

---

## 2. 3D Coordinates & Bounds for Flower Placement

### Ground Plane Coordinate Frame
- **Ground Altitude**: World $Y = 0.0$ (Ground mesh surface).
- **Flower Placement Y Level**: $Y \in [0.05, 0.12]$ (Elevated slightly above $Y=0$ to prevent z-fighting with the ground plane mesh and grass blades).

### Spatial Bounds & Distribution for Flowers
Based on the camera frustum, ground plane dimensions, tree base geometry, and leaf particle boundary boxes:

| Metric | Range / Value | Rationale |
|---|---|---|
| **World Y Elevation** | `0.05` to `0.12` | Directly sits on ground surface without z-fighting |
| **Tree Trunk Radius** | $r \ge 2.0$ | Trunk base is centered at $(0,0,0)$ with radius $1.2$. Flowers must avoid spawning inside the trunk. |
| **Primary Flower Zone (Dense)** | Radius $r \in [2.5, 18.0]$ | Surrounds the tree base; highest visual impact matching camera focus at $(0, 12, 0)$ |
| **Secondary Flower Zone (Sparse)** | Radius $r \in [18.0, 30.0]$ | Outer ground area filling camera perspective |
| **Rectangular X Bounds** | $X \in [-28.0, +28.0]$ | Matches visible viewport width at ground level |
| **Rectangular Z Bounds** | $Z \in [-18.0, +35.0]$ | Foreground $Z=35$, Background $Z=-18$ (behind trunk) |

### Recommended Spawning Pattern
- **Coordinate Formula (Polar Scatter)**:
  $$\begin{aligned}
  r &= 2.5 + \sqrt{\text{Math.random()}} \times 22.5 \quad (r \in [2.5, 25.0]) \\
  \theta &= \text{Math.random()} \times 2\pi \\
  x &= r \cdot \cos(\theta) \\
  z &= r \cdot \sin(\theta) \\
  y &= 0.05 + \text{Math.random()} \times 0.05
  \end{aligned}$$
- **Orientation**: Billboards / Sprites can face camera (`THREE.Sprite`) or lie flat/semi-tilted on the ground (`THREE.Mesh` with `PlaneGeometry` rotated $X = -\pi/2$ or billboarded toward `treeCamera`).

---

## 3. Object Creation, Update, and Render Loop Mechanics

### A. Lifecycle & Integration Flow
1. **Initialization (`initTree3D`)** (`tree-3d.js:20`):
   - Sets up WebGL renderer, scene graph, perspective camera, directional/ambient lights, tree mesh, instanced leaves, ground plane, and particles.
   - Sets `isTreeInitialized = true`.
2. **Main Loop Execution (`renderTree3D(progress, totalSeconds)`)** (`tree-3d.js:362`):
   - Triggered every animation frame from `app.js:1103` inside the main timer render pipeline (`vibe === 'tree'`).
   - Handles canvas resize check dynamically.
   - Calculates current time $t = \text{performance.now()} \times 0.001$.
   - Animates scene elements: sways tree group, updates firefly shader uniform `uTime`, advances leaf detachment and physics loop.
   - Executes `treeRenderer.render(treeScene, treeCamera);`.

### B. Adding Custom WebGL Flower Objects to Render Loop
- **Creation**: Flower meshes/sprites or instanced materials can be added directly to `treeScene` (or a dedicated `flowerGroup = new THREE.Group()` added to `treeScene`).
- **Update**: Inside `renderTree3D(progress, totalSeconds)` (or a helper `updateFlowers(progress, time)` called within `renderTree3D`), uniforms such as `uTime` or `uProgress` / `uBloom` can be updated per frame.
- **Rendering**: Any object residing in `treeScene` is automatically drawn during `treeRenderer.render(treeScene, treeCamera)` with full depth buffering and perspective transforms.

---

## 4. Existing Ground Meshes, Textures, and Materials

### Existing Ground Mesh Specifications
- **Mesh Object**: `ground` (`tree-3d.js:304-314`)
- **Geometry**: `THREE.PlaneGeometry(150, 150)`
- **Transform**: `ground.rotation.x = -Math.PI / 2; ground.position.y = 0;`
- **Material**: `THREE.MeshStandardMaterial`
  - `color`: `0x051108` (Dark emerald/forest black tint)
  - `roughness`: `0.9`
  - `metalness`: `0.1`
  - `receiveShadow`: `true`
- **Textures**: None attached (no albedo, normal, or displacement maps).

### Existing Ground Grass Blades
- **Mesh Object**: `grassInstanced` (`tree-3d.js:317-335`)
- **Instance Count**: 3000 instances
- **Geometry**: `THREE.ConeGeometry(0.15, 1.5, 3)`
- **Material**: `THREE.MeshStandardMaterial({ color: 0x0a1f0f, roughness: 0.9 })`
- **Placement**: Scattered in circle $r \in [2, 62]$, $Y = 0.75$, with random $Y$ rotation and subtle tilt.

---

## Summary of Findings & Next Steps
1. The 3D scene in `tree-3d.js` is fully self-contained using Three.js PerspectiveCamera $(0, 20, 65)$ looking at $(0, 12, 0)$.
2. Ground plane exists at $Y=0$ with dimensions $150 \times 150$, colored `0x051108`.
3. Recommended flower placement bounds: Ground $Y \in [0.05, 0.12]$, radial distance $r \in [2.5, 25.0]$, rectangular bounds $X \in [-28, 28]$, $Z \in [-18, 35]$.
4. New flower WebGL shaders / materials can be added directly to `treeScene` and updated seamlessly within `renderTree3D()`.
