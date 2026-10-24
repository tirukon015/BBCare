-- Router-first support: ECR codes and verified images on models, model-specific troubleshooting
-- flows with source verification, router context on support cases, customer case follow-up, and
-- a staff-reviewed queue of AI training examples.

-- =========================================================================
-- catalog: ECR code, identity confirmation, verified product image
-- =========================================================================
ALTER TABLE catalog.product_models
  ADD COLUMN ecr_code          text UNIQUE CHECK (ecr_code ~ '^[A-Z0-9]{2,6}$'),
  ADD COLUMN identity_status   text NOT NULL DEFAULT 'confirmed' CHECK (identity_status IN ('confirmed', 'needs_confirmation')),
  ADD COLUMN identity_note     text CHECK (char_length(identity_note) <= 500),
  ADD COLUMN image_asset_id    uuid REFERENCES knowledge.media_assets (id) ON DELETE SET NULL,
  ADD COLUMN image_source_url  text CHECK (image_source_url ~ '^https://'),
  ADD COLUMN image_verified_by uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  ADD COLUMN image_verified_at timestamptz,
  -- An image counts as verified only with the asset, who checked it, and when.
  ADD CONSTRAINT product_models_image_verified CHECK (
    (image_verified_at IS NULL AND image_verified_by IS NULL) OR (image_asset_id IS NOT NULL AND image_verified_by IS NOT NULL AND image_verified_at IS NOT NULL));

-- =========================================================================
-- knowledge: model-specific flows, verification, sources, step outcomes and warnings
-- =========================================================================
ALTER TABLE knowledge.flows
  ADD COLUMN model_id            uuid REFERENCES catalog.product_models (id) ON DELETE RESTRICT,
  ADD COLUMN support_mode        text CHECK (support_mode IN ('mesh', 'ap')),
  ADD COLUMN scenario_key        text CHECK (scenario_key ~ '^[a-z0-9_]{3,40}$'),
  ADD COLUMN hardware_revision   text CHECK (char_length(hardware_revision) <= 60),
  ADD COLUMN firmware_note       text CHECK (char_length(firmware_note) <= 200),
  ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('verified', 'official_excerpt', 'official_general', 'community', 'conflicting', 'unverified')),
  ADD COLUMN verification_note   text CHECK (char_length(verification_note) <= 1000),
  ADD COLUMN verified_by         uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  ADD COLUMN verified_at         timestamptz,
  ADD COLUMN research_ref        text UNIQUE,
  ADD CONSTRAINT flows_router_fields CHECK ((model_id IS NULL) = (support_mode IS NULL) AND (model_id IS NULL) = (scenario_key IS NULL)),
  ADD CONSTRAINT flows_verified_fields CHECK (verification_status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  -- A model-specific flow can be published only after a named staff member verified it.
  ADD CONSTRAINT flows_publish_verified CHECK (status <> 'published' OR model_id IS NULL OR verification_status = 'verified');
CREATE UNIQUE INDEX flows_one_published_scenario ON knowledge.flows (model_id, support_mode, scenario_key) WHERE status = 'published' AND model_id IS NOT NULL;
CREATE INDEX flows_model_idx ON knowledge.flows (model_id, support_mode);

ALTER TABLE knowledge.flow_steps
  ADD COLUMN expected_en text CHECK (char_length(expected_en) <= 500),
  ADD COLUMN expected_ms text CHECK (char_length(expected_ms) <= 500),
  ADD COLUMN warning_en  text CHECK (char_length(warning_en) <= 500),
  ADD COLUMN warning_ms  text CHECK (char_length(warning_ms) <= 500),
  ADD COLUMN destructive boolean NOT NULL DEFAULT false,
  -- Configuration-destructive steps (for example a factory reset) must carry a warning in both languages.
  ADD CONSTRAINT flow_steps_destructive_warned CHECK (NOT destructive OR (warning_en IS NOT NULL AND warning_ms IS NOT NULL AND safety_level = 'danger'));

CREATE TABLE knowledge.flow_sources (
  flow_id   uuid NOT NULL REFERENCES knowledge.flows (id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES knowledge.sources (id) ON DELETE RESTRICT,
  locator   text CHECK (char_length(locator) <= 200),
  PRIMARY KEY (flow_id, source_id)
);

-- Publishing a model-specific flow also requires at least one approved, reviewed source and
-- Malay text that is no longer a translation placeholder.
CREATE OR REPLACE FUNCTION knowledge.flows_publish_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.model_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM knowledge.flow_sources fs JOIN knowledge.sources s ON s.id = fs.source_id
      WHERE fs.flow_id = NEW.id AND s.status = 'approved' AND s.trust_level IN ('reviewed', 'authoritative')) THEN
      RAISE EXCEPTION 'flow % needs an approved, reviewed source before publishing', NEW.id USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM knowledge.flow_steps st WHERE st.flow_id = NEW.id
      AND (st.prompt_ms LIKE '[PERLU TERJEMAHAN]%' OR st.expected_ms LIKE '[PERLU TERJEMAHAN]%' OR st.warning_ms LIKE '[PERLU TERJEMAHAN]%')) THEN
      RAISE EXCEPTION 'flow % has Malay text awaiting translation', NEW.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER flows_publish_guard BEFORE INSERT OR UPDATE ON knowledge.flows FOR EACH ROW EXECUTE FUNCTION knowledge.flows_publish_guard();

