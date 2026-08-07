# Original User Request

## Request — 2026-07-25T08:08:34Z

Upgrade the visual aesthetics and animation of the "candle" component to professional-grade, high-end visuals, matching the quality of the newly upgraded water bowl and tree components.

Working directory: /Users/ankanghosh/Desktop/projects/timer timer

Integrity mode: development

## Requirements

### R1. Upgrade to WebGL (Three.js)
The candle visual must be completely rewritten from a 2D canvas implementation to a true 3D WebGL implementation using Three.js, matching the high-end technical foundation of the tree and water bowl components.

### R2. High-End Visual Aesthetics
The new candle must feature professional-grade visual elements. This includes a dynamic, organic flame (e.g., using custom shaders or advanced sprites), a 3D wax body with realistic shading (such as subsurface scattering approximations or rich materials), dynamic lighting that illuminates the surrounding scene, and realistic melting effects.

### R3. Seamless Integration & Timer Synchronization
The WebGL candle must integrate flawlessly with the existing timer architecture (e.g., `startFocus()`, `stopSession()`, pause/resume). The candle must physically melt down or dynamically change in real-time proportionally to the remaining timer duration.

## Acceptance Criteria

### Technical Foundation
- [ ] The candle rendering utilizes Three.js constructs (Scene, Camera, WebGLRenderer, Mesh, ShaderMaterial) rather than 2D Canvas context rendering.
- [ ] A dedicated Three.js animation loop is used, correctly integrated into the app's global requestAnimationFrame or a self-contained loop that responds to app state.

### Visual Quality
- [ ] A dynamic lighting source (e.g., PointLight) is attached to the flame, casting realistic light/glow.
- [ ] The flame animation uses advanced techniques (custom GLSL shaders, particle systems, or complex animated geometry) rather than basic flat shapes.
- [ ] The candle body exhibits realistic texture or shading (not just a flat color).

### Functional Integration
- [ ] As the timer counts down, the height or visual state of the candle's wax body decreases smoothly to represent melting.
- [ ] The new candle component respects the app's start, pause, and stop/complete events without throwing errors or causing infinite loops.
