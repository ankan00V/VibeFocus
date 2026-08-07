# Technical Implementation Blueprint: WebGL Flower Blooming System (Milestones M1 & M2)

## 1. Complete GLSL Shader Source Code

### 1.1 `flowerVertexShader`
```javascript
const flowerVertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;
```

### 1.2 `flowerFragmentShader`
```javascript
const flowerFragmentShader = `
    uniform float uTime;
    uniform float uBloom;
    uniform vec3 uPetalColor;
    uniform vec3 uCenterColor;
    uniform float uPetalCount;
    uniform float uSeed;

    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
        // Map UV coordinates from [0, 1] to centered [-1, 1]
        vec2 p = (vUv - vec2(0.5)) * 2.0;
        float r = length(p);
        float angle = atan(p.y, p.x);

        // Clamp bloom uniform to [0.0, 1.0]
        float bloom = clamp(uBloom, 0.0, 1.0);
        if (bloom <= 0.001) discard;

        // Modulate petal radius based on petal count and angle
        // abs(sin(count * angle * 0.5)) creates smooth multi-petal contours
        float petalShape = pow(abs(sin(uPetalCount * angle * 0.5)), 0.65);
        
        // Base petal boundary radius scaled by bloom progress
        float maxRadius = bloom * (0.2 + 0.75 * petalShape);

        // Discard pixels outside flower boundary with smooth anti-aliased edge
        float edgeSmooth = 0.025;
        float alpha = 1.0 - smoothstep(maxRadius - edgeSmooth, maxRadius + edgeSmooth, r);
        if (alpha <= 0.01) discard;

        // Center stamen disc radius scaled by bloom
        float centerRadius = 0.22 * bloom;
        float centerMask = 1.0 - smoothstep(centerRadius - 0.03, centerRadius + 0.03, r);

        // Petal color gradient: brighter near center to soft tone at petal tips
        float petalGradient = smoothstep(centerRadius, maxRadius, r);
        vec3 petalCol = mix(uPetalColor * 1.15, uPetalColor * 0.85, petalGradient);

        // Add subtle petal vein variation
        float vein = sin(angle * uPetalCount * 2.0 + uSeed) * 0.05 + 0.95;
        petalCol *= vein;

        // Combine center stamen disc color and petal color
        vec3 finalColor = mix(petalCol, uCenterColor, centerMask);

        // Add soft golden stamen center glow
        float stamenGlow = exp(-r * 4.0) * centerMask;
        finalColor += vec3(0.3, 0.25, 0.05) * stamenGlow;

        // Fade in overall alpha smoothly during early bloom
        float finalAlpha = alpha * smoothstep(0.0, 0.2, bloom);

        gl_FragColor = vec4(finalColor, finalAlpha);
    }
`;
```

---

## 2. Three.js Geometry & Material Creation

### 2.1 Geometry
- **Type**: `THREE.PlaneGeometry(1.8, 1.8)`
- **Orientation**: Rotated $X = -\pi / 2$ rad (`-Math.PI / 2`) so the quad lies parallel to the ground plane ($XZ$).
- **Elevation**: Positioned at height $Y \in [0.08, 0.11]$ to sit above the ground mesh ($Y = 0.0$) and below full grass blade heights ($Y = 0.75$).

### 2.2 Material Configuration
- **Material Type**: `THREE.ShaderMaterial`
- **Side**: `THREE.DoubleSide`
- **Transparent**: `true`
- **DepthWrite**: `false` (CRITICAL: prevents quad boundary clipping against the dark ground plane and grass blades)
- **Uniforms**:
  - `uTime`: `{ value: 0 }`
  - `uBloom`: `{ value: 0.0 }`
  - `uPetalColor`: `{ value: new THREE.Color() }`
  - `uCenterColor`: `{ value: new THREE.Color(0xffd700) }` (Golden Yellow)
  - `uPetalCount`: `{ value: 5.0 }`
  - `uSeed`: `{ value: 0.0 }`

