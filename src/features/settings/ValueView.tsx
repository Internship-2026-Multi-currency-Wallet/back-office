import { Box, Stack, type Theme, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

export const monoFont =
  '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace';

const token = {
  fontFamily: monoFont,
  fontSize: 12.5,
  lineHeight: 1.6,
  px: 0.75,
  borderRadius: 1,
  border: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
  whiteSpace: 'nowrap',
} as const;

export function ValueView({ value, muted = false }: { value: unknown; muted?: boolean }) {
  const tone = muted ? { color: 'text.secondary' } : { color: 'text.primary' };

  if (typeof value === 'boolean') {
    return (
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', ...tone }}>
        <Box
          component="span"
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: value ? 'secondary.main' : 'grey.400',
            ...(value && {
              boxShadow: (theme: Theme) => `0 0 0 3px ${alpha(theme.palette.secondary.main, 0.15)}`,
            }),
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {value ? 'On' : 'Off'}
        </Typography>
      </Stack>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
          empty list
        </Typography>
      );
    }
    return (
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5, ...tone }}>
        {value.map((item, index) => (
          <Box component="span" key={index} sx={token}>
            {String(item)}
          </Box>
        ))}
      </Stack>
    );
  }

  return (
    <Box component="span" sx={{ ...token, ...tone, display: 'inline-block' }}>
      {typeof value === 'string' ? value : JSON.stringify(value)}
    </Box>
  );
}
