/**
 * Bottom command console panel.
 *
 * Shows the last executed command + stdout/stderr/exit/duration + copy buttons.
 * Collapsible/expandable.
 */
import { useState } from 'react';
import {
  Badge,
  Button,
  makeStyles,
  mergeClasses,
  tokens,
  ToggleButton,
} from '@fluentui/react-components';
import {
  ChevronDownRegular,
  ChevronUpRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { useConsoleStore } from '@/store/console';
import { CopyButton } from '@/components/shared/CopyButton';
import { formatDuration } from '@/lib/format';

const useStyles = makeStyles({
  console: {
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    background: tokens.colorNeutralBackground2,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  command: {
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    opacity: 0.9,
  },
  body: {
    padding: '8px 12px',
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  outputBlock: {
    margin: '4px 0',
    opacity: 0.85,
  },
  stderr: {
    color: tokens.colorStatusDangerForeground1,
  },
  empty: {
    padding: '12px',
    opacity: 0.6,
    fontSize: '12px',
  },
});

export function CommandConsole() {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const lastCommand = useConsoleStore((s) => s.lastCommand);
  const clear = useConsoleStore((s) => s.clear);

  return (
    <section
      className={styles.console}
      style={{ height: expanded ? 280 : 44 }}
    >
      <div className={styles.header}>
        <ToggleButton
          size="small"
          appearance="subtle"
          checked={expanded}
          icon={
            expanded ? <ChevronDownRegular /> : <ChevronUpRegular />
          }
          onClick={() => setExpanded((e) => !e)}
          title={expanded ? 'Collapse' : 'Expand'}
        />
        {lastCommand ? (
          <>
            <span className={styles.command}>$ {lastCommand.command}</span>
            <Badge
              appearance="filled"
              color={lastCommand.exitCode === 0 ? 'success' : 'danger'}
            >
              exit {lastCommand.exitCode ?? '?'}
            </Badge>
            <Badge appearance="outline">{formatDuration(lastCommand.durationMs)}</Badge>
            <CopyButton text={lastCommand.command} label="Copy cmd" />
            <CopyButton text={lastCommand.stdout} label="Copy out" />
            <Button
              icon={<DeleteRegular />}
              appearance="subtle"
              size="small"
              onClick={clear}
              title="Clear"
            />
          </>
        ) : (
          <span className={styles.empty}>No commands run yet.</span>
        )}
      </div>
      {expanded && lastCommand ? (
        <div className={styles.body}>
          {lastCommand.stdout ? (
            <div className={styles.outputBlock}>
              <strong>stdout:</strong>
              {'\n'}
              {lastCommand.stdout}
            </div>
          ) : null}
          {lastCommand.stderr ? (
            <div className={mergeClasses(styles.outputBlock, styles.stderr)}>
              <strong>stderr:</strong>
              {'\n'}
              {lastCommand.stderr}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
