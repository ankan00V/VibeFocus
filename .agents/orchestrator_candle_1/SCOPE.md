# Scope: Candle 3D WebGL Upgrade

## Architecture
- Upgrade Candle component of VibeFocus from 2D canvas to 3D WebGL using Three.js (`candle-3d.js`).
- Dynamic organic flame (GLSL shader / particle system), 3D wax body with procedural shading/subsurface scattering, dynamic PointLight attached to flame.
- Timer synchronization: wax body height melts down smoothly in real-time based on remaining session time.
- Lifecycle management: startFocus, stopSession, pause, resume, resize handling.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Architecture | Analyze tree-3d.js, water-bowl-3d.js, app.js integration, candle spec | None | DONE |
| 2 | Candle 3D Implementation | Create candle-3d.js with Three.js scene, wax mesh, flame shader, PointLight, melting | M1 | DONE |
| 3 | App & Timer Integration | Wire candle-3d.js into index.html, app.js timer hooks, resize handling, lifecycle events | M2 | DONE |
| 4 | Verification & Hardening | Review code, test functionality/responsiveness, forensic audit, challenger check | M3 | DONE |

## Interface Contracts
### Candle3D API
- `initCandle3D(canvas)`: initialize Three.js scene, camera, renderer, materials, lights, and meshes
- `renderCandle3D(progress, time, isCeremonyActive, totalSeconds)`: render frame with progress-driven melting & shader animation
- `resetCandle3D()`: reset candle height, drip state, and ember particles to initial full state
- `destroyCandle3D()`: dispose WebGL geometries, materials, textures (`haloMap`), and renderer
- `resizeCandle3D(width, height)`: update camera aspect ratio and renderer dimensions safely
