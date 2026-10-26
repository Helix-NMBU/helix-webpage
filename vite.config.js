import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { localApiPlugin } from './scripts/local-api.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), localApiPlugin()],
    resolve: {
      alias: {
        "@components": path.resolve(currentDirectory, './src/libs/components'),
        "@libs": path.resolve(currentDirectory, './src/libs'),
        "@": path.resolve(currentDirectory, './src'),
      },
    },
  };
});
