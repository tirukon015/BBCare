-- Analytics events carry the explicit link label, the remaining UTM fields and the derived
-- channel (same classification rules as support attribution, applied at ingest). Values come
-- only from the page URL and referrer the browser reported.
ALTER TABLE analytics.events
  ADD COLUMN utm_content text,
  ADD COLUMN utm_term    text,
  ADD COLUMN link_label  text,
  ADD COLUMN channel     text CHECK (channel IN ('website', 'shopee', 'qr_code', 'direct_link', 'other', 'unknown'));