---

## 3. Ground Placement Math & Palette Selection

### 3.1 Polar Coordinate Math
Flowers spawn in a radial distribution surrounding the central tree trunk:
- **Radial Distance**: $r = 2.5 + \text{random}(0.0, 22.5)$ ($r \in [2.5, 25.0]$)
- **Polar Angle**: $\theta = \text{random}(0.0, 2\pi)$ ($\theta \in [0, 2\pi]$)
- **Cartesian Coordinates**:
  - $X = r \cdot \cos(\theta)$
  - $Y = 0.08 + \text{random}(0.0, 0.03)$
  - $Z = r \cdot \sin(\theta)$
- **Planar Rotation**:
  - `mesh.rotation.x = -Math.PI / 2`
  - `mesh.rotation.z = random(0, 2\pi)`

### 3.2 Palette & Petal Count Variation
- **Palette Array (`PALETTE`)**:
  1. Cherry Blossom Pink: `0xffb7c5`
  2. Soft White / Blush: `0xfff0f5`
  3. Vibrant Magenta: `0xe0115f`
  4. Soft Plum Pink: `0xdda0dd`
  5. Rose Coral: `0xff6b81`
- **Center Stamen Color (`STAMEN_COLOR`)**: Golden Yellow `0xffd700`
- **Petal Count Variation**: Integer $N \in [5, 8]$ (`Math.floor(Math.random() * 4) + 5`)

---

## 4. Flower Pool Data Structure & Initialization

### 4.1 Data Structure
```javascript
let flowerGroup;
let flowerPool = [];
const TOTAL_FLOWERS = 60;
let lastTreeFrameTime = 0;
```

### 4.2 Pool Initialization (`initTree3D`)
```javascript
// Add inside initTree3D():
flowerGroup = new THREE.Group();
treeScene.add(flowerGroup);

const flowerGeom = new THREE.PlaneGeometry(1.8, 1.8);

const PALETTE = [
    new THREE.Color(0xffb7c5), // Cherry Blossom Pink
    new THREE.Color(0xfff0f5), // Soft White / Blush
    new THREE.Color(0xe0115f), // Vibrant Magenta
    new THREE.Color(0xdda0dd), // Soft Plum Pink
    new THREE.Color(0xff6b81)  // Rose Coral
];
const STAMEN_COLOR = new THREE.Color(0xffd700); // Golden Yellow

flowerPool = [];
for (let i = 0; i < TOTAL_FLOWERS; i++) {
    const r = 2.5 + Math.random() * 22.5;
    const theta = Math.random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const y = 0.08 + Math.random() * 0.03;
    const z = Math.sin(theta) * r;

    const petalColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const petalCount = Math.floor(Math.random() * 4) + 5;

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uBloom: { value: 0.0 },
            uPetalColor: { value: petalColor.clone() },
            uCenterColor: { value: STAMEN_COLOR.clone() },
            uPetalCount: { value: petalCount },
            uSeed: { value: Math.random() * 100.0 }
        },
        vertexShader: flowerVertexShader,
        fragmentShader: flowerFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(flowerGeom, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.visible = false;

    flowerGroup.add(mesh);

    flowerPool.push({
        mesh: mesh,
        material: mat,
        bloomProgress: 0.0
    });
}
```

---

## 5. Spawning & Bloom Progress Update Logic

Inside `renderTree3D(progress, totalSeconds)`:

