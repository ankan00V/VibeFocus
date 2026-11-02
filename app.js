/* ══════════════════════════════════════════════════════════
   VibeFocus — app.js v2
   Screen transitions · Canvas animations · Web Audio · Confetti
══════════════════════════════════════════════════════════ */

'use strict';

/* ── Hide Spline "Built with Spline" watermark ──────── */
(function hideSplineLogo() {
  function removeLogo() {
    const viewer = document.getElementById('spline-bg');
    if (!viewer || !viewer.shadowRoot) return false;
    const logo = viewer.shadowRoot.querySelector('#logo');
    const logoEl = logo || viewer.shadowRoot.querySelector('a[href*="spline"]');
    if (logoEl) {
      logoEl.style.display = 'none';
      return true;
    }
    return false;
  }

  // Try immediately, then poll for up to 10 seconds (Spline loads async)
  if (!removeLogo()) {
    let attempts = 0;
    const interval = setInterval(() => {
      if (removeLogo() || ++attempts > 40) clearInterval(interval);
    }, 250);
  }
})();

/* ── PiP Proxy (Fixes Safari WebGL captureStream bugs) ──
   A 2D canvas that mirrors the active visual plus the countdown; its
   captureStream feeds the hidden <video> that is shown in Picture-in-Picture. */
const pipProxyCanvas = document.createElement('canvas');
pipProxyCanvas.id = 'pip-proxy-canvas';
pipProxyCanvas.width = 960;
pipProxyCanvas.height = 540;
// Make it part of the render tree but invisible so Safari captureStream works
pipProxyCanvas.style.position = 'fixed';
pipProxyCanvas.style.top = '-9999px';
pipProxyCanvas.style.left = '-9999px';
pipProxyCanvas.style.pointerEvents = 'none';
const pipProxyCtx = pipProxyCanvas.getContext('2d', { alpha: false });
pipProxyCtx.fillStyle = '#000';
pipProxyCtx.fillRect(0, 0, pipProxyCanvas.width, pipProxyCanvas.height);
// Some browsers require the canvas in the DOM for captureStream
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(pipProxyCanvas));

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

/* ── Web Worker for Background Animation Loop ── */
let focusWorker = null;
try {
  const workerCode = `
    let intervalId = null;
    self.onmessage = function(e) {
      if (e.data === 'start') {
        if (!intervalId) intervalId = setInterval(() => self.postMessage('tick'), 33); // ~30 FPS
      } else if (e.data === 'stop') {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  focusWorker = new Worker(URL.createObjectURL(blob));
  focusWorker.onmessage = () => {
    tickFocus(performance.now());
  };
} catch (e) {
  console.warn("Web Worker PiP fallback disabled", e);
}

/* ── DOM ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const screens   = { hero: $('screen-hero'), vibe: $('screen-vibe'), duration: $('screen-duration'), focus: $('screen-focus'), complete: $('screen-complete') };
const focusCanvas  = $('focus-canvas');
const focusCtx     = focusCanvas.getContext('2d');
const confCanvas   = $('confetti-canvas');
const confCtx      = confCanvas.getContext('2d');
const completeCanvas = $('complete-canvas');
let completeCtx = null;
let completeAnimationId = null;
const hud          = $('focus-hud');
const hudFill      = $('hud-progress-fill');
const hudTime      = $('hud-time-left');
const btnSound     = $('btn-sound');
const iconOn       = $('icon-sound-on');
const iconOff      = $('icon-sound-off');
const btnExit      = $('btn-exit-focus');
const btnPip       = $('btn-pip');
const btnFullscreenToggle = $('btn-fullscreen-toggle');
const pipVideo     = $('pip-video');
const btnStart     = $('btn-start');
const btnBack      = $('btn-back-vibe');
const btnRestart   = $('btn-restart');
const vibeLabel    = $('selected-vibe-label');
const completeStat = $('complete-time-display');
const fadeOverlay  = $('fade-overlay');

/* ══════════════════════════════════════════════════════════
   SCREEN 0 — Landing hero (sunny hillside)
   The scene is one still plate plus a looping video of it;
   only the UI is animated here.
══════════════════════════════════════════════════════════ */
const btnHowItWorks = document.querySelectorAll('.btn-how-it-works');
const hiwModal = document.getElementById('how-it-works-modal');
const hiwCloseBtn = document.getElementById('hiw-close-btn');
const lpRoot = document.getElementById('lp');
const lpVideo = lpRoot ? lpRoot.querySelector('.lp-video') : null;
const prefersReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Hero vibe ids (data-vid) → app vibe + display label for the duration screen
const HERO_VIBES = [
  { vibe: 'candle',  label: 'Candle' },
  { vibe: 'ice',     label: 'Water Bowl' },
  { vibe: 'tree',    label: 'Tree' },
  { vibe: 'gallery', label: 'Gallery' }
];

function startHeroFocusSession(vidId = 0) {
  const entry = HERO_VIBES[vidId] || HERO_VIBES[0];
  state.vibe = entry.vibe;

  // Keep the (hidden) vibe picker in sync
  document.querySelectorAll('.vibe-card').forEach(c => c.classList.remove('selected'));
  const selectedBtn = document.getElementById('vibe-' + state.vibe);
  if (selectedBtn) selectedBtn.classList.add('selected');

  vibeLabel.textContent = entry.label.toUpperCase();

  // Reset any previous duration selection
  document.querySelectorAll('.dur-pill').forEach(p => p.classList.remove('selected'));
  const screenDuration = document.getElementById('screen-duration');
  if (screenDuration) {
    Array.from(screenDuration.classList).filter(c => c.startsWith('dur-selected-')).forEach(c => screenDuration.classList.remove(c));
  }
  state.minutes = null;
  if (btnStart) btnStart.disabled = true;
  updateDialCustom('');

  const bodyEl = document.body;
  Array.from(bodyEl.classList).filter(c => c.startsWith('vibe-selected-')).forEach(c => bodyEl.classList.remove(c));
  bodyEl.classList.add('vibe-selected-' + state.vibe);

  const variantSubtitles = {
    candle: 'Set how long the flame will burn.',
    tree: 'Set how long the roots will grow.',
    ice: 'Set how long the stillness will last.',
    gallery: 'Set how long the canvas will reveal.'
  };
  const durSubtitle = document.getElementById('dur-variant-subtitle');
  if (durSubtitle) durSubtitle.textContent = variantSubtitles[state.vibe] || 'Select a duration to allocate your attention.';

  if (typeof gtag === 'function') gtag('event', 'vibe_selected', { vibe: state.vibe, source: 'hero' });

  goTo('duration', true);
}

// Vibe cards → that vibe's duration screen
document.querySelectorAll('.lp-card[data-vid]').forEach(card => {
  card.addEventListener('click', () => startHeroFocusSession(parseInt(card.dataset.vid, 10) || 0));
});

// "Start focus" (nav + hero) → scroll down to "Pick your vibe" and point at the cards
function showVibeCards() {
  const hero = screens.hero;
  const title = document.getElementById('lp-vibes-title');
  const cardsList = document.getElementById('lp-cards');
  if (!hero || !title || !cardsList) return;
  const heroTop = hero.getBoundingClientRect().top;
  const titleTop = title.getBoundingClientRect().top - heroTop + hero.scrollTop;
  const cardsBottom = cardsList.getBoundingClientRect().bottom - heroTop + hero.scrollTop;
  const view = hero.clientHeight;
  // Fit the title and the cards if they fit, otherwise lead with the title
  let target = cardsBottom - titleTop + 72 <= view ? cardsBottom + 36 - view : titleTop - 24;
  target = Math.max(0, Math.min(target, hero.scrollHeight - view));
  hero.scrollTo({ top: target, behavior: prefersReducedMotion ? 'auto' : 'smooth' });

  const cards = Array.from(cardsList.querySelectorAll('.lp-card'));
  if (cards[0]) cards[0].focus({ preventScroll: true });
  if (prefersReducedMotion) return;
  const lift = Math.max(4, (cardsList.getBoundingClientRect().width / 1175) * 10);
  cards.forEach((card, i) => {
    setTimeout(() => {
      card.classList.add('is-nudged');
      card.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(${-lift}px)` }, { transform: 'translateY(0)' }],
        { duration: 650, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      setTimeout(() => card.classList.remove('is-nudged'), 900);
    }, 420 + i * 110);
  });
}
document.querySelectorAll('.js-start-focus').forEach(btn => {
  btn.addEventListener('click', showVibeCards);
});

