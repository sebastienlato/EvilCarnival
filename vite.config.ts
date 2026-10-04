import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // three's core alone is ~700 KB minified
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // vendor code changes far less often than the ride: keep it in long-cached chunks
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 3 },
            { name: 'fx', test: /node_modules[\\/]postprocessing[\\/]/, priority: 2 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
