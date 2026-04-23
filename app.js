/* ══════════════════════════════════════════════════════════
   VibeFocus — app.js v2
   Screen transitions · Canvas animations · Web Audio · Confetti
══════════════════════════════════════════════════════════ */

'use strict';

/* ── Mobile detection & adaptive quality ──────────────── */
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
               || window.innerWidth <= 768;
// Cap DPR to 1.5 on mobile to halve pixel fill cost
const RENDER_DPR = IS_MOBILE ? Math.min(window.devicePixelRatio || 1, 1.5)
                             : (window.devicePixelRatio || 1);
// Target 30fps on mobile (≈33ms), 60fps on desktop
const TARGET_FRAME_MS = IS_MOBILE ? 33 : 0;
let   _lastFocusFrame = 0;

/* ── State ─────────────────────────────────────────────── */
const state = {
  vibe:         null,
  minutes:      null,
  totalSeconds: 0,
  startTime:    null,
  rafId:        null,
  soundOn:      true,     // Default: ON
  audioCtx:     null,
  audioNodes:   {},
  hudTimer:     null,
  confettiParts:[],
  confettiRaf:  null,
};

/* ── DOM ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const screens   = { vibe: $('screen-vibe'), duration: $('screen-duration'), focus: $('screen-focus'), complete: $('screen-complete') };
const focusCanvas  = $('focus-canvas');
const focusCtx     = focusCanvas.getContext('2d');
const confCanvas   = $('confetti-canvas');
const confCtx      = confCanvas.getContext('2d');
const hud          = $('focus-hud');
const hudFill      = $('hud-progress-fill');
const hudTime      = $('hud-time-left');
const btnSound     = $('btn-sound');
const iconOn       = $('icon-sound-on');
const iconOff      = $('icon-sound-off');
const btnExit      = $('btn-exit-focus');
const btnStart     = $('btn-start');
const btnBack      = $('btn-back-vibe');
const btnRestart   = $('btn-restart');
const vibeLabel    = $('selected-vibe-label');
const completeStat = $('complete-time-display');
const fadeOverlay  = $('fade-overlay');

/* ══════════════════════════════════════════════════════════
   Screen Transition
══════════════════════════════════════════════════════════ */
function goTo(name, zoomExit = false) {
  // Pause preview loop when leaving vibe screen, resume when returning
  if (name !== 'vibe' && previewRaf) {
    cancelAnimationFrame(previewRaf);
    previewRaf = null;
  }
  if (name === 'vibe' && !previewRaf) {
    previewLastFrame = 0;
    previewRaf = requestAnimationFrame(animatePreviews);
  }

  return new Promise(resolve => {
    const current = Object.values(screens).find(s => s.classList.contains('active'));

    // Fade overlay to black
    fadeOverlay.classList.add('show');

    setTimeout(() => {
      if (current) {
        current.classList.remove('active');
        if (zoomExit) {
          current.classList.add('exit-zoom');
          setTimeout(() => current.classList.remove('exit-zoom'), 600);
        }
      }
      screens[name].classList.add('active');

      // Fade back in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fadeOverlay.classList.remove('show');
          resolve();
        });
      });
    }, 380);
  });
}

/* ══════════════════════════════════════════════════════════
   SCREEN 1 — Vibe Cards (Parallax hover)
══════════════════════════════════════════════════════════ */
const MAX_TILT = 12; // degrees

