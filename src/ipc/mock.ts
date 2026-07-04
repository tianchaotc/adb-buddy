/**
 * Mock IPC layer for standalone Vite dev.
 *
 * When `window.__TAURI_INTERNALS__` is undefined (running `npm run dev` without
 * the Tauri runtime), `client.ts` routes every invoke to `mockInvoke` here,
 * which returns canned data. This lets the full UI be exercised on macOS
 * without a real device or the Rust backend.
 *
 * Mock events (`logcat://line`, `process://exited`) are emitted on a timer
 * from the logcat store / LogsPage when `isMockMode()` is true.
 */
import type {
  AdbConfig,
  CmdResult,
  Device,
  DeviceOverview,
  FileEntry,
  HistoryEntry,
  Package,
  PackageDetails,
  ScreenshotResult,
  ShellPreset,
} from '@/bindings/types';

/** True when there is no Tauri runtime — i.e. standalone Vite dev. */
export function isMockMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ===
      undefined
  );
}

const mockDevices: Device[] = [
  {
    serial: 'PIXEL7A1B2C3',
    state: 'device',
    transport_id: '1',
    usb: '1-3',
    model: 'Pixel_7',
    product: 'panther',
    device: 'panther',
  },
  {
    serial: 'emulator-5554',
    state: 'offline',
    transport_id: '2',
    model: 'sdk_gphone64_x86_64',
    product: 'sdk_gphone64_x86_64',
    device: 'emulator64',
  },
  {
    serial: 'R3CN70QKX7',
    state: 'unauthorized',
    transport_id: '3',
    usb: '2-1',
    model: 'SM-S918B',
    product: 'dm3q',
    device: 'qcom',
  },
];

const mockPackages: Package[] = [
  { name: 'com.android.chrome', is_system: false, is_third_party: true, is_disabled: false },
  { name: 'com.google.android.gms', is_system: true, is_third_party: false, is_disabled: false },
  { name: 'com.android.settings', is_system: true, is_third_party: false, is_disabled: false },
  { name: 'com.example.myapp', is_system: false, is_third_party: true, is_disabled: false },
  { name: 'com.spotify.music', is_system: false, is_third_party: true, is_disabled: false },
  { name: 'com.whatsapp', is_system: false, is_third_party: true, is_disabled: false },
  { name: 'com.android.phone', is_system: true, is_third_party: false, is_disabled: false },
  { name: 'com.android.systemui', is_system: true, is_third_party: false, is_disabled: false },
  { name: 'com.tencent.mm', is_system: false, is_third_party: true, is_disabled: false },
  { name: 'com.netflix.mediaclient', is_system: false, is_third_party: true, is_disabled: true },
  { name: 'com.android.contacts', is_system: true, is_third_party: false, is_disabled: false },
  { name: 'com.android.camera2', is_system: true, is_third_party: false, is_disabled: false },
  { name: 'com.discord', is_system: false, is_third_party: true, is_disabled: false },
  { name: 'com.android.vending', is_system: true, is_third_party: false, is_disabled: false },
  { name: 'org.mozilla.firefox', is_system: false, is_third_party: true, is_disabled: false },
];

const mockOverview: DeviceOverview = {
  serial: 'PIXEL7A1B2C3',
  model: 'Pixel 7',
  brand: 'google',
  manufacturer: 'Google',
  android_version: '14',
  sdk_level: 34,
  build_id: 'UQ1A.240205.004',
  build_fingerprint: 'google/panther/panther:14/UQ1A.240205.004/12345678:user/release-keys',
  security_patch: '2024-02-05',
  abi: 'arm64-v8a',
  screen_resolution: '1080x2400',
  screen_density: 420,
  battery: {
    level: 76,
    status: 3,
    powered: false,
    ac_powered: false,
    usb_powered: false,
    temperature: 285,
    voltage: 4123,
    technology: 'Li-ion',
  },
  selinux: 'Enforcing',
  root: false,
};

const mockAdbConfig: AdbConfig = {
  path: '/usr/local/bin/adb',
  version_info: {
    version: '1.0.41',
    version_string: 'Android Debug Bridge version 1.0.41\nVersion 34.0.5-10900861',
    path: '/usr/local/bin/adb',
  },
  custom: false,
};

const mockShellPresets: ShellPreset[] = [
  { label: 'Properties', command: 'getprop', description: 'Print all system properties' },
  { label: 'Activity manager', command: 'dumpsys activity', description: 'Dump activity manager state' },
  { label: 'Window manager', command: 'dumpsys window', description: 'Dump window manager state' },
  { label: 'Package info', command: 'dumpsys package', description: 'Dump package manager state' },
  { label: 'Battery', command: 'dumpsys battery', description: 'Dump battery state' },
  { label: 'Device idle', command: 'dumpsys deviceidle', description: 'Dump Doze / idle state' },
  { label: 'Global settings', command: 'settings list global', description: 'List global settings' },
  { label: 'Secure settings', command: 'settings list secure', description: 'List secure settings' },
  { label: 'System settings', command: 'settings list system', description: 'List system settings' },
];

