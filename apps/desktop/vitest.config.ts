import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'src-tauri/**'],
      // A zone behind UTC exposes accidental UTC/local date drift in every test run.
      env: { TZ: 'America/Los_Angeles' },
      restoreMocks: true,
      unstubGlobals: true,
    },
  }),
);
