/**
 * Logs page — logcat viewer.
 *
 * Toolbar: start/stop/clear/save. Filter bar (tag, level, text). Virtualized
 * log list (cap to last 500 visible lines with "showing last 500 of N" header).
 * Crash/ANR highlighting (red/yellow bg). Jump-to-crash buttons.
 *
 * Listens to `logcat://line` events via the logcat store.
 */
import { useMemo, useState } from 'react';
import {
  Button,
  Subtitle1,
  Body1,
  Input,
  Checkbox,
  Tooltip,
  makeStyles,
  tokens,
  Badge,
} from '@fluentui/react-components';
import {
  PlayRegular,
  StopRegular,
  EraserRegular,
  SaveRegular,
  ArrowDownRegular,
  WarningRegular,
  ErrorCircleRegular,
} from '@fluentui/react-icons';
import type { AdbError, LogcatFilters } from '@/bindings/types';
import { clearLogcatBuffer } from '@/ipc/client';
import { useDevicesStore } from '@/store/devices';
import { useLogcatStore, type LogLevel, type LogLine } from '@/store/logcat';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { EmptyState } from '@/components/shared/EmptyState';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  filters: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  levels: {
    display: 'flex',
    gap: '4px',
  },
  list: {
    background: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '6px',
    padding: '4px',
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
    height: 'calc(100vh - 280px)',
    minHeight: '320px',
    overflow: 'auto',
  },
  line: {
    display: 'flex',
    gap: '6px',
    padding: '1px 4px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  crash: {
    background: tokens.colorStatusDangerBackground1,
  borderLeft: `3px solid ${tokens.colorStatusDangerForeground1}`,
  },
  anr: {
    background: tokens.colorStatusWarningBackground1,
    borderLeft: `3px solid ${tokens.colorStatusWarningForeground1}`,
  },
  level: {
    flexShrink: 0,
    fontWeight: 600,
    width: '12px',
    textAlign: 'center',
  },
  tag: {
    flexShrink: 0,
    opacity: 0.7,
  },
  msg: {
    flex: 1,
  },
  header: {
    padding: '4px 8px',
    background: tokens.colorNeutralBackground3,
    opacity: 0.8,
    fontSize: '11px',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
});

const LEVEL_COLORS: Record<LogLevel, string> = {
  V: tokens.colorNeutralForeground3,
  D: tokens.colorPaletteBlueForeground2,
  I: tokens.colorPaletteGreenForeground1,
  W: tokens.colorStatusWarningForeground1,
  E: tokens.colorStatusDangerForeground1,
  F: tokens.colorStatusDangerForeground1,
};

const ALL_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];

