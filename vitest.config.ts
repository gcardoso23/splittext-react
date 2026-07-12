import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.{ts,tsx}'],
        },
      },
      {
        // Line breaking can only be tested where there is a layout engine.
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.{ts,tsx}'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});

export default config;
