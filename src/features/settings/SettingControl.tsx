import {
  Box,
  Chip,
  InputBase,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { type KeyboardEvent, useState } from 'react';
import type { StaffSetting } from './settingsApi';
import { settingCopy } from './settingValue';
import { monoFont } from './ValueView';

interface SettingControlProps {
  setting: StaffSetting;
  onChange: (value: unknown) => void;
}

export function SettingControl({ setting, onChange }: SettingControlProps) {
  const name = settingCopy(setting.key).name;

  switch (setting.type) {
    case 'BOOLEAN': {
      const on = setting.value === true;
      return (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Switch
            checked={on}
            onChange={(event) => onChange(event.target.checked)}
            color="secondary"
            slotProps={{ input: { 'aria-label': name } }}
          />
          <Box
            component="span"
            sx={{ fontWeight: 600, fontSize: 14, color: on ? 'text.primary' : 'text.secondary' }}
          >
            {on ? 'On' : 'Off'}
          </Box>
        </Stack>
      );
    }
    case 'ENUM':
      return (
        <ToggleButtonGroup
          exclusive
          size="small"
          color="secondary"
          value={setting.value}
          onChange={(_, next: string | null) => next !== null && onChange(next)}
          aria-label={name}
          sx={{ flexWrap: 'wrap' }}
        >
          {(setting.allowedValues ?? []).map((option) => (
            <ToggleButton
              key={option}
              value={option}
              sx={{
                fontFamily: monoFont,
                fontSize: 12.5,
                textTransform: 'none',
                px: 1.5,
                py: 0.5,
                color: 'text.secondary',
                '&.Mui-selected': { color: 'secondary.dark', fontWeight: 700 },
              }}
            >
              {option}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      );
    case 'STRING_LIST':
      return (
        <ListControl
          name={name}
          items={Array.isArray(setting.value) ? setting.value.map(String) : []}
          onChange={onChange}
        />
      );
  }
}

const chipSx = { fontFamily: monoFont, fontSize: 12.5, height: 28, borderRadius: 1.5 } as const;

function ListControl({
  name,
  items,
  onChange,
}: {
  name: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const item = draft?.trim() ?? '';
  const duplicate = items.includes(item);

  const commit = () => {
    if (item && !duplicate) onChange([...items, item]);
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setDraft(null);
    if (event.key === 'Enter' && !duplicate) commit();
  };

  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
      {items.map((entry, index) => (
        <Chip
          key={index}
          label={entry}
          size="small"
          variant="outlined"
          onDelete={() => onChange(items.filter((_, other) => other !== index))}
          sx={{
            ...chipSx,
            bgcolor: 'background.paper',
            height: 'auto',
            minHeight: 28,
            maxWidth: '100%',
            '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', py: 0.25 },
          }}
        />
      ))}
      {draft === null ? (
        <Chip
          label="+ add"
          size="small"
          onClick={() => setDraft('')}
          aria-label={`Add to ${name}`}
          sx={{
            ...chipSx,
            color: 'secondary.dark',
            bgcolor: 'transparent',
            border: 1,
            borderStyle: 'dashed',
            borderColor: 'secondary.light',
          }}
        />
      ) : (
        <Box sx={{ position: 'relative', pb: duplicate && item ? 1.5 : 0 }}>
          <InputBase
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            placeholder="item, Enter"
            inputProps={{ 'aria-label': `New item for ${name}`, size: 12 }}
            sx={{
              ...chipSx,
              px: 1,
              border: 1,
              borderColor: duplicate && item ? 'error.main' : 'secondary.main',
              bgcolor: 'background.paper',
            }}
          />
          {duplicate && item && (
            <Box
              component="span"
              role="alert"
              sx={{ position: 'absolute', top: '100%', left: 2, fontSize: 11, color: 'error.main' }}
            >
              already in the list
            </Box>
          )}
        </Box>
      )}
    </Stack>
  );
}
