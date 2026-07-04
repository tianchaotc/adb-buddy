/**
 * Empty-state placeholder: icon + title + description + optional action.
 * Used when a list has no rows, no device is selected, etc.
 */
import type { ReactNode } from 'react';
import { Body1, Button, Subtitle1 } from '@fluentui/react-components';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      {icon ? (
        <div style={{ opacity: 0.6, fontSize: 40, lineHeight: 1 }}>{icon}</div>
      ) : null}
      <Subtitle1>{title}</Subtitle1>
      {description ? (
        <Body1 style={{ maxWidth: 480, opacity: 0.8 }}>{description}</Body1>
      ) : null}
      {actionLabel && onAction ? (
        <Button appearance="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
