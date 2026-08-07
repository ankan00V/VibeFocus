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
const TREE_COLOR = 0x0a0f12; // Dark obsidian
const LEAF_COLOR = 0xa8d870; // Glowing ethereal green
const LEAF_EMISSIVE = 0x55aa33;

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

    treeScene = new THREE.Scene();

    // Camera
    const aspect = canvas.clientWidth / canvas.clientHeight;
    treeCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    // Position camera to see the full tree and ground
    treeCamera.position.set(0, 20, 65);
    treeCamera.lookAt(0, 12, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    treeScene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0xbbeeff, 2.5);
    rimLight.position.set(-10, 20, -10);
    treeScene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xaaffcc, 1.2);
    fillLight.position.set(15, 25, 15);
    fillLight.castShadow = true;
    fillLight.shadow.mapSize.width = 1024;
    fillLight.shadow.mapSize.height = 1024;
    fillLight.shadow.camera.near = 0.5;
    fillLight.shadow.camera.far = 100;
    fillLight.shadow.camera.left = -25;
    fillLight.shadow.camera.right = 25;
    fillLight.shadow.camera.top = 25;
    fillLight.shadow.camera.bottom = -25;
    fillLight.shadow.bias = -0.001;
    treeScene.add(fillLight);

    // Magical core light inside the tree
    const coreLight = new THREE.PointLight(LEAF_COLOR, 3, 25);
    coreLight.position.set(0, 12, 0);
    treeScene.add(coreLight);

    // Stars Background
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 1500;
    const starPos = new Float32Array(starsCount * 3);
    for(let i=0; i<starsCount; i++) {
        starPos[i*3] = (Math.random() - 0.5) * 300;
        starPos[i*3+1] = Math.random() * 150;
        starPos[i*3+2] = (Math.random() - 0.5) * 300 - 50;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, transparent: true, opacity: 0.8 });
    const starParticles = new THREE.Points(starsGeo, starsMat);
    treeScene.add(starParticles);

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
            uColor: { value: new THREE.Color(LEAF_COLOR) }
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
                // Size attenuation
                gl_PointSize = 25.0 * (10.0 / -mvPosition.z);
                // Pulsating alpha
                vAlpha = (sin(uTime * 1.5 + aPhase) * 0.5 + 0.5) * 0.8 + 0.2;
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
                gl_FragColor = vec4(uColor * intensity, vAlpha * intensity);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    fireflyParticles = new THREE.Points(fireflyGeo, fireflyMat);
    treeScene.add(fireflyParticles);

    // Material for Tree
    const treeMat = new THREE.MeshStandardMaterial({
        color: TREE_COLOR,
        metalness: 0.1,
        roughness: 0.85
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
        const geom = new THREE.CylinderGeometry(radius * 0.6, radius, length, 7);
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
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(0.5, 0.3, 0, 1.2);
    leafShape.quadraticCurveTo(-0.5, 0.3, 0, 0);
    const extrudeSettings = { depth: 0.03, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 };
    const leafGeom = new THREE.ExtrudeGeometry(leafShape, extrudeSettings);
    leafGeom.center();
    // Base scale for leaves (much larger to compensate for fewer mathematically allowed leaves)
    leafGeom.scale(1.2, 1.2, 1.2);

    const leafMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, // White base to let instance colors show
        emissive: LEAF_EMISSIVE,
        emissiveIntensity: 0.4,
        roughness: 0.6,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95
    });

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
            scale: (1.0 + Math.random() * 1.2) * sizeMultiplier
        });

        // Natural leaf colors: lush green, dark mature green, old yellow
        let hue, saturation, lightness;
        const randColor = Math.random();
        
        if (randColor < 0.6) {
            // Lush mid-green (majority)
            hue = 0.25 + Math.random() * 0.05; // 0.25 to 0.30
            saturation = 0.6 + Math.random() * 0.3;
            lightness = 0.3 + Math.random() * 0.2;
        } else if (randColor < 0.85) {
            // Dark mature green
            hue = 0.30 + Math.random() * 0.05; // 0.30 to 0.35
            saturation = 0.4 + Math.random() * 0.3;
            lightness = 0.15 + Math.random() * 0.15;
        } else {
            // Old yellow / slightly autumn
            hue = 0.12 + Math.random() * 0.08; // 0.12 to 0.20
            saturation = 0.7 + Math.random() * 0.3;
            lightness = 0.4 + Math.random() * 0.2;
        }
        
        tempColor.setHSL(hue, saturation, lightness);
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
    const groundGeom = new THREE.PlaneGeometry(150, 150);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x051108, // Dark grass green
        roughness: 0.9,
        metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    treeScene.add(ground);

    // Grass blades
    const grassGeo = new THREE.ConeGeometry(0.15, 1.5, 3);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x0a1f0f, roughness: 0.9 });
    const grassCount = 3000;
    const grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    grassInstanced.receiveShadow = true;
    
    const dummyGrass = new THREE.Object3D();
    for(let i=0; i<grassCount; i++) {
        const r = 2 + Math.random() * 60; 
        const theta = Math.random() * Math.PI * 2;
        dummyGrass.position.set(Math.cos(theta)*r, 0.75, Math.sin(theta)*r);
        dummyGrass.rotation.y = Math.random() * Math.PI;
        dummyGrass.rotation.x = (Math.random() - 0.5) * 0.4;
        dummyGrass.rotation.z = (Math.random() - 0.5) * 0.4;
        dummyGrass.scale.setScalar(0.3 + Math.random() * 0.8);
        dummyGrass.updateMatrix();
        grassInstanced.setMatrixAt(i, dummyGrass.matrix);
    }
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
        treeRenderer.setSize(width, height, false);
        treeCamera.aspect = width / height;
        treeCamera.updateProjectionMatrix();
    });
}

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
        treeCamera.aspect = canvas.clientWidth / canvas.clientHeight;
        treeCamera.updateProjectionMatrix();
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

    // Scale progress so that 100% of leaves are dropped 2 seconds BEFORE the timer hits 0
    // This gives the last leaf time to fall to the ground while the timer is still running
    const timeElapsed = progress * totalSeconds;
    const targetDetachmentTime = Math.max(1, totalSeconds - 2);
    const effectiveProgress = Math.min(1.0, timeElapsed / targetDetachmentTime);

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

            // Calculate mathematically perfect gap to pace the leaves evenly over the remaining time
            let baseGap = totalSeconds / activeLeafCount;
            if (baseGap > 3.0) baseGap = 3.0; // Strictly ensure we NEVER wait more than 3 seconds!
            
            // Apply very slight natural randomness (±10%) so it doesn't look purely mechanical
            let gap = baseGap * (0.9 + Math.random() * 0.2);
            
            // To guarantee the tree is empty by the last second, we only break the rule at the very end.
            if (effectiveProgress >= 0.95) {
                gap = 0.2; // Fast flush at the 95% mark
                dropsThisFrame = Math.min(15, detachmentQueue);
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
            const BOUND_Z_FRONT = 45; // Camera is at z=65
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

    treeRenderer.render(treeScene, treeCamera);
}
