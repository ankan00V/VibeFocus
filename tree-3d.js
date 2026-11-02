let treeScene, treeCamera, treeRenderer;
let treeGroup;
let leafInstancedMesh;
let leafData = [];
let fireflyParticles;
let isTreeInitialized = false;

let currentTargetDropped = 0;
let detachmentQueue = 0; // Number of leaves waiting to be detached smoothly
let nextClusterTime = 0;

let activeLeafCount = 8000; // Will scale dynamically based on timer duration
let lastTotalSecondsForLeaves = 0;

const MAX_LEAVES = 8000;
// Golden-hour autumn palette
const SUN_DIR = new THREE.Vector3(-0.55, 0.20, -0.81).normalize(); // low sun behind the tree
const SUN_COLOR = new THREE.Color(1.0, 0.78, 0.52);
// Sky colours are display-space: three r128 applies fog after tone mapping,
// so the fog must use the same displayed horizon colour for a seamless horizon.
const HORIZON_COLOR = new THREE.Color(0.84, 0.69, 0.56);
const ZENITH_COLOR = new THREE.Color(0.38, 0.50, 0.68);
let treeSunLight = null;
let leafTranslucencyUniforms = null;

// Procedural canvas textures (no external assets needed)
function makeTreeCanvasTexture(size, paint) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
}

function makeBarkTexture() {
    return makeTreeCanvasTexture(256, (x, n) => {
        x.fillStyle = '#4a3a2e';
        x.fillRect(0, 0, n, n);
        // vertical furrows of bark
        for (let i = 0; i < 140; i++) {
            const px = Math.random() * n;
            const w = 1 + Math.random() * 4;
            const l = 20 + Math.random() * 90;
            const py = Math.random() * n;
            const shade = Math.random() < 0.5 ? 'rgba(25,18,13,0.55)' : 'rgba(120,100,82,0.35)';
            x.fillStyle = shade;
            x.fillRect(px, py, w, l);
            x.fillRect(px, py - n, w, l); // wrap
        }
        // lichen flecks
        for (let i = 0; i < 60; i++) {
            x.fillStyle = 'rgba(140,150,110,0.25)';
            x.beginPath();
            x.arc(Math.random() * n, Math.random() * n, 1 + Math.random() * 3, 0, Math.PI * 2);
            x.fill();
        }
    });
}

function makeGroundTexture() {
    return makeTreeCanvasTexture(512, (x, n) => {
        x.fillStyle = '#4b5a2a';
        x.fillRect(0, 0, n, n);
        // patches of dry grass, earth and moss
        const cols = ['rgba(120,110,55,0.35)', 'rgba(70,58,36,0.35)', 'rgba(52,72,30,0.45)', 'rgba(150,120,60,0.25)'];
        for (let i = 0; i < 900; i++) {
            x.fillStyle = cols[i % cols.length];
            x.beginPath();
            x.arc(Math.random() * n, Math.random() * n, 4 + Math.random() * 26, 0, Math.PI * 2);
            x.fill();
        }
        // fine blades
        for (let i = 0; i < 9000; i++) {
            const px = Math.random() * n, py = Math.random() * n;
            x.strokeStyle = Math.random() < 0.5 ? 'rgba(160,150,80,0.35)' : 'rgba(40,60,22,0.35)';
            x.lineWidth = 1;
            x.beginPath();
            x.moveTo(px, py);
            x.lineTo(px + (Math.random() - 0.5) * 3, py - 2 - Math.random() * 5);
            x.stroke();
        }
    });
}

