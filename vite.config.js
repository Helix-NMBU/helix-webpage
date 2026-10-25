import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, currentDirectory, '');
  const proxy = {};
  if (mode !== 'member-local' && env.NEON_AUTH_BASE_URL) {
    const target = new URL(env.NEON_AUTH_BASE_URL);
    const basePath = target.pathname.replace(/\/$/, '');
    proxy['/api/auth'] = {
      target: target.origin,
      changeOrigin: true,
      rewrite: (requestPath) => requestPath.replace(/^\/api\/auth/, basePath),
    };
  }
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@components": path.resolve(currentDirectory, './src/libs/components'),
        "@libs": path.resolve(currentDirectory, './src/libs'),
        "@": path.resolve(currentDirectory, './src'),
      },
    },
    server: Object.keys(proxy).length ? { proxy } : undefined,
  };
});
