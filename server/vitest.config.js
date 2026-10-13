import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['tests/setup-env.js'],
    include: ['tests/**/*.test.js'],
    // Test files from the earlier file/DynamoDB store (safe to delete if still on disk).
    exclude: ['**/node_modules/**', 'tests/unit/api.test.js', 'tests/unit/matching-store.test.js'],
    // Database tests share one test database; run files one after another.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