export function LogsPage() {
  const styles = useStyles();
  const selectedSerial = useDevicesStore((s) => s.selectedSerial);
  const {
    running,
    lines,
    filters,
    error,
    start,
    stop,
    clear,
    setFilters,
  } = useLogcatStore();
  const [filterSpec, setFilterSpec] = useState('');

  const filtered = useMemo(() => {
    return lines.filter((line) => {
      if (filters.tag && !line.tag.toLowerCase().includes(filters.tag.toLowerCase())) {
        return false;
      }
      if (filters.level.length > 0 && !filters.level.includes(line.level)) {
        return false;
      }
      if (filters.text && !line.message.toLowerCase().includes(filters.text.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [lines, filters]);

  const visible = filtered.slice(-500);
  const crashCount = filtered.filter((l) => l.isCrash).length;
  const anrCount = filtered.filter((l) => l.isAnr).length;

  const onStart = () => {
    const f: LogcatFilters = {
      filter_spec: filterSpec || null,
      text: filters.text || null,
    };
    void start(f, selectedSerial);
  };

  const onSave = () => {
    const text = filtered.map((l) => l.raw).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logcat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onClearDevice = async () => {
    if (!selectedSerial) return;
    try {
      await clearLogcatBuffer(selectedSerial);
    } catch {
      // best-effort
    }
  };

  const toggleLevel = (lvl: LogLevel) => {
    setFilters({
      level: filters.level.includes(lvl)
        ? filters.level.filter((l) => l !== lvl)
        : [...filters.level, lvl],
    });
  };

  if (!selectedSerial) {
    return (
      <EmptyState
        icon={<WarningRegular />}
        title="No device selected"
        description="Select a device from the top bar to stream logcat."
      />
    );
  }

  return (
    <div>
      <Subtitle1 as="h1" style={{ marginBottom: 16 }}>Logcat</Subtitle1>
      {error ? <ErrorBanner error={error as AdbError} /> : null}

      <div className={styles.toolbar}>
        {running ? (
          <Button icon={<StopRegular />} appearance="primary" onClick={() => void stop()}>
            Stop
          </Button>
        ) : (
          <Button icon={<PlayRegular />} appearance="primary" onClick={onStart}>
            Start
          </Button>
        )}
        <Button icon={<EraserRegular />} appearance="subtle" onClick={clear} disabled={lines.length === 0}>
          Clear view
        </Button>
        <Button icon={<EraserRegular />} appearance="subtle" onClick={() => void onClearDevice()}>
          Clear device buffer
        </Button>
        <Button icon={<SaveRegular />} appearance="subtle" onClick={onSave} disabled={filtered.length === 0}>
          Save
        </Button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {crashCount > 0 ? (
            <Badge appearance="filled" color="danger" icon={<ErrorCircleRegular />}>
              {crashCount} crash{crashCount === 1 ? '' : 'es'}
            </Badge>
          ) : null}
          {anrCount > 0 ? (
            <Badge appearance="filled" color="warning" icon={<WarningRegular />}>
              {anrCount} ANR{anrCount === 1 ? '' : 's'}
            </Badge>
          ) : null}
        </span>
      </div>

      <div className={styles.filters}>
        <Input
          placeholder="Filter spec (e.g. MyApp:D *:S)"
          value={filterSpec}
          onChange={(_, d) => setFilterSpec(d.value)}
          style={{ width: 220 }}
        />
        <Input
          placeholder="Tag contains…"
          value={filters.tag}
          onChange={(_, d) => setFilters({ tag: d.value })}
          style={{ width: 140 }}
        />
        <Input
          placeholder="Message contains…"
          value={filters.text}
          onChange={(_, d) => setFilters({ text: d.value })}
          style={{ width: 200 }}
        />
        <div className={styles.levels}>
          {ALL_LEVELS.map((lvl) => (
            <Checkbox
              key={lvl}
              checked={filters.level.includes(lvl)}
              onChange={() => toggleLevel(lvl)}
              label={
                <span style={{ color: LEVEL_COLORS[lvl], fontWeight: 600 }}>{lvl}</span>
              }
            />
          ))}
        </div>
        <Tooltip content="Jump to last crash" relationship="label">
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowDownRegular />}
            disabled={crashCount === 0}
            onClick={() => {
              const idx = filtered.findIndex((l) => l.isCrash);
              if (idx >= 0) {
                const el = document.getElementById(`log-${idx}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
          />
        </Tooltip>
      </div>

      <div className={styles.list}>
        {filtered.length > visible.length ? (
          <div className={styles.header}>
            Showing last {visible.length} of {filtered.length} lines
          </div>
        ) : null}
        {visible.length === 0 ? (
          <Body1 style={{ opacity: 0.6, padding: 16 }}>
            {running ? 'Waiting for log output…' : 'Press Start to begin streaming logcat.'}
          </Body1>
        ) : null}
        {visible.map((line, i) => {
          const realIdx = filtered.length - visible.length + i;
          return <LogRow key={realIdx} line={line} idx={realIdx} styles={styles} />;
        })}
      </div>
    </div>
  );
}

function LogRow({
  line,
  idx,
  styles,
}: {
  line: LogLine;
  idx: number;
  styles: ReturnType<typeof useStyles>;
}) {
  const cls = line.isCrash
    ? `${styles.line} ${styles.crash}`
    : line.isAnr
      ? `${styles.line} ${styles.anr}`
      : styles.line;
  return (
    <div id={`log-${idx}`} className={cls}>
      <span className={styles.tag}>{line.timestamp}</span>
      <span className={styles.level} style={{ color: LEVEL_COLORS[line.level] }}>
        {line.level}
      </span>
      <span className={styles.tag}>{line.tag || '-'}</span>
      <span className={styles.msg}>{line.message}</span>
    </div>
  );
}
