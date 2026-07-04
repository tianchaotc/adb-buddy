/**
 * History page — searchable/filterable table of HistoryEntry.
 *
 * Columns: timestamp, serial, module, command, exit, duration. Row expand to
 * show stdout/stderr. Actions: re-run, copy command, export JSON.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Subtitle1,
  Input,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableColumnDefinition,
  TableCellLayout,
  createTableColumn,
  Badge,
  makeStyles,
  tokens,
  Body1,
  Menu,
  MenuTrigger,
  MenuButton,
  MenuList,
  MenuItem,
  MenuPopover,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  SearchRegular,
  MoreHorizontalRegular,
  PlayRegular,
  CopyRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  HistoryRegular,
} from '@fluentui/react-icons';
import type { AdbError, HistoryEntry } from '@/bindings/types';
import { rerunHistory } from '@/ipc/client';
import { useHistoryStore } from '@/store/history';
import { useConsoleStore, type CommandResult } from '@/store/console';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { CopyButton } from '@/components/shared/CopyButton';
import { formatDuration, formatTimestamp } from '@/lib/format';
import { asAdbError } from '@/lib/errors';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  search: { flex: 1, maxWidth: '300px' },
  grid: { minHeight: '320px' },
  expanded: {
    padding: '8px',
    background: tokens.colorNeutralBackground3,
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '11px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  stderr: { color: tokens.colorStatusDangerForeground1 },
});

export function HistoryPage() {
  const styles = useStyles();
  const {
    entries,
    loading,
    error,
    filters,
    expandedId,
    setFilters,
    query,
    clear,
    exportEntries,
    setExpanded,
  } = useHistoryStore();
  const appendConsole = useConsoleStore((s) => s.append);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    void query();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: TableColumnDefinition<HistoryEntry>[] = useMemo(
    () => [
      createTableColumn<HistoryEntry>({
        columnId: 'timestamp',
        renderHeaderCell: () => 'Time',
        renderCell: (e) => <TableCellLayout>{formatTimestamp(e.timestamp)}</TableCellLayout>,
      }),
      createTableColumn<HistoryEntry>({
        columnId: 'serial',
        renderHeaderCell: () => 'Serial',
        renderCell: (e) => <code style={{ fontSize: 11 }}>{e.device_serial}</code>,
      }),
      createTableColumn<HistoryEntry>({
        columnId: 'module',
        renderHeaderCell: () => 'Module',
        renderCell: (e) => <Badge appearance="outline">{e.feature_module}</Badge>,
      }),
      createTableColumn<HistoryEntry>({
        columnId: 'command',
        renderHeaderCell: () => 'Command',
        renderCell: (e) => (
          <TableCellLayout>
            <code style={{ fontSize: 11 }}>{e.command}</code>
          </TableCellLayout>
        ),
      }),
      createTableColumn<HistoryEntry>({
        columnId: 'exit',
        renderHeaderCell: () => 'Exit',
        renderCell: (e) =>
          e.exit_code === null || e.exit_code === undefined ? (
            <Badge appearance="outline">?</Badge>
          ) : (
            <Badge appearance="filled" color={e.exit_code === 0 ? 'success' : 'danger'}>
              {e.exit_code}
            </Badge>
          ),
      }),
      createTableColumn<HistoryEntry>({
        columnId: 'duration',
        renderHeaderCell: () => 'Duration',
        renderCell: (e) => formatDuration(e.duration_ms),
      }),
      createTableColumn<HistoryEntry>({
        columnId: 'actions',
        renderHeaderCell: () => 'Actions',
        renderCell: (e) => (
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuButton appearance="subtle" size="small" icon={<MoreHorizontalRegular />} />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem
                  icon={<PlayRegular />}
                  onClick={() => void rerunAndRun(e)}
                >
                  Re-run
                </MenuItem>
                <MenuItem icon={<CopyRegular />} onClick={() => void navigator.clipboard.writeText(e.command)}>
                  Copy command
                </MenuItem>
                <MenuItem
                  icon={<ArrowDownloadRegular />}
                  onClick={() => setExpanded(expandedId === e.id ? null : e.id ?? null)}
                >
                  {expandedId === e.id ? 'Hide output' : 'View output'}
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expandedId],
  );

  const rerunAndRun = async (entry: HistoryEntry) => {
    try {
      const fetched = await rerunHistory(entry.id ?? 0);
      const result: CommandResult = {
        command: fetched.command,
        stdout: fetched.stdout,
        stderr: fetched.stderr,
        exitCode: fetched.exit_code ?? null,
        durationMs: fetched.duration_ms,
        timestamp: new Date().toISOString(),
      };
      appendConsole(result);
    } catch (e) {
      // Best-effort: surface the failure in the console.
      const adb = asAdbError(e);
      appendConsole({
        command: `rerun_history(${entry.id})`,
        stdout: '',
        stderr: adb ? adb.kind : String(e),
        exitCode: 1,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const onExport = async () => {
    try {
      const json = await exportEntries();
      setExported(json);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `history-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const onClear = async () => {
    await clear(null);
    setConfirmClear(false);
  };

  const search = filters.search;
  const filteredEntries = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.command.toLowerCase().includes(q) ||
        e.device_serial.toLowerCase().includes(q) ||
        e.feature_module.toLowerCase().includes(q),
    );
  }, [entries, search]);

  return (
    <div>
      <Subtitle1 as="h1" style={{ marginBottom: 16 }}>Command History</Subtitle1>
      {error ? <ErrorBanner error={error as AdbError} /> : null}
      {exported ? (
        <MessageBar intent="success" style={{ marginBottom: 12 }}>
          <MessageBarBody>Exported {filteredEntries.length} entries to JSON.</MessageBarBody>
        </MessageBar>
      ) : null}

      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          placeholder="Search command / serial / module…"
          contentBefore={<SearchRegular />}
          value={filters.search}
          onChange={(_, d) => setFilters({ search: d.value })}
        />
        <Button appearance="subtle" onClick={() => void query()}>Refresh</Button>
        <Button
          icon={<ArrowDownloadRegular />}
          appearance="subtle"
          onClick={() => void onExport()}
          disabled={entries.length === 0}
        >
          Export JSON
        </Button>
        <Button
          icon={<DeleteRegular />}
          appearance="subtle"
          onClick={() => setConfirmClear(true)}
          disabled={entries.length === 0}
        >
          Clear all
        </Button>
      </div>

      {loading ? <LoadingSpinner label="Loading history…" /> : null}

      {!loading && filteredEntries.length === 0 ? (
        <EmptyState
          icon={<HistoryRegular />}
          title="No history"
          description="Run commands from the other pages to populate the history."
        />
      ) : null}

      {!loading && filteredEntries.length > 0 ? (
        <DataGrid
          items={filteredEntries}
          columns={columns}
          getRowId={(e) => String(e.id ?? e.timestamp)}
          className={styles.grid}
          size="small"
        >
          <DataGridHeader>
            <DataGridRow>
              {(column) => <DataGridHeaderCell>{column.renderHeaderCell()}</DataGridHeaderCell>}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<HistoryEntry>>
            {({ item, rowId }) => (
              <DataGridRow<HistoryEntry> key={rowId}>
                {(column) => <DataGridCell>{column.renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      ) : null}

      {expandedId !== null ? (
        <div className={styles.expanded} style={{ marginTop: 12 }}>
          {(() => {
            const entry = filteredEntries.find((e) => e.id === expandedId);
            if (!entry) return null;
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Body1 style={{ fontWeight: 600 }}>{entry.command}</Body1>
                  <CopyButton text={entry.command} label="Copy command" />
                  <Button
                    size="small"
                    appearance="subtle"
                    onClick={() => setExpanded(null)}
                  >
                    Close
                  </Button>
                </div>
                <Body1 style={{ fontWeight: 600 }}>stdout:</Body1>
                <pre style={{ margin: '4px 0' }}>{entry.stdout || '(empty)'}</pre>
                {entry.stderr ? (
                  <>
                    <Body1 style={{ fontWeight: 600 }} className={styles.stderr}>stderr:</Body1>
                    <pre className={styles.stderr} style={{ margin: '4px 0' }}>{entry.stderr}</pre>
                  </>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        title="Clear all history?"
        body="This will permanently delete all command history. This cannot be undone."
        confirmLabel="Clear all"
        destructive
        onOpenChange={(o) => setConfirmClear(o)}
        onConfirm={() => void onClear()}
      />
    </div>
  );
}
