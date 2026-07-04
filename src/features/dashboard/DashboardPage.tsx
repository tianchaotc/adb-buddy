/**
 * Dashboard page — device overview cards.
 *
 * Calls `getDeviceOverview` for the selected serial and shows name, Android
 * version, SDK, build fingerprint, security patch, battery, resolution,
 * density, CPU ABI, root, SELinux. Shows an empty state when no device is
 * selected.
 */
import { useEffect, useState } from 'react';
import {
  Badge,
  Card,
  CardHeader,
  Body1,
  Subtitle1,
  Title2,
  makeStyles,
  ProgressBar,
} from '@fluentui/react-components';
import {
  PhoneRegular,
  Battery0Regular,
  TvRegular,
  ShieldRegular,
  DeveloperBoardRegular,
} from '@fluentui/react-icons';
import type { AdbError, DeviceOverview } from '@/bindings/types';
import { getDeviceOverview } from '@/ipc/client';
import { useDevicesStore } from '@/store/devices';
import { useConsoleStore } from '@/store/console';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatTimestamp } from '@/lib/format';
import { asAdbError } from '@/lib/errors';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '12px',
  },
  card: {
    padding: '16px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '4px 0',
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
  },
  label: {
    opacity: 0.6,
  },
  value: {
    textAlign: 'right',
    wordBreak: 'break-all',
  },
  header: {
    marginBottom: '16px',
  },
});

function Field({ label, value }: { label: string; value?: string | number | null }) {
  const styles = useStyles();
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{String(value)}</span>
    </div>
  );
}

export function DashboardPage() {
  const styles = useStyles();
  const selectedSerial = useDevicesStore((s) => s.selectedSerial);
  const devices = useDevicesStore((s) => s.devices);
  const appendConsole = useConsoleStore((s) => s.append);
  const [overview, setOverview] = useState<DeviceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdbError | null>(null);

  useEffect(() => {
    if (!selectedSerial) {
      setOverview(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDeviceOverview(selectedSerial)
      .then((o) => {
        if (cancelled) return;
        setOverview(o);
        appendConsole({
          command: 'adb shell getprop / dumpsys battery / wm size / getenforce',
          stdout: '',
          stderr: '',
          exitCode: 0,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(asAdbError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSerial, appendConsole]);

  if (!selectedSerial) {
    return (
      <EmptyState
        icon={<PhoneRegular />}
        title="No device selected"
        description="Connect a device over USB (with USB debugging on) or start an emulator, then pick it from the dropdown in the top bar."
      />
    );
  }
  if (loading && !overview) return <LoadingSpinner label="Loading device overview…" />;
  if (error && !overview) return <ErrorBanner error={error} />;
  if (!overview) return <EmptyState title="No overview available" />;

  const device = devices.find((d) => d.serial === selectedSerial);
  const battery = overview.battery;

  return (
    <div>
      <div className={styles.header}>
        <Title2 as="h1">
          {overview.model ?? device?.model ?? selectedSerial}
        </Title2>
        <Body1 style={{ opacity: 0.7 }}>{selectedSerial}</Body1>
      </div>
      {error ? <ErrorBanner error={error} /> : null}
      <div className={styles.grid}>
        <Card className={styles.card}>
          <CardHeader
            header={<Subtitle1>Device</Subtitle1>}
            image={<PhoneRegular />}
          />
          <Field label="Brand" value={overview.brand} />
          <Field label="Manufacturer" value={overview.manufacturer} />
          <Field label="Model" value={overview.model} />
          <Field label="Serial" value={overview.serial} />
          <Field label="Android version" value={overview.android_version} />
          <Field label="SDK level" value={overview.sdk_level} />
          <Field label="Build ID" value={overview.build_id} />
          <Field label="Build fingerprint" value={overview.build_fingerprint} />
          <Field label="Security patch" value={overview.security_patch} />
        </Card>

        <Card className={styles.card}>
          <CardHeader
            header={<Subtitle1>Display</Subtitle1>}
            image={<TvRegular />}
          />
          <Field label="Resolution" value={overview.screen_resolution} />
          <Field label="Density (dpi)" value={overview.screen_density} />
          <Field label="CPU ABI" value={overview.abi} />
        </Card>

        <Card className={styles.card}>
          <CardHeader
            header={<Subtitle1>Battery</Subtitle1>}
            image={<Battery0Regular />}
          />
          {battery ? (
            <>
              <Field label="Level" value={`${battery.level ?? '?'}%`} />
              <ProgressBar
                value={(battery.level ?? 0) / 100}
                style={{ margin: '4px 0 8px' }}
              />
              <Field label="Powered" value={battery.powered ? 'yes' : 'no'} />
              <Field label="AC powered" value={battery.ac_powered ? 'yes' : 'no'} />
              <Field label="USB powered" value={battery.usb_powered ? 'yes' : 'no'} />
              <Field label="Temperature" value={battery.temperature ? `${(battery.temperature / 10).toFixed(1)} °C` : null} />
              <Field label="Voltage" value={battery.voltage ? `${battery.voltage} mV` : null} />
              <Field label="Technology" value={battery.technology} />
            </>
          ) : (
            <Body1 style={{ opacity: 0.6 }}>No battery info available.</Body1>
          )}
        </Card>

        <Card className={styles.card}>
          <CardHeader
            header={<Subtitle1>Security</Subtitle1>}
            image={<ShieldRegular />}
          />
          <div className={styles.row}>
            <span className={styles.label}>SELinux</span>
            <span className={styles.value}>
              {overview.selinux ? (
                <Badge appearance="filled" color={overview.selinux.toLowerCase().includes('enforc') ? 'success' : 'warning'}>
                  {overview.selinux}
                </Badge>
              ) : 'unknown'}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Root</span>
            <span className={styles.value}>
              <Badge appearance="filled" color={overview.root ? 'danger' : 'success'}>
                {overview.root ? 'yes' : 'no'}
              </Badge>
            </span>
          </div>
        </Card>

        <Card className={styles.card}>
          <CardHeader
            header={<Subtitle1>Build</Subtitle1>}
            image={<DeveloperBoardRegular />}
          />
          <Field label="Build ID" value={overview.build_id} />
          <Field label="Fingerprint" value={overview.build_fingerprint} />
          <Field label="Last checked" value={formatTimestamp(new Date().toISOString())} />
        </Card>
      </div>
    </div>
  );
}
