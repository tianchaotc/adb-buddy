/**
 * App routing — see spec §2.2.
 *
 * `/` redirects to `/dashboard` (or `/settings` if no devices). Routes match
 * the MVP modules. Rendered inside the `AppShell` layout.
 */
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { AppsPage } from '@/features/apps/AppsPage';
import { InstallPage } from '@/features/install/InstallPage';
import { FilesPage } from '@/features/files/FilesPage';
import { LogsPage } from '@/features/logs/LogsPage';
import { ShellPage } from '@/features/shell/ShellPage';
import { ScreenshotPage } from '@/features/screenshot/ScreenshotPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { useDevicesStore } from '@/store/devices';
import { useSettingsStore } from '@/store/settings';

export default function App() {
  const refresh = useDevicesStore((s) => s.refresh);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    void refresh();
    void loadSettings();
  }, [refresh, loadSettings]);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/install" element={<InstallPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/shell" element={<ShellPage />} />
        <Route path="/screenshot" element={<ScreenshotPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
