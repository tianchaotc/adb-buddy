/**
 * Screenshot page — capture button, preview, capture history (last 5).
 */
import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  Subtitle1,
  Body1,
  Image,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { CameraRegular, SaveRegular } from '@fluentui/react-icons';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { AdbError, ScreenshotResult } from '@/bindings/types';
import { takeScreenshot } from '@/ipc/client';
import { useDevicesStore } from '@/store/devices';
import { useConsoleStore } from '@/store/console';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { CopyButton } from '@/components/shared/CopyButton';
import { formatTimestamp } from '@/lib/format';
import { asAdbError } from '@/lib/errors';
import { isMockMode } from '@/ipc/mock';

const useStyles = makeStyles({
  card: { padding: '16px', maxWidth: '720px' },
  preview: {
    marginTop: '12px',
    background: tokens.colorNeutralBackground3,
    borderRadius: '6px',
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  history: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
  },
});

export function ScreenshotPage() {
  const styles = useStyles();
  const selectedSerial = useDevicesStore((s) => s.selectedSerial);
  const appendConsole = useConsoleStore((s) => s.append);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdbError | null>(null);
  const [last, setLast] = useState<ScreenshotResult | null>(null);
  const [history, setHistory] = useState<ScreenshotResult[]>([]);

  const capture = useCallback(async () => {
    if (!selectedSerial) return;
    setLoading(true);
    setError(null);
    try {
      const result = await takeScreenshot(selectedSerial, null);
      setLast(result);
      setHistory((h) => [result, ...h].slice(0, 5));
      appendConsole({
        command: 'adb shell screencap -p /sdcard/screenshot.png && adb pull',
        stdout: `local: ${result.local_path}`,
        stderr: '',
        exitCode: 0,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      setError(asAdbError(e));
    } finally {
      setLoading(false);
    }
  }, [selectedSerial, appendConsole]);

  if (!selectedSerial) {
    return (
      <EmptyState
        icon={<CameraRegular />}
        title="No device selected"
        description="Select a device from the top bar to capture screenshots."
      />
    );
  }

  return (
    <div>
      <Subtitle1 as="h1" style={{ marginBottom: 16 }}>Screenshot</Subtitle1>
      {error ? <ErrorBanner error={error} /> : null}
      <Card className={styles.card}>
        <CardHeader
          header={<Body1>Capture a screenshot from the selected device.</Body1>}
        />
        <div>
          <Button
            icon={<CameraRegular />}
            appearance="primary"
            onClick={capture}
            disabled={loading}
          >
            Capture
          </Button>
          {last ? (
            <>
              <Button
                icon={<SaveRegular />}
                appearance="subtle"
                onClick={() => void navigator.clipboard.writeText(last.local_path)}
                title="Copy local path"
              >
                Copy path
              </Button>
              <CopyButton text={last.local_path} label="Copy path" />
            </>
          ) : null}
        </div>
        {loading ? <LoadingSpinner label="Capturing…" /> : null}
        {last ? (
          <div className={styles.preview}>
            <Image
              src={isMockMode() ? last.local_path : convertFileSrc(last.local_path)}
              alt="screenshot"
              style={{ maxWidth: '100%', maxHeight: '60vh' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ) : null}
        {last ? (
          <div className={styles.row} style={{ marginTop: 8 }}>
            <span style={{ opacity: 0.6 }}>captured at</span>
            <span>{formatTimestamp(last.timestamp)}</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <code>{last.local_path}</code>
          </div>
        ) : null}
      </Card>

      {history.length > 0 ? (
        <Card className={`${styles.card} ${styles.history}`}>
          <CardHeader header={<Subtitle1>Recent captures</Subtitle1>} />
          {history.map((h) => (
            <div key={h.timestamp} className={styles.row}>
              <span style={{ flex: 1 }}>{formatTimestamp(h.timestamp)}</span>
              <code style={{ opacity: 0.7 }}>{h.local_path}</code>
              <CopyButton text={h.local_path} label="" />
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
