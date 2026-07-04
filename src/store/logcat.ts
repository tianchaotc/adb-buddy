/**
 * Logcat store — see spec §2.3.
 *
 * Holds the running state, the active session id, and a ring buffer of parsed
 * log lines (max 10k). `start()` invokes the backend and wires up the event
 * listener; `stop()` kills the session. In mock mode, lines are emitted on a
 * timer so the UI is exercisable without a device.
 */
import { create } from 'zustand';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AdbError, LogcatFilters } from '@/bindings/types';
import { clearLogcatBuffer, startLogcat, stopLogcat } from '@/ipc/client';
import { onLogcatLine, onProcessExited } from '@/ipc/events';
import { isMockMode, MOCK_LOGCAT_LINES } from '@/ipc/mock';
import { asAdbError } from '@/lib/errors';

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F';

export interface LogLine {
  raw: string;
  timestamp: string;
  pid: number;
  tid: number;
  level: LogLevel;
  tag: string;
  message: string;
  isCrash: boolean;
  isAnr: boolean;
}

export interface LogcatFiltersState {
  tag: string;
  level: LogLevel[];
  text: string;
  package: string;
}

const MAX_LINES = 10_000;

/**
 * Parse a raw logcat line into a structured `LogLine`.
 *
 * Accepts the default logcat format:
 *   `MM-DD HH:MM:SS.mmm  PID TID LEVEL TAG: MESSAGE`
 * Falls back gracefully when the format doesn't match — the whole line
 * becomes the message.
 */
export function parseLogLine(raw: string): LogLine {
  const trimmed = raw.trimEnd();
  // Try the default format.
  const match = trimmed.match(
    /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(\S+?):\s?(.*)$/,
  );
  let timestamp: string;
  let pid = 0;
  let tid = 0;
  let level: LogLevel = 'I';
  let tag = '';
  let message = trimmed;
  if (match) {
    timestamp = match[1];
    pid = Number(match[2]);
    tid = Number(match[3]);
    level = match[4] as LogLevel;
    tag = match[5];
    message = match[6];
  } else {
    timestamp = new Date().toISOString().slice(5).replace('T', ' ');
  }
  const isCrash =
    /FATAL EXCEPTION/i.test(message) ||
    /AndroidRuntime.*FATAL/i.test(raw) ||
    level === 'F';
  const isAnr = /ANR in /i.test(message) || /ANR in /i.test(raw);
  return { raw: trimmed, timestamp, pid, tid, level, tag, message, isCrash, isAnr };
}

interface LogcatState {
  running: boolean;
  sessionId: string | null;
  lines: LogLine[];
  filters: LogcatFiltersState;
  error: AdbError | null;
  start: (filters: LogcatFilters, serial: string | null) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  setFilters: (f: Partial<LogcatFiltersState>) => void;
  appendLine: (line: string) => void;
  /** Internal: the active listeners, cleaned up on stop. */
  _unlisten?: UnlistenFn;
  _mockTimer?: ReturnType<typeof setInterval>;
}

export const useLogcatStore = create<LogcatState>((set, get) => ({
  running: false,
  sessionId: null,
  lines: [],
  filters: { tag: '', level: [], text: '', package: '' },
  error: null,

  start: async (filters, serial) => {
    if (get().running) return;
    set({ error: null });
    try {
      const sessionId = await startLogcat(serial, filters);
      const unlisten = await onLogcatLine((p) => {
        if (p.session_id !== sessionId) return;
        get().appendLine(p.line);
      });
      const unlistenExit = await onProcessExited((p) => {
        if (p.session_id !== sessionId) return;
        set({ running: false, sessionId: null });
      });
      const combined: UnlistenFn = () => {
        unlisten();
        unlistenExit();
      };
      set({ running: true, sessionId, _unlisten: combined, lines: [] });

      // In mock mode, emit lines on a timer so the UI shows streaming output.
      if (isMockMode()) {
        let i = 0;
        const timer = setInterval(() => {
          const line = MOCK_LOGCAT_LINES[i % MOCK_LOGCAT_LINES.length];
          i++;
          get().appendLine(line);
        }, 500);
        set({ _mockTimer: timer });
      }
    } catch (e) {
      set({ error: asAdbError(e), running: false, sessionId: null });
    }
  },

  stop: async () => {
    const { sessionId, _unlisten, _mockTimer } = get();
    if (_mockTimer) {
      clearInterval(_mockTimer);
    }
    if (_unlisten) {
      _unlisten();
    }
    if (sessionId) {
      try {
        await stopLogcat(sessionId);
      } catch {
        // Best-effort — the process may already be gone.
      }
    }
    set({
      running: false,
      sessionId: null,
      _unlisten: undefined,
      _mockTimer: undefined,
    });
  },

  clear: () => set({ lines: [] }),

  setFilters: (f) =>
    set((state) => ({ filters: { ...state.filters, ...f } })),

  appendLine: (line) =>
    set((state) => {
      const parsed = parseLogLine(line);
      const lines = [...state.lines, parsed];
      if (lines.length > MAX_LINES) {
        lines.splice(0, lines.length - MAX_LINES);
      }
      return { lines };
    }),
}));

/**
 * Clear the on-device logcat buffer. Independent of the running session so the
 * user can clear the device buffer without stopping the stream.
 */
export async function clearDeviceBuffer(serial: string | null): Promise<void> {
  await clearLogcatBuffer(serial);
}
