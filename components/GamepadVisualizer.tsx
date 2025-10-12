'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import {
  MAX_SNAPSHOT_ROWS,
  buttonNamesStandard,
  createInputController,
  type SnapshotEntry,
  type UiState,
} from './inputController';

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

    if (!navigatorWithWebkit.getGamepads && !navigatorWithWebkit.webkitGetGamepads) {
      applyUiState({
        gamepadName: 'Try Chrome/Edge/Firefox',
        statusText: 'Gamepad API not supported',
        statusVariant: 'disconnected',
        hint: '',
      });
      return;
    }

    const controller = createInputController({
      navigatorWithWebkit,
      applyUiState,
      applyTimeline,
      applySequenceActive,
      timelineRef,
      sequenceActiveRef,
      keyboardPressedRef,
      keyboardTimerRef,
      keyboardModeEnabledRef,
      activeIndexRef,
      frameCounterRef,
      lastInputAtRef,
      rafRef,
    });

    window.addEventListener('gamepadconnected', controller.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', controller.handleGamepadDisconnected);
    window.addEventListener('keydown', controller.handleKeyDown);
    window.addEventListener('keyup', controller.handleKeyUp);

    controller.scheduleKeyboardFallback();
    rafRef.current = window.requestAnimationFrame(controller.updateLoop);

    return () => {
      controller.cancelKeyboardFallback();
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener('gamepadconnected', controller.handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', controller.handleGamepadDisconnected);
      window.removeEventListener('keydown', controller.handleKeyDown);
      window.removeEventListener('keyup', controller.handleKeyUp);
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

