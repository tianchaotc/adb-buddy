/**
 * Vertical navigation rail (48px collapsed, expandable to show labels).
 * Icons only by default; a toggle button expands to show labels.
 */
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { makeStyles, mergeClasses, Tooltip, tokens } from '@fluentui/react-components';
import {
  BoardRegular,
  BoxRegular,
  ArrowDownloadRegular,
  DocumentTextRegular,
  WindowConsoleRegular,
  ImageRegular,
  SettingsRegular,
  HistoryRegular,
  ChevronRightRegular,
  ChevronLeftRegular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  rail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    background: tokens.colorNeutralBackground2,
    transitionDuration: '150ms',
    height: '100%',
    overflow: 'hidden',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '6px',
    textDecoration: 'none',
    color: tokens.colorNeutralForeground2,
    width: '100%',
    transitionDuration: '100ms',
    boxSizing: 'border-box',
    '&:hover': {
      background: tokens.colorNeutralBackground1Hover,
      color: tokens.colorNeutralForeground1,
    },
  },
  navItemActive: {
    background: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    '&:hover': {
      background: tokens.colorBrandBackground2Hover,
      color: tokens.colorBrandForeground1,
    },
  },
  icon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  label: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },
});

export interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const items: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <BoardRegular /> },
  { to: '/apps', label: 'Apps', icon: <BoxRegular /> },
  { to: '/install', label: 'Install', icon: <ArrowDownloadRegular /> },
  { to: '/logs', label: 'Logs', icon: <DocumentTextRegular /> },
  { to: '/shell', label: 'Shell', icon: <WindowConsoleRegular /> },
  { to: '/screenshot', label: 'Screenshot', icon: <ImageRegular /> },
  { to: '/history', label: 'History', icon: <HistoryRegular /> },
  { to: '/settings', label: 'Settings', icon: <SettingsRegular /> },
];

export function NavRail() {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);

  return (
    <nav
      className={styles.rail}
      style={{ width: expanded ? 168 : 48, padding: expanded ? '8px' : '8px 4px' }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: tokens.colorNeutralForeground2,
          padding: '8px',
          alignSelf: expanded ? 'flex-end' : 'center',
        }}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? <ChevronLeftRegular /> : <ChevronRightRegular />}
      </button>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: '100%',
          marginTop: 8,
        }}
      >
        {items.map((item) => {
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                mergeClasses(styles.navItem, isActive && styles.navItemActive)
              }
            >
              <span className={styles.icon}>{item.icon}</span>
              {expanded ? <span className={styles.label}>{item.label}</span> : null}
            </NavLink>
          );
          return expanded ? (
            link
          ) : (
            <Tooltip key={item.to} content={item.label} relationship="label">
              {link}
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
