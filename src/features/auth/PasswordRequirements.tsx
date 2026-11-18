import { List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import { PASSWORD_RULES } from './passwordRules';

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <List dense disablePadding aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <ListItem key={rule.label} disableGutters sx={{ py: 0 }}>
            <ListItemIcon sx={{ minWidth: 24, color: met ? 'success.main' : 'text.disabled' }}>
              {met ? '✓' : '•'}
            </ListItemIcon>
            <ListItemText
              primary={rule.label}
              slotProps={{ primary: { color: met ? 'success.main' : 'text.secondary' } }}
            />
          </ListItem>
        );
      })}
    </List>
  );
}
