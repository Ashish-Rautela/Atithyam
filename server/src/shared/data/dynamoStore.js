import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

/** DynamoDB driver (DynamoDB Local in development, AWS later). Tables use string keys PK + SK. */
export class DynamoStore {
  constructor({ endpoint, region }) {
    const client = new DynamoDBClient({ region, ...(endpoint ? { endpoint } : {}) });
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
    });
  }

  async put(table, item) {
    await this.doc.send(new PutCommand({ TableName: table, Item: item }));
    return item;
  }

  async putMany(table, items) {
    for (let i = 0; i < items.length; i += 25) {
      let request = { [table]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) };
      // Retry unprocessed items with a short backoff.
      for (let attempt = 0; request && Object.keys(request).length && attempt < 5; attempt++) {
        const res = await this.doc.send(new BatchWriteCommand({ RequestItems: request }));
        request = res.UnprocessedItems && Object.keys(res.UnprocessedItems).length ? res.UnprocessedItems : null;
        if (request) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      }
    }
  }

  async get(table, PK, SK) {
    const res = await this.doc.send(new GetCommand({ TableName: table, Key: { PK, SK } }));
    return res.Item ?? null;
  }

  async query(table, PK, { skPrefix = '', limit, descending = false } = {}) {
    const items = [];
    let ExclusiveStartKey;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: skPrefix ? 'PK = :pk AND begins_with(SK, :sk)' : 'PK = :pk',
          ExpressionAttributeValues: skPrefix ? { ':pk': PK, ':sk': skPrefix } : { ':pk': PK },
          ScanIndexForward: !descending,
          ExclusiveStartKey,
          ...(limit ? { Limit: limit - items.length } : {}),
        }),
      );
      items.push(...(res.Items ?? []));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey && (!limit || items.length < limit));
    return items;
  }

  async delete(table, PK, SK) {
    await this.doc.send(new DeleteCommand({ TableName: table, Key: { PK, SK } }));
  }

  async flushAll() {}
}
