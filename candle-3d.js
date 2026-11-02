/**
 * candle-3d.js — Photographic 3D pillar candle for VibeFocus
 *
 * A single ivory pillar candle burning in a dark room, rendered with
 * hand-written shaders (no reliance on fragile material patching):
 *
 *  - Wax body: procedural lathe mesh rebuilt as the candle burns down.
 *    Lighting = subsurface glow from the flame (the warm, translucent
 *    "lantern" look of real wax) + faint room fill + soft sheen.
 *  - Melt pool: a liquid wax basin forms in the first minutes, with a
 *    glossy surface that reflects the flame; the rim tunnels unevenly.
 *  - Drips: a few real wax runs overflow the rim over the session and
 *    harden on the side of the candle.
 *  - Flame: camera-facing procedural flame (blue base, dark inner zone,
 *    luminous yellow core, orange envelope) with natural, slow sway and
 *    occasional draughts — not a jittery flicker.
 *  - Table: dark walnut lit by the flame, including the candle's own
 *    shadow, which shrinks as the candle gets shorter.
 *
 * Public API (unchanged, used by app.js):
 *   initCandle3D(canvas), renderCandle3D(progress, time, isCeremony, totalSeconds),
 *   resetCandle3D(), resizeCandle3D(w, h), destroyCandle3D(), isCandleInitialized
 */

let candleScene, candleCamera, candleRenderer;
let isCandleInitialized = false;

const CANDLE3D = {
    // Dimensions (world units)
    R: 0.56,            // pillar radius
    H0: 2.35,           // fresh candle height
    HMIN: 0.10,         // a thin disc of wax is all that remains at 00:00
    LIP: 0.05,          // wall thickness of the rim around the melt pool
    POOL_DEPTH: 0.075,  // rim top -> liquid surface once the pool has formed
    WICK_LEN: 0.14,     // visible wick above the liquid
    SEGMENTS: 240,      // radial resolution of the wax body

    // Runtime
    waxGeo: null, waxMesh: null, waxMat: null,
    poolMesh: null, poolMat: null,
    wickGroup: null, wickTip: null,
    flameMesh: null, flameMat: null,
    coreGlow: null, airGlow: null,
    tableMesh: null, tableMat: null,
    shared: null,           // shared uniforms
    drips: [],
    built: null,
    outAt: null,            // wall-clock seconds when the flame went out
    smokeMesh: null, smokeMat: null,
    lastTime: 0,
    lastProgress: 0,
    camBase: { dist: 7, fov: 30 },
};

/* ════════════════════════════════════════════════════════════
   Small helpers
════════════════════════════════════════════════════════════ */

// Deterministic pseudo-random (stable shape between reloads/resets)
function candleRand(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

// 1D smooth value noise in [-1, 1] — used for organic flame motion
function candleNoise1D(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = candleRand(i) * 2 - 1;
    const b = candleRand(i + 1) * 2 - 1;
    return a + (b - a) * u;
}

const smooth01 = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
};

/* ════════════════════════════════════════════════════════════
   Shared GLSL
════════════════════════════════════════════════════════════ */

const CANDLE_GLSL_COMMON = `
    float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
            v += a * vnoise(p);
            p = p * 2.03 + vec2(17.1, 9.2);
            a *= 0.5;
        }
        return v;
    }
    vec3 acesFilm(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    // Linear HDR -> display, with dithering to kill banding in the dark gradients
    vec3 finalizeColor(vec3 c) {
        c = acesFilm(c);
        c = pow(c, vec3(1.0 / 2.2));
        c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
        return c;
    }
`;

