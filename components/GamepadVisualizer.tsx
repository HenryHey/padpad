'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const KEYBOARD_MODE_TIMEOUT_MS = 1000;
const SEQUENCE_IDLE_TIMEOUT_MS = 500;
const SAMPLE_EVERY_N_FRAMES = 1;
const MAX_SNAPSHOT_ROWS = 30;

type SnapshotEntry = {
  labels: string[];
  duration: number;
};

type StatusVariant = 'connected' | 'disconnected';

type UiState = {
  gamepadName: string;
  statusText: string;
  statusVariant: StatusVariant;
  hint: string;
};

type GamepadLike = {
  mapping: Gamepad['mapping'];
  buttons: Array<{ pressed: boolean; value: number }>;
};

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
  'Home',
];

const KEY_TO_BUTTON_INDEX: Record<string, number> = {
  ArrowUp: 12,
  ArrowDown: 13,
  ArrowLeft: 14,
  ArrowRight: 15,
  KeyW: 12,
  KeyS: 13,
  KeyA: 14,
  KeyD: 15,
  KeyZ: 0,
  KeyX: 1,
  KeyC: 2,
  KeyV: 3,
  Space: 0,
  Digit1: 4,
  Digit2: 5,
  Digit3: 6,
  Digit4: 7,
  ShiftLeft: 4,
  ShiftRight: 4,
  ControlLeft: 5,
  ControlRight: 5,
  Tab: 8,
  Enter: 9,
  Escape: 16,
};

const ARROW_ASSETS: Record<string, string> = {
  Up: '/img/arrow-up.png',
  Down: '/img/arrow-down.png',
  Left: '/img/arrow-left.png',
  Right: '/img/arrow-right.png',
  'Up-Right': '/img/arrow-up-right.png',
  'Down-Right': '/img/arrow-down-right.png',
  'Down-Left': '/img/arrow-down-left.png',
  'Up-Left': '/img/arrow-up-left.png',
};

const INITIAL_UI_STATE: UiState = {
  gamepadName: 'No gamepad connected',
  statusText: 'Waiting…',
  statusVariant: 'disconnected',
  hint: 'Press any button on your controller to begin.',
};

function labelForIndex(index: number, gamepad: Gamepad | GamepadLike | null) {
  const isStandard = Boolean(gamepad && gamepad.mapping === 'standard');
  return isStandard && buttonNamesStandard[index]
    ? buttonNamesStandard[index]
    : `Button ${index}`;
}

function mergeDiagonals(labels: string[]) {
  const merged: string[] = [];
  const used = new Set<number>();

  const pair = (baseIndex: number, otherLabel: string, combined: string) => {
    const otherIndex = labels.findIndex((entry, index) => entry === otherLabel && !used.has(index));
    if (otherIndex !== -1) {
      merged.push(combined);
      used.add(baseIndex);
      used.add(otherIndex);
      return true;
    }
    return false;
  };

  for (let i = 0; i < labels.length; i++) {
    if (used.has(i)) continue;
    const label = labels[i];
    let mergedDiagonal = false;

    switch (label) {
      case 'Up':
        mergedDiagonal = pair(i, 'Right', 'Up-Right') || pair(i, 'Left', 'Up-Left');
        break;
      case 'Down':
        mergedDiagonal = pair(i, 'Right', 'Down-Right') || pair(i, 'Left', 'Down-Left');
        break;
      case 'Right':
        mergedDiagonal = pair(i, 'Up', 'Up-Right') || pair(i, 'Down', 'Down-Right');
        break;
      case 'Left':
        mergedDiagonal = pair(i, 'Up', 'Up-Left') || pair(i, 'Down', 'Down-Left');
        break;
      default:
        break;
    }

    if (!mergedDiagonal) {
      merged.push(label);
      used.add(i);
    }
  }

  return merged;
}

