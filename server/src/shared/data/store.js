import { config } from '../config/env.js';
import { FileStore } from './fileStore.js';
import { DynamoStore } from './dynamoStore.js';

let instance;

/** Returns the configured store driver (singleton). Both drivers expose put/putMany/get/query/delete/flushAll. */
export function getStore() {
  if (!instance) {
    instance =
      config.store.driver === 'dynamodb'
        ? new DynamoStore({ endpoint: config.store.dynamoEndpoint, region: config.store.region })
        : new FileStore(config.store.fileDir);
  }
  return instance;
}

/** For tests: inject a store instance. */
export function setStore(store) {
  instance = store;
}

export const TABLES = config.store.tables;
