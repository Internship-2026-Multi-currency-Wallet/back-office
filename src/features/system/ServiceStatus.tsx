import { Chip, Stack, Typography } from '@mui/material';
interface ServiceStatusProps {
  name: string;
  health?: { version: string; db: string; redis: string };
  /** Any error from the health query; only its presence matters here. */
  error?: unknown;
}

/** One line per backend: version and dependency status, or "unreachable". */
export function ServiceStatus({ name, health, error }: ServiceStatusProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} data-testid={`status-${name}`}>
      <Typography sx={{ minWidth: 140 }}>{name}</Typography>
      {health && (
        <Chip
          size="small"
          color={health.db === 'UP' && health.redis === 'UP' ? 'success' : 'warning'}
          label={`${health.version} · db ${health.db} · redis ${health.redis}`}
        />
      )}
      {error !== undefined && <Chip size="small" color="error" label="unreachable" />}
      {!health && error === undefined && <Chip size="small" label="…" />}
    </Stack>
  );
}
