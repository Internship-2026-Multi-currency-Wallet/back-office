import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material';
import { type ReactNode, useId, useRef, useState } from 'react';
import type { GraphQLRequestError } from '../../graphql/client';
import type { StaffMember } from './staffApi';
import { type StaffAction, describeStaffActionError } from './staffErrors';

/** An RTK Query mutation result (`await trigger(...)`). */
export type StaffActionResult =
  | { data: StaffMember; error?: undefined }
  | { data?: undefined; error: Partial<GraphQLRequestError> };

export interface StaffActionDialogProps {
  open: boolean;
  onClose: () => void;
  onDone: (member: StaffMember) => void;
}

interface Props extends StaffActionDialogProps {
  action: StaffAction;
  title: string;
  confirmLabel: string;
  pendingLabel: string;
  confirmColor?: 'primary' | 'error';
  /** `false` keeps the confirm button disabled, e.g. while the selected role is the current one. */
  canConfirm?: boolean;
  onConfirm: () => Promise<StaffActionResult>;
  children: ReactNode;
}

/**
 * One confirmation step for a staff row action: the mutation runs only on Confirm, once per click (a double click
 * sends one request), and the dialog cannot be closed while it runs. A failure keeps the dialog open with our text
 * for the error code, so the admin can retry or cancel. Mount it with a new `key` per opening to start clean.
 */
export function StaffActionDialog({
  open,
  onClose,
  onDone,
  action,
  title,
  confirmLabel,
  pendingLabel,
  confirmColor = 'primary',
  canConfirm = true,
  onConfirm,
  children,
}: Props) {
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `pending` changes a render later: a double click must not send the mutation twice.
  const sending = useRef(false);

  const confirm = async () => {
    if (sending.current || !canConfirm) return;
    sending.current = true;
    setPending(true);
    setError(null);
    const result = await onConfirm();
    // After a success the dialog closes and is never reused (a new `key` per opening): it stays blocked, so no
    // further click during the closing transition can send the mutation again. Only a failure allows a retry.
    if (result.data) {
      onDone(result.data);
      return;
    }
    sending.current = false;
    setPending(false);
    setError(describeStaffActionError(action, result.error));
  };

  return (
    <Dialog
      open={open}
      onClose={() => !pending && onClose()}
      fullWidth
      maxWidth="xs"
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {children}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={() => void confirm()}
          disabled={pending || !canConfirm}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
