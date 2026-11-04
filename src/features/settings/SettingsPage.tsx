import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
  type Theme,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useCallback, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { config } from '../../config-env';
import { RequirePermission } from '../permissions/RequirePermission';
import { usePermissions } from '../permissions/usePermissions';
import { useMeQuery } from '../system/systemApi';
import { SETTINGS_PERMISSIONS } from './permissions';
import { SettingControl } from './SettingControl';
import { SettingHistoryDrawer } from './SettingHistoryDrawer';
import { type StaffSetting, useStaffSettingsQuery } from './settingsApi';
import {
  type DisplayedSetting,
  displayedSettings,
  noticeClosed,
  saveSetting,
  type SettingState,
  showSettingNotice,
  undoSetting,
} from './settingWrites';
import { sameValue, settingCopy, validateSettingValue } from './settingValue';
import { monoFont, ValueView } from './ValueView';

const FRESH = {
  refetchOnMountOrArgChange: true,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  pollingInterval: 30_000,
  skipPollingIfUnfocused: true,
} as const;

const quietButton = { px: 0.75, minWidth: 0, fontSize: 12.5, textTransform: 'none' } as const;

const gridSx = (compact: boolean) => (theme: Theme) => ({
  border: 0,
  '& .MuiDataGrid-cell': { py: compact ? 1.5 : 2, display: 'flex', alignItems: 'center' },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within':
    { outline: 'none' },
  '& .MuiDataGrid-columnHeader': { bgcolor: 'grey.50' },
  '& .MuiDataGrid-columnHeaderTitle': {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'text.secondary',
  },
  '& .MuiDataGrid-columnSeparator': { display: 'none' },
  '& .MuiDataGrid-row:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) },
  '& .is-overridden': { boxShadow: `inset 3px 0 0 ${theme.palette.secondary.main}` },
  ...(compact && { '& .MuiDataGrid-columnHeaders': { display: 'none' } }),
});

type ChangeSetting = (setting: StaffSetting, next: SettingState) => void;

function settingColumns(
  compact: boolean,
  onChange: ChangeSetting,
  onHistory: (key: string) => void,
): GridColDef<DisplayedSetting>[] {
  const fixed = { sortable: false, disableColumnMenu: true, resizable: false } as const;
  if (compact) {
    return [
      {
        ...fixed,
        field: 'key',
        headerName: 'Setting',
        flex: 1,
        renderCell: ({ row }) => (
          <Stack spacing={1.5} sx={{ minWidth: 0, width: '100%', alignItems: 'flex-start' }}>
            <SettingName setting={row} />
            <ValueCell setting={row} onChange={onChange} />
            <SourceCell setting={row} onChange={onChange} />
            <HistoryButton setting={row} onHistory={onHistory} />
          </Stack>
        ),
      },
    ];
  }
  return [
    {
      ...fixed,
      field: 'key',
      headerName: 'Setting',
      flex: 1.5,
      minWidth: 260,
      renderCell: ({ row }) => <SettingName setting={row} />,
    },
    {
      ...fixed,
      field: 'value',
      headerName: 'Value',
      flex: 1.4,
      minWidth: 280,
      renderCell: ({ row }) => <ValueCell setting={row} onChange={onChange} />,
    },
    {
      ...fixed,
      field: 'overridden',
      headerName: 'Source',
      width: 180,
      renderCell: ({ row }) => <SourceCell setting={row} onChange={onChange} />,
    },
    {
      ...fixed,
      field: 'history',
      headerName: 'History',
      width: 110,
      align: 'right',
      headerAlign: 'right',
      renderCell: ({ row }) => <HistoryButton setting={row} onHistory={onHistory} />,
    },
  ];
}

export function SettingsPage() {
  return (
    <RequirePermission permission={SETTINGS_PERMISSIONS} fallback={<NoAccess />}>
      <ClientSettings />
    </RequirePermission>
  );
}