document.querySelectorAll('.vibe-card').forEach(card => {

  // 3D parallax on mouse move
  card.addEventListener('mousemove', e => {
    const rect   = card.getBoundingClientRect();
    const cx     = rect.left + rect.width  / 2;
    const cy     = rect.top  + rect.height / 2;
    const dx     = (e.clientX - cx) / (rect.width  / 2);
    const dy     = (e.clientY - cy) / (rect.height / 2);
    const rotX   = -dy * MAX_TILT;
    const rotY   =  dx * MAX_TILT;
    card.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.03)`;
    card.style.transition = 'transform 0.1s ease';
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
    card.style.transition = 'transform 0.55s cubic-bezier(0.22,1,0.36,1)';
  });

  card.addEventListener('click', () => {
    state.vibe = card.dataset.vibe;
    vibeLabel.textContent = card.querySelector('.vibe-name').textContent.toUpperCase();
    // Reset duration selection
    document.querySelectorAll('.dur-pill').forEach(p => p.classList.remove('selected'));
    state.minutes = null;
    btnStart.disabled = true;
    // GA4: track vibe selection
    if (typeof gtag === 'function') {
      gtag('event', 'vibe_selected', { vibe: state.vibe });
    }
    goTo('duration', true); // zoom exit
  });
});

/* ══════════════════════════════════════════════════════════
   SCREEN 2 — Duration Pills
══════════════════════════════════════════════════════════ */
document.querySelectorAll('.dur-pill').forEach(pill => {
  pill.addEventListener('click', (e) => {
    document.querySelectorAll('.dur-pill').forEach(p => p.classList.remove('selected'));
    pill.classList.add('selected');
    
    if (pill.id === 'dur-custom') {
      const input = document.getElementById('custom-minutes');
      state.minutes = parseInt(input.value, 10);
      if (e.target !== input) input.focus();
    } else {
      state.minutes = parseInt(pill.dataset.minutes, 10);
    }
    btnStart.disabled = false;
  });
});

const customInput = document.getElementById('custom-minutes');
if (customInput) {
  customInput.addEventListener('input', () => {
    let val = parseInt(customInput.value, 10);
    if(val > 100) { val = 100; customInput.value = 100; }
    if(val < 1) { val = 1; customInput.value = 1; }
    if(document.getElementById('dur-custom').classList.contains('selected')) {
      state.minutes = val;
    }
  });
}

btnBack.addEventListener('click', () => goTo('vibe'));

btnStart.addEventListener('click', () => {
  if (!state.minutes) return;
  state.totalSeconds = state.minutes * 60;
  state.startTime    = null;
  // GA4: track session start
  if (typeof gtag === 'function') {
    gtag('event', 'session_started', { vibe: state.vibe, duration_minutes: state.minutes });
  }
  launchFocus();
});

/* ══════════════════════════════════════════════════════════
   SCREEN 3 — Focus Session
══════════════════════════════════════════════════════════ */
async function launchFocus() {
  // Reset all physics simulation state
  leaves.length = 0;
  groundPile.length = 0;
  if (typeof WATER !== 'undefined') { WATER.initd = false; WATER.drops = []; WATER.ripples = []; WATER.splash = []; }
  if (typeof CANDLE !== 'undefined') { CANDLE.initd = false; CANDLE.smoke = []; CANDLE.embers = []; }
  if (typeof drawTree === 'function') {
    drawTree._motes    = null;
    drawTree._lastGust = -1;   // reset gust timer so first gust fires at t=50s
  }
  await goTo('focus');
  resizeFocusCanvas();
  tryFullscreen();

  if (state.soundOn) {
    startAmbient(state.vibe);
    syncSoundIcon();
  }

  state.startTime = performance.now();
  state.rafId     = requestAnimationFrame(tickFocus);
  showHud();
}

function tickFocus(now) {
  // Mobile frame throttle: skip frame if not enough time has passed
  if (IS_MOBILE && now - _lastFocusFrame < TARGET_FRAME_MS) {
    state.rafId = requestAnimationFrame(tickFocus);
    return;
  }
  _lastFocusFrame = now;

  const elapsed  = Math.min((now - state.startTime) / 1000, state.totalSeconds);
  const prog = elapsed / state.totalSeconds;

  // NOTE: resizeFocusCanvas() NOT called every frame — only on resize event

  // Draw
  drawVibe(focusCtx, focusCanvas.width / RENDER_DPR, focusCanvas.height / RENDER_DPR, prog, state.vibe, now / 1000);

  // HUD
  const remaining = Math.max(0, state.totalSeconds - elapsed);
  hudTime.textContent = fmt(remaining);
  hudFill.style.width = (prog * 100).toFixed(2) + '%';
  hudFill.setAttribute('aria-valuenow', Math.round(prog * 100));

  if (elapsed >= state.totalSeconds) {
    onSessionComplete();
    return;
  }

  state.rafId = requestAnimationFrame(tickFocus);
}

function onSessionComplete() {
  cancelAnimationFrame(state.rafId);
  state.rafId = null;
  stopAllSound();
  exitFullscreen();

  // GA4: track session completion
  if (typeof gtag === 'function') {
    gtag('event', 'session_completed', { vibe: state.vibe, duration_minutes: state.minutes });
  }

  completeStat.textContent = state.minutes + (state.minutes === 1 ? ' minute' : ' minutes');
  goTo('complete').then(() => {
    resizeConfettiCanvas();
    burstConfetti();
  });
}

function stopSession() {
  cancelAnimationFrame(state.rafId);
  state.rafId = null;
  stopAllSound();
  hud.classList.remove('visible');
  clearTimeout(state.hudTimer);
  exitFullscreen();
}

/* ── Exit ── */
btnExit.addEventListener('click', () => {
  stopSession();
  goTo('vibe');
});

/* ── Restart ── */
btnRestart.addEventListener('click', () => {
  cancelAnimationFrame(state.confettiRaf);
  state.confettiRaf = null;
  goTo('vibe');
});

/* ══════════════════════════════════════════════════════════
   Canvas resize
══════════════════════════════════════════════════════════ */
function resizeFocusCanvas() {
  const dpr = RENDER_DPR;
  const w   = window.innerWidth;
  const h   = window.innerHeight;
  if (focusCanvas.width !== Math.round(w * dpr) || focusCanvas.height !== Math.round(h * dpr)) {
    focusCanvas.width  = Math.round(w * dpr);
    focusCanvas.height = Math.round(h * dpr);
    focusCanvas.style.width  = w + 'px';
    focusCanvas.style.height = h + 'px';
    focusCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function resizeConfettiCanvas() {
  confCanvas.width  = window.innerWidth;
  confCanvas.height = window.innerHeight;
  confCanvas.style.width  = window.innerWidth  + 'px';
  confCanvas.style.height = window.innerHeight + 'px';
}

window.addEventListener('resize', () => {
  resizeFocusCanvas();
  if (screens.complete.classList.contains('active')) resizeConfettiCanvas();
});

/* ══════════════════════════════════════════════════════════
   HUD auto-hide
══════════════════════════════════════════════════════════ */
function showHud() {
  hud.classList.add('visible');
  clearTimeout(state.hudTimer);
  state.hudTimer = setTimeout(() => hud.classList.remove('visible'), 3500);
}

['mousemove','touchstart','click'].forEach(evt =>
  document.addEventListener(evt, () => {
    if (screens.focus.classList.contains('active')) showHud();
  }, {passive: true})
);

/* ══════════════════════════════════════════════════════════
   Draw dispatcher
══════════════════════════════════════════════════════════ */
function drawVibe(ctx, W, H, progress, vibe, time) {
  ctx.clearRect(0, 0, W, H);
  if (vibe === 'ice')    drawWaterBowl(ctx, W, H, progress, time);
  if (vibe === 'candle') drawCandle(ctx, W, H, progress, time);
  if (vibe === 'tree')   drawTree(ctx, W, H, progress, time);
}

/* ── helpers ── */
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sin   = Math.sin;
const cos   = Math.cos;
const PI    = Math.PI;

// Smooth-noise approximation (multi-oct sum-of-sines, non-repetitive feel)
function sn(x, seed = 0) {
  return sin(x * 1.0 + seed) * 0.40
       + sin(x * 2.3 + seed * 1.7) * 0.25
       + sin(x * 5.1 + seed * 3.1) * 0.18
       + sin(x * 9.7 + seed * 0.9) * 0.10
       + sin(x * 17.3+ seed * 5.3) * 0.07;
}

/* ══════════════════════════════════════════════════════════
   WATER BOWL — Hyperrealistic drip-fill simulation
   Replaces Ice Block mode
══════════════════════════════════════════════════════════ */

const WATER = {
  initd:   false,
  drops:   [],      // falling teardrop objects
  ripples: [],      // circular ripple rings on water surface
  splash:  [],      // upward splash particles on impact
  caustics:[],      // internal light blob patterns
  _lastDrop: -4,
  _nextInt:   1.8,  // seconds until next drop (randomized)
  _waveAmp:   0,    // surface wave amplitude after impact
  _waveTime:  0,    // timestamp of last impact
};

function waterReset() {
  WATER.initd    = true;
  WATER.drops    = [];
  WATER.ripples  = [];
  WATER.splash   = [];
  WATER._lastDrop = -4;
  WATER._nextInt  = 1.4 + Math.random() * 0.8;
  WATER._waveAmp  = 0;
  WATER._waveTime = 0;
  WATER.caustics  = Array.from({length: 9}, () => ({
    rx:    0.18 + Math.random() * 0.64,
    ry:    0.25 + Math.random() * 0.55,
    phase: Math.random() * PI * 2,
    speed: 0.25 + Math.random() * 0.75,
  }));
}

// Cached gradient keys to avoid recreating every frame
const _gradCache = {};
function cachedLinear(ctx, key, x0, y0, x1, y1, stops) {
  // Re-use gradient if canvas size hasn't changed
  if (_gradCache[key]) return _gradCache[key];
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  _gradCache[key] = g;
  return g;
}
// Invalidate cache on resize
window.addEventListener('resize', () => { Object.keys(_gradCache).forEach(k => delete _gradCache[k]); });

function drawWaterBowl(ctx, W, H, p, time) {
  const cx = W / 2;

  if (!WATER.initd) waterReset();

  // ── Background ──
  const bg = cachedLinear(ctx, 'wb_bg', 0, 0, 0, H, [[0,'#020510'],[0.6,'#03070f'],[1,'#010305']]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Soft downward spotlight — skip on mobile (expensive radial)
  if (!IS_MOBILE) {
    const spot = ctx.createRadialGradient(cx, H * 0.1, 10, cx, H * 0.35, H * 0.65);
    spot.addColorStop(0, 'rgba(90,150,220,0.11)');
    spot.addColorStop(0.5,'rgba(50,100,190,0.04)');
    spot.addColorStop(1, 'transparent');
    ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);
  }

  // ── Bowl geometry ──
  const isPreview = W < 300;
  const rimY   = isPreview ? H * 0.25 : H * 0.26;
  const bowlH  = clamp(Math.min(H * 0.44, 340), isPreview ? 80 : 170, 340);
  const baseY  = rimY + bowlH;
  const rimRx  = clamp(Math.min(W * 0.36, 238), isPreview ? 52 : 110, 238);
  const baseRx = rimRx * 0.34;
  const rimRy  = rimRx * 0.09;
  const wallT  = clamp(rimRx * 0.032, 4, 9);

  // Water fill
  const fillFrac = clamp(p, 0, 1);
  const waterH   = fillFrac * (bowlH - 6);
  const waterTopY = baseY - waterH;

  // ── Bowl interior clip path (used for water fill) ──
  function bowlInnerPath() {
    const ilx  = cx - rimRx + wallT;
    const irx  = cx + rimRx - wallT;
    const ibxL = cx - baseRx + wallT * 0.5;
    const ibxR = cx + baseRx - wallT * 0.5;
    ctx.beginPath();
    ctx.moveTo(ilx, rimY + rimRy * 0.7);
    ctx.bezierCurveTo(
      ilx - 7, rimY + bowlH * 0.38,
      ibxL - 4, baseY - 20,
      cx, baseY - 4
    );
    ctx.bezierCurveTo(
      ibxR + 4, baseY - 20,
      irx + 7, rimY + bowlH * 0.38,
      irx, rimY + rimRy * 0.7
    );
    ctx.ellipse(cx, rimY + rimRy * 0.7, rimRx - wallT, (rimRx - wallT) * 0.07, 0, 0, PI, false);
    ctx.closePath();
  }

  // ── Water fill ──
  if (fillFrac > 0.004) {
    ctx.save();
    bowlInnerPath();
    ctx.clip();

    // Water body gradient
    const wg = ctx.createLinearGradient(cx, waterTopY, cx, baseY);
    wg.addColorStop(0,    'rgba(72,158,238,0.62)');
    wg.addColorStop(0.3,  'rgba(42,122,215,0.73)');
    wg.addColorStop(0.65, 'rgba(20,85,188,0.83)');
    wg.addColorStop(1,    'rgba(10,52,148,0.93)');
    ctx.fillStyle = wg;
    ctx.fillRect(cx - rimRx, waterTopY - 4, rimRx * 2, waterH + 10);

    // Depth/edge darkening (side atmosphere)
    const ldg = ctx.createLinearGradient(cx - rimRx, 0, cx - rimRx * 0.55, 0);
    ldg.addColorStop(0, 'rgba(0,5,25,0.35)');
    ldg.addColorStop(1, 'transparent');
    ctx.fillStyle = ldg;
    ctx.fillRect(cx - rimRx, waterTopY, rimRx, waterH + 5);

    const rdg = ctx.createLinearGradient(cx + rimRx * 0.55, 0, cx + rimRx, 0);
    rdg.addColorStop(0, 'transparent');
    rdg.addColorStop(1, 'rgba(0,5,25,0.35)');
    ctx.fillStyle = rdg;
    ctx.fillRect(cx, waterTopY, rimRx, waterH + 5);

    // Caustic blobs (light rippling through water) — skip on mobile
    if (fillFrac > 0.08 && !isPreview && !IS_MOBILE) {
      WATER.caustics.forEach(c => {
        const cx2 = cx + (c.rx - 0.5) * rimRx * 1.35;
        const cy2 = waterTopY + c.ry * waterH;
        const r   = 7 + sin(time * c.speed + c.phase) * 4.5;
        const ca  = 0.020 + sin(time * c.speed * 0.65 + c.phase) * 0.012;
        const cg  = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r);
        cg.addColorStop(0, `rgba(175,228,255,${ca})`);
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, PI * 2); ctx.fill();
      });
    }

    ctx.restore();

    // ── Wavy water surface ──
    const waveDecay = clamp(1 - (time - WATER._waveTime) * 0.4, 0, 1);
    const waveAmp   = WATER._waveAmp * waveDecay;
    const ilx = cx - rimRx + wallT, irx = cx + rimRx - wallT;

    ctx.save();
    bowlInnerPath();
    ctx.clip();

    const steps = isPreview ? 16 : (IS_MOBILE ? 28 : 48);
    const surfW  = irx - ilx;

    // Surface shimmer band
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const sx  = ilx + surfW * (i / steps);
      const wvy = waterTopY
        + sin(i * 0.65 + time * 2.3) * (1.8 + waveAmp * 7)
        + sin(i * 1.45 - time * 1.7) * (0.9 + waveAmp * 3.5)
        + sin(i * 0.28 + time * 0.85) * 1.2;
      if (i === 0) ctx.moveTo(sx, wvy); else ctx.lineTo(sx, wvy);
    }
    ctx.strokeStyle = 'rgba(175,228,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Top specular glint — skip on mobile
    if (!IS_MOBILE) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const sx  = ilx + surfW * (i / steps);
        const wvy = waterTopY - 1.5
          + sin(i * 0.65 + time * 2.3) * (1.8 + waveAmp * 7)
          + sin(i * 1.45 - time * 1.7) * (0.9 + waveAmp * 3.5)
          + sin(i * 0.28 + time * 0.85) * 1.2;
        if (i === 0) ctx.moveTo(sx, wvy); else ctx.lineTo(sx, wvy);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }
    ctx.restore();

    // ── Ripple rings (on water surface) ──
    WATER.ripples = WATER.ripples.filter(r => r.alpha > 0.01);
    WATER.ripples.forEach(r => {
      r.r     += (r.maxR - r.r) * 0.10;
      r.alpha *= 0.908;
      ctx.save();
      ctx.globalAlpha = r.alpha;
      ctx.strokeStyle = 'rgba(185,232,255,0.85)';
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.16, 0, 0, PI * 2);
      ctx.stroke();
      if (r.r > 6) {
        ctx.globalAlpha = r.alpha * 0.45;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r * 0.52, r.r * 0.52 * 0.16, 0, 0, PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  // ── Glass bowl walls (drawn OVER water for glass-in-front effect) ──
  const lox = cx - rimRx,  rox = cx + rimRx;
  const lbx = cx - baseRx, rbx = cx + baseRx;
  const lix = lox + wallT, rix = rox - wallT;

  // Left glass wall fill
  ctx.save();
  const lwg = ctx.createLinearGradient(lox, 0, lix + 14, 0);
  lwg.addColorStop(0,   'rgba(205,232,255,0.20)');
  lwg.addColorStop(0.35,'rgba(160,215,248,0.10)');
  lwg.addColorStop(0.7, 'rgba(120,190,240,0.04)');
  lwg.addColorStop(1,   'transparent');
  ctx.fillStyle = lwg;
  ctx.beginPath();
  ctx.moveTo(lox, rimY);
  ctx.bezierCurveTo(lox - 9, rimY + bowlH * 0.38, lbx - 7, baseY - 26, cx - baseRx * 0.68, baseY - 2);
  ctx.bezierCurveTo(cx - baseRx * 0.68 + wallT * 0.6, baseY - 18, lix - 5, rimY + bowlH * 0.36, lix, rimY);
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, 0, PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Right glass wall fill
  ctx.save();
  const rwg = ctx.createLinearGradient(rix - 14, 0, rox, 0);
  rwg.addColorStop(0,   'transparent');
  rwg.addColorStop(0.3, 'rgba(100,175,235,0.04)');
  rwg.addColorStop(0.65,'rgba(145,205,248,0.10)');
  rwg.addColorStop(1,   'rgba(200,232,255,0.16)');
  ctx.fillStyle = rwg;
  ctx.beginPath();
  ctx.moveTo(rix, rimY);
  ctx.bezierCurveTo(rix + 5, rimY + bowlH * 0.36, cx + baseRx * 0.68 - wallT * 0.6, baseY - 18, cx + baseRx * 0.68, baseY - 2);
  ctx.bezierCurveTo(rbx + 7, baseY - 26, rox + 9, rimY + bowlH * 0.38, rox, rimY);
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, PI, 0, false);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Rim ellipse (glass top edge)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, rimY, rimRx, rimRy, 0, 0, PI * 2);
  const rig = ctx.createLinearGradient(cx - rimRx, rimY - rimRy, cx + rimRx, rimY + rimRy);
  rig.addColorStop(0,   'rgba(230,245,255,0.58)');
  rig.addColorStop(0.4, 'rgba(185,225,252,0.38)');
  rig.addColorStop(0.6, 'rgba(145,205,245,0.28)');
  rig.addColorStop(1,   'rgba(185,225,252,0.48)');
  ctx.strokeStyle = rig;
  ctx.lineWidth   = wallT * 0.95;
  ctx.stroke();
  // Bright inner highlight on rim top
  ctx.beginPath();
  ctx.ellipse(cx, rimY - rimRy * 0.35, rimRx * 0.88, rimRy * 0.48, 0, PI * 1.12, PI * 1.88);
  ctx.strokeStyle = 'rgba(255,255,255,0.62)';
  ctx.lineWidth   = 1.4;
  ctx.stroke();
  ctx.restore();

  // Base ellipse
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 4, baseRx * 0.80, 6, 0, 0, PI * 2);
  ctx.strokeStyle = 'rgba(150,215,248,0.32)';
  ctx.lineWidth   = 2.8;
  ctx.stroke();
  ctx.fillStyle = 'rgba(90,165,230,0.07)';
  ctx.fill();
  ctx.restore();

  // Left & right vertical edge highlights (glass sparkle)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(lox - 1, rimY);
  ctx.bezierCurveTo(lox - 10, rimY + bowlH * 0.38, lbx - 7, baseY - 24, cx - baseRx * 0.7, baseY - 3);
  ctx.strokeStyle = 'rgba(225,242,255,0.44)';
  ctx.lineWidth   = 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rox + 1, rimY);
  ctx.bezierCurveTo(rox + 10, rimY + bowlH * 0.38, rbx + 7, baseY - 24, cx + baseRx * 0.7, baseY - 3);
  ctx.strokeStyle = 'rgba(185,225,255,0.30)';
  ctx.lineWidth   = 1.8;
  ctx.stroke();
  ctx.restore();

  // ── Overflow near completion ──
  if (p > 0.91) {
    const oa = clamp((p - 0.91) * 11, 0, 1);
    for (let k = 0; k < 3; k++) {
      const ox = cx - rimRx * 0.6 + k * rimRx * 0.6;
      ctx.save();
      ctx.globalAlpha = oa * (0.45 + sin(time * 1.8 + k) * 0.25);
      ctx.strokeStyle = 'rgba(100,185,245,0.75)';
      ctx.lineWidth   = 1.8;
      ctx.beginPath();
      ctx.moveTo(ox, rimY - 1);
      ctx.bezierCurveTo(ox - 4, rimY + 9, ox - 2, rimY + 20, ox + 1, rimY + 30);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Ambient bowl glow ──
  const glow = ctx.createRadialGradient(cx, rimY + bowlH * 0.52, 10, cx, rimY + bowlH * 0.52, rimRx * 1.55);
  glow.addColorStop(0,   'transparent');
  glow.addColorStop(0.55,`rgba(50,115,200,${0.028 + fillFrac * 0.038})`);
  glow.addColorStop(1,   'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // ── Falling droplets ──
  // Spawn logic
  if (!isPreview && time - WATER._lastDrop > WATER._nextInt) {
    WATER._lastDrop = time;
    WATER._nextInt  = 1.3 + Math.abs(sn(time * 0.22, 44)) * 1.2 + 0.15;
    WATER.drops.push({
      x:    cx + (Math.random() - 0.5) * 16, // Random symmetric spawn within rim
      y:    rimY - 85,
      vy:   0.7 + Math.random() * 0.4,
      r:    3.2 + Math.random() * 1.8,
      alive: true,
    });
  }
  // Preview: constant dripping feedback
  if (isPreview && Math.floor(time * 1.2) > Math.floor((time - 1/60) * 1.2)) {
    WATER.drops.push({
      x: cx + (Math.random() - 0.5) * 14,
      y: rimY - 15, // Spawn closer to rim so drop is seen immediately
      vy: 0.9, r: 3, alive: true,
    });
  }

  WATER.drops = WATER.drops.filter(d => d.alive);
  WATER.drops.forEach(d => {
    d.vy += 0.44;
    d.y  += d.vy;
    const stretch = 1 + d.vy * 0.042;
    const hitY = fillFrac > 0.005 ? waterTopY : baseY - 5;

    if (d.y + d.r * stretch >= hitY) {
      // Impact interaction
      WATER.ripples.push({ x: d.x, y: hitY, r: 0, maxR: 16 + d.r * 3.5, alpha: 0.78 });
      WATER.ripples.push({ x: d.x, y: hitY, r: 0, maxR: 7 + d.r,        alpha: 0.52 });
      const nS = 5 + Math.floor(Math.random() * 4);
      for (let k = 0; k < nS; k++) {
        const ang = -PI * 0.88 + Math.random() * PI * 0.76;
        const spd = 1.0 + Math.random() * 2.8;
        WATER.splash.push({
          x: d.x, y: hitY,
          vx: cos(ang) * spd * (0.7 + Math.random() * 0.6),
          vy: sin(ang) * spd,
          r:  0.8 + Math.random() * 1.8,
          alpha: 0.88,
        });
      }
      WATER._waveAmp  = 1.0;
      WATER._waveTime = time;
      d.alive = false;
      return;
    }
    if (d.y > H + 30) { d.alive = false; return; }

    // Draw teardrop
    const dropH = d.r * stretch * 2.4;
    ctx.save();
    const dg = ctx.createLinearGradient(d.x - d.r, d.y - dropH, d.x + d.r, d.y + 2);
    dg.addColorStop(0,   'rgba(175,225,255,0.0)');
    dg.addColorStop(0.28,'rgba(155,218,255,0.72)');
    dg.addColorStop(0.75,'rgba(115,192,248,0.92)');
    dg.addColorStop(1,   'rgba(95,172,242,0.88)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y - dropH);
    ctx.bezierCurveTo(d.x + d.r * 1.15, d.y - dropH * 0.28, d.x + d.r, d.y,        d.x, d.y + 1.5);
    ctx.bezierCurveTo(d.x - d.r,        d.y,                 d.x - d.r * 1.15, d.y - dropH * 0.28, d.x, d.y - dropH);
    ctx.fill();
    // Specular glint
    ctx.fillStyle = 'rgba(255,255,255,0.48)';
    ctx.beginPath();
    ctx.ellipse(d.x - d.r * 0.26, d.y - dropH * 0.54, d.r * 0.24, d.r * 0.34 * stretch, -0.28, 0, PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // ── Splash particles ──
  WATER.splash = WATER.splash.filter(s => s.alpha > 0.02);
  WATER.splash.forEach(s => {
    s.x  += s.vx;
    s.y  += s.vy;
    s.vy += 0.065;
    s.vx *= 0.965;
    s.alpha -= 0.030;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = 'rgba(138,212,255,0.92)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // ── Spotlight beam — skip on mobile ──
  if (!isPreview && !IS_MOBILE) {
    const beam = ctx.createLinearGradient(0, 0, 0, H * 0.78);
    beam.addColorStop(0, 'rgba(95,155,220,0.06)');
    beam.addColorStop(1, 'transparent');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 28, 0); ctx.lineTo(cx + 28, 0);
    ctx.lineTo(cx + (W * 0.42) * 0.58, H * 0.78);
    ctx.lineTo(cx - (W * 0.42) * 0.58, H * 0.78);
    ctx.closePath();
    ctx.fillStyle = beam; ctx.fill();
    ctx.restore();
  }
}

/* ══════════════════════════════════════════════════════════
   CANDLE — Physically melting wax simulation
══════════════════════════════════════════════════════════ */
const CANDLE = {
  initd:  false,
  drips:  [],      // Active flowing drips
  solid:  [],      // Hardened drips (texture)
  pools:  [],      // Base accumulation
  smoke:  [],      // End-phase smoke
  _lastSpawn: 0,
};

function candleReset() {
  CANDLE.initd  = true;
  CANDLE.drips  = [];
  CANDLE.solid  = [];
  CANDLE.pools  = [];
  CANDLE.smoke  = [];
  CANDLE._lastSpawn = 0;
  
  // Add some initial "solid" drips for organic starting texture
  for (let i = 0; i < 8; i++) {
    CANDLE.solid.push({
      rx: 0.05 + Math.random() * 0.9,
      y: 0.1 + Math.random() * 0.6,
      len: 0.1 + Math.random() * 0.4,
      width: 2.5 + Math.random() * 4,
      opacity: 0.4 + Math.random() * 0.35
    });
  }
}

function drawCandle(ctx, W, H, p, time) {
  if (!CANDLE.initd) candleReset();
  const cx = W / 2;
  const isPreview = W < 300;

  // ── Background ──
  const warmth = Math.max(0.04, 0.5 - p * 0.4);
  // On mobile, use a simpler static dark background to avoid per-frame gradient creation
  if (IS_MOBILE) {
    ctx.fillStyle = '#030200';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createRadialGradient(cx, H * 0.52, 10, cx, H * 0.52, H * 0.95);
    bg.addColorStop(0, isPreview ? `rgba(58,32,6,0.2)` : `rgba(58,32,6,${warmth})`);
    bg.addColorStop(0.5, isPreview ? `rgba(28,14,2,0.1)` : `rgba(28,14,2,${warmth * 0.8})`);
    bg.addColorStop(1,   '#030200');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  }

  // ── 1. Candle Height Reduction (Independent) ──
  const candleW  = isPreview ? W * 0.32 : clamp(W * 0.088, 42, 86);
  const maxH     = isPreview ? H * 0.68 : clamp(Math.min(H * 0.46, 300), 160, 320);
  const burnProg = Math.pow(p, 0.7);
  const curH     = maxH * (1 - burnProg * 0.82);
  const baseLine = isPreview ? H * 0.92 : H * 0.68;
  const topY     = baseLine - curH;
  const bx       = cx - candleW / 2;

  // ── 2. Wax Drip Spawning Logic ──
  const spawnChance = isPreview ? 0.022 : (0.02 + p * 0.05); // More frequent in preview
  if (Math.random() < spawnChance && p < 1) {
    const rx = 0.05 + Math.random() * 0.9;
    CANDLE.drips.push({
      rx,
      ry: 0, 
      speed: 0.0008 + Math.random() * 0.0018,
      type: Math.random() > 0.4 ? "long" : "short", 
      stopAt: 0.2 + Math.random() * 0.7,
      scaleY: 1,
      scaleX: 1,
      width: 2.2 + Math.random() * 3.5,
      stopped: false
    });
  }

  // ── 3. Drip Animation & Accumulation ──
  CANDLE.drips.forEach((d, i) => {
    if (d.stopped) return;
    d.ry += d.speed * (1 + p * 0.5);
    d.scaleY += 0.0035;
    d.scaleX = Math.max(0.45, d.scaleX - 0.0012);
    const absoluteY = topY + d.ry * curH;

    if (d.type === "short" && d.ry > d.stopAt) {
      d.stopped = true;
      CANDLE.solid.push({ rx: d.rx, y: d.ry, len: d.scaleY * 0.04, width: d.width, opacity: 0.8 });
      CANDLE.drips.splice(i, 1);
      return;
    }
    if (absoluteY >= baseLine - 2) {
      CANDLE.pools.push({
        rx: d.rx + (Math.random() - 0.5) * 0.08,
        r: d.width * (1.8 + Math.random() * 2.2),
        scaleY: 0.32,
        opacity: 0.72
      });
      CANDLE.drips.splice(i, 1);
    }
  });

  // ── 4. Rendering Candle Body ──
  const wg = ctx.createLinearGradient(bx, topY, bx + candleW, baseLine);
  wg.addColorStop(0, '#fff1e0'); wg.addColorStop(0.3, '#f0d5a0'); wg.addColorStop(1, '#d6b578');
  ctx.fillStyle = wg;
  ctx.beginPath();
  const topSteps = 12;
  ctx.moveTo(bx, topY + sn(time * 0.1, 1) * 3);
  for(let i=1; i<=topSteps; i++) {
    const tx = bx + (candleW * (i / topSteps));
    const t_y = topY + sn(time * 0.1, i * 0.5) * (isPreview ? 2 : 5);
    ctx.lineTo(tx, t_y);
  }
  ctx.lineTo(bx + candleW, baseLine); ctx.lineTo(bx, baseLine); ctx.closePath(); ctx.fill();

  // ── 5. Rendering Solidified Texture ──
  CANDLE.solid.forEach(s => {
    const sx = bx + (s.rx * candleW);
    const sy = topY + s.y * curH;
    ctx.fillStyle = `rgba(255, 248, 232, ${s.opacity})`;
    ctx.beginPath(); ctx.moveTo(sx - s.width/2, sy); ctx.lineTo(sx + s.width/2, sy);
    ctx.lineTo(sx, sy + s.len * 50); ctx.closePath(); ctx.fill();
  });

  // ── 6. Rendering Active Drips ──
  CANDLE.drips.forEach(d => {
    const dx = bx + (d.rx * candleW);
    const dy = topY + d.ry * curH;
    ctx.save(); ctx.translate(dx, dy); ctx.scale(d.scaleX, d.scaleY);
    const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, d.width);
    dg.addColorStop(0, '#ffffff'); dg.addColorStop(1, '#fbe6c5');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, d.width, 0, PI*2); ctx.fill(); ctx.restore();
  });

  // ── 7. Rendering Base Accumulation ──
  CANDLE.pools.forEach(pool => {
    const px = bx + (pool.rx * candleW);
    ctx.save();
    const pg = ctx.createRadialGradient(px, baseLine, 0, px, baseLine, pool.r);
    pg.addColorStop(0, 'rgba(255,245,220,0.8)'); pg.addColorStop(1, 'transparent');
    ctx.fillStyle = pg; ctx.beginPath();
    ctx.ellipse(px, baseLine, pool.r * 1.5, pool.r * pool.scaleY, 0, 0, PI * 2);
    ctx.fill(); ctx.restore();
  });

  // ── 8. Wick & Flame ──
  if (p < 0.995) {
    const wickH = isPreview ? 8 : 14;
    const wickTop = topY - wickH;
    ctx.strokeStyle = '#221100'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(cx, wickTop); ctx.stroke();

    const flicker = sn(time * 8, 11) * 0.15;
    const flameH = (isPreview ? 25 : 55) * (1 + flicker);
    const ag = ctx.createRadialGradient(cx, wickTop, 2, cx, wickTop, flameH * 2);
    ag.addColorStop(0, `rgba(255,160,60,${0.32 + flicker})`); ag.addColorStop(1, 'transparent');
    ctx.fillStyle = ag; ctx.globalCompositeOperation = 'screen'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    const fx = cx + sn(time * 5, 3) * 1.5;
    const fy = wickTop - 2;
    const cg = ctx.createLinearGradient(fx, fy, fx, fy - flameH);
    cg.addColorStop(0, '#4477ff'); cg.addColorStop(0.4, '#ffaa44');
    cg.addColorStop(0.8, '#fff9cc'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(fx - 4, fy);
    ctx.quadraticCurveTo(fx - 8, fy - flameH * 0.6, fx, fy - flameH);
    ctx.quadraticCurveTo(fx + 8, fy - flameH * 0.6, fx + 4, fy);
    ctx.closePath(); ctx.fill();
  }

  // ── 9. Smoke ──
  if (p > 0.88) {
    if (Math.random() < 0.12) {
      CANDLE.smoke.push({ x: cx + (Math.random() - 0.5) * 8, y: topY - 10, r: 2 + Math.random() * 4, a: 0.35 });
    }
  }
  CANDLE.smoke.forEach((s, i) => {
    s.y -= 0.65; s.x += sn(time, i) * 0.4; s.a *= 0.982;
    if (s.a < 0.01) CANDLE.smoke.splice(i, 1);
    ctx.fillStyle = `rgba(180,180,180,${s.a})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, PI*2); ctx.fill();
  });
}

