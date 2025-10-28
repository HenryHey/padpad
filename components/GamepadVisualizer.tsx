"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  MAX_SNAPSHOT_ROWS,
  buttonNamesStandard,
  createInputController,
  type SnapshotEntry,
  type UiState,
} from "./inputController";

const ARROW_ASSETS: Record<string, string> = {
  Up: "/padpad/img/arrow-up.png",
  Down: "/padpad/img/arrow-down.png",
  Left: "/padpad/img/arrow-left.png",
  Right: "/padpad/img/arrow-right.png",
  "Up-Right": "/padpad/img/arrow-up-right.png",
  "Down-Right": "/padpad/img/arrow-down-right.png",
  "Down-Left": "/padpad/img/arrow-down-left.png",
  "Up-Left": "/padpad/img/arrow-up-left.png",
};

const INITIAL_UI_STATE: UiState = {
  gamepadName: "No gamepad connected",
  statusText: "Waiting…",
  statusVariant: "disconnected",
  hint: "Press any button on your controller to begin.",
};

type AnnotatedSnapshotEntry = SnapshotEntry & { hadouken: boolean };

const DIRECTION_LABELS = new Set([
  "Up",
  "Down",
  "Left",
  "Right",
  "Up-Right",
  "Up-Left",
  "Down-Right",
  "Down-Left",
]);

const ALLOWED_HADOUKEN_LABELS = new Set(["Down", "Down-Right", "Right"]);

const isHadoukenSequenceEndingAt = (
  entries: SnapshotEntry[],
  pressIndex: number
) => {
  const pressEntry = entries[pressIndex];
  if (!pressEntry || !pressEntry.labels.includes("A")) return false;

  const hasDisallowedDirections = (labels: string[]) =>
    labels.some(
      (label) =>
        DIRECTION_LABELS.has(label) && !ALLOWED_HADOUKEN_LABELS.has(label)
    );

  if (hasDisallowedDirections(pressEntry.labels)) {
    return false;
  }

  const extractAllowedDirections = (labels: string[]) =>
    labels.filter((label) => ALLOWED_HADOUKEN_LABELS.has(label));

  const collectDirectionWindows = () => {
    const windows: string[][] = [];
    for (let index = pressIndex - 1; index >= 0; index -= 1) {
      const labels = entries[index]?.labels ?? [];
      if (labels.includes("A")) {
        return { windows: [] as string[][], invalid: true } as const;
      }
      if (hasDisallowedDirections(labels)) {
        break;
      }
      const allowedDirections = extractAllowedDirections(labels);
      if (allowedDirections.length > 0) {
        windows.push(allowedDirections);
      }
    }
    windows.reverse();
    return { windows, invalid: false } as const;
  };

  const { windows, invalid } = collectDirectionWindows();
  if (invalid) {
    return false;
  }

  const pressDirections = extractAllowedDirections(pressEntry.labels);
  const directionSequence =
    pressDirections.length > 0 ? [...windows, pressDirections] : windows;
  if (directionSequence.length === 0) {
    return false;
  }

  let stage: 0 | 1 | 2 = 0;
  let sawPureDown = false;

  for (const directions of directionSequence) {
    const hasDown = directions.includes("Down");
    const hasDownRight = directions.includes("Down-Right");
    const hasRight = directions.includes("Right");

    if (hasDown && !hasRight) {
      sawPureDown = true;
    }

    if (stage === 0) {
      if (hasDown) {
        stage = 1;
      }
      continue;
    }

    if (stage === 1) {
      if (hasDownRight) {
        stage = 2;
      }
      continue;
    }

    if (stage === 2) {
      if (hasRight || hasDownRight) {
        return sawPureDown;
      }
    }
  }

  return false;
};

const findHadoukenAEntryIndices = (entries: SnapshotEntry[]) => {
  const indices = new Set<number>();
  entries.forEach((entry, index) => {
    if (!entry.labels.includes("A")) return;
    if (isHadoukenSequenceEndingAt(entries, index)) {
      indices.add(index);
    }
  });
  return indices;
};

export function GamepadVisualizer() {
  const [uiState, setUiState] = useState<UiState>(INITIAL_UI_STATE);
  const [timelineEntries, setTimelineEntries] = useState<
    AnnotatedSnapshotEntry[]
  >([]);
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
    const hadoukenIndices = findHadoukenAEntryIndices(entries);
    const annotatedEntries = entries.map((entry, index) => ({
      ...entry,
      hadouken: hadoukenIndices.has(index),
    }));
    setTimelineEntries(annotatedEntries);
  };

  const applySequenceActive = (active: boolean) => {
    if (sequenceActiveRef.current === active) return;
    sequenceActiveRef.current = active;
    setSequenceActive(active);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const navigatorWithWebkit = navigator as Navigator & {
      webkitGetGamepads?: Navigator["getGamepads"];
    };

    if (
      !navigatorWithWebkit.getGamepads &&
      !navigatorWithWebkit.webkitGetGamepads
    ) {
      applyUiState({
        gamepadName: "Try Chrome/Edge/Firefox",
        statusText: "Gamepad API not supported",
        statusVariant: "disconnected",
        hint: "",
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

    window.addEventListener(
      "gamepadconnected",
      controller.handleGamepadConnected
    );
    window.addEventListener(
      "gamepaddisconnected",
      controller.handleGamepadDisconnected
    );
    window.addEventListener("keydown", controller.handleKeyDown);
    window.addEventListener("keyup", controller.handleKeyUp);

    controller.scheduleKeyboardFallback();
    rafRef.current = window.requestAnimationFrame(controller.updateLoop);

    return () => {
      controller.cancelKeyboardFallback();
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener(
        "gamepadconnected",
        controller.handleGamepadConnected
      );
      window.removeEventListener(
        "gamepaddisconnected",
        controller.handleGamepadDisconnected
      );
      window.removeEventListener("keydown", controller.handleKeyDown);
      window.removeEventListener("keyup", controller.handleKeyUp);
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

  const renderLabelWithHadouken = (label: string, hadouken: boolean) => {
    if (label === "A" && hadouken) {
      return (
        <>
          {renderLabel(label)} <span>HADOUKEN!</span>
        </>
      );
    }
    return renderLabel(label);
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
              <li
                key={`entry-${index}`}
                className="snapshot-row snapshot-row--active"
              >
                <span className="snapshot-chip snapshot-chip--duration">
                  {entry.duration}
                </span>
                {entry.labels.length === 0 ? (
                  <span className="snapshot-chip snapshot-chip--empty">—</span>
                ) : (
                  entry.labels.map((label, labelIndex) => (
                    <span
                      key={`${label}-${labelIndex}`}
                      className="snapshot-chip snapshot-chip--active"
                    >
                      {renderLabelWithHadouken(label, entry.hadouken)}
                    </span>
                  ))
                )}
              </li>
            ))}
            {Array.from({
              length: Math.max(0, MAX_SNAPSHOT_ROWS - timelineEntries.length),
            }).map((_, index) => (
              <li
                key={`pad-${index}`}
                className="snapshot-row snapshot-row--inactive"
              >
                <span className="snapshot-chip snapshot-chip--empty">·</span>
              </li>
            ))}
          </>
        ) : (
          buttonNamesStandard.map((label, index) => (
            <li key={`label-${index}`} className="snapshot-row">
              <span className="snapshot-chip snapshot-chip--label">
                {renderLabel(label)}
              </span>
            </li>
          ))
        )}
      </ul>
      <p className="hint">{uiState.hint}</p>
    </>
  );
}

export default GamepadVisualizer;
