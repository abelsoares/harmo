import type { CanonicalSource } from '@harmo/common';
import { getKnex } from '@src/clients';
import { computeSourceIdentityHash, resetSourceCache, upsertSource } from '@src/ingest/source-cache';
import { beforeEach, describe, expect, it } from 'vitest';

function source(overrides: Partial<CanonicalSource> = {}): CanonicalSource {
  return {
    subjectId: 'default',
    vendor: 'apple',
    sourceName: "Abel's Apple Watch",
    manufacturer: 'Apple Inc.',
    hardwareVersion: 'Watch7,9',
    softwareVersion: '11.1',
    productType: 'Watch',
    identityHash: computeSourceIdentityHash({
      vendor: 'apple',
      sourceName: "Abel's Apple Watch",
      hardwareVersion: 'Watch7,9',
      productType: 'Watch'
    }),
    ...overrides
  };
}

describe('upsertSource', () => {
  beforeEach(async () => {
    resetSourceCache();
    const knex = getKnex();

    await knex('samples').delete();
    await knex('workouts').delete();
    await knex('correlations').delete();
    await knex('sources').delete();
  });

  it('inserts a new source row and returns its bigint id', async () => {
    const knex = getKnex();
    const id = await upsertSource(knex, source());

    expect(typeof id).toBe('bigint');
    expect(id).toBeGreaterThan(0n);

    const row = await knex('sources').where({ id: id.toString() }).first();

    expect(row.source_name).toBe("Abel's Apple Watch");
    expect(row.manufacturer).toBe('Apple Inc.');
    expect(row.hardware_version).toBe('Watch7,9');
  });

  it('returns the same id when called twice with the same identity_hash', async () => {
    const knex = getKnex();
    const first = await upsertSource(knex, source());
    const second = await upsertSource(knex, source());

    expect(second).toBe(first);

    const count = await knex('sources').count<{ count: string }>({ count: '*' }).first();

    expect(Number(count?.count)).toBe(1);
  });

  it('updates software_version on conflict', async () => {
    const knex = getKnex();
    await upsertSource(knex, source({ softwareVersion: '11.0' }));

    resetSourceCache();
    const id = await upsertSource(knex, source({ softwareVersion: '11.1' }));

    const row = await knex('sources').where({ id: id.toString() }).first();

    expect(row.software_version).toBe('11.1');
  });

  it('treats different sourceName as distinct sources', async () => {
    const knex = getKnex();
    const a = await upsertSource(
      knex,
      source({
        sourceName: "Abel's Apple Watch",
        identityHash: computeSourceIdentityHash({ vendor: 'apple', sourceName: "Abel's Apple Watch" })
      })
    );
    const b = await upsertSource(
      knex,
      source({
        sourceName: "Abel's iPhone",
        hardwareVersion: 'iPhone15,3',
        productType: 'iPhone',
        identityHash: computeSourceIdentityHash({
          vendor: 'apple',
          sourceName: "Abel's iPhone",
          hardwareVersion: 'iPhone15,3',
          productType: 'iPhone'
        })
      })
    );

    expect(a).not.toBe(b);

    const count = await knex('sources').count<{ count: string }>({ count: '*' }).first();

    expect(Number(count?.count)).toBe(2);
  });

  it('hits cache on the second call (no extra DB row)', async () => {
    const knex = getKnex();
    const first = await upsertSource(knex, source());
    // Truncate to prove the cache is short-circuiting the DB.
    await knex('sources').delete();

    const second = await upsertSource(knex, source());

    expect(second).toBe(first);

    const count = await knex('sources').count<{ count: string }>({ count: '*' }).first();

    expect(Number(count?.count)).toBe(0);
  });

  it('refetches after resetSourceCache (cache invalidation)', async () => {
    const knex = getKnex();
    const first = await upsertSource(knex, source());

    resetSourceCache();
    const second = await upsertSource(knex, source());

    expect(second).toBe(first);
  });
});
