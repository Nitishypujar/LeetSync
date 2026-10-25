import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { preserveSymlinks: true },
  server: { strictPort: true },
  // Source maps make the full original dashboard source publicly retrievable.
  // Keep production artifacts free of downloadable source maps.
  build: { sourcemap: false },
});