const FLOWER_VERTEX_SHADER = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const FLOWER_FRAGMENT_SHADER = `
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

let flowerGroup;
let flowerPool = [];
const TOTAL_FLOWERS = 60;
let lastTreeFrameTime = 0;
let bloomedCount = 0;

function initTree3D() {
    const canvas = document.getElementById('tree-canvas');
    if (!canvas) return;

    treeRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    treeRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
    treeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    treeRenderer.shadowMap.enabled = true;
    treeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    treeRenderer.outputEncoding = THREE.sRGBEncoding;
    treeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    treeRenderer.toneMappingExposure = 1.05;

    treeScene = new THREE.Scene();
    // Atmospheric haze: distant ground melts into the horizon glow
    treeScene.fog = new THREE.Fog(HORIZON_COLOR.clone(), 50, 190);

    // Camera
    const aspect = canvas.clientWidth / canvas.clientHeight;
    treeCamera = new THREE.PerspectiveCamera(40, aspect, 0.1, 400);
    frameTreeCamera(aspect);

    // Lighting: low golden sun behind the tree, cool sky fill, warm bounce
    const hemi = new THREE.HemisphereLight(0x9fb6d6, 0x5a4a30, 0.55);
    treeScene.add(hemi);

    treeSunLight = new THREE.DirectionalLight(SUN_COLOR, 2.4);
    treeSunLight.position.copy(SUN_DIR).multiplyScalar(60);
    treeSunLight.castShadow = true;
    const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
    treeSunLight.shadow.mapSize.width = isSmall ? 1024 : 2048;
    treeSunLight.shadow.mapSize.height = isSmall ? 1024 : 2048;
    treeSunLight.shadow.camera.near = 10;
    treeSunLight.shadow.camera.far = 130;
    treeSunLight.shadow.camera.left = -40;
    treeSunLight.shadow.camera.right = 40;
    treeSunLight.shadow.camera.top = 40;
    treeSunLight.shadow.camera.bottom = -20;
    treeSunLight.shadow.bias = -0.0008;
    treeSunLight.shadow.normalBias = 0.04;
    treeScene.add(treeSunLight);

    // Soft front fill so the shaded side of the tree isn't black
    const frontFill = new THREE.DirectionalLight(0xffe2c4, 0.35);
    frontFill.position.set(20, 25, 50);
    treeScene.add(frontFill);

    // Sky dome: deep blue overhead, glowing warm horizon, soft sun halo
    const skyGeo = new THREE.SphereGeometry(300, 48, 24);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            uSunDir: { value: SUN_DIR },
            uHorizon: { value: HORIZON_COLOR },
            uZenith: { value: ZENITH_COLOR },
            uSunCol: { value: SUN_COLOR },
        },
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position = p.xyww;
            }
        `,
        fragmentShader: `
            uniform vec3 uSunDir;
            uniform vec3 uHorizon;
            uniform vec3 uZenith;
            uniform vec3 uSunCol;
            varying vec3 vDir;
            void main() {
                vec3 d = normalize(vDir);
                float h = clamp(d.y, -0.2, 1.0);
                float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
                vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.7, h), 0.6));
                // warmer, brighter towards the sun (fades out at the horizon line)
                float above = smoothstep(-0.02, 0.06, d.y);
                col += vec3(1.0, 0.86, 0.66) * (pow(sunAmt, 5.0) * 0.18 + pow(sunAmt, 40.0) * 0.35 + pow(sunAmt, 900.0) * 2.0) * mix(0.5, 1.0, above);
                // below the horizon: the same haze the fog uses, so ground and sky meet seamlessly
                col = mix(col, uHorizon, smoothstep(0.03, -0.02, d.y));
                gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -1;
    treeScene.add(sky);

    // Tree Group
    treeGroup = new THREE.Group();
    treeScene.add(treeGroup);
    
    // Fireflies Particle System
    const fireflyGeo = new THREE.BufferGeometry();
    const fireflyCount = 150;
    const posArray = new Float32Array(fireflyCount * 3);
    const phaseArray = new Float32Array(fireflyCount);
    for(let i = 0; i < fireflyCount; i++) {
        // Distribute them in a cylinder-like shape around the tree
        const r = 2 + Math.random() * 20;
        const theta = Math.random() * Math.PI * 2;
        posArray[i*3] = Math.cos(theta) * r;
        posArray[i*3+1] = Math.random() * 25;
        posArray[i*3+2] = Math.sin(theta) * r;
        phaseArray[i] = Math.random() * Math.PI * 2;
    }
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    fireflyGeo.setAttribute('aPhase', new THREE.BufferAttribute(phaseArray, 1));

    const fireflyMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(1.0, 0.86, 0.6) }
        },
        vertexShader: `
            uniform float uTime;
            attribute float aPhase;
            varying float vAlpha;
            void main() {
                vec3 pos = position;
                // Gentle floating
                pos.y += sin(uTime * 0.4 + aPhase) * 1.5;
                pos.x += cos(uTime * 0.3 + aPhase) * 1.5;
                pos.z += sin(uTime * 0.5 + aPhase) * 1.5;
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                // Size attenuation: tiny motes of dust / pollen in the sun
                gl_PointSize = 7.0 * (10.0 / -mvPosition.z) * (0.6 + 0.4 * sin(aPhase * 3.0));
                vAlpha = (sin(uTime * 0.7 + aPhase) * 0.5 + 0.5) * 0.35 + 0.05;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                // Soft glow edge
                float intensity = pow(1.0 - (dist * 2.0), 2.0);
                gl_FragColor = vec4(uColor * intensity * vAlpha, 1.0);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    fireflyParticles = new THREE.Points(fireflyGeo, fireflyMat);
    treeScene.add(fireflyParticles);

    // Material for Tree
    const barkTex = makeBarkTexture();
    barkTex.repeat.set(2, 3);
    const treeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: barkTex,
        bumpMap: barkTex,
        bumpScale: 0.25,
        metalness: 0.0,
        roughness: 0.95
    });

    // Procedural Tree Generation
    const branchGeos = [];
    
    // We will collect leaf positions as we build branches
    const leafPositions = [];

    function generateBranch(startPt, angleX, angleZ, length, radius, depth) {
        if (depth <= 0 || length < 0.5) return;

        const endPt = new THREE.Vector3(
            startPt.x + Math.sin(angleZ) * Math.cos(angleX) * length,
            startPt.y + Math.cos(angleZ) * length,
            startPt.z + Math.sin(angleZ) * Math.sin(angleX) * length
        );

        // Cylinder for this branch
        const geom = new THREE.CylinderGeometry(radius * 0.62, radius, length, 12, 1);
        // Translate cylinder so origin is at startPt
        geom.translate(0, length / 2, 0);
        
        // Rotate geometry to align with direction
        const axis = new THREE.Vector3(0, 1, 0);
        const dir = new THREE.Vector3().subVectors(endPt, startPt).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, dir);
        const matrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
        geom.applyMatrix4(matrix);
        geom.translate(startPt.x, startPt.y, startPt.z);
        
        branchGeos.push(geom);

        // Add leaves at the end of branches (mostly at higher depths)
        if (depth <= 4 || Math.random() < 0.5) {
            const numLeaves = depth <= 2 ? 15 : 6;
            for(let i=0; i<numLeaves; i++) {
                leafPositions.push(new THREE.Vector3(
                    endPt.x + (Math.random()-0.5)*2,
                    endPt.y + (Math.random()-0.5)*2,
                    endPt.z + (Math.random()-0.5)*2
                ));
            }
        }

        // Branching
        const split = Math.random() * 0.2 + 0.2;
        generateBranch(endPt, angleX + Math.random() * 1.5 - 0.75, angleZ + split, length * 0.75, radius * 0.65, depth - 1);
        generateBranch(endPt, angleX + Math.random() * 1.5 - 0.75, angleZ - split, length * 0.75, radius * 0.65, depth - 1);
    }

    // Generate root
    generateBranch(new THREE.Vector3(0, 0, 0), 0, 0, 8, 1.2, 7);

    // Merge branch geometries 
    const treeMeshGroup = new THREE.Group();
    branchGeos.forEach(geom => {
        const mesh = new THREE.Mesh(geom, treeMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        treeMeshGroup.add(mesh);
    });
    treeGroup.add(treeMeshGroup);

    // Leaves InstancedMesh - Procedural Leaf Shape
    // Thin leaf blade with a slight fold along the midrib
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.42, 0.18, 0.46, 0.75, 0, 1.2);
    leafShape.bezierCurveTo(-0.46, 0.75, -0.42, 0.18, 0, 0);
    const leafGeom = new THREE.ShapeGeometry(leafShape, 6);
    {
        const lp = leafGeom.attributes.position;
        for (let k = 0; k < lp.count; k++) {
            const lx = lp.getX(k), ly = lp.getY(k);
            lp.setZ(k, Math.abs(lx) * 0.35 + Math.sin(ly * 2.6) * 0.06);
        }
        leafGeom.computeVertexNormals();
    }
    leafGeom.center();
    // Base scale for leaves (much larger to compensate for fewer mathematically allowed leaves)
    leafGeom.scale(1.2, 1.2, 1.2);

    const leafMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, // White base to let instance colors show
        roughness: 0.7,
        metalness: 0.0,
        side: THREE.DoubleSide
    });
    // Thin leaves glow when the low sun shines through them
    leafTranslucencyUniforms = {
        uSunView: { value: new THREE.Vector3() },
        uSunCol: { value: SUN_COLOR.clone().multiplyScalar(1.6) },
    };
    leafMat.onBeforeCompile = (shader) => {
        shader.uniforms.uSunView = leafTranslucencyUniforms.uSunView;
        shader.uniforms.uSunCol = leafTranslucencyUniforms.uSunCol;
        shader.fragmentShader = 'uniform vec3 uSunView;\nuniform vec3 uSunCol;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
            'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
            `vec3 vDirT = normalize(vViewPosition);
            float back = pow(max(dot(-vDirT, normalize(uSunView)), 0.0), 3.0);
            outgoingLight += diffuseColor.rgb * uSunCol * (0.18 + 0.9 * back);
            gl_FragColor = vec4( outgoingLight, diffuseColor.a );`
        );
    };

    // Shuffle leafPositions so that picking a subset renders them evenly across the tree
    for (let i = leafPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [leafPositions[i], leafPositions[j]] = [leafPositions[j], leafPositions[i]];
    }

    const actualLeaves = Math.min(MAX_LEAVES, leafPositions.length);
    leafInstancedMesh = new THREE.InstancedMesh(leafGeom, leafMat, actualLeaves);
    leafInstancedMesh.castShadow = true;
    leafInstancedMesh.receiveShadow = true;
    
    // Initialize leaf data
    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();
    for (let i = 0; i < actualLeaves; i++) {
        const pos = leafPositions[i];
        
        // For short timers, we use the first 100-200 leaves. We want them HUGE.
        // For long timers (up to 120 mins), we use all 4000 leaves. We make the extra ones progressively smaller
        // so the tree doesn't turn into a solid green blob.
        let sizeMultiplier = 1.0;
        if (i > 150) {
            sizeMultiplier = Math.max(0.4, 1.0 - (i / MAX_LEAVES) * 0.8);
        }

        leafData.push({
            startPos: pos.clone(),
            pos: pos.clone(),
            vel: new THREE.Vector3(0,0,0),
            rot: new THREE.Vector3(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI),
            rotVel: new THREE.Vector3((Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1),
            attached: true,
            grounded: false,
            phase: Math.random() * Math.PI * 2,
            baseWind: { x: 0, z: 0 },
            scale: (0.55 + Math.random() * 0.5) * sizeMultiplier
        });

        // Autumn palette: amber, burnt orange, rust, golden ochre, a few late greens
        let hue, saturation, lightness;
        const randColor = Math.random();
        if (randColor < 0.30) {        // amber / orange
            hue = 0.07 + Math.random() * 0.04; saturation = 0.75 + Math.random() * 0.2; lightness = 0.38 + Math.random() * 0.12;
        } else if (randColor < 0.52) { // golden yellow / ochre
            hue = 0.11 + Math.random() * 0.03; saturation = 0.7 + Math.random() * 0.2; lightness = 0.42 + Math.random() * 0.12;
        } else if (randColor < 0.74) { // rust red
            hue = 0.02 + Math.random() * 0.03; saturation = 0.65 + Math.random() * 0.2; lightness = 0.28 + Math.random() * 0.1;
        } else if (randColor < 0.90) { // brownish
            hue = 0.06 + Math.random() * 0.03; saturation = 0.45 + Math.random() * 0.2; lightness = 0.22 + Math.random() * 0.1;
        } else {                       // late green
            hue = 0.18 + Math.random() * 0.06; saturation = 0.45 + Math.random() * 0.2; lightness = 0.28 + Math.random() * 0.1;
        }
        tempColor.setHSL(hue, saturation, lightness).convertSRGBToLinear();
        leafInstancedMesh.setColorAt(i, tempColor);

        dummy.position.copy(pos);
        dummy.rotation.set(leafData[i].rot.x, leafData[i].rot.y, leafData[i].rot.z);
        dummy.scale.setScalar(leafData[i].scale);
        dummy.updateMatrix();
        leafInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    leafInstancedMesh.instanceColor.needsUpdate = true;
    treeGroup.add(leafInstancedMesh);

    // Add a dark grassy ground plane
    const groundGeom = new THREE.PlaneGeometry(400, 400);
    const groundTex = makeGroundTexture();
    groundTex.repeat.set(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: groundTex,
        roughness: 1.0,
        metalness: 0.0
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    treeScene.add(ground);

    // Grass blades
    // Grass tufts: thin tapered blades in dry gold and late-summer green
    const grassGeo = new THREE.PlaneGeometry(0.12, 1.5, 1, 3);
    {
        const gp = grassGeo.attributes.position;
        for (let k = 0; k < gp.count; k++) {
            const gy = (gp.getY(k) + 0.75) / 1.5;            // 0 at root, 1 at tip
            gp.setX(k, gp.getX(k) * (1 - gy * 0.9));          // taper
            gp.setZ(k, gy * gy * 0.35);                        // bend
        }
        grassGeo.computeVertexNormals();
    }
    const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const grassCount = Math.min(window.innerWidth, window.innerHeight) < 700 ? 6000 : 12000;
    const grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    grassInstanced.receiveShadow = true;
    
    const dummyGrass = new THREE.Object3D();
    for(let i=0; i<grassCount; i++) {
        const r = 2 + Math.pow(Math.random(), 0.7) * 70;
        const theta = Math.random() * Math.PI * 2;
        dummyGrass.position.set(Math.cos(theta)*r, 0.7, Math.sin(theta)*r);
        dummyGrass.rotation.y = Math.random() * Math.PI;
        dummyGrass.rotation.x = (Math.random() - 0.5) * 0.4;
        dummyGrass.rotation.z = (Math.random() - 0.5) * 0.4;
        dummyGrass.scale.setScalar(0.3 + Math.random() * 0.8);
        dummyGrass.updateMatrix();
        grassInstanced.setMatrixAt(i, dummyGrass.matrix);
        const gc = new THREE.Color().setHSL(0.12 + Math.random() * 0.12, 0.35 + Math.random() * 0.25, 0.25 + Math.random() * 0.18).convertSRGBToLinear();
        grassInstanced.setColorAt(i, gc);
    }
    grassInstanced.instanceColor.needsUpdate = true;
    treeScene.add(grassInstanced);

    // Flower Pool Creation
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
                uColor: { value: petalColor.clone() },
                uCenterColor: { value: STAMEN_COLOR.clone() },
                uPetalCount: { value: petalCount },
                uPetals: { value: petalCount },
                uSeed: { value: Math.random() * 100.0 }
            },
            vertexShader: FLOWER_VERTEX_SHADER,
            fragmentShader: FLOWER_FRAGMENT_SHADER,
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

    isTreeInitialized = true;

    // Handle Resize
    window.addEventListener('resize', () => {
        if (!canvas) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;
        treeRenderer.setSize(width, height, false);
        frameTreeCamera(width / height);
    });
}

// Fit the whole crown on any screen shape (portrait phones included)
function frameTreeCamera(aspect) {
    if (!treeCamera) return;
    treeCamera.aspect = aspect;
    const tanV = Math.tan(THREE.MathUtils.degToRad(treeCamera.fov / 2));
    const contentH = 34;  // ground line to above the crown
    const contentW = 44;  // crown width plus some meadow
    const dist = Math.max((contentH / 2) / tanV, (contentW / 2) / (tanV * aspect));
    const target = new THREE.Vector3(0, 13, 0);
    treeCamera.position.set(0, target.y + dist * 0.12, dist);
    treeCamera.lookAt(target);
    treeCamera.updateProjectionMatrix();
}

// True once every leaf has fallen and come to rest on the ground
function isTreeSettled() {
    if (!isTreeInitialized) return true;
    for (let i = 0; i < activeLeafCount; i++) {
        const leaf = leafData[i];
        if (leaf.attached || !leaf.grounded) return false;
    }
    return true;
}
window.isTreeSettled = isTreeSettled;

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
        if (flower.material && flower.material.uniforms && flower.material.uniforms.uBloom) {
            flower.material.uniforms.uBloom.value = 0.0;
        }
        if (flower.mesh) {
            flower.mesh.visible = false;
        }
    }
    bloomedCount = 0;
    lastTreeFrameTime = 0;
}