// How it works modal
function closeHiwModal() {
  if (!hiwModal) return;
  hiwModal.classList.remove('active');
  hiwModal.setAttribute('aria-hidden', 'true');
}
btnHowItWorks.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (hiwModal) {
      hiwModal.classList.add('active');
      hiwModal.setAttribute('aria-hidden', 'false');
    }
  });
});
if (hiwCloseBtn) hiwCloseBtn.addEventListener('click', closeHiwModal);
if (hiwModal) {
  hiwModal.addEventListener('click', (e) => { if (e.target === hiwModal) closeHiwModal(); });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && hiwModal && hiwModal.classList.contains('active')) closeHiwModal();
});

// ── Scene video: loops over the still plate (skipped for reduced motion) ──
function playHeroVideo() {
  if (!lpVideo || prefersReducedMotion) return;
  if (!lpVideo.src && lpVideo.dataset.src) {
    const small = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
    lpVideo.src = (small && lpVideo.dataset.srcSmall) || lpVideo.dataset.src;
    lpVideo.addEventListener('playing', () => lpVideo.classList.add('is-playing'), { once: true });
  }
  lpVideo.muted = true;
  const p = lpVideo.play();
  if (p && p.catch) p.catch(() => {});
}
function pauseHeroVideo() {
  if (lpVideo && !lpVideo.paused) lpVideo.pause();
}
function syncHeroVideo() {
  const heroActive = screens.hero && screens.hero.classList.contains('active');
  if (heroActive && !document.hidden) playHeroVideo(); else pauseHeroVideo();
}
document.addEventListener('visibilitychange', syncHeroVideo);
// Strict autoplay browsers: retry on first interaction
document.addEventListener('pointerdown', syncHeroVideo, { once: true });
syncHeroVideo();