const CANDLE_LIT_VERTEX = `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

const WAX_VERTEX = `
    attribute vec2 aDrip;     // x = drip coverage, y = still molten
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec2 vDrip;
    void main() {
        vDrip = aDrip;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

/* ── Wax body ── */
const WAX_FRAGMENT = `
    uniform vec3  uFlamePos;
    uniform float uFlameI;
    uniform float uTop;       // current rim height
    uniform float uLiquidY;   // liquid surface height
    uniform float uR;
    uniform float uRoom;      // room fill (eyes adjust once the flame is out)
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec2 vDrip;
    ${CANDLE_GLSL_COMMON}

    void main() {
        vec3 P = vWorldPos;
        vec3 N = normalize(vWorldNormal);
        float drip = clamp(vDrip.x, 0.0, 1.0);
        float molten = clamp(vDrip.y, 0.0, 1.0);
        vec3 V = normalize(cameraPosition - P);
        vec3 Lv = uFlamePos - P;
        float dist = length(Lv);
        vec3 L = Lv / dist;

        float radial = length(P.xz);
        float angle = atan(P.z, P.x);

        // Ivory wax albedo with very soft, hand-poured mottling
        float mott = fbm(vec2(angle * 3.0, P.y * 2.2)) * 0.6 + fbm(vec2(angle * 14.0, P.y * 9.0)) * 0.4;
        vec3 albedo = vec3(0.93, 0.86, 0.74) * (0.94 + 0.08 * mott);

        vec3 flameCol = vec3(1.0, 0.62, 0.30);

        // ── 1. Direct flame light: only the rim lip / top can see the flame ──
        float seesFlame = smoothstep(uTop - 0.06, uTop - 0.005, P.y) * step(radial, uR + 0.02);
        // Inner walls of the basin face the flame
        float ndl = clamp((dot(N, L) + 0.25) / 1.25, 0.0, 1.0);
        float atten = uFlameI / (1.0 + dist * dist * 6.0);
        vec3 direct = albedo * flameCol * ndl * atten * seesFlame * 2.4;

        // ── 2. Subsurface scattering: light travelling down through the wax ──
        float below = max(uTop - P.y, 0.0);
        float thinRim = smoothstep(uR * 0.7, uR, radial);           // outer shell is brighter
        float sssNear = exp(-below / 0.11);
        float sssMid  = exp(-below / 0.38);
        float sssFar  = exp(-below / 1.10);
        vec3 sssHot   = vec3(1.0, 0.70, 0.40);
        vec3 sssWarm  = vec3(1.0, 0.42, 0.14);
        vec3 sssDeep  = vec3(0.60, 0.17, 0.05);
        vec3 sss = sssHot * sssNear * 1.15 + sssWarm * sssMid * 0.24 + sssDeep * sssFar * 0.035;
        // Light escapes more easily where the wall is seen edge-on and through thin drips
        float NdV = max(dot(N, V), 0.0);
        float edge = pow(1.0 - NdV, 2.0);
        sss *= uFlameI * (0.6 + 0.4 * thinRim) * (0.7 + 0.8 * edge) * (1.0 + drip * 0.55);

        // ── 3. Soft room key/fill: gives the cylinder its form in the dark ──
        vec3 keyDir = normalize(vec3(-0.65, 0.45, 0.62));
        float key = clamp((dot(N, keyDir) + 0.15) / 1.15, 0.0, 1.0);
        key = key * key;
        vec3 ambient = albedo * (vec3(0.105, 0.092, 0.080) * key + vec3(0.012, 0.010, 0.009)) * uRoom;

        // Warm bounce from the lit table
        float bounce = clamp(-N.y * 0.5 + 0.5, 0.0, 1.0) * exp(-P.y * 1.4);
        ambient += albedo * vec3(0.05, 0.025, 0.012) * bounce * uFlameI * 0.3;

        // ── 4. Satin sheen; molten drips are wet and glossy ──
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 38.0) * atten * seesFlame * 1.4;
        vec3 Hk = normalize(keyDir + V);
        float gloss = mix(22.0, 90.0, molten);
        float sheen = pow(max(dot(N, Hk), 0.0), gloss) * mix(0.05, 0.45, molten) * (0.4 + 0.6 * drip);
        sheen += pow(max(dot(N, Hk), 0.0), 16.0) * 0.03;
        float fres = pow(1.0 - NdV, 4.0);
        vec3 rimGlow = vec3(1.0, 0.55, 0.25) * fres * sssMid * 0.35 * uFlameI;
        // Molten wax is a touch more yellow and translucent
        vec3 moltenTint = vec3(1.0, 0.68, 0.32) * molten * drip * (0.10 + 0.5 * sssMid) * uFlameI;

        vec3 col = direct + sss + ambient + flameCol * spec + vec3(1.0, 0.92, 0.82) * sheen + rimGlow + moltenTint;

        // Contact darkening where the candle meets the table
        // (only on the candle wall itself, not on wax puddled on the table)
        float onWall = 1.0 - smoothstep(uR - 0.01, uR + 0.03, radial);
        col *= mix(1.0, mix(0.6, 1.0, smoothstep(0.0, 0.08, P.y)), onWall);
        // Wax puddled on the table glows faintly from the light inside the candle
        float puddle = (1.0 - onWall) * (1.0 - smoothstep(0.0, 0.06, P.y));
        col += albedo * vec3(1.0, 0.5, 0.2) * puddle * (0.05 + 0.25 * sssFar) * uFlameI;

        gl_FragColor = vec4(finalizeColor(col), 1.0);
    }
`;

/* ── Liquid melt pool ── */
const POOL_FRAGMENT = `
    uniform vec3  uFlamePos;
    uniform float uFlameI;
    uniform float uPoolR;
    uniform float uTime;
    uniform float uRoom;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    ${CANDLE_GLSL_COMMON}

    void main() {
        vec3 P = vWorldPos;
        vec3 V = normalize(cameraPosition - P);
        float r = length(P.xz) / uPoolR;

        // Gentle convection ripples in the liquid
        vec2 q = P.xz * 9.0;
        float rip = fbm(q + vec2(uTime * 0.25, -uTime * 0.18)) - 0.5;
        vec3 N = normalize(vec3(rip * 0.08, 1.0, rip * 0.06));

        vec3 Lv = uFlamePos - P;
        float dist = length(Lv);
        vec3 L = Lv / dist;

        // Molten wax is clear-ish and glows from the flame above it
        vec3 body = vec3(1.0, 0.56, 0.20) * (0.55 + 0.45 * (1.0 - r * r)) * uFlameI * 0.85;
        // Room light on the wax (what remains visible once the flame is out)
        body += vec3(0.93, 0.86, 0.74) * 0.075 * uRoom;
        // Darker meniscus where the liquid meets the solid wall
        body *= mix(1.0, 0.55, smoothstep(0.82, 1.0, r));

        // Mirror reflection of the flame
        vec3 Rv = reflect(-V, N);
        float refl = pow(max(dot(Rv, L), 0.0), 140.0) * 3.5 + pow(max(dot(Rv, L), 0.0), 18.0) * 0.35;
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 col = body * (1.0 - fres * 0.5) + vec3(1.0, 0.78, 0.45) * refl * uFlameI * (0.35 + fres);

        gl_FragColor = vec4(finalizeColor(col), 1.0);
    }
`;

/* ── Table ── */
const TABLE_FRAGMENT = `
    uniform vec3  uFlamePos;
    uniform float uFlameI;
    uniform float uTop;
    uniform float uR;
    uniform float uRoom;
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    ${CANDLE_GLSL_COMMON}

    void main() {
        vec3 P = vWorldPos;
        float d = length(P.xz);

        // Dark oiled walnut: long grain running away from the viewer
        float grain = fbm(vec2(P.x * 7.0 + fbm(P.xz * 0.8) * 2.0, P.z * 0.35));
        float fine  = vnoise(vec2(P.x * 60.0, P.z * 2.0));
        vec3 wood = mix(vec3(0.050, 0.030, 0.018), vec3(0.105, 0.064, 0.036), grain);
        wood *= 0.9 + 0.12 * fine;

        // Flame light, occluded by the candle body (shadow shrinks as it burns)
        float hf = uFlamePos.y;
        float shadowR = uR * hf / max(hf - uTop, 0.06);
        float pen = 0.18 * shadowR + 0.12;
        float lit = smoothstep(shadowR - pen * 0.35, shadowR + pen, d);
        // A little light leaks through the translucent wax into the shadow
        lit = max(lit, 0.10 * exp(-max(d - uR, 0.0) * 1.5));

        vec3 Lv = uFlamePos - P;
        float dist = length(Lv);
        float E = uFlameI * hf / (dist * dist * dist + 0.2);
        vec3 light = vec3(1.0, 0.58, 0.28) * E * lit * 3.2;

        // Faint room fill that falls off into darkness (no visible horizon)
        float fall = exp(-d * 0.35);
        vec3 ambient = vec3(0.05, 0.043, 0.038) * fall * uRoom;

        // Contact shadow at the base of the candle
        float ao = mix(0.25, 1.0, smoothstep(uR * 0.98, uR + 0.35, d));

        vec3 col = wood * (light + ambient) * ao;

        // Satin top-coat: a soft, blurred sheen of the flame on the table
        vec3 V = normalize(cameraPosition - P);
        vec3 Rv = reflect(-V, vec3(0.0, 1.0, 0.0));
        float sheen = pow(max(dot(Rv, normalize(Lv)), 0.0), 24.0) * lit;
        col += vec3(1.0, 0.6, 0.3) * sheen * E * 0.6;

        // Fade to the room's darkness far from the candle
        col *= 1.0 - smoothstep(6.0, 14.0, d);

        gl_FragColor = vec4(finalizeColor(col), 1.0);
    }
`;

/* ── Flame (camera-facing, procedural) ── */
const FLAME_VERTEX = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const FLAME_FRAGMENT = `
    uniform float uTime;
    uniform float uSway;
    uniform float uStretch;
    uniform float uIntensity;
    varying vec2 vUv;
    ${CANDLE_GLSL_COMMON}

    void main() {
        float y = vUv.y;
        float x = (vUv.x - 0.5) * 2.0;

        // Lateral sway grows towards the tip; small turbulent wobble on top
        float turb = fbm(vec2(x * 1.3, y * 2.6 - uTime * 2.2)) - 0.5;
        x -= uSway * y * y * 1.6 + turb * 0.18 * y * y;

        // Teardrop profile (round base, tapering tip)
        float y0 = 0.10;
        float y1 = 0.97 * uStretch;
        float t = (y - y0) / (y1 - y0);
        float w = 0.74 * pow(clamp(t, 0.0, 1.0), 0.48) * pow(clamp(1.0 - t, 0.0, 1.0), 1.05);
        float d = abs(x) / max(w, 0.001);

        float inside = clamp(t, 0.0, 1.0) == t ? 1.0 : 0.0;
        float body = smoothstep(1.0, 0.45, d) * inside;

        // Luminous zone: brightest a third of the way up, white-yellow core
        float core = smoothstep(0.75, 0.0, d) * smoothstep(0.05, 0.30, t) * (1.0 - smoothstep(0.55, 0.92, t));

        // Non-luminous dark zone around the wick
        float dzT = t / 0.42;
        float dzW = 0.52 * pow(clamp(dzT, 0.0, 1.0), 0.55) * pow(clamp(1.0 - dzT, 0.0, 1.0), 0.9);
        float dark = smoothstep(1.0, 0.25, abs(x) / max(dzW, 0.001)) * step(0.0, dzT) * step(dzT, 1.0);

        vec3 cEdge = vec3(1.00, 0.42, 0.10);
        vec3 cMid  = vec3(1.00, 0.70, 0.30);
        vec3 cCore = vec3(1.00, 0.95, 0.80);
        vec3 col = mix(cEdge, cMid, smoothstep(1.0, 0.4, d));
        col = mix(col, cCore, core);
        // Tip cools to a deeper orange
        col = mix(col, vec3(0.95, 0.30, 0.06), smoothstep(0.6, 1.0, t));

        float lum = body * (0.55 + 0.9 * core);
        lum *= 1.0 - smoothstep(0.78, 1.0, t) * 0.75;   // soft tip
        lum *= 1.0 - dark * 0.72;
        col = mix(col, vec3(0.55, 0.35, 0.45), dark * 0.5);

        // Blue combustion cup at the base of the flame
        float cupT = (y - (y0 - 0.035)) / 0.16;
        float cupW = 0.48 * pow(clamp(cupT, 0.0, 1.0), 0.5);
        float cupD = abs(x) / max(cupW, 0.001);
        float cup = smoothstep(1.15, 0.75, cupD) * smoothstep(0.35, 0.9, cupD)
                  * smoothstep(0.0, 0.25, cupT) * (1.0 - smoothstep(0.55, 1.0, cupT));
        vec3 blue = vec3(0.18, 0.32, 1.0) * cup * 0.55;

        vec3 outC = (col * lum + blue) * uIntensity;
        gl_FragColor = vec4(outC, 1.0);
    }
`;

/* ── Soft glow billboard (bloom / air glow) ── */
const GLOW_FRAGMENT = `
    uniform vec3  uColor;
    uniform float uIntensity;
    uniform float uFalloff;
    varying vec2 vUv;
    ${CANDLE_GLSL_COMMON}

    void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        p.y *= 0.92;
        float r = length(p);
        float g = exp(-r * r * uFalloff) - exp(-uFalloff);
        g = max(g, 0.0) / (1.0 - exp(-uFalloff));
        vec3 c = uColor * g * uIntensity;
        c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0 * step(0.001, g);
        gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
`;

/* ── Smoke wisp after the flame goes out ── */
const SMOKE_FRAGMENT = `
    uniform float uTime;
    uniform float uAge;
    uniform float uStrength;
    varying vec2 vUv;
    ${CANDLE_GLSL_COMMON}

    void main() {
        float y = vUv.y;
        float x = (vUv.x - 0.5) * 2.0;
        // The ribbon rises, curls and drifts as it climbs
        float c = sin(y * 6.0 - uTime * 1.1) * 0.10 * y
                + sin(y * 13.0 - uTime * 1.9 + 1.3) * 0.05 * y * y
                + (fbm(vec2(y * 2.5 - uTime * 0.45, 1.7)) - 0.5) * 0.9 * y * y;
        float w = 0.022 + 0.24 * y * y + 0.03 * exp(-uAge * 1.5);
        float d = abs(x - c) / w;
        float dens = exp(-d * d * 2.2);
        // Higher up it tears into filaments
        float n = fbm(vec2(x * 3.5 + c * 2.0, y * 5.0 - uTime * 0.9));
        dens *= mix(1.0, smoothstep(0.30, 0.75, n) * 1.4, smoothstep(0.12, 0.65, y));
        // Rising front during the first seconds, soft fade at the top
        float reach = min(1.05, 0.06 + uAge * 0.42);
        dens *= smoothstep(reach, reach - 0.18, y);
        dens *= (1.0 - smoothstep(0.55, 1.0, y)) * smoothstep(0.0, 0.025, y);
        float a = clamp(dens * uStrength, 0.0, 1.0);
        vec3 col = mix(vec3(0.58, 0.58, 0.62), vec3(0.42, 0.42, 0.46), y);
        gl_FragColor = vec4(col, a * 0.6);
    }
`;

/* ════════════════════════════════════════════════════════════
   Geometry: wax body (rebuilt as the candle burns)
════════════════════════════════════════════════════════════ */

const SIDE_ROWS = 110;
const LIP_ROWS = 12;
const INNER_ROWS = 6;
const FLOOR_ROWS = 8;
const PROFILE_ROWS = SIDE_ROWS + LIP_ROWS + INNER_ROWS + FLOOR_ROWS;

function createWaxGeometry() {
    const S = CANDLE3D.SEGMENTS;
    const count = S * PROFILE_ROWS;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aDrip', new THREE.BufferAttribute(new Float32Array(count * 2), 2));

    const idx = [];
    for (let k = 0; k < PROFILE_ROWS - 1; k++) {
        for (let j = 0; j < S; j++) {
            const j2 = (j + 1) % S;
            const a = k * S + j;
            const b = k * S + j2;
            const c = (k + 1) * S + j;
            const d = (k + 1) * S + j2;
            idx.push(a, c, b, b, c, d);
        }
    }
    geo.setIndex(idx);
    return geo;
}

// Rim height around the circumference: uneven tunnelling + notches where wax overflowed
function rimHeight(theta, H, poolForm, progress) {
    const amp = 0.006 + 0.03 * poolForm * (0.4 + 0.6 * Math.min(1, progress * 3));
    let h = H
        + amp * (0.55 * Math.sin(3 * theta + 1.3) + 0.3 * Math.sin(5 * theta + 0.2) + 0.15 * Math.sin(9 * theta + 2.1));
    for (const d of CANDLE3D.drips) {
        if (!d.active) continue;
        let dt = Math.atan2(Math.sin(theta - d.theta), Math.cos(theta - d.theta));
        h -= d.notch * Math.exp(-(dt * dt) / 0.012);
    }
    return h;
}

// Extra radius contributed by hardened / flowing drips at (theta, y).
// Also reports how much of the point is drip wax and whether it is still molten.
const dripSample = { bulge: 0, cover: 0, molten: 0 };
let columnDrips = [];
function dripBulge(theta, y, rimY) {
    let bulge = 0, cover = 0, molten = 0;
    for (let n = 0; n < columnDrips.length; n++) {
        const d = columnDrips[n];
        const top = Math.min(d.startY, rimY);
        const bottom = Math.max(d.startY - d.curLen, 0);
        if (y > top + 0.03 || bottom > top) continue;

        // Drips meander slightly as they run down
        const center = d.theta + 0.03 * Math.sin((d.startY - y) * 5.0 + d.seed * 10)
            + 0.012 * Math.sin((d.startY - y) * 13.0 + d.seed * 4);
        const dt = Math.atan2(Math.sin(theta - center), Math.cos(theta - center));
        if (Math.abs(dt) > 0.5) continue;

        // Rounded bead at the leading end (flattens out once it reaches the table)
        const landed = bottom <= 0.001;
        const capR = landed ? 0.001 : d.bulb;
        let along = 1;
        if (!landed && y < bottom + capR) {
            const u = (bottom + capR - y) / capR;
            if (u >= 1) continue;
            along = Math.sqrt(1 - u * u);
        }
        // Thin ribbon that swells into the bead; wider again where it leaves the rim
        const nearBulb = landed ? 0 : Math.exp(-Math.pow((y - (bottom + capR)) / (capR * 2.0), 2));
        const nearTop = Math.exp(-Math.pow((top - y) / 0.09, 2));
        const halfW = (d.width * (1 + 0.9 * nearBulb + 0.6 * nearTop)) / CANDLE3D.R;
        const u = dt / halfW;
        if (Math.abs(u) >= 1) continue;
        const across = Math.pow(1 - u * u, 0.9);
        const thick = d.thick * (0.75 + 0.75 * nearBulb);
        const topFade = 0.45 + 0.55 * smooth01(top + 0.03, top - 0.06, y);
        const b = thick * across * along * topFade;
        if (b > bulge) {
            bulge = b;
            // the bead itself stays liquid a little longer than the ribbon
            molten = d.molten * (0.6 + 0.4 * nearBulb);
        }
        cover = Math.max(cover, across * along);
    }
    dripSample.bulge = bulge;
    dripSample.cover = cover;
    dripSample.molten = molten;
    return bulge;
}

function rebuildWax(H, poolForm, progress) {
    const S = CANDLE3D.SEGMENTS;
    const R = CANDLE3D.R;
    const geo = CANDLE3D.waxGeo;
    const pos = geo.attributes.position.array;
    const nrm = geo.attributes.normal.array;
    const drp = geo.attributes.aDrip.array;

    const lip = CANDLE3D.LIP;
    const depth = CANDLE3D.POOL_DEPTH * poolForm;
    const innerR = R - lip;

    for (let j = 0; j < S; j++) {
        const theta = (j / S) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);
        const rimY = rimHeight(theta, H, poolForm, progress);
        // Only drips close to this column can affect it
        columnDrips = [];
        for (const d of CANDLE3D.drips) {
            if (!d.active) continue;
            const dt = Math.atan2(Math.sin(theta - d.theta), Math.cos(theta - d.theta));
            if (Math.abs(dt) < 0.4) columnDrips.push(d);
        }
        // Hand-poured surface: tiny radial waviness
        const wav = 0.0025 * Math.sin(7 * theta + 0.5) + 0.0015 * Math.sin(13 * theta + 2.0);

        let k = 0;
        const lipRad = Math.max(lip * 0.5, 0.012);
        const sideTop = rimY - lipRad * (poolForm > 0.02 ? 1.0 : 0.6);

        const put = (r, y, cover = 0, molten = 0) => {
            const o2 = (k * S + j) * 2;
            drp[o2] = cover;
            drp[o2 + 1] = molten;
            const o = (k * S + j) * 3;
            pos[o] = r * ct;
            pos[o + 1] = y;
            pos[o + 2] = r * st;
            k++;
        };

        // Side wall (with a tiny base bevel)
        for (let i = 0; i < SIDE_ROWS; i++) {
            const f = i / (SIDE_ROWS - 1);
            const y = f * sideTop;
            let r = R + wav * (0.6 + 0.4 * f);
            if (y < 0.02) r -= (0.02 - y) * 0.35;
            if (columnDrips.length) {
                r += dripBulge(theta, y, rimY);
                put(r, y, dripSample.cover, dripSample.molten);
            } else {
                put(r, y);
            }
        }

        // Rounded rim lip: from outer wall over the top to the inner wall
        const lipCx = R - lipRad;
        for (let i = 1; i <= LIP_ROWS; i++) {
            const a = (i / LIP_ROWS) * Math.PI;   // 0 → π
            const r = lipCx + lipRad * Math.cos(a) + wav;
            const y = sideTop + lipRad * Math.sin(a) * 1.0;
            put(Math.max(r, 0), y);
        }

        // Inner wall down to the liquid (collapses to nothing before the pool forms)
        const innerTop = sideTop;
        const floorY = Math.max(rimY - depth - 0.015, 0.02);
        const innerStartR = lipCx - lipRad;
        for (let i = 1; i <= INNER_ROWS; i++) {
            const f = i / INNER_ROWS;
            const y = innerTop + (floorY - innerTop) * f;
            const r = innerStartR - 0.012 * Math.sin(f * Math.PI * 0.5) * poolForm;
            put(r, y);
        }

        // Basin floor to the centre (hidden under liquid once the pool forms)
        const floorStartR = innerStartR - 0.012 * poolForm;
        for (let i = 1; i <= FLOOR_ROWS; i++) {
            const f = i / FLOOR_ROWS;
            const r = floorStartR * (1 - f);
            const y = floorY - 0.01 * poolForm * Math.sin(f * Math.PI * 0.5);
            put(r, y);
        }
    }

    // Normals by central differences on the (row, column) grid
    const P = (k, j) => (k * S + ((j + S) % S)) * 3;
    for (let k = 0; k < PROFILE_ROWS; k++) {
        const k0 = Math.max(0, k - 1);
        const k1 = Math.min(PROFILE_ROWS - 1, k + 1);
        for (let j = 0; j < S; j++) {
            const a = P(k1, j), b = P(k0, j);
            const c = P(k, j + 1), d = P(k, j - 1);
            const tx = pos[a] - pos[b], ty = pos[a + 1] - pos[b + 1], tz = pos[a + 2] - pos[b + 2];
            const ux = pos[c] - pos[d], uy = pos[c + 1] - pos[d + 1], uz = pos[c + 2] - pos[d + 2];
            // n = u × t  (outward for a counter-clockwise lathe)
            let nx = uy * tz - uz * ty;
            let ny = uz * tx - ux * tz;
            let nz = ux * ty - uy * tx;
            let len = Math.hypot(nx, ny, nz);
            const o = (k * S + j) * 3;
            if (len < 1e-9 || k === PROFILE_ROWS - 1) {
                nx = 0; ny = 1; nz = 0; len = 1;
            }
            nrm[o] = nx / len;
            nrm[o + 1] = ny / len;
            nrm[o + 2] = nz / len;
        }
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.aDrip.needsUpdate = true;
    geo.computeBoundingSphere();
}

/* ════════════════════════════════════════════════════════════
   Drips
════════════════════════════════════════════════════════════ */

function setupDrips() {
    // Art-directed set spread over the session: most sit on the visible half
    // or on the silhouette edges (front of the candle is theta = PI/2).
    // `len` is a fraction of the candle height left when the drip starts, so
    // some runs make it all the way down to the table and pool there.
    const specs = [
        { at: 0.06, theta: 1.98, len: 0.42, width: 0.034, thick: 0.026 },
        { at: 0.14, theta: 1.05, len: 0.20, width: 0.028, thick: 0.022 },
        { at: 0.22, theta: 2.80, len: 1.00, width: 0.036, thick: 0.028 },
        { at: 0.31, theta: 1.48, len: 0.55, width: 0.032, thick: 0.026 },
        { at: 0.40, theta: 0.30, len: 1.00, width: 0.034, thick: 0.026 },
        { at: 0.49, theta: 2.30, len: 0.30, width: 0.028, thick: 0.022 },
        { at: 0.58, theta: 1.70, len: 1.00, width: 0.036, thick: 0.028 },
        { at: 0.67, theta: 0.78, len: 0.45, width: 0.030, thick: 0.024 },
        { at: 0.76, theta: 2.55, len: 1.00, width: 0.032, thick: 0.026 },
        { at: 0.85, theta: 1.25, len: 0.60, width: 0.030, thick: 0.024 },
    ];
    CANDLE3D.drips = specs.map((s, i) => ({
        triggerAt: s.at,
        theta: s.theta,
        lenFrac: s.len,
        width: s.width,
        thick: s.thick,
        bulb: 0.03 + s.width * 0.5,
        notch: 0.026,
        seed: candleRand(i + 3),
        active: false,
        startY: 0,
        maxLen: 0,
        curLen: 0,
        molten: 0,
        pool: 0,
    }));
}

function updateDrips(progress, H, totalSeconds) {
    // A drip runs over ~10–35 real seconds, then cools and hardens.
    const runSec = Math.max(10, Math.min(35, totalSeconds * 0.02));
    const coolSec = runSec * 2.5;
    for (const d of CANDLE3D.drips) {
        if (progress < d.triggerAt) {
            d.active = false;
            d.curLen = 0;
            d.molten = 0;
            d.pool = 0;
            continue;
        }
        d.startY = candleHeightAt(d.triggerAt) - 0.01;
        d.maxLen = d.startY * d.lenFrac;
        const since = (progress - d.triggerAt) * totalSeconds;
        const f = Math.min(1, since / runSec);
        // Quick at first, slowing as the wax cools on the way down
        d.curLen = d.maxLen * (1 - Math.pow(1 - f, 1.8));
        d.molten = 1 - smooth01(runSec * 0.5, runSec + coolSec, since);
        d.pool = d.lenFrac >= 1 ? smooth01(runSec * 0.85, runSec * 1.6, since) : 0;
        // Once the candle has burnt below the bottom of the drip, it is gone
        d.active = H > d.startY - d.curLen + 0.005;
    }
}

// Wax that ran all the way down spreads into a small hardened puddle at the base
function createPuddles() {
    CANDLE3D.puddles = [];
    // Low spherical cap: meets the table at a shallow angle like real spilled wax
    const cap = 0.7;
    const geo = new THREE.SphereGeometry(1, 48, 8, 0, Math.PI * 2, 0, cap);
    geo.translate(0, -Math.cos(cap), 0);
    geo.scale(1 / Math.sin(cap), 1 / (1 - Math.cos(cap)), 1 / Math.sin(cap));
    for (const d of CANDLE3D.drips) {
        if (d.lenFrac < 1) continue;
        const m = new THREE.Mesh(geo, CANDLE3D.waxMat);
        const r = CANDLE3D.R - 0.015;
        m.position.set(Math.cos(d.theta) * r, 0, Math.sin(d.theta) * r);
        m.rotation.y = -d.theta - Math.PI / 2;
        m.visible = false;
        candleScene.add(m);
        CANDLE3D.puddles.push({ mesh: m, drip: d });
    }
}

function updatePuddles() {
    for (const p of CANDLE3D.puddles || []) {
        const a = p.drip.pool;
        p.mesh.visible = p.drip.triggerAt <= CANDLE3D.lastProgress && a > 0.01;
        if (!p.mesh.visible) continue;
        p.mesh.scale.set(0.07 + 0.10 * a, 0.008 + 0.010 * a, 0.05 + 0.07 * a);
    }
}

function candleHeightAt(progress) {
    return CANDLE3D.H0 - (CANDLE3D.H0 - CANDLE3D.HMIN) * progress;
}

/* ════════════════════════════════════════════════════════════
   Init
════════════════════════════════════════════════════════════ */

function makeBillboard(width, height, material, anchorBottom) {
    const geo = new THREE.PlaneGeometry(width, height);
    if (anchorBottom) geo.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    return mesh;
}

function makeGlow(size, color, intensity, falloff) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uIntensity: { value: intensity },
            uFalloff: { value: falloff },
        },
        vertexShader: FLAME_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
    });
    const m = makeBillboard(size, size, mat, false);
    m.renderOrder = 10;
    return m;
}

