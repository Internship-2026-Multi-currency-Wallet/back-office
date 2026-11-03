import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { type SettingChange, useSettingHistoryInfiniteQuery } from './settingsApi';
import { settingCopy } from './settingValue';
import { monoFont, ValueView } from './ValueView';

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

interface SettingHistoryDrawerProps {
  settingKey: string | undefined;
  onClose: () => void;
}

export function SettingHistoryDrawer({ settingKey, onClose }: SettingHistoryDrawerProps) {
  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSettingHistoryInfiniteQuery(settingKey);
  const changes = data?.pages.flat() ?? [];

  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 460 } } } }}
    >
      <Stack
        direction="row"
        sx={{ px: 3, py: 2.5, alignItems: 'flex-start', borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
            Change history
          </Typography>
          <Typography variant="h6" component="h2">
            {settingKey ? settingCopy(settingKey).name : 'All settings'}
          </Typography>
          {settingKey && (
            <Typography variant="caption" sx={{ fontFamily: monoFont, color: 'text.secondary' }}>
              {settingKey}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close history" sx={{ mt: -0.5 }}>
          ×
        </IconButton>
      </Stack>

      <Box sx={{ px: 3, py: 2, overflowY: 'auto' }}>
        {isLoading && <CircularProgress size={24} />}
        {error && <Alert severity="error">{error.message}</Alert>}
        {!isLoading && !error && changes.length === 0 && (
          <Typography sx={{ color: 'text.secondary' }}>
            No changes yet — the platform default has always applied.
          </Typography>
        )}

        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Changes">
          {changes.map((change, index) => (
            <ChangeEntry
              key={change.id}
              change={change}
              showKey={!settingKey}
              last={index === changes.length - 1}
            />
          ))}
        </Box>

        {hasNextPage && (
          <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} sx={{ mt: 1 }}>
            {isFetchingNextPage ? 'Loading…' : 'Load older changes'}
          </Button>
        )}
      </Box>
    </Drawer>
  );
}

function ChangeEntry({
  change,
  showKey,
  last,
}: {
  change: SettingChange;
  showKey: boolean;
  last: boolean;
}) {
  return (
    <Box
      component="li"
      sx={{
        position: 'relative',
        pl: 3,
        pb: last ? 0 : 3,
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 5,
          top: 14,
          bottom: 0,
          width: '1px',
          bgcolor: last ? 'transparent' : 'divider',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 4,
          width: 11,
          height: 11,
          borderRadius: '50%',
          border: 2,
          borderColor: 'secondary.main',
          bgcolor: 'background.paper',
        },
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        <Box component="time" dateTime={change.changedAt} sx={{ color: 'text.primary' }}>
          {dateTime.format(new Date(change.changedAt))}
        </Box>
        {' · '}staff #{change.changedBy}
      </Typography>
      {showKey && (
        <Typography variant="caption" sx={{ fontFamily: monoFont, color: 'text.secondary' }}>
          {change.key}
        </Typography>
      )}
      <Stack
        direction="row"
        useFlexGap
        sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
        data-testid="change-values"
      >
        <Box sx={{ textDecoration: 'line-through', textDecorationColor: 'rgba(0,0,0,0.3)' }}>
          <ValueView value={change.oldValue} muted />
        </Box>
        <Typography aria-label="changed to" sx={{ color: 'secondary.main', fontWeight: 700 }}>
          →
        </Typography>
        <ValueView value={change.newValue} />
      </Stack>
    </Box>
  );
}
