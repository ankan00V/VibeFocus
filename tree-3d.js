let treeScene, treeCamera, treeRenderer;
let treeGroup;
let leafInstancedMesh;
let leafData = [];
let isTreeInitialized = false;

const MAX_LEAVES = 1500;
const TREE_COLOR = 0x0a0f12; // Dark obsidian
const LEAF_COLOR = 0xa8d870; // Glowing ethereal green
const LEAF_EMISSIVE = 0x55aa33;

function initTree3D() {
    const canvas = document.getElementById('tree-canvas');
    if (!canvas) return;

    treeRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    treeRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
    treeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    treeScene = new THREE.Scene();

    // Camera
    const aspect = canvas.clientWidth / canvas.clientHeight;
    treeCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    // Position camera to see the tree and ground
    treeCamera.position.set(0, 15, 40);
    treeCamera.lookAt(0, 8, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    treeScene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0xbbeeff, 1.5);
    rimLight.position.set(-10, 20, -10);
    treeScene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xaaffcc, 0.8);
    fillLight.position.set(10, 10, 10);
    treeScene.add(fillLight);

    // Tree Group
    treeGroup = new THREE.Group();
    treeScene.add(treeGroup);

    // Material for Tree
    const treeMat = new THREE.MeshPhysicalMaterial({
        color: TREE_COLOR,
        metalness: 0.8,
        roughness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
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
        geom.applyQuaternion(quaternion);
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
        treeMeshGroup.add(mesh);
    });
    treeGroup.add(treeMeshGroup);

    // Leaves InstancedMesh
    const leafGeom = new THREE.OctahedronGeometry(0.3, 0);
    const leafMat = new THREE.MeshStandardMaterial({
        color: LEAF_COLOR,
        emissive: LEAF_EMISSIVE,
        emissiveIntensity: 0.8,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9
    });

    const actualLeaves = Math.min(MAX_LEAVES, leafPositions.length);
    leafInstancedMesh = new THREE.InstancedMesh(leafGeom, leafMat, actualLeaves);
    
    // Initialize leaf data
    const dummy = new THREE.Object3D();
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
            phase: Math.random() * Math.PI * 2
        });

        dummy.position.copy(pos);
        dummy.rotation.set(leafData[i].rot.x, leafData[i].rot.y, leafData[i].rot.z);
        dummy.scale.setScalar(1.0 + (Math.random()-0.5)*0.4);
        dummy.updateMatrix();
        leafInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    treeGroup.add(leafInstancedMesh);

    // Add a dark glossy ground plane
    const groundGeom = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshPhysicalMaterial({
        color: 0x05080a,
        metalness: 0.9,
        roughness: 0.1,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.8
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    treeScene.add(ground);

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

    // Update leaves
    const targetDropped = Math.floor(progress * leafData.length);
    let currentlyDropped = 0;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < leafData.length; i++) {
        const leaf = leafData[i];
        
        if (!leaf.attached) currentlyDropped++;

        // Detach leaves smoothly over time based on progress
        if (leaf.attached && currentlyDropped < targetDropped) {
            // Random chance to detach to avoid clumps
            if (Math.random() < 0.1) {
                leaf.attached = false;
                currentlyDropped++;
                // Initial wind burst
                leaf.vel.set((Math.random()-0.5)*0.1, 0, (Math.random()-0.5)*0.1);
            }
        }

        if (!leaf.attached && !leaf.grounded) {
            // Falling Physics
            leaf.vel.y -= 0.0015; // Gravity
            
            // Wind drift
            const wind = Math.sin(time * 2 + leaf.phase) * 0.01;
            leaf.vel.x += wind;
            leaf.vel.z += Math.cos(time * 1.5 + leaf.phase) * 0.01;

            // Air resistance
            leaf.vel.multiplyScalar(0.98);

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