const mockHistory: HistoryEntry[] = [
  {
    id: 1,
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    device_serial: 'PIXEL7A1B2C3',
    feature_module: 'devices',
    command: 'adb devices -l',
    exit_code: 0,
    duration_ms: 142,
    stdout: 'List of devices attached\nPIXEL7A1B2C3  device  usb:1-3  model:Pixel_7',
    stderr: '',
  },
  {
    id: 2,
    timestamp: new Date(Date.now() - 120_000).toISOString(),
    device_serial: 'PIXEL7A1B2C3',
    feature_module: 'packages',
    command: 'adb shell pm list packages -3',
    exit_code: 0,
    duration_ms: 318,
    stdout: 'package:com.example.myapp\npackage:com.spotify.music',
    stderr: '',
  },
  {
    id: 3,
    timestamp: new Date(Date.now() - 180_000).toISOString(),
    device_serial: 'PIXEL7A1B2C3',
    feature_module: 'shell',
    command: 'adb shell getprop',
    exit_code: 0,
    duration_ms: 87,
    stdout: '[ro.product.model]: [Pixel 7]\n[ro.build.version.release]: [14]',
    stderr: '',
  },
  {
    id: 4,
    timestamp: new Date(Date.now() - 240_000).toISOString(),
    device_serial: 'PIXEL7A1B2C3',
    feature_module: 'install',
    command: 'adb install -r -g app-debug.apk',
    exit_code: 0,
    duration_ms: 4321,
    stdout: 'Success',
    stderr: 'Performing Streamed Install',
  },
  {
    id: 5,
    timestamp: new Date(Date.now() - 300_000).toISOString(),
    device_serial: 'PIXEL7A1B2C3',
    feature_module: 'screenshot',
    command: 'adb shell screencap -p /sdcard/screenshot.png',
    exit_code: 0,
    duration_ms: 205,
    stdout: '',
    stderr: '',
  },
];

function mockCmdResult(command: string, stdout = '', stderr = ''): CmdResult {
  return {
    command,
    stdout,
    stderr,
    exit_code: 0,
    duration_ms: Math.floor(Math.random() * 400) + 50,
  };
}

function mockScreenshotResult(): ScreenshotResult {
  const ts = new Date().toISOString();
  return {
    local_path: '/downloads/adb-buddy-screenshot.png',
    remote_path: `/sdcard/adb-buddy-screenshot-${ts.replace(/[:.]/g, '')}.png`,
    timestamp: ts,
  };
}

/** In-memory favorites for the shell page. */
let mockFavorites: string[] = ['getprop', 'dumpsys battery'];

/**
 * The mock invoke dispatcher. Returns canned data for each command. Unknown
 * commands reject with a minimal error so failures are visible in dev.
 */
