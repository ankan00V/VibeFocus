/**
 * candle-3d.js - High-Performance 3D WebGL Candle Visualization for VibeFocus
 * 
 * Features:
 * - 3D Wax Body with Subsurface Scattering (SSS) and translucent translucency glow
 * - Custom GLSL Shader Teardrop Flame with 3-tier color gradient (Blue -> Yellow -> Amber) & organic flicker
 * - Multi-frequency flickering THREE.PointLight bound to wick tip
 * - Progress-driven melting physics (wax height reduction, top basin sag, sinking wick & flame)
 * - Procedural wax drips on outer cylinder walls & expanding base wax pool
 * - Ambient floating glow embers for ceremony & focus depth
 * - Full lifecycle management: init, render, reset, destroy, resize
 */

let candleScene, candleCamera, candleRenderer;
let candleGroup, waxMesh, basinMesh, wickMesh, flameMesh, haloSprite, poolMesh, dripGroup, emberParticles;
let waxMat, flameMat, poolMat, dripMat, emberMat;
let flameLight, ambientLight, dirLight, rimLight;
let waxUniforms, flameUniforms;
let isCandleInitialized = false;

// Physics and melt tracking state
let currentMeltProgress = 0;
let lastFrameTime = 0;
let dripList = [];
let emberData = [];
const BASE_Y = -1.5;
const MAX_HEIGHT = 3.0;
const INITIAL_RADIUS = 0.78;

/**
 * Creates a radial glow texture for the additive outer flame halo sprite
 */
function createFlameGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0.0, 'rgba(255, 220, 140, 0.95)');
    gradient.addColorStop(0.2, 'rgba(255, 140, 40, 0.65)');
    gradient.addColorStop(0.5, 'rgba(255, 70, 0, 0.25)');
    gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

/**
 * Initializes the 3D Candle WebGL environment
 * @param {HTMLCanvasElement} [canvas] - Target canvas element
 */
