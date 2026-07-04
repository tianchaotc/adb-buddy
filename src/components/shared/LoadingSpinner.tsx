/**
 * Centered spinner with an optional label. Used for page-level loading states.
 */
import { Spinner } from '@fluentui/react-components';

export interface LoadingSpinnerProps {
  label?: string;
  size?: 'extra-tiny' | 'tiny' | 'extra-small' | 'small' | 'medium' | 'large' | 'extra-large' | 'huge';
}

export function LoadingSpinner({ label = 'Loading…', size = 'medium' }: LoadingSpinnerProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '48px 16px',
        width: '100%',
      }}
    >
      <Spinner size={size} label={label} />
    </div>
  );
}
