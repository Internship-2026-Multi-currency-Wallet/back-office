import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  type Theme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useState } from 'react';
import { config } from '../../config-env';
import { RequirePermission } from '../permissions/RequirePermission';
import { useMeQuery } from '../system/systemApi';
import { SETTINGS_PERMISSIONS } from './permissions';
import { SettingControl } from './SettingControl';
import { SettingHistoryDrawer } from './SettingHistoryDrawer';
import {
  type StaffSetting,
  useResetSettingMutation,
  useStaffSettingsQuery,
  useUpdateSettingMutation,
} from './settingsApi';
import { sameValue, settingCopy, validateSettingValue } from './settingValue';
import { monoFont, ValueView } from './ValueView';

const DEFAULT = Symbol('default');

const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;

const quietButton = { px: 0.75, minWidth: 0, fontSize: 12.5, textTransform: 'none' } as const;

const tableSx = (theme: Theme) => {
  const rail = `inset 3px 0 0 ${theme.palette.secondary.main}`;
  return {
    '& td, & th': { borderColor: 'divider' },
    '& th': {
      bgcolor: 'grey.50',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: 'text.secondary',
    },
    '& td': { py: 2.25, verticalAlign: 'middle' },
    '& tbody tr:last-of-type td': { borderBottom: 0 },
    '& tbody tr:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) },
    '& .is-overridden td:first-of-type': { boxShadow: rail },
    [theme.breakpoints.down('md')]: {
      '& thead': { display: 'none' },
      '& tr': { display: 'block', borderBottom: 1, borderColor: 'divider' },
      '& tbody tr:last-of-type': { borderBottom: 0 },
      '& td': { display: 'block', border: 0, py: 1, px: 2 },
      '& td:first-of-type': { pt: 2 },
      '& td:last-of-type': { pb: 2, textAlign: 'left' },
      '& .is-overridden td:first-of-type': { boxShadow: 'none' },
      '& .is-overridden': { boxShadow: rail },
    },
  } as const;
};

interface Notice {
  severity: 'success' | 'error';
  message: string;
  undo?: () => void;
}

export function SettingsPage() {
  return (
    <RequirePermission permission={SETTINGS_PERMISSIONS} fallback={<NoAccess />}>
      <ClientSettings />
    </RequirePermission>
  );
}

function NoAccess() {
  const { error } = useMeQuery();
  if (error) {
    return (
      <Alert severity="error">
        Not signed in ({error.code ?? error.message}). Check VITE_DEV_USER and that wallet-core runs
        with DEV_AUTH=true.
      </Alert>
    );
  }
  return (
    <Alert severity="warning">You need the bo:settings:modify permission to manage settings.</Alert>
  );
}

function ClientSettings() {
  const { data: settings = [], isLoading, error } = useStaffSettingsQuery();
  const [updateSetting] = useUpdateSettingMutation();
  const [resetSetting] = useResetSettingMutation();
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [history, setHistory] = useState<string | undefined | null>(null);

  const apply = async (setting: StaffSetting, next: unknown, undoable = true) => {
    const { key } = setting;
    const name = settingCopy(key).name;
    if (next !== DEFAULT) {
      const problem = validateSettingValue(setting, next);
      if (problem) return setNotice({ severity: 'error', message: `${name}: ${problem}` });
    }
    setSaving((keys) => new Set(keys).add(key));
    const result =
      next === DEFAULT ? await resetSetting(key) : await updateSetting({ key, value: next });
    setSaving((keys) => {
      const rest = new Set(keys);
      rest.delete(key);
      return rest;
    });
    if ('error' in result) {
      return setNotice({ severity: 'error', message: result.error?.message ?? 'Not saved' });
    }
    const previous = setting.overridden ? setting.value : DEFAULT;
    setNotice({
      severity: 'success',
      message: next === DEFAULT ? `${name} is back to default` : `${name} saved`,
      undo: undoable ? () => apply({ ...setting, ...result.data }, previous, false) : undefined,
    });
  };

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

      {!isLoading && !error && <OverrideMeter settings={settings} />}
      {error && <Alert severity="error">Could not load settings: {error.message}</Alert>}

      {isLoading && <LinearProgress color="secondary" aria-label="Loading settings" />}
      {!isLoading && !error && (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table sx={tableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Setting</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>
                  <Box component="span" sx={srOnly}>
                    History
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {settings.map((row) => {
                const name = settingCopy(row.key).name;
                return (
                  <TableRow key={row.key} className={row.overridden ? 'is-overridden' : undefined}>
                    <TableCell>
                      <SettingName setting={row} />
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.75}>
                        <SettingControl
                          setting={row}
                          disabled={saving.has(row.key)}
                          onChange={(value) => apply(row, value)}
                        />
                        {row.overridden && !sameValue(row.value, row.defaultValue) && (
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              default
                            </Typography>
                            <ValueView value={row.defaultValue} muted />
                          </Stack>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25} sx={{ alignItems: 'flex-start' }}>
                        <SourceMark overridden={row.overridden} />
                        {row.overridden && (
                          <Button
                            size="small"
                            color="inherit"
                            disabled={saving.has(row.key)}
                            onClick={() => apply(row, DEFAULT)}
                            aria-label={`Reset to default: ${name}`}
                            sx={{ ...quietButton, color: 'text.secondary', ml: -0.75 }}
                          >
                            ↺ reset to default
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() => setHistory(row.key)}
                        aria-label={`History of ${name}`}
                        sx={{ ...quietButton, fontWeight: 600 }}
                      >
                        History
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {history !== null && (
        <SettingHistoryDrawer settingKey={history} onClose={() => setHistory(null)} />
      )}

      <Snackbar
        open={notice !== null}
        autoHideDuration={notice?.severity === 'error' ? 8000 : 5000}
        onClose={(_, reason) => reason !== 'clickaway' && setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {notice ? (
          <Alert
            severity={notice.severity}
            variant="filled"
            onClose={() => setNotice(null)}
            action={
              notice.undo && (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    notice.undo?.();
                    setNotice(null);
                  }}
                >
                  Undo
                </Button>
              )
            }
            sx={{
              minWidth: 320,
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
      <Typography variant="caption" sx={{ fontFamily: monoFont, color: 'text.secondary' }}>
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
