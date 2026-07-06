/**
 * Install page — drag-drop zone for APK files, file picker button, install
 * options checkboxes (reinstall, allow downgrade, grant permissions, multiple),
 * install button, progress/result display.
 *
 * Drag-drop uses HTML5 drag events. The file picker is a hidden `<input
 * type="file">` triggered by a button.
 */
import { useCallback, useRef, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  Subtitle1,
  Body1,
  Checkbox,
  ProgressBar,
  makeStyles,
  mergeClasses,
  tokens,
  MessageBar,
  MessageBarBody,
  Badge,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
} from '@fluentui/react-icons';
import type { AdbError, InstallFlags, InstallResult } from '@/bindings/types';
import { installApk } from '@/ipc/client';
import { useDevicesStore } from '@/store/devices';
import { useConsoleStore } from '@/store/console';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { asAdbError } from '@/lib/errors';

const useStyles = makeStyles({
  dropzone: {
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: '8px',
    padding: '48px 24px',
    textAlign: 'center',
    transitionDuration: '150ms',
    cursor: 'pointer',
  },
  dropzoneActive: {
    border: `2px solid ${tokens.colorBrandStroke1}`,
    background: tokens.colorBrandBackground2,
  },
  card: { padding: '16px', maxWidth: '640px' },
  options: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    margin: '12px 0',
  },
  fileList: {
    margin: '12px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fileRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
  },
});

export function InstallPage() {
  const styles = useStyles();
  const selectedSerial = useDevicesStore((s) => s.selectedSerial);
  const appendConsole = useConsoleStore((s) => s.append);
  const [paths, setPaths] = useState<string[]>([]);
  const [flags, setFlags] = useState<InstallFlags>({
    reinstall: true,
    allow_downgrade: false,
    grant_permissions: true,
    multiple: false,
  });
  const [dragOver, setDragOver] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [error, setError] = useState<AdbError | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setPaths((p) => [...p, ...files.map((f) => (f as File & { path?: string }).path || f.name)]);
    }
  }, []);

  const onInstall = useCallback(async () => {
    if (paths.length === 0 || !selectedSerial) return;
    setInstalling(true);
    setError(null);
    setResult(null);
    try {
      const r = await installApk(selectedSerial, paths, flags);
      setResult(r);
      const args = [
        flags.multiple ? 'install-multiple' : 'install',
        flags.reinstall ? '-r' : '',
        flags.allow_downgrade ? '-d' : '',
        flags.grant_permissions ? '-g' : '',
        ...paths,
      ].filter(Boolean).join(' ');
      appendConsole({
        command: `adb ${args}`,
        stdout: r.message,
        stderr: r.success ? '' : `Failure [${r.code ?? 'UNKNOWN'}]`,
        exitCode: r.success ? 0 : 1,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      setError(asAdbError(e));
    } finally {
      setInstalling(false);
    }
  }, [paths, flags, selectedSerial, appendConsole]);

  if (!selectedSerial) {
    return (
      <EmptyState
        icon={<ArrowDownloadRegular />}
        title="No device selected"
        description="Select a device from the top bar before installing APKs."
      />
    );
  }

  return (
    <div>
      <Subtitle1 as="h1" style={{ marginBottom: 16 }}>Install APK</Subtitle1>
      {error ? <ErrorBanner error={error} /> : null}

      <Card className={styles.card}>
        <CardHeader header={<Body1>Drop APK files here or use the picker.</Body1>} />
        <div
          className={mergeClasses(styles.dropzone, dragOver && styles.dropzoneActive)}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <ArrowUploadRegular style={{ fontSize: 32, opacity: 0.6 }} />
          <Body1>Drop .apk files here, or click to browse</Body1>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".apk"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) {
              setPaths((p) => [...p, ...files.map((f) => (f as File & { path?: string }).path || f.name)]);
            }
            e.target.value = '';
          }}
        />

        {paths.length > 0 ? (
          <div className={styles.fileList}>
            {paths.map((p, i) => (
              <div key={`${p}-${i}`} className={styles.fileRow}>
                <code style={{ flex: 1 }}>{p}</code>
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => setPaths((arr) => arr.filter((_, idx) => idx !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className={styles.options}>
          <Checkbox
            checked={flags.reinstall}
            onChange={(_, d) => setFlags((f) => ({ ...f, reinstall: d.checked === true }))}
            label="Reinstall (-r, preserve data)"
          />
          <Checkbox
            checked={flags.allow_downgrade}
            onChange={(_, d) => setFlags((f) => ({ ...f, allow_downgrade: d.checked === true }))}
            label="Allow downgrade (-d)"
          />
          <Checkbox
            checked={flags.grant_permissions}
            onChange={(_, d) => setFlags((f) => ({ ...f, grant_permissions: d.checked === true }))}
            label="Grant all permissions (-g)"
          />
          <Checkbox
            checked={flags.multiple}
            onChange={(_, d) => setFlags((f) => ({ ...f, multiple: d.checked === true }))}
            label="Use install-multiple (split APKs)"
          />
        </div>

        <Button
          icon={<ArrowDownloadRegular />}
          appearance="primary"
          onClick={() => void onInstall()}
          disabled={installing || paths.length === 0}
        >
          Install {paths.length > 0 ? `(${paths.length})` : ''}
        </Button>

        {installing ? (
          <div style={{ marginTop: 12 }}>
            <ProgressBar />
            <LoadingSpinner label="Installing…" />
          </div>
        ) : null}

        {result ? (
          <MessageBar
            intent={result.success ? 'success' : 'error'}
            style={{ marginTop: 12 }}
          >
            <MessageBarBody>
              {result.success ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckmarkCircleRegular /> {result.message || 'Success'}
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ErrorCircleRegular />
                  <Badge appearance="filled" color="danger">{result.code ?? 'FAILURE'}</Badge>
                  {result.message}
                </span>
              )}
            </MessageBarBody>
          </MessageBar>
        ) : null}
      </Card>
    </div>
  );
}
