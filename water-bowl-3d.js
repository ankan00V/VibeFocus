/**
 * water-bowl-3d.js — Photographic water bowl for VibeFocus
 *
 * A handmade ceramic bowl on a dark slate surface, lit by a soft window.
 * A single drip from above lands on a fixed schedule; the bowl fills by
 * volume so the water reaches the brim exactly when the session ends.
 *
 *  - Bowl: lathe-turned stoneware, dark speckled glaze, bare clay rim/foot,
 *    soft window key + environment reflection + cavity occlusion.
 *  - Water: analytic ripple rings from every recent impact, Fresnel blend
 *    between the window reflection and the glaze seen through the water
 *    (depth-tinted), with a bright meniscus at the wall.
 *  - Drops: falling drop with motion stretch, then a rebound jet and a few
 *    splash droplets on impact.
 *
 * Public API (used by app.js):
 *   initWaterBowl3D(canvas?), renderWaterBowl3D(progress, time, isCeremony, totalSeconds),
 *   resizeWaterBowl3D(w, h), resetWaterBowl3D(), isBowlInitialized
 */

let bowlScene, bowlCamera, bowlRenderer;
let isBowlInitialized = false;

const BOWL3D = {
    // Bowl dimensions (world units). Inner surface: y = Y_BOTTOM + DEPTH * (r / R_RIM)^EXP
    R_RIM: 1.65,
    Y_BOTTOM: 0.16,
    DEPTH: 1.30,
    EXP: 2.1,
    WALL: 0.085,
    MAX_FILL_U: 0.86,      // water level when full, as a fraction of inner depth
    MAX_IMPACTS: 8,
    DROP_FALL_TIME: 0.55,  // seconds from appearing to impact

    shared: null,
    water: null,
    bowl: null,
    table: null,
    drop: null,
    splash: [],
    lastLanded: -1,
    built: false,
};

/* ════════════════════════════════════════════════════════════
   Shared GLSL: environment, tone mapping
════════════════════════════════════════════════════════════ */

const BOWL_GLSL_COMMON = `
    uniform vec3 uKeyDir;
    float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
                   mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
        return v;
    }
    // Dark room with one soft, tall window up and to the left
    vec3 envColor(vec3 d) {
        vec3 base = mix(vec3(0.010, 0.012, 0.016), vec3(0.058, 0.067, 0.084), pow(clamp(d.y, 0.0, 1.0), 0.8));
        // window in the direction of the key light, as a soft rectangle
        vec3 k = normalize(uKeyDir);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), k));
        vec3 up = cross(k, right);
        float fx = dot(d, right), fy = dot(d, up), fz = dot(d, k);
        float win = smoothstep(0.40, 0.30, abs(fx)) * smoothstep(0.50, 0.38, abs(fy)) * step(0.0, fz);
        // mullion: a darker cross through the window
        float mull = 1.0 - 0.75 * (smoothstep(0.012, 0.0, abs(fx)) + smoothstep(0.012, 0.0, abs(fy - 0.05)));
        vec3 sky = vec3(0.80, 0.88, 1.0) * 2.4 * win * clamp(mull, 0.0, 1.0);
        return base + sky;
    }
    vec3 acesFilm(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    vec3 finalizeColor(vec3 c) {
        c = acesFilm(c);
        c = pow(c, vec3(1.0 / 2.2));
        c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
        return c;
    }
`;