// Multi-frequency Perlin-approximated flame
function drawFlame(ctx, x, tipY, p, time, strength = 1) {
  // Non-repetitive flicker: sum of incommensurate frequencies
  const f1  = sn(time * 8.3,  1);
  const f2  = sn(time * 13.7, 2);
  const f3  = sn(time * 5.1,  3);
  const f4  = sn(time * 21.0, 4);
  const flickerX = f1 * 2.8 + f2 * 1.2;      // lateral wind
  const flickerH = 1 + f3 * 0.09 + f4 * 0.05; // height

  // Flame dims and shrinks near end
  const endScale = p > 0.88 ? clamp((1 - p) * 8.33, 0.1, 1) : 1;

  const fx  = x + flickerX;
  const fH  = (42 + f3 * 8 + f1 * 4) * flickerH * strength * endScale;
  const fW  = (14 + f2 * 3) * strength * endScale;

  // Outer atmospheric haze (flickers in size) — skip on mobile
  if (!IS_MOBILE) {
    const hazeR = fW * (3.5 + f1 * 0.5);
    const og = ctx.createRadialGradient(fx, tipY - fH * 0.3, 0, fx, tipY - fH * 0.3, hazeR);
    og.addColorStop(0, `rgba(255,165,40,${0.18 * strength * endScale})`);
    og.addColorStop(0.5,'rgba(200,80,10,0.05)');
    og.addColorStop(1, 'transparent');
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, ctx.canvas.width / (window.devicePixelRatio||1),
                       ctx.canvas.height / (window.devicePixelRatio||1));

    // Secondary glow layer (adds depth)
    const og2 = ctx.createRadialGradient(fx, tipY - fH * 0.15, 0, fx, tipY - fH * 0.5, fH * 1.3);
    og2.addColorStop(0, `rgba(255,210,80,${0.25 * strength * endScale})`);
    og2.addColorStop(1, 'transparent');
    ctx.fillStyle = og2;
    ctx.beginPath(); ctx.ellipse(fx, tipY - fH * 0.35, fW * 2, fH * 1.2, 0, 0, PI * 2); ctx.fill();
  }

  // Main flame body — asymmetric bezier (non-uniform)
  const fg = ctx.createRadialGradient(fx, tipY - fH * 0.2, 1, fx, tipY - fH * 0.6, fH);
  fg.addColorStop(0,    `rgba(255,252,210,${0.98 * strength})`);
  fg.addColorStop(0.18, `rgba(255,228,50,${0.95 * strength})`);
  fg.addColorStop(0.44, `rgba(255,140,20,${0.88 * strength})`);
  fg.addColorStop(0.72, `rgba(220,50,0,${0.7 * strength})`);
  fg.addColorStop(1.0,  'transparent');
  ctx.fillStyle = fg;
  // Right side — blown by virtual breeze
  const leanR = f1 * fW * 0.3;
  const leanL = f2 * fW * 0.2;
  ctx.beginPath();
  ctx.moveTo(fx, tipY - fH);
  ctx.bezierCurveTo(
    fx + fW + leanR,            tipY - fH * 0.72,
    fx + fW * 1.25 + leanR,     tipY - fH * 0.22,
    fx,                          tipY
  );
  ctx.bezierCurveTo(
    fx - fW * 1.1 + leanL,      tipY - fH * 0.22,
    fx - fW * 0.85 + leanL,     tipY - fH * 0.72,
    fx,                          tipY - fH
  );
  ctx.fill();

  // Hot inner core
  const cg = ctx.createRadialGradient(fx, tipY - fH * 0.3, 0, fx, tipY - fH * 0.3, fW * 0.65);
  cg.addColorStop(0, `rgba(255,255,240,${0.98 * strength * endScale})`);
  cg.addColorStop(0.6, `rgba(255,245,160,${0.5 * strength * endScale})`);
  cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(fx, tipY - fH * 0.3, fW * 0.5, fH * 0.38 * (1 + f4 * 0.08), 0, 0, PI * 2);
  ctx.fill();
}

