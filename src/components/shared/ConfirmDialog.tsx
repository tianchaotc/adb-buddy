/**
 * Reusable confirmation dialog for destructive operations — see spec §2.5.
 *
 * Shows a title, body, an optional command preview (monospace), and
 * confirm/cancel buttons. When `destructive` is true, the confirm button uses
 * the danger appearance.
 */
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  DialogOpenChangeData,
} from '@fluentui/react-components';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  /** A command preview (e.g. the adb command to be run), shown in monospace. */
  commandPreview?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  commandPreview,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  const handleOpenChange = (_e: unknown, data: DialogOpenChangeData) => {
    onOpenChange?.(data.open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger disableButtonEnhancement>
        <span />
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            {body ? <p style={{ margin: 0 }}>{body}</p> : null}
            {commandPreview ? (
              <pre
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: 'var(--colorNeutralBackground3)',
                  borderRadius: 6,
                  fontFamily: 'var(--fontFamilyMonospace)',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {commandPreview}
              </pre>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button
              appearance="secondary"
              onClick={() => onOpenChange?.(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              appearance="primary"
              color={destructive ? 'danger' : 'brand'}
              onClick={() => {
                onConfirm();
                onOpenChange?.(false);
              }}
            >
              {confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