-- =========================================================================
-- support: router context, structured intake, resolution, customer follow-up
-- =========================================================================
ALTER TABLE support.sessions
  ADD COLUMN support_mode text CHECK (support_mode IN ('mesh', 'ap')),
  ADD COLUMN scenario_key text CHECK (scenario_key ~ '^[a-z0-9_]{3,40}$');

ALTER TABLE support.cases
  ADD COLUMN support_mode        text CHECK (support_mode IN ('mesh', 'ap')),
  ADD COLUMN scenario_key        text CHECK (scenario_key ~ '^[a-z0-9_]{3,40}$'),
  -- Answers to fixed multiple-choice questions only (validated in code); never free text.
  ADD COLUMN intake              jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN flow_id             uuid REFERENCES knowledge.flows (id) ON DELETE SET NULL,
  ADD COLUMN followup_hash       bytea UNIQUE,
  ADD COLUMN resolution_flow_id  uuid REFERENCES knowledge.flows (id) ON DELETE SET NULL,
  ADD COLUMN resolution_note     text CHECK (char_length(resolution_note) <= 2000),
  ADD COLUMN customer_note       text CHECK (char_length(customer_note) <= 1000),
  ADD COLUMN resolution_verified boolean NOT NULL DEFAULT false;
CREATE INDEX cases_router_idx ON support.cases (model_id, support_mode, scenario_key);

ALTER TABLE support.case_events DROP CONSTRAINT case_events_kind_check;
ALTER TABLE support.case_events ADD CONSTRAINT case_events_kind_check
  CHECK (kind IN ('created', 'status_changed', 'note', 'assigned', 'priority_changed', 'contact_purged', 'customer_message', 'resolution', 'customer_note'));

-- =========================================================================
-- ai: staff-reviewed training and evaluation examples
-- =========================================================================
-- Nothing enters this table automatically. A staff member proposes an example from a resolved
-- case; a different reviewer approves it after a privacy screen. Only approved rows are exported.
CREATE TABLE ai.training_examples (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid REFERENCES support.cases (id) ON DELETE SET NULL,
  model_id         uuid REFERENCES catalog.product_models (id) ON DELETE SET NULL,
  support_mode     text CHECK (support_mode IN ('mesh', 'ap')),
  scenario_key     text,
  locale           text NOT NULL CHECK (locale IN ('en', 'ms')),
  question         text NOT NULL CHECK (char_length(question) BETWEEN 5 AND 1000),
  answer           text NOT NULL CHECK (char_length(answer) BETWEEN 5 AND 4000),
  flow_id          uuid REFERENCES knowledge.flows (id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  privacy_screened boolean NOT NULL DEFAULT false,
  proposed_by      uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  reviewed_by      uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  review_note      text CHECK (char_length(review_note) <= 1000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  CHECK (status <> 'approved' OR (privacy_screened AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS DISTINCT FROM proposed_by))
);
CREATE INDEX training_examples_status_idx ON ai.training_examples (status, created_at DESC);
