/**
 * Devices store — see spec §2.3.
 *
 * Holds the device list, the currently selected serial, and multi-select state.
 * `refresh()` calls the IPC client and updates the store. Selecting a device
 * that doesn't exist in the list is ignored.
 */
import { create } from 'zustand';
import type { AdbError, Device } from '@/bindings/types';
import { listDevices } from '@/ipc/client';
import { asAdbError } from '@/lib/errors';

export interface DevicesState {
  devices: Device[];
  selectedSerial: string | null;
  loading: boolean;
  error: AdbError | null;
  multiSelectMode: boolean;
  selectedSerials: Set<string>;
  /** Fetch the device list. Auto-selects the first ready device if none selected. */
  refresh: () => Promise<void>;
  /** Select a device by serial. No-op if the serial isn't in the list. */
  select: (serial: string | null) => void;
  /** Toggle multi-select mode. When enabled, the dropdown shows checkboxes. */
  setMultiSelect: (enabled: boolean) => void;
  /** Toggle a serial in the multi-select set. */
  toggleSelected: (serial: string) => void;
  /** Clear the multi-select set. */
  clearSelected: () => void;
  /** Convenience: the currently selected `Device` (or null). */
  selected: () => Device | null;
}

export const useDevicesStore = create<DevicesState>((set, get) => ({
  devices: [],
  selectedSerial: null,
  loading: false,
  error: null,
  multiSelectMode: false,
  selectedSerials: new Set(),

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const devices = await listDevices();
      const current = get().selectedSerial;
      const stillPresent = current
        ? devices.some((d) => d.serial === current)
        : false;
      const ready = devices.find((d) => d.state === 'device');
      const nextSelected = stillPresent
        ? current
        : ready?.serial ?? devices[0]?.serial ?? null;
      set({ devices, loading: false, selectedSerial: nextSelected });
    } catch (e) {
      const adb = asAdbError(e);
      set({
        loading: false,
        error: adb,
        devices: [],
        selectedSerial: null,
      });
    }
  },

  select: (serial) => {
    if (serial === null) {
      set({ selectedSerial: null });
      return;
    }
    const exists = get().devices.some((d) => d.serial === serial);
    if (exists) set({ selectedSerial: serial });
  },

  setMultiSelect: (enabled) => {
    set({ multiSelectMode: enabled });
    if (!enabled) set({ selectedSerials: new Set() });
  },

  toggleSelected: (serial) => {
    const next = new Set(get().selectedSerials);
    if (next.has(serial)) next.delete(serial);
    else next.add(serial);
    set({ selectedSerials: next });
  },

  clearSelected: () => set({ selectedSerials: new Set() }),

  selected: () => {
    const { devices, selectedSerial } = get();
    if (!selectedSerial) return null;
    return devices.find((d) => d.serial === selectedSerial) ?? null;
  },
}));