```javascript
// Calculate frame time delta
const delta = lastTreeFrameTime > 0 ? Math.min(0.1, time - lastTreeFrameTime) : 0.016;
lastTreeFrameTime = time;

// Calculate effective progress matching leaf pacing (finishes 2 seconds before session end)
const timeElapsed = progress * totalSeconds;
const targetDetachmentTime = Math.max(1, totalSeconds - 2);
const effectiveProgress = Math.min(1.0, timeElapsed / targetDetachmentTime);

// Determine total target flowers that should be active based on progress
const targetCount = Math.floor(effectiveProgress * TOTAL_FLOWERS);

// Update bloom progress for all flowers in pool
const bloomDuration = 2.0; // 2 seconds for a flower to fully open
for (let i = 0; i < TOTAL_FLOWERS; i++) {
    const flower = flowerPool[i];
    if (i < targetCount) {
        flower.mesh.visible = true;
        if (flower.bloomProgress < 1.0) {
            flower.bloomProgress = Math.min(1.0, flower.bloomProgress + delta / bloomDuration);
        }
    }
    // Update shader uniforms
    flower.material.uniforms.uBloom.value = flower.bloomProgress;
    flower.material.uniforms.uTime.value = time;
}
```

---

## 6. Reset Handling

Reset handling must reset flower visibility and bloom state to `0.0` whenever a session is restarted, reset, or progress drops below `0.001`.

### 6.1 `resetTree3D()`
```javascript
function resetTree3D() {
    if (!isTreeInitialized) return;
    currentTargetDropped = 0;
    for (let i = 0; i < leafData.length; i++) {
        const leaf = leafData[i];
        leaf.attached = true;
        leaf.grounded = false;
        leaf.pos.copy(leaf.startPos);
        leaf.vel.set(0,0,0);
    }
    // Reset Flower Pool State
    for (let i = 0; i < flowerPool.length; i++) {
        const flower = flowerPool[i];
        flower.bloomProgress = 0.0;
        flower.material.uniforms.uBloom.value = 0.0;
        flower.mesh.visible = false;
    }
}
```

### 6.2 `renderTree3D(progress, totalSeconds)` reset check
```javascript
if (progress < 0.01) {
    currentTargetDropped = 0;
    detachmentQueue = 0;
    for (let i = 0; i < activeLeafCount; i++) {
        leafData[i].attached = true;
        leafData[i].grounded = false;
        leafData[i].pos.copy(leafData[i].startPos);
        leafData[i].vel.set(0,0,0);
    }
    // Reset Flower Pool State on short progress
    for (let i = 0; i < flowerPool.length; i++) {
        const flower = flowerPool[i];
        flower.bloomProgress = 0.0;
        flower.material.uniforms.uBloom.value = 0.0;
        flower.mesh.visible = false;
    }
}
```

---

## 7. Line-by-Line Integration Plan for `tree-3d.js`

| Target Line(s) in `tree-3d.js` | Action | Code Component |
|---|---|---|
| **Lines 5–7** | Insert Shader definitions & global flower variables | `flowerVertexShader`, `flowerFragmentShader`, `flowerGroup`, `flowerPool`, `TOTAL_FLOWERS`, `lastTreeFrameTime` |
| **Lines 336–337** (End of `initTree3D()`, before `isTreeInitialized = true`) | Insert Flower Pool creation loop | Instantiate 60 flowers, set uniforms, add to `flowerGroup`, push to `flowerPool`, add `flowerGroup` to `treeScene` |
| **Lines 351–360** (`resetTree3D()`) | Insert Flower Pool reset loop | Reset `bloomProgress = 0.0`, `uBloom = 0.0`, `mesh.visible = false` for all flowers in `flowerPool` |
| **Lines 397–407** (`renderTree3D()` reset block when `progress < 0.01`) | Insert Flower Pool reset loop | Reset `bloomProgress = 0.0`, `uBloom = 0.0`, `mesh.visible = false` for all flowers in `flowerPool` |
| **Lines 411–414** (`renderTree3D()` progress scaling) | Reference `effectiveProgress` | Use `effectiveProgress = Math.min(1.0, timeElapsed / targetDetachmentTime)` for flower target count |
| **Lines 590–593** (Before `treeRenderer.render()`) | Insert Flower bloom update loop | Calculate `delta`, compute `targetCount = Math.floor(effectiveProgress * TOTAL_FLOWERS)`, increment `flower.bloomProgress += delta / 2.0` up to `1.0`, update uniforms `uBloom` and `uTime` |
