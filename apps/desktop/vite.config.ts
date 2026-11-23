import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri loads the development server from a fixed local port (tauri.conf.json devUrl).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    // Native sources rebuild through Cargo; reloading the interface for them only loses state.
    watch: { ignored: ['**/src-tauri/**'] },
  },
  clearScreen: false,
  build: { target: 'safari16' },
});
