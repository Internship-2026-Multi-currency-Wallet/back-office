import { Alert, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { StaffStatus } from '../../gql/wallet-core/graphql';
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

/** All staff accounts of this client. The route requires `bo:staff` (`app/routes.tsx`). */
export function StaffPage() {
  const { data, isLoading, isFetching, error, refetch } = useStaffMembersQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Staff
      </Typography>
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
    </Stack>
  );
}
