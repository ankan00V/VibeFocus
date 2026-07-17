# Testing & Edge Case Report - VibeFocus Redesign

**Overall Risk Assessment**: **MEDIUM**

This report presents the functional and edge-case testing results for the redesigned duration selection and completion screens of VibeFocus.

---

## Testing Criteria & Findings

### 1. Preset Duration Selection
*   **Aria/Class Updates**: Verified. Clicking a preset duration pill correctly removes the `selected` class from all other pills and adds it to the clicked pill.
*   **State Updates**: Verified. `state.minutes` is set to the corresponding integer parsed from the clicked pill's `data-minutes` attribute.
*   **Dial Display Updates**: Verified. The circular dial displays the preset minutes (e.g. `25`, `45`, `60`, `90`) correctly. This is handled dynamically via CSS `:has()` rules matching the `.selected` card class.
*   *   **Edge Case / Bug Found**: **Keyboard Input Disconnect on Custom Input Field**. If a user clicks a preset (e.g., `25`) and then tabs to the custom duration input field and types a value (e.g., `15`), the custom pill is not automatically selected, the preset selection is not cleared, and the focus session will start with `25` minutes instead of `15`.

---

### 2. Custom Duration Input
*   **Functional Verification**: Verified. Selecting the custom pill (`#dur-custom`) and typing a value updates `state.minutes` and the dial display.
*   **Boundary Constraints**: Verified.
    *   Values > 120 are correctly clamped to `120` in the input field, a warning toast is shown, and the dial display/state updates to `120`.
    *   Values < 1 (e.g., `0` or negative values) are clamped to `1` in the input field, and the dial display/state updates to `1`.
*   *   **Edge Case / Bug Found**: **Start Focus Button Enabled with Invalid Custom Duration (Empty/NaN)**.
    *   *Scenario*: The user selects the custom pill, enabling the "Start Focus" button. They then delete the text in the input box to type a new number.
    *   *Result*: The `input` listener parses an empty string as `NaN`, setting `state.minutes` to `NaN`. The dial display shows `—`. However, the "Start Focus" button remains enabled. Clicking it executes the click listener, which returns early due to the falsy check `if (!state.minutes) return;`. The app fails silently (button is active but does nothing).
*   *   **Edge Case / Bug Found**: **Keyboard Focus/Accessibility Gap**.
    *   *Scenario*: The user tabs to the `#custom-minutes` input field via keyboard and types a number without clicking the pill first.
    *   *Result*: The custom pill `#dur-custom` does not receive the `selected` class, the "Start Focus" button remains disabled, and the dial display/state is not updated.

---

### 3. Button State
*   **Disabled State**: Verified. The "Start Focus" button (`#btn-start`) is disabled initially when transitioning to the duration screen.
*   **Enabled State**: Verified. Clicking any preset pill or the custom pill sets `btnStart.disabled = false`.
*   *   **Major Bug Found**: **State and UI Retention Across Restarts**.
    *   *Scenario*: The user starts a focus session, completes it, and clicks "Begin Again" (`#btn-restart`) on the completion screen, or exits early using `#btn-exit-focus`. They select a vibe on the Hero screen and click "Start Focus" to return to the duration screen.
    *   *Result*: The Duration Selection screen displays the previous session's selected duration pill as `selected`, the "Start Focus" button is pre-enabled, and the previous duration is loaded in the state.
    *   *Why*: The code that resets duration selection and disables the start button is located inside the `.vibe-card` click listener. However, in the redesign, vibe selection is done directly on the Hero screen, which bypasses the vibe screen and calls `startHeroFocusSession()`. This function lacks the duration and start button reset logic.

---

### 4. Navigation
*   **Restart Button (`#btn-restart`)**: Verified. Clicking the restart button cancels the confetti animation frame and transitions the user back to the Hero screen (`screen-hero`) correctly.
*   **Back Button (`#btn-back-vibe`)**:
    *   *Behavior*: Clicking the back button executes `goTo('hero')` to return to the landing screen.
    *   *Structural Bug Found*: **Orphaned Vibe Selection Screen & Mismatched Navigation**.
        *   The button ID is `btn-back-vibe` and its aria-label is `"Back to vibe selection"`. However, it goes to the Hero screen rather than the Vibe Selection screen (`screen-vibe`).
        *   The Vibe Selection screen (`#screen-vibe`) is completely orphaned and unreachable in the redesigned flow, since clicking "Start Focus" on the Hero screen bypasses it and goes directly to the Duration screen.
        *   Additionally, the `.vibe-card` click listener on the orphaned screen does not add the `.selected` class to the clicked card, which would break completion screen variant rendering if the screen were ever reached.

---

## Detailed Vulnerabilities & Recommended Fixes

### Finding 1: Lack of Duration and Button Reset in startHeroFocusSession [Major]
*   **Vulnerability**: State variables and UI classes carry over from previous sessions.
*   **Recommended Fix**: Update `startHeroFocusSession` in `app.js` to clear duration selections and disable the start button:
    ```javascript
    // Reset duration selection when entering from hero
    document.querySelectorAll('.dur-pill').forEach(p => p.classList.remove('selected'));
    state.minutes = null;
    btnStart.disabled = true;
    ```

### Finding 2: Silent Failure when Custom Input is Empty/NaN [Major]
*   **Vulnerability**: The Start Focus button is active but does nothing when the custom input field is cleared.
*   **Recommended Fix**: In the custom input handler, disable the Start Focus button if the value is invalid or empty:
    ```javascript
    customInput.addEventListener('input', () => {
      let val = parseInt(customInput.value, 10);
      if (isNaN(val)) {
        state.minutes = null;
        updateDialCustom('');
        btnStart.disabled = true; // Disable if invalid
        return;
      }
      ...
      if(document.getElementById('dur-custom').classList.contains('selected')) {
        state.minutes = val;
        updateDialCustom(val);
        btnStart.disabled = false;
      }
    });
    ```

### Finding 3: Orphaned Vibe Screen and Inconsistent Navigation Naming [Minor]
*   **Vulnerability**: HTML contains a large orphaned `#screen-vibe` element and the Back button's labels mismatch its destination.
*   **Recommended Fix**:
    *   Change `#btn-back-vibe` labels and text to reflect that it goes back to the landing screen (e.g. `"Back to Home"` / `"Back to landing"`).
    *   Remove the dead `#screen-vibe` section from `index.html` and clean up its corresponding JavaScript in `app.js` to reduce bundle size and maintain code hygiene.