/* ══════════════════════════════════════════════════════════
   TREE — Realistic leaf-shedding simulation
══════════════════════════════════════════════════════════ */

const LEAF_N = IS_MOBILE ? 80 : 160;
const leaves = [];
const groundPile = []; // permanent ground leaf positions

const LEAF_COLORS = [
  '#c8e8a0','#a8d870','#8cc855','#d4a840','#e08828',
  '#c87020','#a85818','#d4c058','#b8e888','#98cc50',
  '#ddc060','#c89030','#b07020',
];

function leafColor() {
  return LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
}

function initLeaves(W, H, tip, pool, pile, isPreview) {
  pool = pool || leaves;
  pile = pile || groundPile;
  pool.length   = 0;
  pile.length   = 0;

  for (let i = 0; i < LEAF_N; i++) {
    // Evenly-spaced distribution with small random jitter.
    // leaf #0 → detachAt≈0.025, leaf #159 → detachAt≈0.955
    // ≈ one leaf detaches every 9s in a 25-min session — visible but never overwhelming
    const jitter   = (Math.random() - 0.5) * 0.032;
    const detachAt = clamp(0.025 + (i / LEAF_N) * 0.93 + jitter, 0.012, 0.97);

    const angle  = -PI * 1.1 + Math.random() * PI * 2.2;
    const dist   = (isPreview ? 10 + Math.random() * 45 : 18 + Math.random() * 110);
    const size   = isPreview ? 2.5 + Math.random() * 4 : 4.5 + Math.random() * 8.5;

    pool.push({
      angle,
      dist,
      swayOffset: Math.random() * PI * 2,
      swaySpeed:  0.25 + Math.random() * 0.65,
      size,
      color:      leafColor(),
      alpha:      0.65 + Math.random() * 0.35,
      rot:        Math.random() * PI * 2,
      detachAt,

      falling:    false,
      ground:     false,
      hesitate:   false,
      hesitateStart: 0,

      x: 0, y: 0,
      vx: 0, vy: 0,
      rotV: 0,
      windPhase: Math.random() * PI * 2,
      windSpeed: 0.4 + Math.random() * 1.2,
      drift:    (Math.random() - 0.5) * 1.8,
      driftCurveX: 0,
    });
  }
}

