import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2020',
  dts: true,
  sourcemap: true,
  // The component uses hooks: frameworks with server components need to know
  // it belongs on the client.
  banner: { js: "'use client';" },
});