function NoAccess() {
  const { error, refetch, isFetching } = useMeQuery();
  const { permissions } = usePermissions();
  const missing = SETTINGS_PERMISSIONS.filter((permission) => !permissions.includes(permission));
  if (error?.code === 'UNAUTHENTICATED') {
    return (
      <Alert severity="error">
        Not signed in (UNAUTHENTICATED). Check VITE_DEV_USER and that wallet-core runs with
        DEV_AUTH=true.
      </Alert>
    );
  }
  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()} disabled={isFetching}>
            Retry
          </Button>
        }
      >
        Could not load your profile: {error.message}
      </Alert>
    );
  }
  return (
    <Alert severity="warning">
      You need the {missing.join(' and ')} {missing.length > 1 ? 'permissions' : 'permission'} to
      manage settings.
    </Alert>
  );
}

function ClientSettings() {
  const { data, isLoading, isFetching, error, refetch } = useStaffSettingsQuery(undefined, FRESH);
  const writes = useAppSelector((state) => state.settingWrites);
  const dispatch = useAppDispatch();
  const settings = useMemo(() => (data ? displayedSettings(data, writes) : []), [data, writes]);
  const [history, setHistory] = useState<string | undefined | null>(null);
  const { notice } = writes;
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));

  const change = useCallback<ChangeSetting>(
    (setting, next) => {
      if (next.overridden) {
        const problem = validateSettingValue(setting, next.value);
        if (problem) {
          const message = `${settingCopy(setting.key).name}: ${problem}`;
          dispatch(showSettingNotice({ key: setting.key, severity: 'error', message }));
          return;
        }
      }
      void dispatch(saveSetting(setting.key, next));
    },
    [dispatch],
  );
  const columns = useMemo(() => settingColumns(compact, change, setHistory), [compact, change]);

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-end' } }}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{ color: 'text.secondary', letterSpacing: 2, lineHeight: 2 }}
          >
            Client configuration
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline' }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>
              Settings
            </Typography>
            <Box
              component="span"
              sx={{
                fontFamily: monoFont,
                fontSize: 13,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
              }}
            >
              {config.client}
            </Box>
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            Every change applies to this client&apos;s apps at once — no redeploy.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => setHistory(undefined)}>
          All changes
        </Button>
      </Stack>

      {data && <OverrideMeter settings={settings} />}
      {error && (
        <Alert
          severity={data ? 'warning' : 'error'}
          action={
            <Button color="inherit" size="small" onClick={() => refetch()} disabled={isFetching}>
              Retry
            </Button>
          }
        >
          {data ? 'Could not refresh settings' : 'Could not load settings'}: {error.message}
        </Alert>
      )}

      {(data || isLoading) && (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <DataGrid
            rows={settings}
            columns={columns}
            getRowId={(row) => row.key}
            loading={isLoading}
            autoHeight
            hideFooter
            columnHeaderHeight={compact ? 0 : 56}
            getRowHeight={() => 'auto'}
            getRowClassName={({ row }) => (row.overridden ? 'is-overridden' : '')}
            disableRowSelectionOnClick
            disableColumnResize
            onCellKeyDown={(_, event) => {
              if (event.target !== event.currentTarget) event.defaultMuiPrevented = true;
            }}
            aria-label="Client settings"
            sx={gridSx(compact)}
          />
        </Paper>
      )}

      {history !== null && (
        <SettingHistoryDrawer settingKey={history} onClose={() => setHistory(null)} />
      )}

      <Snackbar
        key={notice?.id}
        open={notice !== null}
        autoHideDuration={notice?.severity === 'error' ? 8000 : 5000}
        onClose={(_, reason) =>
          reason !== 'clickaway' && notice && dispatch(noticeClosed(notice.id))
        }
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {notice ? (
          <Alert
            severity={notice.severity}
            variant="filled"
            onClose={() => dispatch(noticeClosed(notice.id))}
            action={
              notice.undo && (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    dispatch(noticeClosed(notice.id));
                    if (notice.undo) void dispatch(undoSetting(notice.key, notice.undo));
                  }}
                >
                  Undo
                </Button>
              )
            }
            sx={{
              minWidth: { sm: 320 },
              alignItems: 'center',
              ...(notice.severity === 'success' && {
                bgcolor: 'primary.main',
                '& .MuiAlert-icon': { color: 'secondary.light' },
              }),
            }}
          >
            {notice.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}

