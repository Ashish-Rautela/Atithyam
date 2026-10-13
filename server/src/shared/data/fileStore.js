import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Zero-setup key-value store with the same PK/SK semantics as the DynamoDB driver.
 * One JSON file per table; writes are debounced and atomic (write temp file, then rename).
 * Intended for local development only.
 */
export class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.tables = new Map(); // table -> Map<"pk\u0000sk", item>
    this.flushTimers = new Map();
  }

  async #table(name) {
    if (!this.tables.has(name)) {
      const file = path.join(this.dir, `${name}.json`);
      let map = new Map();
      try {
        const raw = JSON.parse(await fs.readFile(file, 'utf8'));
        map = new Map(raw.map((item) => [key(item.PK, item.SK), item]));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      this.tables.set(name, map);
    }
    return this.tables.get(name);
  }

  #scheduleFlush(name) {
    clearTimeout(this.flushTimers.get(name));
    this.flushTimers.set(name, setTimeout(() => this.flush(name).catch(() => {}), 200));
  }

  async flush(name) {
    const map = this.tables.get(name);
    if (!map) return;
    await fs.mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, `${name}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify([...map.values()]));
    await fs.rename(tmp, file);
  }

  async flushAll() {
    for (const [name, timer] of this.flushTimers) {
      clearTimeout(timer);
      await this.flush(name);
    }
  }

  async put(table, item) {
    assertKeys(item);
    const map = await this.#table(table);
    map.set(key(item.PK, item.SK), structuredClone(item));
    this.#scheduleFlush(table);
    return item;
  }

  async putMany(table, items) {
    for (const item of items) await this.put(table, item);
  }

  async get(table, PK, SK) {
    const map = await this.#table(table);
    const item = map.get(key(PK, SK));
    return item ? structuredClone(item) : null;
  }

  async query(table, PK, { skPrefix = '', limit, descending = false } = {}) {
    const map = await this.#table(table);
    const items = [...map.values()]
      .filter((i) => i.PK === PK && String(i.SK).startsWith(skPrefix))
      .sort((a, b) => (a.SK < b.SK ? -1 : a.SK > b.SK ? 1 : 0));
    if (descending) items.reverse();
    return structuredClone(limit ? items.slice(0, limit) : items);
  }

  async delete(table, PK, SK) {
    const map = await this.#table(table);
    map.delete(key(PK, SK));
    this.#scheduleFlush(table);
  }
}

function key(pk, sk) {
  return `${pk}\u0000${sk}`;
}

function assertKeys(item) {
  if (!item || typeof item.PK !== 'string' || typeof item.SK !== 'string') {
    throw new Error('Item must have string PK and SK');
  }
}
