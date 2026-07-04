/**
 * Main content panel — renders the routed feature content.
 */
import type { ReactNode } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  panel: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
    background: tokens.colorNeutralBackground1,
  },
});

export interface MainPanelProps {
  children: ReactNode;
}

export function MainPanel({ children }: MainPanelProps) {
  const styles = useStyles();
  return <main className={styles.panel}>{children}</main>;
}
