/**
 * Tests for the devices store with mocked IPC.
 * See spec §2.6.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdbError, Device } from '@/bindings/types';

// Mock the IPC client before importing the store.
vi.mock('@/ipc/client', () => ({
  listDevices: vi.fn(),
  isMockMode: () => false,
  isTauri: () => false,
}));

// Mock the lib/errors asAdbError so the store can normalize thrown values.
vi.mock('@/lib/errors', () => ({
  asAdbError: (e: unknown) =>
    e && typeof e === 'object' && 'kind' in e
      ? (e as import('@/bindings/types').AdbError)
      : null,
}));

import { useDevicesStore } from './devices';
import { listDevices } from '@/ipc/client';

const mockDevices: Device[] = [
  { serial: 'DEV1', state: 'device', model: 'Pixel_7', transport_id: '1', usb: '1-3', product: 'p', device: 'p' },
  { serial: 'DEV2', state: 'offline', model: 'Emu', transport_id: '2', usb: '2-1', product: 'e', device: 'e' },
  { serial: 'DEV3', state: 'unauthorized', model: 'Galaxy', transport_id: '3', usb: '3-1', product: 'g', device: 'g' },
];

beforeEach(() => {
  useDevicesStore.setState({
    devices: [],
    selectedSerial: null,
    loading: false,
    error: null,
    multiSelectMode: false,
    selectedSerials: new Set(),
  });
  vi.mocked(listDevices).mockReset();
});

describe('devices store — refresh', () => {
  it('loads devices and auto-selects the first ready device', async () => {
    vi.mocked(listDevices).mockResolvedValue(mockDevices);
    await useDevicesStore.getState().refresh();
    const state = useDevicesStore.getState();
    expect(state.devices).toEqual(mockDevices);
    expect(state.selectedSerial).toBe('DEV1');
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('falls back to the first device when none are ready', async () => {
    const allOffline: Device[] = [
      { serial: 'OFF1', state: 'offline', transport_id: '1' },
    ];
    vi.mocked(listDevices).mockResolvedValue(allOffline);
    await useDevicesStore.getState().refresh();
    expect(useDevicesStore.getState().selectedSerial).toBe('OFF1');
  });

  it('sets selectedSerial to null when no devices are attached', async () => {
    vi.mocked(listDevices).mockResolvedValue([]);
    await useDevicesStore.getState().refresh();
    expect(useDevicesStore.getState().selectedSerial).toBeNull();
  });

  it('stores the AdbError on failure and clears the device list', async () => {
    const err: AdbError = { kind: 'NoDevices', detail: null };
    vi.mocked(listDevices).mockRejectedValue(err);
    await useDevicesStore.getState().refresh();
    const state = useDevicesStore.getState();
    expect(state.error).toEqual(err);
    expect(state.devices).toEqual([]);
    expect(state.selectedSerial).toBeNull();
  });
});

describe('devices store — select', () => {
  it('selects a device that exists in the list', async () => {
    vi.mocked(listDevices).mockResolvedValue(mockDevices);
    await useDevicesStore.getState().refresh();
    useDevicesStore.getState().select('DEV2');
    expect(useDevicesStore.getState().selectedSerial).toBe('DEV2');
  });

  it('ignores selection of a device not in the list', async () => {
    vi.mocked(listDevices).mockResolvedValue(mockDevices);
    await useDevicesStore.getState().refresh();
    useDevicesStore.getState().select('UNKNOWN_SERIAL');
    expect(useDevicesStore.getState().selectedSerial).toBe('DEV1');
  });

  it('clears selection when passed null', async () => {
    vi.mocked(listDevices).mockResolvedValue(mockDevices);
    await useDevicesStore.getState().refresh();
    useDevicesStore.getState().select(null);
    expect(useDevicesStore.getState().selectedSerial).toBeNull();
  });
});

describe('devices store — multi-select', () => {
  it('toggles serials in the multi-select set', () => {
    useDevicesStore.getState().toggleSelected('A');
    expect(useDevicesStore.getState().selectedSerials.has('A')).toBe(true);
    useDevicesStore.getState().toggleSelected('A');
    expect(useDevicesStore.getState().selectedSerials.has('A')).toBe(false);
  });

  it('clears the multi-select set when disabling multi-select mode', () => {
    useDevicesStore.getState().toggleSelected('A');
    useDevicesStore.getState().setMultiSelect(true);
    expect(useDevicesStore.getState().multiSelectMode).toBe(true);
    useDevicesStore.getState().toggleSelected('B');
    expect(useDevicesStore.getState().selectedSerials.size).toBe(2);
    useDevicesStore.getState().setMultiSelect(false);
    expect(useDevicesStore.getState().multiSelectMode).toBe(false);
    expect(useDevicesStore.getState().selectedSerials.size).toBe(0);
  });
});
