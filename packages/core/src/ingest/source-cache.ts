import { createHash } from 'node:crypto';
import type { CanonicalSource } from '@harmo/common';
import type { Knex } from 'knex';

export function computeSourceIdentityHash(parts: {
  vendor: string;
  sourceName: string;
  hardwareVersion?: string | null;
  productType?: string | null;
}): string {
  const input = [parts.vendor, parts.sourceName, parts.hardwareVersion ?? '', parts.productType ?? ''].join('|');

  return createHash('sha256').update(input).digest('hex');
}

// Per-worker LRU. Apple exports cite the same handful of devices millions of times,
// so caching the id avoids hammering the DB.
class SimpleLRU<K, V> {
  private cache = new Map<K, V>();

  constructor(private maxSize: number = 1000) {}

  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value === undefined) {
      return undefined;
    }

    // Promote to most-recently-used by re-inserting.
    this.cache.delete(key);
    this.cache.set(key, value);

    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;

      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

const sourceCache = new SimpleLRU<string, bigint>(1000);

export function resetSourceCache(): void {
  sourceCache.clear();
}

export function getSourceCacheSize(): number {
  return sourceCache.size;
}

export async function upsertSource(knex: Knex, source: CanonicalSource): Promise<bigint> {
  const cacheKey = `${source.subjectId}|${source.identityHash}`;
  const cached = sourceCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const result = await knex.raw<{ rows: Array<{ id: string }> }>(
    `INSERT INTO sources (
       subject_id, vendor, source_name, manufacturer,
       hardware_version, software_version, product_type, identity_hash
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (subject_id, identity_hash) DO UPDATE SET
       source_name      = EXCLUDED.source_name,
       manufacturer     = EXCLUDED.manufacturer,
       hardware_version = EXCLUDED.hardware_version,
       software_version = EXCLUDED.software_version,
       product_type     = EXCLUDED.product_type,
       updated_at       = now()
     RETURNING id`,
    [
      source.subjectId,
      source.vendor,
      source.sourceName,
      source.manufacturer,
      source.hardwareVersion,
      source.softwareVersion,
      source.productType,
      source.identityHash
    ]
  );

  const id = BigInt(result.rows[0].id);

  sourceCache.set(cacheKey, id);

  return id;
}
