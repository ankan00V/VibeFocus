# Remediation Blueprint — Reset Lifecycle Fixes

## Executive Summary
This blueprint details the exact remediation required to address the reset lifecycle defects identified by `reviewer_2` in `/Users/ankanghosh/Desktop/projects/timer timer/.agents/reviewer_2/handoff.md`.

---

## 1. Problem Analysis & Root Cause

### Defect 1: Missing `resetTree3D()` call in `launchFocus()`
- **Location**: `app.js` (line 716)
- **Root Cause**: `launchFocus()` in `app.js` calls `resetCandle3D()` when launching a session, but lacks a call to `resetTree3D()`. As a result, the 3D tree simulation state relies exclusively on frame-render fallback checks in `renderTree3D()`.

### Defect 2: Nested `progress < 0.01` Fallback Reset Guard in `tree-3d.js`
- **Location**: `tree-3d.js` (lines 536–569)
- **Root Cause**: The fallback reset block `if (progress < 0.01)` was nested inside the guard `if (totalSeconds !== lastTotalSecondsForLeaves || progress < 0.001)`. When a user runs consecutive sessions with identical duration (`totalSeconds`), `totalSeconds !== lastTotalSecondsForLeaves` is `false`. If the first frame of `renderTree3D()` fires at `progress >= 0.001` (e.g. `0.002` due to initial DOM/canvas setup), the outer guard evaluates to `false`, completely skipping the nested `if (progress < 0.01)` reset logic.

### Defect 3: Implicit Flower Mesh Visibility Assignment
- **Location**: `tree-3d.js` (lines 762–767)
- **Root Cause**: Inside the flower loop in `renderTree3D()`, `flower.mesh.visible = true` was only executed when `i < targetCount`. For `i >= targetCount`, `flower.mesh.visible` was untouched, leaving flowers visible if progress rewound or dropped.

---

## 2. Exact Code Modifications

### Modification 1: Call `resetTree3D()` in `app.js`

- **Target File**: `/Users/ankanghosh/Desktop/projects/timer timer/app.js`
- **Target Line Range**: 715–720
- **Action**: Add `if (typeof resetTree3D === 'function') resetTree3D();` immediately after line 716 (`resetCandle3D()`).

```javascript
// BEFORE (app.js:715-720)
  if (typeof CANDLE !== 'undefined') { CANDLE.initd = false; CANDLE.smoke = []; CANDLE.embers = []; }
  if (typeof resetCandle3D === 'function') resetCandle3D();
  if (typeof drawTree === 'function') {
    drawTree._motes    = null;
    drawTree._lastGust = -1;   // reset gust timer so first gust fires at t=50s
  }

// AFTER (app.js:715-721)
  if (typeof CANDLE !== 'undefined') { CANDLE.initd = false; CANDLE.smoke = []; CANDLE.embers = []; }
  if (typeof resetCandle3D === 'function') resetCandle3D();
  if (typeof resetTree3D === 'function') resetTree3D();
  if (typeof drawTree === 'function') {
    drawTree._motes    = null;
    drawTree._lastGust = -1;   // reset gust timer so first gust fires at t=50s
  }
```

---

### Modification 2: Un-nest `progress < 0.01` in `tree-3d.js`

- **Target File**: `/Users/ankanghosh/Desktop/projects/timer timer/tree-3d.js`
- **Target Line Range**: 535–570
- **Action**: Un-nest the `if (progress < 0.01)` block so it sits at the top level of `renderTree3D()`, executing independently of `totalSeconds !== lastTotalSecondsForLeaves`.

```javascript
// BEFORE (tree-3d.js:535-570)
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
    }

// AFTER (tree-3d.js:535-570)
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

    // Fallback reset on progress reset at session start
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
```

---

### Modification 3: Explicit per-frame flower mesh visibility evaluation in `tree-3d.js`

- **Target File**: `/Users/ankanghosh/Desktop/projects/timer timer/tree-3d.js`
- **Target Line Range**: 760–773
- **Action**: Evaluate `flower.mesh.visible = (i < targetCount);` explicitly per frame, resetting `bloomProgress = 0.0` for `i >= targetCount`.

```javascript
// BEFORE (tree-3d.js:760-773)
    for (let i = 0; i < TOTAL_FLOWERS; i++) {
        const flower = flowerPool[i];
        if (i < targetCount) {
            flower.mesh.visible = true;
            if (flower.bloomProgress < 1.0) {
                flower.bloomProgress = Math.min(1.0, flower.bloomProgress + delta / bloomDuration);
            }
        }
        if (flower.bloomProgress >= 1.0) {
            currentBloomed++;
        }
        flower.material.uniforms.uBloom.value = flower.bloomProgress;
        flower.material.uniforms.uTime.value = time;
    }

// AFTER (tree-3d.js:760-775)
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
```

---

## 3. Implementation Verification Checklist
1. **`app.js` Verification**: Search `app.js` for `resetTree3D` call inside `launchFocus()`.
2. **`tree-3d.js` Un-nesting Verification**: Inspect `renderTree3D` to ensure `if (progress < 0.01)` is at root indentation level inside `renderTree3D()`.
3. **`tree-3d.js` Visibility Evaluation**: Inspect flower loop to confirm `flower.mesh.visible = (i < targetCount);`.
4. **Behavioral Test**:
   - Run session A for 60s (or simulate `renderTree3D(1.0, 60)`).
   - Start session B for 60s (simulate `launchFocus()` followed by `renderTree3D(0.002, 60)`).
   - Verify `bloomedCount === 0`, all `flower.mesh.visible === false`, and all leaves are re-attached to branch start positions.
