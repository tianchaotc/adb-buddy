/**
 * Maps an `AdbError` (the Rust discriminated union) to a human-readable
 * title + suggested fix. See spec §2.4.
 */
import type { AdbError } from '@/bindings/types';

export interface ExplainedError {
  /** Short, user-facing summary of what went wrong. */
  title: string;
  /** Actionable suggestion for how to fix it. */
  fix: string;
  /** The raw command that failed, if applicable (for the console panel). */
  rawCmd?: string;
  /** Extra detail to display under the fix (e.g. searched paths, stderr tail). */
  detail?: string;
}

/**
 * Explain an `AdbError`. Covers all 14 variants in `src-tauri/src/error.rs`.
 */
export function explainError(e: AdbError): ExplainedError {
  switch (e.kind) {
    case 'AdbNotFound':
      return {
        title: 'adb not found',
        fix: 'Install platform-tools or set a custom adb path in Settings.',
        detail:
          e.detail.searched_paths.length > 0
            ? `Searched: ${e.detail.searched_paths.join(', ')}`
            : undefined,
      };
    case 'AdbVersionCheckFailed':
      return {
        title: 'adb version check failed',
        fix: 'The adb binary exists but did not report a version. Try a different platform-tools install.',
        detail: e.detail.stderr || undefined,
      };
    case 'NoDevices':
      return {
        title: 'No devices attached',
        fix: 'Connect a device over USB (with USB debugging on) or start an emulator, then refresh.',
      };
    case 'MultipleDevices':
      return {
        title: 'Multiple devices connected',
        fix: 'Select a specific device from the dropdown in the top bar.',
        detail: e.detail.serials.join(', '),
      };
    case 'DeviceOffline':
      return {
        title: `Device ${e.detail.serial} is offline`,
        fix: 'Replug the USB cable or run "adb reconnect" from the device dropdown.',
      };
    case 'DeviceUnauthorized':
      return {
        title: `Device ${e.detail.serial} is unauthorized`,
        fix: 'Replug the USB cable and accept the RSA debugging prompt on the device.',
      };
    case 'CommandFailed':
      return {
        title: 'Command failed',
        fix: 'Check the command output below for details. Common causes: the device is offline, the package name is wrong, or the operation requires root.',
        rawCmd: e.detail.cmd,
        detail:
          `exit code ${e.detail.exit_code}` +
          (e.detail.stderr ? `\n${e.detail.stderr}` : ''),
      };
    case 'CommandTimeout':
      return {
        title: 'Command timed out',
        fix: 'The command took too long. Try again, or stop other long-running processes (e.g. a streaming logcat).',
        rawCmd: e.detail.cmd,
        detail: `timeout after ${e.detail.timeout_ms}ms`,
      };
    case 'ParseFailed':
      return {
        title: 'Could not parse adb output',
        fix: 'The adb output format was unexpected. This is usually a bug — please report it with the raw output below.',
        rawCmd: e.detail.cmd,
        detail: `${e.detail.reason}\n${truncate(e.detail.raw, 500)}`,
      };
    case 'IoError':
      return {
        title: 'I/O error',
        fix: 'A filesystem operation failed. Check disk space and permissions for the path involved.',
        detail: e.detail.message,
      };
    case 'InstallFailed':
      return {
        title: `Install failed: ${e.detail.code}`,
        fix: explanationForCode(e.detail.code, e.detail.explanation),
        detail: e.detail.explanation,
      };
    case 'InvalidInput':
      return {
        title: `Invalid input: ${e.detail.field}`,
        fix: e.detail.reason,
      };
    case 'ProcessAlreadyRunning':
      return {
        title: 'Process already running',
        fix: 'A process for this session is already running. Stop it first, or wait for it to finish.',
        detail: `session: ${e.detail.session_id}`,
      };
    case 'HistoryDbError':
      return {
        title: 'History database error',
        fix: 'The command history database reported an error. Try clearing history from the History page.',
        detail: e.detail.message,
      };
    default: {
      // Exhaustiveness guard — if a new variant is added without a case,
      // TS will flag this block as missing the return.
      const _exhaustive: never = e;
      void _exhaustive;
      return {
        title: 'Unknown error',
        fix: 'An unexpected error occurred.',
      };
    }
  }
}

/** Human-readable explanations for common `INSTALL_FAILED_*` codes. */
function explanationForCode(code: string, fallback: string): string {
  switch (code) {
    case 'INSTALL_FAILED_VERSION_DOWNGRADE':
      return 'App already installed with a higher version. Enable "Allow downgrade" or uninstall first.';
    case 'INSTALL_FAILED_UPDATE_INCOMPATIBLE':
      return 'Existing app has a different signature. Uninstall it first.';
    case 'INSTALL_FAILED_NO_MATCHING_ABIS':
      return "APK doesn't contain native libs for the device's CPU ABI. Use a universal APK.";
    case 'INSTALL_FAILED_INSUFFICIENT_STORAGE':
      return 'Device is out of storage. Free space or clear app cache.';
    case 'INSTALL_PARSE_FAILED_NO_CERTIFICATES':
      return 'APK is not signed. Re-sign it before installing.';
    default:
      return fallback || 'See the install output for details.';
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Normalize an unknown thrown value into an `AdbError` if it looks like one,
 * otherwise return null. Useful for catch blocks.
 */
export function asAdbError(e: unknown): AdbError | null {
  if (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { kind?: unknown }).kind === 'string' &&
    'detail' in (e as object)
  ) {
    return e as AdbError;
  }
  return null;
}

/**
 * Render any thrown value as a readable string (for console / logs).
 */
export function describeThrown(e: unknown): string {
  const adb = asAdbError(e);
  if (adb) {
    const explained = explainError(adb);
    return `${explained.title}${explained.detail ? ` — ${explained.detail}` : ''}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
