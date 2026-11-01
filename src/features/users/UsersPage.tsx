import { Alert, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { RequirePermission } from '../permissions/RequirePermission';
import { type DemoUser, demoUsers } from './demoUsers';

const kycColor = {
  approved: 'success',
  pending: 'warning',
  rejected: 'error',
  not_started: 'default',
} as const;

const columns: GridColDef<DemoUser>[] = [
  { field: 'id', headerName: 'ID', width: 80 },
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'email', headerName: 'Email', flex: 1.5 },
  {
    field: 'kycStatus',
    headerName: 'KYC',
    width: 140,
    renderCell: ({ value }) => (
      <Chip size="small" label={value} color={kycColor[value as DemoUser['kycStatus']]} />
    ),
  },
  { field: 'createdAt', headerName: 'Created', width: 130 },
];

/** Demo page: MUI X DataGrid with mock data, gated by `bo:users`. */
export function UsersPage() {
  return (
    <RequirePermission
      permission="bo:users"
      fallback={<Alert severity="warning">You need the bo:users permission to see users.</Alert>}
    >
      <Stack spacing={2}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" component="h1">
            Users
          </Typography>
          <RequirePermission permission="bo:users:modify">
            <Button variant="contained">Add user</Button>
          </RequirePermission>
        </Stack>
        <Alert severity="info">Demo data — the users API is a task.</Alert>
        <Paper>
          <DataGrid
            rows={demoUsers}
            columns={columns}
            autoHeight
            disableRowSelectionOnClick
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50]}
          />
        </Paper>
      </Stack>
    </RequirePermission>
  );
}
