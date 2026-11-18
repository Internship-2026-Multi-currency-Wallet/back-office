import { Alert, Button, Chip, Paper, Snackbar, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useState } from 'react';
import type { StaffStatus } from '../../gql/wallet-core/graphql';
import { RequirePermission } from '../permissions/RequirePermission';
import { InviteStaffDialog } from './InviteStaffDialog';
import { STAFF_MODIFY_PERMISSION } from './permissions';
import { type StaffMember, useStaffMembersQuery } from './staffApi';

const statusColor: Record<StaffStatus, 'success' | 'warning' | 'default'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  DEACTIVATED: 'default',
};

const columns: GridColDef<StaffMember>[] = [
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

export function StaffPage() {
  const { data, isLoading, isFetching, error, refetch } = useStaffMembersQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState(false);

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
          setInvited(true);
        }}
      />
      {/* Only that the account exists: wallet-core sends the email on its own and may fail to deliver it. */}
      <Snackbar
        open={invited}
        autoHideDuration={5000}
        onClose={(_, reason) => reason !== 'clickaway' && setInvited(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setInvited(false)}>
          Staff invited
        </Alert>
      </Snackbar>
    </Stack>
  );
}