export async function mockInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  await delay(80 + Math.random() * 120);
  switch (cmd) {
    case 'list_devices':
      return mockDevices as unknown as T;
    case 'kill_server':
    case 'start_server':
    case 'reconnect_device':
    case 'reconnect_offline':
      return undefined as unknown as T;
    case 'get_device_overview':
      return mockOverview as unknown as T;
    case 'list_packages': {
      const filter = (args?.filter as string) ?? 'all';
      let pkgs = mockPackages;
      if (filter === 'thirdparty') pkgs = mockPackages.filter((p) => p.is_third_party);
      else if (filter === 'system') pkgs = mockPackages.filter((p) => p.is_system);
      else if (filter === 'disabled') pkgs = mockPackages.filter((p) => p.is_disabled);
      return pkgs as unknown as T;
    }
    case 'get_package_details': {
      const pkg = (args?.package as string) ?? 'com.example.myapp';
      const details: PackageDetails = {
        name: pkg,
        version_name: '1.2.3',
        version_code: 123,
        apk_path: `/data/app/${pkg}-1/base.apk`,
        uid: 10045,
        target_sdk: 34,
        min_sdk: 24,
        first_install_time: '2024-01-15T10:30:00Z',
        last_update_time: '2024-06-01T14:00:00Z',
        is_system: pkg.startsWith('com.android.'),
        is_enabled: true,
      };
      return details as unknown as T;
    }
    case 'uninstall_package':
    case 'clear_package_data':
    case 'force_stop_package':
    case 'disable_package':
    case 'enable_package':
    case 'launch_package':
    case 'open_app_settings':
      return undefined as unknown as T;
    case 'pull_apk':
      return `/downloads/${(args?.package as string) ?? 'app'}.apk` as unknown as T;
    case 'install_apk':
      return { success: true, message: 'Success', code: 'Success' } as unknown as T;
    case 'cancel_install':
      return undefined as unknown as T;
    case 'list_files': {
      const entries: FileEntry[] = [
        { name: 'DCIM', size: 4096, modified: '', is_dir: true, perms: 'drwxrwx--x' },
        { name: 'Download', size: 4096, modified: '', is_dir: true, perms: 'drwxrwx--x' },
        { name: 'Pictures', size: 4096, modified: '', is_dir: true, perms: 'drwxrwx--x' },
        { name: 'Android', size: 4096, modified: '', is_dir: true, perms: 'drwxrwx--x' },
        { name: 'README.txt', size: 1234, modified: '', is_dir: false, perms: '-rw-rw-r--' },
        { name: 'config.json', size: 567, modified: '', is_dir: false, perms: '-rw-rw-r--' },
      ];
      return entries as unknown as T;
    }
    case 'pull_file':
      return ((args?.local as string | null) ?? `/downloads/${(args?.remote as string)?.split('/').pop() ?? 'pulled-file'}`) as unknown as T;
    case 'push_file':
    case 'delete_file':
      return undefined as unknown as T;
    case 'start_logcat':
      return `mock-session-${Date.now()}` as unknown as T;
    case 'stop_logcat':
    case 'clear_logcat_buffer':
      return undefined as unknown as T;
    case 'run_shell':
      return mockCmdResult(
        `adb shell ${(args?.command as string) ?? ''}`,
        `# mock output for: ${(args?.command as string) ?? ''}\n`,
      ) as unknown as T;
    case 'list_shell_presets':
      return mockShellPresets as unknown as T;
    case 'get_shell_favorites':
      return mockFavorites as unknown as T;
    case 'add_shell_favorite':
      if (!mockFavorites.includes(args?.cmd as string)) {
        mockFavorites.push(args?.cmd as string);
      }
      return undefined as unknown as T;
    case 'remove_shell_favorite':
      mockFavorites = mockFavorites.filter((f) => f !== args?.cmd);
      return undefined as unknown as T;
    case 'take_screenshot':
      return mockScreenshotResult() as unknown as T;
    case 'get_adb_config':
      return mockAdbConfig as unknown as T;
    case 'set_adb_path':
      return mockAdbConfig as unknown as T;
    case 'validate_adb':
      return mockAdbConfig.version_info as unknown as T;
    case 'query_history':
      return mockHistory as unknown as T;
    case 'rerun_history':
      return (mockHistory.find((h) => h.id === args?.entry_id) ?? mockHistory[0]) as unknown as T;
    case 'clear_history':
      return 5 as unknown as T;
    case 'export_history':
      return JSON.stringify(mockHistory, null, 2) as unknown as T;
    default:
      return undefined as unknown as T;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sample logcat lines cycled by the mock emitter in the logcat store. */
export const MOCK_LOGCAT_LINES: string[] = [
  '07-04 10:00:00.123  1234 5678 I ActivityManager: Start proc com.example.myapp for activity com.example.myapp/.MainActivity',
  '07-04 10:00:00.234  1234 5678 D ExampleTag: onCreate entered',
  '07-04 10:00:00.345  1234 5678 D ExampleTag: onResume entered',
  '07-04 10:00:00.456  1234 5678 I WindowManager: Relayout Window{abc com.example.myapp/com.example.myapp.MainActivity}',
  '07-04 10:00:00.567  1234 5678 W ExampleTag: Slow operation took 250ms',
  '07-04 10:00:00.678  1234 5678 E AndroidRuntime: FATAL EXCEPTION: main',
  '07-04 10:00:00.789  1234 5678 E AndroidRuntime: Process: com.example.myapp, PID: 1234',
  '07-04 10:00:00.890  1234 5678 E AndroidRuntime: java.lang.NullPointerException: attempt to read field on null',
  '07-04 10:00:00.901  1234 5678 E AndroidRuntime:   at com.example.myapp.MainActivity.onResume(MainActivity.java:42)',
  '07-04 10:00:01.012  1234 5678 I ActivityManager: Process com.example.myapp (pid 1234) has died',
  '07-04 10:00:01.123  1234 5678 W ActivityManager: ANR in com.example.myapp (com.example.myapp)',
  '07-04 10:00:01.234  1234 5678 W ActivityManager:   CPU: 95% user 4% kernel',
];
