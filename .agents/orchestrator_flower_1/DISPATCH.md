## 2026-08-07T11:14:57Z
You are the PROJECT ORCHESTRATOR.

Working directory: /Users/ankanghosh/Desktop/projects/timer timer/.agents/orchestrator_flower_1/
Project root: /Users/ankanghosh/Desktop/projects/timer timer
Original Request file: /Users/ankanghosh/Desktop/projects/timer timer/ORIGINAL_REQUEST.md
Integrity mode: benchmark

Your Mission:
Implement an automated, naturally emerging WebGL flower blooming effect on the ground of the tree timer as the countdown progresses, adapting a provided click-based shader into an autonomous system where flowers emerge randomly and do not disappear.

Requirements:
- R1. Automated Flower Blooming: Adapt the provided WebGL shader code to automatically spawn flowers on the ground of the tree scene at intervals proportional to the total timer duration (evenly spread across the session), without any user interaction.
- R2. 3D Sprite Integration: Render the flowers as 2D sprites/billboards placed on the 3D ground plane in `tree-3d.js` so they match the perspective of the existing 3D scene and falling leaves.
- R3. Persistent Flowers: Once a flower has fully bloomed, it must remain on the ground permanently until the timer is reset, rather than fading away. The flower emergence should feel effortless and natural, blending smoothly with the existing tree timer's aesthetics.

Acceptance Criteria:
- Code check: The flower spawning logic is tied to the timer's progress (e.g., in the render loop or interval based on remaining time).
- Code check: Flowers are implemented as `THREE.Sprite` or similar planar meshes with the provided shader material attached.
- Code check: Flowers remain visible in the scene graph and are not removed or faded out after their bloom animation completes.
- Integration check: `tree-3d.js` compiles and runs without WebGL or JavaScript console errors.
