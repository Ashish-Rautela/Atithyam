import { one, query } from '../shared/db/pool.js';

export async function getCompset(hotelId) {
  const r = await one('SELECT * FROM compsets WHERE hotel_id = $1', [hotelId]);
  if (!r) return null;
  return {
    hotelId: r.hotel_id,
    rules: r.rules,
    selectedPlaceIds: r.selected_place_ids,
    selectionSource: r.selection_source,
    target: r.target,
    members: r.members ?? [],
    collection: r.collection,
    discoveryJobId: r.discovery_job_id,
    updatedAt: r.updated_at?.toISOString?.() ?? null,
  };
}

/** Upsert; only the fields given are changed. */
export async function saveCompset(hotelId, f) {
  const has = (k) => Object.prototype.hasOwnProperty.call(f, k);
  const json = (v) => (v === undefined ? null : JSON.stringify(v));
  await query(
    `INSERT INTO compsets (hotel_id, rules, selected_place_ids, selection_source, target, members, collection, discovery_job_id)
     VALUES ($1, COALESCE($2::jsonb, '{}'::jsonb), $3::jsonb, $4, $5::jsonb, COALESCE($6::jsonb, '[]'::jsonb), $7::jsonb, $8)
     ON CONFLICT (hotel_id) DO UPDATE SET
       rules              = CASE WHEN $9  THEN EXCLUDED.rules ELSE compsets.rules END,
       selected_place_ids = CASE WHEN $10 THEN EXCLUDED.selected_place_ids ELSE compsets.selected_place_ids END,
       selection_source   = CASE WHEN $10 THEN EXCLUDED.selection_source ELSE compsets.selection_source END,
       target             = CASE WHEN $11 THEN EXCLUDED.target ELSE compsets.target END,
       members            = CASE WHEN $12 THEN EXCLUDED.members ELSE compsets.members END,
       collection         = CASE WHEN $13 THEN EXCLUDED.collection ELSE compsets.collection END,
       discovery_job_id   = CASE WHEN $14 THEN EXCLUDED.discovery_job_id ELSE compsets.discovery_job_id END,
       updated_at         = now()`,
    [
      hotelId,
      json(f.rules),
      json(f.selectedPlaceIds),
      f.selectionSource ?? null,
      json(f.target),
      json(f.members),
      json(f.collection),
      f.discoveryJobId ?? null,
      has('rules'),
      has('selectedPlaceIds'),
      has('target'),
      has('members'),
      has('collection'),
      has('discoveryJobId'),
    ],
  );
}
