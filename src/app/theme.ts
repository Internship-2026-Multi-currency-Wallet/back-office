import { createTheme } from '@mui/material/styles';

/** Back-office theme (same for every client). */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#37474f' },
    secondary: { main: '#7b3f8c' },
  },
  shape: { borderRadius: 8 },
});