function ValueCell({ setting, onChange }: { setting: DisplayedSetting; onChange: ChangeSetting }) {
  return (
    <Stack spacing={0.75} sx={{ minWidth: 0, maxWidth: '100%' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <SettingControl
          setting={setting}
          onChange={(value) => onChange(setting, { value, overridden: true })}
        />
        {setting.saving && (
          <CircularProgress
            size={16}
            color="secondary"
            aria-label={`Saving ${settingCopy(setting.key).name}`}
          />
        )}
      </Stack>
      {setting.overridden && !sameValue(setting.value, setting.defaultValue) && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            default
          </Typography>
          <ValueView value={setting.defaultValue} muted />
        </Stack>
      )}
    </Stack>
  );
}

function SourceCell({ setting, onChange }: { setting: DisplayedSetting; onChange: ChangeSetting }) {
  return (
    <Stack spacing={0.25} sx={{ alignItems: 'flex-start' }}>
      <SourceMark overridden={setting.overridden} />
      {setting.overridden && (
        <Button
          size="small"
          color="inherit"
          onClick={() => onChange(setting, { value: setting.defaultValue, overridden: false })}
          aria-label={`Reset to default: ${settingCopy(setting.key).name}`}
          sx={{ ...quietButton, color: 'text.secondary', ml: -0.75 }}
        >
          ↺ reset to default
        </Button>
      )}
    </Stack>
  );
}

function HistoryButton({
  setting,
  onHistory,
}: {
  setting: StaffSetting;
  onHistory: (key: string) => void;
}) {
  return (
    <Button
      size="small"
      onClick={() => onHistory(setting.key)}
      aria-label={`History of ${settingCopy(setting.key).name}`}
      sx={{ ...quietButton, fontWeight: 600, ml: -0.75 }}
    >
      History
    </Button>
  );
}

function OverrideMeter({ settings }: { settings: StaffSetting[] }) {
  const overridden = settings.filter((setting) => setting.overridden).length;
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <Stack direction="row" spacing={0.5} aria-hidden>
        {settings.map((setting) => (
          <Tooltip key={setting.key} title={setting.key}>
            <Box
              sx={{
                width: 22,
                height: 8,
                borderRadius: 0.5,
                bgcolor: setting.overridden ? 'secondary.main' : 'grey.300',
                transition: 'background-color 200ms',
              }}
            />
          </Tooltip>
        ))}
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="settings-summary">
        <Box component="strong" sx={{ color: 'text.primary' }}>
          {overridden}
        </Box>{' '}
        of {settings.length} settings overridden for this client
      </Typography>
    </Stack>
  );
}

function SourceMark({ overridden }: { overridden: boolean }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: overridden ? 'secondary.main' : 'transparent',
          border: 1.5,
          borderColor: overridden ? 'secondary.main' : 'grey.400',
          ...(overridden && {
            boxShadow: (theme: Theme) => `0 0 0 3px ${alpha(theme.palette.secondary.main, 0.15)}`,
          }),
        }}
      />
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, color: overridden ? 'secondary.dark' : 'text.secondary' }}
      >
        {overridden ? 'Overridden' : 'Default'}
      </Typography>
    </Stack>
  );
}

function SettingName({ setting }: { setting: StaffSetting }) {
  const { name, description } = settingCopy(setting.key);
  const dot = setting.key.indexOf('.');
  return (
    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{name}</Typography>
        {setting.public && (
          <Tooltip title="The client's wallet app receives this setting">
            <Box
              component="span"
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: 'secondary.dark',
                border: 1,
                borderColor: 'secondary.light',
                borderRadius: 0.75,
                px: 0.5,
                lineHeight: 1.6,
              }}
            >
              in app
            </Box>
          </Tooltip>
        )}
      </Stack>
      <Typography
        variant="caption"
        sx={{ fontFamily: monoFont, color: 'text.secondary', overflowWrap: 'anywhere' }}
      >
        {setting.key.slice(0, dot + 1)}
        <Box component="span" sx={{ color: 'text.primary' }}>
          {setting.key.slice(dot + 1)}
        </Box>
      </Typography>
      {description && (
        <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'normal', pt: 0.5 }}>
          {description}
        </Typography>
      )}
    </Stack>
  );
}