// ── Entrance: one Web Animations timeline, run once ──
function runHeroEntrance() {
  const root = document.documentElement;
  if (!lpRoot || !root.classList.contains('lp-js')) return;
  const reveal = () => root.classList.remove('lp-js');
  if (prefersReducedMotion || typeof lpRoot.animate !== 'function') { reveal(); return; }

  const u = lpRoot.getBoundingClientRect().width / 1440 || 1;
  const px = n => `${(n * u).toFixed(2)}px`;
  const spring = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const outExpo = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const steps = [];
  const add = (el, keyframes, opts) => { if (el) steps.push([el, keyframes, opts]); };
  const q = sel => lpRoot.querySelector(sel);
  const qa = sel => Array.from(lpRoot.querySelectorAll(sel));

  // 1. Logo, nav and the top CTA drop in
  [q('.lp-logo'), q('.lp-navpill'), q('.lp-cta-top')].forEach((el, i) => add(el,
    [{ opacity: 0, transform: `translateY(${px(-22)})` }, { opacity: 1, transform: 'translateY(0)' }],
    { delay: 80 + i * 70, duration: 700, easing: outExpo }));

  // 2. Kicker un-blurs
  add(q('.lp-kicker'),
    [{ opacity: 0, filter: 'blur(12px)' }, { opacity: 1, filter: 'blur(0px)' }],
    { delay: 320, duration: 800, easing: 'ease-out' });

  // 3. Headline lines spring up out of a blur, 0.16s apart
  qa('.lp-line').forEach((el, i) => add(el,
    [{ opacity: 0, transform: `translateY(${px(46)}) scale(0.96)`, filter: 'blur(10px)' },
     { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' }],
    { delay: 520 + i * 160, duration: 900, easing: spring }));

  // 4. Then the subline, both buttons, the vibes title + link and the cards rise in turn
  const rising = [q('.lp-sub'), ...qa('.lp-actions > *'), q('.lp-vibes-title'), q('.lp-vibes-link'), ...qa('.lp-card')];
  rising.forEach((el, i) => add(el,
    [{ opacity: 0, transform: `translateY(${px(26)})` }, { opacity: 1, transform: 'translateY(0)' }],
    { delay: 980 + i * 90, duration: 750, easing: outExpo }));

  // fill:'backwards' holds the first frame through each delay; afterwards the
  // element falls back to its own CSS, so hover transforms keep working.
  steps.forEach(([el, kf, opts]) => el.animate(kf, { ...opts, fill: 'backwards' }));
  reveal();
}
runHeroEntrance();

/* ══════════════════════════════════════════════════════════
   Screen Transition
══════════════════════════════════════════════════════════ */
let screenTransitionTimeout = null;

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

  if (screenTransitionTimeout) {
    clearTimeout(screenTransitionTimeout);
    screenTransitionTimeout = null;
  }

  return new Promise(resolve => {
    const current = Object.values(screens).find(s => s && s.classList.contains('active'));

    // Fade overlay to black
    fadeOverlay.classList.add('show');

    screenTransitionTimeout = setTimeout(() => {
      screenTransitionTimeout = null;
      if (current) {
        current.classList.remove('active');
        if (zoomExit) {
          current.classList.add('exit-zoom');
          setTimeout(() => current.classList.remove('exit-zoom'), 600);
        }
      }
      screens[name].classList.add('active');

      // The hero scene video only runs while the hero is on screen
      syncHeroVideo();

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
    preloadAmbient(state.vibe);
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
/* Helper to manage duration selection classes */
function selectDurationPill(pill) {
  document.querySelectorAll('.dur-pill').forEach(p => p.classList.remove('selected'));
  pill.classList.add('selected');
  
  const screenDuration = document.getElementById('screen-duration');
  if (screenDuration) {
    const classesToRemove = Array.from(screenDuration.classList).filter(c => c.startsWith('dur-selected-'));
    classesToRemove.forEach(c => screenDuration.classList.remove(c));
    
    let valSuffix = '';
    if (pill.id === 'dur-custom') {
      valSuffix = 'custom';
    } else {
      valSuffix = pill.dataset.minutes;
    }
    screenDuration.classList.add('dur-selected-' + valSuffix);
  }
}

document.querySelectorAll('.dur-pill').forEach(pill => {
  pill.addEventListener('click', (e) => {
    selectDurationPill(pill);
    
    if (pill.id === 'dur-custom') {
      const input = document.getElementById('custom-minutes');
      let val = parseInt(input.value, 10);
      if (isNaN(val) || input.value.trim() === '') {
        state.minutes = null;
        updateDialCustom('');
        if (btnStart) btnStart.disabled = true;
      } else {
        state.minutes = val;
        updateDialCustom(val);
        if (btnStart) btnStart.disabled = false;
      }
      if (e.target !== input) input.focus();
    } else {
      state.minutes = parseInt(pill.dataset.minutes, 10);
      if (btnStart) btnStart.disabled = false;
    }
  });

  pill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.key === ' ') {
        e.preventDefault();
      }
      pill.click();
    }
  });
});

/* Helper to update dial display for custom minutes */
function updateDialCustom(val) {
  const dialTime = document.querySelector('.dial-display-time');
  if (dialTime) {
    dialTime.setAttribute('data-custom-val', val || '—');
  }
}

const customInput = document.getElementById('custom-minutes');
if (customInput) {
  const handleCustomActive = (e) => {
    const customPill = document.getElementById('dur-custom');
    if (customPill) {
      selectDurationPill(customPill);
    }
    
    let val = parseInt(customInput.value, 10);
    
    // Only perform bounds adjustment on actual input event to allow user to type
    if (e.type === 'input' && !isNaN(val)) {
      if (val > 120) { 
        val = 120; 
        customInput.value = 120; 
        showToast("Even the deepest focus needs rest. 120 minutes is the limit. Breathe, reset, and return when ready.");
      }
      if (val < 1) { 
        val = 1; 
        customInput.value = 1; 
      }
    }
    
    if (isNaN(val) || customInput.value.trim() === '') {
      state.minutes = null;
      updateDialCustom('');
      if (btnStart) btnStart.disabled = true;
    } else {
      state.minutes = val;
      updateDialCustom(val);
      if (btnStart) btnStart.disabled = false;
    }
  };

  customInput.addEventListener('focus', handleCustomActive);
  customInput.addEventListener('input', handleCustomActive);
}

btnBack.addEventListener('click', () => goTo('hero'));

btnStart.addEventListener('click', () => {
  if (!state.minutes) return;
  state.totalSeconds = state.minutes * 60;
  state.startTime    = null;
  
  // Important for iOS/Safari: init/resume AudioContext directly in click handler
  unlockAudioCtx();
  
  // Important for Safari PiP: Set up and play the proxy stream directly in the click handler
  // BEFORE any async/await boundaries, so the user gesture token is preserved.
  if (pipVideo && typeof pipProxyCanvas.captureStream === 'function') {
    try {
      sizePipProxy();
      paintPipProxy(fmt(state.totalSeconds), performance.now(), true);
      if (!pipVideo.srcObject) {
        pipVideo.srcObject = pipProxyCanvas.captureStream(30);
      }
      pipVideo.play().catch(e => console.warn("pipVideo play failed:", e));
    } catch(err) {
      console.warn("captureStream failed", err);
    }
  }

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
  if (typeof resetCandle3D === 'function') resetCandle3D();
  if (typeof resetTree3D === 'function') resetTree3D();
  if (typeof drawTree === 'function') {
    drawTree._motes    = null;
    drawTree._lastGust = -1;   // reset gust timer so first gust fires at t=50s
  }
  if (typeof GALLERY !== 'undefined') { GALLERY.initd = false; }
  await goTo('focus');
  resizeFocusCanvas();
  tryFullscreen();

  if (state.soundOn) {
    startAmbient(state.vibe);
    syncSoundIcon();
  }

  state.startTime = performance.now();
  if (focusWorker) {
    focusWorker.postMessage('start');
  } else {
    state.rafId = requestAnimationFrame(tickFocus);
  }
  showHud();
}

function isPipActive() {
  return !!pipVideo && (document.pictureInPictureElement === pipVideo ||
    pipVideo.webkitPresentationMode === 'picture-in-picture');
}

// Match the PiP window to the screen shape (portrait phones get a portrait
// window), within the aspect range browsers accept for PiP.
function sizePipProxy() {
  const a = Math.max(9 / 16, Math.min(16 / 9, window.innerWidth / Math.max(1, window.innerHeight)));
  const w = a >= 1 ? 960 : Math.round(960 * a);
  const h = a >= 1 ? Math.round(960 / a) : 960;
  if (pipProxyCanvas.width !== w || pipProxyCanvas.height !== h) {
    pipProxyCanvas.width = w;
    pipProxyCanvas.height = h;
  }
}

let _lastPipPaint = 0;
function paintPipProxy(timeStr, now, force = false) {
  const active = isPipActive();
  // Full rate while in PiP; a light 4 fps keep-alive otherwise
  if (!force && !active && now - _lastPipPaint < 250) return;
  _lastPipPaint = now;

  let src = focusCanvas;
  if (state.vibe === 'ice') src = document.getElementById('water-bowl-canvas');
  if (state.vibe === 'tree') src = document.getElementById('tree-canvas');
  if (state.vibe === 'candle') src = document.getElementById('candle-canvas');
  const W = pipProxyCanvas.width, H = pipProxyCanvas.height;
  const x = pipProxyCtx;
  try {
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    if (src && src.width > 0 && src.height > 0) {
      // cover-fit so the visual fills the PiP window
      const sa = src.width / src.height, pa = W / H;
      let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (sa > pa) { sw = src.height * pa; sx = (src.width - sw) / 2; }
      else { sh = src.width / pa; sy = (src.height - sh) / 2; }
      x.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
    }
    // Countdown pill
    const fs = Math.round(Math.min(W, H) * 0.075);
    const pw = fs * 4.2, ph = fs * 1.7;
    const px = (W - pw) / 2, py = H - ph - Math.min(W, H) * 0.06;
    x.fillStyle = 'rgba(0, 0, 0, 0.45)';
    x.beginPath();
    if (x.roundRect) x.roundRect(px, py, pw, ph, ph / 2); else x.rect(px, py, pw, ph);
    x.fill();
    x.fillStyle = '#fff';
    x.font = `500 ${fs}px Inter, -apple-system, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(timeStr, W / 2, py + ph / 2 + 1);
  } catch (err) {
    console.warn('PiP proxy canvas draw failed:', err);
  }
}

function tickFocus(now) {
  // Mobile frame throttle: skip frame if not enough time has passed
  if (IS_MOBILE && now - _lastFocusFrame < TARGET_FRAME_MS) {
    if (!focusWorker) state.rafId = requestAnimationFrame(tickFocus);
    return;
  }
  _lastFocusFrame = now;

  // Stall the timer from starting if the painting is still fetching
  if (state.vibe === 'gallery' && typeof GALLERY !== 'undefined' && !GALLERY.loaded) {
    state.startTime = now;
  }

  const elapsed  = Math.min((now - state.startTime) / 1000, state.totalSeconds);
  const prog = elapsed / state.totalSeconds;

  // NOTE: resizeFocusCanvas() NOT called every frame — only on resize event

  // Draw
  drawVibe(focusCtx, focusCanvas.width / RENDER_DPR, focusCanvas.height / RENDER_DPR, prog, state.vibe, now / 1000, state.totalSeconds);

  // HUD
  const remaining = Math.max(0, state.totalSeconds - elapsed);
  const timeStr = fmt(Math.ceil(remaining - 1e-6));
  hudTime.textContent = timeStr;
  hudFill.style.width = (prog * 100).toFixed(2) + '%';
  hudFill.setAttribute('aria-valuenow', Math.round(prog * 100));

  // Keep the Picture-in-Picture feed live for the whole session. Mobile
  // browsers only allow PiP on a video that already has frames when the
  // user taps, so the feed must not wait until PiP is active.
  paintPipProxy(timeStr, now);

  if (elapsed >= state.totalSeconds) {
    onSessionComplete();
    return;
  }

  if (!focusWorker) {
    state.rafId = requestAnimationFrame(tickFocus);
  }
}

function onSessionComplete() {
  if (focusWorker) focusWorker.postMessage('stop');
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  stopAllSound();
  exitFullscreen();
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(e => console.warn('Failed to exit PiP', e));
  } else if (typeof pipVideo !== 'undefined' && pipVideo && pipVideo.webkitPresentationMode === "picture-in-picture") {
    pipVideo.webkitSetPresentationMode("inline");
  }

  // GA4: track session completion
  if (typeof gtag === 'function') {
    gtag('event', 'session_completed', { vibe: state.vibe, duration_minutes: state.minutes });
  }

  completeStat.textContent = state.minutes + (state.minutes === 1 ? ' minute' : ' minutes');
  
  // Add fallback state classes for complete screen and body
  const completeScreen = document.getElementById('screen-complete');
  if (completeScreen) {
    const classesToRemove = Array.from(completeScreen.classList).filter(c => c.startsWith('vibe-selected-'));
    classesToRemove.forEach(c => completeScreen.classList.remove(c));
    completeScreen.classList.add('vibe-selected-' + state.vibe);
  }
  const bodyEl = document.body;
  if (bodyEl) {
    const bodyClassesToRemove = Array.from(bodyEl.classList).filter(c => c.startsWith('vibe-selected-'));
    bodyClassesToRemove.forEach(c => bodyEl.classList.remove(c));
    bodyEl.classList.add('vibe-selected-' + state.vibe);
  }

  goTo('complete').then(() => {
    resizeConfettiCanvas();
    burstConfetti();
    startCompleteLoop();
  });
}

function stopSession() {
  if (focusWorker) focusWorker.postMessage('stop');
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  if (completeAnimationId) {
    cancelAnimationFrame(completeAnimationId);
    completeAnimationId = null;
  }
  stopAllSound();
  hud.classList.remove('visible');
  clearTimeout(state.hudTimer);
  exitFullscreen();
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(e => console.warn('Failed to exit PiP', e));
  } else if (typeof pipVideo !== 'undefined' && pipVideo && pipVideo.webkitPresentationMode === "picture-in-picture") {
    pipVideo.webkitSetPresentationMode("inline");
  }
}

function startCompleteLoop() {
  if (completeAnimationId) cancelAnimationFrame(completeAnimationId);
  if (completeCanvas) {
    completeCtx = completeCanvas.getContext('2d');
    state.completeStartTs = performance.now();
    completeAnimationId = requestAnimationFrame(tickComplete);
  }
}

function tickComplete(timestamp) {
  if (!completeCtx) return;
  const elapsed = timestamp - (state.completeStartTs || timestamp);
  const time = elapsed * 0.001;
  
  const rect = completeCanvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width;
  const h = rect.height;
  
  if (completeCanvas.width !== w * dpr || completeCanvas.height !== h * dpr) {
    completeCanvas.width = w * dpr;
    completeCanvas.height = h * dpr;
    completeCtx.scale(dpr, dpr);
  }
  
  // Render ceremony vibe
  drawVibe(completeCtx, w, h, 1.0, state.vibe, time, state.totalSeconds || 60);
  
  completeAnimationId = requestAnimationFrame(tickComplete);
}

/* Helper to clean up vibe-selected classes */
function clearVibeSelectedClasses() {
  const completeScreen = document.getElementById('screen-complete');
  if (completeScreen) {
    const classesToRemove = Array.from(completeScreen.classList).filter(c => c.startsWith('vibe-selected-'));
    classesToRemove.forEach(c => completeScreen.classList.remove(c));
  }
  const bodyEl = document.body;
  if (bodyEl) {
    const bodyClassesToRemove = Array.from(bodyEl.classList).filter(c => c.startsWith('vibe-selected-'));
    bodyClassesToRemove.forEach(c => bodyEl.classList.remove(c));
  }
}

/* ── Exit ── */
btnExit.addEventListener('click', () => {
  stopSession();
  clearVibeSelectedClasses();
  goTo('hero');
});

/* ── Fullscreen Toggle ── */
if (btnFullscreenToggle) {
  btnFullscreenToggle.addEventListener('click', () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      tryFullscreen();
    } else {
      exitFullscreen();
    }
  });
}

/* ── Picture-in-Picture (Widget) ── */
function pipSupported() {
  if (!pipVideo || typeof pipProxyCanvas.captureStream !== 'function') return false;
  if (document.pictureInPictureEnabled && typeof pipVideo.requestPictureInPicture === 'function') return true;
  return typeof pipVideo.webkitSupportsPresentationMode === 'function' &&
         pipVideo.webkitSupportsPresentationMode('picture-in-picture');
}

if (btnPip && pipVideo) {
  // Hide the button where PiP can't work rather than leaving a dead control
  if (!pipSupported()) btnPip.style.display = 'none';

  btnPip.addEventListener('click', () => {
    try {
      if (isPipActive()) {
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(console.warn);
        else pipVideo.webkitSetPresentationMode('inline');
        return;
      }
      // Make sure the feed is attached and has a fresh frame — synchronously,
      // so the tap still counts as the user gesture PiP requires.
      if (!pipVideo.srcObject) pipVideo.srcObject = pipProxyCanvas.captureStream(30);
      paintPipProxy(hudTime.textContent || '', performance.now(), true);
      if (pipVideo.paused) pipVideo.play().catch(() => {});

      if (document.pictureInPictureEnabled && typeof pipVideo.requestPictureInPicture === 'function') {
        pipVideo.requestPictureInPicture().catch(err => {
          console.warn('PiP request failed:', err);
          // One retry once the video has data (some browsers need a frame first)
          if (pipVideo.readyState < 2) {
            pipVideo.addEventListener('loadeddata', () => {
              pipVideo.requestPictureInPicture().catch(console.warn);
            }, { once: true });
          }
        });
      } else if (typeof pipVideo.webkitSetPresentationMode === 'function') {
        pipVideo.webkitSetPresentationMode('picture-in-picture');
      }
    } catch (err) {
      console.warn('PiP failed or unsupported', err);
    }
  });

  // Leaving PiP from the system controls should not stop the session feed
  pipVideo.addEventListener('leavepictureinpicture', () => {
    if (pipVideo.paused) pipVideo.play().catch(() => {});
  });
}

/* ── Restart ── */
btnRestart.addEventListener('click', () => {
  if (completeAnimationId) {
    cancelAnimationFrame(completeAnimationId);
    completeAnimationId = null;
  }
  cancelAnimationFrame(state.confettiRaf);
  state.confettiRaf = null;
  clearVibeSelectedClasses();
  goTo('hero');
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
function drawVibe(ctx, W, H, progress, vibe, time, totalSeconds = 60) {
  ctx.clearRect(0, 0, W, H);
  
  const waterBowlCanvas = document.getElementById('water-bowl-canvas');
  const treeCanvas = document.getElementById('tree-canvas');
  const candleCanvas = document.getElementById('candle-canvas');
  const isMainCanvas = ctx.canvas.id === 'focus-canvas' || ctx.canvas.id === 'complete-canvas';
  
  if (isMainCanvas) {
      if (waterBowlCanvas) {
          if (vibe === 'ice') {
              ctx.canvas.style.opacity = '1';
              waterBowlCanvas.style.display = 'block';
              
              if (waterBowlCanvas.parentElement !== ctx.canvas.parentElement) {
                  ctx.canvas.parentElement.insertBefore(waterBowlCanvas, ctx.canvas);
                  waterBowlCanvas.style.position = 'absolute';
                  waterBowlCanvas.style.top = '0';
                  waterBowlCanvas.style.left = '0';
                  waterBowlCanvas.style.width = '100%';
                  waterBowlCanvas.style.height = '100%';
                  waterBowlCanvas.style.zIndex = '-1';
                  if (typeof resizeWaterBowl3D === 'function') {
                      resizeWaterBowl3D(waterBowlCanvas.clientWidth, waterBowlCanvas.clientHeight);
                  }
              }
              
              if (typeof renderWaterBowl3D !== 'undefined') {
                  const isCeremony = ctx.canvas.id === 'complete-canvas'; 
                  renderWaterBowl3D(progress, time, isCeremony, totalSeconds);
              }
          } else {
              waterBowlCanvas.style.display = 'none';
          }
      }

      if (treeCanvas) {
          if (vibe === 'tree') {
              ctx.canvas.style.opacity = '0';
              treeCanvas.style.display = 'block';
              
              if (treeCanvas.parentElement !== ctx.canvas.parentElement) {
                  ctx.canvas.parentElement.insertBefore(treeCanvas, ctx.canvas);
                  treeCanvas.style.position = 'absolute';
                  treeCanvas.style.top = '0';
                  treeCanvas.style.left = '0';
                  treeCanvas.style.width = '100%';
                  treeCanvas.style.height = '100%';
                  treeCanvas.style.zIndex = '-1';
                  if (typeof resizeTree3D === 'function') {
                      resizeTree3D(treeCanvas.clientWidth, treeCanvas.clientHeight);
                  }
              }
              
              if (typeof initTree3D === 'function' && typeof isTreeInitialized !== 'undefined' && !isTreeInitialized) {
                  initTree3D();
              }
              
              if (typeof renderTree3D !== 'undefined') {
                  renderTree3D(progress, totalSeconds);
              }
          } else {
              treeCanvas.style.display = 'none';
          }
      }

      if (candleCanvas) {
          if (vibe === 'candle') {
              ctx.canvas.style.opacity = '0';
              candleCanvas.style.display = 'block';
              
              if (candleCanvas.parentElement !== ctx.canvas.parentElement) {
                  ctx.canvas.parentElement.insertBefore(candleCanvas, ctx.canvas);
                  candleCanvas.style.position = 'absolute';
                  candleCanvas.style.top = '0';
                  candleCanvas.style.left = '0';
                  candleCanvas.style.width = '100%';
                  candleCanvas.style.height = '100%';
                  candleCanvas.style.zIndex = '-1';
                  if (typeof resizeCandle3D === 'function') {
                      resizeCandle3D(candleCanvas.clientWidth, candleCanvas.clientHeight);
                  }
              }
              
              if (typeof initCandle3D === 'function' && typeof isCandleInitialized !== 'undefined' && !isCandleInitialized) {
                  initCandle3D(candleCanvas);
              }
              
              if (typeof renderCandle3D !== 'undefined') {
                  const isCeremony = ctx.canvas.id === 'complete-canvas';
                  renderCandle3D(progress, time, isCeremony, totalSeconds);
              }
          } else {
              candleCanvas.style.display = 'none';
          }
      }

      // Restore 2D canvas opacity if no 3D canvas is active
      if (vibe !== 'ice' && vibe !== 'tree' && vibe !== 'candle') {
          ctx.canvas.style.opacity = '1';
      }

      // Skip 2D rendering for the main canvas when 3D is active
      if (vibe === 'ice' || vibe === 'tree' || vibe === 'candle') {
          return;
      }
  }

  if (vibe === 'ice')    drawWaterBowl(ctx, W, H, progress, time);
  if (vibe === 'candle') drawCandle(ctx, W, H, progress, time);
  if (vibe === 'tree')   drawTree(ctx, W, H, progress, time);
  if (vibe === 'gallery')drawGallery(ctx, W, H, progress, time);
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
      if (state.soundOn && !isPreview) playDropSound();
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
   GALLERY — The painting is painted in over the session
   A framed canvas hangs on a gallery wall under a picture light.
   Over the session the bare primed canvas receives a tonal
   underpainting and then colour, stroke by stroke, finishing
   just before 00:00, when the museum label appears.
══════════════════════════════════════════════════════════ */

const GALLERY = {
  initd: false,
  image: null,
  loaded: false,
  error: false,

  artworks: [
    { id: 'starry',      src: 'paintings/starry-night.jpeg',        title: 'The Starry Night',              artist: 'Vincent van Gogh',      year: '1889' },
    { id: 'athens',      src: 'paintings/school-of-athens.jpeg',    title: 'The School of Athens',          artist: 'Raphael',               year: '1511' },
    { id: 'wheat',       src: 'paintings/wheat-field-cypresses.jpeg',title: 'Wheat Field with Cypresses',    artist: 'Vincent van Gogh',      year: '1889' },
    { id: 'boulevard',   src: 'paintings/boulevard-montmartre.jpeg', title: 'Boulevard Montmartre',          artist: 'Camille Pissarro',      year: '1897' },
    { id: 'waterlilies', src: 'paintings/water-lilies.jpeg',         title: 'Water Lilies',                  artist: 'Claude Monet',          year: '1906' },
    { id: 'bridge',      src: 'paintings/japanese-bridge.jpeg',      title: 'The Water Lily Pond',           artist: 'Claude Monet',          year: '1900' },
    { id: 'almond',      src: 'paintings/almond-blossoms.jpeg',      title: 'Almond Blossoms',              artist: 'Vincent van Gogh',      year: '1890' },
    { id: 'luncheon',    src: 'paintings/luncheon-boating.jpeg',     title: 'Luncheon of the Boating Party', artist: 'Pierre-Auguste Renoir', year: '1881' },
    { id: 'irises',      src: 'paintings/irises.jpeg',               title: 'Irises',                        artist: 'Vincent van Gogh',      year: '1889' },
  ],

  currentArt: null,

  // Reveal state
  seed: 0,
  field: null,              // brush-stroke reveal order (low-res Float32 field)
  under: null,              // sepia underpainting canvas
  caches: null,             // per-canvas layout/layer caches (WeakMap)
  placardShownAt: 0,        // time the museum label started fading in (0 = not yet)
};

/* ── seeded PRNG (mulberry32) ── */
function _gallerySeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h >>> 0;
}
function _galleryRng(seed) {
  let s = seed | 0;
  return function () {
    s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── pick a painting, avoiding immediate repeat via localStorage ── */
function _galleryPickPainting() {
  const pool = GALLERY.artworks;
  let lastId = '';
  try { lastId = localStorage.getItem('vf_lastGalleryId') || ''; } catch (_) {}

  let candidates = pool.filter(a => a.id !== lastId);
  if (candidates.length === 0) candidates = pool;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  try { localStorage.setItem('vf_lastGalleryId', chosen.id); } catch (_) {}
  return chosen;
}

function galleryReset() {
  GALLERY.initd = true;
  GALLERY.loaded = false;
  GALLERY.error = false;
  GALLERY.placardShownAt = 0;

  // Pick painting
  GALLERY.currentArt = _galleryPickPainting();

  // Load image
  GALLERY.image = new Image();
  GALLERY.image.src = GALLERY.currentArt.src;
  GALLERY.image.onload = () => { GALLERY.loaded = true; };
  GALLERY.image.onerror = () => { GALLERY.error = true; };

  // Reveal-order field and per-canvas render caches are built lazily
  GALLERY.seed = _gallerySeed(GALLERY.currentArt.id + Date.now().toString());
  GALLERY.field = null;
  GALLERY.under = null;
  GALLERY.caches = new WeakMap();
}

/* ── Brush-stroke reveal order ──
   Simulates a painter working: broad blocking-in strokes first (centre of
   interest early), then progressively finer strokes. Each cell of a low-res
   field stores the moment (0..1) its paint goes down. */
function _galleryBuildField(aspect, seed) {
  const FW = 168;
  const FH = Math.max(48, Math.round(FW / aspect));
  const field = new Float32Array(FW * FH).fill(2);
  const rng = _galleryRng(seed);
  const N = 1600;
  const ang0 = rng() * Math.PI;

  for (let i = 0; i < N; i++) {
    const t = i / N;
    // Best-of-k: prefer spots not painted yet so coverage spreads naturally
    let bx = 0, by = 0, best = -1;
    const k = 10;
    for (let c = 0; c < k; c++) {
      let x, y;
      if (t < 0.3 && rng() < 0.5) {
        // early strokes favour the centre of interest
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (0.25 + t * 1.6);
        x = 0.5 + Math.cos(a) * r * 0.5; y = 0.46 + Math.sin(a) * r * 0.5;
      } else {
        x = rng(); y = rng();
      }
      x = Math.min(0.999, Math.max(0, x)); y = Math.min(0.999, Math.max(0, y));
      const v = field[Math.floor(y * FH) * FW + Math.floor(x * FW)];
      const score = v + rng() * 0.3;
      if (score > best) { best = score; bx = x; by = y; }
    }
    // Stroke size shrinks as the painting is refined
    const width = (0.055 * Math.pow(1 - t, 1.2) + 0.018) * FW * (0.75 + rng() * 0.5);
    const len = width * (1.6 + rng() * 2.2);
    // Brush direction follows a gentle flow field, like consistent handwork
    const ang = ang0 + Math.sin(bx * 5.0 + by * 3.0) * 0.9 + (rng() - 0.5) * 0.6;
    const cx = bx * FW, cy = by * FH;
    const dx = Math.cos(ang) * len * 0.5, dy = Math.sin(ang) * len * 0.5;
    const x0 = cx - dx, y0 = cy - dy, x1 = cx + dx, y1 = cy + dy;
    const rad = width * 0.5;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - rad)), maxX = Math.min(FW - 1, Math.ceil(Math.max(x0, x1) + rad));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - rad)), maxY = Math.min(FH - 1, Math.ceil(Math.max(y0, y1) + rad));
    const sx = x1 - x0, sy = y1 - y0, sl = sx * sx + sy * sy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let u = ((x - x0) * sx + (y - y0) * sy) / sl;
        u = Math.max(0, Math.min(1, u));
        const px = x0 + sx * u - x, py = y0 + sy * u - y;
        // ragged, bristly edge; the stroke tapers at its tail
        const edge = rad * (0.78 + 0.32 * rng()) * (1 - 0.35 * u);
        if (px * px + py * py < edge * edge) {
          const o = y * FW + x;
          // paint goes down along the stroke, with a little bristle jitter
          const tv = t + u * 0.004;
          if (tv < field[o]) field[o] = tv;
        }
      }
    }
  }
  // Final touches: anything still bare is finished at the very end
  for (let i = 0; i < field.length; i++) {
    if (field[i] > 1) field[i] = 1.5 + rng() * 0.1;
  }
  // Soften: a small blur removes isolated cells so edges read as brushwork
  for (let pass = 0; pass < 2; pass++) {
    const src = field.slice();
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        let sum = 0, n = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = y + oy; if (yy < 0 || yy >= FH) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox; if (xx < 0 || xx >= FW) continue;
            sum += src[yy * FW + xx]; n++;
          }
        }
        field[y * FW + x] = sum / n;
      }
    }
  }
  // Equalise by rank so painted area grows steadily with the timer
  const order = Array.from(field.keys()).sort((a, b) => field[a] - field[b]);
  const out = new Float32Array(field.length);
  for (let r = 0; r < order.length; r++) out[order[r]] = r / (order.length - 1);
  return { FW, FH, field: out };
}

/* ── Sepia underpainting derived from the artwork ── */
function _galleryBuildUnder(img) {
  const w = 360, h = Math.max(1, Math.round(360 * img.height / img.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, w, h);
  try {
    const d = x.getImageData(0, 0, w, h);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      let l = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) / 255;
      l = 0.22 + 0.7 * Math.pow(l, 0.9);               // flatter, like a tonal sketch
      a[i]     = 52 + l * 180;
      a[i + 1] = 36 + l * 160;
      a[i + 2] = 24 + l * 128;
    }
    x.putImageData(d, 0, 0);
  } catch (_) { /* tainted canvas: fall back to the plain image */ }
  return c;
}

function _galleryLayout(W, H, img) {
  const portrait = H > W * 1.1;
  const isPreview = W < 300;
  const aspect = img.width / img.height;
  const border = isPreview ? Math.max(4, W * 0.035) : Math.max(12, Math.min(42, Math.min(W, H) * 0.042));
  const maxW = W * (isPreview ? 0.86 : portrait ? 0.84 : 0.66) - border * 2;
  const maxH = H * (isPreview ? 0.70 : portrait ? 0.60 : 0.64) - border * 2;
  let iw = maxW, ih = maxW / aspect;
  if (ih > maxH) { ih = maxH; iw = maxH * aspect; }
  const cx = W / 2;
  const cy = H * (isPreview ? 0.5 : portrait ? 0.44 : 0.46);
  return {
    W, H, border, isPreview,
    ix: Math.round(cx - iw / 2), iy: Math.round(cy - ih / 2), iw: Math.round(iw), ih: Math.round(ih),
  };
}

// Wall, picture light, gilded frame and primed canvas — rendered once per layout
function _galleryBuildStatic(L, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round(L.W * dpr); c.height = Math.round(L.H * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const { W, H, ix, iy, iw, ih, border: b } = L;

  // Wall: deep warm grey plaster
  x.fillStyle = '#121010';
  x.fillRect(0, 0, W, H);
  const n = document.createElement('canvas');
  n.width = 256; n.height = 256;
  const nx = n.getContext('2d');
  const nd = nx.createImageData(256, 256);
  const rng = _galleryRng(7);
  for (let i = 0; i < nd.data.length; i += 4) {
    const v = 128 + (rng() - 0.5) * 34;
    nd.data[i] = nd.data[i + 1] = nd.data[i + 2] = v; nd.data[i + 3] = 255;
  }
  nx.putImageData(nd, 0, 0);
  x.save();
  x.globalAlpha = 0.05;
  x.globalCompositeOperation = 'overlay';
  x.imageSmoothingEnabled = true;
  x.drawImage(n, 0, 0, W, H);
  x.restore();

  // Picture light: a warm pool on the wall, strongest just above the frame
  const lcx = W / 2, lcy = iy - b - Math.min(H * 0.08, 60);
  const lr = Math.max(iw * 1.05, ih * 1.25);
  const wash = x.createRadialGradient(lcx, lcy, 0, lcx, lcy, lr);
  wash.addColorStop(0, 'rgba(255, 226, 184, 0.20)');
  wash.addColorStop(0.45, 'rgba(255, 214, 165, 0.09)');
  wash.addColorStop(1, 'rgba(255, 200, 150, 0)');
  x.fillStyle = wash;
  x.fillRect(0, 0, W, H);
  // Vignette into the dark room
  const vg = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = vg;
  x.fillRect(0, 0, W, H);

  // Frame drop shadow (light comes from above)
  const fx = ix - b, fy = iy - b, fw = iw + b * 2, fh = ih + b * 2;
  x.save();
  x.shadowColor = 'rgba(0, 0, 0, 0.75)';
  x.shadowBlur = L.isPreview ? 6 : 34;
  x.shadowOffsetY = L.isPreview ? 3 : 18;
  x.fillStyle = '#1b140c';
  x.fillRect(fx, fy, fw, fh);
  x.restore();

  // Gilded moulding: bands from outer edge to sight edge, each side lit differently
  const bands = [
    { a: 0.00, b: 0.10, col: [58, 42, 22] },     // outer dark edge
    { a: 0.10, b: 0.42, col: [176, 138, 72] },   // main gold cove
    { a: 0.42, b: 0.55, col: [214, 178, 106] },  // raised bead (catches light)
    { a: 0.55, b: 0.86, col: [128, 96, 50] },    // inner scotia
    { a: 0.86, b: 0.94, col: [70, 52, 28] },     // shadowed lip
    { a: 0.94, b: 1.00, col: [222, 190, 120] },  // bright sight edge
  ];
  const sides = [
    { lit: 1.18, poly: (o, i) => [[fx + o, fy + o], [fx + fw - o, fy + o], [fx + fw - i, fy + i], [fx + i, fy + i]] },          // top
    { lit: 0.62, poly: (o, i) => [[fx + o, fy + fh - o], [fx + fw - o, fy + fh - o], [fx + fw - i, fy + fh - i], [fx + i, fy + fh - i]] }, // bottom
    { lit: 0.95, poly: (o, i) => [[fx + o, fy + o], [fx + i, fy + i], [fx + i, fy + fh - i], [fx + o, fy + fh - o]] },         // left
    { lit: 0.80, poly: (o, i) => [[fx + fw - o, fy + o], [fx + fw - i, fy + i], [fx + fw - i, fy + fh - i], [fx + fw - o, fy + fh - o]] }, // right
  ];
  for (const s of sides) {
    for (const band of bands) {
      const o = band.a * b, i2 = band.b * b;
      const pts = s.poly(o, i2);
      // a bead/cove reads as a gradient across the band
      const g = x.createLinearGradient(pts[0][0], pts[0][1], pts[3][0], pts[3][1]);
      const c0 = band.col.map(v => Math.min(255, Math.round(v * s.lit * 1.08)));
      const c1 = band.col.map(v => Math.min(255, Math.round(v * s.lit * 0.82)));
      g.addColorStop(0, `rgb(${c0})`);
      g.addColorStop(1, `rgb(${c1})`);
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < 4; k++) x.lineTo(pts[k][0], pts[k][1]);
      x.closePath();
      x.fill();
    }
  }
  // Worn gilding texture over the frame
  x.save();
  x.beginPath();
  x.rect(fx, fy, fw, fh);
  x.rect(ix, iy, iw, ih);
  x.clip('evenodd');
  x.globalAlpha = 0.18;
  x.globalCompositeOperation = 'multiply';
  x.drawImage(n, fx, fy, fw, fh);
  x.restore();

  // Primed linen canvas (gesso) inside the frame
  x.fillStyle = '#e4dccb';
  x.fillRect(ix, iy, iw, ih);
  x.save();
  x.globalAlpha = 0.09;
  x.globalCompositeOperation = 'multiply';
  for (let yy = iy; yy < iy + ih; yy += 2) { x.fillStyle = (yy & 2) ? '#8a7f6a' : '#b4aa94'; x.fillRect(ix, yy, iw, 1); }
  for (let xx = ix; xx < ix + iw; xx += 3) { x.fillStyle = '#9d927c'; x.fillRect(xx, iy, 1, ih); }
  x.restore();
  return c;
}

function _galleryLightOverlay(x, L) {
  // Picture light falls off down the canvas; the frame casts a soft shadow at the top edge
  const g = x.createLinearGradient(0, L.iy, 0, L.iy + L.ih);
  g.addColorStop(0, 'rgba(255, 236, 205, 0.10)');
  g.addColorStop(0.35, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
  x.fillStyle = g;
  x.fillRect(L.ix, L.iy, L.iw, L.ih);
  const s = Math.max(3, L.border * 0.45);
  const top = x.createLinearGradient(0, L.iy, 0, L.iy + s);
  top.addColorStop(0, 'rgba(0,0,0,0.45)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = top;
  x.fillRect(L.ix, L.iy, L.iw, s);
}

function drawGallery(ctx, W, H, p, time) {
  if (!GALLERY.initd) galleryReset();
  const isPreview = W < 300;

  if (GALLERY.loaded) {
    const img = GALLERY.image;
    if (!GALLERY.field) GALLERY.field = _galleryBuildField(img.width / img.height, GALLERY.seed);
    if (!GALLERY.under) GALLERY.under = _galleryBuildUnder(img);

    const dpr = (ctx.getTransform ? ctx.getTransform().a : 1) || 1;
    let C = GALLERY.caches.get(ctx.canvas);
    if (!C || C.W !== W || C.H !== H || C.dpr !== dpr || C.img !== img) {
      const L = _galleryLayout(W, H, img);
      const mk = () => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(L.iw * dpr)); c.height = Math.max(1, Math.round(L.ih * dpr)); return c; };
      const F = GALLERY.field;
      const small = document.createElement('canvas');
      small.width = F.FW; small.height = F.FH;
      C = {
        W, H, dpr, img, L,
        stat: _galleryBuildStatic(L, dpr),
        underLayer: mk(), colorLayer: mk(),
        small, smallCtx: small.getContext('2d'), smallData: small.getContext('2d').createImageData(F.FW, F.FH),
        lastP: -1,
      };
      GALLERY.caches.set(ctx.canvas, C);
    }
    const L = C.L;

    // Painting finishes just before the timer reaches 00:00
    const pc = isPreview ? Math.min(1, p * 1.1) : Math.min(1, p / 0.985);

    // Rebuild the paint masks only when progress has moved enough to matter
    if (Math.abs(pc - C.lastP) > (isPreview ? 0.01 : 0.0004) || C.lastP < 0) {
      const F = GALLERY.field;
      const paintLayer = (layer, source, prog, scale, offset, band) => {
        const d = C.smallData.data;
        const f = F.field;
        const pp = prog * (1 + band);
        for (let i = 0, j = 3; i < f.length; i++, j += 4) {
          const fv = f[i] * scale + offset;
          let a = (pp - fv) / band;
          a = a < 0 ? 0 : a > 1 ? 1 : a;
          d[j] = a * 255;
        }
        C.smallCtx.putImageData(C.smallData, 0, 0);
        const lx = layer.getContext('2d');
        lx.globalCompositeOperation = 'source-over';
        lx.clearRect(0, 0, layer.width, layer.height);
        lx.imageSmoothingEnabled = true;
        lx.imageSmoothingQuality = 'high';
        lx.drawImage(C.small, 0, 0, layer.width, layer.height);
        lx.globalCompositeOperation = 'source-in';
        lx.drawImage(source, 0, 0, layer.width, layer.height);
        lx.globalCompositeOperation = 'source-over';
      };
      // Tonal underpainting runs ahead (done by ~70%), colour follows
      paintLayer(C.underLayer, GALLERY.under, pc, 0.70, -0.015, 0.03);
      paintLayer(C.colorLayer, img, pc, 1.0, 0.0, 0.014);
      C.lastP = pc;
    }

    ctx.drawImage(C.stat, 0, 0, W, H);
    if (pc < 1) ctx.drawImage(C.underLayer, L.ix, L.iy, L.iw, L.ih);
    ctx.drawImage(C.colorLayer, L.ix, L.iy, L.iw, L.ih);
    _galleryLightOverlay(ctx, L);

    // ── Museum label, placed on the wall beneath the frame ──
    if (!isPreview && p >= 0.985) {
      if (GALLERY.placardShownAt === 0) GALLERY.placardShownAt = time;
      const a = Math.min(1, (time - GALLERY.placardShownAt) / 1.2);
      if (a > 0.01) {
        const art = GALLERY.currentArt;
        ctx.save();
        ctx.globalAlpha = a;
        const pW = Math.min(280, Math.max(200, L.iw * 0.42));
        const pH = 62;
        let pX = L.ix + L.iw - pW;
        let pY = L.iy + L.ih + L.border + 22;
        if (pY + pH > H - 16) {
          // no room below: hang it beside the frame's lower right corner, or inside the wall margin
          const side = L.ix + L.iw + L.border + 20;
          if (side + pW < W - 12) { pX = side; pY = L.iy + L.ih + L.border - pH; }
          else { pY = H - pH - 16; }
        }
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = 'rgba(236, 230, 218, 0.94)';
        ctx.fillRect(pX, pY, pW, pH);
        ctx.shadowColor = 'transparent';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1b1814';
        ctx.font = 'italic 17px "Instrument Serif", Georgia, serif';
        ctx.fillText(art.title, pX + 14, pY + 25, pW - 28);
        ctx.fillStyle = '#5b5247';
        ctx.font = '400 11px Inter, sans-serif';
        ctx.fillText(`${art.artist}, ${art.year}`, pX + 14, pY + 45, pW - 28);
        ctx.restore();
      }
    } else if (p < 0.98) {
      GALLERY.placardShownAt = 0;
    }

  } else if (GALLERY.error) {
    ctx.fillStyle = '#121010';
    ctx.fillRect(0, 0, W, H);
    if (!isPreview) {
      ctx.fillStyle = '#555';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Painting unavailable', W / 2, H / 2);
    }
  } else {
    // ── loading state: elegant breathing ripple ──
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, W, H);
    if (!isPreview) {
      const alphaInner = 0.3 + 0.4 * Math.sin(time * 2.5);
      ctx.fillStyle = `rgba(212, 168, 83, ${alphaInner})`;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      const r = (time * 18) % 45;
      const alphaOuter = Math.max(0, 1 - (r / 45));
      ctx.strokeStyle = `rgba(212, 168, 83, ${alphaOuter * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 3 + r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '300 11px Inter';
      ctx.textAlign = 'center';
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '4px';
      ctx.fillText('PREPARING CANVAS', W / 2, H / 2 + 45);
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    }
  }
}

/* ══════════════════════════════════════════════════════════
   VIBE PREVIEW ANIMATIONS (looped, on selection screen)
══════════════════════════════════════════════════════════ */
let previewRaf       = null;
let previewLastFrame = 0;
// On mobile preview runs at 15fps to save battery and GPU
const PREVIEW_FPS      = IS_MOBILE ? 15 : 22;
const PREVIEW_INTERVAL = 1000 / PREVIEW_FPS;

const previews = {
  ice:    { canvas: $('preview-ice'),    ctx: null },
  candle: { canvas: $('preview-candle'), ctx: null },
  tree:   { canvas: $('preview-tree'),   ctx: null },
  gallery:{ canvas: $('preview-gallery'),ctx: null },
};

Object.entries(previews).forEach(([k, v]) => {
  v.ctx = v.canvas.getContext('2d');
});

const previewLeaves = [];
let previewLeavesInit = false;

function animatePreviews(ts) {
  // Always schedule next frame first so cancelAnimationFrame in goTo works
  previewRaf = requestAnimationFrame(animatePreviews);

  // Skip preview drawing if current screen is not vibe or duration preview screen
  if (screens && screens.vibe && screens.duration) {
    if (!screens.vibe.classList.contains('active') && !screens.duration.classList.contains('active')) {
      return;
    }
  }

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
    if (vibe === 'gallery')drawGallery(ctx, W, H, pp, t);
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

/* ==============================================================
   AUDIO — Premium Ambient Soundscapes (file-based)
     Water Bowl -> discrete drop sounds (sounds/floraphonic-…mp3)
     Candle     -> sounds/fire.mp3
     Tree       -> sounds/wind.mp3
     Gallery    -> sounds/slow-piano-music.mp3
============================================================== */
const AMBIENT_SRC = {
  ice: '',                                  // discrete drop sounds instead
  candle: 'sounds/fire.mp3',
  tree: 'sounds/wind.mp3',
  gallery: 'sounds/slow-piano-music.mp3',
};
const DROP_SRC = 'sounds/floraphonic-water-droplet-3-165638.mp3';

const audioBuffers = {};        // decoded (and loop-prepared) buffers by src
const audioLoads = {};          // in-flight load promises by src
let audioCtxUnlocked = false;
let ambientToken = 0;           // bumps on every start/stop so stale loads never play

// iOS: let Web Audio play even when the ringer/silent switch is on (Safari 17+)
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}

function initAudioCtx() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Recover after interruptions (calls, Siri, other apps taking audio)
    state.audioCtx.onstatechange = () => {
      if (state.audioCtx.state !== 'running' && state.soundOn && isSessionAudible()) resumeAudio();
    };
  }
  if (state.audioCtx.state !== 'running') {
    state.audioCtx.resume().catch(() => {});
  }
}

function isSessionAudible() {
  return !!(screens.focus && screens.focus.classList.contains('active'));
}

function resumeAudio() {
  if (!state.audioCtx) return;
  if (state.audioCtx.state !== 'running') state.audioCtx.resume().catch(() => {});
}

// Older iOS routes Web Audio through the "ambient" category, which the
// silent switch mutes. Playing a looping silent media element inside a user
// gesture switches the page to the "playback" category.
let silentEl = null;
function startSilentKeepAlive() {
  if (silentEl || navigator.audioSession) return;
  try {
    const sr = 8000, n = sr; // 1 s of silence, 8-bit mono WAV
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    silentEl = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
    silentEl.loop = true;
    silentEl.setAttribute('playsinline', '');
    silentEl.play().catch(() => { silentEl = null; });
  } catch (_) { silentEl = null; }
}

// Mobile browsers require audio to be started from a user gesture. Play a
// one-sample buffer on the first interaction (and again if still locked).
function unlockAudioCtx() {
  initAudioCtx();
  startSilentKeepAlive();
  if (audioCtxUnlocked && state.audioCtx.state === 'running') return;
  const ctx = state.audioCtx;
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(1, 1, 22050);
  source.connect(ctx.destination);
  source.start(0);
  ctx.resume().then(() => { audioCtxUnlocked = ctx.state === 'running'; }).catch(() => {});
  preloadDropSound();
}

// Keep trying on interactions until the context is actually running
['pointerdown', 'touchend', 'click', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (!state.audioCtx || state.audioCtx.state !== 'running') unlockAudioCtx();
  }, { capture: true, passive: true });
});

