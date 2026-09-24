import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@components": path.resolve(currentDirectory, './src/libs/components'),
      "@libs": path.resolve(currentDirectory, './src/libs'),
      "@": path.resolve(currentDirectory, './src'),
    },
  },
});