const BOWL_VERTEX = `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

/* ── Ceramic bowl ── */
const BOWL_FRAGMENT = `
    uniform float uWaterY;
    uniform float uRimR;
    uniform float uRimY;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    ${BOWL_GLSL_COMMON}

    void main() {
        vec3 P = vWorldPos;
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - P);
        vec3 K = normalize(uKeyDir);
        float r = length(P.xz);
        float ang = atan(P.z, P.x);

        bool inside = dot(N.xz, P.xz) < -0.001 * r || (N.y > 0.6 && r < uRimR * 0.9 && P.y < uRimY - 0.05);

        // Glaze: deep slate-teal with speckles and pooled tone variation
        float pool = fbm(vec2(ang * 3.0, P.y * 3.0));
        vec3 glaze = mix(vec3(0.050, 0.075, 0.085), vec3(0.085, 0.115, 0.120), pool);
        float speck = step(0.996, hash12(floor(vec2(ang * 200.0, P.y * 90.0))));
        glaze = mix(glaze, vec3(0.20, 0.19, 0.17), speck * 0.5);
        // Glaze breaks lighter over the rim, exposing warm stoneware
        float rimBand = smoothstep(uRimY - 0.06, uRimY - 0.01, P.y);
        vec3 clay = vec3(0.42, 0.33, 0.25) * (0.85 + 0.2 * fbm(P.xz * 9.0));
        // Unglazed foot at the bottom outside
        float foot = (!inside) ? 1.0 - smoothstep(0.10, 0.16, P.y) : 0.0;
        // Glaze drips down the outside, ending in a wavy line
        float glazeLine = 0.30 + 0.05 * sin(ang * 7.0) + 0.03 * sin(ang * 17.0 + 1.0);
        float bare = (!inside) ? 1.0 - smoothstep(glazeLine - 0.01, glazeLine + 0.01, P.y) : 0.0;
        vec3 albedo = mix(glaze, clay, max(max(rimBand * 0.85, foot), bare * 0.9));
        float glossy = 1.0 - max(max(rimBand * 0.85, foot), bare);

        // Soft window key (wrap) + room fill
        float ndl = clamp((dot(N, K) + 0.2) / 1.2, 0.0, 1.0);
        vec3 key = vec3(0.80, 0.86, 0.95) * ndl * 1.25;
        vec3 fill = vec3(0.05, 0.055, 0.065) * (0.6 + 0.4 * N.y);

        // Cavity occlusion inside the bowl, and the bowl's own shadow on its inner wall
        float ao = 1.0;
        if (inside) {
            float depth = clamp((uRimY - P.y) / (uRimY - 0.1), 0.0, 1.0);
            ao = mix(1.0, 0.45, depth);
            // wall nearest the light is shadowed by the rim
            float facing = dot(normalize(vec3(P.x, 0.0, P.z) + 1e-4), normalize(vec3(K.x, 0.0, K.z)));
            key *= mix(1.0, smoothstep(-0.2, 0.6, -facing), depth * 0.85);
        }

        vec3 col = albedo * (key + fill) * ao;

        // Glossy glaze reflection of the window
        vec3 R = reflect(-V, N);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 refl = envColor(R) * fres * (inside ? ao : 1.0);
        col += refl * mix(0.15, 1.0, glossy);

        gl_FragColor = vec4(finalizeColor(col), 1.0);
    }
