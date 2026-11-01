import { Alert, Card, CardContent, Stack, Typography } from '@mui/material';
import { ServiceStatus } from '../features/system/ServiceStatus';
import {
  useMeQuery,
  useRatesServiceHealthQuery,
  useTreasuryServiceHealthQuery,
  useWalletCoreHealthQuery,
} from '../features/system/systemApi';

export function HomePage() {
  const health = useWalletCoreHealthQuery();
  const me = useMeQuery();
  const rates = useRatesServiceHealthQuery();
  const treasury = useTreasuryServiceHealthQuery();

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Back-office
      </Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            {health.data && (
              <Typography data-testid="health">
                Connected to wallet-core: {health.data.service} {health.data.version} (client{' '}
                {health.data.client}, db {health.data.db}, redis {health.data.redis})
              </Typography>
            )}
            {health.isLoading && <Typography>Connecting to wallet-core…</Typography>}
            {health.error && (
              <Alert severity="error">wallet-core is not reachable: {health.error.message}</Alert>
            )}

            {me.data && (
              <Typography data-testid="me">
                Dev user: {me.data.id} (permissions: {me.data.permissions.join(', ') || 'none'})
              </Typography>
            )}
            {me.error && (
              <Alert severity="info">
                Not signed in ({me.error.code ?? me.error.message}). Set VITE_DEV_USER, e.g.{' '}
                <code>100:bo:users</code>.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" component="h2">
              Services
            </Typography>
            <ServiceStatus name="wallet-core" health={health.data} error={health.error} />
            <ServiceStatus name="rates-service" health={rates.data} error={rates.error} />
            <ServiceStatus name="treasury-service" health={treasury.data} error={treasury.error} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