function drawTree(ctx, W, H, p, time) {
  const cx = W / 2;
  const isPreview = W < 300;  // small canvas = card preview

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#020705');
  bg.addColorStop(1, '#040e07');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Moon glow
  const mg = ctx.createRadialGradient(cx * 0.6, H * 0.1, 5, cx * 0.6, H * 0.1, W * 0.42);
  mg.addColorStop(0, 'rgba(200,255,180,0.06)'); mg.addColorStop(1, 'transparent');
  ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);

  // Moon disc
  ctx.save();
  ctx.globalAlpha = 0.55;
  const moonG = ctx.createRadialGradient(cx * 0.6, H * 0.1, 0, cx * 0.6, H * 0.1, 22);
  moonG.addColorStop(0, 'rgba(235,255,220,0.9)'); moonG.addColorStop(1, 'rgba(200,240,180,0)');
  ctx.fillStyle = moonG; ctx.beginPath(); ctx.arc(cx * 0.6, H * 0.1, 22, 0, PI * 2); ctx.fill();
  ctx.restore();

  // Ground fog layers
  for (let i = 0; i < 4; i++) {
    const fogX = W * (0.1 + i * 0.28) + sin(time * 0.05 + i * 2.5) * 30;
    const fogG = ctx.createRadialGradient(fogX, H * 0.8, 0, fogX, H * 0.58, H * 0.42);
    fogG.addColorStop(0, `rgba(70,110,65,${0.04 + i * 0.008})`);
    fogG.addColorStop(1, 'transparent');
    ctx.fillStyle = fogG; ctx.fillRect(0, 0, W, H);
  }

  // ── Ground ──
  const trunkY = H * 0.76;
  const gg = ctx.createLinearGradient(0, trunkY - 8, 0, H);
  gg.addColorStop(0, 'rgba(28,50,22,0.85)');
  gg.addColorStop(0.3, 'rgba(18,36,14,0.9)');
  gg.addColorStop(1, 'rgba(8,16,6,0.95)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  // Slightly uneven ground line
  ctx.moveTo(0, trunkY - 6 + sn(0, 8) * 4);
  for (let i = 1; i <= 20; i++) {
    const gx = W * i / 20;
    const gy = trunkY + sin(i * 1.3 + 4) * (isPreview ? 2 : 4);
    ctx.lineTo(gx, gy);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

  // Ambient forest motes (tiny floating spores/pollen) — only in full session, reduced on mobile
  if (!isPreview && p > 0.02) {
    const MOTE_COUNT = IS_MOBILE ? 15 : 35;
    if (!drawTree._motes) {
      drawTree._motes = Array.from({length: MOTE_COUNT}, () => ({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.004,
        vy: -(0.003 + Math.random() * 0.006),
        r: 0.8 + Math.random() * 1.8,
        alpha: 0.06 + Math.random() * 0.16,
        phase: Math.random() * PI * 2,
        speed: 0.2 + Math.random() * 0.6,
        color: Math.random() < 0.5 ? '#a8d870' : '#c8a858',
      }));
    }
    drawTree._motes.forEach(m => {
      m.x += m.vx + sn(time * m.speed + m.phase, m.phase) * 0.003;
      m.y += m.vy;
      if (m.y < -0.05) m.y = 1.02;
      if (m.x < -0.05) m.x = 1.02;
      if (m.x >  1.05) m.x = -0.02;
      ctx.save();
      ctx.globalAlpha = m.alpha * (0.5 + 0.5 * sin(time * m.speed + m.phase));
      ctx.fillStyle = m.color;  // pre-assigned, avoid Math.random() per frame
      ctx.beginPath();
      ctx.arc(m.x * W, m.y * H, m.r, 0, PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── Trunk ──
  const trunkScale = isPreview ? 0.65 : 1.0;
  const trunkH  = isPreview ? H * 0.32 : clamp(Math.min(H * 0.37, 240), H * 0.28, 270);
  const trunkW  = isPreview ? W * 0.08 : clamp(H * 0.03, 8, 22);
  const tipY    = trunkY - trunkH;
  const tipX    = cx;

  // Wind sway of whole branch system
  const windSway = isPreview ? 0 : sn(time * 0.22, 13) * 0.025 + sn(time * 0.41, 7) * 0.015;

  const tw = ctx.createLinearGradient(tipX - trunkW, 0, tipX + trunkW, 0);
  tw.addColorStop(0, '#150b03'); tw.addColorStop(0.4, '#2e1606'); tw.addColorStop(0.6, '#3c1e08'); tw.addColorStop(1, '#150b03');
  ctx.fillStyle = tw;
  ctx.beginPath();
  // Trunk with subtle organic taper
  ctx.moveTo(tipX - trunkW * 0.58, trunkY);
  ctx.bezierCurveTo(
    tipX - trunkW * 1.05, trunkY - trunkH * 0.33,
    tipX - trunkW * 0.72, trunkY - trunkH * 0.70,
    tipX - 5 + windSway * 10, tipY
  );
  ctx.lineTo(tipX + 5 + windSway * 10, tipY);
  ctx.bezierCurveTo(
    tipX + trunkW * 0.72, trunkY - trunkH * 0.70,
    tipX + trunkW * 1.05, trunkY - trunkH * 0.33,
    tipX + trunkW * 0.58, trunkY
  );
  ctx.closePath(); ctx.fill();

  // Bark texture (horizontal strokes)
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const by2 = trunkY - trunkH * (0.12 + i * 0.11);
    const bw2 = lerp(trunkW * 0.9, trunkW * 0.3, i / 8);
    ctx.beginPath();
    ctx.moveTo(tipX - bw2 + sin(i * 7.3) * 2, by2);
    ctx.quadraticCurveTo(tipX + sin(i * 2.1) * 3, by2 + 1.5, tipX + bw2 + sin(i * 5.1) * 2, by2);
    ctx.stroke();
  }
  ctx.restore();

  // ── Branches (recursive, wind-swayed) ──
  drawBranch(ctx, tipX + windSway * 12, tipY, -PI * 0.5 + windSway * 0.5, trunkH * 0.3, 9, time, 4, windSway);
  drawBranch(ctx, tipX - 6 + windSway * 8, tipY + trunkH * 0.18, -PI * 0.5 - 0.5 + windSway * 0.4, trunkH * 0.22, 6.5, time, 3, windSway);
  drawBranch(ctx, tipX + 5 + windSway * 10, tipY + trunkH * 0.22, -PI * 0.5 + 0.5 + windSway * 0.4, trunkH * 0.21, 6, time, 3, windSway);
  drawBranch(ctx, tipX - 2 + windSway * 5, tipY + trunkH * 0.4, -PI * 0.5 - 0.28 + windSway * 0.3, trunkH * 0.16, 5, time, 2, windSway);


  // ── Leaf pool: isolated for preview, global for session ──
  const leafPool = isPreview ? (drawTree._previewLeaves || (drawTree._previewLeaves = [])) : leaves;
  const pilePool = isPreview ? (drawTree._previewPile   || (drawTree._previewPile   = [])) : groundPile;

  if (leafPool.length === 0) initLeaves(W, H, {x: tipX, y: tipY}, leafPool, pilePool, isPreview);

  // ── Wind gust events: every 40-60s, force 2-4 leaves to detach ──
  if (!isPreview) {
    // Wind gust: wait 2 minutes, then nudge 1-2 extra leaves every 80s
    // This is a rare surprise burst — not the primary fall mechanism
    const minGustWait = 120;   // seconds before first gust
    const gustInterval = 80;   // seconds between gusts
    const gustIndex = time > minGustWait
      ? Math.floor((time - minGustWait) / gustInterval)
      : -1;
    if (gustIndex >= 0 && gustIndex > drawTree._lastGust) {
      drawTree._lastGust = gustIndex;
      const candidates = leafPool
        .filter(l => !l.falling && !l.ground && !l.hesitate && p < l.detachAt)
        .sort((a, b) => a.detachAt - b.detachAt)
        .slice(0, 1 + Math.floor(Math.random() * 2));  // 1-2 only
      candidates.forEach(l => {
        l.detachAt = p;
        l.hesitate = true;
        l.hesitateStart = time - 0.30;
      });
    }
  }

  // ── Update & draw leaves ──
  const spread = 115 - p * 55;
  let anyHesitating = false;

  leafPool.forEach((leaf, idx) => {

    if (leaf.ground) {
      // Settled on ground — don't animate, just draw flat
      drawLeaf(ctx, leaf.x, leaf.y, leaf.size * 0.8, leaf.color, leaf.rot, leaf.alpha * 0.45);
      return;
    }

    if (!leaf.falling) {
      // ── On-tree behavior ──
      const canDetach = p >= leaf.detachAt;

      // Hesitation: violent pre-detach sway
      if (canDetach && !leaf.hesitate) {
        leaf.hesitate      = true;
        leaf.hesitateStart = time;
      }

      const onTreeAngle  = leaf.angle + sin(time * leaf.swaySpeed + leaf.swayOffset) * 0.04
                         + windSway * (2 + leaf.dist * 0.015);
      const dist2 = leaf.dist * (spread / 115);
      const lx = tipX + cos(onTreeAngle) * dist2 + windSway * dist2 * 0.3;
      const ly = tipY + sin(onTreeAngle) * dist2 * 0.52 - 6;

      if (leaf.hesitate) {
        const hesitateAge = time - leaf.hesitateStart;
        const agitation   = Math.min(hesitateAge * 2, 1.0) * 5;  // ramp up
        const detachDelay = 0.3 + (idx % 7) * 0.08; // stagger detach

        if (hesitateAge > detachDelay) {
          // Detach!
          leaf.falling    = true;
          leaf.x          = lx;
          leaf.y          = ly;
          leaf.vx         = (Math.random() - 0.5) * 1.2 + windSway * 15;
          leaf.vy         = -(0.2 + Math.random() * 0.5); // small upward pop
          leaf.rotV       = (Math.random() - 0.5) * 0.05;
          leaf.driftCurveX = (Math.random() - 0.5) * 60;
          return;
        }

        const hx = lx + sn(time * 12 + idx, idx) * agitation * 2;
        const hy = ly + sn(time * 11 + idx + 5, idx * 3) * agitation * 1.2;
        drawLeaf(ctx, hx, hy, leaf.size, leaf.color, leaf.rot + sn(time * 15 + idx, 99) * agitation * 0.15, leaf.alpha);
      } else {
        drawLeaf(ctx, lx, ly, leaf.size, leaf.color,
          leaf.rot + sin(time * leaf.swaySpeed * 0.5 + leaf.swayOffset) * 0.06,
          leaf.alpha);
      }
      return;
    }

    // ── Falling behavior ──
    // Gravity
    leaf.vy += 0.045;
    // Strong wind randomness — different per leaf
    const windForce = sn(time * leaf.windSpeed + leaf.windPhase, idx) * 0.8 + leaf.drift * 0.02;
    leaf.vx += windForce;
    leaf.vx *= 0.985;  // air resistance
    leaf.vy *= 0.992;
    leaf.x  += leaf.vx;
    leaf.y  += leaf.vy;
    leaf.rot += leaf.rotV + sn(time * 2.5 + idx, idx * 2) * 0.008;

    // Ground check
    const groundY = trunkY - 1 + sin(leaf.x / W * PI * 3) * 3;
    if (leaf.y >= groundY) {
      if (isPreview) {
        // Loop leaves in preview so it feels "constant"
        leaf.y = tipY;
        leaf.x = tipX + (Math.random() - 0.5) * 10;
        leaf.vx = (Math.random() - 0.5) * 1.5;
        leaf.vy = 0.2;
        leaf.falling = false;
        leaf.ground = false;
        leaf.hesitate = false;
      } else {
        leaf.y      = groundY;
        leaf.ground = true;
        // Add to pile with slight random spread
        pilePool.push({x: leaf.x, y: groundY, size: leaf.size, color: leaf.color,
                         rot: leaf.rot, alpha: leaf.alpha});
      }
      return;
    }

    // Fade slightly on the way down
    const fadeAlpha = leaf.alpha * (1 - Math.max(0, (leaf.y - tipY) / (groundY - tipY)) * 0.25);
    drawLeaf(ctx, leaf.x, leaf.y, leaf.size, leaf.color, leaf.rot, fadeAlpha);
  });

  // ── Ground pile (layered accumulation) ──
  if (pilePool.length > 0) {
    pilePool.forEach(g => {
      drawLeaf(ctx, g.x, g.y, g.size * 0.78, g.color, g.rot, g.alpha * 0.42);
    });
  }
  // Seed piles from progress even before leaves hit ground, for richness
  if (p > 0.08) {
    const pileCount = Math.floor(p * 30);
    for (let i = 0; i < pileCount; i++) {
      // Use seeded positions — deterministic so they don't flicker
      const gx  = cx + (((i * 73 + 17) % 240) - 120) + sin(i * 1.87) * 30;
      const gy  = trunkY - 1 + (i % 4);
      const gr  = (i % 5) * 1.1 + 3;
      const gc  = LEAF_COLORS[(i * 3 + 5) % LEAF_COLORS.length];
      const ga  = 0.3 * clamp((p - 0.08) * 4, 0, 1);
      drawLeaf(ctx, gx, gy, gr, gc, i * 0.42, ga);
    }
  }
}

function drawBranch(ctx, x, y, angle, length, width, time, depth, windSway = 0) {
  if (depth <= 0 || length < 5) return;
  // Per-branch wind sway increases toward tips
  const swayAmp = 0.06 + (4 - depth) * 0.018;
  const branchSway = sn(time * (0.18 + depth * 0.06), depth * 13) * swayAmp + windSway * (0.3 + depth * 0.12);
  const angle2 = angle + branchSway;
  const ex = x + cos(angle2) * length;
  const ey = y + sin(angle2) * length;

  const bg = ctx.createLinearGradient(x, y, ex, ey);
  bg.addColorStop(0, depth > 2 ? '#2e1606' : '#1e0e04');
  bg.addColorStop(1, '#120804');
  ctx.strokeStyle = bg; ctx.lineWidth = Math.max(0.8, width); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();

  // Slightly randomized split angles
  const splitL = 0.38 + sn(depth * 3.7, depth) * 0.06;
  const splitR = 0.36 + sn(depth * 5.1, depth * 2) * 0.06;
  drawBranch(ctx, ex, ey, angle2 - splitL, length * 0.68, width * 0.64, time, depth - 1, windSway);
  drawBranch(ctx, ex, ey, angle2 + splitR, length * 0.62, width * 0.58, time, depth - 1, windSway);
}

function drawLeaf(ctx, x, y, size, color, rot, alpha) {
  if (size < 0.5) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y); ctx.rotate(rot);

  // Slightly irregular leaf shape (not perfectly symmetric)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(
    size * 0.95, -size * 0.52,
    size * 0.85,  size * 0.48,
    0,            size
  );
  ctx.bezierCurveTo(
    -size * 0.78, size * 0.48,
    -size * 0.92, -size * 0.52,
    0,            -size
  );
  ctx.fill();

  // Skip expensive overlay and veins on mobile for performance
  if (!IS_MOBILE) {
    // Translucent overlay for depth
    ctx.globalAlpha = clamp(alpha * 0.18, 0, 0.18);
    ctx.fillStyle = 'rgba(255,255,200,0.4)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.15, -size * 0.1, size * 0.28, size * 0.55, -0.3, 0, PI * 2);
    ctx.fill();
    ctx.globalAlpha = clamp(alpha, 0, 1);

    // Central vein
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -size * 0.8); ctx.lineTo(0, size * 0.8); ctx.stroke();
    // Side veins
    ctx.lineWidth = 0.35; ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    [-0.5, -0.2, 0.15, 0.45].forEach(t => {
      const vx = size * t * 0.6;
      const vy = size * t;
      ctx.beginPath(); ctx.moveTo(0, vy); ctx.lineTo(vx, vy - size * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, vy); ctx.lineTo(-vx, vy - size * 0.12); ctx.stroke();
    });
  }
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════
   VIBE PREVIEW ANIMATIONS (looped, on selection screen)
══════════════════════════════════════════════════════════ */
// Preview canvases loop slowly at ~15% melt progress to show the animation
let previewRaf       = null;
let previewLastFrame = 0;
// On mobile preview runs at 15fps to save battery and GPU
const PREVIEW_FPS      = IS_MOBILE ? 15 : 22;
const PREVIEW_INTERVAL = 1000 / PREVIEW_FPS;

const previews = {
  ice:    { canvas: $('preview-ice'),    ctx: null },
  candle: { canvas: $('preview-candle'), ctx: null },
  tree:   { canvas: $('preview-tree'),   ctx: null },
};

Object.entries(previews).forEach(([k, v]) => {
  v.ctx = v.canvas.getContext('2d');
});

const previewLeaves = [];
let previewLeavesInit = false;

function animatePreviews(ts) {
  // Always schedule next frame first so cancelAnimationFrame in goTo works
  previewRaf = requestAnimationFrame(animatePreviews);

  // Throttle: skip this frame if not enough time passed
  if (ts - previewLastFrame < PREVIEW_INTERVAL) return;
  previewLastFrame = ts;

  const t  = ts / 1000;
  const pp = 0.18 + sin(t * 0.12) * 0.08;

  Object.entries(previews).forEach(([vibe, {canvas, ctx}]) => {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (vibe === 'ice')    drawWaterBowl(ctx, W, H, pp, t);
    if (vibe === 'candle') drawCandle(ctx, W, H, pp, t);
    if (vibe === 'tree')   drawTree(ctx, W, H, pp, t);
  });
}

// Start preview loop
previewRaf = requestAnimationFrame(animatePreviews);


/* ══════════════════════════════════════════════════════════
   CONFETTI (subtle, premium — on completion)
══════════════════════════════════════════════════════════ */
const CONFETTI_COLORS = ['#6e63f5','#a78bfa','#7dd3f5','#f59e42','#6ee7b7','#f472b6','#facc15'];

function burstConfetti() {
  state.confettiParts = [];
  const CW = confCanvas.width, CH = confCanvas.height;
  const cx = CW / 2, cy = CH * 0.3;

  for (let i = 0; i < 80; i++) {
    const angle  = Math.random() * PI * 2;
    const speed  = 2 + Math.random() * 5;
    state.confettiParts.push({
      x:     cx + (Math.random() - 0.5) * 60,
      y:     cy,
      vx:    cos(angle) * speed,
      vy:    sin(angle) * speed - 3,
      gravity: 0.12 + Math.random() * 0.08,
      size:  3 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rot:   Math.random() * PI * 2,
      rotV:  (Math.random() - 0.5) * 0.15,
      alpha: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }

  tickConfetti();
}

function tickConfetti() {
  confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
  let alive = 0;

  state.confettiParts.forEach(p => {
    p.x   += p.vx;
    p.y   += p.vy;
    p.vy  += p.gravity;
    p.vx  *= 0.99;
    p.rot += p.rotV;
    p.alpha = Math.max(0, p.alpha - 0.007);
    if (p.alpha <= 0) return;
    alive++;

    confCtx.save();
    confCtx.globalAlpha = p.alpha;
    confCtx.fillStyle   = p.color;
    confCtx.translate(p.x, p.y);
    confCtx.rotate(p.rot);

    if (p.shape === 'rect') {
      confCtx.fillRect(-p.size/2, -p.size*0.4, p.size, p.size * 0.8);
    } else {
      confCtx.beginPath();
      confCtx.ellipse(0, 0, p.size * 0.5, p.size, 0, 0, PI * 2);
      confCtx.fill();
    }
    confCtx.restore();
  });

  if (alive > 0) {
    state.confettiRaf = requestAnimationFrame(tickConfetti);
  } else {
    confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
  }
}

/* ══════════════════════════════════════════════════════════
   AUDIO — Premium Procedural Ambient Soundscapes
   Each vibe has a rich multi-layer synthesis:
     • Rain (Water Bowl) — gentle patter, soft distant thunder, water drips
     • Fire (Candle)     — warm crackle, low roar, random pops, wood settling
     • Wind (Tree)       — forest breeze, leaf rustle, organic sway, soft chirps
══════════════════════════════════════════════════════════ */
function initAudioCtx() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
}

function stopAllSound() {
  // Clear scheduled drip/crackle intervals
  if (state._dripTimer)    { clearInterval(state._dripTimer);    state._dripTimer = null; }
  if (state._crackleTimer) { clearInterval(state._crackleTimer); state._crackleTimer = null; }
  if (state._chirpTimer)   { clearInterval(state._chirpTimer);   state._chirpTimer = null; }

  Object.values(state.audioNodes).forEach(n => {
    try { n.stop && n.stop(); }   catch(e) {}
    try { n.disconnect && n.disconnect(); } catch(e) {}
  });
  state.audioNodes = {};
}

function startAmbient(vibe) {
  initAudioCtx();
  stopAllSound();
  const ctx  = state.audioCtx;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  // Premium slow fade-in (3s)
  master.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 3.0);
  master.connect(ctx.destination);
  state.audioNodes.master = master;

  if (vibe === 'ice')    buildRain(ctx, master);
  if (vibe === 'candle') buildBonfire(ctx, master);
  if (vibe === 'tree')   buildForestBreeze(ctx, master);
}

/* ── Utility: noise buffer source ── */
function noise(ctx, seconds = 4) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true; src.start();
  return src;
}

/* ── Utility: brown noise (more natural than white) ── */
function brownNoise(ctx, seconds = 4) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + (0.2 * white)) / 1.02;
    d[i] = last * 0.8; // normalize to ±0.8 range
  }
  // Normalize to fill dynamic range
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < len; i++) d[i] = (d[i] / peak) * 0.9;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true; src.start();
  return src;
}