// Coming back to the tab / app: resume, and restart the ambience if it was lost
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.soundOn || !isSessionAudible()) return;
  resumeAudio();
  if (!state.audioNodes.ambientSource && AMBIENT_SRC[state.vibe]) startAmbient(state.vibe);
});
window.addEventListener('pageshow', () => { if (state.soundOn && isSessionAudible()) resumeAudio(); });

// Build a seamless loop: crossfade the tail into the head once, so the
// buffer can loop natively (no timers — those get throttled in background
// tabs and Picture-in-Picture, which used to leave the ambience silent).
function makeLoopBuffer(ctx, buffer, fadeSec) {
  const fade = Math.min(Math.floor(fadeSec * buffer.sampleRate), Math.floor(buffer.length / 3));
  if (fade < 64) return buffer;
  const len = buffer.length - fade;
  const out = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, len));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      // equal-power: head fades in while the tail fades out over it
      dst[i] = src[i] * Math.sin(t * Math.PI / 2) + src[len + i] * Math.cos(t * Math.PI / 2);
    }
  }
  return out;
}

function loadAudio(src, loop) {
  const key = src + (loop ? '#loop' : '');
  if (audioBuffers[key]) return Promise.resolve(audioBuffers[key]);
  if (audioLoads[key]) return audioLoads[key];
  initAudioCtx();
  const ctx = state.audioCtx;
  audioLoads[key] = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.arrayBuffer();
        // Safari's decodeAudioData has a callback-only form on older versions
        let buf = await new Promise((resolve, reject) => {
          const p = ctx.decodeAudioData(data, resolve, reject);
          if (p && p.then) p.then(resolve, reject);
        });
        if (loop) buf = makeLoopBuffer(ctx, buf, 2.0);
        audioBuffers[key] = buf;
        return buf;
      } catch (e) {
        console.warn('Audio load failed (attempt ' + (attempt + 1) + '):', src, e);
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    delete audioLoads[key];
    return null;
  })();
  return audioLoads[key];
}

