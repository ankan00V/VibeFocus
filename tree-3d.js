let treeScene, treeCamera, treeRenderer;
let treeGroup;
let leafInstancedMesh;
let leafData = [];
let fireflyParticles;
let isTreeInitialized = false;

let nextDropProgress = 0;
let currentTargetDropped = 0;

const MAX_LEAVES = 800;
const TREE_COLOR = 0x0a0f12; // Dark obsidian
const LEAF_COLOR = 0xa8d870; // Glowing ethereal green
const LEAF_EMISSIVE = 0x55aa33;

function initTree3D() {
    const canvas = document.getElementById('tree-canvas');
    if (!canvas) return;

    treeRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
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
        if (depth <= 2 || Math.random() < 0.3) {
            const numLeaves = depth === 1 ? 5 : 2;
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
    leafGeom.scale(0.35, 0.35, 0.35);

    const leafMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, // White base to let instance colors show
        emissive: LEAF_EMISSIVE,
        emissiveIntensity: 0.4,
        roughness: 0.6,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95
    });

    const actualLeaves = Math.min(MAX_LEAVES, leafPositions.length);
    leafInstancedMesh = new THREE.InstancedMesh(leafGeom, leafMat, actualLeaves);
    leafInstancedMesh.castShadow = true;
    leafInstancedMesh.receiveShadow = true;
    
    // Initialize leaf data
    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();
    for (let i = 0; i < actualLeaves; i++) {
        const pos = leafPositions[i];
        
        leafData.push({
            startPos: pos.clone(),
            pos: pos.clone(),
            vel: new THREE.Vector3(0,0,0),
            rot: new THREE.Vector3(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI),
            rotVel: new THREE.Vector3((Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1),
            attached: true,
            grounded: false,
            phase: Math.random() * Math.PI * 2,
            baseWind: { x: 0, z: 0 }
        });

        // Unique shade for each leaf
        const hue = 0.22 + Math.random() * 0.1; // Greenish to slightly yellow/autumn
        const saturation = 0.7 + Math.random() * 0.3;
        const lightness = 0.3 + Math.random() * 0.4;
        tempColor.setHSL(hue, saturation, lightness);
        leafInstancedMesh.setColorAt(i, tempColor);

        dummy.position.copy(pos);
        dummy.rotation.set(leafData[i].rot.x, leafData[i].rot.y, leafData[i].rot.z);
        dummy.scale.setScalar(1.0 + (Math.random()-0.5)*0.4);
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
    nextDropProgress = 0;
    for (let i = 0; i < leafData.length; i++) {
        const leaf = leafData[i];
        leaf.attached = true;
        leaf.grounded = false;
        leaf.pos.copy(leaf.startPos);
        leaf.vel.set(0,0,0);
    }
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

    // Sway the whole tree gently
    treeGroup.rotation.y = Math.sin(time * 0.2) * 0.05;
    treeGroup.rotation.z = Math.cos(time * 0.3) * 0.02;
    
    // Update fireflies
    if (fireflyParticles) {
        fireflyParticles.material.uniforms.uTime.value = time;
        fireflyParticles.rotation.y = time * -0.02; // slow orbiting
    }

    // Update leaves
    if (progress >= 1.0) {
        // End of timer, drop ALL remaining leaves
        currentTargetDropped = leafData.length;
    } else if (progress >= nextDropProgress) {
        // It's time for a new batch
        // Dynamically scale interval based on total duration so the pacing feels right for 1m up to 120m
        // Target an average of ~3 leaves per drop
        let baseInterval = (totalSeconds / leafData.length) * 3;
        // Clamp the interval between 1s and 8s to keep things visually active but not frantic
        const intervalSeconds = Math.max(1, Math.min(baseInterval, 8)) * (0.8 + Math.random() * 0.4);

        const progressIncrement = totalSeconds > 0 ? (intervalSeconds / totalSeconds) : 1;
        nextDropProgress = progress + progressIncrement;
        
        const idealDropped = Math.floor(progress * leafData.length);
        
        // Calculate a random batch size, scaled around what's needed to maintain the pace
        const expectedBatch = (intervalSeconds / totalSeconds) * leafData.length;
        const randomFactor = 0.5 + Math.random(); // 0.5 to 1.5
        const batch = Math.max(1, Math.round(expectedBatch * randomFactor));
        
        currentTargetDropped = Math.max(currentTargetDropped + batch, idealDropped);
        
        // cap it to save a few for the very last second
        if (currentTargetDropped > leafData.length - 2) {
            currentTargetDropped = leafData.length - 2;
        }
    }

    let currentlyDropped = 0;
    for (let i = 0; i < leafData.length; i++) {
        if (!leafData[i].attached) currentlyDropped++;
    }

    // Detach leaves to meet currentTargetDropped
    let attempts = 0;
    while (currentlyDropped < currentTargetDropped && attempts < 1000) {
        let idx = Math.floor(Math.random() * leafData.length);
        if (leafData[idx].attached) {
            leafData[idx].attached = false;
            // Strong wind burst when detaching, random directions
            const windDirX = (Math.random() - 0.5) * 0.3;
            const windDirZ = (Math.random() - 0.5) * 0.3;
            leafData[idx].vel.set(
                windDirX,
                0.05 + Math.random() * 0.05, // slight uplift
                windDirZ
            );
            leafData[idx].baseWind.x = windDirX * 0.06;
            leafData[idx].baseWind.z = windDirZ * 0.06;
            currentlyDropped++;
        }
        attempts++;
    }

    const dummy = new THREE.Object3D();
    for (let i = 0; i < leafData.length; i++) {
        const leaf = leafData[i];

        if (!leaf.attached && !leaf.grounded) {
            // Falling Physics
            leaf.vel.y -= 0.006; // Stronger gravity

            // Wind drift - individual trajectories mixed with time
            // Reduce the baseWind impact so they stay closer to the tree
            const windForceX = Math.sin(time * 1.5 + leaf.phase) * 0.005 + leaf.baseWind.x * 0.3; 
            const windForceZ = Math.cos(time * 1.2 + leaf.phase) * 0.005 + leaf.baseWind.z * 0.3;
            
            leaf.vel.x += windForceX;
            leaf.vel.z += windForceZ;

            // Air resistance
            leaf.vel.multiplyScalar(0.92);

            leaf.pos.add(leaf.vel);
            
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
        let scale = 1.0;
        // Make grounded leaves fade/shrink slightly to avoid z-fighting clutter
        if (leaf.grounded) scale = 0.8;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        leafInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    leafInstancedMesh.instanceMatrix.needsUpdate = true;

    treeRenderer.render(treeScene, treeCamera);
}
