# Comprehensive Shader Investigation & Three.js Flower Blooming Adaptation Plan

## Executive Summary
This document delivers a thorough investigation of the WebGL shader architecture and Three.js integration parameters required to implement an automated, persistent flower blooming effect on the ground plane in `tree-3d.js`. It details the repository search results, GLSL vertex and fragment shader specifications, `THREE.ShaderMaterial` construction, `THREE.Sprite` vs `THREE.PlaneGeometry` adaptation trade-offs, and the individual timing uniform model for persistent blooming.

---

## 1. Repository Shader Search & Codebase Status

### 1.1 Search Methodology & Scope
An exhaustive search was conducted across all files in the project root (`/Users/ankanghosh/Desktop/projects/timer timer`):
- **File Types Examined**: `.js`, `.html`, `.css`, `.glsl`, `.md`, `.json`, asset files.
- **Search Queries**: `shader`, `flower`, `bloom`, `gl_FragColor`, `uTime`, `uProgress`, `precision`, `atan`, `petal`.

### 1.2 Search Findings
1. **No External or Legacy Flower Shader File**: No existing `.glsl` file or click-based flower blooming shader string is currently saved in the repository filesystem.
2. **Existing Custom Shaders in Codebase**:
   - `tree-3d.js:101-138`: `fireflyMat` (`THREE.ShaderMaterial` with vertex oscillating position & fragment radial distance falloff for firefly particles).
   - `candle-3d.js:136-195, 260-305`: `waxMat` and `flameMat` (Custom GLSL shader modifying Three.js standard materials via `onBeforeCompile` for candle subsurface light transport and teardrop flame flickering).
   - `water-bowl-3d.js:77-145`: `waterMat` (`onBeforeCompile` vertex wave displacement and caustic shimmer).

### 1.3 Conclusion for Implementation
Because no raw click-based shader asset file exists in the repo, the procedural flower blooming WebGL shader must be constructed directly as a custom `THREE.ShaderMaterial`. The full mathematical formulation and GLSL implementation are defined below.

---

## 2. GLSL Shader Implementation Analysis

### 2.1 Uniform Specifications
To achieve smooth, organic flower blooming with individual timing and color variation, the shader requires five core uniforms:

| Uniform | GLSL Type | Three.js Type | Description / Function |
|---|---|---|---|
| `uTime` | `float` | `THREE.Uniform(float)` | Global timestamp in seconds; drives subtle ambient petal swaying & shimmer |
| `uBloom` | `float` | `THREE.Uniform(float)` | Individual bloom progress ratio $[0.0, 1.0]$. At `0.0`, bud is closed/invisible; at `1.0`, flower is fully bloomed |
| `uColor` | `vec3` | `THREE.Color` | Primary petal color (pink `#ff6b8b`, cherry blossom `#ffb7c5`, gold `#ffd700`, or purple `#d8bfd8`) |
| `uCenterColor` | `vec3` | `THREE.Color` | Center stamen / pistil color (warm golden yellow `#ffcc00` or deep orange `#ff8800`) |
| `uSeed` | `float` | `THREE.Uniform(float)` | Random float per flower instance; randomizes petal count ($5, 6, 7$) and angular phase |

### 2.2 Vertex Shader Analysis
The vertex shader passes UV coordinates to the fragment shader and transforms 3D position vectors through model-view-projection matrices:

```glsl
varying vec2 vUv;

void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
```

### 2.3 Fragment Shader Analysis (Procedural Flower Geometry & Bloom Interpolation)
The fragment shader evaluates 2D polar coordinates ($r, \theta$) relative to the center of the planar quad:
- **Polar Coordinate Mapping**: $ST = (vUv - 0.5) \times 2.0$, $r = \sqrt{ST_x^2 + ST_y^2}$, $\theta = \text{atan}(ST_y, ST_x)$.
- **Petal Geometry Function**: $R_{\text{petal}}(\theta) = \left(0.55 + 0.15 \sin(k \cdot \theta + \text{uSeed})\right) \cdot \text{uBloom}$, where $k \in \{5, 6, 7\}$.
- **Edge Anti-Aliasing**: Smoothstep transition between $R_{\text{petal}} - 0.04$ and $R_{\text{petal}}$.
- **Stamen Disc**: Central circle $R_{\text{stamen}} = 0.18 \cdot \text{uBloom}$ with warm yellow color blending and soft radial exponential glow.

```glsl
uniform float uTime;
uniform float uBloom;
uniform vec3 uColor;
uniform vec3 uCenterColor;
uniform float uSeed;

varying vec2 vUv;

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

void main() {
    // Center coordinates to [-1, 1]
    vec2 st = (vUv - 0.5) * 2.0;
    
    float r = length(st);
    float angle = atan(st.y, st.x);
    
    // Vary petal count per flower instance based on uSeed
    float numPetals = 5.0 + floor(hash(uSeed) * 3.0);
    
    // Calculate petal boundary with subtle ambient wind sway
    float petalOscillation = sin(angle * numPetals + uTime * 0.5 + uSeed) * 0.15;
    float maxPetalRadius = (0.55 + petalOscillation) * uBloom;
    
    // Stamen radius
    float centerRadius = 0.18 * uBloom;
    
    // Calculate alpha falloffs
    float petalAlpha = 1.0 - smoothstep(maxPetalRadius - 0.05, maxPetalRadius, r);
    float centerMask = 1.0 - smoothstep(centerRadius - 0.03, centerRadius, r);
    
    // Color composition
    vec3 petalGradient = uColor * (0.85 + 0.3 * r);
    vec3 finalColor = mix(petalGradient, uCenterColor, centerMask);
    
    // Add central radiance glow
    float centerGlow = exp(-r * 5.0) * uBloom;
    finalColor += vec3(1.0, 0.9, 0.5) * centerGlow * 0.35;
    
    float finalAlpha = petalAlpha * min(1.0, uBloom * 2.5);
    
    if (finalAlpha < 0.01) discard;
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}
```

