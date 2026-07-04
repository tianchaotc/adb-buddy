/**
 * Shell page — command input with autocomplete (presets + favorites + history),
 * Run button (Ctrl+Enter), output panel with stdout/stderr/exit/duration,
 * copy buttons, favorites toggle.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Combobox,
  Option,
  Card,
  CardHeader,
  Subtitle1,
  Body1,
  makeStyles,
  tokens,
  Badge,
} from '@fluentui/react-components';
import {
  PlayRegular,
  StarRegular,
  StarFilled,
  DeleteRegular,
} from '@fluentui/react-icons';
import type { AdbError, CmdResult, ShellPreset } from '@/bindings/types';
import {
  runShell,
  listShellPresets,
  getShellFavorites,
  addShellFavorite,
  removeShellFavorite,
} from '@/ipc/client';
import { useDevicesStore } from '@/store/devices';
import { useConsoleStore, type CommandResult } from '@/store/console';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { CopyButton } from '@/components/shared/CopyButton';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDuration } from '@/lib/format';
import { asAdbError } from '@/lib/errors';

const useStyles = makeStyles({
  inputRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '12px',
  },
  combobox: { flex: 1 },
  output: {
    marginTop: '12px',
    background: tokens.colorNeutralBackground3,
    padding: '12px',
    borderRadius: '6px',
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflow: 'auto',
    maxHeight: '60vh',
  },
  stderr: { color: tokens.colorStatusDangerForeground1 },
  metaRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '8px',
  },
  card: { padding: '16px' },
  history: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  histRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
    '&:hover': {
      background: tokens.colorNeutralBackground1Hover,
    },
  },
});

export function ShellPage() {
  const styles = useStyles();
  const selectedSerial = useDevicesStore((s) => s.selectedSerial);
  const consoleHistory = useConsoleStore((s) => s.history);
  const appendConsole = useConsoleStore((s) => s.append);
  const [command, setCommand] = useState('');
  const [presets, setPresets] = useState<ShellPreset[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [result, setResult] = useState<CmdResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdbError | null>(null);

  useEffect(() => {
    void listShellPresets().then(setPresets).catch(() => {});
    void getShellFavorites().then(setFavorites).catch(() => {});
  }, []);

  const autocompleteOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string; group: string }[] = [];
    for (const p of presets) {
      if (!seen.has(p.command)) {
        seen.add(p.command);
        opts.push({ value: p.command, label: `${p.label} — ${p.command}`, group: 'Presets' });
      }
    }
    for (const f of favorites) {
      if (!seen.has(f)) {
        seen.add(f);
        opts.push({ value: f, label: f, group: 'Favorites' });
      }
    }
    for (const h of consoleHistory) {
      const cmd = h.command.replace(/^adb shell\s+/, '');
      if (cmd && !seen.has(cmd)) {
        seen.add(cmd);
        opts.push({ value: cmd, label: cmd, group: 'History' });
      }
    }
    return opts;
  }, [presets, favorites, consoleHistory]);

  const isFavorite = favorites.includes(command.trim());

  const run = async () => {
    const cmd = command.trim();
    if (!cmd || !selectedSerial) return;
    setLoading(true);
    setError(null);
    try {
      const r = await runShell(selectedSerial, cmd);
      setResult(r);
      const consoleResult: CommandResult = {
        command: r.command,
        stdout: r.stdout,
        stderr: r.stderr,
        exitCode: r.exit_code,
        durationMs: r.duration_ms,
        timestamp: new Date().toISOString(),
      };
      appendConsole(consoleResult);
    } catch (e) {
      setError(asAdbError(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    if (isFavorite) {
      await removeShellFavorite(cmd);
      setFavorites((f) => f.filter((x) => x !== cmd));
    } else {
      await addShellFavorite(cmd);
      setFavorites((f) => [...f, cmd]);
    }
  };

  if (!selectedSerial) {
    return (
      <EmptyState
        title="No device selected"
        description="Select a device from the top bar to run shell commands."
      />
    );
  }

  return (
    <div>
      <Subtitle1 as="h1" style={{ marginBottom: 16 }}>Shell</Subtitle1>
      {error ? <ErrorBanner error={error} /> : null}

      <Card className={styles.card}>
        <CardHeader header={<Body1>Run an `adb shell` command.</Body1>} />
        <div className={styles.inputRow}>
          <Combobox
            className={styles.combobox}
            placeholder="e.g. getprop ro.product.model"
            value={command}
            onChange={(e) => setCommand(e.currentTarget.value)}
            onOptionSelect={(_, d) => setCommand(d.optionValue ?? '')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void run();
              }
            }}
            freeform
          >
            {autocompleteOptions.map((o) => (
              <Option key={o.value} value={o.value}>
                {o.label}
              </Option>
            ))}
          </Combobox>
          <Button
            icon={isFavorite ? <StarFilled /> : <StarRegular />}
            appearance="subtle"
            onClick={toggleFavorite}
            disabled={!command.trim()}
            title={isFavorite ? 'Remove favorite' : 'Add favorite'}
          />
          <Button
            icon={<PlayRegular />}
            appearance="primary"
            onClick={() => void run()}
            disabled={loading || !command.trim()}
          >
            Run
          </Button>
        </div>
        <Body1 style={{ opacity: 0.6, fontSize: 12 }}>
          Press Ctrl+Enter in the input to run.
        </Body1>
        {loading ? <LoadingSpinner label="Running…" /> : null}
        {result ? (
          <div>
            <div className={styles.metaRow}>
              <Badge appearance="filled" color={result.exit_code === 0 ? 'success' : 'danger'}>
                exit {result.exit_code}
              </Badge>
              <Badge appearance="outline">{formatDuration(result.duration_ms)}</Badge>
              <CopyButton text={result.command} label="Copy cmd" />
              <CopyButton text={result.stdout} label="Copy out" />
              <Button
                icon={<DeleteRegular />}
                size="small"
                appearance="subtle"
                onClick={() => setResult(null)}
              >
                Clear
              </Button>
            </div>
            <div className={styles.output}>
              {result.stdout ? <div>{result.stdout}</div> : null}
              {result.stderr ? <div className={styles.stderr}>{result.stderr}</div> : null}
            </div>
          </div>
        ) : null}
      </Card>

      {consoleHistory.length > 0 ? (
        <Card className={`${styles.card} ${styles.history}`}>
          <CardHeader header={<Subtitle1>Recent commands</Subtitle1>} />
          {consoleHistory.slice(0, 10).map((h, i) => (
            <div
              key={i}
              className={styles.histRow}
              onClick={() => setCommand(h.command.replace(/^adb shell\s+/, ''))}
            >
              <span style={{ flex: 1 }}>{h.command}</span>
              <Badge appearance="outline">{formatDuration(h.durationMs)}</Badge>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
