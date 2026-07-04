/**
 * Tests for `explainError` — one per AdbError variant (14 total).
 * See spec §2.6.
 */
import { describe, expect, it } from 'vitest';
import { explainError, asAdbError, describeThrown } from './errors';
import type { AdbError } from '@/bindings/types';

function expectVariant(e: AdbError, kind: AdbError['kind']) {
  const explained = explainError(e);
  expect(explained.title).toBeTruthy();
  expect(explained.fix).toBeTruthy();
  expect(e.kind).toBe(kind);
}

describe('explainError — all 14 AdbError variants', () => {
  it('AdbNotFound', () => {
    const e: AdbError = { kind: 'AdbNotFound', detail: { searched_paths: ['/usr/bin', '/usr/local/bin'] } };
    expectVariant(e, 'AdbNotFound');
    const { title, fix, detail } = explainError(e);
    expect(title.toLowerCase()).toContain('not found');
    expect(fix.toLowerCase()).toContain('settings');
    expect(detail).toContain('/usr/bin');
  });

  it('AdbVersionCheckFailed', () => {
    const e: AdbError = { kind: 'AdbVersionCheckFailed', detail: { stderr: 'boom' } };
    expectVariant(e, 'AdbVersionCheckFailed');
    expect(explainError(e).detail).toBe('boom');
  });

  it('NoDevices', () => {
    const e: AdbError = { kind: 'NoDevices', detail: null };
    expectVariant(e, 'NoDevices');
    expect(explainError(e).title.toLowerCase()).toContain('no devices');
  });

  it('MultipleDevices', () => {
    const e: AdbError = { kind: 'MultipleDevices', detail: { serials: ['a', 'b'] } };
    expectVariant(e, 'MultipleDevices');
    expect(explainError(e).detail).toBe('a, b');
  });

  it('DeviceOffline', () => {
    const e: AdbError = { kind: 'DeviceOffline', detail: { serial: 'PIXEL7' } };
    expectVariant(e, 'DeviceOffline');
    expect(explainError(e).title).toContain('PIXEL7');
  });

  it('DeviceUnauthorized', () => {
    const e: AdbError = { kind: 'DeviceUnauthorized', detail: { serial: 'PIXEL7' } };
    expectVariant(e, 'DeviceUnauthorized');
    expect(explainError(e).fix.toLowerCase()).toContain('rsa');
  });

  it('CommandFailed', () => {
    const e: AdbError = {
      kind: 'CommandFailed',
      detail: { cmd: 'adb devices', exit_code: 1, stderr: 'error: closed' },
    };
    expectVariant(e, 'CommandFailed');
    const { rawCmd, detail } = explainError(e);
    expect(rawCmd).toBe('adb devices');
    expect(detail).toContain('exit code 1');
  });

  it('CommandTimeout', () => {
    const e: AdbError = { kind: 'CommandTimeout', detail: { cmd: 'adb logcat', timeout_ms: 5000 } };
    expectVariant(e, 'CommandTimeout');
    expect(explainError(e).rawCmd).toBe('adb logcat');
  });

  it('ParseFailed', () => {
    const e: AdbError = {
      kind: 'ParseFailed',
      detail: { cmd: 'adb devices', raw: 'garbage output', reason: 'no header' },
    };
    expectVariant(e, 'ParseFailed');
    expect(explainError(e).detail).toContain('no header');
  });

  it('IoError', () => {
    const e: AdbError = { kind: 'IoError', detail: { message: 'permission denied' } };
    expectVariant(e, 'IoError');
    expect(explainError(e).detail).toBe('permission denied');
  });

  it('InstallFailed', () => {
    const e: AdbError = {
      kind: 'InstallFailed',
      detail: { code: 'INSTALL_FAILED_VERSION_DOWNGRADE', explanation: 'higher version' },
    };
    expectVariant(e, 'InstallFailed');
    const { fix } = explainError(e);
    expect(fix.toLowerCase()).toContain('downgrade');
  });

  it('InvalidInput', () => {
    const e: AdbError = { kind: 'InvalidInput', detail: { field: 'serial', reason: 'empty' } };
    expectVariant(e, 'InvalidInput');
    expect(explainError(e).title).toContain('serial');
  });

  it('ProcessAlreadyRunning', () => {
    const e: AdbError = { kind: 'ProcessAlreadyRunning', detail: { session_id: 's1' } };
    expectVariant(e, 'ProcessAlreadyRunning');
    expect(explainError(e).detail).toContain('s1');
  });

  it('HistoryDbError', () => {
    const e: AdbError = { kind: 'HistoryDbError', detail: { message: 'locked' } };
    expectVariant(e, 'HistoryDbError');
    expect(explainError(e).detail).toBe('locked');
  });
});

describe('asAdbError', () => {
  it('returns the error when it has kind + detail', () => {
    const e = { kind: 'NoDevices', detail: null };
    expect(asAdbError(e)).toEqual(e);
  });

  it('returns null for non-AdbError values', () => {
    expect(asAdbError(null)).toBeNull();
    expect(asAdbError('string')).toBeNull();
    expect(asAdbError(new Error('boom'))).toBeNull();
    expect(asAdbError({ kind: 'Unknown' })).toBeNull();
  });
});

describe('describeThrown', () => {
  it('describes an AdbError', () => {
    const e: AdbError = { kind: 'NoDevices', detail: null };
    expect(describeThrown(e).toLowerCase()).toContain('no devices');
  });

  it('describes a plain Error', () => {
    expect(describeThrown(new Error('boom'))).toBe('boom');
  });

  it('describes a string', () => {
    expect(describeThrown('oops')).toBe('oops');
  });
});
