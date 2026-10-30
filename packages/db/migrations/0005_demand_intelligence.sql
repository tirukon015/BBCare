-- Customer demand intelligence: traffic attribution per support session or case, grouped
-- resource demands with every original request preserved, a reviewed media library that can
-- fulfil a demand, and resource feedback.

-- =========================================================================
-- support.attribution: where a customer came from, as the browser and link reported it.
-- One row per support session or per case created without a session. Referrers are stored as
-- hosts only. Nothing here identifies a person.
-- =========================================================================
CREATE TABLE support.attribution (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid UNIQUE REFERENCES support.sessions (id) ON DELETE CASCADE,
  case_id           uuid UNIQUE REFERENCES support.cases (id) ON DELETE CASCADE,
  channel           text NOT NULL CHECK (channel IN ('website', 'shopee', 'qr_code', 'direct_link', 'other', 'unknown')),
  channel_detail    text CHECK (channel_detail ~ '^[a-z0-9_.-]{1,40}$'),
  channel_evidence  text NOT NULL CHECK (channel_evidence IN ('link_param', 'utm', 'referrer', 'none')),
  -- Latest touch (the arrival that led to this session or case).
  referrer_host     text CHECK (char_length(referrer_host) <= 100),
  landing_path      text CHECK (char_length(landing_path) <= 300),
  utm_source        text CHECK (char_length(utm_source) <= 100),
  utm_medium        text CHECK (char_length(utm_medium) <= 100),
  utm_campaign      text CHECK (char_length(utm_campaign) <= 100),
  -- First touch, when the browser still held it (same tab, or 30 days with analytics consent).
  first_referrer_host text CHECK (char_length(first_referrer_host) <= 100),
  first_landing_path  text CHECK (char_length(first_landing_path) <= 300),
  first_utm_source    text CHECK (char_length(first_utm_source) <= 100),
  first_utm_medium    text CHECK (char_length(first_utm_medium) <= 100),
  first_utm_campaign  text CHECK (char_length(first_utm_campaign) <= 100),
  first_channel       text CHECK (first_channel IN ('website', 'shopee', 'qr_code', 'direct_link', 'other', 'unknown')),
  first_touch_at      timestamptz,
  consent           text NOT NULL DEFAULT 'essential' CHECK (consent IN ('essential', 'analytics')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (session_id IS NOT NULL OR case_id IS NOT NULL)
);
CREATE INDEX attribution_channel_idx ON support.attribution (channel, created_at);

-- =========================================================================
-- knowledge.resources: the media library (videos, diagrams, images, documents). A resource
-- reaches customers and AI retrieval only when approved by someone other than the uploader.
-- =========================================================================
CREATE TABLE knowledge.resources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN ('video', 'diagram', 'image', 'document')),
  media_asset_id uuid NOT NULL REFERENCES knowledge.media_assets (id) ON DELETE RESTRICT,
  title_en       text NOT NULL CHECK (char_length(title_en) BETWEEN 3 AND 200),
  title_ms       text NOT NULL CHECK (char_length(title_ms) BETWEEN 3 AND 200),
  description    text CHECK (char_length(description) <= 1000),
  model_id       uuid REFERENCES catalog.product_models (id) ON DELETE RESTRICT,
  support_mode   text CHECK (support_mode IN ('mesh', 'ap')),
  scenario_key   text CHECK (scenario_key ~ '^[a-z0-9_]{3,40}$'),
  locale         text NOT NULL DEFAULT 'both' CHECK (locale IN ('en', 'ms', 'both')),
  source_note    text CHECK (char_length(source_note) <= 500),
  status         text NOT NULL DEFAULT 'under_review' CHECK (status IN ('under_review', 'approved', 'rejected', 'archived')),
  uploaded_by    uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  reviewed_by    uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  review_note    text CHECK (char_length(review_note) <= 1000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS DISTINCT FROM uploaded_by)),
  CHECK ((support_mode IS NULL) = (scenario_key IS NULL))
);
CREATE INDEX resources_scope_idx ON knowledge.resources (model_id, support_mode, scenario_key, status);
CREATE TRIGGER resources_touch BEFORE UPDATE ON knowledge.resources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- support.resource_demands: one row per equivalent requirement (model, revision, mode, problem,
-- resource type, language). Counts are derived from the requests table, never stored twice.
-- =========================================================================
CREATE TABLE support.resource_demands (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id           uuid NOT NULL REFERENCES catalog.product_models (id) ON DELETE CASCADE,
  hardware_revision  text NOT NULL DEFAULT '' CHECK (char_length(hardware_revision) <= 30),
  support_mode       text NOT NULL CHECK (support_mode IN ('mesh', 'ap')),
  scenario_key       text NOT NULL CHECK (scenario_key ~ '^[a-z0-9_]{3,40}$'),
  resource_type      text NOT NULL CHECK (resource_type IN ('text_guide', 'video', 'diagram', 'image', 'document')),
  locale             text NOT NULL CHECK (locale IN ('en', 'ms')),
  requirement        text NOT NULL CHECK (char_length(requirement) <= 300),
  status             text NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'requested', 'in_progress', 'uploaded', 'under_review', 'approved')),
  fulfilled_resource_id uuid REFERENCES knowledge.resources (id) ON DELETE SET NULL,
  fulfilled_flow_id  uuid REFERENCES knowledge.flows (id) ON DELETE SET NULL,
  fulfilled_at       timestamptz,
  first_requested_at timestamptz NOT NULL DEFAULT now(),
  last_requested_at  timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, hardware_revision, support_mode, scenario_key, resource_type, locale),
  CHECK (status <> 'approved' OR fulfilled_resource_id IS NOT NULL OR fulfilled_flow_id IS NOT NULL)
);
CREATE INDEX resource_demands_status_idx ON support.resource_demands (status, last_requested_at DESC);
CREATE TRIGGER resource_demands_touch BEFORE UPDATE ON support.resource_demands FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- support.resource_demand_requests: every original request, with its provenance. The customer
-- reference is an internal identifier (the support session, or the case when there is no
-- session); BBCare has no customer accounts and does not resolve identity across sessions.
-- The question is stored after personal-data scrubbing and secret redaction.
-- =========================================================================
CREATE TABLE support.resource_demand_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id     uuid NOT NULL REFERENCES support.resource_demands (id) ON DELETE CASCADE,
  customer_ref  text NOT NULL CHECK (char_length(customer_ref) <= 80),
  session_id    uuid REFERENCES support.sessions (id) ON DELETE SET NULL,
  case_id       uuid REFERENCES support.cases (id) ON DELETE SET NULL,
  question      text NOT NULL CHECK (char_length(question) <= 1000),
  interpreted   text NOT NULL CHECK (char_length(interpreted) <= 300),
  interpreted_by text NOT NULL DEFAULT 'rules' CHECK (interpreted_by IN ('rules', 'ai')),
  locale        text NOT NULL CHECK (locale IN ('en', 'ms')),
  channel       text NOT NULL DEFAULT 'unknown' CHECK (channel IN ('website', 'shopee', 'qr_code', 'direct_link', 'other', 'unknown')),
  origin        text NOT NULL CHECK (origin IN ('router_page', 'assistant', 'escalation', 'describe_box')),
  had_text_guide boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demand_requests_demand_idx ON support.resource_demand_requests (demand_id, created_at);
CREATE INDEX demand_requests_case_idx ON support.resource_demand_requests (case_id);
CREATE INDEX demand_requests_created_idx ON support.resource_demand_requests (created_at);

-- Resource usage feedback reuses support.feedback.
ALTER TABLE support.feedback
  ADD COLUMN resource_id uuid REFERENCES knowledge.resources (id) ON DELETE CASCADE,
  DROP CONSTRAINT feedback_check,
  ADD CONSTRAINT feedback_subject CHECK (session_id IS NOT NULL OR article_id IS NOT NULL OR resource_id IS NOT NULL);
