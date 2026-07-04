/**
 * Error banner that renders an `AdbError` with the human-readable output of
 * `explainError()`. Used on feature pages when an IPC call fails.
 */
import { useCallback } from 'react';
import { MessageBar, MessageBarBody, MessageBarTitle, MessageBarActions } from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import type { AdbError } from '@/bindings/types';
import { explainError } from '@/lib/errors';

export interface ErrorBannerProps {
  error: AdbError | null;
  onDismiss?: () => void;
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  const handleDismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  if (!error) return null;
  const explained = explainError(error);
  return (
    <MessageBar intent="error">
      <MessageBarBody>
        <MessageBarTitle>{explained.title}</MessageBarTitle>
        {explained.fix}
        {explained.detail ? (
          <pre
            style={{
              margin: '8px 0 0',
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--fontFamilyMonospace)',
              fontSize: 12,
              opacity: 0.85,
            }}
          >
            {explained.detail}
          </pre>
        ) : null}
      </MessageBarBody>
      {onDismiss ? (
        <MessageBarActions>
          <DismissRegular onClick={handleDismiss} />
        </MessageBarActions>
      ) : null}
    </MessageBar>
  );
}