/* ── Utility: pink noise ── */
function pinkNoise(ctx, seconds = 4) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886*b0 + white*0.0555179;
    b1 = 0.99332*b1 + white*0.0750759;
    b2 = 0.96900*b2 + white*0.1538520;
    b3 = 0.86650*b3 + white*0.3104856;
    b4 = 0.55000*b4 + white*0.5329522;
    b5 = -0.7616*b5 - white*0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white*0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true; src.start();
  return src;
}

function biquad(ctx, type, freq, Q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = Q;
  return f;
}

/* ══════════════════════════════════════════════════════════
   🌧️ RAIN — Calming rain on water (for Water Bowl mode)
   Layers: steady rain bed, high patter, low distant rumble,
           random water drip impacts, deep sub-bass
══════════════════════════════════════════════════════════ */
function buildRain(ctx, dest) {
  const t = ctx.currentTime;

  // ── Layer 1: Steady rain bed (brown noise → bandpass = realistic patter) ──
  const rainBed = brownNoise(ctx, 6);
  const rainBP  = biquad(ctx, 'bandpass', 2200, 0.5);
  const rainLP  = biquad(ctx, 'lowpass', 6000, 0.7);
  const rainG   = ctx.createGain(); rainG.gain.value = 0.55;
  rainBed.connect(rainBP); rainBP.connect(rainLP); rainLP.connect(rainG); rainG.connect(dest);
  state.audioNodes.rainBed = rainBed;

  // ── Layer 2: High-frequency rain sparkle (light drops on surface) ──
  const sparkle   = noise(ctx, 3);
  const sparkBP   = biquad(ctx, 'bandpass', 5500, 1.2);
  const sparkG    = ctx.createGain(); sparkG.gain.value = 0.15;
  sparkle.connect(sparkBP); sparkBP.connect(sparkG); sparkG.connect(dest);
  state.audioNodes.sparkle = sparkle;

  // Gentle LFO on sparkle volume for organic feel
  const sparkLFO  = ctx.createOscillator(); sparkLFO.frequency.value = 0.12;
  const sparkLFOG = ctx.createGain(); sparkLFOG.gain.value = 0.03;
  sparkLFO.connect(sparkLFOG); sparkLFOG.connect(sparkG.gain); sparkLFO.start();
  state.audioNodes.sparkLFO = sparkLFO;

  // ── Layer 3: Low distant rumble (like rain on a roof, barely there) ──
  const rumble   = brownNoise(ctx, 8);
  const rumbleLP = biquad(ctx, 'lowpass', 180, 0.6);
  const rumbleG  = ctx.createGain(); rumbleG.gain.value = 0.22;
  rumble.connect(rumbleLP); rumbleLP.connect(rumbleG); rumbleG.connect(dest);
  state.audioNodes.rumble = rumble;

  // Slow breathing swell on the rumble
  const rumbleLFO  = ctx.createOscillator(); rumbleLFO.frequency.value = 0.04;
  const rumbleLFOG = ctx.createGain(); rumbleLFOG.gain.value = 0.06;
  rumbleLFO.connect(rumbleLFOG); rumbleLFOG.connect(rumbleG.gain); rumbleLFO.start();
  state.audioNodes.rumbleLFO = rumbleLFO;

  // ── Layer 4: Sub-bass presence (warmth, like indoor rain feeling) ──
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 42;
  const subG = ctx.createGain(); subG.gain.value = 0.10;
  sub.connect(subG); subG.connect(dest); sub.start();
  state.audioNodes.sub = sub;

  // ── Layer 5: Random water drip impacts (scheduled impulses) ──
  state._dripTimer = setInterval(() => {
    if (!state.audioCtx || state.audioCtx.state === 'closed') return;
    const now = ctx.currentTime;
    // Create a short impulse filtered to sound like a drop hitting water
    const dripLen = ctx.sampleRate * 0.08;
    const dripBuf = ctx.createBuffer(1, dripLen, ctx.sampleRate);
    const dd = dripBuf.getChannelData(0);
    for (let i = 0; i < dripLen; i++) {
      dd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (dripLen * 0.12));
    }
    const drip = ctx.createBufferSource(); drip.buffer = dripBuf;
    const dripBP = biquad(ctx, 'bandpass', 800 + Math.random() * 1600, 3);
    const dripG  = ctx.createGain();
    dripG.gain.setValueAtTime(0.04 + Math.random() * 0.06, now);
    dripG.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    drip.connect(dripBP); dripBP.connect(dripG); dripG.connect(dest);
    drip.start(now); drip.stop(now + 0.18);
  }, 400 + Math.random() * 600);

  // ── Layer 6: Very slow rain intensity swell ──
  const mainLFO  = ctx.createOscillator(); mainLFO.frequency.value = 0.025;
  const mainLFOG = ctx.createGain(); mainLFOG.gain.value = 0.08;
  mainLFO.connect(mainLFOG); mainLFOG.connect(rainG.gain); mainLFO.start();
  state.audioNodes.mainLFO = mainLFO;
}

