/**
 * Button that copies text to the clipboard and shows "Copied!" feedback.
 * Uses `navigator.clipboard.writeText`.
 */
import { useCallback, useState } from 'react';
import { Button } from '@fluentui/react-components';
import { CopyRegular, CheckmarkRegular } from '@fluentui/react-icons';

export interface CopyButtonProps {
  text: string;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  appearance?: 'subtle' | 'transparent' | 'outline' | 'primary';
}

export function CopyButton({
  text,
  label = 'Copy',
  disabled,
  size = 'small',
  appearance = 'subtle',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context). Fail silently.
    }
  }, [text]);

  return (
    <Button
      size={size}
      appearance={appearance}
      disabled={disabled || !text}
      onClick={onClick}
      icon={
        copied ? <CheckmarkRegular /> : <CopyRegular />
      }
    >
      {copied ? 'Copied!' : label}
    </Button>
  );
}
