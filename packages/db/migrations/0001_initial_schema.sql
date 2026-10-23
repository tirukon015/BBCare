-- BBCare initial schema.
-- Conventions: uuid keys, timestamptz, explicit ON DELETE, one Postgres schema per module.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS support;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS ops;

-- Text search configuration: accent-insensitive, no stemming (Postgres has no Malay stemmer).
-- Application-side normalization (packages/core/src/text.ts) is applied before indexing and querying.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'bbcare') THEN
    CREATE TEXT SEARCH CONFIGURATION public.bbcare (COPY = simple);
    ALTER TEXT SEARCH CONFIGURATION public.bbcare
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- =========================================================================
-- identity
-- =========================================================================
CREATE TABLE identity.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  display_name    text NOT NULL,
  password_hash   text NOT NULL,
  totp_secret_enc text,
  totp_enabled_at timestamptz,
  totp_last_counter bigint,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_logins   integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON identity.users (lower(email));
CREATE TRIGGER users_touch BEFORE UPDATE ON identity.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE identity.user_roles (
  user_id    uuid NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('admin', 'editor', 'reviewer', 'support_agent', 'analyst')),
  granted_by uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE identity.sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  token_hash    bytea NOT NULL UNIQUE,
  mfa_verified  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  device        text
);
CREATE INDEX sessions_user_idx ON identity.sessions (user_id);
CREATE INDEX sessions_expiry_idx ON identity.sessions (expires_at);

CREATE TABLE identity.recovery_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  code_hash  bytea NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);

CREATE TABLE identity.audit_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  action        text NOT NULL,
  entity_type   text,
  entity_id     text,
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id    text
);
CREATE INDEX audit_logs_at_idx ON identity.audit_logs (at DESC);
CREATE INDEX audit_logs_entity_idx ON identity.audit_logs (entity_type, entity_id);

CREATE OR REPLACE FUNCTION identity.audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END $$;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON identity.audit_logs
  FOR EACH ROW EXECUTE FUNCTION identity.audit_logs_append_only();

-- =========================================================================
-- catalog
-- =========================================================================
CREATE TABLE catalog.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name_en    text NOT NULL,
  name_ms    text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog.brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog.product_models (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       uuid NOT NULL REFERENCES catalog.brands (id) ON DELETE RESTRICT,
  category_id    uuid NOT NULL REFERENCES catalog.categories (id) ON DELETE RESTRICT,
  model_number   text NOT NULL,
  normalized     text NOT NULL,
  slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  display_name   text NOT NULL,
  summary_en     text,
  summary_ms     text,
  released_year  integer CHECK (released_year BETWEEN 1990 AND 2100),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'legacy', 'hidden')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, category_id, normalized)
);
CREATE INDEX product_models_trgm ON catalog.product_models USING gin (normalized gin_trgm_ops);
CREATE INDEX product_models_category_idx ON catalog.product_models (category_id);
CREATE TRIGGER product_models_touch BEFORE UPDATE ON catalog.product_models FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE catalog.product_variants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          uuid NOT NULL REFERENCES catalog.product_models (id) ON DELETE CASCADE,
  label             text NOT NULL,
  hardware_revision text,
  region            text,
  sku               text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, label)
);

CREATE TABLE catalog.model_aliases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id   uuid NOT NULL REFERENCES catalog.product_models (id) ON DELETE CASCADE,
  alias      text NOT NULL,
  normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, normalized)
);
CREATE INDEX model_aliases_trgm ON catalog.model_aliases USING gin (normalized gin_trgm_ops);
CREATE INDEX model_aliases_normalized_idx ON catalog.model_aliases (normalized);

