/**
 * Files page — path breadcrumb, list of FileEntry, common paths quick buttons,
 * pull/push/delete actions. Delete requires ConfirmDialog.
 */
import { useEffect, useState } from 'react';
import {
  Button,
  Subtitle1,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableColumnDefinition,
  TableCellLayout,
  createTableColumn,
  Input,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
  BreadcrumbDivider,
  Menu,
  MenuTrigger,
  MenuButton,
  MenuList,
  MenuItem,
  MenuPopover,
  makeStyles,
  Badge,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  DeleteRegular,
  FolderRegular,
  DocumentRegular,
  MoreHorizontalRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import type { AdbError, FileEntry } from '@/bindings/types';
import { deleteFile, listFiles, pullFile, pushFile } from '@/ipc/client';
import { useDevicesStore } from '@/store/devices';
import { useConsoleStore } from '@/store/console';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatBytes } from '@/lib/format';
import { asAdbError } from '@/lib/errors';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  path: { flex: 1, minWidth: '240px' },
  quick: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  grid: { minHeight: '320px' },
});

const COMMON_PATHS = [
  '/sdcard/',
  '/sdcard/Download',
  '/sdcard/DCIM',
  '/sdcard/Pictures',
  '/sdcard/Android/data',
  '/data/local/tmp/',
];

function joinPath(base: string, name: string): string {
  if (base.endsWith('/')) return base + name;
  return `${base}/${name}`;
}

function pathParts(path: string): { name: string; path: string }[] {
  const parts = path.split('/').filter(Boolean);
  const result: { name: string; path: string }[] = [];
  let acc = '';
  for (const p of parts) {
    acc += `/${p}`;
    result.push({ name: p, path: acc });
  }
  return result;
}

