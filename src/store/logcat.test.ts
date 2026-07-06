/**
 * Tests for the logcat store mock-mode streaming path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogcatFilters } from '@/bindings/types';

vi.mock('@/ipc/client', () => ({
  clearLogcatBuffer: vi.fn().mockResolvedValue(undefined),
  startLogcat: vi.fn().mockResolvedValue('mock-session'),
  stopLogcat: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/ipc/events', () => ({
  onLogcatLine: vi.fn().mockRejectedValue(new Error('Tauri events unavailable')),
  onProcessExited: vi.fn().mockRejectedValue(new Error('Tauri events unavailable')),
}));

vi.mock('@/ipc/mock', () => ({
  isMockMode: () => true,
  MOCK_LOGCAT_LINES: [
    '07-04 10:00:00.123  1234 5678 I ActivityManager: Mock line',
  ],
}));

import { useLogcatStore } from './logcat';
import { onLogcatLine } from '@/ipc/events';

const filters: LogcatFilters = { filter_spec: null, text: null };

beforeEach(() => {
  vi.useFakeTimers();
  useLogcatStore.setState({
    running: false,
    sessionId: null,
    lines: [],
    filters: { tag: '', level: [], text: '', package: '' },
    error: null,
    _unlisten: undefined,
    _mockTimer: undefined,
  });
  vi.mocked(onLogcatLine).mockClear();
});

afterEach(() => {
  const timer = useLogcatStore.getState()._mockTimer;
  if (timer) {
    clearInterval(timer);
  }
  vi.useRealTimers();
});

describe('logcat store — mock mode', () => {
  it('streams mock lines without subscribing to Tauri events', async () => {
    await useLogcatStore.getState().start(filters, 'PIXEL7A1B2C3');
    await vi.advanceTimersByTimeAsync(500);

    const state = useLogcatStore.getState();
    expect(state.running).toBe(true);
    expect(state.error).toBeNull();
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.tag).toBe('ActivityManager');
    expect(onLogcatLine).not.toHaveBeenCalled();
  });
});