-- =========================================================================
-- knowledge (sources first: firmware and compatibility reference them)
-- =========================================================================
CREATE TABLE knowledge.media_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key   text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
  sha256        text NOT NULL,
  uploaded_by   uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge.sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN ('manufacturer_doc', 'internal_procedure', 'staff_authored', 'historical_chat', 'customer_feedback', 'web_page')),
  title          text NOT NULL,
  publisher      text,
  url            text,
  license_note   text,
  sha256         text UNIQUE,
  media_asset_id uuid REFERENCES knowledge.media_assets (id) ON DELETE SET NULL,
  extracted_text text,
  trust_level    text NOT NULL DEFAULT 'unverified' CHECK (trust_level IN ('unverified', 'reviewed', 'authoritative')),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  injection_flag boolean NOT NULL DEFAULT false,
  created_by     uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  reviewed_by    uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER sources_touch BEFORE UPDATE ON knowledge.sources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE catalog.firmware_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    uuid NOT NULL REFERENCES catalog.product_models (id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES catalog.product_variants (id) ON DELETE CASCADE,
  version     text NOT NULL,
  released_on date,
  notes       text,
  source_id   uuid REFERENCES knowledge.sources (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (model_id, variant_id, version)
);

CREATE TABLE knowledge.articles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories (id) ON DELETE RESTRICT,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  kind        text NOT NULL DEFAULT 'guide' CHECK (kind IN ('guide', 'troubleshooting', 'faq', 'reference')),
  created_by  uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge.revisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    uuid NOT NULL REFERENCES knowledge.articles (id) ON DELETE CASCADE,
  locale        text NOT NULL CHECK (locale IN ('en', 'ms')),
  revision_no   integer NOT NULL CHECK (revision_no > 0),
  title         text NOT NULL,
  summary       text NOT NULL DEFAULT '',
  body_md       text NOT NULL,
  safety_level  text NOT NULL DEFAULT 'normal' CHECK (safety_level IN ('normal', 'caution', 'danger')),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'rejected', 'archived', 'superseded')),
  author_id     uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  reviewer_id   uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  self_approved boolean NOT NULL DEFAULT false,
  change_note   text,
  review_note   text,
  machine_translated boolean NOT NULL DEFAULT false,
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, locale, revision_no)
);
CREATE INDEX revisions_status_idx ON knowledge.revisions (status);
CREATE UNIQUE INDEX revisions_one_published ON knowledge.revisions (article_id, locale) WHERE status = 'published';

-- Approved content is immutable: only status and review metadata may change.
CREATE OR REPLACE FUNCTION knowledge.revisions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('approved', 'published', 'superseded', 'archived') AND (
       NEW.title IS DISTINCT FROM OLD.title OR
       NEW.summary IS DISTINCT FROM OLD.summary OR
       NEW.body_md IS DISTINCT FROM OLD.body_md OR
       NEW.locale IS DISTINCT FROM OLD.locale OR
       NEW.article_id IS DISTINCT FROM OLD.article_id OR
       NEW.safety_level IS DISTINCT FROM OLD.safety_level) THEN
    RAISE EXCEPTION 'revision % is immutable in status %', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revisions_immutable BEFORE UPDATE ON knowledge.revisions FOR EACH ROW EXECUTE FUNCTION knowledge.revisions_guard();

CREATE TABLE knowledge.revision_sources (
  revision_id uuid NOT NULL REFERENCES knowledge.revisions (id) ON DELETE CASCADE,
  source_id   uuid NOT NULL REFERENCES knowledge.sources (id) ON DELETE RESTRICT,
  locator     text,
  PRIMARY KEY (revision_id, source_id)
);

CREATE TABLE knowledge.applicability (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id       uuid NOT NULL REFERENCES knowledge.revisions (id) ON DELETE CASCADE,
  category_id       uuid REFERENCES catalog.categories (id) ON DELETE CASCADE,
  model_id          uuid REFERENCES catalog.product_models (id) ON DELETE CASCADE,
  variant_id        uuid REFERENCES catalog.product_variants (id) ON DELETE CASCADE,
  firmware_versions text[],
  CHECK (category_id IS NOT NULL OR model_id IS NOT NULL),
  CHECK (variant_id IS NULL OR model_id IS NOT NULL)
);
CREATE INDEX applicability_revision_idx ON knowledge.applicability (revision_id);
CREATE INDEX applicability_model_idx ON knowledge.applicability (model_id);

CREATE TABLE knowledge.chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES knowledge.revisions (id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  heading     text NOT NULL,
  content     text NOT NULL,
  search_text text NOT NULL,
  word_count  integer NOT NULL,
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('public.bbcare', search_text)) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, ordinal)
);
CREATE INDEX chunks_tsv_idx ON knowledge.chunks USING gin (tsv);
CREATE INDEX chunks_trgm_idx ON knowledge.chunks USING gin (search_text gin_trgm_ops);

