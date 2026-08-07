## 2026-07-25T08:09:15Z
You are teamwork_preview_explorer_candle_3 working in /Users/ankanghosh/Desktop/projects/timer timer/.agents/teamwork_preview_explorer_candle_3/

Your task is to create a detailed technical specification for the new `candle-3d.js` WebGL component.

1. Read the user requirements in `/Users/ankanghosh/Desktop/projects/timer timer/.agents/orchestrator_candle_1/ORIGINAL_REQUEST.md`.
2. Design the technical architecture for `candle-3d.js`:
   - 3D Wax Body: Mesh geometry (Cylinder/Lathe), material properties (roughness, metalness, color, subsurface scattering approximation/translucency, melt uniforms).
   - Flame & Lighting: Custom GLSL ShaderMaterial or particle system for organic flame flicker, inner core & outer warm halo, dynamic Three.js PointLight attached to flame with gentle flicker intensity variation.
   - Melting Effect: Physics/math of melting downwards proportionally to remaining duration ratio (height reduction, top rim pool/drips, wick position tracking).
   - API contract matching `tree-3d.js` and `water-bowl-3d.js` lifecycle (init, start, updateProgress, pause, resume, reset, destroy, resize).
3. Write a detailed technical specification and handoff report to `/Users/ankanghosh/Desktop/projects/timer timer/.agents/teamwork_preview_explorer_candle_3/handoff.md`.
4. Send your completed handoff report summary to the orchestrator via send_message.
