/**
 * Settings store — see spec §2.3.
 *
 * Holds the adb path config + UI prefs (theme, history retention). `load()`
 * fetches the current adb config from the backend; `save()` persists a custom
 * adb path (or resets to auto). UI prefs are mirrored to localStorage so the
 * theme applies before the backend is reachable.
 */
import { create } from 'zustand';
import type { AdbConfig, AdbVersionInfo } from '@/bindings/types';
import { getAdbConfig, setAdbPath, validateAdb } from '@/ipc/client';
import { asAdbError } from '@/lib/errors';

export type Theme = 'system' | 'light' | 'dark';

const THEME_KEY = 'adb-buddy.theme';
const RETENTION_KEY = 'adb-buddy.historyRetentionDays';

function readTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function readRetention(): number {
  if (typeof localStorage === 'undefined') return 30;
  const v = Number(localStorage.getItem(RETENTION_KEY));
  return Number.isFinite(v) && v > 0 ? v : 30;
}

export interface SettingsState {
  /** Current adb config (path + version info). Null until loaded. */
  adbConfig: AdbConfig | null;
  /** Validation result from the last `validate_adb` call. */
  validation: AdbVersionInfo | null;
  theme: Theme;
  historyRetentionDays: number;
  loading: boolean;
  error: string | null;
  /** Load the adb config from the backend. */
  load: () => Promise<void>;
  /** Persist a custom adb path (or null to reset to auto). */
  save: (path: string | null) => Promise<void>;
  /** Run `adb version` and store the result. */
  validate: () => Promise<void>;
  setTheme: (t: Theme) => void;
  setRetentionDays: (n: number) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  adbConfig: null,
  validation: null,
  theme: readTheme(),
  historyRetentionDays: readRetention(),
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const adbConfig = await getAdbConfig();
      set({ adbConfig, loading: false });
    } catch (e) {
      const adb = asAdbError(e);
      set({
        loading: false,
        error: adb ? adb.kind : String(e),
      });
    }
  },

  save: async (path) => {
    set({ loading: true, error: null });
    try {
      const adbConfig = await setAdbPath(path);
      set({ adbConfig, loading: false });
    } catch (e) {
      const adb = asAdbError(e);
      set({ loading: false, error: adb ? adb.kind : String(e) });
    }
  },

  validate: async () => {
    set({ error: null });
    try {
      const validation = await validateAdb();
      set({ validation });
      // Refresh the config too — the version info may have changed.
      await get().load();
    } catch (e) {
      const adb = asAdbError(e);
      set({ error: adb ? adb.kind : String(e) });
    }
  },

  setTheme: (t) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_KEY, t);
    }
    set({ theme: t });
  },

  setRetentionDays: (n) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RETENTION_KEY, String(n));
    }
    set({ historyRetentionDays: n });
  },
}));

/**
 * Resolve the effective theme (system → light/dark) for `FluentProvider`.
 * Reads `prefers-color-scheme` when theme is `system`.
 */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}
