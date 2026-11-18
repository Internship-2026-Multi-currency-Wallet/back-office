import {
  Alert,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  SvgIcon,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMemo, useState } from 'react';
import { useAppSelector } from '../../app/store';
import type { StaffStatus } from '../../gql/wallet-core/graphql';
import { selectStaff } from '../auth/authSlice';
import { useLogout } from '../auth/useLogout';
import { RequirePermission } from '../permissions/RequirePermission';
import { hasPermissions, usePermissions } from '../permissions/usePermissions';
import { ChangeRoleDialog } from './ChangeRoleDialog';
import { DeactivateStaffDialog } from './DeactivateStaffDialog';
import { InviteStaffDialog } from './InviteStaffDialog';
import { ResendInvitationDialog } from './ResendInvitationDialog';
import { STAFF_MODIFY_PERMISSION } from './permissions';
import { ROLE_LABELS } from './roles';
import { type StaffMember, useStaffMembersQuery } from './staffApi';
import type { StaffAction } from './staffErrors';

const statusColor: Record<StaffStatus, 'success' | 'warning' | 'default'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  DEACTIVATED: 'default',
};

const baseColumns: GridColDef<StaffMember>[] = [
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
  { field: 'role', headerName: 'Role', width: 140 },
  {
    field: 'status',
    headerName: 'Status',
    width: 140,
    renderCell: ({ row }) => (
      <Chip size="small" label={row.status} color={statusColor[row.status]} />
    ),
  },
  {
    field: 'createdAt',
    headerName: 'Created',
    type: 'dateTime',
    width: 200,
    valueGetter: (value: string) => new Date(value),
  },
];

/**
 * These menu restrictions are UX-only because wallet-core remains authoritative for status, self-action, and
 * last-admin checks.
 */
function actionsFor(member: StaffMember, selfId: string | undefined): StaffAction[] {
  if (member.status === 'DEACTIVATED') return [];
  return [
    ...(member.status === 'INVITED' ? (['resend'] as const) : []),
    'changeRole',
    ...(member.id === selfId ? [] : (['deactivate'] as const)),
  ];
}

const ACTION_LABELS: Record<StaffAction, string> = {
  resend: 'Resend invitation',
  changeRole: 'Change role',
  deactivate: 'Deactivate',
};

function MoreIcon() {
  return (
    <SvgIcon fontSize="small">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2" />
    </SvgIcon>
  );
}

interface RowActionsProps {
  member: StaffMember;
  actions: StaffAction[];
  onSelect: (kind: StaffAction, member: StaffMember) => void;
}

function RowActions({ member, actions, onSelect }: RowActionsProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (actions.length === 0) return null;
  return (
    <>
      <IconButton
        size="small"
        aria-label={`Actions for ${member.email}`}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {actions.map((kind) => (
          <MenuItem
            key={kind}
            onClick={() => {
              setAnchor(null);
              onSelect(kind, member);
            }}
            sx={kind === 'deactivate' ? { color: 'error.main' } : undefined}
          >
            {ACTION_LABELS[kind]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

interface OpenAction {
  kind: StaffAction;
  member: StaffMember;
  /** A new dialog instance per opening, so no state of the previous one remains. */
  key: number;
}

export function StaffPage() {
  const { data, isLoading, isFetching, error, refetch } = useStaffMembersQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const { permissions } = usePermissions();
  const canModify = hasPermissions(permissions, STAFF_MODIFY_PERMISSION);
  // Only with a staff session; in dev mode wallet-core alone knows who "self" is.
  const selfId = useAppSelector(selectStaff)?.id;
  const logout = useLogout();

  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Kept after closing, so the dialog keeps its content during the closing transition.
  const [action, setAction] = useState<OpenAction | null>(null);
  const [open, setOpen] = useState(false);

  const columns = useMemo<GridColDef<StaffMember>[]>(() => {
    if (!canModify) return baseColumns;
    const select = (kind: StaffAction, member: StaffMember) => {
      setAction((current) => ({ kind, member, key: (current?.key ?? 0) + 1 }));
      setOpen(true);
    };
    return [
      ...baseColumns,
      {
        field: 'actions',
        headerName: 'Actions',
        width: 90,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: ({ row }) => (
          <RowActions member={row} actions={actionsFor(row, selfId)} onSelect={select} />
        ),
      },
    ];
  }, [canModify, selfId]);

  const close = () => setOpen(false);
  const done = (message: string) => {
    setOpen(false);
    setNotice(message);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h4" component="h1">
          Staff
        </Typography>
        <RequirePermission permission={STAFF_MODIFY_PERMISSION}>
          <Button variant="contained" onClick={() => setInviting(true)}>
            Invite staff
          </Button>
        </RequirePermission>
      </Stack>
      {error && (
        <Alert
          severity={data ? 'warning' : 'error'}
          action={
            <Button color="inherit" size="small" onClick={() => refetch()} disabled={isFetching}>
              Retry
            </Button>
          }
        >
          {data ? 'Could not refresh staff' : 'Could not load staff'}: {error.message}
        </Alert>
      )}
      {(data || isLoading) && (
        <Paper>
          <DataGrid
            rows={data ?? []}
            columns={columns}
            loading={isLoading}
            slotProps={{ loadingOverlay: { noRowsVariant: 'linear-progress' } }}
            autoHeight
            disableRowSelectionOnClick
            localeText={{ noRowsLabel: 'No staff members yet' }}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50]}
            aria-label="Staff members"
          />
        </Paper>
      )}
      <InviteStaffDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onInvited={() => {
          setInviting(false);
          // Only that the account exists: wallet-core sends the email on its own and may fail to deliver it.
          setNotice('Staff invited');
        }}
      />
      {action?.kind === 'resend' && (
        <ResendInvitationDialog
          key={action.key}
          member={action.member}
          open={open}
          onClose={close}
          // Not "email sent": wallet-core sends it after the commit and a delivery failure does not fail the call.
          onDone={(member) => done(`New invitation link issued for ${member.email}`)}
        />
      )}
      {action?.kind === 'changeRole' && (
        <ChangeRoleDialog
          key={action.key}
          member={action.member}
          isSelf={action.member.id === selfId}
          open={open}
          onClose={close}
          onDone={(member) => {
            // wallet-core ended our own sessions: the stored permissions are outdated, so log in again.
            if (member.id === selfId) {
              logout({
                notice: `Your role was changed to ${ROLE_LABELS[member.role]}. Log in again.`,
              });
              return;
            }
            done(`Role of ${member.email} changed to ${ROLE_LABELS[member.role]}`);
          }}
        />
      )}
      {action?.kind === 'deactivate' && (
        <DeactivateStaffDialog
          key={action.key}
          member={action.member}
          open={open}
          onClose={close}
          onDone={(member) => done(`${member.email} deactivated`)}
        />
      )}
      <Snackbar
        open={notice !== null}
        autoHideDuration={5000}
        onClose={(_, reason) => reason !== 'clickaway' && setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