export function GamepadVisualizer() {
  const [uiState, setUiState] = useState<UiState>(INITIAL_UI_STATE);
  const [timelineEntries, setTimelineEntries] = useState<SnapshotEntry[]>([]);
  const [sequenceActive, setSequenceActive] = useState(false);

  const uiStateRef = useRef(INITIAL_UI_STATE);
  const timelineRef = useRef<SnapshotEntry[]>([]);
  const sequenceActiveRef = useRef(false);

  const keyboardPressedRef = useRef(new Set<number>());
  const keyboardTimerRef = useRef<number | null>(null);
  const keyboardModeEnabledRef = useRef(false);

  const activeIndexRef = useRef<number | null>(null);
  const frameCounterRef = useRef(0);
  const lastInputAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const applyUiState = (next: UiState) => {
    const current = uiStateRef.current;
    if (
      current.gamepadName === next.gamepadName &&
      current.statusText === next.statusText &&
      current.statusVariant === next.statusVariant &&
      current.hint === next.hint
    ) {
      return;
    }
    uiStateRef.current = next;
    setUiState(next);
  };

  const applyTimeline = (entries: SnapshotEntry[]) => {
    timelineRef.current = entries;
    setTimelineEntries(entries);
  };

  const applySequenceActive = (active: boolean) => {
    if (sequenceActiveRef.current === active) return;
    sequenceActiveRef.current = active;
    setSequenceActive(active);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const navigatorWithWebkit = navigator as Navigator & {
      webkitGetGamepads?: Navigator['getGamepads'];
    };

    const getPads = () => {
      const getter = navigatorWithWebkit.getGamepads || navigatorWithWebkit.webkitGetGamepads;
      if (!getter) return [] as (Gamepad | null)[];
      const pads = getter.call(navigatorWithWebkit) || [];
      return Array.from(pads);
    };

    if (!navigatorWithWebkit.getGamepads && !navigatorWithWebkit.webkitGetGamepads) {
      applyUiState({
        gamepadName: 'Try Chrome/Edge/Firefox',
        statusText: 'Gamepad API not supported',
        statusVariant: 'disconnected',
        hint: '',
      });
      return;
    }

    const resetTimeline = () => {
      timelineRef.current = [];
      applyTimeline([]);
    };

    const arraysEqual = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    };

    const sampleTimeline = (gamepad: Gamepad | GamepadLike) => {
      const pressedLabels: string[] = [];
      gamepad.buttons.forEach((button, index) => {
        if (button && (button.pressed || button.value > 0.5)) {
          pressedLabels.push(labelForIndex(index, gamepad));
        }
      });

      const mergedLabels = mergeDiagonals(pressedLabels);
      const timeline = timelineRef.current;
      const lastEntry = timeline[timeline.length - 1];

      if (lastEntry && arraysEqual(mergedLabels, lastEntry.labels)) {
        lastEntry.duration += 1;
      } else {
        timeline.push({ labels: mergedLabels, duration: 1 });
        if (timeline.length > MAX_SNAPSHOT_ROWS) {
          timeline.shift();
        }
      }

      applyTimeline([...timeline]);
    };

    const keyboardGamepad = (): GamepadLike => {
      const buttons = buttonNamesStandard.map((_, index) => {
        const isPressed = keyboardPressedRef.current.has(index);
        return { pressed: isPressed, value: isPressed ? 1 : 0 };
      });
      return { mapping: 'standard', buttons };
    };

    const pickActiveGamepad = () => {
      const pads = getPads();
      if (activeIndexRef.current != null && pads[activeIndexRef.current]) {
        return pads[activeIndexRef.current];
      }
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
          activeIndexRef.current = i;
          return pads[i];
        }
      }
      activeIndexRef.current = null;
      return null;
    };

    const cancelKeyboardFallback = () => {
      if (keyboardTimerRef.current != null) {
        window.clearTimeout(keyboardTimerRef.current);
        keyboardTimerRef.current = null;
      }
    };

    const scheduleKeyboardFallback = () => {
      if (keyboardTimerRef.current != null) return;
      keyboardTimerRef.current = window.setTimeout(() => {
        const gp = pickActiveGamepad();
        if (!gp) {
          keyboardModeEnabledRef.current = true;
          applyUiState({
            gamepadName: 'Keyboard emulation',
            statusText: 'Keyboard mode',
            statusVariant: 'connected',
            hint:
              'WASD/arrows, Z/X/C/V, Space/Enter, Shift/Ctrl, Tab/1–4. Showing last 30 snapshots (reset after 0.2s idle).',
          });
        }
        keyboardTimerRef.current = null;
      }, KEYBOARD_MODE_TIMEOUT_MS);
    };

    const updateUiForConnected = (gamepad: Gamepad) => {
      applyUiState({
        gamepadName: gamepad.id,
        statusText: 'Connected',
        statusVariant: 'connected',
        hint: 'Sampling every 2 frames; showing last 30 snapshots (resets after 0.2s idle).',
      });
    };

    const updateUiForWaiting = () => {
      applyUiState({
        gamepadName: 'No gamepad connected',
        statusText: 'Waiting…',
        statusVariant: 'disconnected',
        hint: 'Press any button on your controller to begin.',
      });
    };

    const updateLoop = () => {
      const gamepad = pickActiveGamepad();
      let activePad: Gamepad | GamepadLike | null = null;

      if (gamepad) {
        updateUiForConnected(gamepad);
        cancelKeyboardFallback();
        keyboardModeEnabledRef.current = false;
        keyboardPressedRef.current.clear();
        activePad = gamepad;
      } else if (keyboardModeEnabledRef.current) {
        activePad = keyboardGamepad();
      } else {
        updateUiForWaiting();
      }

      const now = Date.now();
      if (activePad && activePad.buttons.length > 0) {
        const anyPressed = activePad.buttons.some((button) => button && (button.pressed || button.value > 0.5));
        if (anyPressed) {
          lastInputAtRef.current = now;
          if (!sequenceActiveRef.current) {
            applySequenceActive(true);
            resetTimeline();
            sampleTimeline(activePad);
          }
        }
      }

      if (sequenceActiveRef.current) {
        if (lastInputAtRef.current !== 0 && now - lastInputAtRef.current > SEQUENCE_IDLE_TIMEOUT_MS) {
          applySequenceActive(false);
          resetTimeline();
          lastInputAtRef.current = 0;
        } else if (activePad && frameCounterRef.current % SAMPLE_EVERY_N_FRAMES === 0) {
          sampleTimeline(activePad);
        }
      }

      frameCounterRef.current += 1;
      rafRef.current = window.requestAnimationFrame(updateLoop);
    };

    const handleGamepadConnected = (event: GamepadEvent) => {
      activeIndexRef.current = event.gamepad.index;
      keyboardModeEnabledRef.current = false;
      cancelKeyboardFallback();
      updateUiForConnected(event.gamepad);
      if (!sequenceActiveRef.current) {
        resetTimeline();
      }
    };

    const handleGamepadDisconnected = (event: GamepadEvent) => {
      if (activeIndexRef.current === event.gamepad.index) {
        activeIndexRef.current = null;
      }
      scheduleKeyboardFallback();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!keyboardModeEnabledRef.current) return;
      const index = KEY_TO_BUTTON_INDEX[event.code];
      if (index == null) return;
      if (
        event.code.startsWith('Arrow') ||
        event.code === 'Space' ||
        event.code === 'Tab'
      ) {
        event.preventDefault();
      }
      keyboardPressedRef.current.add(index);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!keyboardModeEnabledRef.current) return;
      const index = KEY_TO_BUTTON_INDEX[event.code];
      if (index == null) return;
      if (
        event.code.startsWith('Arrow') ||
        event.code === 'Space' ||
        event.code === 'Tab'
      ) {
        event.preventDefault();
      }
      keyboardPressedRef.current.delete(index);
    };

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    scheduleKeyboardFallback();
    rafRef.current = window.requestAnimationFrame(updateLoop);

    return () => {
      cancelKeyboardFallback();
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const renderLabel = (label: string) => {
    const src = ARROW_ASSETS[label];
    if (src) {
      return (
        <Image
          className="arrow-icon"
          src={src}
          alt={label}
          width={16}
          height={16}
        />
      );
    }
    return label;
  };

  return (
    <>
      <div className="header">
        <div>
          <h1>Gamepad buttons pressed</h1>
          <p className="sub">{uiState.gamepadName}</p>
        </div>
        <div className="status">
          <span className={`status-dot ${uiState.statusVariant}`}></span>
          <span>{uiState.statusText}</span>
        </div>
      </div>
      <ul className="pressed" aria-label="Pressed buttons">
        {sequenceActive ? (
          <>
            {timelineEntries.map((entry, index) => (
              <li key={`entry-${index}`} className="snapshot-row snapshot-row--active">
                <span className="snapshot-chip snapshot-chip--duration">{entry.duration}</span>
                {entry.labels.length === 0 ? (
                  <span className="snapshot-chip snapshot-chip--empty">—</span>
                ) : (
                  entry.labels.map((label, labelIndex) => (
                    <span
                      key={`${label}-${labelIndex}`}
                      className="snapshot-chip snapshot-chip--active"
                    >
                      {renderLabel(label)}
                    </span>
                  ))
                )}
              </li>
            ))}
            {Array.from({ length: Math.max(0, MAX_SNAPSHOT_ROWS - timelineEntries.length) }).map(
              (_, index) => (
                <li key={`pad-${index}`} className="snapshot-row snapshot-row--inactive">
                  <span className="snapshot-chip snapshot-chip--empty">·</span>
                </li>
              ),
            )}
          </>
        ) : (
          buttonNamesStandard.map((label, index) => (
            <li key={`label-${index}`} className="snapshot-row">
              <span className="snapshot-chip snapshot-chip--label">{renderLabel(label)}</span>
            </li>
          ))
        )}
      </ul>
      <p className="hint">{uiState.hint}</p>
    </>
  );
}

export default GamepadVisualizer;

