/**
 * Apps page — DataGrid of packages with filters (All/ThirdParty/System/Disabled),
 * search by name, and a row actions menu (force stop, clear data, uninstall,
 * disable, enable, pull APK, launch, open settings).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Tab,
  TabList,
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
  Button,
  Menu,
  MenuTrigger,
  MenuButton,
  MenuList,
  MenuItem,
  MenuPopover,
  MenuDivider,
  makeStyles,
  Body1,
} from '@fluentui/react-components';
import {
  SearchRegular,
  MoreHorizontalRegular,
  StopRegular,
  DeleteRegular,
  EraserRegular,
  ArrowDownloadRegular,
  PlayRegular,
  SettingsRegular,
  BoxCheckmarkRegular,
  BoxDismissRegular,
} from '@fluentui/react-icons';
import type { AdbError, Package, PackageFilter } from '@/bindings/types';
import {
  listPackages,
  forceStopPackage,
  clearPackageData,
  uninstallPackage,
  disablePackage,
  enablePackage,
  pullApk,
  launchPackage,
  openAppSettings,
} from '@/ipc/client';
import { useDevicesStore } from '@/store/devices';
import { useConsoleStore } from '@/store/console';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { asAdbError } from '@/lib/errors';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '12px',
  },
  search: { flex: 1, maxWidth: '360px' },
  grid: { minHeight: '400px' },
});

type Filter = 'all' | 'thirdparty' | 'system' | 'disabled';

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  thirdparty: 'Third-party',
  system: 'System',
  disabled: 'Disabled',
};

interface PendingConfirm {
  title: string;
  body: string;
  commandPreview: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function AppsPage() {
  const styles = useStyles();
  const selectedSerial = useDevicesStore((s) => s.selectedSerial);
  const appendConsole = useConsoleStore((s) => s.append);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdbError | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const load = async () => {
    if (!selectedSerial) {
      setPackages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const pkgs = await listPackages(selectedSerial, filter as PackageFilter);
      setPackages(pkgs);
    } catch (e) {
      setError(asAdbError(e));
      setPackages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSerial, filter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return packages;
    const q = search.toLowerCase();
    return packages.filter((p) => p.name.toLowerCase().includes(q));
  }, [packages, search]);

  const record = (command: string, stdout = '', stderr = '', exit = 0) => {
    appendConsole({
      command,
      stdout,
      stderr,
      exitCode: exit,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    });
  };

  const runAction = async (action: string, fn: () => Promise<void>) => {
    if (!selectedSerial) return;
    try {
      await fn();
      record(`adb shell ${action}`);
    } catch (e) {
      const adb = asAdbError(e);
      setError(adb);
      record(`adb shell ${action}`, '', adb?.detail ? JSON.stringify(adb.detail) : String(e), 1);
    }
  };

  const confirmUninstall = (pkg: Package) => {
    setPending({
      title: `Uninstall ${pkg.name}?`,
      body: `This will uninstall ${pkg.name} from the selected device.${pkg.is_system ? ' Note: this is a system app; uninstall may require root or fail.' : ''}`,
      commandPreview: `adb shell pm uninstall ${pkg.name}`,
      confirmLabel: 'Uninstall',
      onConfirm: () => void runAction(
        `pm uninstall ${pkg.name}`,
        () => uninstallPackage(selectedSerial, pkg.name, false).then(() => void load()),
      ),
    });
  };

  const confirmClear = (pkg: Package) => {
    setPending({
      title: `Clear data for ${pkg.name}?`,
      body: `This will permanently clear all data for ${pkg.name} on the selected device.`,
      commandPreview: `adb shell pm clear ${pkg.name}`,
      confirmLabel: 'Clear data',
      onConfirm: () => void runAction(
        `pm clear ${pkg.name}`,
        () => clearPackageData(selectedSerial, pkg.name),
      ),
    });
  };

  const confirmForceStop = (pkg: Package) => {
    setPending({
      title: `Force stop ${pkg.name}?`,
      body: `This will force-stop ${pkg.name}.`,
      commandPreview: `adb shell am force-stop ${pkg.name}`,
      confirmLabel: 'Force stop',
      onConfirm: () => void runAction(
        `am force-stop ${pkg.name}`,
        () => forceStopPackage(selectedSerial, pkg.name),
      ),
    });
  };

  const columns: TableColumnDefinition<Package>[] = useMemo(
    () => [
      createTableColumn<Package>({
        columnId: 'name',
        renderHeaderCell: () => 'Package',
        renderCell: (pkg) => (
          <TableCellLayout>
            <code>{pkg.name}</code>
          </TableCellLayout>
        ),
      }),
      createTableColumn<Package>({
        columnId: 'system',
        renderHeaderCell: () => 'System',
        renderCell: (pkg) =>
          pkg.is_system ? <Badge appearance="filled" color="brand">system</Badge> : <Badge appearance="outline">user</Badge>,
      }),
      createTableColumn<Package>({
        columnId: 'disabled',
        renderHeaderCell: () => 'State',
        renderCell: (pkg) =>
          pkg.is_disabled ? <Badge appearance="filled" color="warning">disabled</Badge> : <Badge appearance="filled" color="success">enabled</Badge>,
      }),
      createTableColumn<Package>({
        columnId: 'actions',
        renderHeaderCell: () => 'Actions',
        renderCell: (pkg) => (
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuButton appearance="subtle" size="small" icon={<MoreHorizontalRegular />} />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<PlayRegular />} onClick={() => void runAction(`monkey -p ${pkg.name}`, () => launchPackage(selectedSerial, pkg.name))}>
                  Launch
                </MenuItem>
                <MenuItem icon={<StopRegular />} onClick={() => confirmForceStop(pkg)}>
                  Force stop…
                </MenuItem>
                <MenuItem icon={<EraserRegular />} onClick={() => confirmClear(pkg)}>
                  Clear data…
                </MenuItem>
                <MenuItem icon={<DeleteRegular />} onClick={() => confirmUninstall(pkg)}>
                  Uninstall…
                </MenuItem>
                <MenuDivider />
                {pkg.is_disabled ? (
                  <MenuItem icon={<BoxCheckmarkRegular />} onClick={() => void runAction(`pm enable ${pkg.name}`, () => enablePackage(selectedSerial, pkg.name).then(() => void load()))}>
                    Enable
                  </MenuItem>
                ) : (
                  <MenuItem icon={<BoxDismissRegular />} onClick={() => void runAction(`pm disable-user ${pkg.name}`, () => disablePackage(selectedSerial, pkg.name).then(() => void load()))}>
                    Disable…
                  </MenuItem>
                )}
                <MenuItem icon={<ArrowDownloadRegular />} onClick={() => void runAction(`pull_apk ${pkg.name}`, () => pullApk(selectedSerial, pkg.name, null).then(() => undefined))}>
                  Pull APK
                </MenuItem>
                <MenuItem icon={<SettingsRegular />} onClick={() => void runAction(`am start APP_DETAILS_SETTINGS ${pkg.name}`, () => openAppSettings(selectedSerial, pkg.name))}>
                  Open app settings
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSerial],
  );

  if (!selectedSerial) {
    return (
      <EmptyState
        icon={<BoxCheckmarkRegular />}
        title="No device selected"
        description="Select a device from the top bar to view installed packages."
      />
    );
  }

  return (
    <div>
      <Body1 as="h1" style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Apps</Body1>
      {error ? <ErrorBanner error={error} onDismiss={() => setError(null)} /> : null}
      <div className={styles.toolbar}>
        <TabList
          selectedValue={filter}
          onTabSelect={(_, d) => setFilter(d.value as Filter)}
        >
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <Tab key={f} value={f}>{FILTER_LABELS[f]}</Tab>
          ))}
        </TabList>
        <Input
          className={styles.search}
          placeholder="Search packages…"
          contentBefore={<SearchRegular />}
          value={search}
          onChange={(_, d) => setSearch(d.value)}
        />
        <Button appearance="subtle" onClick={() => void load()}>Refresh</Button>
      </div>

      {loading ? <LoadingSpinner label="Loading packages…" /> : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState title="No packages" description="No packages match the current filter." />
      ) : null}

      {!loading && filtered.length > 0 ? (
        <DataGrid
          items={filtered}
          columns={columns}
          getRowId={(pkg) => pkg.name}
          className={styles.grid}
          size="small"
        >
          <DataGridHeader>
            <DataGridRow>
              {(column) => (
                <DataGridHeaderCell>{column.renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<Package>>
            {({ item, rowId }) => (
              <DataGridRow<Package> key={rowId}>
                {(column) => <DataGridCell>{column.renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      ) : null}

      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ''}
        body={pending?.body}
        commandPreview={pending?.commandPreview}
        confirmLabel={pending?.confirmLabel}
        destructive={pending?.confirmLabel === 'Uninstall' || pending?.confirmLabel === 'Clear data' || pending?.confirmLabel === 'Force stop'}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        onConfirm={() => pending?.onConfirm()}
      />
    </div>
  );
}
