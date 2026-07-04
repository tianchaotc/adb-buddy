/**
 * History store — see spec §2.3.
 *
 * Wraps the `query_history` / `clear_history` / `export_history` IPC calls.
 * Holds the current filter + result list. The History page calls `query()`.
 */
import { create } from 'zustand';
import type { AdbError, HistoryEntry, HistoryFilter } from '@/bindings/types';
import {
  clearHistory,
  exportHistory,
  queryHistory,
} from '@/ipc/client';
import { asAdbError } from '@/lib/errors';

export interface HistoryFilters {
  search: string;
  module: string;
  serial: string;
  limit: number;
}

export interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
  error: AdbError | null;
  filters: HistoryFilters;
  /** Expanded row id (for showing stdout/stderr inline). */
  expandedId: number | null;
  setFilters: (f: Partial<HistoryFilters>) => void;
  query: () => Promise<void>;
  clear: (before?: string | null) => Promise<number>;
  exportEntries: () => Promise<string>;
  setExpanded: (id: number | null) => void;
}

function toHistoryFilter(f: HistoryFilters): HistoryFilter {
  return {
    search: f.search || null,
    module: f.module || null,
    serial: f.serial || null,
    limit: f.limit,
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,
  filters: { search: '', module: '', serial: '', limit: 100 },
  expandedId: null,

  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),

  query: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await queryHistory(toHistoryFilter(get().filters));
      set({ entries, loading: false });
    } catch (e) {
      set({ error: asAdbError(e), loading: false, entries: [] });
    }
  },

  clear: async (before) => {
    try {
      const count = await clearHistory(before ?? null);
      await get().query();
      return count;
    } catch (e) {
      set({ error: asAdbError(e) });
      return 0;
    }
  },

  exportEntries: async () => {
    return exportHistory(toHistoryFilter(get().filters), 'json');
  },

  setExpanded: (id) =>
    set((s) => ({ expandedId: s.expandedId === id ? null : id })),
}));