-- Embeddings: dimension is fixed per model. An HNSW index is added by a later migration once a
-- model is approved (index requires a fixed dimension).
CREATE TABLE knowledge.chunk_embeddings (
  chunk_id   uuid NOT NULL REFERENCES knowledge.chunks (id) ON DELETE CASCADE,
  model      text NOT NULL,
  dims       integer NOT NULL CHECK (dims > 0),
  embedding  vector NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, model)
);

CREATE TABLE knowledge.flows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories (id) ON DELETE RESTRICT,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  title_en    text NOT NULL,
  title_ms    text NOT NULL,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by  uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER flows_touch BEFORE UPDATE ON knowledge.flows FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE knowledge.flow_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id        uuid NOT NULL REFERENCES knowledge.flows (id) ON DELETE CASCADE,
  step_key       text NOT NULL CHECK (step_key ~ '^[a-z0-9_-]+$'),
  is_start       boolean NOT NULL DEFAULT false,
  prompt_en      text NOT NULL,
  prompt_ms      text NOT NULL,
  -- Options: [{"key":"yes","label_en":"Yes","label_ms":"Ya","next":"step_key"|null,"outcome":"resolved"|"escalate"|null}]
  options        jsonb NOT NULL DEFAULT '[]'::jsonb,
  article_id     uuid REFERENCES knowledge.articles (id) ON DELETE SET NULL,
  safety_level   text NOT NULL DEFAULT 'normal' CHECK (safety_level IN ('normal', 'caution', 'danger')),
  UNIQUE (flow_id, step_key)
);
CREATE UNIQUE INDEX flow_steps_one_start ON knowledge.flow_steps (flow_id) WHERE is_start;

-- =========================================================================
-- commerce
-- =========================================================================
CREATE TABLE commerce.products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         text NOT NULL UNIQUE,
  category_id uuid NOT NULL REFERENCES catalog.categories (id) ON DELETE RESTRICT,
  brand_id    uuid REFERENCES catalog.brands (id) ON DELETE RESTRICT,
  model_id    uuid REFERENCES catalog.product_models (id) ON DELETE SET NULL,
  kind        text NOT NULL DEFAULT 'device' CHECK (kind IN ('device', 'accessory', 'part', 'service')),
  name_en     text NOT NULL,
  name_ms     text NOT NULL,
  summary_en  text,
  summary_ms  text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discontinued', 'hidden')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER products_touch BEFORE UPDATE ON commerce.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE commerce.product_specs (
  product_id uuid NOT NULL REFERENCES commerce.products (id) ON DELETE CASCADE,
  spec_key   text NOT NULL CHECK (spec_key ~ '^[a-z0-9_]+$'),
  value      text NOT NULL,
  unit       text,
  source_id  uuid REFERENCES knowledge.sources (id) ON DELETE SET NULL,
  PRIMARY KEY (product_id, spec_key)
);

CREATE TABLE commerce.product_compatibility (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES commerce.products (id) ON DELETE CASCADE,
  model_id           uuid NOT NULL REFERENCES catalog.product_models (id) ON DELETE CASCADE,
  variant_id         uuid REFERENCES catalog.product_variants (id) ON DELETE CASCADE,
  relation           text NOT NULL CHECK (relation IN ('compatible_with', 'accessory_for', 'replacement_for', 'upgrade_for')),
  note_en            text,
  note_ms            text,
  evidence_source_id uuid REFERENCES knowledge.sources (id) ON DELETE SET NULL,
  verified_by        uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  verified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (product_id, model_id, variant_id, relation)
);
CREATE INDEX compatibility_model_idx ON commerce.product_compatibility (model_id);

