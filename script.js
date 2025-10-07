(function() {
  const pressedEl = document.getElementById('pressed');
  const nameEl = document.getElementById('gpName');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const hintEl = document.getElementById('hint');

  const KEYBOARD_MODE_TIMEOUT = 30000;
  const hasGamepadApi = !!(navigator.getGamepads || navigator.webkitGetGamepads);
  if (!hasGamepadApi) {
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Gamepad API not supported';
    nameEl.textContent = 'Try Chrome/Edge/Firefox';
    hintEl.textContent = '';
    return;
  }

  const buttonNamesStandard = [
    'A',
    'B',
    'X',
    'Y',
    'L1',
    'R1',
    'L2',
    'R2',
    'Select',
    'Start',
    'L3',
    'R3',
    'Up',
    'Down',
    'Left',
    'Right',
    'Home'
  ];

  let activeIndex = null; // index in navigator.getGamepads()
  let rafId = null;

  // Keyboard fallback state
  let keyboardModeEnabled = false;
  let keyboardTimerId = null;
  const keyboardPressed = new Set(); // stores indices of pressed "standard" buttons
  const KEY_TO_BUTTON_INDEX = {
    // D-Pad
    ArrowUp: 12,
    ArrowDown: 13,
    ArrowLeft: 14,
    ArrowRight: 15,
    KeyW: 12,
    KeyS: 13,
    KeyA: 14,
    KeyD: 15,
    // Face buttons
    KeyZ: 0, // A
    KeyX: 1, // B
    KeyC: 2, // X
    KeyV: 3, // Y
    Space: 0, // A
    // Shoulders / triggers
    Digit1: 4, // L1
    Digit2: 5, // R1
    Digit3: 6, // L2
    Digit4: 7, // R2
    ShiftLeft: 4,
    ShiftRight: 4,
    ControlLeft: 5,
    ControlRight: 5,
    // Menu / system
    Tab: 8, // Select / View
    Enter: 9, // Start / Options
    Escape: 16 // Home / Guide
  };

  // Sequence tracking (time-ordered button presses)
  const SEQUENCE_IDLE_TIMEOUT_MS = 1000;
  let lastInputAt = 0; // epoch ms of the last new press detected
  let buttonPressSequence = []; // array of labels, e.g. ["A", "Right", ...]
  let previouslyPressedIndices = new Set(); // indices pressed in previous frame

  function labelForIndex(index, gamepad) {
    const isStandard = gamepad && gamepad.mapping === 'standard';
    return isStandard && buttonNamesStandard[index] ? buttonNamesStandard[index] : `Button ${index}`;
  }

  function getPressedIndices(gamepad) {
    const pressed = new Set();
    if (!gamepad || !gamepad.buttons) return pressed;
    for (let i = 0; i < gamepad.buttons.length; i++) {
      const b = gamepad.buttons[i];
      const isPressed = b.pressed || b.value > 0.5; // include analog triggers
      if (isPressed) pressed.add(i);
    }
    return pressed;
  }

  function appendNewPresses(gamepad) {
    const now = Date.now();
    const currentlyPressed = getPressedIndices(gamepad);
    let hasNewPress = false;
    for (const index of currentlyPressed) {
      if (!previouslyPressedIndices.has(index)) {
        buttonPressSequence.push(labelForIndex(index, gamepad));
        hasNewPress = true;
      }
    }
    if (hasNewPress) lastInputAt = now;
    previouslyPressedIndices = currentlyPressed;
  }

  function resetSequence() {
    buttonPressSequence = [];
  }

  function renderSequence() {
    while (pressedEl.firstChild) pressedEl.removeChild(pressedEl.firstChild);
    if (buttonPressSequence.length === 0) {
      const li = document.createElement('li');
      li.className = 'chip';
      li.textContent = 'None';
      pressedEl.appendChild(li);
      return;
    }
    for (const label of buttonPressSequence) {
      const li = document.createElement('li');
      li.className = 'chip';
      li.textContent = label;
      pressedEl.appendChild(li);
    }
  }

  function getPads() {
    const getter = navigator.getGamepads || navigator.webkitGetGamepads;
    const pads = getter.call(navigator) || [];
    return Array.from(pads);
  }

  function pickActiveGamepad() {
    const pads = getPads();
    if (activeIndex != null && pads[activeIndex]) return pads[activeIndex];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]) { activeIndex = i; return pads[i]; }
    }
    activeIndex = null;
    return null;
  }

  function scheduleKeyboardFallback() {
    if (keyboardTimerId != null) return;
    keyboardTimerId = window.setTimeout(() => {
      const gp = pickActiveGamepad();
      if (!gp) {
        keyboardModeEnabled = true;
        hintEl.textContent = 'No controller found. Keyboard mode active: arrows/WASD, Z/X/C/V, Space/Enter, Shift/Ctrl, Tab/1–4.';
      }
      keyboardTimerId = null;
    }, KEYBOARD_MODE_TIMEOUT);
  }

  function cancelKeyboardFallback() {
    if (keyboardTimerId != null) {
      clearTimeout(keyboardTimerId);
      keyboardTimerId = null;
    }
  }

  function keyboardGamepad() {
    const buttons = [];
    for (let i = 0; i <= 16; i++) {
      const isPressed = keyboardPressed.has(i);
      buttons.push({ pressed: isPressed, value: isPressed ? 1 : 0 });
    }
    return { mapping: 'standard', buttons };
  }

  function onKeyDown(e) {
    if (!keyboardModeEnabled) return;
    const idx = KEY_TO_BUTTON_INDEX[e.code];
    if (idx == null) return;
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    keyboardPressed.add(idx);
  }

  function onKeyUp(e) {
    if (!keyboardModeEnabled) return;
    const idx = KEY_TO_BUTTON_INDEX[e.code];
    if (idx == null) return;
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    keyboardPressed.delete(idx);
  }

  function setStatus(connected, text) {
    statusDot.classList.remove('connected', 'disconnected');
    if (connected) {
      statusDot.classList.add('connected');
      statusText.textContent = text || 'Connected';
    } else {
      statusDot.classList.add('disconnected');
      statusText.textContent = text || 'Disconnected';
    }
  }


  function update() {
    const gp = pickActiveGamepad();
    if (gp) {
      nameEl.textContent = `${gp.id}`;
      setStatus(true, 'Connected');
      hintEl.textContent = 'Press buttons to build a sequence (resets after 1s idle).';
      // Prefer the real controller over keyboard mode
      cancelKeyboardFallback();
      keyboardModeEnabled = false;
      appendNewPresses(gp);
    } else if (keyboardModeEnabled) {
      nameEl.textContent = 'Keyboard emulation';
      setStatus(true, 'Keyboard mode');
      // Keep the hint concise while in keyboard mode
      hintEl.textContent = 'Use arrows/WASD, Z/X/C/V, Space/Enter, Shift/Ctrl, Tab/1–4 (resets after 1s idle).';
      appendNewPresses(keyboardGamepad());
    } else {
      nameEl.textContent = 'No gamepad connected';
      setStatus(false, 'Waiting…');
      hintEl.textContent = 'Press any button on your controller to begin.';
      previouslyPressedIndices = new Set();
    }
    // Reset the recorded sequence after 1s without a new press
    const now = Date.now();
    if (lastInputAt !== 0 && now - lastInputAt > SEQUENCE_IDLE_TIMEOUT_MS && buttonPressSequence.length > 0) {
      resetSequence();
      lastInputAt = 0;
    }
    renderSequence();
    rafId = window.requestAnimationFrame(update);
  }

  window.addEventListener('gamepadconnected', (e) => {
    activeIndex = e.gamepad.index;
    cancelKeyboardFallback();
    keyboardModeEnabled = false;
    update();
  });

  window.addEventListener('gamepaddisconnected', (e) => {
    if (activeIndex === e.gamepad.index) activeIndex = null;
    // schedule keyboard fallback after a short wait
    scheduleKeyboardFallback();
  });

  // Start keyboard listeners
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Start the loop immediately so we also pick up controllers on browsers
  // that do not fire the connect event until a button is pressed.
  // Also schedule keyboard fallback if no controller appears within 5 seconds.
  scheduleKeyboardFallback();
  update();
})();