function initCandle3D(canvas) {
    if (!canvas) canvas = document.getElementById('candle-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    if (isCandleInitialized) {
        resetCandle3D();
        return;
    }

    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;

    candleRenderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true, // required for the PiP capture stream
        powerPreference: 'high-performance',
    });
    candleRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    candleRenderer.setSize(width, height, false);
    candleRenderer.setClearColor(0x000000, 1);

    candleScene = new THREE.Scene();
    candleCamera = new THREE.PerspectiveCamera(CANDLE3D.camBase.fov, width / height, 0.1, 60);

    const shared = {
        uFlamePos: { value: new THREE.Vector3(0, CANDLE3D.H0 + 0.2, 0) },
        uFlameI: { value: 1.0 },
        uTop: { value: CANDLE3D.H0 },
        uLiquidY: { value: CANDLE3D.H0 },
        uR: { value: CANDLE3D.R },
        uRoom: { value: 1.0 },
        uTime: { value: 0 },
    };
    CANDLE3D.shared = shared;

    // ── Table ──
    CANDLE3D.tableMat = new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: CANDLE_LIT_VERTEX,
        fragmentShader: TABLE_FRAGMENT,
    });
    const tableGeo = new THREE.PlaneGeometry(40, 40, 1, 1);
    tableGeo.rotateX(-Math.PI / 2);
    CANDLE3D.tableMesh = new THREE.Mesh(tableGeo, CANDLE3D.tableMat);
    candleScene.add(CANDLE3D.tableMesh);

    // ── Wax body ──
    CANDLE3D.waxGeo = createWaxGeometry();
    CANDLE3D.waxMat = new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: WAX_VERTEX,
        fragmentShader: WAX_FRAGMENT,
    });
    CANDLE3D.waxMesh = new THREE.Mesh(CANDLE3D.waxGeo, CANDLE3D.waxMat);
    candleScene.add(CANDLE3D.waxMesh);

    // ── Liquid pool ──
    const poolR = CANDLE3D.R - CANDLE3D.LIP;
    CANDLE3D.poolMat = new THREE.ShaderMaterial({
        uniforms: Object.assign({ uPoolR: { value: poolR } }, shared),
        vertexShader: CANDLE_LIT_VERTEX,
        fragmentShader: POOL_FRAGMENT,
    });
    const poolGeo = new THREE.CircleGeometry(poolR + 0.004, 96);
    poolGeo.rotateX(-Math.PI / 2);
    CANDLE3D.poolMesh = new THREE.Mesh(poolGeo, CANDLE3D.poolMat);
    CANDLE3D.poolMesh.visible = false;
    candleScene.add(CANDLE3D.poolMesh);

    // ── Wick: slightly curled, charred, with a glowing ember tip ──
    CANDLE3D.wickGroup = new THREE.Group();
    const wickCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.06, 0),
        new THREE.Vector3(0.002, 0.05, 0),
        new THREE.Vector3(0.010, 0.11, 0.002),
        new THREE.Vector3(0.024, CANDLE3D.WICK_LEN, 0.004),
    ]);
    const wickGeo = new THREE.TubeGeometry(wickCurve, 24, 0.0105, 8, false);
    const wickMat = new THREE.MeshBasicMaterial({ color: 0x0b0806 });
    CANDLE3D.wickGroup.add(new THREE.Mesh(wickGeo, wickMat));
    const tipGeo = new THREE.SphereGeometry(0.012, 10, 8);
    CANDLE3D.wickTip = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
    CANDLE3D.wickTip.position.copy(wickCurve.getPoint(1));
    CANDLE3D.wickGroup.add(CANDLE3D.wickTip);
    candleScene.add(CANDLE3D.wickGroup);

    // ── Flame ──
    CANDLE3D.flameMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSway: { value: 0 },
            uStretch: { value: 1 },
            uIntensity: { value: 1 },
        },
        vertexShader: FLAME_VERTEX,
        fragmentShader: FLAME_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    CANDLE3D.flameMesh = makeBillboard(0.30, 0.66, CANDLE3D.flameMat, true);
    CANDLE3D.flameMesh.renderOrder = 5;
    candleScene.add(CANDLE3D.flameMesh);

    // ── Bloom-like glows ──
    CANDLE3D.coreGlow = makeGlow(0.9, 0xffb060, 0.55, 7.0);
    CANDLE3D.airGlow = makeGlow(5.2, 0xff8a3a, 0.16, 4.5);
    candleScene.add(CANDLE3D.airGlow);
    candleScene.add(CANDLE3D.coreGlow);

    // ── Smoke wisp (shown once the flame goes out) ──
    CANDLE3D.smokeMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uAge: { value: 0 }, uStrength: { value: 0 } },
        vertexShader: FLAME_VERTEX,
        fragmentShader: SMOKE_FRAGMENT,
        transparent: true,
        depthWrite: false,
    });
    CANDLE3D.smokeMesh = makeBillboard(1.0, 2.6, CANDLE3D.smokeMat, true);
    CANDLE3D.smokeMesh.renderOrder = 6;
    CANDLE3D.smokeMesh.visible = false;
    candleScene.add(CANDLE3D.smokeMesh);

    setupDrips();
    createPuddles();

    window.addEventListener('resize', onWindowResizeCandle3D);
    resizeCandle3D(width, height);

    isCandleInitialized = true;
    window.isCandleInitialized = true;

    renderCandle3D(0, 0, false, 60);
}

