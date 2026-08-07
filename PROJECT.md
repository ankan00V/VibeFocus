# Project: WebGL Flower Blooming Effect for Tree Timer

## Architecture
- `app.js`: Drives application state (`state.totalSeconds`, `state.startTime`, timer loop `tickFocus`) and calls `renderTree3D(progress, totalSeconds)` on each frame.
- `tree-3d.js`: Manages the Three.js 3D scene (`treeScene`, `treeCamera`, `treeRenderer`), ground plane, falling leaves, lighting, and grass instances. Integrates procedural GLSL flower shader quads/sprites onto ground plane ($Y = 0.08$), managing individual bloom progress (`uBloom`) and timer-driven spawning logic.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Procedural WebGL Flower Shader | Custom GLSL vertex & fragment shaders with multi-petal polar math, stamen center disc, color palettes, and `uBloom` animation uniform. | M1 | R1, R3 |
| 2 | 3D Ground Quad/Sprite Integration | 3D planar quads (`THREE.PlaneGeometry(1.8, 1.8)` rotated $X = -\pi/2$ or `THREE.Sprite`) placed on ground plane ($Y = 0.08$) surrounding tree base ($r \in [2.5, 25.0]$) matching camera perspective and lighting. | M1 | R2 |
| 3 | Automated Timer-Based Spawning | Flower spawning rate tied to timer progress (`effectiveProgress = Math.min(1.0, (progress * totalSeconds) / Math.max(1, totalSeconds - 2))`), spawning flowers proportionally over total session duration without user interaction. | M2 | R1 |
| 4 | Persistent Flower Lifecycle & Reset | Once a flower reaches `uBloom = 1.0`, it stays fully bloomed permanently on ground plane until `resetTree3D()` or `progress < 0.001` is triggered. | M2 | R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Flower Shader & 3D Ground Quad Integration | Add procedural GLSL flower vertex & fragment shaders, create flower material builder, and implement 3D ground plane quad/sprite pool in `tree-3d.js`. | none | DONE |
| 2 | M2: Timer Spawning & Persistent Retention | Wire flower spawning to `renderTree3D(progress, totalSeconds)`, compute target count per frame based on `effectiveProgress`, update `uBloom` uniforms, and handle `resetTree3D()` clean reset. | M1 | DONE |
| 3 | M3: E2E Verification & Forensic Audit | Run syntax/runtime checks, verify no WebGL/JS console errors, perform forensic audit for integrity, and verify all acceptance criteria. | M2 | DONE |

## Interface Contracts
### `app.js` ↔ `tree-3d.js`
- `renderTree3D(progress, totalSeconds)`: Called every frame during active focus session. `progress` is normalized float $[0.0, 1.0]$, `totalSeconds` is total session duration in seconds.
- `resetTree3D()`: Called when user resets timer, stops session, or changes vibe mode. Resets all bloomed flowers (`uBloom = 0.0`, `visible = false`, `bloomedCount = 0`).

## Code Layout
- Target file: `/Users/ankanghosh/Desktop/projects/timer timer/tree-3d.js`
  - Shaders: `FLOWER_VERTEX_SHADER`, `FLOWER_FRAGMENT_SHADER` defined at top of file.
  - Setup: Flower mesh/material creation & container group `flowerGroup` added to `treeScene` inside `initTree3D()`.
  - Spawning & Animation: `updateFlowers(progress, totalSeconds, delta)` called inside `renderTree3D()`.
  - Reset: `resetFlowers()` called inside `resetTree3D()`.