export function FilesPage() {
  const styles = useStyles();
  const selectedSerial = useDevicesStore((s) => s.selectedSerial);
  const appendConsole = useConsoleStore((s) => s.append);
  const [path, setPath] = useState('/sdcard/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdbError | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null);
  const [pushTarget, setPushTarget] = useState('');
  const fileInputRef = useFileInput();

  const load = async (p: string) => {
    if (!selectedSerial) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listFiles(selectedSerial, p);
      setEntries(result);
      setPath(p);
    } catch (e) {
      setError(asAdbError(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSerial]);

  const record = (command: string, stdout = '', stderr = '', exit = 0) => {
    appendConsole({ command, stdout, stderr, exitCode: exit, durationMs: 0, timestamp: new Date().toISOString() });
  };

  const onPull = async (entry: FileEntry) => {
    if (!selectedSerial) return;
    const remote = joinPath(path, entry.name);
    try {
      const local = await pullFile(selectedSerial, remote, null);
      record(`adb pull ${remote} ${local}`, `pulled to ${local}`);
    } catch (e) {
      const adb = asAdbError(e);
      setError(adb);
      record(`adb pull ${remote}`, '', String(e), 1);
    }
  };

  const onPush = async (file: File) => {
    if (!selectedSerial || !pushTarget) return;
    const local = (file as File & { path?: string }).path || file.name;
    const remote = joinPath(path, pushTarget);
    try {
      await pushFile(selectedSerial, local, remote);
      record(`adb push ${local} ${remote}`);
      setPushTarget('');
      void load(path);
    } catch (e) {
      setError(asAdbError(e));
    }
  };

  const onConfirmDelete = async () => {
    if (!selectedSerial || !pendingDelete) return;
    const target = joinPath(path, pendingDelete.name);
    try {
      await deleteFile(selectedSerial, target);
      record(`adb shell rm -f ${target}`);
      void load(path);
    } catch (e) {
      setError(asAdbError(e));
    } finally {
      setPendingDelete(null);
    }
  };

  const columns: TableColumnDefinition<FileEntry>[] = [
    createTableColumn<FileEntry>({
      columnId: 'name',
      renderHeaderCell: () => 'Name',
      renderCell: (entry) => (
        <TableCellLayout>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {entry.is_dir ? <FolderRegular /> : <DocumentRegular />}
            {entry.is_dir ? (
              <a
                onClick={() => void load(joinPath(path, entry.name))}
                style={{ cursor: 'pointer' }}
              >
                {entry.name}/
              </a>
            ) : (
              <span>{entry.name}</span>
            )}
          </span>
        </TableCellLayout>
      ),
    }),
    createTableColumn<FileEntry>({
      columnId: 'size',
      renderHeaderCell: () => 'Size',
      renderCell: (entry) => (entry.is_dir ? '—' : formatBytes(entry.size)),
    }),
    createTableColumn<FileEntry>({
      columnId: 'perms',
      renderHeaderCell: () => 'Perms',
      renderCell: (entry) => <code style={{ fontSize: 11 }}>{entry.perms}</code>,
    }),
    createTableColumn<FileEntry>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (entry) => (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <MenuButton appearance="subtle" size="small" icon={<MoreHorizontalRegular />} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {!entry.is_dir ? (
                <MenuItem icon={<ArrowDownloadRegular />} onClick={() => void onPull(entry)}>
                  Pull
                </MenuItem>
              ) : null}
              <MenuItem icon={<DeleteRegular />} onClick={() => setPendingDelete(entry)}>
                Delete…
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      ),
    }),
  ];

  if (!selectedSerial) {
    return (
      <EmptyState
        icon={<FolderRegular />}
        title="No device selected"
        description="Select a device from the top bar to browse files."
      />
    );
  }

  return (
    <div>
      <Subtitle1 as="h1" style={{ marginBottom: 16 }}>Files</Subtitle1>
      {error ? <ErrorBanner error={error} onDismiss={() => setError(null)} /> : null}

      <div className={styles.quick}>
        {COMMON_PATHS.map((p) => (
          <Badge key={p} appearance="outline" style={{ cursor: 'pointer' }} onClick={() => void load(p)}>
            {p}
          </Badge>
        ))}
      </div>

      <div className={styles.toolbar}>
        <Breadcrumb>
          <BreadcrumbItem>
            <BreadcrumbButton onClick={() => void load('/')}>/</BreadcrumbButton>
          </BreadcrumbItem>
          {pathParts(path).map((part) => (
            <BreadcrumbItem key={part.path}>
              <BreadcrumbDivider />
              <BreadcrumbButton onClick={() => void load(part.path)}>
                {part.name}
              </BreadcrumbButton>
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
        <Input
          className={styles.path}
          value={path}
          onChange={(_, d) => setPath(d.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load(path);
          }}
        />
        <Button
          icon={<ArrowClockwiseRegular />}
          appearance="subtle"
          onClick={() => void load(path)}
        >
          Refresh
        </Button>
        <Button
          icon={<ArrowUploadRegular />}
          appearance="subtle"
          onClick={() => {
            setPushTarget('new-file');
            fileInputRef.current?.click();
          }}
        >
          Push…
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPush(f);
          e.target.value = '';
        }}
      />

      {loading ? <LoadingSpinner label="Loading files…" /> : null}

      {!loading && entries.length === 0 ? (
        <EmptyState title="Empty folder" description="No files in this directory." />
      ) : null}

      {!loading && entries.length > 0 ? (
        <DataGrid
          items={entries}
          columns={columns}
          getRowId={(entry) => entry.name}
          className={styles.grid}
          size="small"
        >
          <DataGridHeader>
            <DataGridRow>
              {(column) => <DataGridHeaderCell>{column.renderHeaderCell()}</DataGridHeaderCell>}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<FileEntry>>
            {({ item, rowId }) => (
              <DataGridRow<FileEntry> key={rowId}>
                {(column) => <DataGridCell>{column.renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete ${pendingDelete?.name}?`}
        body={`This will delete ${pendingDelete?.name} from ${path}. This cannot be undone.`}
        commandPreview={`adb shell rm -f ${pendingDelete ? joinPath(path, pendingDelete.name) : ''}`}
        confirmLabel="Delete"
        destructive
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        onConfirm={() => void onConfirmDelete()}
      />
    </div>
  );
}

/** Tiny helper to get a typed ref for the hidden file input. */
function useFileInput() {
  const [ref] = useState<{ current: HTMLInputElement | null }>({ current: null });
  return ref;
}