/* ════════════════════════════════════════════════════════════
   Framing
════════════════════════════════════════════════════════════ */

function frameCamera(H, isCeremony, time) {
    const cam = candleCamera;
    const aspect = cam.aspect || 1;
    const fov = CANDLE3D.camBase.fov;
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));

    // Frame the fresh candle + flame + glow; follow it down only gently
    const contentH = CANDLE3D.H0 + 1.15;
    const contentW = 2.4;
    const distH = (contentH * 0.5) / tanV;
    const distW = (contentW * 0.5) / (tanV * aspect);
    const dist = Math.max(distH, distW) * (isCeremony ? 1.05 : 1.12);

    const fullMid = (CANDLE3D.H0 + 0.75) * 0.47;
    const curMid = (H + 0.75) * 0.47;
    const targetY = fullMid + (curMid - fullMid) * 0.6;

    // Slight high angle so the melt pool reads; imperceptible slow drift
    const elev = 0.17;
    const drift = Math.sin(time * 0.07) * 0.035;
    cam.position.set(
        Math.sin(drift) * dist,
        targetY + dist * Math.sin(elev),
        Math.cos(drift) * dist * Math.cos(elev)
    );
    cam.lookAt(0, targetY, 0);
}

/* ════════════════════════════════════════════════════════════
   Per-frame update
════════════════════════════════════════════════════════════ */

