-- Data migration: guarantee the seven authoritative router models exist in every database,
-- including databases created before the router-first change (whose seed is skipped because data
-- already exists). Idempotent; never deletes rows. Must match ROUTER_MODELS in
-- packages/core/src/router-support.ts (checked by the integration tests).

INSERT INTO catalog.categories (slug, name_en, name_ms, sort_order, active)
VALUES ('router', 'Router Support', 'Sokongan Penghala', 1, true)
ON CONFLICT (slug) DO UPDATE SET active = true;

INSERT INTO catalog.brands (slug, name) VALUES ('tp-link', 'TP-Link'), ('kaon', 'Kaon'), ('huawei', 'Huawei')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, active = true;

WITH defs (brand_slug, model_number, normalized, slug, display_name, ecr_code, identity_status, identity_note, sort) AS (
  VALUES
    ('tp-link', 'Archer AX20', 'ARCHERAX20', 'tp-link-archer-ax20', 'TP-Link Archer AX20', 'AX20', 'confirmed', 'Mesh and AP support differ by hardware version (for example V1, V2, V3). Check the label.', 1),
    ('tp-link', 'EX510', 'EX510', 'tp-link-ex510', 'TP-Link EX510', 'EX5', 'confirmed', NULL, 2),
    ('tp-link', 'EX230V', 'EX230V', 'tp-link-ex230v', 'TP-Link EX230V', 'EX2', 'confirmed', NULL, 3),
    ('tp-link', 'EX820V', 'EX820V', 'tp-link-ex820v', 'TP-Link EX820V', 'EX8', 'confirmed', NULL, 4),
    ('tp-link', 'EB431V', 'EB431V', 'tp-link-eb431v', 'TP-Link EB431V', 'EB4', 'confirmed', NULL, 5),
    ('kaon', 'AR2140', 'AR2140', 'kaon-ar2140', 'Kaon AR2140', 'KAO', 'confirmed', NULL, 6),
    ('huawei', 'LG-8245-X6', 'LG8245X6', 'huawei-lg-8245-x6', 'Huawei LG-8245-X6', 'HUA', 'needs_confirmation', 'Huawei documentation lists a model named OptiXstar LG8245X6-10. BBTech to confirm it is the same unit.', 7)
)
INSERT INTO catalog.product_models (brand_id, category_id, model_number, normalized, slug, display_name, ecr_code, identity_status, identity_note, status)
SELECT b.id, c.id, d.model_number, d.normalized, d.slug, d.display_name, d.ecr_code, d.identity_status, d.identity_note, 'active'
FROM defs d JOIN catalog.brands b ON b.slug = d.brand_slug JOIN catalog.categories c ON c.slug = 'router'
ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name, ecr_code = EXCLUDED.ecr_code, model_number = EXCLUDED.model_number,
  identity_status = EXCLUDED.identity_status, identity_note = EXCLUDED.identity_note, status = 'active', category_id = EXCLUDED.category_id;

INSERT INTO catalog.model_aliases (model_id, alias, normalized)
SELECT m.id, a.alias, a.normalized
FROM (VALUES
  ('AX20', 'AX20', 'AX20'), ('AX20', 'Archer AX20', 'ARCHERAX20'),
  ('EX5', 'EX510', 'EX510'),
  ('EX2', 'EX230V', 'EX230V'), ('EX2', 'EX230', 'EX230'),
  ('EX8', 'EX820V', 'EX820V'), ('EX8', 'EX820', 'EX820'),
  ('EB4', 'EB431V', 'EB431V'), ('EB4', 'EB431', 'EB431'),
  ('KAO', 'AR2140', 'AR2140'), ('KAO', 'Kaon AR2140', 'KAONAR2140'),
  ('HUA', 'LG-8245-X6', 'LG8245X6')
) AS a (ecr, alias, normalized)
JOIN catalog.product_models m ON m.ecr_code = a.ecr
ON CONFLICT (model_id, normalized) DO NOTHING;

-- Databases seeded before the router-first change hold fictional sample data ("Nimbus" routers,
-- "Kestrel" laptops) in the customer categories. Move it out of customer view, matching how the
-- current seed isolates samples: an inactive "sample" category, hidden models, archived sample
-- articles and flows. Nothing is deleted. Fresh databases have no such rows, so this is a no-op.
DO $$
DECLARE sample_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM catalog.brands WHERE slug IN ('nimbus', 'kestrel'))
     AND NOT EXISTS (SELECT 1 FROM catalog.categories WHERE slug = 'sample') THEN
    INSERT INTO catalog.categories (slug, name_en, name_ms, sort_order, active)
    VALUES ('sample', 'Synthetic samples (testing only)', 'Contoh sintetik (ujian sahaja)', 99, false)
    RETURNING id INTO sample_id;

    UPDATE catalog.product_models m SET category_id = sample_id, status = 'hidden'
    FROM catalog.brands b WHERE b.id = m.brand_id AND b.slug IN ('nimbus', 'kestrel');
    UPDATE commerce.products p SET category_id = sample_id, status = 'hidden'
    WHERE p.sku LIKE 'SAMPLE-%';
    UPDATE knowledge.articles a SET category_id = sample_id, archived_at = coalesce(a.archived_at, now())
    WHERE EXISTS (
      SELECT 1 FROM knowledge.revisions r JOIN knowledge.revision_sources rs ON rs.revision_id = r.id
      JOIN knowledge.sources s ON s.id = rs.source_id
      WHERE r.article_id = a.id AND s.title = 'BBCare synthetic sample procedures');
    UPDATE knowledge.articles SET category_id = sample_id, archived_at = coalesce(archived_at, now()) WHERE slug = 'mesh-m2-add-node';
    UPDATE knowledge.flows SET category_id = sample_id, status = 'archived' WHERE slug = 'no-internet' AND model_id IS NULL;
    UPDATE catalog.categories SET active = false WHERE slug = 'laptop';
  END IF;
END $$;