`;

/* ── Water surface ── */
const BOWL_WATER_FRAGMENT = `
    uniform float uTime;
    uniform float uWaterY;
    uniform float uWaterR;
    uniform float uBottomY;
    uniform float uDepth;
    uniform float uRimR;
    uniform float uRimY;
    uniform float uExp;
    uniform vec4 uImpacts[8];      // xy = position, z = age (s), w = strength
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    ${BOWL_GLSL_COMMON}

    // Capillary-gravity ring packet travelling outward from an impact
    float ripple(vec2 p, vec4 imp) {
        if (imp.w <= 0.0) return 0.0;
        float age = imp.z;
        float d = length(p - imp.xy);
        float front = age * 0.85;
        float width = 0.16 + age * 0.22;
        float env = exp(-pow((d - front) / width, 2.0));
        float decay = exp(-age * 0.75) / (1.0 + d * 2.5);
        // trailing smaller rings
        float phase = (d - front) * 30.0 / (1.0 + age * 0.6);
        return imp.w * 0.034 * env * decay * sin(phase);
    }
    float height(vec2 p) {
        float h = 0.0;
        for (int i = 0; i < 8; i++) h += ripple(p, uImpacts[i]);
        // reflection off the bowl wall: mirror the strongest ring back in
        float rr = length(p);
        float edge = smoothstep(uWaterR * 0.75, uWaterR, rr);
        h *= 1.0 - edge * 0.5;
        // very faint ambient surface motion so the water never looks frozen
        h += (vnoise(p * 3.0 + uTime * 0.15) - 0.5) * 0.0025;
        return h;
    }

    void main() {
        vec3 P = vWorldPos;
        vec2 xz = P.xz;
        float rr = length(xz);
        if (rr > uWaterR) discard;

        float e = 0.006;
        float hx = height(xz + vec2(e, 0.0)) - height(xz - vec2(e, 0.0));
        float hz = height(xz + vec2(0.0, e)) - height(xz - vec2(0.0, e));
        vec3 N = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
        vec3 V = normalize(cameraPosition - P);

        // Reflection
        vec3 R = reflect(-V, N);
        // Reflected ray: does it see the window, or the bowl's own wall and rim?
        float tr = (uRimY - P.y) / max(R.y, 0.02);
        float qd = length(xz + R.xz * tr);
        float hitWall = smoothstep(uRimR - 0.03, uRimR + 0.01, qd);
        vec3 wallRefl = vec3(0.020, 0.028, 0.032);
        float rimLine = exp(-pow((qd - uRimR - 0.02) / 0.025, 2.0));
        vec3 refl = mix(envColor(R), wallRefl, hitWall * 0.65) + vec3(0.30, 0.24, 0.19) * rimLine * 0.35;
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        fres = max(fres, 0.10);

        // Refraction: the glaze below, tinted by water depth
        vec3 T = refract(-V, N, 1.0 / 1.33);
        float bottomAt = uBottomY + uDepth * pow(clamp(rr / uRimR, 0.0, 1.0), uExp);
        float depth = max(uWaterY - bottomAt, 0.0);
        vec2 seen = xz + T.xz / max(-T.y, 0.2) * depth;
        float pool = fbm(seen * 0.9);
        vec3 glaze = mix(vec3(0.060, 0.082, 0.090), vec3(0.075, 0.100, 0.106), pool);
        vec3 K = normalize(uKeyDir);
        // light reaching the bottom through the surface (with soft caustics)
        float caustic = 0.7 + 0.6 * pow(vnoise(seen * 6.0 + uTime * 0.2), 3.0) + dot(N.xz, N.xz) * 40.0;
        // the bottom sits in the bowl's own shade: dimmer the deeper it is
        float shade = mix(0.42, 0.22, clamp(depth / 0.9, 0.0, 1.0));
        vec3 lightBelow = vec3(0.80, 0.86, 0.95) * shade * caustic;
        vec3 absorb = exp(-vec3(1.4, 0.65, 0.5) * depth * 1.5);
        vec3 refr = glaze * (lightBelow + 0.04) * absorb + vec3(0.003, 0.009, 0.012) * (1.0 - absorb);

        vec3 col = mix(refr, refl, fres);

        // Meniscus: thin bright line where the water climbs the glaze
        float men = smoothstep(uWaterR - 0.035, uWaterR - 0.004, rr);
        col += vec3(0.6, 0.66, 0.75) * men * 0.035;

        gl_FragColor = vec4(finalizeColor(col), 1.0);
    }
`;

/* ── Slate table ── */
const BOWL_TABLE_FRAGMENT = `
    uniform float uRimR;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    ${BOWL_GLSL_COMMON}

    void main() {
        vec3 P = vWorldPos;
        vec3 V = normalize(cameraPosition - P);
        vec3 K = normalize(uKeyDir);
        float d = length(P.xz);

        float n = fbm(P.xz * 1.4);
        float fine = vnoise(P.xz * 30.0);
        vec3 slate = mix(vec3(0.030, 0.032, 0.036), vec3(0.055, 0.058, 0.062), n) * (0.92 + 0.12 * fine);

        // Pool of window light, falling off into the dark room
        vec2 lc = -K.xz * 0.6;
        float pool = exp(-dot(P.xz - lc, P.xz - lc) * 0.035);
        vec3 key = vec3(0.80, 0.86, 0.95) * K.y * 1.1 * pool;

        // Soft shadow of the bowl cast away from the window
        vec2 sc = -K.xz / max(K.y, 0.2) * 0.55;
        float sd = length(P.xz - sc);
        float shadow = mix(0.25, 1.0, smoothstep(uRimR * 0.75, uRimR * 1.35, sd));
        float contact = mix(0.35, 1.0, smoothstep(0.9, 1.6, d));

        vec3 col = slate * (key * shadow + 0.03) * contact;

        col *= 1.0 - smoothstep(7.0, 14.0, d);
        gl_FragColor = vec4(finalizeColor(col), 1.0);
    }