/* ══════════════════════════════════════════════════════════
   🔥 BONFIRE — Warm crackling fire (for Candle mode)
   Layers: base roar, mid crackle, random pops/snaps,
           low warmth drone, gentle sway
══════════════════════════════════════════════════════════ */
function buildBonfire(ctx, dest) {
  const t = ctx.currentTime;

  // ── Layer 1: Fire base roar (brown noise → lowpass = deep warm body) ──
  const roar   = brownNoise(ctx, 6);
  const roarLP = biquad(ctx, 'lowpass', 280, 0.8);
  const roarG  = ctx.createGain(); roarG.gain.value = 0.45;
  roar.connect(roarLP); roarLP.connect(roarG); roarG.connect(dest);
  state.audioNodes.roar = roar;

  // ── Layer 2: Mid-frequency crackle (noise → bandpass 800-2500Hz) ──
  const crackleNoise = noise(ctx, 3);
  const crackleBP    = biquad(ctx, 'bandpass', 1600, 1.8);
  const crackleG     = ctx.createGain(); crackleG.gain.value = 0.28;
  crackleNoise.connect(crackleBP); crackleBP.connect(crackleG); crackleG.connect(dest);
  state.audioNodes.crackleNoise = crackleNoise;

  // Fast jittery LFO to create crackle rhythm (irregular volume modulation)
  const crackleLFO  = ctx.createOscillator(); crackleLFO.frequency.value = 5.5;
  const crackleLFOG = ctx.createGain(); crackleLFOG.gain.value = 0.12;
  crackleLFO.connect(crackleLFOG); crackleLFOG.connect(crackleG.gain); crackleLFO.start();
  state.audioNodes.crackleLFO = crackleLFO;

  // Second LFO at incommensurate frequency for natural irregularity
  const crackleLFO2  = ctx.createOscillator(); crackleLFO2.frequency.value = 3.7;
  const crackleLFO2G = ctx.createGain(); crackleLFO2G.gain.value = 0.08;
  crackleLFO2.connect(crackleLFO2G); crackleLFO2G.connect(crackleG.gain); crackleLFO2.start();
  state.audioNodes.crackleLFO2 = crackleLFO2;

  // ── Layer 3: High sparkle (thin texture of fire—ember hiss) ──
  const ember   = noise(ctx, 2);
  const emberBP = biquad(ctx, 'bandpass', 4500, 2.5);
  const emberG  = ctx.createGain(); emberG.gain.value = 0.08;
  ember.connect(emberBP); emberBP.connect(emberG); emberG.connect(dest);
  state.audioNodes.ember = ember;

  // ── Layer 4: Deep warmth sub-bass drone ──
  const warmth = ctx.createOscillator(); warmth.type = 'sine'; warmth.frequency.value = 58;
  const warmG  = ctx.createGain(); warmG.gain.value = 0.12;
  warmth.connect(warmG); warmG.connect(dest); warmth.start();
  state.audioNodes.warmth = warmth;

  // ── Layer 5: Random pop/snap impulses (wood cracking) ──
  state._crackleTimer = setInterval(() => {
    if (!state.audioCtx || state.audioCtx.state === 'closed') return;
    const now = ctx.currentTime;
    // Short sharp impulse = snapping wood pop
    const popLen = ctx.sampleRate * (0.02 + Math.random() * 0.03);
    const popBuf = ctx.createBuffer(1, popLen, ctx.sampleRate);
    const pd = popBuf.getChannelData(0);
    for (let i = 0; i < popLen; i++) {
      pd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (popLen * 0.08)) * 1.5;
    }
    const pop   = ctx.createBufferSource(); pop.buffer = popBuf;
    const popBP = biquad(ctx, 'bandpass', 1000 + Math.random() * 3000, 2 + Math.random() * 3);
    const popG  = ctx.createGain();
    const vol = 0.06 + Math.random() * 0.10;
    popG.gain.setValueAtTime(vol, now);
    popG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    pop.connect(popBP); popBP.connect(popG); popG.connect(dest);
    pop.start(now); pop.stop(now + 0.12);
  }, 200 + Math.random() * 500);

  // ── Layer 6: Slow intensity sway (fire breathing) ──
  const swayLFO  = ctx.createOscillator(); swayLFO.frequency.value = 0.065;
  const swayLFOG = ctx.createGain(); swayLFOG.gain.value = 0.06;
  swayLFO.connect(swayLFOG); swayLFOG.connect(roarG.gain); swayLFO.start();
  state.audioNodes.swayLFO = swayLFO;

  // Second sway on crackle layer
  const swayLFO2  = ctx.createOscillator(); swayLFO2.frequency.value = 0.11;
  const swayLFO2G = ctx.createGain(); swayLFO2G.gain.value = 0.04;
  swayLFO2.connect(swayLFO2G); swayLFO2G.connect(crackleG.gain); swayLFO2.start();
  state.audioNodes.swayLFO2 = swayLFO2;
}