function preloadDropSound() { return loadAudio(DROP_SRC, false); }

// Warm the cache as soon as a vibe is chosen so sound starts with the session
function preloadAmbient(vibe) {
  const src = AMBIENT_SRC[vibe];
  if (src) loadAudio(src, true);
  if (vibe === 'ice') preloadDropSound();
}

async function playDropSound() {
  if (!state.soundOn) return;
  initAudioCtx();
  const buffer = await preloadDropSound();
  if (!buffer || !state.soundOn) return;
  const ctx = state.audioCtx;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.6; // slightly lower volume for drops so it's not overwhelming
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

function stopAllSound() {
  ambientToken++;
  state._loadingSrc = null;
  clearTimeout(state._audioTimer);
  if (state._fadeTimer) { clearInterval(state._fadeTimer); state._fadeTimer = null; }
  const ctx = state.audioCtx;
  const gain = state.audioNodes.ambientGain;
  const src = state.audioNodes.ambientSource;
  if (ctx && gain && src) {
    // quick fade instead of a click
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
      src.stop(ctx.currentTime + 0.3);
    } catch (e) { try { src.stop(); } catch (_) {} }
    setTimeout(() => { try { gain.disconnect(); } catch (_) {} }, 400);
  } else {
    Object.values(state.audioNodes).forEach(n => {
      try { n.stop && n.stop(); } catch (e) {}
      try { n.disconnect && n.disconnect(); } catch (e) {}
    });
  }
  state.audioNodes = {};
}

