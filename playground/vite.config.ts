import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

// The playground imports the library straight from `src`, so edits show up
// without a build.
const config: UserConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: { 'splittext-react': new URL('../src/index.ts', import.meta.url).pathname },
  },
});

export default config;
