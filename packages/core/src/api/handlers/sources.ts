import { getKnex } from '@src/clients/knex';
import type { Middleware } from 'koa';
import { z } from 'zod';

const QuerySchema = z.object({
  vendor: z.string().optional(),
  include_sample_count: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform(v => v === 'true')
});

type Row = {
  id: string;
  vendor: string;
  source_name: string;
  manufacturer: string | null;
  hardware_version: string | null;
  software_version: string | null;
  product_type: string | null;
  sample_count: string | null;
};

export function listSourcesHandler(): Middleware {
  return async ctx => {
    const subjectId = String(ctx.params.subjectId);
    const parsed = QuerySchema.parse(ctx.query);
    const knex = getKnex();

    let rows: Row[];

    if (parsed.include_sample_count) {
      let q = knex('sources as s')
        .leftJoin('samples as smp', 'smp.source_id', 's.id')
        .where('s.subject_id', subjectId)
        .groupBy(
          's.id',
          's.vendor',
          's.source_name',
          's.manufacturer',
          's.hardware_version',
          's.software_version',
          's.product_type'
        );

      if (parsed.vendor) {
        q = q.andWhere('s.vendor', parsed.vendor);
      }

      rows = await q
        .orderByRaw('count(smp.id) DESC NULLS LAST')
        .select<Row[]>(
          's.id as id',
          's.vendor as vendor',
          's.source_name as source_name',
          's.manufacturer as manufacturer',
          's.hardware_version as hardware_version',
          's.software_version as software_version',
          's.product_type as product_type'
        )
        .count({ sample_count: 'smp.id' });
    } else {
      let q = knex('sources').where('subject_id', subjectId);

      if (parsed.vendor) {
        q = q.andWhere('vendor', parsed.vendor);
      }

      rows = await q
        .orderBy('source_name')
        .select<Row[]>(
          'id',
          'vendor',
          'source_name',
          'manufacturer',
          'hardware_version',
          'software_version',
          'product_type'
        );
    }

    ctx.body = {
      data: rows.map(r => ({
        id: r.id,
        vendor: r.vendor,
        source_name: r.source_name,
        manufacturer: r.manufacturer,
        hardware_version: r.hardware_version,
        software_version: r.software_version,
        product_type: r.product_type,
        ...(parsed.include_sample_count ? { sample_count: Number(r.sample_count ?? 0) } : {})
      }))
    };
  };
}