function renderCandle3D(progress = 0, time = 0, isCeremony = false, totalSeconds = 60) {
    if (!isCandleInitialized) {
        initCandle3D();
        if (!isCandleInitialized) return;
    }

    let p = Number(progress);
    if (!Number.isFinite(p)) p = 0;
    p = Math.max(0, Math.min(1, p));
    const t = Number.isFinite(Number(time)) ? Number(time) : 0;

    // Timer restarted → fresh candle
    if (p < 0.001 && CANDLE3D.lastProgress > 0.05) resetCandle3D();
    CANDLE3D.lastProgress = p;

    // ── Shape ──
    const H = candleHeightAt(p);
    // The melt pool forms over the first ~3 minutes (or 8% of a short session)
    const elapsed = p * Math.max(1, Number(totalSeconds) || 60);
    const poolForm = smooth01(0, 1, Math.max(Math.min(1, elapsed / 180), Math.min(1, p / 0.08)));

    updateDrips(p, H, Math.max(1, Number(totalSeconds) || 60));
    updatePuddles();

    // Rebuild the wax mesh only when the shape has changed visibly
    // (height by more than ~half a pixel, or a drip is flowing — at most ~8x/s)
    let dripKey = '';
    let flowing = false;
    for (const d of CANDLE3D.drips) {
        dripKey += d.active ? (d.curLen > 0 ? '1' : '0') + (d.pool > 0.01 ? 'p' : '') : '-';
        if (d.active && d.molten > 0.02) flowing = true;
    }
    const b = CANDLE3D.built;
    const needBuild = !b
        || Math.abs(b.H - H) > 0.003
        || Math.abs(b.poolForm - poolForm) > 0.01
        || b.dripKey !== dripKey
        || (flowing && Math.abs(t - b.time) > 0.12)
        || (!flowing && b.flowing);
    if (needBuild) {
        rebuildWax(H, poolForm, p);
        CANDLE3D.built = { H, poolForm, dripKey, flowing, time: t };
    }
    const builtH = CANDLE3D.built.H;

    const liquidY = builtH - CANDLE3D.POOL_DEPTH * CANDLE3D.built.poolForm;
    const poolVisible = poolForm > 0.04;
    CANDLE3D.poolMesh.visible = poolVisible;
    CANDLE3D.poolMesh.position.y = liquidY;

    const wickBase = poolVisible ? liquidY : builtH;
    CANDLE3D.wickGroup.position.y = wickBase;

    // ── Natural flame motion ──
    // A candle in still air barely flickers: slow sway, soft breathing,
    // and an occasional gentle draught.
    const draught = Math.pow(Math.max(0, candleNoise1D(t * 0.11 + 7.3)), 3) * 1.6;
    const sway = candleNoise1D(t * 0.55 + 1.7) * 0.05
        + candleNoise1D(t * 2.3 + 4.1) * 0.025 * (0.3 + draught)
        + candleNoise1D(t * 7.0 + 9.4) * 0.012 * draught;
    const stretch = 1.0 + candleNoise1D(t * 1.3 + 2.2) * 0.035 + candleNoise1D(t * 9.0) * 0.012 * (0.4 + draught);
    const flicker = 1.0 + candleNoise1D(t * 3.1 + 5.5) * 0.03 + candleNoise1D(t * 13.0 + 1.1) * 0.02 * (0.3 + draught);
    const ignite = smooth01(0, 1, Math.min(1, t / 1.2 + 0.0001)); // soft fade-in on first frames

    // ── End of the session: the flame gutters, then goes out at exactly 00:00 ──
    const total = Math.max(1, Number(totalSeconds) || 60);
    const remaining = (1 - p) * total;
    const gutterSec = Math.min(20, total * 0.08);
    const gutter = 1 - smooth01(0, gutterSec, remaining);           // 0 → 1 over the last seconds
    const nowS = performance.now() / 1000;
    if (p >= 1) { if (CANDLE3D.outAt === null) CANDLE3D.outAt = nowS; }
    else CANDLE3D.outAt = null;
    const isOut = CANDLE3D.outAt !== null;
    const sinceOut = isOut ? nowS - CANDLE3D.outAt : 0;
    // Flame shrinks and sputters while guttering, collapsing in the final second
    const sputter = 1 + candleNoise1D(t * 11.0 + 3.3) * 0.35 * gutter;
    const life = isOut ? 0 : Math.max(0, (1 - 0.6 * Math.pow(gutter, 1.4)) * smooth01(0, 1.1, remaining) * sputter);
    const intensity = flicker * (0.92 + 0.08 * poolForm) * Math.min(1, life);

    const flameBase = wickBase + 0.02;
    const shared = CANDLE3D.shared;
    shared.uTime.value = t;
    shared.uTop.value = builtH;
    shared.uLiquidY.value = liquidY;
    shared.uFlameI.value = intensity * (0.85 + 0.15 * ignite);
    shared.uFlamePos.value.set(sway * 0.35, flameBase + 0.2 * stretch * Math.max(0.3, life), 0);
    // Once the light is gone the eyes adjust a little to the dark room
    shared.uRoom.value = 1.0 + 0.8 * smooth01(0, 4, sinceOut) * (isOut ? 1 : 0);

    const fm = CANDLE3D.flameMat.uniforms;
    fm.uTime.value = t;
    fm.uSway.value = sway;
    fm.uStretch.value = stretch;
    fm.uIntensity.value = 1.35 * flicker * Math.min(1, 0.4 + 0.6 * life);

    // ── Camera & billboards ──
    frameCamera(H, isCeremony, t);

    const camYaw = Math.atan2(candleCamera.position.x, candleCamera.position.z);
    CANDLE3D.flameMesh.position.set(0, flameBase, 0);
    CANDLE3D.flameMesh.visible = life > 0.01;
    const fs = Math.max(0.001, Math.min(1, life));
    CANDLE3D.flameMesh.scale.set(0.75 + 0.25 * fs, fs, 1);
    CANDLE3D.flameMesh.rotation.set(0, camYaw, 0);
    // Pivot the flame from its base so sway reads as the flame leaning, not sliding
    CANDLE3D.flameMesh.rotation.z = 0;

    const glowCenter = new THREE.Vector3(sway * 0.3, flameBase + 0.24 * stretch, 0);
    CANDLE3D.coreGlow.position.copy(glowCenter);
    CANDLE3D.coreGlow.quaternion.copy(candleCamera.quaternion);
    // After it goes out, the core glow becomes the dying ember on the wick
    const ember = isOut ? Math.exp(-sinceOut / 2.5) : 0;
    const wickTipY = wickBase + CANDLE3D.WICK_LEN;
    if (isOut) {
        CANDLE3D.coreGlow.position.set(0.024, wickTipY, 0.004);
        CANDLE3D.coreGlow.scale.setScalar(0.22);
    } else {
        CANDLE3D.coreGlow.scale.setScalar(1);
    }
    CANDLE3D.coreGlow.visible = isOut ? ember > 0.02 : true;
    CANDLE3D.coreGlow.material.uniforms.uIntensity.value = isOut ? 0.9 * ember : 0.5 * flicker * Math.min(1, life);
    CANDLE3D.airGlow.position.set(0, flameBase + 0.1, -0.4);
    CANDLE3D.airGlow.quaternion.copy(candleCamera.quaternion);
    CANDLE3D.airGlow.material.uniforms.uIntensity.value = 0.15 * flicker * Math.min(1, life);
    CANDLE3D.airGlow.visible = !isOut;

    if (isOut) {
        // Glowing ember cools to charcoal
        CANDLE3D.wickTip.material.color.setRGB(0.08 + 0.92 * ember, 0.05 + 0.33 * ember, 0.04 + 0.06 * ember);
    } else {
        CANDLE3D.wickTip.material.color.setRGB(1.0, 0.42 + 0.08 * flicker, 0.14);
    }

    // Smoke wisp curling up from the wick once the flame is out
    CANDLE3D.smokeMesh.visible = isOut;
    if (isOut) {
        CANDLE3D.smokeMesh.position.set(0.024, wickTipY - 0.01, 0.004);
        CANDLE3D.smokeMesh.rotation.set(0, camYaw, 0);
        const su = CANDLE3D.smokeMat.uniforms;
        su.uTime.value = nowS;
        su.uAge.value = sinceOut;
        // a thick first plume that thins to a lingering thread
        su.uStrength.value = smooth01(0, 0.25, sinceOut) * (0.3 + 0.9 * Math.exp(-sinceOut / 5));
    }

    CANDLE3D.lastTime = t;
    candleRenderer.render(candleScene, candleCamera);
}

