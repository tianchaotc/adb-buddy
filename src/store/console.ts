/**
 * Console store — see spec §2.3.
 *
 * Holds the last command result + a small ring buffer of recent results, so
 * the bottom CommandConsole panel can show the most recent activity.
 */
import { create } from 'zustand';

export interface CommandResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timestamp: string;
}

const MAX_HISTORY = 50;

export interface ConsoleState {
  lastCommand: CommandResult | null;
  history: CommandResult[];
  /** Record a new command result (prepended to history, last 50 kept). */
  append: (r: CommandResult) => void;
  /** Clear all history. */
  clear: () => void;
}

export const useConsoleStore = create<ConsoleState>((set) => ({
  lastCommand: null,
  history: [],

  append: (r) =>
    set((state) => {
      const history = [r, ...state.history].slice(0, MAX_HISTORY);
      return { lastCommand: r, history };
    }),

  clear: () => set({ lastCommand: null, history: [] }),
}));