CREATE TABLE commerce.product_listings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES commerce.products (id) ON DELETE CASCADE,
  channel          text NOT NULL CHECK (channel IN ('bbtech_shop', 'shopee')),
  url              text NOT NULL CHECK (url ~ '^https://(www\.bbtech\.shop|bbtech\.shop|shopee\.com\.my)/'),
  external_shop_id text,
  external_item_id text,
  status           text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'active', 'broken', 'delisted')),
  last_verified_at timestamptz,
  verified_by      uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  created_by       uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, url)
);
CREATE INDEX listings_product_idx ON commerce.product_listings (product_id);
CREATE TRIGGER listings_touch BEFORE UPDATE ON commerce.product_listings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE commerce.listing_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES commerce.product_listings (id) ON DELETE CASCADE,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  method      text NOT NULL CHECK (method IN ('manual', 'http_check', 'api')),
  result      text NOT NULL CHECK (result IN ('ok', 'broken', 'redirected', 'not_found', 'blocked', 'error')),
  http_status integer,
  note        text,
  checked_by  uuid REFERENCES identity.users (id) ON DELETE SET NULL
);
CREATE INDEX listing_verifications_listing_idx ON commerce.listing_verifications (listing_id, checked_at DESC);

CREATE TABLE commerce.price_observations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES commerce.product_listings (id) ON DELETE CASCADE,
  amount_myr  numeric(12, 2) NOT NULL CHECK (amount_myr >= 0),
  source      text NOT NULL CHECK (source IN ('shopee_api', 'storefront_api', 'manual_authorized')),
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_obs_listing_idx ON commerce.price_observations (listing_id, observed_at DESC);

CREATE TABLE commerce.stock_observations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES commerce.product_listings (id) ON DELETE CASCADE,
  stock_state text NOT NULL CHECK (stock_state IN ('in_stock', 'low_stock', 'out_of_stock')),
  source      text NOT NULL CHECK (source IN ('shopee_api', 'storefront_api', 'manual_authorized')),
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_obs_listing_idx ON commerce.stock_observations (listing_id, observed_at DESC);

-- =========================================================================
-- support
-- =========================================================================
CREATE TABLE support.sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id        text NOT NULL UNIQUE,
  token_hash       bytea NOT NULL UNIQUE,
  locale           text NOT NULL CHECK (locale IN ('en', 'ms')),
  category_id      uuid REFERENCES catalog.categories (id) ON DELETE SET NULL,
  model_id         uuid REFERENCES catalog.product_models (id) ON DELETE SET NULL,
  variant_id       uuid REFERENCES catalog.product_variants (id) ON DELETE SET NULL,
  firmware         text,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'escalated', 'closed')),
  mode             text NOT NULL DEFAULT 'search' CHECK (mode IN ('search', 'ai')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL
);
CREATE INDEX support_sessions_expiry_idx ON support.sessions (expires_at);

CREATE TABLE support.retrieval_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid REFERENCES support.sessions (id) ON DELETE CASCADE,
  query_normalized text NOT NULL,
  filters          jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidates       jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider         text,
  model            text,
  prompt_version   text,
  latency_ms       integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retrieval_runs_created_idx ON support.retrieval_runs (created_at);

CREATE TABLE support.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES support.sessions (id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('customer', 'assistant', 'notice')),
  content          text NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome          text CHECK (outcome IN ('answered', 'clarify', 'abstain', 'escalate')),
  language         text CHECK (language IN ('en', 'ms')),
  retrieval_run_id uuid REFERENCES support.retrieval_runs (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_session_idx ON support.messages (session_id, created_at);

CREATE TABLE support.answer_citations (
  message_id  uuid NOT NULL REFERENCES support.messages (id) ON DELETE CASCADE,
  chunk_id    uuid REFERENCES knowledge.chunks (id) ON DELETE SET NULL,
  revision_id uuid NOT NULL REFERENCES knowledge.revisions (id) ON DELETE CASCADE,
  position    integer NOT NULL,
  PRIMARY KEY (message_id, position)
);

CREATE TABLE support.feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid REFERENCES support.sessions (id) ON DELETE CASCADE,
  message_id  uuid REFERENCES support.messages (id) ON DELETE CASCADE,
  article_id  uuid REFERENCES knowledge.articles (id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating IN (-1, 1)),
  reason_code text CHECK (reason_code IN ('incorrect', 'unclear', 'not_my_model', 'did_not_work', 'helpful', 'other')),
  comment     text CHECK (char_length(comment) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (session_id IS NOT NULL OR article_id IS NOT NULL)
);

CREATE SEQUENCE support.case_reference_seq;

CREATE TABLE support.cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         text NOT NULL UNIQUE DEFAULT ('BBC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('support.case_reference_seq')::text, 6, '0')),
  session_id        uuid REFERENCES support.sessions (id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'open', 'waiting_customer', 'resolved', 'closed')),
  priority          text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category_id       uuid REFERENCES catalog.categories (id) ON DELETE SET NULL,
  model_id          uuid REFERENCES catalog.product_models (id) ON DELETE SET NULL,
  subject           text NOT NULL CHECK (char_length(subject) <= 200),
  description       text CHECK (char_length(description) <= 4000),
  locale            text NOT NULL CHECK (locale IN ('en', 'ms')),
  contact_name_enc  text,
  contact_email_enc text,
  contact_phone_enc text,
  preferred_channel text CHECK (preferred_channel IN ('email', 'whatsapp', 'phone')),
  assigned_to       uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  contact_purged_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz
);
CREATE INDEX cases_status_idx ON support.cases (status, created_at DESC);
CREATE INDEX cases_assignee_idx ON support.cases (assigned_to);
CREATE TRIGGER cases_touch BEFORE UPDATE ON support.cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE support.case_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES support.cases (id) ON DELETE CASCADE,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('created', 'status_changed', 'note', 'assigned', 'priority_changed', 'contact_purged')),
  data          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX case_events_case_idx ON support.case_events (case_id, at);

