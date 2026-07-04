/**
 * Typed event listeners for Tauri events.
 *
 * The Rust backend emits events on these channels:
 *  - `logcat://line` — one per line of `adb logcat` stdout.
 *  - `process://exited` — when a long-running process (logcat) exits.
 */
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { LogcatLineEvent, ProcessExitedEvent } from '@/bindings/types';

/**
 * Subscribe to `logcat://line` events. Returns an unlisten function that
 * removes the listener when called.
 */
export function onLogcatLine(
  cb: (payload: LogcatLineEvent) => void,
): Promise<UnlistenFn> {
  return listen<LogcatLineEvent>('logcat://line', (e) => cb(e.payload));
}

/**
 * Subscribe to `process://exited` events. `exit_code` may be null when the
 * process was killed rather than exiting naturally.
 */
export function onProcessExited(
  cb: (payload: ProcessExitedEvent) => void,
): Promise<UnlistenFn> {
  return listen<ProcessExitedEvent>('process://exited', (e) =>
    cb(e.payload),
  );
}
