/**
 * Top-level app layout: TopBar + NavRail + MainPanel + CommandConsole.
 *
 * The NavRail sits on the left (fixed width), the main column stacks TopBar,
 * MainPanel, and CommandConsole vertically.
 */
import type { ReactNode } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { NavRail } from './NavRail';
import { TopBar } from './TopBar';
import { MainPanel } from './MainPanel';
import { CommandConsole } from './CommandConsole';

const useStyles = makeStyles({
  shell: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
});

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const styles = useStyles();
  return (
    <div className={styles.shell}>
      <NavRail />
      <div className={styles.column}>
        <TopBar />
        <MainPanel>{children}</MainPanel>
        <CommandConsole />
      </div>
    </div>
  );
}