/* ══════════════════════════════════════════════════════════
   🌿 FOREST BREEZE — Wind through leaves (for Tree mode)
   Layers: base wind, high leaf rustle, low hum,
           gentle sway, random soft chirp accents
══════════════════════════════════════════════════════════ */
function buildForestBreeze(ctx, dest) {
  const t = ctx.currentTime;

  // ── Layer 1: Base wind body (pink noise → bandpass = smooth breeze) ──
  const wind   = pinkNoise(ctx, 6);
  const windBP = biquad(ctx, 'bandpass', 450, 0.3);
  const windLP = biquad(ctx, 'lowpass', 2000, 0.5);
  const windG  = ctx.createGain(); windG.gain.value = 0.45;
  wind.connect(windBP); windBP.connect(windLP); windLP.connect(windG); windG.connect(dest);
  state.audioNodes.wind = wind;

  // Organic sway: very slow LFO modulates wind volume like gusts coming and going
  const gustLFO  = ctx.createOscillator(); gustLFO.frequency.value = 0.05;
  const gustLFOG = ctx.createGain(); gustLFOG.gain.value = 0.12;
  gustLFO.connect(gustLFOG); gustLFOG.connect(windG.gain); gustLFO.start();
  state.audioNodes.gustLFO = gustLFO;

  // Second gust layer at different frequency for complexity
  const gustLFO2  = ctx.createOscillator(); gustLFO2.frequency.value = 0.028;
  const gustLFO2G = ctx.createGain(); gustLFO2G.gain.value = 0.07;
  gustLFO2.connect(gustLFO2G); gustLFO2G.connect(windG.gain); gustLFO2.start();
  state.audioNodes.gustLFO2 = gustLFO2;

  // ── Layer 2: Leaf rustle (high-frequency noise → bandpass = dry rustling) ──
  const rustle   = noise(ctx, 3);
  const rustleBP = biquad(ctx, 'bandpass', 3800, 1.5);
  const rustleG  = ctx.createGain(); rustleG.gain.value = 0.15;
  rustle.connect(rustleBP); rustleBP.connect(rustleG); rustleG.connect(dest);
  state.audioNodes.rustle = rustle;

  // Rustle sways with the wind gusts
  const rustleLFO  = ctx.createOscillator(); rustleLFO.frequency.value = 0.07;
  const rustleLFOG = ctx.createGain(); rustleLFOG.gain.value = 0.06;
  rustleLFO.connect(rustleLFOG); rustleLFOG.connect(rustleG.gain); rustleLFO.start();
  state.audioNodes.rustleLFO = rustleLFO;

  // ── Layer 3: Distant atmosphere / low forest hum ──
  const hum   = brownNoise(ctx, 8);
  const humLP = biquad(ctx, 'lowpass', 120, 0.4);
  const humG  = ctx.createGain(); humG.gain.value = 0.18;
  hum.connect(humLP); humLP.connect(humG); humG.connect(dest);
  state.audioNodes.hum = hum;

  // ── Layer 4: Gentle harmonic tones (like wind singing through branches) ──
  // Creates an ethereal, meditative quality
  [220, 330, 392].forEach((freq, i) => {
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const g   = ctx.createGain(); g.gain.value = 0.012;
    osc.connect(g); g.connect(dest); osc.start();
    state.audioNodes['tone' + i] = osc;
    // Slow volume oscillation per tone for shimmering effect
    const toneLFO  = ctx.createOscillator(); toneLFO.frequency.value = 0.03 + i * 0.015;
    const toneLFOG = ctx.createGain(); toneLFOG.gain.value = 0.004;
    toneLFO.connect(toneLFOG); toneLFOG.connect(g.gain); toneLFO.start();
    state.audioNodes['toneLFO' + i] = toneLFO;
  });

  // ── Layer 5: Random soft bird chirp accents ──
  // Very subtle, 1-2 note chirps every 4-8 seconds. Adds life without distraction.
  state._chirpTimer = setInterval(() => {
    if (!state.audioCtx || state.audioCtx.state === 'closed') return;
    // Only chirp sometimes (50% chance each cycle)
    if (Math.random() > 0.5) return;
    const now = ctx.currentTime;
    // Short sine sweep = chirp
    const chirp = ctx.createOscillator(); chirp.type = 'sine';
    const baseFreq = 2800 + Math.random() * 1800;
    chirp.frequency.setValueAtTime(baseFreq, now);
    chirp.frequency.exponentialRampToValueAtTime(baseFreq * (1.15 + Math.random() * 0.3), now + 0.06);
    chirp.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + 0.12);
    const chirpG = ctx.createGain();
    chirpG.gain.setValueAtTime(0, now);
    chirpG.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.008, now + 0.02);
    chirpG.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    chirp.connect(chirpG); chirpG.connect(dest);
    chirp.start(now); chirp.stop(now + 0.18);

    // Optionally a second note (2-note phrase)
    if (Math.random() > 0.4) {
      const chirp2 = ctx.createOscillator(); chirp2.type = 'sine';
      const f2 = baseFreq * (0.8 + Math.random() * 0.5);
      chirp2.frequency.setValueAtTime(f2, now + 0.18);
      chirp2.frequency.exponentialRampToValueAtTime(f2 * 1.1, now + 0.24);
      const chirp2G = ctx.createGain();
      chirp2G.gain.setValueAtTime(0, now + 0.16);
      chirp2G.gain.linearRampToValueAtTime(0.008 + Math.random() * 0.006, now + 0.20);
      chirp2G.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
      chirp2.connect(chirp2G); chirp2G.connect(dest);
      chirp2.start(now + 0.16); chirp2.stop(now + 0.35);
    }
  }, 4000 + Math.random() * 4000);
}

btnSound.addEventListener('click', () => {
  if (state.soundOn) {
    stopAllSound();
    state.soundOn = false;
  } else {
    startAmbient(state.vibe);
    state.soundOn = true;
  }
  syncSoundIcon();
});

function syncSoundIcon() {
  iconOn.style.display  = state.soundOn ? 'block' : 'none';
  iconOff.style.display = state.soundOn ? 'none'  : 'block';
}

/* ══════════════════════════════════════════════════════════
   Fullscreen
══════════════════════════════════════════════════════════ */
function tryFullscreen() {
  const el = document.documentElement;
  try {
    if      (el.requestFullscreen)         el.requestFullscreen();
    else if (el.webkitRequestFullscreen)   el.webkitRequestFullscreen();
  } catch(e) {}
}
function exitFullscreen() {
  try {
    if      (document.exitFullscreen)        document.exitFullscreen();
    else if (document.webkitExitFullscreen)  document.webkitExitFullscreen();
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════════
   Time formatter
══════════════════════════════════════════════════════════ */
function fmt(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
}

/* ── Init sound icon state ── */
syncSoundIcon();