function renderTree3D(progress, totalSeconds) {
    if (!isTreeInitialized) initTree3D();

    const canvas = treeRenderer.domElement;
    if (canvas.clientWidth !== canvas.width || canvas.clientHeight !== canvas.height) {
        treeRenderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        if (canvas.clientHeight > 0) frameTreeCamera(canvas.clientWidth / canvas.clientHeight);
    }

    const time = performance.now() * 0.001;
    const delta = lastTreeFrameTime > 0 ? Math.min(0.1, time - lastTreeFrameTime) : 0.016;
    lastTreeFrameTime = time;

    // Sway the whole tree gently
    treeGroup.rotation.y = Math.sin(time * 0.2) * 0.05;
    treeGroup.rotation.z = Math.cos(time * 0.3) * 0.02;
    
    // Update fireflies
    if (fireflyParticles) {
        fireflyParticles.material.uniforms.uTime.value = time;
        fireflyParticles.rotation.y = time * -0.02; // slow orbiting
    }

    // Determine how many leaves to render based on timer duration
    if (totalSeconds !== lastTotalSecondsForLeaves || progress < 0.001) {
        lastTotalSecondsForLeaves = totalSeconds;
        
        // To guarantee a 2.5 - 3.0 second wait between drops while also dropping 100% of leaves,
        // and NEVER waiting more than 3.0 seconds even on a 120-minute timer:
        // We MUST allocate enough leaves so that at least 1 leaf can fall every 2.75 seconds.
        // E.g. 1 min = 90 leaves (4 leaves every 2.75s). 120 min = 3660 leaves (1.3 leaves every 2.75s).
        const targetLeaves = Math.floor(60 + totalSeconds * 0.5);
        activeLeafCount = Math.max(10, Math.min(leafData.length, targetLeaves));
        
        leafInstancedMesh.count = activeLeafCount;
    }

    if (progress < 0.01) {
        currentTargetDropped = 0;
        detachmentQueue = 0;
        for (let i = 0; i < activeLeafCount; i++) {
            leafData[i].attached = true;
            leafData[i].grounded = false;
            leafData[i].pos.copy(leafData[i].startPos);
            leafData[i].vel.set(0,0,0);
        }
        // Reset Flower Pool State on progress reset
        for (let i = 0; i < flowerPool.length; i++) {
            const flower = flowerPool[i];
            flower.bloomProgress = 0.0;
            if (flower.material && flower.material.uniforms && flower.material.uniforms.uBloom) {
                flower.material.uniforms.uBloom.value = 0.0;
            }
            if (flower.mesh) {
                flower.mesh.visible = false;
            }
        }
        bloomedCount = 0;
    }

    // Leaves detach in step with the timer; the very last leaf lets go exactly
    // at 00:00 (the focus screen then waits for it to land).
    const effectiveProgress = Math.min(1.0, Math.max(0, progress));

    // Update leaves
    const idealDropped = Math.floor(effectiveProgress * activeLeafCount);
    
    // Accumulate leaves to drop based on exact progress
    if (idealDropped > currentTargetDropped) {
        let newDrops = idealDropped - currentTargetDropped;
        currentTargetDropped = idealDropped;
        
        // For very short timers (lots of leaves to drop), just add them to the queue
        // For long timers, cluster them into random wind gusts
        detachmentQueue += newDrops;
    }

    // Process the detachment queue smoothly over frames
    // We drop in natural clusters of 1 to 5 leaves, separated by time gaps.
    
    // Force ALL leaves to drop at the very end based on ACTUAL attached count
    if (effectiveProgress >= 1.0) {
        let currentlyAttached = 0;
        for (let i = 0; i < activeLeafCount; i++) {
            if (leafData[i].attached) currentlyAttached++;
        }
        detachmentQueue = currentlyAttached;
    }

    if (detachmentQueue > 0) {
        let dropsThisFrame = 0;
        
        if (time > nextClusterTime || effectiveProgress >= 1.0) {
            
            // Only drop 1 leaf at a time so the visual cadence matches the math exactly
            dropsThisFrame = 1;

            // Pace evenly; slightly quicker than the mean rate so the queue never
            // lags behind the timer (leaves are only queued once their time has come)
            let baseGap = totalSeconds / activeLeafCount;
            if (baseGap > 3.0) baseGap = 3.0; // Strictly ensure we NEVER wait more than 3 seconds!
            let gap = baseGap * (0.8 + Math.random() * 0.15);
            // A backlog (e.g. after the tab was hidden) catches up quickly
            if (detachmentQueue > 3) gap = Math.min(gap, 0.25);
            // At 00:00 anything still queued lets go now — the last leaf falls at zero
            if (effectiveProgress >= 1.0) {
                gap = 0;
                dropsThisFrame = detachmentQueue;
            }
            
            nextClusterTime = time + gap;
        }
        
        dropsThisFrame = Math.min(dropsThisFrame, detachmentQueue);
        
        let successfullyDropped = 0;
        while (successfullyDropped < dropsThisFrame) {
            let idx = Math.floor(Math.random() * activeLeafCount);
            
            // Linear probe to guarantee we find an attached leaf
            if (!leafData[idx].attached) {
                let found = false;
                for (let j = 1; j < activeLeafCount; j++) {
                    let nextIdx = (idx + j) % activeLeafCount;
                    if (leafData[nextIdx].attached) {
                        idx = nextIdx;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    // No attached leaves left at all!
                    detachmentQueue = 0;
                    break;
                }
            }
            
            if (leafData[idx].attached) {
                leafData[idx].attached = false;
                // Strong wind burst when detaching, random directions
                // Give Z-axis a boost so it moves front/back more noticeably
                const windDirX = (Math.random() - 0.5) * 1.2;
                const windDirZ = (Math.random() - 0.5) * 1.5;
                leafData[idx].vel.set(
                    windDirX,
                    0.05 + Math.random() * 0.05, // slight uplift
                    windDirZ
                );
                
                // Re-introduce natural base wind so they drift beautifully
                leafData[idx].baseWind.x = windDirX * 0.15;
                leafData[idx].baseWind.z = windDirZ * 0.15;
                successfullyDropped++;
                detachmentQueue--;
            }
            
            if (detachmentQueue <= 0) break; // safety breakout
        }
    }

    const dummy = new THREE.Object3D();
    for (let i = 0; i < activeLeafCount; i++) {
        const leaf = leafData[i];

        if (!leaf.attached && !leaf.grounded) {
            // Falling Physics
            leaf.vel.y -= 0.004; // Softer gravity for better float

            // Wind drift - individual trajectories mixed with time
            // Re-introduced wind effect so they don't just drop straight down
            const windForceX = Math.sin(time * 1.5 + leaf.phase) * 0.01 + leaf.baseWind.x; 
            const windForceZ = Math.cos(time * 1.2 + leaf.phase) * 0.01 + leaf.baseWind.z;
            
            leaf.vel.x += windForceX;
            leaf.vel.z += windForceZ;

            // Damping (air resistance)
            leaf.vel.x *= 0.92;
            leaf.vel.y *= 0.98;
            leaf.vel.z *= 0.92;
            
            leaf.pos.add(leaf.vel);
            
            // --- BOUNDARY LOGIC ---
            // Keep leaves within screen bounds. Bounce them if they hit the invisible walls.
            const BOUND_X = 35;
            const BOUND_Z_FRONT = 28; // keep falling leaves well in front of the camera
            const BOUND_Z_BACK = -25;
            
            if (leaf.pos.x > BOUND_X) {
                leaf.pos.x = BOUND_X;
                leaf.vel.x *= -0.5;
                leaf.baseWind.x *= -1; // Reverse wind direction
            } else if (leaf.pos.x < -BOUND_X) {
                leaf.pos.x = -BOUND_X;
                leaf.vel.x *= -0.5;
                leaf.baseWind.x *= -1;
            }
            
            if (leaf.pos.z > BOUND_Z_FRONT) {
                leaf.pos.z = BOUND_Z_FRONT;
                leaf.vel.z *= -0.5;
                leaf.baseWind.z *= -1;
            } else if (leaf.pos.z < BOUND_Z_BACK) {
                leaf.pos.z = BOUND_Z_BACK;
                leaf.vel.z *= -0.5;
                leaf.baseWind.z *= -1;
            }
            // ----------------------

            // Rotation
            leaf.rot.add(leaf.rotVel);

            // Ground collision
            if (leaf.pos.y <= 0.1) {
                leaf.pos.y = 0.1 + Math.random() * 0.1; // stack slightly
                leaf.grounded = true;
                leaf.vel.set(0,0,0);
                leaf.rot.x = -Math.PI / 2; // Lie flat
                leaf.rot.z = Math.random() * Math.PI;
            }
        } else if (leaf.attached) {
            // Sway attached leaves slightly
            leaf.pos.x = leaf.startPos.x + Math.sin(time * 2 + leaf.phase) * 0.1;
            leaf.pos.y = leaf.startPos.y + Math.cos(time * 2.5 + leaf.phase) * 0.1;
            leaf.pos.z = leaf.startPos.z + Math.sin(time * 1.5 + leaf.phase) * 0.1;
        }

        // Update InstancedMesh matrix
        dummy.position.copy(leaf.pos);
        dummy.rotation.set(leaf.rot.x, leaf.rot.y, leaf.rot.z);
        // Base scale for leaves
        let scale = leaf.scale;
        // Make grounded leaves fade/shrink slightly to avoid z-fighting clutter
        if (leaf.grounded) scale *= 0.8;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        leafInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    leafInstancedMesh.instanceMatrix.needsUpdate = true;

    // Update Flower Spawning & Bloom Animation
    const targetCount = Math.floor(effectiveProgress * TOTAL_FLOWERS);
    const bloomDuration = 2.0; // 2 seconds to bloom fully
    let currentBloomed = 0;
    for (let i = 0; i < TOTAL_FLOWERS; i++) {
        const flower = flowerPool[i];
        flower.mesh.visible = (i < targetCount);
        if (i < targetCount) {
            if (flower.bloomProgress < 1.0) {
                flower.bloomProgress = Math.min(1.0, flower.bloomProgress + delta / bloomDuration);
            }
        } else {
            flower.bloomProgress = 0.0;
        }
        if (flower.bloomProgress >= 1.0) {
            currentBloomed++;
        }
        flower.material.uniforms.uBloom.value = flower.bloomProgress;
        flower.material.uniforms.uTime.value = time;
    }
    bloomedCount = currentBloomed;

    if (leafTranslucencyUniforms) {
        leafTranslucencyUniforms.uSunView.value.copy(SUN_DIR).transformDirection(treeCamera.matrixWorldInverse);
    }
    treeRenderer.render(treeScene, treeCamera);
}