CREATE TABLE support.unresolved_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint       text NOT NULL UNIQUE,
  query_normalized  text NOT NULL,
  locale            text NOT NULL CHECK (locale IN ('en', 'ms')),
  category_id       uuid REFERENCES catalog.categories (id) ON DELETE SET NULL,
  model_id          uuid REFERENCES catalog.product_models (id) ON DELETE SET NULL,
  last_source       text NOT NULL CHECK (last_source IN ('no_results', 'abstain', 'escalation', 'negative_feedback')),
  occurrences       integer NOT NULL DEFAULT 1,
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  linked_article_id uuid REFERENCES knowledge.articles (id) ON DELETE SET NULL
);
CREATE INDEX unresolved_status_idx ON support.unresolved_questions (status, occurrences DESC);

CREATE TABLE commerce.recommendations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES commerce.products (id) ON DELETE CASCADE,
  listing_id         uuid NOT NULL REFERENCES commerce.product_listings (id) ON DELETE CASCADE,
  context            text NOT NULL CHECK (context IN ('chat', 'article', 'product', 'search')),
  support_session_id uuid REFERENCES support.sessions (id) ON DELETE SET NULL,
  position           integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  clicked_at         timestamptz
);
CREATE INDEX recommendations_created_idx ON commerce.recommendations (created_at);

-- =========================================================================
-- analytics
-- =========================================================================
CREATE TABLE analytics.consent_records (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id text NOT NULL,
  version    text NOT NULL,
  analytics  boolean NOT NULL,
  replay     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_records_consent_idx ON analytics.consent_records (consent_id, created_at DESC);

CREATE TABLE analytics.events (
  id              uuid NOT NULL,
  name            text NOT NULL,
  occurred_at     timestamptz NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  session_id      text NOT NULL,
  visitor_id      text,
  consent         text NOT NULL CHECK (consent IN ('essential', 'analytics')),
  page_path       text,
  page_type       text,
  referrer_domain text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  locale          text,
  device_category text,
  browser_family  text,
  os_family       text,
  country         text,
  region          text,
  props           jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);

-- Default partition catches anything outside created monthly ranges.
CREATE TABLE analytics.events_default PARTITION OF analytics.events DEFAULT;

CREATE OR REPLACE FUNCTION analytics.ensure_partitions(months_ahead integer DEFAULT 2) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  m date := date_trunc('month', now())::date;
  i integer;
  part text;
BEGIN
  FOR i IN 0..months_ahead LOOP
    part := 'events_' || to_char(m + (i || ' month')::interval, 'YYYYMM');
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'analytics' AND c.relname = part) THEN
      EXECUTE format('CREATE TABLE analytics.%I PARTITION OF analytics.events FOR VALUES FROM (%L) TO (%L)',
        part, m + (i || ' month')::interval, m + ((i + 1) || ' month')::interval);
    END IF;
  END LOOP;
