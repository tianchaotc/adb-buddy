/**
 * Top bar (48px): adb status dot, device dropdown, refresh, settings link,
 * global search.
 */
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Divider,
  Dropdown,
  Option,
  OptionGroup,
  Badge,
  Input,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowClockwiseRegular,
  SettingsRegular,
  SearchRegular,
  PlugConnectedRegular,
} from '@fluentui/react-icons';
import type { Device, DeviceState } from '@/bindings/types';
import { useDevicesStore } from '@/store/devices';
import { useSettingsStore } from '@/store/settings';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 12px',
    height: '48px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    background: tokens.colorNeutralBackground2,
    flexShrink: 0,
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusOk: {
    background: tokens.colorStatusSuccessForeground1,
  },
  statusErr: {
    background: tokens.colorStatusDangerForeground1,
  },
  statusWarn: {
    background: tokens.colorStatusWarningForeground1,
  },
  search: {
    minWidth: '180px',
    maxWidth: '260px',
    marginLeft: 'auto',
  },
});

function stateBadgeColor(state: DeviceState): string {
  switch (state) {
    case 'device':
      return tokens.colorStatusSuccessForeground1;
    case 'offline':
      return tokens.colorStatusDangerForeground1;
    case 'unauthorized':
      return tokens.colorStatusWarningForeground1;
    case 'recovery':
    case 'bootloader':
    case 'sideload':
      return tokens.colorPaletteBlueForeground2;
    default:
      return tokens.colorNeutralForeground3;
  }
}

export interface TopBarProps {
  onSearch?: (query: string) => void;
}

export function TopBar({ onSearch }: TopBarProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const devices = useDevicesStore((s) => s.devices);
  const selectedSerial = useDevicesStore((s) => s.selectedSerial);
  const loading = useDevicesStore((s) => s.loading);
  const refresh = useDevicesStore((s) => s.refresh);
  const select = useDevicesStore((s) => s.select);
  const adbConfig = useSettingsStore((s) => s.adbConfig);

  const adbOk = !!adbConfig?.path;
  const selectedDevice = devices.find((d) => d.serial === selectedSerial);

  return (
    <header className={styles.bar}>
      <span
        className={mergeClasses(
          styles.statusDot,
          adbOk ? styles.statusOk : styles.statusErr,
        )}
        title={adbOk ? `adb: ${adbConfig?.path}` : 'adb not found'}
      />
      <PlugConnectedRegular style={{ opacity: 0.7 }} />
      <Divider vertical style={{ height: 24 }} />
      <Dropdown
        placeholder="Select device"
        style={{ minWidth: 240 }}
        value={
          selectedDevice
            ? `${selectedDevice.model ?? selectedDevice.serial} — ${selectedDevice.serial}`
            : devices.length === 0
              ? 'No devices'
              : 'Select device'
        }
        onOptionSelect={(_, data) => {
          if (data.optionValue) select(data.optionValue);
        }}
        selectedOptions={selectedSerial ? [selectedSerial] : []}
      >
        {devices.length === 0 ? (
          <Option disabled text="No devices attached">No devices attached</Option>
        ) : (
          <OptionGroup label="Devices">
            {devices.map((d: Device) => (
              <Option
                key={d.serial}
                value={d.serial}
                text={`${d.model ?? d.serial} (${d.serial}) ${d.state}`}
              >
                <span
                  className={styles.statusDot}
                  style={{ background: stateBadgeColor(d.state), marginRight: 8 }}
                />
                {d.model ?? d.serial}
                <span style={{ opacity: 0.6, marginLeft: 8 }}>({d.serial})</span>
                <Badge
                  appearance="filled"
                  color={
                    d.state === 'device'
                      ? 'success'
                      : d.state === 'offline'
                        ? 'danger'
                        : d.state === 'unauthorized'
                          ? 'warning'
                          : 'brand'
                  }
                  style={{ marginLeft: 8 }}
                >
                  {d.state}
                </Badge>
              </Option>
            ))}
          </OptionGroup>
        )}
      </Dropdown>
      <Button
        icon={<ArrowClockwiseRegular />}
        appearance="subtle"
        onClick={() => void refresh()}
        disabled={loading}
        title="Refresh devices"
      >
        Refresh
      </Button>
      <Button
        icon={<SettingsRegular />}
        appearance="subtle"
        onClick={() => navigate('/settings')}
        title="Settings"
      >
        Settings
      </Button>
      <Input
        className={styles.search}
        placeholder="Search…"
        contentBefore={<SearchRegular />}
        onChange={(_, d) => onSearch?.(d.value)}
      />
    </header>
  );
}
