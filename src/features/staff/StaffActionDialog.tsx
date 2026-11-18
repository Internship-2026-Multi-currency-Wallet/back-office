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
  canConfirm?: boolean;
  onConfirm: () => Promise<StaffActionResult>;
  children: ReactNode;
}

/**
 * Mount a new keyed instance on each opening because successful submissions intentionally leave this instance
 * blocked.
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
    // Stay blocked after a success, so a click during the closing transition cannot send it again.
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
