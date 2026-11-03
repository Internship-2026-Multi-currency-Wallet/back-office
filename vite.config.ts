import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  // React + MUI + GraphQL clients make one ~180 kB (gzip) vendor bundle; fine for this app.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Tests run as a staff dev user against MSW mocks.
    env: { VITE_DEV_USER: '100:bo:users,bo:users:modify,bo:settings,bo:settings:modify' },
  },
});