`;

/* ── Water droplets (falling drop, jet, splash) ── */
const BOWL_DROP_FRAGMENT = `
    uniform float uOpacity;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    ${BOWL_GLSL_COMMON}

    void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = max(dot(N, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 refl = envColor(reflect(-V, N));
        // seen-through background is dark; the window refracts as an inverted bright patch
        vec3 refr = envColor(refract(-V, N, 1.0 / 1.33) * vec3(-1.0, -1.0, 1.0)) * 0.6;
        vec3 col = mix(refr, refl, fres) + vec3(0.02, 0.025, 0.03) * (1.0 - ndv);
        gl_FragColor = vec4(finalizeColor(col), uOpacity);
    }
`;

/* ════════════════════════════════════════════════════════════
   Geometry
════════════════════════════════════════════════════════════ */

function bowlInnerY(r) {
    const B = BOWL3D;
    return B.Y_BOTTOM + B.DEPTH * Math.pow(Math.min(1, r / B.R_RIM), B.EXP);
}
function bowlInnerR(y) {
    const B = BOWL3D;
    const u = Math.max(0, (y - B.Y_BOTTOM) / B.DEPTH);
    return B.R_RIM * Math.pow(u, 1 / B.EXP);
}

// Water level for a filled volume fraction f (0..1). Volume of this bowl
// grows as u^(1 + 2/EXP), so we invert that to keep fill proportional to time.
function bowlLevelForFill(f) {
    const B = BOWL3D;
    const k = 1 + 2 / B.EXP;
    const u = B.MAX_FILL_U * Math.pow(Math.max(0, Math.min(1, f)), 1 / k);
    return B.Y_BOTTOM + B.DEPTH * u;
}

function createBowlGeometry() {
    const B = BOWL3D;
    const pts = [];
    const rimY = B.Y_BOTTOM + B.DEPTH;
    const t = B.WALL;
    // Inner surface: centre → rim
    const N1 = 60;
    for (let i = 0; i <= N1; i++) {
        const r = B.R_RIM * Math.pow(i / N1, 0.8);
        pts.push(new THREE.Vector2(Math.max(r, 0.0001), bowlInnerY(r)));
    }
    // Rounded rim (half circle over the top, inner → outer)
    const rimC = new THREE.Vector2(B.R_RIM + t * 0.5, rimY);
    for (let i = 1; i < 12; i++) {
        const a = Math.PI - (i / 12) * Math.PI;
        pts.push(new THREE.Vector2(rimC.x + Math.cos(a) * t * 0.5, rimC.y + Math.sin(a) * t * 0.5));
    }
    // Outer surface: rim → foot (offset of the inner wall, slightly fuller)
    const N2 = 50;
    for (let i = 0; i <= N2; i++) {
        const f = i / N2;
        const r = B.R_RIM * Math.pow(1 - f, 0.8);
        const y = bowlInnerY(r) - t;
        const outerR = r + t * (1.0 + 0.3 * f);
        if (y < 0.13) break;
        pts.push(new THREE.Vector2(outerR, y));
    }
    // Foot ring
    const footR = 0.78;
    const last = pts[pts.length - 1];
    pts.push(new THREE.Vector2((last.x + footR) / 2 + 0.03, 0.10));
    pts.push(new THREE.Vector2(footR + 0.03, 0.04));
    pts.push(new THREE.Vector2(footR, 0.0));
    pts.push(new THREE.Vector2(footR - 0.08, 0.0));
    pts.push(new THREE.Vector2(footR - 0.10, 0.05));
    pts.push(new THREE.Vector2(0.0001, 0.06));
    // Lathe needs points ordered consistently; reverse so normals face outward
    return new THREE.LatheGeometry(pts.reverse(), 160);
}

/* ════════════════════════════════════════════════════════════
   Init
════════════════════════════════════════════════════════════ */

function initWaterBowl3D(canvas) {
    if (!canvas) canvas = document.getElementById('water-bowl-canvas');
    if (!canvas || typeof THREE === 'undefined') return;
    if (isBowlInitialized) return;

    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;

    bowlRenderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true, // required for the PiP capture stream
        powerPreference: 'high-performance',
    });
    bowlRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    bowlRenderer.setSize(width, height, false);
    bowlRenderer.setClearColor(0x000000, 1);

    bowlScene = new THREE.Scene();
    bowlCamera = new THREE.PerspectiveCamera(30, width / height, 0.1, 80);

    const B = BOWL3D;
    const impacts = [];
    for (let i = 0; i < B.MAX_IMPACTS; i++) impacts.push(new THREE.Vector4(0, 0, 0, 0));
    const shared = {
        uKeyDir: { value: new THREE.Vector3(-0.30, 0.60, -0.74).normalize() },
        uTime: { value: 0 },
        uWaterY: { value: B.Y_BOTTOM },
        uWaterR: { value: 0.01 },
        uBottomY: { value: B.Y_BOTTOM },
        uDepth: { value: B.DEPTH },
        uRimR: { value: B.R_RIM },
        uRimY: { value: B.Y_BOTTOM + B.DEPTH },
        uExp: { value: B.EXP },
        uImpacts: { value: impacts },
    };
    B.shared = shared;

    // Table
    const tableGeo = new THREE.PlaneGeometry(40, 40);
    tableGeo.rotateX(-Math.PI / 2);
    B.table = new THREE.Mesh(tableGeo, new THREE.ShaderMaterial({
        uniforms: shared, vertexShader: BOWL_VERTEX, fragmentShader: BOWL_TABLE_FRAGMENT,
    }));
    bowlScene.add(B.table);

    // Bowl
    B.bowl = new THREE.Mesh(createBowlGeometry(), new THREE.ShaderMaterial({
        uniforms: shared, vertexShader: BOWL_VERTEX, fragmentShader: BOWL_FRAGMENT, side: THREE.DoubleSide,
    }));
    bowlScene.add(B.bowl);

    // Water surface (a disc sized to the bowl at the current level)
    const waterGeo = new THREE.CircleGeometry(1, 128);
    waterGeo.rotateX(-Math.PI / 2);
    B.water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
        uniforms: shared, vertexShader: BOWL_VERTEX, fragmentShader: BOWL_WATER_FRAGMENT,
    }));
    B.water.visible = false;
    bowlScene.add(B.water);

    // Droplets
    const dropMat = new THREE.ShaderMaterial({
        uniforms: Object.assign({ uOpacity: { value: 1 } }, shared),
        vertexShader: BOWL_VERTEX, fragmentShader: BOWL_DROP_FRAGMENT, transparent: true,
    });
    const dropGeo = new THREE.SphereGeometry(1, 24, 16);
    B.drop = new THREE.Mesh(dropGeo, dropMat);
    B.drop.visible = false;
    bowlScene.add(B.drop);
    B.splash = [];
    for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(dropGeo, dropMat);
        m.visible = false;
        bowlScene.add(m);
        B.splash.push(m);
    }

    window.addEventListener('resize', onWindowResizeWaterBowl3D);
    isBowlInitialized = true;
    window.isBowlInitialized = true;
    resizeWaterBowl3D(width, height);
}

/* ════════════════════════════════════════════════════════════
   Drop schedule (deterministic from elapsed time → pause/reset safe)
════════════════════════════════════════════════════════════ */

function bowlDropSchedule(totalSeconds) {
    // One drop every ~3–5 s; an exact number of drops so the last lands at 00:00
    const interval = Math.max(2.5, Math.min(5, totalSeconds / 300));
    const count = Math.max(1, Math.round(totalSeconds / interval));
    return { count, interval: totalSeconds / count };
}

function bowlRand(i) {
    const x = Math.sin(i * 91.7 + 13.1) * 43758.5453;
    return x - Math.floor(x);
}

function bowlImpactPoint(i) {
    // A single drip point above the bowl, with a little wobble
    const a = bowlRand(i) * Math.PI * 2;
    const d = 0.05 + bowlRand(i + 0.5) * 0.12;
    return { x: 0.18 + Math.cos(a) * d, z: 0.05 + Math.sin(a) * d };
}

/* ════════════════════════════════════════════════════════════
   Per-frame update
════════════════════════════════════════════════════════════ */

function frameBowlCamera(time, isCeremony) {
    const cam = bowlCamera;
    const aspect = cam.aspect || 1;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const contentW = 4.1;
    const contentH = 3.4;
    const dist = Math.max((contentH * 0.5) / tanV, (contentW * 0.5) / (tanV * aspect)) * (isCeremony ? 1.0 : 1.08);
    const elev = 0.56; // ~32°: enough to see into the water
    const yaw = Math.sin(time * 0.05) * 0.04;
    const target = new THREE.Vector3(0, 0.8, 0);
    cam.position.set(
        target.x + Math.sin(yaw) * Math.cos(elev) * dist,
        target.y + Math.sin(elev) * dist,
        target.z + Math.cos(yaw) * Math.cos(elev) * dist
    );
    cam.lookAt(target);
}

function renderWaterBowl3D(progress = 0, time = 0, isCeremony = false, totalSeconds = 60) {
    if (!isBowlInitialized) {
        initWaterBowl3D();
        if (!isBowlInitialized) return;
    }
    const B = BOWL3D;
    let p = Number(progress);
    if (!Number.isFinite(p)) p = 0;
    p = Math.max(0, Math.min(1, p));
    const total = Math.max(1, Number(totalSeconds) || 60);
    const t = Number.isFinite(Number(time)) ? Number(time) : 0;
    const elapsed = p * total;

    const sched = bowlDropSchedule(total);
    // Drop k (1-based) lands at k * interval; the last one at exactly `total`
    let landed = isCeremony ? sched.count : Math.min(sched.count, Math.floor(elapsed / sched.interval + 1e-6));

    // Fill: each drop adds 1/count of the volume, eased in over a fraction of a second
    const sinceLast = elapsed - landed * sched.interval;
    const settle = Math.min(1, sinceLast / 0.4);
    let fill = isCeremony ? 1 : Math.min(1, (landed - 1 + settle) / sched.count);
    if (landed === 0) fill = 0;
    fill = Math.max(0, fill);

    const levelY = bowlLevelForFill(fill);
    const waterR = bowlInnerR(levelY);
    const sh = B.shared;
    sh.uTime.value = t;
    sh.uWaterY.value = levelY;
    sh.uWaterR.value = waterR;

    B.water.visible = fill > 0.0005;
    B.water.position.y = levelY;
    B.water.scale.set(waterR, 1, waterR);

    // Sound for each newly landed drop (not on resume/jumps of many drops)
    if (!isCeremony && landed > B.lastLanded) {
        if (B.lastLanded >= 0 && landed - B.lastLanded <= 2 && typeof playDropSound === 'function') {
            playDropSound();
        }
        B.lastLanded = landed;
    } else if (landed < B.lastLanded) {
        B.lastLanded = landed;
    }

    // Ripples from the most recent impacts
    const imps = sh.uImpacts.value;
    for (let i = 0; i < B.MAX_IMPACTS; i++) {
        const k = landed - i;
        const v = imps[i];
        if (k < 1) { v.set(0, 0, 0, 0); continue; }
        const age = elapsed - k * sched.interval;
        if (isCeremony) {
            // A slow, calm ring every few seconds on the full bowl
            const ca = (t + i * 1.7) % (B.MAX_IMPACTS * 1.7);
            v.set(0.15, 0.05, ca, i < 3 ? 0.6 : 0);
            continue;
        }
        const pt = bowlImpactPoint(k);
        v.set(pt.x, pt.z, Math.max(0, age), age < 9 ? 1 : 0);
    }

    // Falling drop for the next impact
    const next = landed + 1;
    const fall = B.DROP_FALL_TIME;
    const timeToNext = next * sched.interval - elapsed;
    const startY = levelY + 4.2;
    if (!isCeremony && next <= sched.count && timeToNext < fall && timeToNext >= 0) {
        const s = 1 - timeToNext / fall;       // 0 → 1
        const y = startY - (startY - levelY) * s * s;
        const v = 2 * s * (startY - levelY) / fall;
        const pt = bowlImpactPoint(next);
        B.drop.visible = true;
        B.drop.position.set(pt.x, y + 0.03, pt.z);
        const rad = 0.045;
        B.drop.scale.set(rad, rad * (1 + Math.min(4, v * 0.012)), rad);
    } else if (!isCeremony && timeToNext >= fall && timeToNext < fall + 0.35 && next <= sched.count) {
        // Drop forming at the drip point, just entering frame from above
        const pt = bowlImpactPoint(next);
        B.drop.visible = true;
        B.drop.position.set(pt.x, startY, pt.z);
        B.drop.scale.setScalar(0.045);
    } else {
        B.drop.visible = false;
    }

    // Impact: rebound jet + splash droplets for ~0.5 s
    const age0 = landed >= 1 ? elapsed - landed * sched.interval : 99;
    const ptL = landed >= 1 ? bowlImpactPoint(landed) : { x: 0, z: 0 };
    for (let i = 0; i < B.splash.length; i++) {
        const m = B.splash[i];
        if (isCeremony || age0 > 0.6) { m.visible = false; continue; }
        m.visible = true;
        if (i === 0) {
            // Worthington jet: a short column that rises and falls back
            const h = Math.max(0, Math.sin(Math.min(1, age0 / 0.45) * Math.PI)) * 0.22;
            m.position.set(ptL.x, levelY + h * 0.5, ptL.z);
            m.scale.set(0.022, Math.max(0.001, h * 0.5), 0.022);
            if (h <= 0.002) m.visible = false;
        } else {
            const a = (i / (B.splash.length - 1)) * Math.PI * 2 + bowlRand(landed + i) * 0.6;
            const sp = 0.35 + bowlRand(landed * 3 + i) * 0.35;
            const vy = 1.1 + bowlRand(landed * 7 + i) * 0.6;
            const tt = age0;
            const yy = levelY + vy * tt - 4.9 * tt * tt;
            if (yy < levelY) { m.visible = false; continue; }
            m.position.set(ptL.x + Math.cos(a) * sp * tt, yy, ptL.z + Math.sin(a) * sp * tt);
            m.scale.setScalar(0.011 + bowlRand(landed + i * 5) * 0.008);
        }
    }

    frameBowlCamera(t, isCeremony);
    bowlRenderer.render(bowlScene, bowlCamera);
}

/* ════════════════════════════════════════════════════════════
   Lifecycle
════════════════════════════════════════════════════════════ */

function resetWaterBowl3D() {
    BOWL3D.lastLanded = -1;
}

function resizeWaterBowl3D(width, height) {
    if (!bowlRenderer || !bowlCamera) return;
    const canvas = bowlRenderer.domElement;
    const w = width || canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    const h = height || canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
    if (!w || !h) return;
    bowlCamera.aspect = w / h;
    bowlCamera.updateProjectionMatrix();
    bowlRenderer.setSize(w, h, false);
}

function onWindowResizeWaterBowl3D() {
    resizeWaterBowl3D();
}

window.initWaterBowl3D = initWaterBowl3D;
window.renderWaterBowl3D = renderWaterBowl3D;
window.resizeWaterBowl3D = resizeWaterBowl3D;
window.resetWaterBowl3D = resetWaterBowl3D;