---

## 3. Adaptation into Three.js Architecture

### 3.1 Mesh Primitive Selection: `THREE.Sprite` vs `THREE.PlaneGeometry`

| Attribute | `THREE.Sprite` | `THREE.PlaneGeometry` (Flat Mesh) |
|---|---|---|
| **Billboard Alignment** | Automatically billboards to face `treeCamera` at $(0, 20, 65)$ | Lies flat on ground plane ($X = -\pi/2$, $Y = 0.08$) |
| **Material Support** | Uses `THREE.SpriteMaterial` or custom `THREE.ShaderMaterial` | Standard `THREE.ShaderMaterial` on `THREE.Mesh` |
| **Perspective Alignment** | Always perpendicular to camera view ray | Parallel to ground plane mesh ($150 \times 150$), matching falling leaves |
| **Z-Fighting Risk** | Low (oriented vertically in 3D space) | Avoided by placing $Y \in [0.05, 0.12]$ and setting `depthWrite: false` |
| **Recommendation** | **Secondary (Optional)** | **PRIMARY RECOMMENDED APPROACH**: `THREE.PlaneGeometry(1.8, 1.8)` rotated $X = -\pi/2$ sitting on ground plane $Y = 0.08$ produces the most realistic ground-blooming aesthetic. |

### 3.2 `THREE.ShaderMaterial` Construction Strategy
To ensure optimal GPU performance across 50–80 flowers:
1. Shared Shader Material or Unique Uniform Clones:
   - Since each flower requires an individual `uBloom` value and `uSeed`, each active flower mesh receives a lightweight clone of the `THREE.ShaderMaterial` (or a unique uniform dictionary instance).
2. Material Configuration:
   ```javascript
   const flowerMat = new THREE.ShaderMaterial({
       uniforms: {
           uTime: { value: 0 },
           uBloom: { value: 0 },
           uColor: { value: new THREE.Color(0xff6b8b) },
           uCenterColor: { value: new THREE.Color(0xffd700) },
           uSeed: { value: Math.random() * 100 }
       },
       vertexShader: flowerVertexShader,
       fragmentShader: flowerFragmentShader,
       transparent: true,
       depthWrite: false,
       side: THREE.DoubleSide
   });
   ```

---

## 4. Individual Flower Bloom Timing & Persistence Model

### 4.1 Timing Data Structure
Each flower object in the pool tracks its bloom progression:
```javascript
const flowerInstance = {
    mesh: planeMesh,               // THREE.Mesh instance
    material: flowerMat,           // ShaderMaterial reference
    spawnTime: 0.0,               // Timestamp (seconds) when flower began blooming
    bloomDuration: 2.0,           // Duration of bloom animation (e.g. 1.8 - 2.5 seconds)
    isSpawning: false,            // Active flag
    isFullyBloomed: false         // Persistence flag
};
```

### 4.2 Uniform Update Lifecycle per Frame
During `renderTree3D(progress, totalSeconds)`:

1. **Calculate Target Spawning Count**:
   $$\text{effectiveProgress} = \min\left(1.0, \frac{\text{progress} \times \text{totalSeconds}}{\max(1, \text{totalSeconds} - 2)}\right)$$
   $$\text{idealFlowerCount} = \lfloor \text{effectiveProgress} \times \text{TARGET\_FLOWERS} \rfloor$$

2. **Trigger New Flower Spawns**:
   If `activeFlowerCount < idealFlowerCount`:
   - Retrieve next dormant flower from pool.
   - Set `flower.spawnTime = currentTime`.
   - Set `flower.isSpawning = true`.
   - Set `flower.mesh.visible = true`.

3. **Per-Frame Uniform Advancement**:
   ```javascript
   const currentTime = performance.now() * 0.001;

   for (let i = 0; i < activeFlowerCount; i++) {
       const flower = flowerPool[i];
       if (flower.isSpawning) {
           const elapsed = currentTime - flower.spawnTime;
           
           if (elapsed >= flower.bloomDuration) {
               // Persistent state reached
               flower.material.uniforms.uBloom.value = 1.0;
               flower.isFullyBloomed = true;
           } else {
               // Smooth cubic ease-out bloom expansion
               const t = elapsed / flower.bloomDuration;
               const easeOut = 1.0 - Math.pow(1.0 - t, 3.0);
               flower.material.uniforms.uBloom.value = easeOut;
           }
           
           // Pass global time for subtle ambient swaying
           flower.material.uniforms.uTime.value = currentTime;
       }
   }
   ```

4. **Persistence Guarantee (Requirement R3)**:
   - Once `uBloom` reaches `1.0`, `uBloom` stays locked at `1.0` indefinitely.
   - Mesh remains `visible = true` on ground plane $Y = 0.08$.
   - No fading, opacity decay, or scene graph removal occurs until `resetTree3D()` or `progress < 0.001` is invoked.

---

## 5. Verification Checkpoints for Implementation

1. **Shader Compilation**: Zero WebGL compilation or linking errors in console.
2. **Ground Plane Alignment**: Flowers spawn within ground radius $r \in [2.5, 25.0]$, elevated at $Y \in [0.05, 0.12]$.
3. **Smooth Blooming**: Blooming unfolds smoothly over 2 seconds per flower using ease-out interpolation without sudden popping.
4. **Persistent Bloom State**: Flowers that reach `uBloom = 1.0` stay visible on screen throughout timer countdown and completion ceremony.
5. **Reset Behavior**: `resetTree3D()` cleanly sets all flowers `visible = false` and resets `uBloom = 0.0`.
