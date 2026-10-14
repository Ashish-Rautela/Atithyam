// Tests use their own database (never the app's). Default matches docker-compose: `npm run db:up`.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://rip:rip@localhost:5432/rip_test';
process.env.WORKER_MODE = 'off';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.ENABLE_TRIPADVISOR = 'false';
// Existing tests cover the AWS behaviour (refreshes, neighbourhood collection); laptop mode is tested explicitly.
process.env.BACKGROUND_SCRAPING = 'true';
// Accounts are tested in tests/db/auth-billing.test.js; the other suites test the API itself, open.
process.env.AUTH_REQUIRED = 'false';