function initCandle3D(canvas) {
    if (!canvas) {
        canvas = document.getElementById('candle-canvas');
    }
    if (!canvas) return;

    // Teardrop any existing context cleanly
    if (isCandleInitialized) {
        resetCandle3D();
        return;
    }

    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;

    // WebGL Renderer Setup
    candleRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
    });
    candleRenderer.setSize(width, height, false);
    candleRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    candleRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    candleRenderer.toneMappingExposure = 1.1;

    // Scene & Camera
    candleScene = new THREE.Scene();
    const aspect = width / height;
    candleCamera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    candleCamera.position.set(0, 0.8, 5.8);
    candleCamera.lookAt(0, -0.1, 0);

    // Root Candle Group
    candleGroup = new THREE.Group();
    candleScene.add(candleGroup);

    // ── LIGHTING ──
    ambientLight = new THREE.AmbientLight(0x2a2018, 0.6);
    candleScene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(4, 6, 4);
    candleScene.add(dirLight);

    rimLight = new THREE.SpotLight(0x3a5588, 2.2);
    rimLight.position.set(-5, 4, -4);
    candleScene.add(rimLight);

    // Dynamic flickering flame light
    flameLight = new THREE.PointLight(0xff9933, 3.2, 12, 1.8);
    candleScene.add(flameLight);

    // ── 3D WAX BODY ──
    // 64 radial x 64 height segments for smooth vertex deformation
    const waxGeo = new THREE.CylinderGeometry(INITIAL_RADIUS, INITIAL_RADIUS * 1.05, MAX_HEIGHT, 64, 64);
    
    waxUniforms = {
        uTime: { value: 0 },
        uMeltProgress: { value: 0 },
        uFlamePos: { value: new THREE.Vector3(0, BASE_Y + MAX_HEIGHT + 0.3, 0) },
        uFlameIntensity: { value: 3.2 }
    };

    waxMat = new THREE.MeshPhysicalMaterial({
        color: 0xfdf6ed,
        emissive: 0x110a04,
        roughness: 0.28,
        metalness: 0.02,
        transmission: 0.55,
        thickness: 1.1,
        ior: 1.46,
        transparent: true,
        opacity: 0.98
    });

    // Custom SSS & Melt Deformation GLSL Injection
    waxMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = waxUniforms.uTime;
        shader.uniforms.uMeltProgress = waxUniforms.uMeltProgress;
        shader.uniforms.uFlamePos = waxUniforms.uFlamePos;
        shader.uniforms.uFlameIntensity = waxUniforms.uFlameIntensity;

        shader.vertexShader = `
            uniform float uTime;
            uniform float uMeltProgress;
            varying vec3 vCustomWorldPos;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            vec3 transformed = position;
            
            // Height fraction: 0 at base (-1.5), 1 at original top (+1.5)
            float hFrac = clamp((transformed.y + 1.5) / 3.0, 0.0, 1.0);
            float meltFactor = uMeltProgress * 0.72; // Max melt 72%
            
            // Compress height downwards toward base
            transformed.y = -1.5 + (transformed.y + 1.5) * (1.0 - meltFactor);
            
            // Top rim sags & uneven melting edge
            if (hFrac > 0.85) {
                float topT = (hFrac - 0.85) / 0.15;
                float angle = atan(transformed.z, transformed.x);
                float rimSag = sin(angle * 3.0 + 1.2) * 0.045 + cos(angle * 5.0) * 0.025;
                transformed.y += rimSag * topT * (0.2 + uMeltProgress * 0.8);
                
                // Slight outward rim expansion as wax melts
                float radExpand = (1.0 + rimSag * 0.3) * topT * 0.06 * uMeltProgress;
                transformed.x += transformed.x * radExpand;
                transformed.z += transformed.z * radExpand;
            }
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `
            #include <worldpos_vertex>
            vCustomWorldPos = worldPosition.xyz;
            `
        );

        shader.fragmentShader = `
            uniform vec3 uFlamePos;
            uniform float uFlameIntensity;
            varying vec3 vCustomWorldPos;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            #include <dithering_fragment>
            // Internal Subsurface Scattering (SSS) translucency glow from flame
            float distToFlame = distance(vCustomWorldPos, uFlamePos);
            float sssGlow = pow(clamp(1.0 - distToFlame / 2.2, 0.0, 1.0), 2.2);
            vec3 sssColor = vec3(1.0, 0.52, 0.16) * sssGlow * uFlameIntensity * 0.45;
            gl_FragColor.rgb += sssColor;
            `
        );
    };

    waxMesh = new THREE.Mesh(waxGeo, waxMat);
    waxMesh.position.y = 0; // Centered vertically from BASE_Y to BASE_Y + MAX_HEIGHT
    candleGroup.add(waxMesh);

    // ── CONCAVE TOP WAX BASIN ──
    const basinGeo = new THREE.RingGeometry(0.03, INITIAL_RADIUS - 0.02, 32, 16);
    // Deform geometry inward to form a concave basin dish
    const basinPos = basinGeo.attributes.position;
    for (let i = 0; i < basinPos.count; i++) {
        const x = basinPos.getX(i);
        const y = basinPos.getY(i);
        const r = Math.sqrt(x * x + y * y);
        const depth = -0.12 * (1.0 - Math.pow(r / INITIAL_RADIUS, 1.5));
        basinPos.setZ(i, depth);
    }
    basinGeo.computeVertexNormals();

    const basinMat = new THREE.MeshStandardMaterial({
        color: 0xffeedd,
        roughness: 0.15,
        metalness: 0.05,
        roughnessMap: null
    });
    basinMesh = new THREE.Mesh(basinGeo, basinMat);
    basinMesh.rotation.x = -Math.PI / 2;
    basinMesh.position.y = BASE_Y + MAX_HEIGHT;
    candleGroup.add(basinMesh);

    // ── WICK ──
    const wickGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.35, 12);
    const wickMat = new THREE.MeshStandardMaterial({
        color: 0x1c1714,
        roughness: 0.95
    });
    wickMesh = new THREE.Mesh(wickGeo, wickMat);
    wickMesh.position.set(0, BASE_Y + MAX_HEIGHT + 0.15, 0);
    candleGroup.add(wickMesh);

    // ── DYNAMIC ORGANIC FLAME ──
    // Custom Teardrop Lathe Geometry
    const flamePoints = [];
    for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const y = (t - 0.2) * 0.85; // y from -0.17 to 0.68
        // Teardrop radius curve
        let r = 0;
        if (t > 0.05 && t < 0.95) {
            r = Math.sin(t * Math.PI) * 0.24 * Math.pow(1.0 - t, 0.35);
        }
        flamePoints.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    const flameGeo = new THREE.LatheGeometry(flamePoints, 32);

    flameUniforms = {
        uTime: { value: 0 },
        uFlicker: { value: 0 }
    };

    flameMat = new THREE.ShaderMaterial({
        uniforms: flameUniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: `
            uniform float uTime;
            uniform float uFlicker;
            varying vec3 vPosition;
            varying vec2 vUv;

            void main() {
                vUv = uv;
                vPosition = position;
                vec3 pos = position;

                // Organic multi-frequency fluttering along Y axis
                float hFactor = clamp((pos.y + 0.17) / 0.85, 0.0, 1.0);
                float wave1 = sin(uTime * 11.0 + pos.y * 7.0) * 0.04 * hFactor;
                float wave2 = cos(uTime * 16.0 + pos.y * 5.0) * 0.03 * hFactor;
                float wave3 = sin(uTime * 24.0 + pos.x * 12.0) * 0.018 * hFactor;

                pos.x += wave1 + wave3 + uFlicker * 0.015 * hFactor;
                pos.z += wave2;
                pos.y += sin(uTime * 13.0) * 0.02 * hFactor;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            varying vec3 vPosition;
            varying vec2 vUv;

            void main() {
                // Height ratio from 0.0 at wick origin to 1.0 at tip
                float h = clamp((vPosition.y + 0.17) / 0.85, 0.0, 1.0);
                
                // Radial distance falloff
                float rDist = length(vPosition.xz) / 0.24;
                float alpha = clamp(1.0 - pow(rDist, 1.6), 0.0, 1.0);
                alpha *= smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.7, h);

                // 3-Tier Gradient: Blue Base -> White-Yellow Core -> Warm Amber Tip
                vec3 colBlue = vec3(0.12, 0.38, 1.0);
                vec3 colYellow = vec3(1.0, 0.96, 0.65);
                vec3 colAmber = vec3(1.0, 0.42, 0.04);

                vec3 flameColor;
                if (h < 0.18) {
                    float t = h / 0.18;
                    flameColor = mix(colBlue, colYellow, t);
                } else if (h < 0.65) {
                    float t = (h - 0.18) / (0.65 - 0.18);
                    flameColor = mix(colYellow, colAmber, t);
                } else {
                    flameColor = colAmber;
                }

                // Inner hot core brightness boost
                float coreDist = length(vPosition.xz) / 0.1;
                if (coreDist < 1.0 && h > 0.08 && h < 0.65) {
                    float coreBoost = (1.0 - coreDist) * 0.55;
                    flameColor += vec3(0.35, 0.35, 0.25) * coreBoost;
                }

                gl_FragColor = vec4(flameColor, alpha * 0.95);
            }
        `
    });

    flameMesh = new THREE.Mesh(flameGeo, flameMat);
    flameMesh.position.set(0, BASE_Y + MAX_HEIGHT + 0.3, 0);
    candleGroup.add(flameMesh);

    // ── OUTER ADDITIVE GLOW HALO ──
    const haloMap = createFlameGlowTexture();
    const haloMat = new THREE.SpriteMaterial({
        map: haloMap,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    haloSprite = new THREE.Sprite(haloMat);
    haloSprite.scale.set(1.7, 1.7, 1.0);
    haloSprite.position.set(0, BASE_Y + MAX_HEIGHT + 0.48, 0);
    candleGroup.add(haloSprite);

    // ── BASE WAX POOL ──
    const poolGeo = new THREE.CircleGeometry(INITIAL_RADIUS, 64);
    poolMat = new THREE.MeshStandardMaterial({
        color: 0xfbf2e6,
        roughness: 0.2,
        metalness: 0.02,
        transparent: true,
        opacity: 0.85
    });
    poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.y = BASE_Y - 0.005;
    candleGroup.add(poolMesh);

    // ── PROCEDURAL WAX DRIPS GROUP ──
    dripGroup = new THREE.Group();
    candleGroup.add(dripGroup);
    setupWaxDrips();

    // ── AMBIENT FLOATING EMBERS ──
    setupEmberParticles();

    // Resize Handler
    window.addEventListener('resize', onWindowResizeCandle3D);

    isCandleInitialized = true;
    window.isCandleInitialized = true;
}

/**
 * Initializes procedural drip tracking state and meshes
 */
function setupWaxDrips() {
    dripList = [];
    const dripCount = 10;
    dripMat = new THREE.MeshStandardMaterial({
        color: 0xfbf2e3,
        roughness: 0.3,
        metalness: 0.02
    });

    for (let i = 0; i < dripCount; i++) {
        const angle = (i / dripCount) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
        const radius = INITIAL_RADIUS * 1.01;
        const dripGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.3, 12);
        const mesh = new THREE.Mesh(dripGeo, dripMat);
        mesh.visible = false;
        dripGroup.add(mesh);

        dripList.push({
            mesh: mesh,
            angle: angle,
            radius: radius,
            triggerProgress: 0.08 + (i / dripCount) * 0.75 + (Math.random() * 0.08),
            length: 0.25 + Math.random() * 0.4,
            speed: 0.8 + Math.random() * 0.5,
            currentDist: 0,
            active: false
        });
    }
}

/**
 * Initializes floating ambient glowing ember particles
 */
function setupEmberParticles() {
    const emberCount = 35;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(emberCount * 3);
    const scales = new Float32Array(emberCount);
    emberData = [];

    for (let i = 0; i < emberCount; i++) {
        const x = (Math.random() - 0.5) * 0.4;
        const y = BASE_Y + MAX_HEIGHT + 0.3 + Math.random() * 1.5;
        const z = (Math.random() - 0.5) * 0.4;

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        scales[i] = 0.03 + Math.random() * 0.04;

        emberData.push({
            x: x,
            y: y,
            z: z,
            speedY: 0.3 + Math.random() * 0.4,
            phase: Math.random() * Math.PI * 2,
            life: Math.random()
        });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    emberMat = new THREE.PointsMaterial({
        color: 0xffa033,
        size: 0.05,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending
    });

    emberParticles = new THREE.Points(geometry, emberMat);
    candleGroup.add(emberParticles);
}

/**
 * Updates 3D Candle physics, shaders, lighting, and renders per-frame
 * @param {number} progress - Timer progress from 0.0 to 1.0
 * @param {number} time - Elapsed time in seconds
 * @param {boolean} [isCeremony=false] - True if rendering completion ceremony screen
 * @param {number} [totalSeconds=60] - Total session duration in seconds
 */
function renderCandle3D(progress = 0, time = 0, isCeremony = false, totalSeconds = 60) {
    if (!isCandleInitialized) {
        initCandle3D();
        if (!isCandleInitialized) return;
    }

    const validProgress = Number.isNaN(Number(progress)) ? 0 : Number(progress);
    const clampedProgress = Math.max(0, Math.min(1, validProgress));

    // Auto-reset when timer resets back to 0
    if (clampedProgress < 0.001 && currentMeltProgress > 0.05) {
        resetCandle3D();
    }
    currentMeltProgress = clampedProgress;

    // Delta-time tracking for particle animation & pause handling
    const dt = lastFrameTime ? Math.max(0, Math.min(0.1, time - lastFrameTime)) : 0.016;
    lastFrameTime = time;

    // Melt factor (0 to 0.72 height reduction)
    const meltFactor = clampedProgress * 0.72;
    const currentHeight = MAX_HEIGHT * (1.0 - meltFactor);
    const topY = BASE_Y + currentHeight;

    // Update Wax Body Shaders & Uniforms
    waxUniforms.uTime.value = time;
    waxUniforms.uMeltProgress.value = clampedProgress;

    // Sink Top Basin, Wick, Flame & Halo down with melting top surface
    basinMesh.position.y = topY;
    wickMesh.position.set(0, topY + 0.15, 0);

    const flameWickPos = new THREE.Vector3(0, topY + 0.32, 0);
    flameMesh.position.copy(flameWickPos);
    haloSprite.position.set(0, topY + 0.48, 0);

    waxUniforms.uFlamePos.value.copy(flameWickPos);

    // Multi-frequency organic flame flicker
    const flicker = Math.sin(time * 8.7) * 0.35 + Math.sin(time * 18.2) * 0.22 + Math.cos(time * 31.4) * 0.12;
    const flameIntensity = 3.0 + flicker * 0.8;
    waxUniforms.uFlameIntensity.value = flameIntensity;

    flameUniforms.uTime.value = time;
    flameUniforms.uFlicker.value = flicker;

    // PointLight Flicker & Position Tracking
    flameLight.intensity = flameIntensity;
    flameLight.position.set(
        flameWickPos.x + Math.sin(time * 10.0) * 0.02,
        flameWickPos.y + 0.1,
        flameWickPos.z + Math.cos(time * 12.0) * 0.02
    );

    // Pulsate outer additive glow halo
    const haloScale = 1.65 + flicker * 0.12;
    haloSprite.scale.set(haloScale, haloScale, 1.0);

    // Expand base wax pool disc as candle melts
    const poolScale = 1.0 + clampedProgress * 0.65;
    poolMesh.scale.set(poolScale, poolScale, 1.0);

    // Update procedural wax drips along cylinder wall
    dripList.forEach((drip) => {
        if (clampedProgress >= drip.triggerProgress) {
            if (!drip.active) {
                drip.active = true;
                drip.mesh.visible = true;
            }
            // Drip slides down outer cylinder wall from topY
            const flowT = Math.min(1.0, (clampedProgress - drip.triggerProgress) * 4.0 * drip.speed);
            drip.currentDist = flowT * drip.length;

            const dripY = topY - drip.currentDist;
            if (dripY >= BASE_Y) {
                drip.mesh.position.set(
                    Math.cos(drip.angle) * drip.radius,
                    dripY,
                    Math.sin(drip.angle) * drip.radius
                );
                drip.mesh.rotation.y = -drip.angle;
            }
        } else {
            drip.active = false;
            drip.currentDist = 0;
            if (drip.mesh) {
                drip.mesh.visible = false;
            }
        }
    });

    // Update Floating Glowing Embers (skip if dt <= 0 or timer is paused)
    if (emberParticles && dt > 0) {
        const stepRatio = dt / 0.016;
        const positions = emberParticles.geometry.attributes.position.array;
        for (let i = 0; i < emberData.length; i++) {
            const e = emberData[i];
            e.life += 0.012 * stepRatio;
            if (e.life > 1.0) {
                e.life = 0;
                e.x = (Math.random() - 0.5) * 0.35;
                e.y = topY + 0.35;
                e.z = (Math.random() - 0.5) * 0.35;
            } else {
                e.y += e.speedY * 0.015 * stepRatio;
                e.x += Math.sin(time * 3.0 + e.phase) * 0.003 * stepRatio;
                e.z += Math.cos(time * 2.5 + e.phase) * 0.003 * stepRatio;
            }
            positions[i * 3] = e.x;
            positions[i * 3 + 1] = e.y;
            positions[i * 3 + 2] = e.z;
        }
        emberParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Subtle gentle camera sway during ceremony or focus
    const swayAmount = isCeremony ? 0.08 : 0.03;
    candleCamera.position.x = Math.sin(time * 0.6) * swayAmount;
    candleCamera.lookAt(0, isCeremony ? -0.2 : -0.1, 0);

    // Render Scene
    candleRenderer.render(candleScene, candleCamera);
}

/**
 * Resets 3D Candle physics state back to full height
 */
function resetCandle3D() {
    currentMeltProgress = 0;
    lastFrameTime = 0;
    if (waxUniforms) {
        waxUniforms.uMeltProgress.value = 0;
    }
    if (poolMesh) {
        poolMesh.scale.set(1.0, 1.0, 1.0);
    }
    if (basinMesh) {
        basinMesh.position.y = BASE_Y + MAX_HEIGHT;
    }
    if (wickMesh) {
        wickMesh.position.set(0, BASE_Y + MAX_HEIGHT + 0.15, 0);
    }
    if (flameMesh) {
        flameMesh.position.set(0, BASE_Y + MAX_HEIGHT + 0.3, 0);
    }
    if (haloSprite) {
        haloSprite.position.set(0, BASE_Y + MAX_HEIGHT + 0.48, 0);
    }
    if (dripList) {
        dripList.forEach(drip => {
            drip.active = false;
            drip.currentDist = 0;
            if (drip.mesh) drip.mesh.visible = false;
        });
    }
    if (emberData) {
        emberData.forEach(e => {
            e.y = 0.5 + Math.random() * 2.0;
            e.life = Math.random();
        });
    }
}

/**
 * Resizes 3D Candle viewport and updates camera projection
 * @param {number} [width] - New canvas width
 * @param {number} [height] - New canvas height
 */
function resizeCandle3D(width, height) {
    if (!candleRenderer || !candleCamera) return;
    if (!width || !height || width <= 0 || height <= 0) {
        const canvas = candleRenderer.domElement;
        const w = width || canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
        const h = height || canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
        if (!w || !h || w <= 0 || h <= 0) return;
        candleCamera.aspect = w / h;
        candleCamera.updateProjectionMatrix();
        candleRenderer.setSize(w, h, false);
        return;
    }

    candleCamera.aspect = width / height;
    candleCamera.updateProjectionMatrix();
    candleRenderer.setSize(width, height, false);
}

/**
 * Internal window resize listener callback
 */
function onWindowResizeCandle3D() {
    resizeCandle3D();
}

/**
 * Destroys 3D Candle WebGL resources and removes listeners
 */
function destroyCandle3D() {
    window.removeEventListener('resize', onWindowResizeCandle3D);

    if (haloSprite && haloSprite.material && haloSprite.material.map) {
        haloSprite.material.map.dispose();
    }

    if (candleScene) {
        candleScene.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            }
        });
    }

    if (candleRenderer) {
        candleRenderer.dispose();
        candleRenderer = null;
    }

    isCandleInitialized = false;
    window.isCandleInitialized = false;
    lastFrameTime = 0;
}

// Window Globals Binding
window.initCandle3D = initCandle3D;
window.renderCandle3D = renderCandle3D;
window.resetCandle3D = resetCandle3D;
window.destroyCandle3D = destroyCandle3D;
window.resizeCandle3D = resizeCandle3D;
window.isCandleInitialized = isCandleInitialized;
