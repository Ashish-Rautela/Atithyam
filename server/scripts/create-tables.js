// Creates the two DynamoDB tables (idempotent). Usage: npm run db:tables  (with STORE_DRIVER=dynamodb)
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { config } from '../src/shared/config/env.js';

const client = new DynamoDBClient({ region: config.store.region, ...(config.store.dynamoEndpoint ? { endpoint: config.store.dynamoEndpoint } : {}) });

async function ensureTable(TableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName }));
    console.log(`✓ ${TableName} already exists`);
    return;
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }
  await client.send(
    new CreateTableCommand({
      TableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
    }),
  );
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName });
  console.log(`✓ created ${TableName}`);
}

try {
  await ensureTable(config.store.tables.core);
  await ensureTable(config.store.tables.reviews);
} catch (err) {
  console.error(`Could not create tables at ${config.store.dynamoEndpoint ?? 'AWS'}: ${err.message}`);
  console.error('Is DynamoDB Local running?  npm run db:up');
  process.exit(1);
}