/* ════════════════════════════════════════════════════════════
   Lifecycle
════════════════════════════════════════════════════════════ */

function resetCandle3D() {
    CANDLE3D.lastProgress = 0;
    CANDLE3D.outAt = null;
    CANDLE3D.lastTime = 0;
    CANDLE3D.built = null;
    for (const d of CANDLE3D.drips) {
        d.active = false;
        d.curLen = 0;
        d.molten = 0;
        d.pool = 0;
    }
    for (const p of CANDLE3D.puddles || []) p.mesh.visible = false;
}

function resizeCandle3D(width, height) {
    if (!candleRenderer || !candleCamera) return;
    const canvas = candleRenderer.domElement;
    const w = width || canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    const h = height || canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
    if (!w || !h || w <= 0 || h <= 0) return;
    candleCamera.aspect = w / h;
    candleCamera.updateProjectionMatrix();
    candleRenderer.setSize(w, h, false);
}

function onWindowResizeCandle3D() {
    resizeCandle3D();
}

function destroyCandle3D() {
    window.removeEventListener('resize', onWindowResizeCandle3D);
    if (candleScene) {
        candleScene.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
    if (candleRenderer) {
        candleRenderer.dispose();
        candleRenderer = null;
    }
    candleScene = null;
    candleCamera = null;
    CANDLE3D.built = null;
    isCandleInitialized = false;
    window.isCandleInitialized = false;
}

// Window globals (consumed by app.js)
window.initCandle3D = initCandle3D;
window.renderCandle3D = renderCandle3D;
window.resetCandle3D = resetCandle3D;
window.destroyCandle3D = destroyCandle3D;
window.resizeCandle3D = resizeCandle3D;
window.isCandleInitialized = isCandleInitialized;
