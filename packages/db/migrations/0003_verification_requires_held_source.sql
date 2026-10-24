-- A model-specific flow may be marked verified, or published, only when at least one linked
-- source is approved, reviewed, and its content is held by BBCare (an uploaded document or
-- stored text such as a BBTech hands-on test record). A URL alone is not enough: if nobody could
-- open the manual, a verification flag must not claim it was checked.

CREATE OR REPLACE FUNCTION knowledge.flow_has_held_source(p_flow uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM knowledge.flow_sources fs JOIN knowledge.sources s ON s.id = fs.source_id
    WHERE fs.flow_id = p_flow AND s.status = 'approved' AND s.trust_level IN ('reviewed', 'authoritative')
      AND (s.media_asset_id IS NOT NULL OR char_length(coalesce(s.extracted_text, '')) >= 20))
$$;

CREATE OR REPLACE FUNCTION knowledge.flows_publish_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.model_id IS NOT NULL AND NEW.verification_status = 'verified'
     AND (TG_OP = 'INSERT' OR OLD.verification_status IS DISTINCT FROM 'verified')
     AND NOT knowledge.flow_has_held_source(NEW.id) THEN
    RAISE EXCEPTION 'flow % needs an approved, reviewed source whose document is held in BBCare before verification', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'published' AND NEW.model_id IS NOT NULL THEN
    IF NOT knowledge.flow_has_held_source(NEW.id) THEN
      RAISE EXCEPTION 'flow % needs an approved, reviewed source whose document is held in BBCare before publishing', NEW.id USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM knowledge.flow_steps st WHERE st.flow_id = NEW.id
      AND (st.prompt_ms LIKE '[PERLU TERJEMAHAN]%' OR st.expected_ms LIKE '[PERLU TERJEMAHAN]%' OR st.warning_ms LIKE '[PERLU TERJEMAHAN]%')) THEN
      RAISE EXCEPTION 'flow % has Malay text awaiting translation', NEW.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Removing or downgrading a source link must not leave a live flow without a held source.
CREATE OR REPLACE FUNCTION knowledge.flow_sources_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM knowledge.flows f WHERE f.id = OLD.flow_id AND f.status = 'published' AND f.model_id IS NOT NULL)
     AND NOT knowledge.flow_has_held_source(OLD.flow_id) THEN
    RAISE EXCEPTION 'flow % is published: it must keep an approved, held source', OLD.flow_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flow_sources_keep_held AFTER DELETE ON knowledge.flow_sources
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION knowledge.flow_sources_guard();