function startAmbient(vibe) {
  initAudioCtx();
  stopAllSound();
  const src = AMBIENT_SRC[vibe];
  if (vibe === 'ice') preloadDropSound();
  if (!src) return;
  state._loadingSrc = src;
  playAmbientFile(src, ambientToken);
}

async function playAmbientFile(src, token) {
  const buffer = await loadAudio(src, true);
  // Sound turned off, or another ambience started, while loading
  if (!buffer || token !== ambientToken || !state.soundOn) return;
  const ctx = state.audioCtx;
  resumeAudio();

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(ctx.destination);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(masterGain);
  source.start();
  source.onended = () => {
    // If the loop ever stops unexpectedly mid-session, bring it back
    if (token === ambientToken && state.soundOn && isSessionAudible()) startAmbient(state.vibe);
  };

  state.audioNodes.ambientGain = masterGain;
  state.audioNodes.ambientSource = source;

  // Fade in smoothly
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 3);
}

btnSound.addEventListener('click', () => {
  initAudioCtx();
  if (state.soundOn) {
    stopAllSound();
    state.soundOn = false;
  } else {
    state.soundOn = true;
    startAmbient(state.vibe);
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

/* ── UI Helpers ── */
function showToast(msg) {
  let toast = document.getElementById('vibe-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'vibe-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(20, 20, 25, 0.9)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '12px';
    toast.style.zIndex = '9999';
    toast.style.fontFamily = 'Inter, sans-serif';
    toast.style.fontSize = '14px';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    toast.style.transition = 'opacity 0.4s ease';
    toast.style.pointerEvents = 'none';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, 3500);
}
