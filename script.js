(function() {
  const pressedEl = document.getElementById('pressed');
  const nameEl = document.getElementById('gpName');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const hintEl = document.getElementById('hint');

  const KEYBOARD_MODE_TIMEOUT = 1000;
  const hasGamepadApi = !!(navigator.getGamepads || navigator.webkitGetGamepads);
  if (!hasGamepadApi) {
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Gamepad API not supported';
    nameEl.textContent = 'Try Chrome/Edge/Firefox';
    hintEl.textContent = '';
    return;
  }

  let globalTick = 0;

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

  // Timeline sampling (every N frames) and rendering per-button timelines
  const SEQUENCE_IDLE_TIMEOUT_MS = 200;
  const SAMPLE_EVERY_N_FRAMES = 2;
  const MAX_SNAPSHOT_ROWS = 30;
  const SNAPSHOT_ROW_HEIGHT_PX = 18;
  let frameCounter = 0;
  let lastInputAt = 0; // epoch ms of last frame that had any pressed button
  let sequenceActive = false;
  const sampledTicks = []; // Array<Array<string>> pressed labels per tick

  pressedEl.style.height = `${MAX_SNAPSHOT_ROWS * SNAPSHOT_ROW_HEIGHT_PX}px`;
  pressedEl.style.maxHeight = pressedEl.style.height;
  pressedEl.style.overflowY = 'hidden';
  pressedEl.style.overflowX = 'hidden';
  pressedEl.style.position = 'relative';
  pressedEl.style.gap = '2px';

  function labelForIndex(index, gamepad) {
    const isStandard = gamepad && gamepad.mapping === 'standard';
    return isStandard && buttonNamesStandard[index] ? buttonNamesStandard[index] : `Button ${index}`;
  }

  function resetTimeline() {
    sampledTicks.length = 0;
  }

  function sampleTimeline(gamepad) {
    if (!gamepad || !gamepad.buttons) return;
    const n = gamepad.buttons.length;
    const pressedLabels = [];
    for (let i = 0; i < n; i++) {
      const b = gamepad.buttons[i];
      const isPressed = !!(b.pressed || b.value > 0.5);
      if (isPressed) pressedLabels.push(labelForIndex(i, gamepad));
    }

    let equal = false;
    if (sampledTicks.length == pressedLabels.length) {
      for (let i=0; i<sampledTicks.length; i++) {
        if(sampledTicks[i] == pressedLabels[i]) {
          equal = true;
        }
      }
    }
    if (!equal) {
      sampledTicks.push(pressedLabels);
    }
    if (sampledTicks.length > MAX_SNAPSHOT_ROWS) sampledTicks.shift();
  }

  function renderTimeline(gamepad) {
    while (pressedEl.firstChild) pressedEl.removeChild(pressedEl.firstChild);
    if (!sequenceActive) {
      // When inactive, show all buttons top-to-bottom
      globalTick = 0;
      const n = (gamepad && gamepad.buttons ? gamepad.buttons.length : buttonNamesStandard.length);
      for (let i = 0; i < n; i++) {
        const row = document.createElement('li');
        row.className = 'snapshot-row';
        const chip = document.createElement('span');
        chip.className = 'snapshot-chip snapshot-chip--label';
        chip.textContent = buttonNamesStandard[i] || labelForIndex(i, gamepad);
        row.appendChild(chip);
        pressedEl.appendChild(row);
      }
      return;
    }

    globalTick++;
    // While active, render one line per sample tick, only showing pressed buttons
    for (let t = 0; t < sampledTicks.length; t++) {
      const row = document.createElement('li');
      row.className = 'snapshot-row snapshot-row--active';
      row.style.minHeight = `${SNAPSHOT_ROW_HEIGHT_PX}px`;
      const labels = sampledTicks[t];
      row.innerHTML = globalTick;
      if (labels.length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'snapshot-chip snapshot-chip--empty';
        placeholder.textContent = '—';
        row.appendChild(placeholder);
      } else {
        for (let j = 0; j < labels.length; j++) {
          const chip = document.createElement('span');
          chip.className = 'snapshot-chip snapshot-chip--active';
          chip.textContent = labels[j];
          row.appendChild(chip);
        }
      }
      pressedEl.appendChild(row);
    }

    // Pad remaining rows to keep viewport filled with 30 snapshots
    for (let pad = sampledTicks.length; pad < MAX_SNAPSHOT_ROWS; pad++) {
      const row = document.createElement('li');
      row.className = 'snapshot-row snapshot-row--inactive';
      row.style.minHeight = `${SNAPSHOT_ROW_HEIGHT_PX}px`;
      const placeholder = document.createElement('span');
      placeholder.className = 'snapshot-chip snapshot-chip--empty';
      placeholder.textContent = '·';
      row.appendChild(placeholder);
      pressedEl.appendChild(row);
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
    let activePad = null;
    if (gp) {
      nameEl.textContent = `${gp.id}`;
      setStatus(true, 'Connected');
      hintEl.textContent = 'Sampling every 2 frames; showing last 30 snapshots (resets after 0.2s idle).';
      // Prefer the real controller over keyboard mode
      cancelKeyboardFallback();
      keyboardModeEnabled = false;
      activePad = gp;
    } else if (keyboardModeEnabled) {
      nameEl.textContent = 'Keyboard emulation';
      setStatus(true, 'Keyboard mode');
      // Keep the hint concise while in keyboard mode
      hintEl.textContent = 'WASD/arrows, Z/X/C/V, Space/Enter, Shift/Ctrl, Tab/1–4. Showing last 30 snapshots (reset after 0.2s idle).';
      activePad = keyboardGamepad();
    } else {
      nameEl.textContent = 'No gamepad connected';
      setStatus(false, 'Waiting…');
      hintEl.textContent = 'Press any button on your controller to begin.';
      activePad = null;
    }

    const now = Date.now();
    if (activePad && activePad.buttons && activePad.buttons.length > 0) {
      const anyPressed = activePad.buttons.some(b => b.pressed || b.value > 0.5);
      if (anyPressed) {
        lastInputAt = now;
        if (!sequenceActive) {
          sequenceActive = true;
          resetTimeline();
          sampleTimeline(activePad); // capture immediately on start
        }
      }
    }

    if (sequenceActive) {
      if (lastInputAt !== 0 && now - lastInputAt > SEQUENCE_IDLE_TIMEOUT_MS) {
        sequenceActive = false;
        resetTimeline();
        lastInputAt = 0;
      } else if (activePad && frameCounter % SAMPLE_EVERY_N_FRAMES === 0) {
        sampleTimeline(activePad);
      }
    }

    renderTimeline(activePad);
    frameCounter++;
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


