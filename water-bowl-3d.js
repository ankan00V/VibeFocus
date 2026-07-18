let bowlScene, bowlCamera, bowlRenderer;
let waterMesh, glassBowl, dropMesh;
let waterUniforms;
let isBowlInitialized = false;

function initWaterBowl3D() {
    const canvas = document.getElementById('water-bowl-canvas');
    if (!canvas) return;
    
    bowlRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    bowlRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    const container = canvas.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    bowlRenderer.setSize(width, height, false);
    
    bowlScene = new THREE.Scene();
    
    bowlCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    bowlCamera.position.set(0, 4, 7);
    bowlCamera.lookAt(0, 0, 0);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    bowlScene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 8, 5);
    bowlScene.add(dirLight);
    
    const rimLight = new THREE.SpotLight(0x00f0ff, 3);
    rimLight.position.set(-5, 5, -5);
    rimLight.lookAt(0, 0, 0);
    rimLight.angle = Math.PI / 4;
    rimLight.penumbra = 0.5;
    bowlScene.add(rimLight);
    
    const rimLight2 = new THREE.SpotLight(0x0055ff, 2);
    rimLight2.position.set(5, -2, 5);
    rimLight2.lookAt(0, 0, 0);
    bowlScene.add(rimLight2);
    
    const bowlGeo = new THREE.SphereGeometry(2.5, 64, 32, 0, Math.PI * 2, 0, Math.PI / 1.8);
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.98,
        thickness: 0.5,
        transparent: true,
        side: THREE.DoubleSide,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
    });
    glassBowl = new THREE.Mesh(bowlGeo, glassMat);
    glassBowl.rotation.x = Math.PI; 
    bowlScene.add(glassBowl);
    
    const waterGeo = new THREE.CylinderGeometry(2.4, 0.1, 1.5, 128, 32);
    
    waterUniforms = {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uInteraction: { value: 0 }
    };
    
    const isMobile = window.innerWidth <= 768;
    
    const waterMat = new THREE.MeshPhysicalMaterial({
        color: 0x00aaff,
        emissive: 0x002255,
        roughness: 0.1,
        metalness: 0.2,
        transmission: isMobile ? 0.0 : 0.8,
        transparent: true,
        opacity: 0.9,
        clearcoat: 1.0
    });
    
    waterMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = waterUniforms.uTime;
        shader.uniforms.uProgress = waterUniforms.uProgress;
        shader.uniforms.uInteraction = waterUniforms.uInteraction;
        
        shader.vertexShader = `
            uniform float uTime;
            uniform float uProgress;
            uniform float uInteraction;
            
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
            float snoise(vec2 v) {
              const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
              vec2 i  = floor(v + dot(v, C.yy) );
              vec2 x0 = v -   i + dot(i, C.xx);
              vec2 i1;
              i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
              vec4 x12 = x0.xyxy + C.xxzz;
              x12.xy -= i1;
              i = mod289(i);
              vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
              vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
              m = m*m; m = m*m;
              vec3 x = 2.0 * fract(p * C.www) - 1.0;
              vec3 h = abs(x) - 0.5;
              vec3 ox = floor(x + 0.5);
              vec3 a0 = x - ox;
              m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
              vec3 g;
              g.x  = a0.x  * x0.x  + h.x  * x0.y;
              g.yz = a0.yz * x12.xz + h.yz * x12.yw;
              return 130.0 * dot(m, g);
            }
        ` + shader.vertexShader;
            
        shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `
            #include <begin_vertex>
            
            if (position.y > 0.1) {
                float dist = length(position.xz);
                float noise = snoise(position.xz * 1.5 - uTime * 0.5) * 0.05;
                float wave = 0.0;
                if (uInteraction > 0.0 && uInteraction < 1.0) {
                    float wavePhase = (dist * 2.0) - (uInteraction * 15.0);
                    wave = sin(wavePhase) * exp(-abs(wavePhase) * 0.5) * 0.2 * (1.0 - uInteraction);
                }
                transformed.y += noise + wave;
            }
            `
        );
    };
    
    waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = -0.5;
    bowlScene.add(waterMesh);
    
    const dropGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const dropMat = new THREE.MeshPhysicalMaterial({
        color: 0x88ccff,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.9,
        transparent: true,
        opacity: 0.8
    });
    dropMesh = new THREE.Mesh(dropGeo, dropMat);
    dropMesh.visible = false;
    bowlScene.add(dropMesh);
    
    isBowlInitialized = true;
    
    window.addEventListener('resize', () => {
        if (!bowlRenderer || !bowlCamera) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        bowlCamera.aspect = w / h;
        bowlCamera.updateProjectionMatrix();
        bowlRenderer.setSize(w, h, false);
    });
}

let waterInteractionState = 0;
let lastDropTime = 0;
let dropState = 1.0;

function renderWaterBowl3D(progress, time, isCeremonyActive) {
    if (!isBowlInitialized) {
        if (typeof THREE === 'undefined') return;
        initWaterBowl3D();
    }
    
    // Invert progress: 1.0 means start (empty), 0.0 means end (full)
    let fillFrac = 1.0 - progress;
    if (isCeremonyActive) {
        fillFrac = 1.0; // fully filled on completion screen
    }
    
    if (waterUniforms) {
        waterUniforms.uTime.value = time;
        waterUniforms.uProgress.value = fillFrac;
        
        if (isCeremonyActive && waterInteractionState === 0) {
            // Trigger ceremony ripple once
            waterInteractionState = 0.01;
        }
        
        if (waterInteractionState > 0) {
            waterInteractionState += 0.02; // speed of ripple
            if (waterInteractionState >= 1.0) waterInteractionState = 0;
        }
        
        waterUniforms.uInteraction.value = waterInteractionState;
    }
    
    if (glassBowl) {
        glassBowl.rotation.y = time * 0.05;
    }
    
    const waterSurfaceY = -1.5 + (fillFrac * 1.3);
    
    if (waterMesh) {
        waterMesh.rotation.y = time * 0.05;
        waterMesh.position.y = waterSurfaceY;
    }
    
    // Water Droplet Logic
    if (dropMesh) {
        if (!isCeremonyActive && progress > 0) {
            // Drop falls every 1.5 seconds
            if (time - lastDropTime > 1.5) {
                lastDropTime = time;
                dropState = 0.0;
                dropMesh.visible = true;
            }
            
            if (dropState < 1.0) {
                dropState += 0.04; // fall speed
                const startY = 2.0;
                const endY = waterSurfaceY;
                
                if (dropState >= 1.0) {
                    dropMesh.visible = false;
                    // Trigger ripple when it hits the water
                    waterInteractionState = 0.01;
                } else {
                    // Easing for gravity (acceleration)
                    const easeInQuad = dropState * dropState;
                    dropMesh.position.y = startY - (startY - endY) * easeInQuad;
                    dropMesh.position.x = 0;
                    dropMesh.position.z = 0;
                    
                    // Motion blur / stretch effect
                    dropMesh.scale.y = 1.0 + (dropState * 1.5);
                    dropMesh.scale.x = 1.0 - (dropState * 0.2);
                    dropMesh.scale.z = 1.0 - (dropState * 0.2);
                }
            }
        } else {
            dropMesh.visible = false;
        }
    }
    
    bowlRenderer.render(bowlScene, bowlCamera);
}