END $$;
SELECT analytics.ensure_partitions(2);

CREATE INDEX events_name_time_idx ON analytics.events (name, received_at);
CREATE INDEX events_session_idx ON analytics.events (session_id);

-- Generic daily aggregate: (day, metric, dim1, dim2) -> value. Dimensions use '' for "none".
CREATE TABLE analytics.agg_daily (
  day    date NOT NULL,
  metric text NOT NULL,
  dim1   text NOT NULL DEFAULT '',
  dim2   text NOT NULL DEFAULT '',
  value  bigint NOT NULL,
  PRIMARY KEY (day, metric, dim1, dim2)
);
CREATE INDEX agg_daily_metric_idx ON analytics.agg_daily (metric, day);

CREATE TABLE analytics.security_events (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  kind     text NOT NULL,
  ip_trunc text,
  detail   jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX security_events_at_idx ON analytics.security_events (at);

-- =========================================================================
-- ai
-- =========================================================================
CREATE TABLE ai.flags (
  key        text PRIMARY KEY,
  enabled    boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai.flags (key, enabled) VALUES
  ('ai_answers.en', false),
  ('ai_answers.ms', false),
  ('ai_embeddings', false)
ON CONFLICT DO NOTHING;

CREATE TABLE ai.models (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  purpose       text NOT NULL CHECK (purpose IN ('chat', 'embedding', 'rerank')),
  provider      text NOT NULL,
  digest        text,
  quantization  text,
  license_note  text,
  status        text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'evaluated', 'approved', 'active', 'retired')),
  notes         text,
  approved_by   uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, purpose)
);
CREATE UNIQUE INDEX ai_models_one_active ON ai.models (purpose) WHERE status = 'active';

CREATE TABLE ai.eval_datasets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  version     integer NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE ai.eval_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    uuid NOT NULL REFERENCES ai.eval_datasets (id) ON DELETE CASCADE,
  case_key      text NOT NULL,
  locale        text NOT NULL CHECK (locale IN ('en', 'ms')),
  question      text NOT NULL,
  expectation   jsonb NOT NULL,
  UNIQUE (dataset_id, case_key)
);

CREATE TABLE ai.eval_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id  uuid NOT NULL REFERENCES ai.eval_datasets (id) ON DELETE CASCADE,
  config      jsonb NOT NULL,
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE ai.eval_results (
  run_id     uuid NOT NULL REFERENCES ai.eval_runs (id) ON DELETE CASCADE,
  case_id    uuid NOT NULL REFERENCES ai.eval_cases (id) ON DELETE CASCADE,
  passed     boolean NOT NULL,
  metrics    jsonb NOT NULL DEFAULT '{}'::jsonb,
  output     jsonb,
  PRIMARY KEY (run_id, case_id)
);

-- =========================================================================
-- ops
-- =========================================================================
CREATE TABLE ops.jobs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue        text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_at       timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  dedupe_key   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX jobs_claim_idx ON ops.jobs (queue, run_at) WHERE status = 'queued';
CREATE UNIQUE INDEX jobs_dedupe_idx ON ops.jobs (queue, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');

CREATE UNLOGGED TABLE ops.rate_limits (
  key        text PRIMARY KEY,
  tokens     double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ops.import_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('catalog_csv', 'listings_csv', 'chatgpt_export', 'documents')),
  file_sha256 text NOT NULL,
  status      text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'validated', 'applied', 'failed', 'discarded')),
  counts      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES identity.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, file_sha256)
);

CREATE TABLE ops.import_records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES ops.import_batches (id) ON DELETE CASCADE,
  external_id        text NOT NULL,
  content_sha256     text NOT NULL,
  status             text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'valid', 'invalid', 'duplicate', 'promoted', 'discarded')),
  duplicate_of       uuid REFERENCES ops.import_records (id) ON DELETE SET NULL,
  data               jsonb NOT NULL,
  validation_errors  jsonb NOT NULL DEFAULT '[]'::jsonb,
  promoted_source_id uuid REFERENCES knowledge.sources (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, external_id)
);
CREATE INDEX import_records_hash_idx ON ops.import_records (content_sha256);
