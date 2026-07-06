/**
 * Settings page — adb path config, validate, theme, history retention, shell
 * favorites.
 */
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  Subtitle1,
  Body1,
  Input,
  Switch,
  RadioGroup,
  Radio,
  SpinButton,
  MessageBar,
  MessageBarBody,
  makeStyles,
  mergeClasses,
  tokens,
  Divider,
} from '@fluentui/react-components';
import {
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  DeleteRegular,
  StarRegular,
} from '@fluentui/react-icons';
import { useSettingsStore, resolveTheme, type Theme } from '@/store/settings';
import { getShellFavorites, removeShellFavorite } from '@/ipc/client';

const useStyles = makeStyles({
  card: {
    padding: '16px',
    maxWidth: '640px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    margin: '8px 0',
  },
  grow: {
    flex: 1,
  },
  section: {
    marginTop: '16px',
  },
});

export function SettingsPage() {
  const styles = useStyles();
  const {
    adbConfig,
    validation,
    theme,
    historyRetentionDays,
    loading,
    error,
    load,
    save,
    validate,
    setTheme,
    setRetentionDays,
  } = useSettingsStore();
  const [customMode, setCustomMode] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void getShellFavorites().then(setFavorites).catch(() => {});
  }, []);

  useEffect(() => {
    setCustomMode(adbConfig?.custom ?? false);
    setPathInput(adbConfig?.path ?? '');
  }, [adbConfig]);

  const removeFavorite = async (cmd: string) => {
    await removeShellFavorite(cmd);
    setFavorites((f) => f.filter((x) => x !== cmd));
  };

  return (
    <div>
      <Subtitle1 as="h1" style={{ marginBottom: 16 }}>Settings</Subtitle1>

      {error ? (
        <MessageBar intent="error" style={{ marginBottom: 12 }}>
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}

      <Card className={styles.card}>
        <CardHeader header={<Subtitle1>ADB configuration</Subtitle1>} />
        <div className={styles.row}>
          <Switch
            checked={customMode}
            onChange={(_, d) => setCustomMode(d.checked)}
            label={customMode ? 'Custom adb path' : 'Auto-detect from PATH'}
          />
        </div>
        {customMode ? (
          <div className={styles.row}>
            <Input
              className={styles.grow}
              placeholder="/path/to/adb"
              value={pathInput}
              onChange={(_, d) => setPathInput(d.value)}
            />
            <Button
              appearance="primary"
              disabled={loading || !pathInput}
              onClick={() => void save(pathInput)}
            >
              Save
            </Button>
            <Button
              appearance="subtle"
              onClick={() => void save(null)}
              title="Reset to auto-detect"
            >
              Reset to auto
            </Button>
          </div>
        ) : (
          <Body1 style={{ opacity: 0.7 }}>
            adb will be resolved from PATH. Current path:{' '}
            <code>{adbConfig?.path || '(not found)'}</code>
          </Body1>
        )}

        <Divider style={{ margin: '12px 0' }} />

        <div className={styles.row}>
          <Button onClick={() => void validate()} disabled={loading}>
            Validate adb
          </Button>
          {validation ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {validation.version ? (
                <CheckmarkCircleRegular style={{ color: tokens.colorStatusSuccessForeground1 }} />
              ) : (
                <ErrorCircleRegular style={{ color: tokens.colorStatusDangerForeground1 }} />
              )}
              <code style={{ fontSize: 12 }}>
                {validation.version_string || 'no version'}
              </code>
            </span>
          ) : null}
        </div>
      </Card>

      <Card className={mergeClasses(styles.card, styles.section)}>
        <CardHeader header={<Subtitle1>Appearance</Subtitle1>} />
        <RadioGroup
          value={theme}
          onChange={(_, d) => setTheme(d.value as Theme)}
          layout="horizontal"
        >
          <Radio value="system" label="System" />
          <Radio value="light" label="Light" />
          <Radio value="dark" label="Dark" />
        </RadioGroup>
        <Body1 style={{ opacity: 0.7, marginTop: 4 }}>
          Effective theme: {resolveTheme(theme)}
        </Body1>
      </Card>

      <Card className={mergeClasses(styles.card, styles.section)}>
        <CardHeader header={<Subtitle1>History retention</Subtitle1>} />
        <div className={styles.row}>
          <SpinButton
            value={historyRetentionDays}
            min={1}
            max={365}
            onChange={(_, d) => {
              if (typeof d.value === 'number') setRetentionDays(d.value);
            }}
          />
          <Body1 style={{ opacity: 0.7 }}>days</Body1>
        </div>
      </Card>

      <Card className={mergeClasses(styles.card, styles.section)}>
        <CardHeader header={<Subtitle1>Shell favorites</Subtitle1>} image={<StarRegular />} />
        {favorites.length === 0 ? (
          <Body1 style={{ opacity: 0.6 }}>No favorites yet. Add them from the Shell page.</Body1>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {favorites.map((cmd) => (
              <div key={cmd} className={styles.row}>
                <code className={styles.grow} style={{ fontSize: 12 }}>{cmd}</code>
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  onClick={() => void removeFavorite(cmd)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
